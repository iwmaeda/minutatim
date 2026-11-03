import { posix } from 'node:path';
import type { EffectTarget } from './effects.ts';
import { matchesGlob } from './glob.ts';

// Paths and URLs match as globs, commands exactly up to whitespace, resources exactly.
export function targetMatches(target: EffectTarget, pattern: string): boolean {
  switch (target.kind) {
    case 'path': {
      const path = workspacePath(target.value);
      return path !== undefined && matchesGlob(path, pattern);
    }
    case 'command':
      return normalizeCommand(target.value) === normalizeCommand(pattern);
    case 'url':
      return matchesGlob(target.value, pattern);
    case 'resource':
      return target.value === pattern;
  }
}

// Workspace-relative POSIX form, or undefined when the path cannot be placed in the workspace.
export function workspacePath(value: string): string | undefined {
  const path = posix.normalize(value);
  const outside =
    path.startsWith('/') || path === '..' || path.startsWith('../') || path.includes('\\');
  return outside ? undefined : path;
}

function normalizeCommand(command: string): string {
  return command.trim().split(/\s+/).join(' ');
}
