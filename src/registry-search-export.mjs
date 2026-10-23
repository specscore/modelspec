import { createHash } from 'node:crypto';
import { anchorId, modelPath } from './render.mjs';
import { INDEXES } from './index-commits.mjs';
import {compatibilityModelView, compatibilityNativeId} from './model-compatibility.mjs';

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
  const seen = new Map();
  for (const model of data.modelspec.models) {
    const repository = new URL(model.repository).pathname.replace(/^\/+|\/+$/g, '');
    addRevision(revisions, repository, model.commit);
    const nativeModel = model.address.replace(/\?ref=[0-9a-f]{40}$/, '');
    const baseUrl = `https://modelspec.org${modelPath(model.id)}`;
    const common = {domain: 'modelspec', visibility: 'public', source_repository: repository, source_commit: model.commit, source_path: model.files.source};
    const add = (kind, nativeId, title, identifier, qualifiedName, url, extra = {}) => {
      const doc = {id: publicId(kind, nativeId), ...common, kind, native_id: nativeId, title, identifier, qualified_name: qualifiedName, canonical_url: url, ...extra};
      const bytes = JSON.stringify(doc);
      if (seen.has(doc.id)) {
        if (seen.get(doc.id) !== bytes) throw new Error('Conflicting duplicate search document ID');
        return;
      }
      seen.set(doc.id, bytes); documents.push(doc);
    };
    add('model', nativeModel, model.title, model.id, model.address, baseUrl, {description: model.description, status: model.status});
    for (const entity of model.entities) {
      const nativeEntity = compatibilityNativeId(nativeModel, [['record', entity.name]], `${nativeModel}/${entity.name}`);
      const parent = {parent_id: publicId('model', nativeModel), parent_label: model.title};
      add('model_entity', nativeEntity, entity.name, entity.name, `${model.id}.${entity.name}`, `${baseUrl}#${anchorId('entity', entity.name)}`, parent);
    }
    for (const item of compatibilityModelView(model).fields) {
      const {record, field, component, tokens, legacySuffix, qualifiedPath} = item;
      const nativeRecord = compatibilityNativeId(nativeModel, [['record', record.name]], `${nativeModel}/${record.name}`);
      const nativeId = compatibilityNativeId(nativeModel, tokens, `${nativeModel}/${record.name}/${legacySuffix}`);
      add('model_field', nativeId, field.name, field.name, `${model.id}.${record.name}.${qualifiedPath.join('.')}`,
        `${baseUrl}#${component ? anchorId('field', component, field.name) : anchorId('property', record.name, field.name)}`,
        {parent_id: publicId('model_entity', nativeRecord), parent_label: record.name, ...(component ? {declaring_component: component} : {})});
    }
  }
  documents.sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(documents.map(doc => doc.id)).size !== documents.length) throw new Error('Duplicate search document ID');
  return {format: SEARCH_EXPORT_FORMAT, domain: 'modelspec', source_revisions: Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b))), fixture, documents};
}
