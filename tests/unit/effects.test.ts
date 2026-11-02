import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  EFFECT_CLASSES,
  EFFECT_KEYS,
  HOSTS,
  TARGET_KINDS,
  isEffectClass,
} from '../../src/core/effects.ts';
import { loadSchema, record, sorted, strings } from '../support/schema.ts';

const properties = record(loadSchema('effect'), 'properties');

test('EFFECT_KEYS names exactly the schema properties', () => {
  deepStrictEqual(sorted(EFFECT_KEYS), sorted(Object.keys(properties)));
});

test('EFFECT_CLASSES is the schema enum', () => {
  deepStrictEqual(
    sorted(EFFECT_CLASSES),
    sorted(strings(record(properties, 'effectClass'), 'enum')),
  );
});

test('HOSTS is the schema enum', () => {
  deepStrictEqual(sorted(HOSTS), sorted(strings(record(properties, 'host'), 'enum')));
});

test('TARGET_KINDS is the schema enum', () => {
  const kind = record(record(record(properties, 'targets'), 'items'), 'properties');
  deepStrictEqual(sorted(TARGET_KINDS), sorted(strings(record(kind, 'kind'), 'enum')));
});

test('isEffectClass accepts every class and nothing else', () => {
  for (const value of EFFECT_CLASSES) strictEqual(isEffectClass(value), true);
  for (const value of ['', 'database-write', 'READ-ONLY', 0, null, undefined, {}]) {
    strictEqual(isEffectClass(value), false);
  }
});
