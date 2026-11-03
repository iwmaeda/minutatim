import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { issueApproval, type Approval, type ChangeBudget } from '../../src/core/approval-ledger.ts';
import type { Effect, EffectClass, EffectTarget } from '../../src/core/effects.ts';
import { checkChanges, checkEffect, type FileChange } from '../../src/core/scope.ts';

const BUDGET: ChangeBudget = { maxFiles: 2, maxAddedLines: 10, maxDeletedLines: 5 };

function approve(scope: string[], effectClass: EffectClass = 'filesystem-write'): Approval {
  return issueApproval(
    { effectClass, scope, changeBudget: BUDGET, verification: ['unit-test'], explanation: 'test' },
    {
      approvalId: 'a-1',
      issuedAt: new Date('2026-11-03T00:00:00Z'),
      expiresAt: new Date('2026-11-03T00:15:00Z'),
    },
  );
}

function effect(effectClass: EffectClass, ...targets: [EffectTarget, ...EffectTarget[]]): Effect {
  return {
    schemaVersion: 1,
    effectId: 'e-test',
    effectClass,
    host: 'claude-code',
    observedAt: '2026-11-03T00:01:00Z',
    intent: 'test',
    targets,
  };
}

const path = (value: string): EffectTarget => ({ kind: 'path', value });
const command = (value: string): EffectTarget => ({ kind: 'command', value });
const resource = (value: string): EffectTarget => ({ kind: 'resource', value });
const change = (value: string, addedLines: number, deletedLines: number): FileChange => ({
  path: value,
  addedLines,
  deletedLines,
});

const POLICY_FILES = ['src/core/policy.ts', 'tests/unit/policy.test.ts'];

test('an effect of the approved class inside the scope passes', () => {
  const targets = [path('src/core/policy.ts'), path('tests/unit/policy.test.ts')] as const;
  deepStrictEqual(checkEffect(approve(POLICY_FILES), effect('filesystem-write', ...targets)), []);
});

test('a different effect class is a mismatch, even inside the scope', () => {
  deepStrictEqual(
    checkEffect(approve(POLICY_FILES), effect('git-state-change', path('src/core/policy.ts'))),
    [{ kind: 'effect-class', approved: 'filesystem-write', actual: 'git-state-change' }],
  );
});

test('each target outside the scope is reported on its own', () => {
  const targets = [path('src/core/policy.ts'), path('src/core/effects.ts'), path('.env')] as const;
  deepStrictEqual(checkEffect(approve(POLICY_FILES), effect('filesystem-write', ...targets)), [
    { kind: 'out-of-scope', target: path('src/core/effects.ts') },
    { kind: 'out-of-scope', target: path('.env') },
  ]);
});

test('scope entries match the way policy patterns do', () => {
  const cases: [string[], EffectTarget, boolean][] = [
    [['docs/**'], path('docs/a/b.md'), true],
    [['src/core/policy.ts'], path('./src/core/../core/policy.ts'), true],
    [['src/core/policy.ts'], path('/repo/src/core/policy.ts'), false],
    [['src/core/policy.ts'], path('src/core/policy.ts/../../../.env'), false],
    [['npm ci'], command('npm  ci'), true],
    [['npm ci'], command('npm ci && rm -rf /'), false],
    [['mcp://server/tool'], resource('mcp://server/tool'), true],
    [['mcp://server/*'], resource('mcp://server/tool'), false],
  ];
  for (const [scope, target, expected] of cases) {
    const result = checkEffect(
      approve(scope, 'external-mcp-action'),
      effect('external-mcp-action', target),
    );
    strictEqual(result.length === 0, expected, `${target.value} against ${scope.join(', ')}`);
  }
});

test('changes inside the scope and at the exact limits pass', () => {
  const changes = [change('src/core/policy.ts', 6, 5), change('tests/unit/policy.test.ts', 4, 0)];
  deepStrictEqual(checkChanges(approve(POLICY_FILES), changes), []);
});

test('each budget limit is checked on its own', () => {
  const approval = approve(['src/**']);
  deepStrictEqual(checkChanges(approval, [change('src/a.ts', 11, 0)]), [
    { kind: 'over-budget', limit: 'maxAddedLines', allowed: 10, actual: 11 },
  ]);
  deepStrictEqual(checkChanges(approval, [change('src/a.ts', 0, 6)]), [
    { kind: 'over-budget', limit: 'maxDeletedLines', allowed: 5, actual: 6 },
  ]);
  deepStrictEqual(
    checkChanges(
      approval,
      ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((file) => change(file, 0, 0)),
    ),
    [{ kind: 'over-budget', limit: 'maxFiles', allowed: 2, actual: 3 }],
  );
});

test('a file reported twice counts once, and lines add up across reports', () => {
  const changes = [change('src/a.ts', 4, 1), change('./src/a.ts', 4, 1), change('src/b.ts', 4, 1)];
  deepStrictEqual(checkChanges(approve(['src/**']), changes), [
    { kind: 'over-budget', limit: 'maxAddedLines', allowed: 10, actual: 12 },
  ]);
});

test('a changed file outside the scope is reported alongside budget overruns', () => {
  const changes = [change('src/core/policy.ts', 20, 0), change('package.json', 1, 1)];
  deepStrictEqual(checkChanges(approve(POLICY_FILES), changes), [
    { kind: 'out-of-scope', target: path('package.json') },
    { kind: 'over-budget', limit: 'maxAddedLines', allowed: 10, actual: 21 },
  ]);
});
