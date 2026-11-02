import { deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { APPROVAL_KEYS, CHANGE_BUDGET_KEYS } from '../../src/core/approval-ledger.ts';
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
