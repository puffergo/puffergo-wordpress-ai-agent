import { describe, expect, it } from 'vitest';
import { encodeHttpBody } from './network';

describe('encodeHttpBody', () => {
  it('JSON-stringifies a plain object body', () => {
    expect(encodeHttpBody({ title: 'hi' })).toBe('{"title":"hi"}');
  });

  it('passes binary bytes through untouched instead of JSON-stringifying them', () => {
    const bytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    const out = encodeHttpBody(bytes);
    expect(out).toBe(bytes);
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it('returns undefined for an undefined body (GET requests)', () => {
    expect(encodeHttpBody(undefined)).toBeUndefined();
  });
});
