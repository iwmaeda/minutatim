import { strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { matchesGlob } from '../../src/core/glob.ts';

function check(pattern: string, cases: Record<string, boolean>): void {
  for (const [value, expected] of Object.entries(cases)) {
    strictEqual(matchesGlob(value, pattern), expected, `${value} against ${pattern}`);
  }
}

test('** spans directories, * and ? stay within one', () => {
  check('docs/**', { 'docs/a.md': true, 'docs/a/b.md': true, docs: false, 'src/a.md': false });
  check('docs/*', { 'docs/a.md': true, 'docs/a/b.md': false });
  check('src/**/x.ts', { 'src/x.ts': true, 'src/a/b/x.ts': true, 'src/a/y.ts': false });
  check('?.md', { 'a.md': true, 'ab.md': false, '/.md': false });
});

test('dot files are not special', () => {
  check('*', { '.env': true, 'a/.env': false });
  check('**/*.yaml', { '.github/workflows/ci.yaml': true, 'a.yaml': true });
});

test('every wildcard spans a newline inside a file name', () => {
  check('secret/**', { 'secret/a\nb/token': true });
  check('**/token', { 'a\nb/token': true });
  check('secret/*', { 'secret/a\nb': true });
  check('a?b', { 'a\nb': true });
});

test('regular expression syntax in a pattern is literal', () => {
  check('a.b+(c)', { 'a.b+(c)': true, 'axb+(c)': false, 'a.bb(c)': false });
  check('[x]', { '[x]': true, x: false });
});
