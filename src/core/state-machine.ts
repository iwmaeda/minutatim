export const STATES = [
  'PLAN',
  'EXPLAIN',
  'AWAIT_APPROVAL',
  'APPLY_ATOMIC_CHANGE',
  'VERIFY',
  'EXPLAIN_RESULT',
  'AWAIT_NEXT_APPROVAL',
] as const;

export type State = (typeof STATES)[number];

// Allowed transitions between states.
export const TRANSITIONS: Readonly<Record<State, readonly State[]>> = {
  PLAN: ['EXPLAIN'],
  EXPLAIN: ['AWAIT_APPROVAL', 'PLAN'],
  AWAIT_APPROVAL: ['APPLY_ATOMIC_CHANGE', 'EXPLAIN', 'PLAN'],
  APPLY_ATOMIC_CHANGE: ['VERIFY'],
  VERIFY: ['EXPLAIN_RESULT', 'PLAN'],
  EXPLAIN_RESULT: ['AWAIT_NEXT_APPROVAL'],
  AWAIT_NEXT_APPROVAL: ['APPLY_ATOMIC_CHANGE', 'EXPLAIN', 'PLAN'],
};

// The only states APPLY_ATOMIC_CHANGE may be entered from.
export const APPROVAL_STATES = [
  'AWAIT_APPROVAL',
  'AWAIT_NEXT_APPROVAL',
] as const satisfies readonly State[];

export const GATED_STATE = 'APPLY_ATOMIC_CHANGE';

export function canTransition(from: State, to: State): boolean {
  return TRANSITIONS[from].includes(to);
}
