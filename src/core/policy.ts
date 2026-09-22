import type { EffectClass } from './effects.ts';
import type { ChangeBudget } from './approval-ledger.ts';
import type { VerificationName } from './verifier.ts';

export const DECISIONS = ['allow', 'ask', 'deny'] as const;

export type Decision = (typeof DECISIONS)[number];

export const POLICY_MODES = ['strict', 'compatibility'] as const;

export type PolicyMode = (typeof POLICY_MODES)[number];

export interface DecisionEntry {
  decision: Decision;
  log?: boolean;
}

export interface PolicyRuleMatch {
  paths?: string[];
  commands?: string[];
  urls?: string[];
}

export interface PolicyRule {
  effectClass: EffectClass;
  match?: PolicyRuleMatch;
  decision: Decision;
  changeBudget?: ChangeBudget;
  verification?: VerificationName[];
}

export interface Policy {
  $schema?: string;
  schemaVersion: 1;
  mode: PolicyMode;
  // A decision for every effect class, not a partial record.
  defaults: Record<EffectClass, DecisionEntry>;
  rules?: PolicyRule[];
}

export const POLICY_KEYS = [
  '$schema',
  'schemaVersion',
  'mode',
  'defaults',
  'rules',
] as const satisfies readonly (keyof Policy)[];
