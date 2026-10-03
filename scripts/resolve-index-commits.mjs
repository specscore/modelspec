// Resolves the current `main` of each data repository the site reads to a commit (scripts/lib/index-commits.mjs)
// and, under GitHub Actions, writes them to GITHUB_ENV for the later steps: the freshness comparison and the build
// read the indexes at exactly these commits.
//
//   node scripts/resolve-index-commits.mjs
//
// Needs no dependencies installed and no token. Exit 1 when a repository cannot be resolved.
import {appendFileSync} from 'node:fs';
import {INDEXES, commitEnvLines, resolveHeads} from '../src/index-commits.mjs';
import {printable} from '../src/freshness.mjs';

try {
  const heads = await resolveHeads();
  const lines = Object.entries(INDEXES).map(([key, {repo}]) => `${repo} at ${heads[key].slice(0, 12)}`);
  const text = `Data repositories resolved to commits: ${lines.join(', ')}.`;
  console.log(text);
  // the commits were checked to be 40 hex digits: nothing else reaches the environment
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${commitEnvLines(heads).join('\n')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
} catch (error) {
  console.error(`::error::${printable(error.message)}`);
  process.exit(1);
}
