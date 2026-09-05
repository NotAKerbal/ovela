/** Accept the printed setup link as well as its secret fragment. */
export function enrollmentToken(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return decodeURIComponent(new URL(trimmed).hash.slice(1)).trim();
  } catch {
    return '';
  }
}
