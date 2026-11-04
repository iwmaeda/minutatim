import { posix } from 'node:path';
import type { EffectTarget } from './effects.ts';
import { matchesGlob } from './glob.ts';

// Paths and URLs match as globs. Commands and resources match character for character: any
// normalization of a command can change what the shell runs, such as a newline into a space.
export function targetMatches(target: EffectTarget, pattern: string): boolean {
  switch (target.kind) {
    case 'path': {
      const path = workspacePath(target.value);
      return path !== undefined && matchesGlob(path, pattern);
    }
    case 'url':
      return matchesGlob(target.value, pattern);
    case 'command':
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
