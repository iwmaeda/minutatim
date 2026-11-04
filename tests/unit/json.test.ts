import { strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson } from '../../src/core/json.ts';

test('canonicalJson sorts keys at every depth and keeps array order', () => {
  strictEqual(
    canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }),
    '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}',
  );
});

test('canonicalJson is the same for the same value built in a different order', () => {
  strictEqual(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});
