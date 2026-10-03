import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MANIFEST_FILE, MANIFEST_FORMAT, manifestProblems, writeManifest } from '../src/build-manifest.mjs';

async function tree(files) {
  const dir = await mkdtemp(join(tmpdir(), 'modelspec-manifest-'));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, '..'), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}

test('a manifest lists the SHA-256 of every file below the directory except itself, and a fresh one matches', async () => {
  const dir = await tree({ 'index.html': 'home', 'databases/shop/index.html': 'shop', '.assetsignore': 'x' });
  const hashes = await writeManifest(dir);
  assert.deepEqual(Object.keys(hashes), ['.assetsignore', 'databases/shop/index.html', 'index.html']);
  const manifest = JSON.parse(await readFile(join(dir, MANIFEST_FILE), 'utf8'));
  assert.equal(manifest.format, MANIFEST_FORMAT);
  assert.match(manifest.files['index.html'], /^[0-9a-f]{64}$/);
  assert.deepEqual(await manifestProblems(dir), []);
  // writing it again (the manifest is already there) gives the same result
  assert.deepEqual(await writeManifest(dir), hashes);
  await rm(dir, { recursive: true });
});

test('an extra, a missing and a changed file are each refused, and named', async () => {
  const dir = await tree({ 'index.html': 'home', 'a/b.html': 'b' });
  await writeManifest(dir);
  await writeFile(join(dir, 'extra.txt'), 'x');
  assert.deepEqual(await manifestProblems(dir), ['extra.txt is not in the build manifest: a file was added after the build']);
  await rm(join(dir, 'extra.txt'));
  await writeFile(join(dir, 'a', 'new.html'), 'x');
  assert.match((await manifestProblems(dir))[0], /^a\/new\.html is not in the build manifest/, 'also in a subdirectory');
  await rm(join(dir, 'a', 'new.html'));
  await writeFile(join(dir, 'index.html'), 'home, changed');
  assert.deepEqual(await manifestProblems(dir), ['index.html differs from the build manifest: it was changed after the build']);
  await writeFile(join(dir, 'index.html'), 'home');
  await rm(join(dir, 'a', 'b.html'));
  assert.deepEqual(await manifestProblems(dir), ['a/b.html is in the build manifest but missing: it was removed after the build']);
  await rm(dir, { recursive: true });
});

test('a link or a missing or malformed manifest is refused', async () => {
  const dir = await tree({ 'index.html': 'home' });
  assert.match((await manifestProblems(dir))[0], /has no readable \.modelspec-build-manifest\.json/);
  await writeFile(join(dir, MANIFEST_FILE), '{broken');
  assert.match((await manifestProblems(dir))[0], /has no readable/);
  await writeFile(join(dir, MANIFEST_FILE), JSON.stringify({ format: 'other', files: {} }));
  assert.match((await manifestProblems(dir))[0], /is not a modelspec-build-manifest\/1 manifest/);
  await writeFile(join(dir, MANIFEST_FILE), JSON.stringify({ format: MANIFEST_FORMAT, files: [] }));
  assert.match((await manifestProblems(dir))[0], /is not a/);
  await rm(join(dir, MANIFEST_FILE));
  await symlink(join(dir, 'index.html'), join(dir, 'link.html'));
  await assert.rejects(writeManifest(dir), /link\.html is not a plain file/);
  await writeFile(join(dir, MANIFEST_FILE), JSON.stringify({ format: MANIFEST_FORMAT, files: { 'index.html': 'x' } }));
  assert.ok((await manifestProblems(dir)).some(problem => /link\.html is not a plain file/.test(problem)));
  await rm(dir, { recursive: true });
});
