import { readFileSync } from 'node:fs';
import { isRecord } from '../../src/core/json.ts';

export function loadSchema(name: string): Record<string, unknown> {
  const path = `schemas/${name}.schema.json`;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${path} is not an object`);
  return parsed;
}

export function record(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (!isRecord(value)) throw new Error(`${key} is not an object`);
  return value;
}

export function strings(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`${key} holds a non-string`);
    items.push(item);
  }
  return items;
}

export function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}
