/**
 * Origin guard tests for Google sign-in.
 *
 * This file runs on jsdom's default origin (http://localhost:3000), which is
 * deliberately NOT in the allow-list: that is exactly what a preview deployment
 * or any other host looks like. Google sign-in must refuse to start there
 * instead of sending the user into a redirect Supabase would reject.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  fakeSupabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

async function authModule() {
  return import('../src/modules/auth.ts');
}

describe('Google sign-in origin guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ external: { google: true } }) })),
    );
  });

  it('runs on a host that is not the deployed app', () => {
    expect(window.location.origin).toBe('http://localhost:3000');
  });

  it('returns no redirect target for an untrusted host', async () => {
    const { getOAuthRedirectUrl } = await authModule();

    expect(getOAuthRedirectUrl()).toBeNull();
  });

  it('refuses to start the flow and explains where Google sign-in works', async () => {
    const { signInWithGoogle } = await authModule();

    const result = await signInWithGoogle();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('google-origin');
    expect(result.message).toMatch(/live app/i);
    expect(result.message).not.toMatch(/localhost|supabase|error/i);
    // Never redirect to a host Supabase would reject.
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(hoisted.fakeSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('accepts extra exact origins only when explicitly configured', async () => {
    vi.stubEnv('VITE_AUTH_ALLOWED_ORIGINS', 'http://localhost:3000, https://study.example.org');
    const { isAuthOriginAllowed, getAllowedAuthOrigins } = await authModule();

    expect(isAuthOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isAuthOriginAllowed('https://study.example.org')).toBe(true);
    // Still no wildcard behaviour for anything else.
    expect(isAuthOriginAllowed('https://anything-else.example.org')).toBe(false);
    expect(getAllowedAuthOrigins().every((origin) => !origin.includes('*'))).toBe(true);
    vi.unstubAllEnvs();
  });
});
