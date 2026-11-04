import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  InMemoryApprovalLedger,
  issueApproval,
  type Approval,
} from '../../src/core/approval-ledger.ts';
import type { Proposal } from '../../src/core/proposal.ts';
import type { FileChange } from '../../src/core/scope.ts';
import { step, type Session, type SessionEvent, type Step } from '../../src/core/session.ts';
import { STATES, TRANSITIONS, type State } from '../../src/core/state-machine.ts';
import type { VerificationName, VerificationResult } from '../../src/core/verifier.ts';
import { sorted } from '../support/schema.ts';

const PROPOSAL: Proposal = {
  effectClass: 'filesystem-write',
  scope: ['src/core/policy.ts'],
  changeBudget: { maxFiles: 1, maxAddedLines: 80, maxDeletedLines: 30 },
  verification: ['typecheck', 'unit-test'],
  explanation: 'Add the policy evaluator.',
};

const NEXT: Proposal = {
  ...PROPOSAL,
  scope: ['tests/unit/policy.test.ts'],
  explanation: 'Test the policy evaluator.',
};

const ISSUED = new Date('2026-11-03T00:00:00Z');
const EXPIRES = new Date('2026-11-03T00:15:00Z');
const NOW = new Date('2026-11-03T00:05:00Z');

const IN_SCOPE: FileChange[] = [{ path: 'src/core/policy.ts', addedLines: 10, deletedLines: 2 }];

const passed = (name: VerificationName): VerificationResult => ({ name, passed: true });
const failed = (name: VerificationName): VerificationResult => ({ name, passed: false });
const PASSING = [passed('typecheck'), passed('unit-test')];

function approval(proposal: Proposal = PROPOSAL, approvalId = 'a-1'): Approval {
  return issueApproval(proposal, { approvalId, issuedAt: ISSUED, expiresAt: EXPIRES });
}

function ledgerWith(...approvals: Approval[]): InMemoryApprovalLedger {
  const ledger = new InMemoryApprovalLedger();
  for (const entry of approvals) ledger.record(entry);
  return ledger;
}

const awaiting: Session = { state: 'AWAIT_APPROVAL', proposal: PROPOSAL };
const approved = (approvalId = 'a-1'): SessionEvent => ({ type: 'approved', approvalId });
const applied = (changes = IN_SCOPE): SessionEvent => ({ type: 'applied', changes });
const verified = (results = PASSING): SessionEvent => ({ type: 'verified', results });

// Applies the events in order and fails on the first refusal.
function run(ledger: InMemoryApprovalLedger, start: Session, ...events: SessionEvent[]): Session {
  let session = start;
  for (const event of events) {
    const result = step(session, event, { ledger, now: NOW });
    if (!result.ok) throw new Error(`${event.type} refused: ${JSON.stringify(result.refusal)}`);
    session = result.session;
  }
  return session;
}

test('a session applies one approved change after another', () => {
  const ledger = ledgerWith(approval(), approval(NEXT, 'a-2'));
  const events: SessionEvent[] = [
    { type: 'planned' },
    { type: 'presented', proposal: PROPOSAL },
    approved('a-1'),
    applied(),
    verified(),
    { type: 'reported', next: NEXT },
    approved('a-2'),
  ];
  const states: State[] = [];
  let session: Session = { state: 'PLAN' };
  for (const event of events) {
    session = run(ledger, session, event);
    states.push(session.state);
  }
  deepStrictEqual(states, [
    'EXPLAIN',
    'AWAIT_APPROVAL',
    'APPLY_ATOMIC_CHANGE',
    'VERIFY',
    'EXPLAIN_RESULT',
    'AWAIT_NEXT_APPROVAL',
    'APPLY_ATOMIC_CHANGE',
  ]);
});

function sessionIn(state: State): Session {
  switch (state) {
    case 'PLAN':
    case 'EXPLAIN':
    case 'EXPLAIN_RESULT':
      return { state };
    case 'AWAIT_APPROVAL':
    case 'AWAIT_NEXT_APPROVAL':
      return { state, proposal: PROPOSAL };
    case 'APPLY_ATOMIC_CHANGE':
    case 'VERIFY':
      return { state, approval: approval(), mismatches: [] };
  }
}

