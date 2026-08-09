import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const fakeUser = {
    id: 'u1',
    email: 'person@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    confirmed_at: '2026-01-01T00:00:00Z',
  };
  const unconfirmedUser = {
    id: 'u2',
    email: 'new@example.com',
    email_confirmed_at: null,
    confirmed_at: null,
  };
  const fakeSession = { user: fakeUser, access_token: 'token' };
  const fakeSupabase = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      resend: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  };
  return { fakeUser, unconfirmedUser, fakeSession, fakeSupabase };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

async function authModule() {
  return import('../src/modules/auth.ts');
}

describe('configured email/password auth module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    hoisted.fakeSupabase.auth.signUp.mockResolvedValue({
      data: { user: hoisted.fakeUser, session: hoisted.fakeSession },
      error: null,
    });
    hoisted.fakeSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: hoisted.fakeUser, session: hoisted.fakeSession },
      error: null,
    });
    hoisted.fakeSupabase.auth.resend.mockResolvedValue({ data: {}, error: null });
    hoisted.fakeSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    hoisted.fakeSupabase.auth.updateUser.mockResolvedValue({
      data: { user: hoisted.fakeUser },
      error: null,
    });
    hoisted.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    hoisted.fakeSupabase.auth.signOut.mockResolvedValue({ error: null });
    hoisted.fakeSupabase.auth.onAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    }));
  });

  it('sign-up stores the returned session so confirm-email-off accounts enter the app immediately', async () => {
    const { signUpWithEmailPassword, currentUser } = await authModule();

    const result = await signUpWithEmailPassword('person@example.com', 'password123');

    expect(result).toMatchObject({ ok: true, message: expect.stringMatching(/signed in/i) });
    expect(currentUser()?.email).toBe('person@example.com');
  });

  it('sign-up without a session keeps the user on confirmation flow instead of faking login', async () => {
    hoisted.fakeSupabase.auth.signUp.mockResolvedValueOnce({
      data: { user: hoisted.fakeUser, session: null },
      error: null,
    });
    hoisted.fakeSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    });
    const { signUpWithEmailPassword, currentUser } = await authModule();

    const result = await signUpWithEmailPassword('person@example.com', 'password123');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/confirm/i);
    expect(result.canResendConfirmation).toBe(true);
    expect(currentUser()).toBeNull();
  });

  it('sign-in maps wrong password to a clear incorrect-credentials message', async () => {
    hoisted.fakeSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    });
    const { signInWithEmailPassword } = await authModule();

    const result = await signInWithEmailPassword('person@example.com', 'password123');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/incorrect/i);
    expect(result.message).not.toContain('Invalid login credentials');
    // Resend still available in case Supabase collapsed unconfirmed into invalid-creds.
    expect(result.canResendConfirmation).toBe(true);
    expect(result.email).toBe('person@example.com');
  });

  it('rejects unconfirmed sessions instead of faking a login', async () => {
    hoisted.fakeSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: hoisted.unconfirmedUser, session: { user: hoisted.unconfirmedUser } },
      error: null,
    });
    const { signInWithEmailPassword, currentUser } = await authModule();

    const result = await signInWithEmailPassword('new@example.com', 'password123');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/confirm/i);
    expect(result.canResendConfirmation).toBe(true);
    expect(currentUser()).toBeNull();
    expect(hoisted.fakeSupabase.auth.signOut).toHaveBeenCalled();
  });

  it('resends signup confirmation emails without exposing raw Supabase errors', async () => {
    const { resendConfirmationEmail } = await authModule();

    const result = await resendConfirmationEmail('person@example.com');

    expect(result).toMatchObject({
      ok: true,
      message: expect.stringMatching(/confirmation email sent/i),
    });
    expect(hoisted.fakeSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
    });
  });

  it('sends password reset emails without revealing whether the account exists', async () => {
    const { requestPasswordReset } = await authModule();

    const result = await requestPasswordReset('person@example.com');

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/password reset email sent/i);
    expect(hoisted.fakeSupabase.auth.resetPasswordForEmail).toHaveBeenCalled();
  });

  it('updates password after recovery and stores the signed-in user', async () => {
    const { updatePasswordAfterReset, currentUser } = await authModule();

    const result = await updatePasswordAfterReset('newpass99');

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/password updated/i);
    expect(currentUser()?.email).toBe('person@example.com');
  });

  it('friendlyAuthError does not expose raw auth error strings', async () => {
    const { friendlyAuthError } = await authModule();

    expect(friendlyAuthError({ message: 'Email not confirmed', status: 400 })).toMatch(
      /confirm your email/i,
    );
    expect(friendlyAuthError({ message: 'Invalid login credentials', status: 400 })).not.toContain(
      'Invalid login credentials',
    );
  });

  it('restoreAuthSession clears stale users on Supabase errors', async () => {
    hoisted.fakeSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Auth session missing', status: 401 },
    });
    const { rememberUser, restoreAuthSession, currentUser } = await authModule();
    rememberUser(hoisted.fakeUser as never);

    await expect(restoreAuthSession()).resolves.toBeNull();
    expect(currentUser()).toBeNull();
  });

  it('onAuthChange stores signed-in users and clears signed-out sessions', async () => {
    let listener: (event: string, session: { user: typeof hoisted.fakeUser } | null) => void = () =>
      undefined;
    hoisted.fakeSupabase.auth.onAuthStateChange.mockImplementationOnce(
      (cb: (event: string, session: { user: typeof hoisted.fakeUser } | null) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );
    const { onAuthChange, currentUser } = await authModule();
    const callback = vi.fn();

    onAuthChange(callback);
    listener?.('SIGNED_IN', { user: hoisted.fakeUser });
    expect(currentUser()?.email).toBe('person@example.com');
    expect(callback).toHaveBeenLastCalledWith(hoisted.fakeUser);

    listener?.('SIGNED_OUT', null);
    expect(currentUser()).toBeNull();
    expect(callback).toHaveBeenLastCalledWith(null);
  });
});
