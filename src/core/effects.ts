// The classes policy is keyed on. `unclassified` means the adapter could not classify.
export const EFFECT_CLASSES = [
  'read-only',
  'proposed-change',
  'filesystem-write',
  'shell-side-effect',
  'git-state-change',
  'network-read',
  'network-write',
  'external-mcp-action',
  'credential-security',
  'unclassified',
] as const;

export type EffectClass = (typeof EFFECT_CLASSES)[number];

export const HOSTS = ['claude-code', 'codex', 'copilot'] as const;

export type Host = (typeof HOSTS)[number];

export const TARGET_KINDS = ['path', 'command', 'url', 'resource'] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

export interface EffectTarget {
  kind: TargetKind;
  value: string;
}

export interface Effect {
  $schema?: string;
  schemaVersion: 1;
  effectId: string;
  effectClass: EffectClass;
  host: Host;
  hostEvent?: Record<string, unknown>;
  observedAt: string;
  intent: string;
  targets: [EffectTarget, ...EffectTarget[]];
}

// Effect's keys at runtime, for comparison against the JSON Schema.
export const EFFECT_KEYS = [
  '$schema',
  'schemaVersion',
  'effectId',
  'effectClass',
  'host',
  'hostEvent',
  'observedAt',
  'intent',
  'targets',
] as const satisfies readonly (keyof Effect)[];

export function isEffectClass(value: unknown): value is EffectClass {
  return typeof value === 'string' && (EFFECT_CLASSES as readonly string[]).includes(value);
}
