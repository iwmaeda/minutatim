import {
  deepStrictEqual,
  match,
  notStrictEqual,
  ok,
  strictEqual,
  throws,
} from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPROVAL_KEYS,
  CHANGE_BUDGET_KEYS,
  InMemoryApprovalLedger,
  issueApproval,
} from '../../src/core/approval-ledger.ts';
import { proposalHash, type Proposal } from '../../src/core/proposal.ts';
import { VERIFICATION_NAMES } from '../../src/core/verifier.ts';
import { loadSchema, record, sorted, strings } from '../support/schema.ts';

const schema = loadSchema('approval');
const defs = record(schema, '$defs');

test('APPROVAL_KEYS names exactly the schema properties', () => {
  deepStrictEqual(sorted(APPROVAL_KEYS), sorted(Object.keys(record(schema, 'properties'))));
});

test('every approval property except $schema is required', () => {
  const required = strings(schema, 'required');
  deepStrictEqual(sorted(required), sorted(APPROVAL_KEYS.filter((key) => key !== '$schema')));
});

test('CHANGE_BUDGET_KEYS names exactly the changeBudget properties, all required', () => {
  const budget = record(defs, 'changeBudget');
  deepStrictEqual(sorted(CHANGE_BUDGET_KEYS), sorted(Object.keys(record(budget, 'properties'))));
  deepStrictEqual(sorted(CHANGE_BUDGET_KEYS), sorted(strings(budget, 'required')));
});

test('VERIFICATION_NAMES is the schema enum', () => {
  const items = record(record(defs, 'verification'), 'items');
  deepStrictEqual(sorted(VERIFICATION_NAMES), sorted(strings(items, 'enum')));
});

const PROPOSAL: Proposal = {
  effectClass: 'filesystem-write',
  scope: ['src/core/policy.ts'],
  changeBudget: { maxFiles: 1, maxAddedLines: 80, maxDeletedLines: 30 },
  verification: ['typecheck', 'unit-test'],
  explanation: 'Add the policy evaluator.',
};

const ISSUED = new Date('2026-11-02T00:00:00Z');
const EXPIRES = new Date('2026-11-02T00:15:00Z');

function issue(proposal: Proposal = PROPOSAL) {
  return issueApproval(proposal, { approvalId: 'a-1', issuedAt: ISSUED, expiresAt: EXPIRES });
}

test('proposalHash has the form the schema requires', () => {
  const pattern = record(record(schema, 'properties'), 'proposalHash')['pattern'];
  ok(typeof pattern === 'string');
  match(proposalHash(PROPOSAL), new RegExp(pattern));
});

test('proposalHash ignores key order and changes with every field', () => {
  const { explanation, verification, changeBudget, scope, effectClass } = PROPOSAL;
  const reordered: Proposal = { explanation, verification, changeBudget, scope, effectClass };
  strictEqual(proposalHash(reordered), proposalHash(PROPOSAL));

  const variants: Record<keyof Proposal, Proposal> = {
    effectClass: { ...PROPOSAL, effectClass: 'shell-side-effect' },
    scope: { ...PROPOSAL, scope: ['src/core/effects.ts'] },
    changeBudget: { ...PROPOSAL, changeBudget: { ...changeBudget, maxAddedLines: 81 } },
    verification: { ...PROPOSAL, verification: ['typecheck'] },
    explanation: { ...PROPOSAL, explanation: 'Add the policy evaluator!' },
  };
  for (const [field, variant] of Object.entries(variants)) {
    notStrictEqual(proposalHash(variant), proposalHash(PROPOSAL), field);
  }
});

test('issueApproval binds a human approval to the proposal it copies', () => {
  deepStrictEqual(issue(), {
    schemaVersion: 1,
    approvalId: 'a-1',
    proposalHash: proposalHash(PROPOSAL),
    effectClass: 'filesystem-write',
    scope: ['src/core/policy.ts'],
    changeBudget: { maxFiles: 1, maxAddedLines: 80, maxDeletedLines: 30 },
    issuedAt: '2026-11-02T00:00:00.000Z',
    expiresAt: '2026-11-02T00:15:00.000Z',
    approvedBy: 'human',
    verification: ['typecheck', 'unit-test'],
  });
});

test('issueApproval refuses an approval that expires before it is issued', () => {
  for (const expiresAt of [ISSUED, new Date(ISSUED.getTime() - 1)]) {
    throws(
      () => issueApproval(PROPOSAL, { approvalId: 'a-1', issuedAt: ISSUED, expiresAt }),
      RangeError,
    );
  }
});

test('the issued approval shares nothing with the proposal', () => {
  const proposal = structuredClone(PROPOSAL);
  const approval = issue(proposal);
  proposal.scope.push('src/core/effects.ts');
  proposal.changeBudget.maxFiles = 9;
  proposal.verification.pop();
  deepStrictEqual(approval, issue());
});

test('the ledger reports unknown, active and expired approvals', () => {
  const ledger = new InMemoryApprovalLedger();
  deepStrictEqual(ledger.status('a-1', ISSUED), { state: 'unknown' });
  ledger.record(issue());
  deepStrictEqual(ledger.status('a-1', ISSUED), { state: 'active', approval: issue() });
  strictEqual(ledger.status('a-1', new Date(EXPIRES.getTime() - 1)).state, 'active');
  deepStrictEqual(ledger.status('a-1', EXPIRES), { state: 'expired', approval: issue() });
});

test('invalidation keeps its first reason and outranks expiry', () => {
  const ledger = new InMemoryApprovalLedger();
  ledger.record(issue());
  ledger.invalidate('a-1', 'target mismatch');
  ledger.invalidate('a-1', 'later reason');
  for (const now of [ISSUED, EXPIRES]) {
    deepStrictEqual(ledger.status('a-1', now), {
      state: 'invalidated',
      approval: issue(),
      reason: 'target mismatch',
    });
  }
});

test('the ledger refuses to re-record an approval or invalidate an unknown one', () => {
  const ledger = new InMemoryApprovalLedger();
  ledger.record(issue());
  ledger.invalidate('a-1', 'target mismatch');
  throws(() => ledger.record(issue()), /already recorded/);
  throws(() => ledger.invalidate('a-2', 'no such approval'), /not recorded/);
});

test('a recorded approval cannot be widened afterwards', () => {
  const ledger = new InMemoryApprovalLedger();
  const approval = issue();
  ledger.record(approval);
  approval.scope.push('src/core/effects.ts');

  const status = ledger.status('a-1', ISSUED);
  ok(status.state === 'active');
  deepStrictEqual(status.approval.scope, ['src/core/policy.ts']);
  throws(() => status.approval.scope.push('src/core/effects.ts'), TypeError);
  throws(() => {
    status.approval.changeBudget.maxFiles = 9;
  }, TypeError);
});
