import { createHash } from 'node:crypto';
import { anchorId, modelPath } from './render.mjs';
import { INDEXES } from './index-commits.mjs';

export const SEARCH_EXPORT_FORMAT = 'registry-search-export/v1';

export function publicId(kind, nativeId) {
  return createHash('sha256').update(JSON.stringify(['public', 'modelspec', kind, nativeId])).digest('hex');
}

function addRevision(revisions, repository, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw new Error(`Search export needs a pinned revision for ${repository}`);
  if (revisions[repository] && revisions[repository] !== commit) throw new Error(`Search export has conflicting revisions for ${repository}`);
  revisions[repository] = commit;
}

export function registrySearchExport(data, config, requirePins = false) {
  const fixture = config.mode === 'fixture';
  const revisions = {};
  for (const [key, { repo }] of Object.entries(INDEXES)) {
    const commit = config.indexCommits?.[key];
    if (commit) addRevision(revisions, repo, commit);
    else if (requirePins) throw new Error(`Search export needs the pinned ${repo} index revision`);
  }
  const documents = [];
  for (const model of data.modelspec.models) {
    const repository = new URL(model.repository).pathname.replace(/^\/+|\/+$/g, '');
    addRevision(revisions, repository, model.commit);
    const nativeModel = model.address.replace(/\?ref=[0-9a-f]{40}$/, '');
    const baseUrl = `https://modelspec.org${modelPath(model.id)}`;
    const common = {domain: 'modelspec', visibility: 'public', source_repository: repository, source_commit: model.commit, source_path: model.files.source};
    const add = (kind, nativeId, title, identifier, qualifiedName, url, extra = {}) => {
      documents.push({id: publicId(kind, nativeId), ...common, kind, native_id: nativeId, title, identifier, qualified_name: qualifiedName, canonical_url: url, ...extra});
    };
    add('model', nativeModel, model.title, model.id, model.address, baseUrl, {description: model.description, status: model.status});
    for (const entity of model.entities) {
      const nativeEntity = `${nativeModel}/${entity.name}`;
      const parent = {parent_id: publicId('model', nativeModel), parent_label: model.title};
      add('model_entity', nativeEntity, entity.name, entity.name, `${model.id}.${entity.name}`, `${baseUrl}#${anchorId('entity', entity.name)}`, parent);
      const components = new Map(model.components.map(component => [component.name, component]));
      const fieldParent = {parent_id: publicId('model_entity', nativeEntity), parent_label: entity.name};
      const expandComponent = (name, nativePath, qualifiedPath, ancestors = new Set()) => {
        const component = components.get(name);
        if (!component) throw new Error(`Entity ${model.id}.${entity.name} references unresolved component ${name}`);
        if (ancestors.has(name)) throw new Error(`Entity ${model.id}.${entity.name} has cyclic component reference ${[...ancestors, name].join(' -> ')}`);
        const nextAncestors = new Set([...ancestors, name]);
        for (const field of component.fields) {
          // A declaration anchor is shared by every embedding, but the native identity
          // includes its complete path through the entity so distinct uses remain distinct.
          add('model_field', `${nativeEntity}/${nativePath}/field/${field.name}`, field.name, field.name,
            `${model.id}.${entity.name}.${[...qualifiedPath, field.name].join('.')}`,
            `${baseUrl}#${anchorId('field', component.name, field.name)}`,
            {...fieldParent, declaring_component: component.name});
          if (field.component) expandComponent(field.component,
            `${nativePath}/field/${field.name}/component/${field.component}`,
            [...qualifiedPath, field.name], nextAncestors);
        }
      };
      for (const property of entity.properties) {
        add('model_field', `${nativeEntity}/${property.name}`, property.name, property.name, `${model.id}.${entity.name}.${property.name}`, `${baseUrl}#${anchorId('property', entity.name, property.name)}`, {parent_id: publicId('model_entity', nativeEntity), parent_label: entity.name});
        if (property.component) expandComponent(property.component,
          `property/${property.name}/component/${property.component}`, [property.name]);
      }
      for (const componentName of entity.use) {
        expandComponent(componentName, `use/component/${componentName}`, []);
      }
    }
  }
  documents.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(documents.map(doc => doc.id)).size !== documents.length) throw new Error('Duplicate search document ID');
  return {format: SEARCH_EXPORT_FORMAT, domain: 'modelspec', source_revisions: Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b))), fixture, documents};
}
