import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';
import {buildSite} from '../src/site.mjs';
import {CUTOVER_REDIRECTS, CUTOVER_PROBES, RECEIPT_FILE, verifyCutover} from '../src/cutover.mjs';
import {distProblems} from '../scripts/check-build.mjs';
import {writeManifest} from '../src/build-manifest.mjs';
import {productionConfig, sampleData, tempRoot, config} from './helpers.mjs';

test('production routes every old public URL away while retaining verifiable deployment provenance', async t => {
  const {root, cleanup} = await tempRoot(); t.after(cleanup);
  await buildSite({root, config: productionConfig(root), data: sampleData()});
  const out = join(root, 'dist');
  assert.equal(await readFile(join(out, '_redirects'), 'utf8'), CUTOVER_REDIRECTS);
  assert.equal(await readFile(join(out, RECEIPT_FILE), 'utf8'), await readFile(join(out, 'build-info.json'), 'utf8'));
  assert.deepEqual(await distProblems(root), []);
  // Even a rehashed altered policy cannot pass the deployment guard.
  await writeFile(join(out, '_redirects'), '/* https://wrong.example/ 301\n');
  await writeManifest(out);
  assert.match((await distProblems(root)).join('\n'), /_redirects differs from the clean-cutover contract/);
});

test('reader fixtures remain available for format regression tests, never deployable', async t => {
  const {root, cleanup} = await tempRoot(); t.after(cleanup);
  await buildSite({root, config: config(['--use-fixture']), data: sampleData()});
  await assert.rejects(readFile(join(root, 'dist-fixture', '_redirects')), {code: 'ENOENT'});
});

test('cutover smoke requires real redirects and rejects an old 200 site or wrong destination', async () => {
  const calls = [];
  const good = async (url, options) => {
    assert.equal(options.redirect, 'manual'); calls.push(url);
    const path = new URL(url).pathname;
    const target = CUTOVER_PROBES.find(([p]) => p === path)[1];
    return new Response(null, {status: 301, headers: {location: target}});
  };
  await verifyCutover('https://modelspec.test', good);
  assert.equal(calls.length, CUTOVER_PROBES.length);
  await assert.rejects(verifyCutover('https://modelspec.test', async () => new Response('old landing')), /received HTTP 200/);
  await assert.rejects(verifyCutover('https://modelspec.test', async () => new Response(null, {status: 301, headers: {location: 'https://wrong.example/'}})), /Clean cutover failed/);
});
