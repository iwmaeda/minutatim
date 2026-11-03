import type { Effect, EffectClass, EffectTarget } from './effects.ts';
import type { ChangeBudget } from './approval-ledger.ts';
import { targetMatches } from './targets.ts';
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

export type DecidedBy = { by: 'default' } | { by: 'rule'; index: number } | { by: 'strict-mode' };

export interface TargetDecision {
  target: EffectTarget;
  decision: Decision;
  decidedBy: DecidedBy;
}

export interface Evaluation {
  decision: Decision;
  log: boolean;
  targets: TargetDecision[];
}

const SEVERITY: Readonly<Record<Decision, number>> = { allow: 0, ask: 1, deny: 2 };

// The effect gets the strictest decision among its targets.
export function evaluate(policy: Policy, effect: Effect): Evaluation {
  const targets = effect.targets.map((target) => decide(policy, effect.effectClass, target));
  const decision = targets.reduce<Decision>(
    (strictest, { decision }) => (SEVERITY[decision] > SEVERITY[strictest] ? decision : strictest),
    'allow',
  );
  return { decision, log: policy.defaults[effect.effectClass].log ?? false, targets };
}

function decide(policy: Policy, effectClass: EffectClass, target: EffectTarget): TargetDecision {
  if (policy.mode === 'strict' && effectClass === 'unclassified') {
    return { target, decision: 'deny', decidedBy: { by: 'strict-mode' } };
  }
  const rules = policy.rules ?? [];
  const index = rules.findIndex(
    (rule) => rule.effectClass === effectClass && matches(rule.match, target),
  );
  const rule = rules[index];
  if (rule) return { target, decision: rule.decision, decidedBy: { by: 'rule', index } };
  return { target, decision: policy.defaults[effectClass].decision, decidedBy: { by: 'default' } };
}

// A match list applies only to targets of its own kind; resources have no list.
function matches(match: PolicyRuleMatch | undefined, target: EffectTarget): boolean {
  if (match === undefined) return true;
  const lists = { path: match.paths, command: match.commands, url: match.urls, resource: [] };
  return (lists[target.kind] ?? []).some((pattern) => targetMatches(target, pattern));
}
