#!/usr/bin/env node
// The deploy guard. wrangler.jsonc runs it as the build command, so
// `wrangler deploy` (and `npm run deploy`) refuse anything but a production build
// of exactly dist/, the directory the Worker serves:
//
//   - dist/ must exist, be a real directory and carry the marker file and a
//     build-info.json written by a finished build;
//   - build-info.json must say production: all three indexes read from their
//     default https addresses or exactly the pinned URL (an exact commit) of the same
//     repository, the real MeaningGraph and OVDB Directory links,
//     not a fixture, not a local file, written to dist/;
//   - every generated page must say it was built from production;
//   - dist/ must match the manifest of file hashes the build wrote last: a file added,
//     removed or changed after the build is refused;
//   - dist/ must be public/ plus the generated registry/ pages plus schema/ and nothing
//     else (no second build, no staging directory, no stale file): the landing page and
//     every static asset must be byte-identical to public/, and schema/ must hold exactly
//     the repository's schema/*.schema.json, byte-identical.
//
// `wrangler dev` only warns, so a fixture build can be served locally.

import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, DEPLOY_DIR_NAME, ROOT } from '../src/config.mjs';
import { MANIFEST_FILE, manifestProblems } from '../src/build-manifest.mjs';
import { INDEXES, isProductionIndexUrl } from '../src/index-commits.mjs';
import { ASSETSIGNORE_TEXT, BUILD_INFO_FILE, BUILD_INFO_FORMAT, BUILD_MARKER } from '../src/site.mjs';
import { SCHEMA_DIR, schemaFileNames } from '../src/schema-files.mjs';
import { SOURCE_META } from '../src/render.mjs';

async function walk(dir, base = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path, base));
    else files.push(relative(base, path).split(sep).join('/'));
  }
  return files;
}

const same = (a, b) => a.equals(b);

