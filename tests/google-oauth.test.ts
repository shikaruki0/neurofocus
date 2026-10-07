/**
 * Module-level tests for "Continue with Google" (src/modules/auth.ts).
 *
 * Run on the production origin so the redirect allow-list and the OAuth call
 * can be asserted exactly as they happen on https://neurofocusx.vercel.app.
 *
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://neurofocusx.vercel.app/" }
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  /** Google account: the provider verified the email, Supabase may not have
   *  stamped email_confirmed_at on older rows. Must still be able to enter. */
  const googleUser = {
    id: 'g1',
    email: 'student@gmail.com',
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google', id: 'google-123' }],
  };
  const confirmedEmailUser = {
    id: 'e1',
    email: 'old@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ provider: 'email', id: 'email-1' }],
  };
  const unconfirmedEmailUser = {
    id: 'e2',
    email: 'new@example.com',
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ provider: 'email', id: 'email-2' }],
  };
  const fakeSupabase = {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      resend: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    })),
  };
  return { fakeSupabase, googleUser, confirmedEmailUser, unconfirmedEmailUser };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

async function authModule() {
  return import('../src/modules/auth.ts');
}

/** Stubs the public Supabase settings probe (used to detect the Google provider). */
function stubProviderSettings(enabled: boolean | 'offline') {
  const fetchMock = vi.fn(async () => {
    if (enabled === 'offline') throw new Error('Failed to fetch');
    return {
      ok: true,
      json: async () => ({ external: { email: true, google: enabled } }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Google OAuth (Continue with Google)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    window.location.hash = '';
    hoisted.fakeSupabase.auth.signInWithOAuth.mockResolvedValue({
      data: {
        provider: 'google',
        url: 'https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/authorize?provider=google',
      },
      error: null,
    });
    hoisted.fakeSupabase.auth.signOut.mockResolvedValue({ error: null });
    hoisted.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    hoisted.fakeSupabase.auth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
    vi.unstubAllGlobals();
  });

  it('starts the official Supabase flow with Google and basic identity scopes only', async () => {
    const fetchMock = stubProviderSettings(true);
    const { signInWithGoogle, GOOGLE_OAUTH_SCOPES, GOOGLE_PROVIDER } = await authModule();

    const result = await signInWithGoogle();

    expect(result.ok).toBe(true);
    expect(result.redirecting).toBe(true);
    expect(GOOGLE_PROVIDER).toBe('google');
    // OpenID + email + profile. Never Gmail, Drive, Contacts or Calendar.
    expect(GOOGLE_OAUTH_SCOPES).toBe('openid email profile');
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://neurofocusx.vercel.app/',
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });

    // The availability probe uses the public anon key, never a service key.
    const [probeUrl, probeInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(probeUrl).toBe('https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/settings');
    expect((probeInit.headers as Record<string, string>).apikey).toBe('public-anon-key');
    expect(result.message).not.toContain('supabase');
  });

  it('returns the exact deployed origin and never a wildcard host', async () => {
    const { getOAuthRedirectUrl, getAllowedAuthOrigins, isAuthOriginAllowed } = await authModule();

    expect(getOAuthRedirectUrl()).toBe('https://neurofocusx.vercel.app/');
    expect(isAuthOriginAllowed('https://neurofocusx.vercel.app')).toBe(true);
    expect(getAllowedAuthOrigins().some((origin) => origin.includes('*'))).toBe(false);
    expect(getAllowedAuthOrigins()).not.toContain('https://*.vercel.app');
  });

  it('keeps preview deployments out of the allow-list', async () => {
    const { isAuthOriginAllowed } = await authModule();

    // A preview URL is a different origin and must never be trusted implicitly.
    expect(isAuthOriginAllowed('https://neurofocusx-git-main-team.vercel.app')).toBe(false);
    expect(isAuthOriginAllowed('https://neurofocusx.vercel.app.evil.example')).toBe(false);
    expect(isAuthOriginAllowed('https://evil.example.com')).toBe(false);
    // http on the production host is a different (insecure) origin.
    expect(isAuthOriginAllowed('http://neurofocusx.vercel.app')).toBe(false);
    // Local development stays possible with exact origins only.
    expect(isAuthOriginAllowed('http://localhost:5173')).toBe(true);
  });

  it('explains itself when the Google provider is not enabled in Supabase', async () => {
    stubProviderSettings(false);
    const { signInWithGoogle } = await authModule();

    const result = await signInWithGoogle();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('google-unavailable');
    expect(result.message).toMatch(/not available/i);
    expect(result.message).not.toMatch(/supabase|provider is not enabled|error_code/i);
    // The user is never redirected into a raw JSON error page.
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('still attempts the flow when the availability probe cannot be reached', async () => {
    stubProviderSettings('offline');
    const { signInWithGoogle } = await authModule();

    const result = await signInWithGoogle();

    expect(result.ok).toBe(true);
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('maps a cancelled Google consent back to a friendly message', async () => {
    window.location.hash =
      '#error=access_denied&error_code=access_denied&error_description=User+denied+the+request';

    // A fresh page load is what a real return from Google looks like.
    vi.resetModules();
    const returned = await authModule();
    const notice = returned.getOAuthRedirectNotice();

    expect(notice).toEqual({
      message: expect.stringMatching(/cancelled/i),
      reason: 'google-cancelled',
    });
    expect(notice?.message).not.toMatch(/access_denied|supabase|error_description/i);
    // The URL is cleaned so a refresh does not repeat a stale error.
    expect(window.location.hash).toBe('');
    // Reading again is harmless (the login screen can render more than once).
    expect(returned.getOAuthRedirectNotice()).toEqual(notice);
  });

  it('ignores the success hash so tokens are never touched', async () => {
    window.location.hash = '#access_token=tok&refresh_token=refresh&type=recovery';
    vi.resetModules();
    const { getOAuthRedirectNotice } = await authModule();

    expect(getOAuthRedirectNotice()).toBeNull();
    expect(window.location.hash).toContain('access_token=tok');
  });

  it('accepts Google accounts without a confirmation email and still blocks unconfirmed email accounts', async () => {
    const { isAccountVerified, isEmailConfirmed, isTrustedOAuthUser } = await authModule();

    expect(isTrustedOAuthUser(hoisted.googleUser as never)).toBe(true);
    expect(isEmailConfirmed(hoisted.googleUser as never)).toBe(false);
    expect(isAccountVerified(hoisted.googleUser as never)).toBe(true);

    expect(isAccountVerified(hoisted.confirmedEmailUser as never)).toBe(true);
    expect(isAccountVerified(hoisted.unconfirmedEmailUser as never)).toBe(false);
    expect(isAccountVerified(null)).toBe(false);
    expect(isTrustedOAuthUser({ id: 'x', app_metadata: { provider: 'email' } } as never)).toBe(
      false,
    );
  });

  it('accepts a linked Google identity on an existing account', async () => {
    const { isTrustedOAuthUser } = await authModule();

    expect(
      isTrustedOAuthUser({
        id: 'x',
        app_metadata: { provider: 'email' },
        identities: [{ provider: 'email' }, { provider: 'google' }],
      } as never),
    ).toBe(true);
  });

  it('keeps email/password sign-in working for already confirmed accounts', async () => {
    stubProviderSettings(true);
    hoisted.fakeSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: hoisted.confirmedEmailUser, session: { user: hoisted.confirmedEmailUser } },
      error: null,
    });
    const { signInWithEmailPassword, currentUser } = await authModule();

    const result = await signInWithEmailPassword('old@example.com', 'password123');

    expect(result.ok).toBe(true);
    expect(currentUser()?.email).toBe('old@example.com');
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('never ships the Google client secret or a service-role key', async () => {
    const src = readFileSync('src/modules/auth.ts', 'utf8');
    const indexHtml = readFileSync('index.html', 'utf8');

    expect(src).not.toContain('client_secret');
    expect(src).not.toContain('service_role');
    expect(src).not.toContain('SUPABASE_SERVICE');
    expect(indexHtml).not.toContain('client_secret');
    expect(indexHtml).not.toContain('service_role');
    // The OAuth client secret lives only in the Google Cloud / Supabase dashboards.
    expect(src).not.toMatch(/GOCSPX-/);
  });
});
