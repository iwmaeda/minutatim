import type { EffectClass } from './effects.ts';
import type { VerificationName } from './verifier.ts';

export interface ChangeBudget {
  maxFiles: number;
  maxAddedLines: number;
  maxDeletedLines: number;
}

export const CHANGE_BUDGET_KEYS = [
  'maxFiles',
  'maxAddedLines',
  'maxDeletedLines',
] as const satisfies readonly (keyof ChangeBudget)[];

export interface Approval {
  $schema?: string;
  schemaVersion: 1;
  approvalId: string;
  proposalHash: string;
  effectClass: EffectClass;
  scope: string[];
  changeBudget: ChangeBudget;
  issuedAt: string;
  expiresAt: string;
  approvedBy: 'human';
  verification: VerificationName[];
}

export const APPROVAL_KEYS = [
  '$schema',
  'schemaVersion',
  'approvalId',
  'proposalHash',
  'effectClass',
  'scope',
  'changeBudget',
  'issuedAt',
  'expiresAt',
  'approvedBy',
  'verification',
] as const satisfies readonly (keyof Approval)[];

// Interface only; the persistence format is not decided yet.
export interface ApprovalLedger {
  record(approval: Approval): void;
  find(approvalId: string): Approval | undefined;
  invalidate(approvalId: string, reason: string): void;
}