/** The problems that make `<root>/dist` unfit to deploy; an empty list means fit. */
export async function distProblems(root = ROOT) {
  const dist = join(root, DEPLOY_DIR_NAME);
  const problems = [];
  let stat;
  try {
    stat = await lstat(dist);
  } catch {
    return [`${dist} does not exist: run npm run build first`];
  }
  if (!stat.isDirectory()) return [`${dist} is not a plain directory`];

  let info = null;
  try {
    info = JSON.parse(await readFile(join(dist, BUILD_INFO_FILE), 'utf8'));
  } catch {
    problems.push(`${BUILD_INFO_FILE} is missing or unreadable: there is no finished build`);
  }
  if (info) {
    const expect = (ok, message) => { if (!ok) problems.push(message); };
    expect(info.format === BUILD_INFO_FORMAT, `build-info format is not ${BUILD_INFO_FORMAT}`);
    expect(info.production === true && info.mode === 'production', `it is not a production build (mode: ${info.mode})`);
    expect(info.fixture === false && info.fixtureSet === null, 'it was built from fixtures');
    expect(info.outDir === DEPLOY_DIR_NAME, `it was written to ${info.outDir}/, not ${DEPLOY_DIR_NAME}/`);
    // per index: its production `main` URL, or exactly the pinned URL of the same repository, nothing else
    for (const [key, fallback] of [['modelspec', DEFAULTS.modelspecRegistryIndex], ['meaninggraph', DEFAULTS.meaningGraphRegistryIndex], ['ovdbDirectory', DEFAULTS.ovdbDirectoryIndex]]) {
      const source = info.sources?.[key];
      expect(source?.kind === 'url' && isProductionIndexUrl(source.location, fallback, INDEXES[key].repo), `it read the ${key} index from ${source?.location ?? 'nowhere'}, not ${fallback} or its pinned commit URL`);
    }
    expect(info.meaningGraphBaseUrl === DEFAULTS.meaningGraphBaseUrl, `its MeaningGraph links go to ${info.meaningGraphBaseUrl}, not ${DEFAULTS.meaningGraphBaseUrl}`);
    expect(info.ovdbDirectoryBaseUrl === DEFAULTS.ovdbDirectoryBaseUrl, `its OVDB Directory links go to ${info.ovdbDirectoryBaseUrl}, not ${DEFAULTS.ovdbDirectoryBaseUrl}`);
  }

  let files;
  try {
    files = await walk(dist);
  } catch (error) {
    return [...problems, `cannot read ${dist}: ${error.message}`];
  }
  if (!files.includes(BUILD_MARKER)) problems.push(`${BUILD_MARKER} is missing: ${dist} was not created by this build`);

  // dist/ is public/ plus registry/ plus schema/ plus the four files the build writes, and nothing else.
  let publicFiles = [];
  try {
    publicFiles = await walk(join(root, 'public'));
  } catch {
    problems.push('public/ cannot be read');
  }
  const expected = new Set([...publicFiles, BUILD_INFO_FILE, BUILD_MARKER, MANIFEST_FILE, '.assetsignore', 'registry-search.json']);
  const stray = files.filter(file => !expected.has(file) && !file.startsWith('registry/') && !file.startsWith(`${SCHEMA_DIR}/`));
  if (stray.length > 0) problems.push(`it contains files that are not part of the site and would be deployed: ${stray.slice(0, 8).join(', ')}`);
  for (const file of publicFiles) {
    if (!files.includes(file)) {
      problems.push(`${file} of public/ is missing from the build`);
      continue;
    }
    const [built, source] = await Promise.all([readFile(join(dist, file)), readFile(join(root, 'public', file))]);
    if (!same(built, source)) problems.push(`${file} differs from public/${file}: rebuild (the landing page and assets must be exactly public/)`);
  }

  // schema/ is exactly the repository's schema/*.schema.json, byte for byte, and nothing else
  let schemaNames = [];
  try {
    schemaNames = await schemaFileNames(root);
  } catch (error) {
    problems.push(error.message);
  }
  const builtSchemas = files.filter(file => file.startsWith(`${SCHEMA_DIR}/`));
  const wantedSchemas = new Set(schemaNames.map(name => `${SCHEMA_DIR}/${name}`));
  const strayedSchemas = builtSchemas.filter(file => !wantedSchemas.has(file));
  if (strayedSchemas.length > 0) problems.push(`${SCHEMA_DIR}/ holds files that are not schemas of this repository and would be deployed: ${strayedSchemas.slice(0, 8).join(', ')}`);
  for (const file of [...wantedSchemas].sort()) {
    if (!builtSchemas.includes(file)) {
      problems.push(`${file} is missing from the build`);
      continue;
    }
    const [built, source] = await Promise.all([readFile(join(dist, file)), readFile(join(root, file))]);
    if (!same(built, source)) problems.push(`${file} differs from the repository's ${file}: rebuild (the published schemas must be exactly ${SCHEMA_DIR}/*.schema.json)`);
  }

  try {
    if (await readFile(join(dist, '.assetsignore'), 'utf8') !== ASSETSIGNORE_TEXT) problems.push('.assetsignore is not the one the build writes: the marker and the manifest must stay out of the upload, build-info.json must not');
  } catch {
    problems.push('.assetsignore is missing');
  }

  const pages = files.filter(file => file.startsWith('registry/') && file.endsWith('.html'));
  if (!pages.includes('registry/sources/index.html')) problems.push('registry/sources/index.html is missing');
  if (!pages.includes('registry/index.html')) problems.push('registry/index.html is missing');
  if (info && pages.length !== (info.pages ?? 0) - 1) problems.push(`it has ${pages.length} registry pages but build-info says ${(info.pages ?? 0) - 1}`);
  const meta = `<meta name="${SOURCE_META}" content="production">`;
  for (const page of pages) {
    const html = await readFile(join(dist, page), 'utf8');
    if (!html.includes(meta)) problems.push(`${page} was not built from the production indexes`);
  }
  const otherFiles = files.filter(file => file.startsWith('registry/') && !file.endsWith('.html'));
  if (otherFiles.length > 0) problems.push(`registry/ holds files that are not pages: ${otherFiles.slice(0, 5).join(', ')}`);
  // what is uploaded is what the build wrote: the hash of every file, recorded last by the build
  problems.push(...await manifestProblems(dist));
  return problems;
}

async function main() {
  if (process.argv.length > 2) throw new Error('check-build takes no arguments: it checks dist/, the directory wrangler.jsonc serves');
  const problems = await distProblems();
  // `wrangler dev` may serve a non-production build for local testing; anything that publishes may not.
  const publishing = !['dev', 'start'].includes(process.env.WRANGLER_COMMAND ?? 'deploy');
  if (problems.length === 0) {
    console.log(`${DEPLOY_DIR_NAME}/ is a production build.`);
  } else if (!publishing) {
    console.warn(`NOT a production build (local use only): ${problems.join('; ')}`);
  } else {
    console.error(`Refusing to deploy ${DEPLOY_DIR_NAME}/:\n- ${problems.join('\n- ')}\nRun a production build first: npm run build`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
