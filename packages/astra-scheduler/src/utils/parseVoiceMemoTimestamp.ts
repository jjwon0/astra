/**
 * Parse the recording timestamp from a Voice Memo filename.
 *
 * Apple Voice Memos uses the format: "YYYYMMDD HHMMSS-UUID.m4a"
 * Example: "20260111 135431-096B2196.m4a" -> January 11, 2026 at 13:54:31
 *
 * @param filename - The voice memo filename (not full path)
 * @returns The parsed Date, or null if the format doesn't match
 */
export function parseVoiceMemoTimestamp(filename: string): Date | null {
  // Match: "20260111 135431-*.m4a" -> YYYYMMDD HHMMSS
  const match = filename.match(/^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, min, sec] = match;
  return new Date(+year, +month - 1, +day, +hour, +min, +sec);
}
