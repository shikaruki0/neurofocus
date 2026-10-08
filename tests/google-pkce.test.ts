/**
 * "Continue with Google" uses the OAuth PKCE flow.
 *
 *  - The redirect starts from a dedicated PKCE helper client, so Supabase
 *    returns a one-time `?code=` instead of tokens in the URL.
 *  - The code is removed from the address bar before anything else runs and is
 *    exchanged (with this browser's verifier) for a session that the main
 *    client then owns.
 *  - Email links (password reset, confirmation) stay on the main client's
 *    implicit flow so they keep working across devices.
 *
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://neurofocusx.vercel.app/" }
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const googleUser = {
    id: 'g1',
    email: 'student@gmail.com',
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google' }],
  };
  const googleSession = {
    access_token: 'access-from-code',
    refresh_token: 'refresh-from-code',
    user: googleUser,
  };
  const makeClient = () => ({
    auth: {
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      resend: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    })),
  });
  const main = makeClient();
  const helper = makeClient();
  const createClient = vi.fn(
    (_url: string, _key: string, options?: { auth?: { flowType?: string } }) =>
      options?.auth?.flowType === 'pkce' ? helper : main,
  );
  return { main, helper, createClient, googleUser, googleSession };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: hoisted.createClient }));
vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

const VERIFIER_KEY = 'nf-google-pkce-code-verifier';

function stubProviderSettings() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ external: { email: true, google: true } }),
    })),
  );
}

function setUrl(path: string) {
  window.history.replaceState(null, '', path);
}

function pkceClientOptions() {
  const call = hoisted.createClient.mock.calls.find(
    ([, , options]) => (options as { auth?: { flowType?: string } })?.auth?.flowType === 'pkce',
  );
  return (call?.[2] as { auth: Record<string, unknown> } | undefined)?.auth;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  setUrl('/');
  for (const client of [hoisted.main, hoisted.helper]) {
    client.auth.signInWithOAuth.mockResolvedValue({
      data: {
        provider: 'google',
        url: 'https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/authorize',
      },
      error: null,
    });
    client.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: hoisted.googleSession, user: hoisted.googleUser },
      error: null,
    });
    client.auth.setSession.mockResolvedValue({
      data: { session: hoisted.googleSession, user: hoisted.googleUser },
      error: null,
    });
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  }
});

describe('Google sign-in with PKCE', () => {
  it('starts the Google redirect from a PKCE client, not the main (implicit) client', async () => {
    stubProviderSettings();
    const { signInWithGoogle } = await import('../src/modules/auth.ts');

    const result = await signInWithGoogle();

    expect(result).toMatchObject({ ok: true, redirecting: true });
    expect(hoisted.helper.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://neurofocusx.vercel.app/',
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });
    expect(hoisted.main.auth.signInWithOAuth).not.toHaveBeenCalled();

    const options = pkceClientOptions();
    expect(options).toMatchObject({
      flowType: 'pkce',
      storageKey: 'nf-google-pkce',
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
    // The main client keeps the default (implicit) flow for email links.
    const mainOptions = hoisted.createClient.mock.calls[0]?.[2] as { auth: { flowType?: string } };
    expect(mainOptions.auth.flowType).toBeUndefined();
  });

  it('persists only the one-time verifier — never a session — from the helper', async () => {
    stubProviderSettings();
    const { signInWithGoogle } = await import('../src/modules/auth.ts');
    await signInWithGoogle();
    const storage = pkceClientOptions()!.storage as {
      setItem(key: string, value: string): void;
      getItem(key: string): string | null;
      removeItem(key: string): void;
    };

    storage.setItem(VERIFIER_KEY, 'verifier-123');
    storage.setItem('nf-google-pkce', JSON.stringify({ access_token: 'secret' }));

    expect(localStorage.getItem(VERIFIER_KEY)).toBe('verifier-123');
    expect(localStorage.getItem('nf-google-pkce')).toBeNull();
    expect(storage.getItem('nf-google-pkce')).toContain('secret'); // memory only
    storage.removeItem(VERIFIER_KEY);
    expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
  });

  it('exchanges the returned code, hands the session to the main client, and cleans the URL', async () => {
    localStorage.setItem(VERIFIER_KEY, 'verifier-123');
    setUrl('/?code=one-time-code');
    hoisted.main.auth.getUser.mockResolvedValue({
      data: { user: hoisted.googleUser },
      error: null,
    });

    const auth = await import('../src/modules/auth.ts');
    // The code is gone from the address bar before anything else runs.
    expect(window.location.search).toBe('');

    const user = await auth.restoreAuthSession();

    expect(hoisted.helper.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(hoisted.main.auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-from-code',
      refresh_token: 'refresh-from-code',
    });
    // restore waited for the exchange, so it sees the new Google user.
    expect(user?.id).toBe('g1');
    expect(auth.currentUser()?.id).toBe('g1');
    expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
    expect(auth.takeGoogleReturnNotice()).toBeNull();
  });

  it("turns a code without this browser's verifier into a friendly notice (no silent failure)", async () => {
    setUrl('/?code=code-from-another-browser');

    const auth = await import('../src/modules/auth.ts');
    await auth.waitForGoogleReturn();

    expect(window.location.search).toBe('');
    expect(hoisted.helper.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(hoisted.main.auth.setSession).not.toHaveBeenCalled();
    const notice = auth.takeGoogleReturnNotice();
    expect(notice?.reason).toBe('google-failed');
    expect(notice?.message).not.toMatch(/pkce|verifier|supabase/i);
    // Shown once.
    expect(auth.takeGoogleReturnNotice()).toBeNull();
  });

  it('reports an expired/invalid code without signing anyone in', async () => {
    localStorage.setItem(VERIFIER_KEY, 'verifier-123');
    setUrl('/?code=expired');
    hoisted.helper.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'invalid flow state, no valid flow state found', status: 404 },
    });

    const auth = await import('../src/modules/auth.ts');
    const user = await auth.restoreAuthSession();

    expect(user).toBeNull();
    expect(hoisted.main.auth.setSession).not.toHaveBeenCalled();
    expect(auth.takeGoogleReturnNotice()?.reason).toBe('google-failed');
    expect(localStorage.getItem(VERIFIER_KEY)).toBeNull();
  });

  it('keeps other query parameters and still recognises a cancelled Google return', async () => {
    localStorage.setItem(VERIFIER_KEY, 'verifier-123');
    setUrl('/?error=access_denied&error_description=User+denied');

    const auth = await import('../src/modules/auth.ts');
    expect(auth.getOAuthRedirectNotice()?.reason).toBe('google-cancelled');
    expect(window.location.search).toBe('');
    expect(hoisted.helper.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('leaves password-reset emails on the main client so links work on any device', async () => {
    const { requestPasswordReset } = await import('../src/modules/auth.ts');
    const result = await requestPasswordReset('student@gmail.com');

    expect(result.ok).toBe(true);
    expect(hoisted.main.auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(hoisted.helper.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
