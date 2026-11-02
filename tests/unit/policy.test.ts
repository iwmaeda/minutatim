import { deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { DECISIONS, POLICY_KEYS, POLICY_MODES } from '../../src/core/policy.ts';
import { EFFECT_CLASSES } from '../../src/core/effects.ts';
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
