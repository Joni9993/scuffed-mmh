import { describe, it, expect } from 'vitest';
import { buildJoinUrl, parseJoinParam } from '../../src/meta/sharelink.js';

describe('sharelink', () => {
  it('build', () => {
    expect(buildJoinUrl('https://x.io/gh/?a=1#h', 'abcd')).toBe('https://x.io/gh/?join=ABCD');
    expect(buildJoinUrl('https://x.io/', 'AB1D')).toBeNull();
    expect(buildJoinUrl('https://x.io/', 'ABCDE')).toBeNull();
    expect(buildJoinUrl('https://x.io/', 'ABIO')).toBeNull();
  });
  it('parse', () => {
    expect(parseJoinParam('?join=abcd')).toBe('ABCD');
    expect(parseJoinParam('?x=1&join=WXYZ')).toBe('WXYZ');
    for (const s of ['', '?join=', '?join=ABC', '?join=ABCDE', '?join=A1CD', '?join=ABIO']) expect(parseJoinParam(s)).toBeNull();
  });
});
