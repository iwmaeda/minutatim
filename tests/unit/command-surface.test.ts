import { deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const PUBLIC_TASKS = ['format', 'lint', 'test', 'validate', 'check', 'audit', 'ci'];

const mise = readFileSync('mise.toml', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yaml', 'utf8');

test('mise.toml defines every public task', () => {
  for (const task of PUBLIC_TASKS) ok(mise.includes(`[tasks.${task}]`), `${task} is missing`);
});

test('the ci task runs check and audit', () => {
  const ci = mise.split('[tasks.ci]')[1]?.split('\n\n')[0] ?? '';
  for (const task of ['check', 'audit']) {
    ok(ci.includes(`{ task = "${task}" }`), `ci does not run ${task}`);
  }
});

test('the workflow runs mise run ci and nothing else', () => {
  const runs = [...workflow.matchAll(/^\s*(?:- )?run: (.+)$/gm)].map((match) => match[1]);
  deepStrictEqual(runs, ['mise run ci']);
});
