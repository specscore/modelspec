import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {REPO as root} from './helpers.mjs';

// Pins the shape of .github/workflows/deploy.yml: what triggers it, what can deploy, where the token is, what
// untrusted text can reach. Offline: it only reads the file.
const REPOSITORY = 'specscore/modelspec';
// The steps that are not checks. Every other step must run, unconditionally, on every event that can deploy.
const CONTROL_STEPS = ['Refuse to deploy from another ref', 'Run summary', 'Manual run without credentials', 'Is the live site current?', 'Deploy skipped, no credentials', 'Deploy', 'Smoke check (the live site serves this build)'];
const ALWAYS = "env.BUILD_NEEDED != 'false'";
const DEPLOYING = "env.BUILD_NEEDED != 'false' && env.DEPLOY_EVENT == 'true' && env.HAS_CREDENTIALS == 'true'";

const workflow = readFileSync(`${root}/.github/workflows/deploy.yml`, 'utf8');
const code = workflow.replace(/^[ \t]*#.*$/gm, '').replace(/[ \t]+#.*$/gm, '').replace(/\n{2,}/g, '\n');

/** The steps of the job as {name, uses, run, if, continueOnError, env, with, raw}. */
function parseSteps(text) {
  const start = text.indexOf('\n    steps:\n');
  assert.notEqual(start, -1, 'the job has steps');
  return text.slice(start + '\n    steps:\n'.length).split('\n      - ').map((piece, i) => {
    const lines = (i === 0 ? piece.replace(/^ {6}- /, '') : piece).split('\n');
    const step = {raw: lines.join('\n'), env: '', with: '', run: ''};
    let mode = '';
    for (const [n, line] of lines.entries()) {
      const at = n === 0 ? line : line.slice(8); // the lines after the first are indented by the width of "      - "
      const key = /^([a-z-]+):(?: (.*))?$/.exec(at);
      if (key) {
        mode = key[1];
        if (mode === 'run') step.run = key[2] === '|' ? '' : key[2];
        else if (mode !== 'env' && mode !== 'with') step[mode === 'continue-on-error' ? 'continueOnError' : mode] = key[2];
      } else if (mode === 'run') step.run += `${at.replace(/^ {2}/, '')}\n`;
      else if (mode === 'env' || mode === 'with') step[mode] += `${at}\n`;
    }
    return step;
  });
}
const steps = parseSteps(code);
const named = name => {
  const step = steps.find(candidate => candidate.name === name);
  assert.ok(step, `step ${name}`);
  return step;
};
const index = name => steps.findIndex(step => step.name === name);

test('the deploy workflow runs on pull requests, pushes to main and by hand, and never on a timer', () => {
  assert.match(code, /^on:\n {2}pull_request:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {4}inputs:\n/m);
  assert.ok(!/schedule/i.test(code) && !/cron/i.test(code), 'nothing runs on a timer: a data change arrives as a manual run started by the data repository');
  assert.ok(!/pull_request_target/.test(code));
  assert.deepEqual([...code.matchAll(/^ {2}([a-z_]+):$/gm)].map(match => match[1]).slice(0, 3), ['pull_request', 'push', 'workflow_dispatch']);
});

test('a manual run takes force (boolean, off), reason, index and checksum (text, empty)', () => {
  assert.match(code, /force:\n {8}description: [^\n]+\n {8}type: boolean\n {8}default: false\n/);
  for (const input of ['reason', 'index', 'checksum']) assert.match(code, new RegExp(`${input}:\\n {8}description: [^\\n]+\\n {8}type: string\\n {8}default: ""\\n`), input);
});

test('a manual run deploys main only: the refusal is the first step and fails the run', () => {
  const refuse = named('Refuse to deploy from another ref');
  assert.equal(steps[0], refuse, 'before anything else runs, checkout included');
  assert.equal(refuse.if, "github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/main'");
  assert.match(refuse.run, /exit 1/);
  // force changes neither the refusal nor DEPLOY_EVENT
  assert.ok(code.includes("DEPLOY_EVENT: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}"));
  assert.ok(!/inputs\.force.*(ref|DEPLOY)/.test(code));
});

test('untrusted inputs reach scripts through env only, never a run: block, GITHUB_ENV or GITHUB_OUTPUT', () => {
  assert.deepEqual([...code.matchAll(/\$\{\{ *inputs\.(\w+) *\}\}/g)].map(match => match[1]).sort(), ['checksum', 'force', 'index', 'reason']);
  for (const name of ['FORCE: ${{ inputs.force }}', 'REASON: ${{ inputs.reason }}', 'IN_INDEX: ${{ inputs.index }}', 'IN_CHECKSUM: ${{ inputs.checksum }}']) assert.ok(code.includes(`      ${name}`), name);
  assert.ok(!/github\.event\.inputs/.test(code));
  for (const step of steps) assert.ok(!step.run.includes('${{'), `an expression inside run: of "${step.name ?? step.uses}"`);
  for (const step of steps.filter(candidate => /GITHUB_ENV|GITHUB_OUTPUT/.test(candidate.run))) {
    assert.ok(!/REASON|IN_INDEX|IN_CHECKSUM|inputs/.test(step.run), `"${step.name}" writes untrusted input to the environment`);
  }
  const summary = named('Run summary').run;
  assert.match(summary, /tr -d '\\000-\\037\\177'/, 'control characters (newlines too) are dropped');
  assert.match(summary, /tr ':`' '  '/, 'colons and backticks are dropped, so no :: can start a log command');
  assert.match(summary, /Reason: \\"\$\{reason\}\\"/, 'printed quoted');
  assert.deepEqual(steps.filter(step => /REASON/.test(step.run + step.env)).map(step => step.name), ['Run summary'], 'the reason is used in one place only');
  assert.deepEqual(steps.filter(step => /IN_INDEX|IN_CHECKSUM/.test(step.run + step.env)).map(step => step.name), [], 'the announcement is only read by check-fresh.mjs');
});

test('the deploy workflow can only read the repository and every action is pinned by full commit SHA', () => {
  assert.match(code, /^permissions:\n {2}contents: read$/m);
  assert.equal([...code.matchAll(/^\s*permissions:/gm)].length, 1, 'no job widens the permissions');
  assert.ok(!/id-token/.test(code));
  assert.match(code, /persist-credentials: false/);
  const uses = steps.map(step => step.uses).filter(Boolean);
  assert.ok(uses.length >= 2);
  for (const use of uses) assert.match(use, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, use);
  assert.ok(!/^\s*uses: (?!\S+@[0-9a-f]{40}$)/m.test(code), 'also for any uses: that is not a step start');
});

test('the job runs only in this repository; every run that can deploy shares one group, nothing else can replace it', () => {
  assert.ok(code.includes(`if: github.repository == '${REPOSITORY}'`));
  assert.ok(code.includes("group: ${{ (github.event_name == 'pull_request' || github.ref != 'refs/heads/main') && format('check-{0}', github.ref) || 'deploy' }}"));
  assert.match(code, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, 'only pull request runs are cancelled');
});

test('the Cloudflare token is in the environment of the Deploy step alone, and never echoed', () => {
  assert.equal([...code.matchAll(/secrets\./g)].length, 2, 'the comparison that gives HAS_CREDENTIALS, and the deploy step');
  assert.ok(code.includes("HAS_CREDENTIALS: ${{ secrets.CLOUDFLARE_API_TOKEN != '' && vars.CLOUDFLARE_ACCOUNT_ID != '' }}"));
  assert.deepEqual(steps.filter(step => /CLOUDFLARE_/.test(step.env)).map(step => step.name), ['Deploy']);
  assert.match(named('Deploy').env, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.equal(named('Deploy').run.trim(), 'npm run deploy -- --use-existing-build', 'it uploads the dist/ already built and guarded: no check, no build');
  assert.equal([...code.matchAll(/npm run deploy|wrangler deploy/g)].length, 1, 'only the deploy step runs wrangler');
  assert.ok(!/echo[^\n]*\$\{?CLOUDFLARE_API_TOKEN/.test(code));
  assert.ok(!/GITHUB_TOKEN/.test(code), 'this build calls no GitHub API');
});

test('every check runs on every event that can deploy: none is conditional on the event, none can fail silently, all precede the deploy', () => {
  const checks = steps.filter(step => step.run && !CONTROL_STEPS.includes(step.name));
  assert.ok(checks.length >= 5, 'install, unit tests, build, check, browser tests');
  for (const check of ['Install', 'Unit tests', 'Syntax checks and fixture build', 'Production build', 'Production build guard', 'Install the browser', 'Browser tests (desktop and 375px, against fixture builds served by wrangler dev)']) {
    assert.ok(checks.some(step => step.name === check), `${check} is a check`);
  }
  for (const step of steps.filter(candidate => !CONTROL_STEPS.includes(candidate.name))) {
    assert.ok(step.if === undefined || step.if === ALWAYS, `check "${step.name ?? step.uses}" has the condition ${step.if}`);
    assert.ok(!/github\.event_name|github\.ref|FORCE|inputs/.test(step.if ?? ''), 'no check is conditional on the event, the ref or force');
  }
  for (const step of checks) assert.equal(step.if, ALWAYS, step.name);
  assert.ok(!/continue-on-error/.test(code), 'no step may fail silently');
  const deploy = index('Deploy');
  for (const step of checks) assert.ok(index(step.name) < deploy, `${step.name} runs before the deploy`);
  assert.equal(named('Deploy').if, DEPLOYING);
  assert.equal(named('Smoke check (the live site serves this build)').if, DEPLOYING);
  assert.ok(index('Smoke check (the live site serves this build)') > deploy);
  assert.equal(named('Deploy skipped, no credentials').if, "env.BUILD_NEEDED != 'false' && env.DEPLOY_EVENT == 'true' && env.HAS_CREDENTIALS != 'true'");
  assert.match(named('Deploy skipped, no credentials').run, /::notice::/);
  assert.match(named('Deploy skipped, no credentials').run, /GITHUB_STEP_SUMMARY/);
});

test('a manual run compares before anything is installed (unless forced), and without credentials it stops', () => {
  assert.ok(index('Is the live site current?') < index('Install'), 'the comparison comes before npm ci');
  assert.ok(index('Manual run without credentials') < index('Is the live site current?'));
  assert.equal(named('Is the live site current?').if, "github.event_name == 'workflow_dispatch' && env.BUILD_NEEDED != 'false'");
  assert.equal(named('Is the live site current?').run.trim(), 'node scripts/check-fresh.mjs');
  assert.equal(named('Manual run without credentials').if, "github.event_name == 'workflow_dispatch' && env.FORCE != 'true' && env.HAS_CREDENTIALS != 'true'");
  assert.match(named('Manual run without credentials').run, /BUILD_NEEDED=false/);
});

test('the production build is the guarded one', () => {
  assert.equal(named('Production build').run.trim(), 'npm run build');
  assert.equal(named('Production build guard').run.trim(), 'node scripts/check-build.mjs');
  assert.ok(!/MEANINGGRAPH_REGISTRY_INDEX_URL|OVDB_DIRECTORY_INDEX_URL|MODELSPEC_REGISTRY_INDEX_URL|--use-fixture/.test(named('Production build').raw));
  assert.match(code, /BUILD_COMMIT: \$\{\{ github\.sha \}\}/);
});

// ---- site.yml (tests only) and deploy.yml: a deploy never runs fewer checks ----

const siteCode = readFileSync(`${root}/.github/workflows/site.yml`, 'utf8').replace(/^[ \t]*#.*$/gm, '').replace(/[ \t]+#.*$/gm, '').replace(/\n{2,}/g, '\n');
const siteSteps = parseSteps(siteCode);

test('deploy.yml runs every step of site.yml, in the same order, unconditionally, and before the deploy', () => {
  const siteChecks = siteSteps.filter(step => step.run);
  assert.ok(siteChecks.length >= 4, 'site.yml has its checks');
  let last = -1;
  for (const site of siteChecks) {
    const mine = steps.find(step => step.run.trim() === site.run.trim());
    assert.ok(mine, `site.yml runs "${site.run.trim()}" (${site.name ?? 'unnamed'}), deploy.yml does not`);
    if (site.name) assert.equal(mine.name, site.name, `the step has the same name in both: ${site.name}`);
    assert.equal(mine.if, ALWAYS, `${mine.name} has a condition`);
    assert.equal(mine.continueOnError, undefined, `${mine.name} can fail silently`);
    assert.equal(site.continueOnError, undefined, `${site.name} in site.yml can fail silently`);
    assert.ok(index(mine.name) > last, `${mine.name} is out of order`);
    assert.ok(index(mine.name) < index('Deploy'), `${mine.name} runs after the deploy`);
    last = index(mine.name);
  }
  for (const site of siteSteps.filter(step => step.uses)) assert.ok(steps.some(step => step.uses === site.uses && JSON.stringify(step.with) === JSON.stringify(site.with)), `${site.uses} (with its settings) is used by deploy.yml`);
});
