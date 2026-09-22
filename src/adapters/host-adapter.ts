import type { Host } from '../core/effects.ts';

export interface HostAdapter {
  readonly hostId: Host;
  // Host capabilities this adapter cannot enforce.
  readonly unenforceable: readonly string[];
}
