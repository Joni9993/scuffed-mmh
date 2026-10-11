import { describe, it, expect } from 'vitest';
import { normDmgMode, nextDmgMode } from '../../src/core/settings.js';

describe('dmgNumbers setting', () => {
  it('migrates booleans', () => {
    expect(normDmgMode(true)).toBe('all');
    expect(normDmgMode(false)).toBe('off');
    expect(normDmgMode('own')).toBe('own');
    expect(normDmgMode(undefined)).toBe('all');
    expect(normDmgMode('junk')).toBe('all');
  });
  it('cycles all -> own -> off', () => {
    expect(nextDmgMode('all')).toBe('own');
    expect(nextDmgMode('own')).toBe('off');
    expect(nextDmgMode('off')).toBe('all');
    expect(nextDmgMode(true)).toBe('own');
  });
});
