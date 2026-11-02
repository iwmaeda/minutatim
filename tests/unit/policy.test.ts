import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  DECISIONS,
  POLICY_KEYS,
  POLICY_MODES,
  evaluate,
  type Policy,
  type PolicyRule,
} from '../../src/core/policy.ts';
import {
  EFFECT_CLASSES,
  type Effect,
  type EffectClass,
  type EffectTarget,
} from '../../src/core/effects.ts';
import { loadSchema, record, sorted, strings } from '../support/schema.ts';

const schema = loadSchema('policy');
const properties = record(schema, 'properties');

test('POLICY_KEYS names exactly the schema properties', () => {
  deepStrictEqual(sorted(POLICY_KEYS), sorted(Object.keys(properties)));
});

test('DECISIONS is the schema enum', () => {
  deepStrictEqual(
    sorted(DECISIONS),
    sorted(strings(record(record(schema, '$defs'), 'decision'), 'enum')),
  );
});

test('POLICY_MODES is the schema enum', () => {
  deepStrictEqual(sorted(POLICY_MODES), sorted(strings(record(properties, 'mode'), 'enum')));
});

test('defaults requires a decision for every effect class', () => {
  const defaults = record(properties, 'defaults');
  deepStrictEqual(sorted(EFFECT_CLASSES), sorted(strings(defaults, 'required')));
  deepStrictEqual(sorted(EFFECT_CLASSES), sorted(Object.keys(record(defaults, 'properties'))));
});

const DEFAULTS: Policy['defaults'] = {
  'read-only': { decision: 'allow', log: false },
  'proposed-change': { decision: 'allow' },
  'filesystem-write': { decision: 'ask' },
  'shell-side-effect': { decision: 'ask' },
  'git-state-change': { decision: 'ask' },
  'network-read': { decision: 'allow', log: true },
  'network-write': { decision: 'ask' },
  'external-mcp-action': { decision: 'ask' },
  'credential-security': { decision: 'ask' },
  unclassified: { decision: 'ask' },
};

function policy(mode: Policy['mode'], rules: PolicyRule[] = []): Policy {
  return { schemaVersion: 1, mode, defaults: DEFAULTS, rules };
}

function effect(effectClass: EffectClass, ...targets: [EffectTarget, ...EffectTarget[]]): Effect {
  return {
    schemaVersion: 1,
    effectId: 'e-test',
    effectClass,
    host: 'claude-code',
    observedAt: '2026-11-02T00:00:00Z',
    intent: 'test',
    targets,
  };
}

const path = (value: string): EffectTarget => ({ kind: 'path', value });
const command = (value: string): EffectTarget => ({ kind: 'command', value });
const url = (value: string): EffectTarget => ({ kind: 'url', value });
const resource = (value: string): EffectTarget => ({ kind: 'resource', value });

const ALLOW_DOCS: PolicyRule = {
  effectClass: 'filesystem-write',
  match: { paths: ['docs/**'] },
  decision: 'allow',
};

test('without rules, every class gets its default', () => {
  for (const effectClass of EFFECT_CLASSES) {
    const result = evaluate(policy('compatibility'), effect(effectClass, path('a.ts')));
    strictEqual(result.decision, DEFAULTS[effectClass].decision, effectClass);
    deepStrictEqual(result.targets[0]?.decidedBy, { by: 'default' }, effectClass);
  }
});

test('strict mode denies unclassified effects, even where a rule allows them', () => {
  const allowAll: PolicyRule = { effectClass: 'unclassified', decision: 'allow' };
  const strict = evaluate(policy('strict', [allowAll]), effect('unclassified', path('a.ts')));
  strictEqual(strict.decision, 'deny');
  deepStrictEqual(strict.targets[0]?.decidedBy, { by: 'strict-mode' });

  const compatible = evaluate(
    policy('compatibility', [allowAll]),
    effect('unclassified', path('a')),
  );
  strictEqual(compatible.decision, 'allow');
});

