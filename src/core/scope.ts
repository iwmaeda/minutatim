import { CHANGE_BUDGET_KEYS, type Approval, type ChangeBudget } from './approval-ledger.ts';
import type { Effect, EffectClass, EffectTarget } from './effects.ts';
import { targetMatches, workspacePath } from './targets.ts';

// One changed file, as the adapter measured it after the effect ran.
export interface FileChange {
  path: string;
  addedLines: number;
  deletedLines: number;
}

export type Mismatch =
  | { kind: 'effect-class'; approved: EffectClass; actual: EffectClass }
  | { kind: 'out-of-scope'; target: EffectTarget }
  | { kind: 'over-budget'; limit: keyof ChangeBudget; allowed: number; actual: number };

// Before the effect runs. An empty result means it is the approved class and stays in scope.
export function checkEffect(approval: Approval, effect: Effect): Mismatch[] {
  const mismatches: Mismatch[] = [];
  if (effect.effectClass !== approval.effectClass) {
    mismatches.push({
      kind: 'effect-class',
      approved: approval.effectClass,
      actual: effect.effectClass,
    });
  }
  for (const target of effect.targets) {
    if (!inScope(approval, target)) mismatches.push({ kind: 'out-of-scope', target });
  }
  return mismatches;
}

// After the effect ran. An empty result means every changed file is in scope and within budget.
export function checkChanges(approval: Approval, changes: readonly FileChange[]): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const { path } of changes) {
    const target: EffectTarget = { kind: 'path', value: path };
    if (!inScope(approval, target)) mismatches.push({ kind: 'out-of-scope', target });
  }
  const measured: ChangeBudget = {
    maxFiles: new Set(changes.map(({ path }) => workspacePath(path) ?? path)).size,
    maxAddedLines: changes.reduce((total, change) => total + change.addedLines, 0),
    maxDeletedLines: changes.reduce((total, change) => total + change.deletedLines, 0),
  };
  for (const limit of CHANGE_BUDGET_KEYS) {
    const allowed = approval.changeBudget[limit];
    const actual = measured[limit];
    if (actual > allowed) mismatches.push({ kind: 'over-budget', limit, allowed, actual });
  }
  return mismatches;
}

function inScope(approval: Approval, target: EffectTarget): boolean {
  return approval.scope.some((entry) => targetMatches(target, entry));
}
