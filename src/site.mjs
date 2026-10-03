// Assembles the site: dist/ (or another allowed output directory) is a copy of
// public/ plus the generated registry/ pages and a build-info.json. The landing
// page in public/index.html stays the landing page; the build only rewrites the
// MeaningGraph and OVDB Directory addresses in it when other base URLs are
// configured, and adds a banner when the build is not a production build.

import { cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { OUT_NAMES } from './config.mjs';
import { loadIndex, validateDirectoryIndex, validateMeaningGraphIndex, validateModelspecIndex } from './indexes.mjs';
import { assertChinookEverywhere, extractShell, renderLanding, renderRegistryPages } from './render.mjs';

export const BUILD_INFO_FORMAT = 'modelspec-build/1';
export const BUILD_INFO_FILE = 'build-info.json';
/** Written into every output directory the build creates: proof that it may delete it again. */
export const BUILD_MARKER = '.modelspec-build-output';
const MARKER_TEXT = 'Created by the modelspec.org build (scripts/build.mjs). The next build may delete this directory and everything in it.\n';

/** Names in public/ that the build writes itself; a clash would be silently overwritten. */
const RESERVED = ['registry', BUILD_INFO_FILE, BUILD_MARKER, '.assetsignore'];

/**
 * The output directory a build may delete and rewrite, or an error. It must be
 * exactly one of the fixed names directly inside the repository root, a real
 * directory (never a symbolic link), and either absent, empty, or carrying the
 * marker file a previous build wrote. Anything else is never touched.
 */
export async function prepareOutput(root, outName) {
  if (!OUT_NAMES.includes(outName)) {
    throw new Error(`Refusing to use ${JSON.stringify(outName)} as the output directory: it must be one of ${OUT_NAMES.join(', ')}`);
  }
  const out = join(resolve(root), outName);
  if (dirname(out) !== resolve(root)) throw new Error(`Refusing to use ${out}: not directly inside ${root}`);
  let stat;
  try {
    stat = await lstat(out);
  } catch (error) {
    if (error.code === 'ENOENT') return out;
    throw error;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to write the site to ${out}: it exists and is not a plain directory (a symbolic link or a file)`);
  }
  if ((await readdir(out)).length > 0) {
    let marker;
    try {
      marker = await lstat(join(out, BUILD_MARKER));
    } catch {
      marker = undefined;
    }
    if (!marker?.isFile()) {
      throw new Error(`Refusing to delete ${out}: it is not empty and was not created by this build (no ${BUILD_MARKER} file). If it is stale build output, remove it yourself: rm -rf ${relative(root, out)}`);
    }
  }
  await rm(out, { recursive: true, force: true });
  return out;
}

/** Read and validate the three indexes named by the configuration. Any failure throws. */
export async function loadData(config, options = {}) {
  const fixture = config.mode === 'fixture';
  const read = (source, validate) => loadIndex(source, validate, { ...options, fixture });
  const [modelspec, meaninggraph, directory] = await Promise.all([
    read(config.sources.modelspec, validateModelspecIndex),
    read(config.sources.meaninggraph, validateMeaningGraphIndex),
    read(config.sources.directory, validateDirectoryIndex),
  ]);
  return { modelspec, meaninggraph, directory };
}

function describeSource(root, source) {
  if (source.kind === 'url' || source.kind === 'url-custom') return { kind: source.kind, location: source.location };
  const inside = relative(root, source.location);
  return { kind: source.kind, location: inside.startsWith('..') || inside.startsWith(sep) ? source.location.split(sep).pop() : inside.split(sep).join('/') };
}

/** The content of build-info.json: what the build was made from. Read by scripts/check-build.mjs. */
export function buildInfo(config, data, root, pages) {
  return {
    format: BUILD_INFO_FORMAT,
    mode: config.mode,
    production: config.production,
    fixture: config.mode === 'fixture',
    fixtureSet: config.fixtureSet,
    outDir: config.outName,
    sources: {
      modelspec: describeSource(root, config.sources.modelspec),
      meaninggraph: describeSource(root, config.sources.meaninggraph),
      ovdbDirectory: describeSource(root, config.sources.directory),
    },
    meaningGraphBaseUrl: config.meaningGraphBaseUrl,
    ovdbDirectoryBaseUrl: config.ovdbDirectoryBaseUrl,
    checksums: {
      modelspec: data.modelspec.checksum,
      meaninggraph: data.meaninggraph.checksum,
      ovdbDirectory: data.directory.checksum,
    },
    models: data.modelspec.models.map(m => ({ id: m.id, commit: m.commit })),
    pages,
  };
}

/**
 * Build the site.
 *
 * The old output is removed first, so a failed build leaves nothing that could
 * be deployed; build-info.json is written last, so an interrupted build is
 * refused by the deploy guard too.
 *
 * @param {object} options
 * @param {string} options.root repository root (public/ is read from it, the output is written inside it)
 * @param {object} options.config from resolveBuildConfig
 * @param {object} [options.data] already validated indexes (default: read them)
 * @param {object} [options.readOptions] passed to the index reader (fetchImpl, retries, ...)
 */
export async function buildSite({ root, config, data, readOptions = {}, log = () => {} }) {
  const out = await prepareOutput(root, config.outName);
  const publicDir = join(resolve(root), 'public');
  const indexes = data ?? await loadData(config, readOptions);

  const template = await readFile(join(publicDir, 'index.html'), 'utf8');
  for (const name of RESERVED) {
    try {
      await lstat(join(publicDir, name));
    } catch {
      continue;
    }
    throw new Error(`public/${name} clashes with a file the build writes: rename it`);
  }
  assertChinookEverywhere(indexes);
  const shell = extractShell(template);
  const registryPages = renderRegistryPages(indexes, config, shell);
  const landing = renderLanding(template, config);
  const info = buildInfo(config, indexes, root, registryPages.size + 1);

  await mkdir(out, { recursive: true });
  await writeFile(join(out, BUILD_MARKER), MARKER_TEXT);
  // The marker is not a page: keep it out of what wrangler uploads.
  await writeFile(join(out, '.assetsignore'), `${BUILD_MARKER}\n`);
  await cp(publicDir, out, { recursive: true });
  await writeFile(join(out, 'index.html'), landing);
  for (const [path, html] of registryPages) {
    await mkdir(dirname(join(out, path)), { recursive: true });
    await writeFile(join(out, path), html);
  }
  await writeFile(join(out, BUILD_INFO_FILE), `${JSON.stringify(info, null, 2)}\n`);
  log(`Built ${registryPages.size + 1} pages into ${out}`);
  return { outDir: out, pages: registryPages.size + 1, models: indexes.modelspec.models.map(m => m.id), info };
}
