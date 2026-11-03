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
  // The s flag lets `**` span newlines too, which a POSIX file name may contain.
  return new RegExp(`^${source}$`, 's').test(value);
}
