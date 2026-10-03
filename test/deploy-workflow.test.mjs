import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { REPO } from './helpers.mjs';

const REPOSITORY = 'specscore/modelspec';

const workflow = readFileSync(`${REPO}/.github/workflows/deploy.yml`, 'utf8');
const code = workflow.replace(/^[ \t]*#.*$/gm, '').replace(/[ \t]+#.*$/gm, '').replace(/\n{2,}/g, '\n');

/** The text of the step called `name` (from its `- name:` line to the next step). */
function step(name) {
  const start = code.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `step ${name}`);
  const next = code.indexOf('\n      - ', start + 1);
  return code.slice(start, next === -1 ? undefined : next);
}
const at = name => code.indexOf(`- name: ${name}\n`);

test('the deploy workflow runs on pull requests, pushes to main and by hand, and never on a timer', () => {
  assert.match(code, /^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {4}inputs:\n/m);
  assert.ok(!/schedule/i.test(code) && !/cron/i.test(code), 'nothing runs on a timer: a data change arrives as a manual run started by the data repository');
  assert.ok(!/pull_request_target/.test(code));
  assert.deepEqual([...code.matchAll(/^ {2}([a-z_]+):$/gm)].map(match => match[1]).slice(0, 3), ['pull_request', 'push', 'workflow_dispatch']);
});

test('a manual run takes `force` (boolean, off) and `reason` (text), deploys main only, and treats the reason as untrusted text', () => {
  assert.match(code, /force:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false\n/);
  assert.match(code, /reason:\n {8}description: [^\n]+\n {8}type: string\n {8}default: ""\n/);
  const refuse = step('Refuse to deploy from another ref');
  assert.match(refuse, /if: github\.event_name == 'workflow_dispatch' && github\.ref != 'refs\/heads\/main'/);
  assert.match(refuse, /exit 1/);
  assert.ok(at('Refuse to deploy from another ref') < code.indexOf('- uses: actions/checkout'), 'refused before anything else runs');
  // the reason reaches the run only through env, and no run: block interpolates an expression at all
  assert.equal([...code.matchAll(/inputs\.reason/g)].length, 1);
  assert.ok(code.includes('REASON: ${{ inputs.reason }}'));
  assert.ok(!/github\.event\.inputs/.test(code));
  for (const text of code.split('\n      - ')) {
    const run = text.indexOf('run:');
    if (run !== -1) assert.ok(!text.slice(run).includes('${{'), `an expression inside run: of "${text.split('\n')[0]}"`);
  }
  const summary = step('Run summary');
  assert.match(summary, /tr -d '\\000-\\037\\140'/, 'control characters and backticks are dropped');
  assert.match(summary, /Reason: \\"\$\{reason\}\\"/, 'printed quoted');
});

test('the deploy workflow can only read the repository and every action is pinned by full commit SHA', () => {
  assert.match(code, /^permissions:\n {2}contents: read$/m);
  assert.equal([...code.matchAll(/^\s*permissions:/gm)].length, 1, 'no job widens the permissions');
  assert.ok(!/id-token/.test(code));
  assert.match(code, /persist-credentials: false/);
  const uses = [...code.matchAll(/^\s*- uses: (\S+)$/gm)].map(match => match[1]);
  assert.ok(uses.length >= 2);
  for (const use of uses) assert.match(use, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, use);
  assert.ok(!/^\s*uses: (?!\S+@[0-9a-f]{40}$)/m.test(code), 'also for any uses: that is not a step start');
});

test('the job runs only in this repository, one deploy at a time', () => {
  assert.ok(code.includes(`if: github.repository == '${REPOSITORY}'`));
  assert.match(code, /group: \$\{\{ github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.ref\) \|\| 'deploy' \}\}/);
  assert.match(code, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, 'only pull request runs are cancelled');
});

