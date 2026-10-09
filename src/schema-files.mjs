// The JSON Schemas of the ModelSpec JSON form live in schema/ at the repository root (decision 0010). Every build
// publishes each schema/*.schema.json, byte for byte, at /schema/<same name> (https://modelspec.org/schema/<name>).
// schema/README.md and any other file there is not published. Both the build (src/site.mjs) and the deploy guard
// (scripts/check-build.mjs) take the list from here, so they cannot disagree.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** The directory of schema sources in the repository, and of the published copies in the output. */
export const SCHEMA_DIR = 'schema';
/** What a published schema file is called: <name>.schema.json, directly inside schema/. */
export const SCHEMA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.schema\.json$/;

/** The sorted names of the plain files `<root>/schema/*.schema.json`. Throws if schema/ cannot be read or holds none. */
export async function schemaFileNames(root) {
  const dir = join(root, SCHEMA_DIR);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read ${SCHEMA_DIR}/ (${error.code ?? error.message}): the site publishes its JSON Schemas at /${SCHEMA_DIR}/`);
  }
  const names = entries.filter(entry => entry.isFile() && SCHEMA_FILE.test(entry.name)).map(entry => entry.name).sort();
  if (names.length === 0) throw new Error(`${SCHEMA_DIR}/ holds no *.schema.json file: the site publishes its JSON Schemas at /${SCHEMA_DIR}/`);
  return names;
}
