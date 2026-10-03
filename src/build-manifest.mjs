// The manifest of a build: the SHA-256 of every file the build wrote to its output directory, written as the last
// step of the build and checked right before the upload. The deploy then uploads exactly what the build made: a
// file that a later step added, removed or changed (a check that writes into dist/, a stray copy) is refused, not
// published. The manifest itself is kept out of the upload by .assetsignore, like the build marker.

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MANIFEST_FILE = '.modelspec-build-manifest.json';
export const MANIFEST_FORMAT = 'modelspec-build-manifest/1';

/** Every entry below `dir` as sorted relative paths with `/` separators: {files: [...], others: [...]} (others: links and anything that is not a plain file or directory). */
async function walk(dir, prefix = '') {
  const files = [];
  const others = [];
  for (const entry of (await readdir(join(dir, prefix), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const inner = await walk(dir, relative);
      files.push(...inner.files);
      others.push(...inner.others);
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      others.push(relative);
    }
  }
  return { files, others };
}

const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');

/** Hash every file in `dir` (except the manifest) and write the manifest there. A link or special file is refused. */
export async function writeManifest(dir) {
  const { files, others } = await walk(dir);
  if (others.length > 0) throw new Error(`Refusing to write a manifest for ${dir}: ${others.slice(0, 5).join(', ')} is not a plain file`);
  const hashes = {};
  for (const file of files) if (file !== MANIFEST_FILE) hashes[file] = await digest(join(dir, file));
  await writeFile(join(dir, MANIFEST_FILE), `${JSON.stringify({ format: MANIFEST_FORMAT, files: hashes }, null, 2)}\n`);
  return hashes;
}

/** What differs between the manifest of `dir` and its contents now: extra, missing and changed files (an empty list means identical). */
export async function manifestProblems(dir) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf8'));
  } catch (error) {
    return [`${dir} has no readable ${MANIFEST_FILE} (${error.code ?? 'not valid JSON'}): it was not made by this build, run npm run build`];
  }
  const recorded = manifest?.format === MANIFEST_FORMAT && manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files) ? manifest.files : null;
  if (!recorded) return [`${dir}/${MANIFEST_FILE} is not a ${MANIFEST_FORMAT} manifest`];
  const { files, others } = await walk(dir);
  const problems = others.map(path => `${path} is not a plain file`);
  const present = new Set(files.filter(file => file !== MANIFEST_FILE));
  for (const file of [...present].sort()) {
    if (!Object.hasOwn(recorded, file)) problems.push(`${file} is not in the build manifest: a file was added after the build`);
    else if (await digest(join(dir, file)) !== recorded[file]) problems.push(`${file} differs from the build manifest: it was changed after the build`);
  }
  for (const file of Object.keys(recorded).sort()) {
    if (!present.has(file)) problems.push(`${file} is in the build manifest but missing: it was removed after the build`);
  }
  return problems;
}
