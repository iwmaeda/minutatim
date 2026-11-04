import type { EffectClass } from './effects.ts';
import { proposalHash, type Proposal } from './proposal.ts';
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

export interface IssueOptions {
  approvalId: string;
  issuedAt: Date;
  expiresAt: Date;
}

export function issueApproval(proposal: Proposal, options: IssueOptions): Approval {
  const { approvalId, issuedAt, expiresAt } = options;
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new RangeError(`${approvalId} would expire before it is issued`);
  }
  return {
    schemaVersion: 1,
    approvalId,
    proposalHash: proposalHash(proposal),
    effectClass: proposal.effectClass,
    scope: [...proposal.scope],
    changeBudget: { ...proposal.changeBudget },
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    approvedBy: 'human',
    verification: [...proposal.verification],
  };
}

export type ApprovalStatus =
  | { state: 'active'; approval: Approval }
  | { state: 'expired'; approval: Approval }
  | { state: 'invalidated'; approval: Approval; reason: string }
  | { state: 'unknown' };

export interface ApprovalLedger {
  record(approval: Approval): void;
  status(approvalId: string, now: Date): ApprovalStatus;
  invalidate(approvalId: string, reason: string): void;
}

interface Entry {
  approval: Approval;
  invalidatedFor?: string;
}

// In-session only; the persistence format is not decided yet.
export class InMemoryApprovalLedger implements ApprovalLedger {
  readonly #entries = new Map<string, Entry>();

  record(approval: Approval): void {
    if (this.#entries.has(approval.approvalId)) {
      throw new Error(`${approval.approvalId} is already recorded`);
    }
    this.#entries.set(approval.approvalId, { approval: deepFreeze(structuredClone(approval)) });
  }

  status(approvalId: string, now: Date): ApprovalStatus {
    const entry = this.#entries.get(approvalId);
    if (entry === undefined) return { state: 'unknown' };
    const { approval, invalidatedFor } = entry;
    if (invalidatedFor !== undefined) {
      return { state: 'invalidated', approval, reason: invalidatedFor };
    }
    if (now.getTime() >= Date.parse(approval.expiresAt)) return { state: 'expired', approval };
    return { state: 'active', approval };
  }

  // The first reason is kept; an invalidated approval stays invalidated.
  invalidate(approvalId: string, reason: string): void {
    const entry = this.#entries.get(approvalId);
    if (entry === undefined) throw new Error(`${approvalId} is not recorded`);
    entry.invalidatedFor ??= reason;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
