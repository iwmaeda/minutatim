import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  InMemoryApprovalLedger,
  issueApproval,
  type Approval,
} from '../../src/core/approval-ledger.ts';
import type { Effect, EffectClass, EffectTarget } from '../../src/core/effects.ts';
import { gate } from '../../src/core/gate.ts';
import { evaluate, type Policy } from '../../src/core/policy.ts';
import type { Proposal } from '../../src/core/proposal.ts';
import { step, type Session } from '../../src/core/session.ts';
import type { VerificationResult } from '../../src/core/verifier.ts';

const POLICY: Policy = {
  schemaVersion: 1,
  mode: 'strict',
  defaults: {
    'read-only': { decision: 'allow' },
    'proposed-change': { decision: 'allow' },
    'filesystem-write': { decision: 'ask' },
    'shell-side-effect': { decision: 'ask' },
    'git-state-change': { decision: 'ask' },
    'network-read': { decision: 'ask' },
    'network-write': { decision: 'ask' },
    'external-mcp-action': { decision: 'ask' },
    'credential-security': { decision: 'deny' },
    unclassified: { decision: 'deny' },
  },
  rules: [{ effectClass: 'filesystem-write', match: { paths: ['.env'] }, decision: 'deny' }],
};

const PROPOSAL: Proposal = {
  effectClass: 'filesystem-write',
  scope: ['src/core/policy.ts'],
  changeBudget: { maxFiles: 1, maxAddedLines: 80, maxDeletedLines: 30 },
  verification: ['unit-test'],
  explanation: 'Add the policy evaluator.',
};

const ISSUED = new Date('2026-11-03T00:00:00Z');
const EXPIRES = new Date('2026-11-03T00:15:00Z');
const NOW = new Date('2026-11-03T00:05:00Z');

function approval(proposal: Proposal = PROPOSAL): Approval {
  return issueApproval(proposal, { approvalId: 'a-1', issuedAt: ISSUED, expiresAt: EXPIRES });
}

function ledgerWith(entry: Approval): InMemoryApprovalLedger {
  const ledger = new InMemoryApprovalLedger();
  ledger.record(entry);
  return ledger;
}

function applying(entry: Approval = approval()): Session {
  return { state: 'APPLY_ATOMIC_CHANGE', approval: entry, mismatches: [] };
}

function effect(effectClass: EffectClass, ...targets: [EffectTarget, ...EffectTarget[]]): Effect {
  return {
    schemaVersion: 1,
    effectId: 'e-test',
    effectClass,
    host: 'claude-code',
    observedAt: '2026-11-03T00:06:00Z',
    intent: 'test',
    targets,
  };
}

const path = (value: string): EffectTarget => ({ kind: 'path', value });
const write = (value: string): Effect => effect('filesystem-write', path(value));

const NOT_APPLYING: Session[] = [
  { state: 'PLAN' },
  { state: 'AWAIT_APPROVAL', proposal: PROPOSAL },
  { state: 'VERIFY', approval: approval(), mismatches: [] },
];

test('an effect the policy allows runs in any state, inside a scope or not', () => {
  const read = effect('read-only', path('README.md'));
  for (const session of [...NOT_APPLYING, applying()]) {
    const result = gate(POLICY, session, read, { ledger: ledgerWith(approval()), now: NOW });
    strictEqual(result.run, true, session.state);
    strictEqual(result.session, session);
  }
});

test('an effect the policy denies is blocked even when the approval covers it', () => {
  const everything = approval({ ...PROPOSAL, scope: ['**'] });
  const ledger = ledgerWith(everything);
  const result = gate(POLICY, applying(everything), write('.env'), { ledger, now: NOW });
  deepStrictEqual(result, {
    run: false,
    block: { kind: 'denied-by-policy' },
    evaluation: evaluate(POLICY, write('.env')),
    session: applying(everything),
  });
  strictEqual(ledger.status('a-1', NOW).state, 'active');
});

test('an effect the policy asks about is blocked outside APPLY_ATOMIC_CHANGE', () => {
  for (const session of NOT_APPLYING) {
    const result = gate(POLICY, session, write('src/core/policy.ts'), {
      ledger: ledgerWith(approval()),
      now: NOW,
    });
    deepStrictEqual(result.run ? undefined : result.block, {
      kind: 'needs-approval',
      state: session.state,
    });
  }
});

test('an effect the policy asks about runs inside an active approval', () => {
  const result = gate(POLICY, applying(), write('src/core/policy.ts'), {
    ledger: ledgerWith(approval()),
    now: NOW,
  });
  strictEqual(result.run, true);
});

test('an expired approval no longer covers an effect', () => {
  const result = gate(POLICY, applying(), write('src/core/policy.ts'), {
    ledger: ledgerWith(approval()),
    now: EXPIRES,
  });
  deepStrictEqual(result.run ? undefined : result.block, {
    kind: 'approval-not-active',
    status: 'expired',
  });
});

test('an effect outside the approval is blocked, ends the approval and fails verification', () => {
  const ledger = ledgerWith(approval());
  const context = { ledger, now: NOW };
  const outside = gate(POLICY, applying(), write('src/core/effects.ts'), context);
  const mismatch = { kind: 'out-of-scope', target: path('src/core/effects.ts') };
  deepStrictEqual(outside.run ? undefined : outside.block, {
    kind: 'outside-approval',
    mismatches: [mismatch],
  });

  const inside = gate(POLICY, outside.session, write('src/core/policy.ts'), context);
  deepStrictEqual(inside.run ? undefined : inside.block, {
    kind: 'approval-not-active',
    status: 'invalidated',
  });

  const changes = [{ path: 'src/core/policy.ts', addedLines: 1, deletedLines: 0 }];
  const applied = step(outside.session, { type: 'applied', changes }, context);
  if (!applied.ok) throw new Error('applied was refused');
  const results: VerificationResult[] = [{ name: 'unit-test', passed: true }];
  const verified = step(applied.session, { type: 'verified', results }, context);
  deepStrictEqual(verified, { ok: true, session: { state: 'PLAN' } });
});
