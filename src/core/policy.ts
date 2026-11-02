import { posix } from 'node:path';
import type { Effect, EffectClass, EffectTarget } from './effects.ts';
import type { ChangeBudget } from './approval-ledger.ts';
import { matchesGlob } from './glob.ts';
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

function matches(match: PolicyRuleMatch | undefined, target: EffectTarget): boolean {
  if (match === undefined) return true;
  switch (target.kind) {
    case 'path': {
      const path = workspacePath(target.value);
      return path !== undefined && (match.paths ?? []).some((glob) => matchesGlob(path, glob));
    }
    case 'command': {
      const command = normalizeCommand(target.value);
      return (match.commands ?? []).some((pattern) => normalizeCommand(pattern) === command);
    }
    case 'url':
      return (match.urls ?? []).some((glob) => matchesGlob(target.value, glob));
    case 'resource':
      return false;
  }
}

// Workspace-relative POSIX form, or undefined when the path cannot be placed in the workspace.
function workspacePath(value: string): string | undefined {
  const path = posix.normalize(value);
  const outside =
    path.startsWith('/') || path === '..' || path.startsWith('../') || path.includes('\\');
  return outside ? undefined : path;
}

function normalizeCommand(command: string): string {
  return command.trim().split(/\s+/).join(' ');
}
