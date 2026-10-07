/**
 * End-to-end UI tests for the "Continue with Google" button.
 *
 * Loads the real app (src/main.ts + index.html body) with a mocked Supabase
 * client and runs on the production origin so the OAuth round-trip is exercised
 * exactly as it is on https://neurofocusx.vercel.app.
 *
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://neurofocusx.vercel.app/" }
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const listeners: Array<(event: string, session: unknown) => void> = [];
  const fire = (event: string, session: unknown) => {
    for (const cb of [...listeners]) cb(event, session);
  };
  /** Google user straight from the provider: verified, but no confirm stamp. */
  const googleUser = {
    id: 'g1',
    email: 'student@gmail.com',
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google', id: 'google-1' }],
  } as never;
  const googleSession = { user: googleUser, access_token: 'google-token' } as never;
  const fakeSupabase = {
    auth: {
      signInWithOAuth: vi.fn(async () => {
        fire('SIGNED_IN', null);
        return {
          data: { provider: 'google', url: 'https://example.supabase.co/auth/v1/authorize' },
          error: null,
        };
      }),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
      signInWithPassword: vi.fn(async () => {
        fire('SIGNED_IN', null);
        return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
      }),
      signUp: vi.fn(async () => ({ data: null, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      resend: vi.fn(async () => ({ data: {}, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    })),
  };
  return { listeners, fakeSupabase, fire, googleUser, googleSession };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

const html = readFileSync('index.html', 'utf8');
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const body = bodyMatch ? bodyMatch[1] : '';

/** Google provider is enabled unless a test says otherwise. */
function stubSettings(enabled: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ external: { email: true, google: enabled } }),
    })),
  );
}

async function loadApp(): Promise<void> {
  (window as unknown as { scrollTo: unknown }).scrollTo = () => undefined;
  await import('../src/main.ts');
}

const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const overlayVisible = () => {
  const overlay = document.querySelector<HTMLElement>('#login-overlay')!;
  return !overlay.classList.contains('hidden') && overlay.classList.contains('show');
};

const choiceMessage = () =>
  document.querySelector<HTMLElement>('#login-choice-message')?.textContent || '';

