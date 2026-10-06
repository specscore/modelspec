// Which MeaningGraph graphs and which OVDB Directory databases belong to a model.

import { normaliseModelAddress, repositoryKey } from './indexes.mjs';

/**
 * Graphs whose repository is the model's repository and whose `model_files`
 * include one of the model's files (its HCL source or its JSON AST). Registry
 * order is kept.
 */
export function graphsForModel(model, graphs) {
  const files = new Set([model.files.source, model.files.json].filter(Boolean));
  const repository = repositoryKey(model.repository);
  return graphs.filter(graph => repositoryKey(graph.repository) === repository && graph.modelFiles.some(file => files.has(file)));
}

/**
 * Databases that use the model, in Directory order, each with how it was found:
 *  - `address`: its `model.address` is the model's address, compared without a
 *    `?ref=` pin and without regard to the case of the GitHub owner and repository
 *    (the module name is case-sensitive);
 *  - `repository`: while the database carries no `model.address`, its repository
 *    and `model.path` are the model's repository and source file.
 * A database that names another address never matches by repository and path.
 */
export function databasesForModel(model, databases) {
  const repository = repositoryKey(model.repository);
  const address = normaliseModelAddress(model.address);
  const found = [];
  for (const database of databases) {
    const named = database.model;
    if (!named) continue;
    if (named.address !== undefined) {
      if (normaliseModelAddress(named.address) === address) found.push({ database, via: 'address' });
    } else if (named.path === model.files.source && repositoryKey(database.repository) === repository) {
      found.push({ database, via: 'repository' });
    }
  }
  return found;
}

/** Only explicit canonical Directory model links establish a source discovery relationship. */
export function sourcesForModel(model, sources = []) {
  return sources.filter(source => source.modelId === model.id);
}
