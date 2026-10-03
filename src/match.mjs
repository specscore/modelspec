// Which MeaningGraph graphs and which OVDB Directory databases belong to a model.

import { baseAddress, repositoryKey } from './indexes.mjs';

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
 *  - `address`: its `model.address` (without a `?ref=` pin) is the model's address;
 *  - `repository`: while the database carries no `model.address`, its repository
 *    and `model.path` are the model's repository and source file.
 * A database that names another address never matches by repository and path.
 */
export function databasesForModel(model, databases) {
  const repository = repositoryKey(model.repository);
  const found = [];
  for (const database of databases) {
    const named = database.model;
    if (!named) continue;
    if (named.address !== undefined) {
      if (baseAddress(named.address) === model.address) found.push({ database, via: 'address' });
    } else if (named.path === model.files.source && repositoryKey(database.repository) === repository) {
      found.push({ database, via: 'repository' });
    }
  }
  return found;
}