// Every event each state accepts, and where it leads.
const ACCEPTED = [
  'PLAN planned -> EXPLAIN',
  'EXPLAIN presented -> AWAIT_APPROVAL',
  'EXPLAIN revised -> PLAN',
  'AWAIT_APPROVAL questioned -> EXPLAIN',
  'AWAIT_APPROVAL revised -> PLAN',
  'AWAIT_APPROVAL approved -> APPLY_ATOMIC_CHANGE',
  'APPLY_ATOMIC_CHANGE applied -> VERIFY',
  'VERIFY verified -> EXPLAIN_RESULT',
  'VERIFY verified -> PLAN',
  'EXPLAIN_RESULT reported -> AWAIT_NEXT_APPROVAL',
  'AWAIT_NEXT_APPROVAL questioned -> EXPLAIN',
  'AWAIT_NEXT_APPROVAL revised -> PLAN',
  'AWAIT_NEXT_APPROVAL approved -> APPLY_ATOMIC_CHANGE',
];

test('each state accepts only its own events, and together they make the transition table', () => {
  const events: SessionEvent[] = [
    { type: 'planned' },
    { type: 'presented', proposal: PROPOSAL },
    { type: 'questioned' },
    { type: 'revised' },
    approved(),
    applied(),
    verified(),
    verified([]),
    { type: 'reported', next: PROPOSAL },
  ];
  const accepted: string[] = [];
  const edges = new Set<string>();
  for (const from of STATES) {
    for (const event of events) {
      const result = step(sessionIn(from), event, { ledger: ledgerWith(approval()), now: NOW });
      if (result.ok) {
        accepted.push(`${from} ${event.type} -> ${result.session.state}`);
        edges.add(`${from} -> ${result.session.state}`);
      } else {
        deepStrictEqual(result.refusal, { kind: 'wrong-state', state: from, event: event.type });
      }
    }
  }
  deepStrictEqual(sorted(accepted), sorted(ACCEPTED));
  const table = STATES.flatMap((from) => TRANSITIONS[from].map((to) => `${from} -> ${to}`));
  deepStrictEqual(sorted([...edges]), sorted(table));
});

test('an approval is refused unless it is active', () => {
  const invalidated = ledgerWith(approval());
  invalidated.invalidate('a-1', 'revoked');
  const cases: [InMemoryApprovalLedger, Date, string][] = [
    [ledgerWith(), NOW, 'unknown'],
    [ledgerWith(approval()), EXPIRES, 'expired'],
    [invalidated, NOW, 'invalidated'],
  ];
  for (const [ledger, now, status] of cases) {
    deepStrictEqual(step(awaiting, approved(), { ledger, now }), {
      ok: false,
      refusal: { kind: 'approval-not-active', status },
    });
  }
});

const forAnotherProposal: Step = {
  ok: false,
  refusal: { kind: 'approval-for-another-proposal' },
};

test('an approval of an earlier presentation does not cover a re-presented proposal', () => {
  const ledger = ledgerWith(approval());
  const reworded = { ...PROPOSAL, explanation: 'Add the policy evaluator and its tests.' };
  const session = run(
    ledger,
    awaiting,
    { type: 'questioned' },
    { type: 'presented', proposal: reworded },
  );
  deepStrictEqual(step(session, approved(), { ledger, now: NOW }), forAnotherProposal);
});

test('an approval naming the proposal hash but carrying other terms is refused', () => {
  const widened: Approval = { ...approval(), scope: ['src/**'] };
  deepStrictEqual(
    step(awaiting, approved(), { ledger: ledgerWith(widened), now: NOW }),
    forAnotherProposal,
  );
});

test('an approval covers one application, even when the next proposal is identical', () => {
  const ledger = ledgerWith(approval());
  const session = run(ledger, awaiting, approved(), applied(), verified(), {
    type: 'reported',
    next: PROPOSAL,
  });
  deepStrictEqual(step(session, approved(), { ledger, now: NOW }), {
    ok: false,
    refusal: { kind: 'approval-not-active', status: 'invalidated' },
  });
});

test('verification passes only when the changes fit and every required check passed', () => {
  const outside: FileChange[] = [{ path: 'package.json', addedLines: 1, deletedLines: 0 }];
  const cases: [string, FileChange[], VerificationResult[], State][] = [
    ['every required check passed', IN_SCOPE, PASSING, 'EXPLAIN_RESULT'],
    ['an extra check also passed', IN_SCOPE, [...PASSING, passed('lint')], 'EXPLAIN_RESULT'],
    ['a required check failed', IN_SCOPE, [passed('typecheck'), failed('unit-test')], 'PLAN'],
    ['a required check was not run', IN_SCOPE, [passed('typecheck')], 'PLAN'],
    ['an extra check failed', IN_SCOPE, [...PASSING, failed('lint')], 'PLAN'],
    ['a changed file is outside the scope', outside, PASSING, 'PLAN'],
  ];
  for (const [label, changes, results, expected] of cases) {
    const events = [approved(), applied(changes), verified(results)];
    strictEqual(run(ledgerWith(approval()), awaiting, ...events).state, expected, label);
  }
});
