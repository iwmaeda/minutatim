import { createHash } from 'node:crypto';
import type { ChangeBudget } from './approval-ledger.ts';
import type { EffectClass } from './effects.ts';
import { canonicalJson } from './json.ts';
import type { VerificationName } from './verifier.ts';

// What the human is shown and asked to approve.
export interface Proposal {
  effectClass: EffectClass;
  scope: string[];
  changeBudget: ChangeBudget;
  verification: VerificationName[];
  explanation: string;
}

export function proposalHash(proposal: Proposal): string {
  return `sha256:${createHash('sha256').update(canonicalJson(proposal)).digest('hex')}`;
}
