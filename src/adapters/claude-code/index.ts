import type { HostAdapter } from '../host-adapter.ts';

export const claudeCodeAdapter: HostAdapter = {
  hostId: 'claude-code',
  unenforceable: [
    'subagent and background-agent activity',
    'MCP external mutations',
    'hooks disabled or bypassed in host settings',
  ],
};
