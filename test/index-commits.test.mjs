import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMIT_RE, INDEXES, commitEnvLines, envWithPins, gitEnvironment, headCommit, isProductionIndexUrl, parseLsRemote, pinnedCommitOf, pinnedIndexUrl, pinsFromEnv, resolveHeads } from '../src/index-commits.mjs';

const KEYS = Object.keys(INDEXES);
const REPOS = Object.fromEntries(KEYS.map(key => [key, INDEXES[key].repo]));
const HEADS = Object.fromEntries(KEYS.map((key, i) => [key, 'abcdef'[i].repeat(40)]));
const [K1, K2] = KEYS;
const A = HEADS[K1];
const B = HEADS[K2];
const noSleep = async () => {};
const answer = commit => `${commit}\trefs/heads/main\n`;
const ALL = Object.fromEntries(KEYS.map(key => [REPOS[key], answer(HEADS[key])]));

// a fake `git`: records the arguments, answers per repository
function fakeGit(commits, { failFirst = {} } = {}) {
  const calls = [];
  const seen = {};
  const run = args => {
    calls.push(args);
    const repo = args[1].replace('https://github.com/', '');
    seen[repo] = (seen[repo] ?? 0) + 1;
    if (seen[repo] <= (failFirst[repo] ?? 0)) throw new Error('fatal: unable to access\nstderr line two');
    const value = commits[repo];
    if (value instanceof Error) throw value;
    return value;
  };
  run.calls = calls;
  return run;
}

test('resolveHeads asks git ls-remote for refs/heads/main of each data repository, over https, and returns the commits', async () => {
  const run = fakeGit(ALL);
  assert.deepEqual(await resolveHeads({ run, sleep: noSleep }), HEADS);
  assert.deepEqual(run.calls, KEYS.map(key => ['ls-remote', `https://github.com/${REPOS[key]}`, 'refs/heads/main']));
});

test('resolveHeads refuses an answer of the wrong shape at once, without retrying', async () => {
  for (const bad of ['', '\n', `${A}\trefs/heads/other\n`, `${A.toUpperCase()}\trefs/heads/main\n`, `${A.slice(1)}\trefs/heads/main\n`, `${A}\trefs/heads/main\n${B}\trefs/heads/main\n`, `${A} refs/heads/main\n`, `${A}\trefs/heads/main extra\n`, '::error::x\n', `${A}\trefs/heads/main\n::error::injected`]) {
    const run = fakeGit({ ...ALL, [REPOS[K1]]: bad });
    await assert.rejects(resolveHeads({ run, sleep: noSleep }), new RegExp(`git ls-remote for ${REPOS[K1].replace('/', '\\/')} printed`), JSON.stringify(bad));
    assert.equal(run.calls.length, 1, 'refused at once');
  }
});

test('resolveHeads retries a failing git, then fails naming the repository with one clean line', async () => {
  const flaky = fakeGit(ALL, { failFirst: { [REPOS[K2]]: 2 } });
  const waits = [];
  assert.equal((await resolveHeads({ run: flaky, sleep: async ms => { waits.push(ms); } }))[K2], B);
  assert.equal(waits.length, 2);
  const down = fakeGit({ ...ALL, [REPOS[K2]]: new Error('fatal: could not read\n::error::boom') });
  await assert.rejects(resolveHeads({ run: down, sleep: noSleep }), error => error.message === `cannot resolve main of ${REPOS[K2]}: fatal: could not read`);
  assert.equal(down.calls.filter(args => args[1].endsWith(REPOS[K2])).length, 3, 'three attempts');
});

