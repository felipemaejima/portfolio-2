import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveTheme, savedTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) });
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // the OS prefers light
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens dark on a first visit, whatever the OS prefers', () => {
    expect(savedTheme()).toBe('dark');
  });

  it("remembers the visitor's choice on the next visit", () => {
    saveTheme('light');
    expect(savedTheme()).toBe('light');
    saveTheme('dark');
    expect(savedTheme()).toBe('dark');
  });
});
