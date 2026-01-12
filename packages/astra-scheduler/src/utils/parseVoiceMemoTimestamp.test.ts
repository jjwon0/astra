import { describe, it, expect } from 'vitest';
import { parseVoiceMemoTimestamp } from './parseVoiceMemoTimestamp';

describe('parseVoiceMemoTimestamp', () => {
  it('should parse standard Voice Memo filename', () => {
    const result = parseVoiceMemoTimestamp('20260111 135431-096B2196.m4a');

    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(0); // January is 0
    expect(result!.getDate()).toBe(11);
    expect(result!.getHours()).toBe(13);
    expect(result!.getMinutes()).toBe(54);
    expect(result!.getSeconds()).toBe(31);
  });

  it('should parse filename with different UUID', () => {
    const result = parseVoiceMemoTimestamp('20251225 083000-ABCD1234.m4a');

    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(11); // December is 11
    expect(result!.getDate()).toBe(25);
    expect(result!.getHours()).toBe(8);
    expect(result!.getMinutes()).toBe(30);
    expect(result!.getSeconds()).toBe(0);
  });

  it('should return null for non-matching filenames', () => {
    expect(parseVoiceMemoTimestamp('random-file.m4a')).toBeNull();
    expect(parseVoiceMemoTimestamp('recording.m4a')).toBeNull();
    expect(parseVoiceMemoTimestamp('')).toBeNull();
  });

  it('should return null for partial matches', () => {
    // Missing time component
    expect(parseVoiceMemoTimestamp('20260111.m4a')).toBeNull();
    // Wrong format
    expect(parseVoiceMemoTimestamp('2026-01-11 13:54:31.m4a')).toBeNull();
  });

  it('should handle filenames without extension', () => {
    const result = parseVoiceMemoTimestamp('20260111 135431-096B2196');

    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
  });
});
