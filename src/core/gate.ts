import type { Effect } from './effects.ts';
import { evaluate, type Evaluation, type Policy } from './policy.ts';
import { checkEffect, type Mismatch } from './scope.ts';
import type { Session, StepContext } from './session.ts';
import type { State } from './state-machine.ts';

export type Block =
  | { kind: 'denied-by-policy' }
  | { kind: 'needs-approval'; state: State }
  | { kind: 'approval-not-active'; status: 'expired' | 'invalidated' | 'unknown' }
  | { kind: 'outside-approval'; mismatches: Mismatch[] };

export type GateResult = { evaluation: Evaluation; session: Session } & (
  { run: true } | { run: false; block: Block }
);

// Before an effect runs. Only an effect the policy asks about needs the session's approval.
export function gate(
  policy: Policy,
  session: Session,
  effect: Effect,
  { ledger, now }: StepContext,
): GateResult {
  const evaluation = evaluate(policy, effect);
  const blocked = (block: Block, next = session): GateResult => ({
    run: false,
    block,
    evaluation,
    session: next,
  });
  if (evaluation.decision === 'allow') return { run: true, evaluation, session };
  if (evaluation.decision === 'deny') return blocked({ kind: 'denied-by-policy' });
  if (session.state !== 'APPLY_ATOMIC_CHANGE') {
    return blocked({ kind: 'needs-approval', state: session.state });
  }
  const status = ledger.status(session.approval.approvalId, now);
  if (status.state !== 'active') {
    return blocked({ kind: 'approval-not-active', status: status.state });
  }
  const mismatches = checkEffect(session.approval, effect);
  if (mismatches.length === 0) return { run: true, evaluation, session };
  // The approval stops covering anything, and the recorded mismatch fails this change's verification.
  ledger.invalidate(session.approval.approvalId, 'an effect left the approval');
  return blocked(
    { kind: 'outside-approval', mismatches },
    { ...session, mismatches: [...session.mismatches, ...mismatches] },
  );
}