test('the deploy and the smoke check run only for a push to main or a manual run, and only with credentials', () => {
  assert.ok(code.includes("DEPLOY_EVENT: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}"));
  assert.ok(code.includes("HAS_CREDENTIALS: ${{ secrets.CLOUDFLARE_API_TOKEN != '' && vars.CLOUDFLARE_ACCOUNT_ID != '' }}"));
  for (const name of ['Deploy', 'Smoke check (the live site serves this build)']) {
    const text = step(name);
    assert.match(text, /if: env\.BUILD_NEEDED != 'false' && env\.DEPLOY_EVENT == 'true' && env\.HAS_CREDENTIALS == 'true'/, name);
  }
  assert.match(step('Deploy skipped, no credentials'), /if: env\.BUILD_NEEDED != 'false' && env\.DEPLOY_EVENT == 'true' && env\.HAS_CREDENTIALS != 'true'/);
  assert.match(step('Deploy skipped, no credentials'), /::notice::/);
  assert.match(step('Deploy skipped, no credentials'), /GITHUB_STEP_SUMMARY/);
  assert.match(step('Deploy'), /run: npm run deploy$/m);
  assert.match(step('Smoke check (the live site serves this build)'), /run: node scripts\/smoke-live\.mjs$/m);
  // nothing but the deploy step may run wrangler or read the token
  assert.equal([...code.matchAll(/npm run deploy|wrangler deploy/g)].length, 1);
});

test('the token is read in two places only: the comparison that gives HAS_CREDENTIALS, and the deploy step; it is never echoed', () => {
  assert.equal([...code.matchAll(/secrets\.CLOUDFLARE_API_TOKEN/g)].length, 2);
  assert.match(step('Deploy'), /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.equal([...code.matchAll(/secrets\./g)].length, 2, 'no other secret');
  assert.ok(!/echo[^\n]*\$\{?CLOUDFLARE_API_TOKEN/.test(code));
});

test('a manual run decides before anything is installed (unless forced), and without credentials it stops', () => {
  const check = at('Is the live site current?');
  assert.ok(check !== -1 && check < at('Install'), 'the comparison comes before npm ci');
  assert.ok(at('Manual run without credentials') < check);
  assert.match(step('Is the live site current?'), /if: github\.event_name == 'workflow_dispatch' && env\.FORCE != 'true' && env\.HAS_CREDENTIALS == 'true'/);
  assert.match(step('Is the live site current?'), /run: node scripts\/check-fresh\.mjs$/m);
  assert.match(step('Manual run without credentials'), /BUILD_NEEDED=false/);
  // every later step honours BUILD_NEEDED
  for (const text of code.slice(at('Install')).split('\n      - ').slice(1)) {
    assert.match(text, /env\.BUILD_NEEDED != 'false'/, text.split('\n')[0]);
  }
});

test('the production build is the guarded one and runs on every event', () => {
  assert.match(step('Production build'), /^\s+if: env\.BUILD_NEEDED != 'false'\n\s+run: npm run build$/m);
  assert.match(step('Production build guard'), /run: node scripts\/check-build\.mjs$/m);
  assert.ok(!/OVDB_DIRECTORY_INDEX_URL|MODELSPEC_REGISTRY_INDEX_URL|MEANINGGRAPH_REGISTRY_INDEX_URL|--use-fixture/.test(step('Production build')));
  assert.match(code, /BUILD_COMMIT: \$\{\{ github\.sha \}\}/);
});

test('deploy.yml runs every check that site.yml runs, in the same order, so a deploy never skips one', () => {
  const commands = text => [...text.matchAll(/^\s+(?:- )?run: (\S[^\n]*)$/gm)].map(match => match[1]);
  const site = readFileSync(`${REPO}/.github/workflows/site.yml`, 'utf8').replace(/^[ \t]*#.*$/gm, '').replace(/[ \t]+#.*$/gm, '');
  const theirs = commands(site);
  const mine = commands(code);
  assert.ok(theirs.length >= 4, 'site.yml has its checks');
  for (const command of theirs) assert.ok(mine.includes(command), `site.yml runs "${command}", deploy.yml does not`);
  assert.deepEqual(mine.filter(command => theirs.includes(command)), theirs.filter((command, i) => theirs.indexOf(command) === i), 'the same order');
});
