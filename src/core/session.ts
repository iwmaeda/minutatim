import type { Approval, ApprovalLedger } from './approval-ledger.ts';
import { canonicalJson } from './json.ts';
import { proposalHash, type Proposal } from './proposal.ts';
import { checkChanges, type FileChange, type Mismatch } from './scope.ts';
import { APPROVAL_STATES, type State } from './state-machine.ts';
import type { VerificationResult } from './verifier.ts';

// Each state keeps only what a later event is checked against.
export type Session =
  | { state: 'PLAN' | 'EXPLAIN' | 'EXPLAIN_RESULT' }
  | { state: (typeof APPROVAL_STATES)[number]; proposal: Proposal }
  | { state: 'APPLY_ATOMIC_CHANGE'; approval: Approval }
  | { state: 'VERIFY'; approval: Approval; mismatches: Mismatch[] };

export type SessionEvent =
  | { type: 'planned' }
  | { type: 'presented'; proposal: Proposal }
  | { type: 'questioned' }
  | { type: 'revised' }
  | { type: 'approved'; approvalId: string }
  | { type: 'applied'; changes: FileChange[] }
  | { type: 'verified'; results: VerificationResult[] }
  | { type: 'reported'; next: Proposal };

export type Refusal =
  | { kind: 'wrong-state'; state: State; event: SessionEvent['type'] }
  | { kind: 'approval-not-active'; status: 'expired' | 'invalidated' | 'unknown' }
  | { kind: 'approval-for-another-proposal' };

export type Step = { ok: true; session: Session } | { ok: false; refusal: Refusal };

export interface StepContext {
  ledger: ApprovalLedger;
  now: Date;
}

// A refused event leaves the session as it was.
export function step(session: Session, event: SessionEvent, { ledger, now }: StepContext): Step {
  const wrongState: Step = {
    ok: false,
    refusal: { kind: 'wrong-state', state: session.state, event: event.type },
  };
  switch (event.type) {
    case 'planned':
      return session.state === 'PLAN' ? moveTo({ state: 'EXPLAIN' }) : wrongState;
    case 'presented':
      if (session.state !== 'EXPLAIN') return wrongState;
      return moveTo({ state: 'AWAIT_APPROVAL', proposal: event.proposal });
    case 'questioned':
      return isAwaiting(session) ? moveTo({ state: 'EXPLAIN' }) : wrongState;
    case 'revised':
      if (session.state !== 'EXPLAIN' && !isAwaiting(session)) return wrongState;
      return moveTo({ state: 'PLAN' });
    case 'approved':
      return isAwaiting(session)
        ? approve(session.proposal, event.approvalId, ledger, now)
        : wrongState;
    case 'applied': {
      if (session.state !== 'APPLY_ATOMIC_CHANGE') return wrongState;
      const { approval } = session;
      // One approval covers one application, even of an identical next proposal.
      ledger.invalidate(approval.approvalId, 'applied');
      return moveTo({
        state: 'VERIFY',
        approval,
        mismatches: checkChanges(approval, event.changes),
      });
    }
    case 'verified':
      if (session.state !== 'VERIFY') return wrongState;
      return moveTo({
        state: verificationPassed(session, event.results) ? 'EXPLAIN_RESULT' : 'PLAN',
      });
    case 'reported':
      if (session.state !== 'EXPLAIN_RESULT') return wrongState;
      return moveTo({ state: 'AWAIT_NEXT_APPROVAL', proposal: event.next });
  }
}

function moveTo(session: Session): Step {
  return { ok: true, session };
}

function isAwaiting(session: Session): session is Extract<Session, { proposal: Proposal }> {
  return (APPROVAL_STATES as readonly State[]).includes(session.state);
}

function approve(proposal: Proposal, approvalId: string, ledger: ApprovalLedger, now: Date): Step {
  const status = ledger.status(approvalId, now);
  if (status.state !== 'active') {
    return { ok: false, refusal: { kind: 'approval-not-active', status: status.state } };
  }
  const { approval } = status;
  // A matching hash is not enough: the approval's own terms are what later checks read.
  if (approval.proposalHash !== proposalHash(proposal) || terms(approval) !== terms(proposal)) {
    return { ok: false, refusal: { kind: 'approval-for-another-proposal' } };
  }
  return moveTo({ state: 'APPLY_ATOMIC_CHANGE', approval });
}

function terms({ effectClass, scope, changeBudget, verification }: Approval | Proposal): string {
  return canonicalJson({ effectClass, scope, changeBudget, verification });
}

// Every required check passed, no reported check failed, and the changes stayed inside the approval.
function verificationPassed(
  { approval, mismatches }: Extract<Session, { state: 'VERIFY' }>,
  results: readonly VerificationResult[],
): boolean {
  return (
    mismatches.length === 0 &&
    results.every(({ passed }) => passed) &&
    approval.verification.every((name) => results.some((result) => result.name === name))
  );
}
