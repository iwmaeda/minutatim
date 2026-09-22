export const VERIFICATION_NAMES = [
  'typecheck',
  'unit-test',
  'lint',
  'schema',
  'diff-review',
] as const;

export type VerificationName = (typeof VERIFICATION_NAMES)[number];

export interface VerificationResult {
  name: VerificationName;
  passed: boolean;
  detail?: string;
}

export interface Verifier {
  run(names: readonly VerificationName[]): Promise<readonly VerificationResult[]>;
}
