import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPROVAL_STATES,
  GATED_STATE,
  STATES,
  TRANSITIONS,
  canTransition,
  type State,
} from '../../src/core/state-machine.ts';
import { sorted } from '../support/schema.ts';

function reachableFrom(start: State): Set<State> {
  const seen = new Set<State>(TRANSITIONS[start]);
  // States added to `seen` here are visited by this same loop.
  for (const state of seen) {
    for (const to of TRANSITIONS[state]) seen.add(to);
  }
  return seen;
}

test('APPLY_ATOMIC_CHANGE is reachable only from the approval states', () => {
  const sources = STATES.filter((from) => TRANSITIONS[from].includes(GATED_STATE));
  deepStrictEqual(sorted(sources), sorted(APPROVAL_STATES));
});

test('every state has an entry and every target is a known state', () => {
  deepStrictEqual(sorted(Object.keys(TRANSITIONS)), sorted(STATES));
  for (const from of STATES) {
    for (const to of TRANSITIONS[from]) ok(STATES.includes(to), `${from} -> ${to} is not a state`);
  }
});

test('canTransition agrees with the table for every pair', () => {
  for (const from of STATES) {
    for (const to of STATES) {
      strictEqual(canTransition(from, to), TRANSITIONS[from].includes(to), `${from} -> ${to}`);
    }
  }
});

test('every state can reach the gate', () => {
  for (const from of STATES) {
    ok(reachableFrom(from).has(GATED_STATE), `${from} cannot reach ${GATED_STATE}`);
  }
});
