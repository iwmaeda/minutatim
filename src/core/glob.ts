// `**` spans `/`; `*` and `?` stay within one segment; a leading dot is not special.
export function matchesGlob(value: string, pattern: string): boolean {
  const source = pattern.replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (token) => {
    switch (token) {
      case '**/':
        return '(?:.*/)?';
      case '**':
        return '.*';
      case '*':
        return '[^/]*';
      case '?':
        return '[^/]';
      default:
        return `\\${token}`;
    }
  });
  return new RegExp(`^${source}$`).test(value);
}
