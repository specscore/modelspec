// A finite declaration/discovery view of the old index, never a full model AST.
import {createHash} from 'node:crypto';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const legacyName = value => typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value);
export const sourceName = value => typeof value === 'string' && !/^\p{White_Space}*$/u.test(value);
export const conceptName = value => sourceName(value) && !value.includes('.');
export const referenceName = value => typeof value === 'string' && value.split('.').length <= 2 && value.split('.').every(part => part.length > 0);
export function compatibilityAnchor(prefix, ...names) {
  return names.every(legacyName) ? [prefix, ...names].join('-') : `${prefix}--${digest(['modelspec-compat-anchor/v1', prefix, ...names])}`;
}
export function compatibilityNativeId(address, tokens, oldId) {
  const unpinned = address.replace(/\?ref=[0-9a-f]{40}$/, '');
  return tokens.every(([, name]) => legacyName(name)) ? oldId
    : `modelspec-compat-member/v1:${digest(['modelspec-compat-member/v1', unpinned, tokens])}`;
}
export const VIEW_LIMITS = Object.freeze({expandedFields: 10000, depth: 64, work: 20000, textUnits: 4 * 1024 * 1024, diagnostics: 100, diagnosticTextUnits: 64 * 1024});

// Only an explicitly recorded alias proves a qualified name is local. The old
// summary cannot resolve other modules or invent exact foreign provenance.
export function localReference(model, names, ref) {
  if (!referenceName(ref)) throw new Error(`Malformed model reference ${JSON.stringify(ref)}`);
  if (names.has(ref)) return ref;
  const parts = ref.split('.');
  if (parts.length === 2 && parts[0] !== model.module) return null;
  const name = parts.length === 2 ? parts[1] : ref;
  if (!names.has(name)) throw new Error(`Model ${model.id} references unresolved local name ${ref}`);
  return name;
}

export function compatibilityModelView(model, options = {}) {
  const limits = {...VIEW_LIMITS};
  for (const [key, value] of Object.entries(options)) {
    if (!(key in limits) || !Number.isSafeInteger(value) || value < 1 || value > limits[key]) throw new Error('Compatibility view limits may only be lowered');
    limits[key] = value;
  }
  const components = new Map(model.components.map(component => [component.name, component]));
  const records = new Set(model.entities.map(record => record.name));
  const diagnostics = [], diagnosticKeys = new Set();
  let omittedDiagnostics = 0, diagnosticTextUnits = 0, work = 0, expanded = 0, textUnits = 0, stopped = false;
  const diagnostic = (code, record, reference) => {
    if (diagnostics.length >= limits.diagnostics) { omittedDiagnostics++; return; }
    const units = code.length + (record?.length ?? 0) + (reference?.length ?? 0);
    if (diagnosticTextUnits + units > limits.diagnosticTextUnits) { omittedDiagnostics++; return; }
    const row = {code, ...(record === undefined ? {} : {record}), ...(reference === undefined ? {} : {reference})};
    const key = JSON.stringify(row);
    if (!diagnosticKeys.has(key)) { diagnosticKeys.add(key); diagnostics.push(row); diagnosticTextUnits += units; }
  };
  // Validate every declaration, even unreachable targets and declarations after
  // expansion cutoff. This linear source walk is independent of the view budget.
  for (const owner of [...model.entities, ...model.components]) {
    for (const ref of owner.use ?? []) {
      if (localReference(model, components, ref) === null) diagnostic('qualified-reference-unavailable', owner.name, ref);
    }
    for (const field of owner.properties ?? owner.fields) {
      for (const [ref, names] of [[field.component, components], [field.references, records]]) {
        if (ref !== undefined && localReference(model, names, ref) === null) diagnostic('qualified-reference-unavailable', owner.name, ref);
      }
    }
  }
  const fields = [];
  for (const record of model.entities) {
    // Direct declarations are O(input), always retained even if a previous
    // record exhausted expansion. Nested values are not physical columns.
    for (const field of record.properties) fields.push({record, field, tokens: [['record', record.name], ['property', field.name]], legacySuffix: field.name, qualifiedPath: [field.name]});
    const expand = (ref, tokens, legacySuffix, qualifiedPath) => {
      if (stopped) return;
      const stack = [{ref, tokens, legacySuffix, qualifiedPath, ancestors: new Set(), depth: 0}];
      while (stack.length) {
        const frame = stack.pop();
        if (++work > limits.work) { stopped = true; diagnostic('expansion-work-limit', record.name); break; }
        const name = localReference(model, components, frame.ref);
        if (name === null) continue;
        if (frame.ancestors.has(name)) { diagnostic('recursive-reference', record.name, frame.ref); continue; }
        if (frame.depth >= limits.depth) { diagnostic('expansion-depth-limit', record.name, frame.ref); continue; }
        const ancestors = new Set([...frame.ancestors, name]);
        const nested = [];
        for (const field of components.get(name).fields) {
          if (++work > limits.work || expanded >= limits.expandedFields) {
            stopped = true; diagnostic(work > limits.work ? 'expansion-work-limit' : 'expanded-field-limit', record.name); break;
          }
          expanded++;
          const tokens = [...frame.tokens, ['field', field.name]];
          const suffix = `${frame.legacySuffix}/field/${field.name}`;
          const path = [...frame.qualifiedPath, field.name];
          textUnits += suffix.length + tokens.reduce((sum, token) => sum + token[0].length + token[1].length, 0) + path.reduce((sum, name) => sum + name.length, 0);
          if (textUnits > limits.textUnits) { stopped = true; diagnostic('expansion-text-limit', record.name); break; }
          fields.push({record, field, component: name, tokens, legacySuffix: suffix, qualifiedPath: path});
          if (field.component) nested.push({ref: field.component, tokens: [...tokens, ['component', field.component]], legacySuffix: `${suffix}/component/${field.component}`, qualifiedPath: path, ancestors, depth: frame.depth + 1});
        }
        if (stopped) break;
        // Reverse push preserves the old depth-first source traversal order.
        for (let i = nested.length - 1; i >= 0; i--) stack.push(nested[i]);
      }
    };
    for (const field of record.properties) if (field.component) {
      expand(field.component, [['record', record.name], ['property', field.name], ['component', field.component]], `property/${field.name}/component/${field.component}`, [field.name]);
    }
    const used = new Set();
    for (const ref of record.use) {
      if (used.has(ref)) { diagnostic('repeated-identical-use', record.name, ref); continue; }
      used.add(ref);
      expand(ref, [['record', record.name], ['use', ref]], `use/component/${ref}`, []);
    }
  }
  return {fields, diagnostics, omittedDiagnostics, limits};
}

export function compatibilityReport(models) {
  return {format: 'modelspec-compatibility-view/v1', models: models.map(model => {
    const view = compatibilityModelView(model);
    return {id: model.id, address: model.address, commit: model.commit, limits: view.limits, diagnostics: view.diagnostics, omitted_diagnostics: view.omittedDiagnostics};
  })};
}