test('git runs with a cleaned environment: no token, no user configuration, no prompt', () => {
  const previous = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN };
  Object.assign(process.env, { GH_TOKEN: 'x', GITHUB_TOKEN: 'y', CLOUDFLARE_API_TOKEN: 'z' });
  try {
    const env = gitEnvironment();
    assert.deepEqual(Object.keys(env).sort(), ['GCM_INTERACTIVE', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'HOME', 'LC_ALL', 'PATH']);
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null');
    assert.ok(!Object.values(env).some(value => ['x', 'y', 'z'].includes(value)));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('parseLsRemote accepts exactly one line', () => {
  assert.equal(parseLsRemote(answer(A), 'x/y'), A);
  assert.equal(COMMIT_RE.test(A), true);
});

test('the pinned URL of an index is built from a full commit only, and recognised only in exactly that form', () => {
  const repo = REPOS[K1];
  const url = pinnedIndexUrl(repo, A);
  assert.equal(url, `https://raw.githubusercontent.com/${repo}/${A}/index.json`);
  for (const bad of ['main', 'abc', A.toUpperCase(), `${A}/../x`, '', undefined, null]) assert.throws(() => pinnedIndexUrl(repo, bad), /40 lower-case hex digits/, String(bad));
  assert.equal(pinnedCommitOf(url, repo), A);
  const refused = [
    url.replace(repo.split('/')[0], 'evil'), url.replace(`/${repo.split('/')[1]}/`, '/other/'), url.replace('https:', 'http:'), url.replace('raw.githubusercontent.com', 'raw.githubusercontent.com.evil.test'),
    url.replace(A, 'main'), url.replace(A, A.slice(1)), url.replace(A, `${A}0`), url.replace(A, A.toUpperCase()), `${url}?x=1`, `${url}#x`, `${url}/`, url.replace('index.json', 'other.json'),
    url.replace('https://', 'https://user@'), url.replace('.com/', '.com:8443/'), ` ${url}`, `${url}\n`, `${url}%00`, url.replace('/index.json', '/../index.json'), 'file:///etc/passwd', '/local/path/index.json',
  ];
  for (const form of refused) assert.equal(pinnedCommitOf(form, repo), null, form);
});

test('isProductionIndexUrl accepts the fallback or the pinned URL of the same repository, nothing else', () => {
  for (const key of KEYS) {
    const main = `https://raw.githubusercontent.com/${REPOS[key]}/main/index.json`;
    assert.equal(isProductionIndexUrl(main, main, REPOS[key]), true);
    assert.equal(isProductionIndexUrl(pinnedIndexUrl(REPOS[key], HEADS[key]), main, REPOS[key]), true);
    for (const other of KEYS.filter(candidate => candidate !== key)) assert.equal(isProductionIndexUrl(pinnedIndexUrl(REPOS[other], HEADS[other]), main, REPOS[key]), false, `${key} given the pinned URL of ${other}`);
    for (const bad of [`https://raw.githubusercontent.com/${REPOS[key]}/some-branch/index.json`, `${main}?x=1`, '', undefined, null, 'fixtures/x.json']) assert.equal(isProductionIndexUrl(bad, main, REPOS[key]), false, String(bad));
  }
});

test('pinsFromEnv returns null for none, every index for all, and refuses a part or a bad shape', () => {
  assert.equal(pinsFromEnv({}), null);
  assert.equal(pinsFromEnv({ [INDEXES[K1].commitEnv]: '' }), null);
  const env = Object.fromEntries(KEYS.map(key => [INDEXES[key].commitEnv, HEADS[key]]));
  assert.deepEqual(pinsFromEnv(env), HEADS);
  assert.throws(() => pinsFromEnv({ [INDEXES[K2].commitEnv]: B }), /without the commits of the other indexes/);
  assert.throws(() => pinsFromEnv({ ...env, [INDEXES[K2].commitEnv]: 'main' }), /must be 40 lower-case hex digits/);
  assert.deepEqual(commitEnvLines(HEADS), KEYS.map(key => `${INDEXES[key].commitEnv}=${HEADS[key]}`));
});

test('a build by hand resolves the commits itself; a build that was given pins, URLs or a fixture resolves nothing', async () => {
  let resolved = 0;
  const resolve = async () => { resolved++; return HEADS; };
  const byHand = await envWithPins({ env: { PATH: 'x' }, argv: [], resolve });
  assert.equal(resolved, 1);
  assert.equal(byHand.env[INDEXES[K2].commitEnv], B);
  assert.deepEqual(byHand.heads, HEADS);
  assert.equal(byHand.env.PATH, 'x');
  const given = Object.fromEntries(KEYS.map(key => [INDEXES[key].commitEnv, HEADS[key]]));
  for (const [env, argv] of [[given, []], [{ [INDEXES[K1].urlEnv]: 'https://example.test/x.json' }, []], [{}, ['--use-fixture']]]) {
    const result = await envWithPins({ env, argv, resolve });
    assert.equal(result.heads, null);
    assert.equal(result.env, env);
  }
  assert.equal(resolved, 1, 'nothing else resolved');
  await assert.rejects(envWithPins({ env: {}, argv: [], resolve: async () => { throw new Error('cannot resolve main of x/y: down'); } }), /cannot resolve main/);
});

test('headCommit returns HEAD only when it is a full commit id', () => {
  assert.equal(headCommit('/x', () => `${A}\n`), A);
  assert.equal(headCommit('/x', () => 'HEAD\n'), '');
  assert.equal(headCommit('/x', () => { throw new Error('not a repository'); }), '');
});

test('INDEXES names the three indexes this site reads, with the repositories and variables the build and the deploy plan use', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(INDEXES).map(([key, { repo, urlEnv, commitEnv }]) => [key, [repo, urlEnv, commitEnv]])), {
    modelspec: ['modelspec-org/registry', 'MODELSPEC_REGISTRY_INDEX_URL', 'MODELSPEC_REGISTRY_INDEX_COMMIT'],
    meaninggraph: ['meaninggraph/registry', 'MEANINGGRAPH_REGISTRY_INDEX_URL', 'MEANINGGRAPH_REGISTRY_INDEX_COMMIT'],
    ovdbDirectory: ['openvaultdb/directory', 'OVDB_DIRECTORY_INDEX_URL', 'OVDB_DIRECTORY_INDEX_COMMIT'],
  });
});