describe('Continue with Google (UI)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    stubSettings(true);
    window.location.hash = '';
    document.body.innerHTML = body;
    localStorage.clear();
    hoisted.listeners.length = 0;
  });

  it('renders an accessible, primary Google button above the other options', async () => {
    // Returning visitor: the account screen opens straight away.
    localStorage.setItem('nf_welcomeSeen', JSON.stringify(true));
    localStorage.setItem('nf_languageChosen', JSON.stringify(true));
    await loadApp();

    const google = document.querySelector<HTMLButtonElement>('#google-login-btn')!;
    const label = google.querySelector<HTMLElement>('.auth-google-label')!;
    const describedBy = google.getAttribute('aria-describedby')!;
    const note = document.querySelector<HTMLElement>(`#${describedBy}`)!;
    const svg = google.querySelector('svg')!;

    expect(google.tagName).toBe('BUTTON');
    expect(google.type).toBe('button');
    expect(google.disabled).toBe(false);
    expect(google.getAttribute('aria-busy')).toBe('false');
    expect(label.textContent).toBe('Continue with Google');
    expect(google.textContent).toContain('Continue with Google');
    // The brand mark is decorative — it must not be read out as content.
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    // A real, resolvable accessible description.
    expect(note.textContent).toMatch(/no password to remember/i);

    // Primary position: Google comes before the email sign-in option.
    const order = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#login-choice button, #login-choice a, #google-login-btn',
      ),
    );
    expect(order[0].id).toBe('google-login-btn');

    // Keyboard reachable first when the account screen opens.
    expect(document.activeElement).toBe(google);
  });

  it('starts the official Supabase Google flow with a secure redirect target', async () => {
    await loadApp();
    document.querySelector<HTMLButtonElement>('#google-login-btn')!.click();
    await tick();

    expect(hoisted.fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const [payload] = hoisted.fakeSupabase.auth.signInWithOAuth.mock.calls[0] as unknown as [
      { provider: string; options: Record<string, unknown> },
    ];
    expect(payload.provider).toBe('google');
    expect(payload.options.redirectTo).toBe('https://neurofocusx.vercel.app/');
    expect(payload.options.scopes).toBe('openid email profile');
    expect(payload.options.queryParams).toEqual({ prompt: 'select_account' });
    // No service-role key or secret ever travels with this call.
    expect(JSON.stringify(payload)).not.toMatch(/service_role|client_secret/);

    const settingsUrl = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0];
    expect(settingsUrl).toBe('https://zgrwthwfbjzpwngfazwc.supabase.co/auth/v1/settings');
  });

  it('shows a loading state and blocks duplicate clicks', async () => {
    let release!: (value: { data: { provider: string; url: string }; error: null }) => void;
    const pending = new Promise<{ data: { provider: string; url: string }; error: null }>(
      (resolve) => {
        release = resolve;
      },
    );
    hoisted.fakeSupabase.auth.signInWithOAuth.mockImplementationOnce(() => pending);

    await loadApp();
    const google = document.querySelector<HTMLButtonElement>('#google-login-btn')!;
    google.click();

    // Loading state is applied synchronously, before any network round-trip.
    expect(google.disabled).toBe(true);
    expect(google.getAttribute('aria-busy')).toBe('true');
    expect(google.textContent).toContain('Connecting to Google…');

    // Extra clicks while busy must not start a second redirect.
    google.click();
    google.click();
    await tick(10);
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);

    release({ data: { provider: 'google', url: 'https://example.test/authorize' }, error: null });
    await tick(10);
  });

  it('explains a misconfigured provider instead of redirecting into an error page', async () => {
    vi.unstubAllGlobals();
    stubSettings(false);
    await loadApp();

    const google = document.querySelector<HTMLButtonElement>('#google-login-btn')!;
    google.click();
    await tick();

    expect(hoisted.fakeSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(choiceMessage()).toMatch(/Google sign-in is not available right now/i);
    expect(document.querySelector<HTMLElement>('#login-choice-message')?.dataset.tone).toBe(
      'error',
    );
    // The user can try again — the button is not stuck in a loading state.
    expect(google.disabled).toBe(false);
    expect(google.getAttribute('aria-busy')).toBe('false');
    expect(document.activeElement).toBe(google);
  });

  it('keeps every failure message free of Supabase internals', async () => {
    vi.unstubAllGlobals();
    stubSettings(false);
    await loadApp();
    document.querySelector<HTMLButtonElement>('#google-login-btn')!.click();
    await tick();

    const message = choiceMessage();
    expect(message).not.toMatch(/supabase|zgrwthwfbjzpwngfazwc|error_code|status 400|fetch/i);
    expect(message).toMatch(/continue without an account|email and password/i);
  });

  it('explains a cancelled Google consent when the user comes back', async () => {
    // The browser returns from Google with an error in the URL hash.
    window.location.hash =
      '#error=access_denied&error_code=access_denied&error_description=User+denied+the+request';
    localStorage.setItem('nf_welcomeSeen', JSON.stringify(true));
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));

    await loadApp();
    await tick();

    expect(overlayVisible()).toBe(true);
    expect(choiceMessage()).toMatch(/cancelled/i);
    expect(choiceMessage()).not.toMatch(/access_denied|User\+denied|supabase/i);
    expect(document.querySelector<HTMLElement>('#login-choice-message')?.dataset.tone).toBe(
      'error',
    );
    expect(document.activeElement).toBe(document.querySelector('#google-login-btn'));
    // The hash is cleaned so a refresh does not repeat the message.
    expect(window.location.hash).toBe('');
  });

  it('signs a returning Google user in and keeps the sync flow intact', async () => {
    localStorage.setItem('nf_welcomeSeen', JSON.stringify(true));
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    await loadApp();
    await tick();

    // Supabase reports the session (this is what the client does after the
    // browser returns from Google with tokens in the hash).
    hoisted.fire('SIGNED_IN', hoisted.googleSession);
    await tick(60);

    expect(overlayVisible()).toBe(false);
    expect(document.querySelector<HTMLElement>('#account-email')?.textContent).toBe(
      'student@gmail.com',
    );
    // Google accounts are accepted even without an email_confirmed_at stamp,
    // because Google already verified the address.
    expect(localStorage.getItem('nf_authUser')).toContain('student@gmail.com');
  });

  it('never asks Supabase to create a password account', async () => {
    await loadApp();
    document.querySelector<HTMLButtonElement>('#email-login-btn')!.click();
    const email = document.querySelector<HTMLInputElement>('#login-email')!;
    const password = document.querySelector<HTMLInputElement>('#login-password')!;
    email.value = 'person@example.com';
    password.value = 'password123';
    document.querySelector<HTMLElement>('#send-login-btn')!.click();
    await tick();

    expect(hoisted.fakeSupabase.auth.signUp).not.toHaveBeenCalled();
    expect(hoisted.fakeSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('still supports continuing without an account', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#skip-login-btn')!.click();
    const name = document.querySelector<HTMLInputElement>('#login-name')!;
    name.value = 'Aarav';
    document.querySelector<HTMLElement>('#login-continue-btn')!.click();

    expect(overlayVisible()).toBe(false);
    expect(hoisted.fakeSupabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