test('the first matching rule decides, and only within its own class', () => {
  const denyDocs: PolicyRule = { ...ALLOW_DOCS, decision: 'deny' };
  const first = evaluate(
    policy('strict', [denyDocs, ALLOW_DOCS]),
    effect('filesystem-write', path('docs/a.md')),
  );
  strictEqual(first.decision, 'deny');
  deepStrictEqual(first.targets[0]?.decidedBy, { by: 'rule', index: 0 });

  const otherClass = evaluate(
    policy('strict', [ALLOW_DOCS]),
    effect('git-state-change', path('docs/a.md')),
  );
  strictEqual(otherClass.decision, 'ask');
});

test('the strictest target decides the effect, in whichever position it sits', () => {
  const docs = path('docs/a.md');
  const src = path('src/a.ts');
  for (const targets of [
    [docs, src],
    [src, docs],
  ] as const) {
    const result = evaluate(policy('strict', [ALLOW_DOCS]), effect('filesystem-write', ...targets));
    strictEqual(result.decision, 'ask');
    deepStrictEqual(
      result.targets.map(({ target, decision }) => [target.value, decision]),
      targets.map((target) => [target.value, target === docs ? 'allow' : 'ask']),
    );
  }
});

test('paths are normalized before matching, and paths outside the workspace match no rule', () => {
  const allowAll: PolicyRule = { ...ALLOW_DOCS, match: { paths: ['**'] } };
  const cases: Record<string, 'allow' | 'ask'> = {
    './docs/a.md': 'allow',
    'docs//a.md': 'allow',
    'docs/../src/a.ts': 'ask',
  };
  for (const [value, expected] of Object.entries(cases)) {
    strictEqual(
      evaluate(policy('strict', [ALLOW_DOCS]), effect('filesystem-write', path(value))).decision,
      expected,
      value,
    );
  }
  for (const value of ['/etc/passwd', '../outside.ts', '..', 'docs\\..\\..\\outside.ts']) {
    strictEqual(
      evaluate(policy('strict', [allowAll]), effect('filesystem-write', path(value))).decision,
      'ask',
      value,
    );
  }
});

test('commands match exactly, with runs of whitespace compared equal', () => {
  const allowCi: PolicyRule = {
    effectClass: 'shell-side-effect',
    match: { commands: ['npm ci'] },
    decision: 'allow',
  };
  const cases: Record<string, 'allow' | 'ask'> = {
    'npm ci': 'allow',
    '  npm   ci ': 'allow',
    'npm ci && rm -rf /': 'ask',
    'npm cit': 'ask',
  };
  for (const [value, expected] of Object.entries(cases)) {
    strictEqual(
      evaluate(policy('strict', [allowCi]), effect('shell-side-effect', command(value))).decision,
      expected,
      value,
    );
  }
});

test('urls match as globs over the whole URL', () => {
  const allowApi: PolicyRule = {
    effectClass: 'network-write',
    match: { urls: ['https://api.github.com/repos/iwmaeda/minutatim/**'] },
    decision: 'allow',
  };
  const cases: Record<string, 'allow' | 'ask'> = {
    'https://api.github.com/repos/iwmaeda/minutatim/pulls': 'allow',
    'https://api.github.com/repos/iwmaeda/other/pulls': 'ask',
  };
  for (const [value, expected] of Object.entries(cases)) {
    strictEqual(
      evaluate(policy('strict', [allowApi]), effect('network-write', url(value))).decision,
      expected,
      value,
    );
  }
});

test('a rule with a match list never matches a target of another kind', () => {
  const rules: PolicyRule[] = [
    { effectClass: 'external-mcp-action', match: { paths: ['**'] }, decision: 'allow' },
  ];
  strictEqual(
    evaluate(policy('strict', rules), effect('external-mcp-action', resource('mcp://x/y')))
      .decision,
    'ask',
  );
  const noMatch: PolicyRule = { effectClass: 'external-mcp-action', decision: 'allow' };
  strictEqual(
    evaluate(policy('strict', [noMatch]), effect('external-mcp-action', resource('mcp://x/y')))
      .decision,
    'allow',
  );
});

test('log comes from the class default', () => {
  strictEqual(
    evaluate(policy('strict'), effect('network-read', url('https://example.com'))).log,
    true,
  );
  strictEqual(evaluate(policy('strict'), effect('read-only', path('a.ts'))).log, false);
  strictEqual(evaluate(policy('strict'), effect('filesystem-write', path('a.ts'))).log, false);
});
