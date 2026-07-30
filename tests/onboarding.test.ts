/**
 * Tests for the first-run onboarding state (src/modules/onboarding.ts):
 * the welcome screen must show exactly once, then never block users again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('welcome screen state', () => {
  it('is unseen for brand-new users', async () => {
    const { hasSeenWelcome } = await import('../src/modules/onboarding.ts');
    expect(hasSeenWelcome()).toBe(false);
  });

  it('stays seen after being dismissed', async () => {
    const { hasSeenWelcome, markWelcomeSeen } = await import('../src/modules/onboarding.ts');
    markWelcomeSeen();
    expect(hasSeenWelcome()).toBe(true);
  });

  it('persists across module reloads (returning visits)', async () => {
    const first = await import('../src/modules/onboarding.ts');
    first.markWelcomeSeen();
    vi.resetModules();
    const second = await import('../src/modules/onboarding.ts');
    expect(second.hasSeenWelcome()).toBe(true);
  });
});
