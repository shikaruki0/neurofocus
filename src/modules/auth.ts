/**
 * Authentication Module — Email/password auth via Supabase.
 * No OTP, no email links, no Firebase. Only email+password.
 *
 * Security rules:
 *  - Only real email formats are accepted (client-side gate).
 *  - Passwords must meet a minimum strength policy.
 *  - Unconfirmed accounts cannot use the app (sign out immediately).
 *  - Wrong password never silently "logs you in".
 *  - Errors never expose raw Supabase internals.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { get, set } from './storage.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isEmailAuthConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isEmailAuthConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Minimum password length (stronger than Supabase's bare minimum of 6). */
export const MIN_PASSWORD_LENGTH = 8;
/** Maximum password length to avoid abuse. */
export const MAX_PASSWORD_LENGTH = 200;

const ACCOUNTS_UNAVAILABLE_MESSAGE =
  'Online accounts are not available right now. You can continue locally.';
const GENERIC_AUTH_MESSAGE = 'Something went wrong. Please try again.';
const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Please confirm your email before signing in. Open the link we sent, then try again. Missing the email? Use Resend confirmation email.';
const CONFIRMATION_SENT_MESSAGE = 'Confirmation email sent. Check your inbox (and spam), then sign in.';
const INVALID_CREDENTIALS_MESSAGE =
  'The email or password is incorrect. Create an account first if you are new, or double-check your password.';

export type AuthActionResult = {
  ok: boolean;
  message: string;
  needsEmailConfirmation?: boolean;
  canResendConfirmation?: boolean;
  email?: string;
};

type AuthErrorLike = { message?: string; status?: number; code?: string } | null;

export function currentUser(): User | null {
  return get<User | null>('authUser', null);
}

export function rememberUser(user: User | null): void {
  if (user) set('authUser', user);
  else {
    // Keep this separate from app data: logout must not remove local progress.
    set('authUser', null);
  }
}

/**
 * Validates a password for account creation.
 * Requires length + at least one letter and one number so random short
 * junk passwords are rejected before they ever hit Supabase.
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { valid: false, error: 'Password is too long.' };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Password must include at least one letter and one number.',
    };
  }
  // Reject passwords that are only the same character repeated.
  if (/^(.)\1+$/.test(password)) {
    return { valid: false, error: 'Choose a stronger password.' };
  }
  return { valid: true };
}

/**
 * Validates an email string. Rejects empty, malformed, and obviously fake values.
 * Exported so the UI and tests share one rule.
 */
export function validateEmail(email: string): { valid: boolean; error?: string; email?: string } {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  // Basic structure: local@domain.tld
  if (clean.length > 254) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  // Reject spaces and consecutive dots; require a real-looking domain with a 2+ letter TLD.
  const emailPattern =
    /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  if (!emailPattern.test(clean)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  const [local, domain] = clean.split('@');
  if (!local || !domain || local.length > 64) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  // Block clearly placeholder / test junk that beginners type while "trying random stuff".
  const blockedLocals = new Set([
    'test',
    'testing',
    'asdf',
    'asdfgh',
    'qwerty',
    'abc',
    'abcd',
    'user',
    'email',
    'name',
    'xxx',
    'aaaa',
    'bbbb',
    'admin',
    'fake',
    'sample',
    'demo',
    'none',
    'null',
    'undefined',
  ]);
  const localBase = local.replace(/[.+].*$/, ''); // ignore +tag / .dots for blocklist
  if (blockedLocals.has(localBase) || /^(.)\1{3,}$/.test(localBase)) {
    return {
      valid: false,
      error: 'Please use your real email address so you can recover this account.',
    };
  }
  // Domain must have a real TLD (e.g. .com) — already enforced by pattern.
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true, email: clean };
}

function authMessage(err: AuthErrorLike): string {
  return (err?.message || '').toLowerCase();
}

function authCode(err: AuthErrorLike): string {
  return (err?.code || '').toLowerCase();
}

function isInvalidCredentialsError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  const code = authCode(err);
  return (
    code.includes('invalid_credentials') ||
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials')
  );
}

function isEmailNotConfirmedError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  const code = authCode(err);
  return (
    code.includes('email_not_confirmed') ||
    msg.includes('email not confirmed') ||
    msg.includes('email is not confirmed')
  );
}

function isAlreadyRegisteredError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  const code = authCode(err);
  return (
    code.includes('user_already_exists') ||
    code.includes('email_exists') ||
    msg.includes('user already registered') ||
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('already been registered')
  );
}

function isAlreadyConfirmedError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  const code = authCode(err);
  return (
    code.includes('email_already_confirmed') ||
    msg.includes('already confirmed') ||
    msg.includes('email confirmed')
  );
}

function isRateLimitError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  return err?.status === 429 || msg.includes('rate limit') || msg.includes('too many requests');
}

function isNetworkError(err: AuthErrorLike): boolean {
  const msg = authMessage(err);
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('connection') ||
    msg.includes('failed to fetch')
  );
}

function emailConfirmationResult(
  email: string,
  message = EMAIL_NOT_CONFIRMED_MESSAGE,
): AuthActionResult {
  return {
    ok: false,
    message,
    needsEmailConfirmation: true,
    canResendConfirmation: true,
    email,
  };
}

/**
 * Returns true when Supabase has marked the email as confirmed.
 * When Confirm Email is OFF, Supabase sets email_confirmed_at immediately.
 * When the field is missing entirely (some older payloads), a valid session
 * is treated as confirmed. Explicit null/empty means "not confirmed yet".
 */
export function isEmailConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  const record = user as User & {
    email_confirmed_at?: string | null;
    confirmed_at?: string | null;
  };
  const hasConfirmField =
    Object.prototype.hasOwnProperty.call(record, 'email_confirmed_at') ||
    Object.prototype.hasOwnProperty.call(record, 'confirmed_at');
  if (!hasConfirmField) return true;
  return Boolean(record.email_confirmed_at || record.confirmed_at);
}

function signUpLooksLikeExistingAccount(
  data: { user?: User | null; session?: unknown } | null,
): boolean {
  if (!data?.user || data.session) return false;
  const userWithIdentities = data.user as User & { identities?: unknown[] | null };
  return Array.isArray(userWithIdentities.identities) && userWithIdentities.identities.length === 0;
}

/**
 * Maps Supabase auth errors to friendly user-facing messages.
 * Never exposes raw error details.
 */
export function friendlyAuthError(err: AuthErrorLike): string {
  if (!err) return GENERIC_AUTH_MESSAGE;
  const msg = authMessage(err);

  if (isEmailNotConfirmedError(err)) return EMAIL_NOT_CONFIRMED_MESSAGE;
  if (isInvalidCredentialsError(err)) return INVALID_CREDENTIALS_MESSAGE;
  if (isAlreadyRegisteredError(err)) {
    return 'This account already exists. Try signing in instead.';
  }
  if (
    msg.includes('password should be at least') ||
    msg.includes('password is too weak') ||
    (msg.includes('password') && msg.includes('characters'))
  ) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include a letter and a number.`;
  }
  if (isRateLimitError(err)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (isNetworkError(err)) {
    return 'Connection problem. Please check your internet and try again.';
  }
  if (msg.includes('email')) {
    return 'Enter a valid email address.';
  }
  return GENERIC_AUTH_MESSAGE;
}

/**
 * After a successful Supabase auth response, ensure we only keep confirmed sessions.
 * If the project has Confirm Email ON and the user is not confirmed, sign out and guide them.
 */
async function acceptAuthenticatedUser(
  user: User,
  cleanEmail: string,
): Promise<AuthActionResult> {
  // Some Supabase projects return a user object before confirmation. Never treat
  // an unconfirmed user as signed-in — that is the "random email works" loophole
  // when combined with confusing client state.
  if (!isEmailConfirmed(user)) {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      // ignore
    }
    rememberUser(null);
    return emailConfirmationResult(cleanEmail);
  }
  rememberUser(user);
  return { ok: true, message: 'Signed in successfully.' };
}

/**
 * Create a new account with email and password.
 * When Confirm Email is OFF, Supabase returns a usable session immediately
 * (and marks the email confirmed). When Confirm Email is ON, no session
 * exists yet, so the UI must keep the user on the form with a resend path.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  const cleanEmail = emailCheck.email!;
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return { ok: false, message: pwCheck.error! };

  if (!supabase) {
    return {
      ok: false,
      message: ACCOUNTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    if (error) {
      if (isEmailNotConfirmedError(error)) return emailConfirmationResult(cleanEmail);
      if (isAlreadyRegisteredError(error)) {
        return { ok: false, message: 'This account already exists. Try signing in instead.' };
      }
      return { ok: false, message: friendlyAuthError(error) };
    }

    if (signUpLooksLikeExistingAccount(data)) {
      return { ok: false, message: 'This account already exists. Try signing in instead.' };
    }

    // Confirm-email OFF: signUp returns a session. Store it only if confirmed.
    const sessionUser = data?.session?.user ?? null;
    if (sessionUser) {
      const accepted = await acceptAuthenticatedUser(sessionUser, cleanEmail);
      if (accepted.ok) {
        return { ok: true, message: 'Account created! You are signed in.' };
      }
      return accepted;
    }

    // No session yet — either confirmation is required, or a race. Try sign-in once.
    const signInAfterSignUp = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    const fallbackUser =
      signInAfterSignUp.data?.session?.user ?? signInAfterSignUp.data?.user ?? null;
    if (!signInAfterSignUp.error && fallbackUser) {
      const accepted = await acceptAuthenticatedUser(fallbackUser, cleanEmail);
      if (accepted.ok) {
        return { ok: true, message: 'Account created! You are signed in.' };
      }
      return accepted;
    }

    // Default: account row may exist, but user must confirm email before using the app.
    return emailConfirmationResult(
      cleanEmail,
      'Account created. Check your inbox for a confirmation link, then sign in. You can resend the email if needed.',
    );
  } catch {
    return {
      ok: false,
      message: friendlyAuthError({ message: 'network' }),
    };
  }
}

/**
 * Sign in with email and password.
 * Wrong password → clear error (never a fake login).
 * Unconfirmed email → confirmation path with resend.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  const cleanEmail = emailCheck.email!;
  if (!password || typeof password !== 'string') {
    return { ok: false, message: 'Enter your password.' };
  }

  if (!supabase) {
    return {
      ok: false,
      message: ACCOUNTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      // Real "not confirmed" from Supabase — offer resend.
      if (isEmailNotConfirmedError(error)) return emailConfirmationResult(cleanEmail);
      // Wrong email/password — do NOT pretend it might be unconfirmed.
      // (Previously this always opened the confirmation path, which felt like a loophole.)
      if (isInvalidCredentialsError(error)) {
        return {
          ok: false,
          message: INVALID_CREDENTIALS_MESSAGE,
          // Still allow resend in case their account is new and unconfirmed —
          // Supabase often collapses that case into "invalid credentials".
          canResendConfirmation: true,
          email: cleanEmail,
        };
      }
      return { ok: false, message: friendlyAuthError(error) };
    }

    const user = data?.session?.user ?? data?.user ?? null;
    if (!user) {
      return { ok: false, message: GENERIC_AUTH_MESSAGE };
    }
    const accepted = await acceptAuthenticatedUser(user, cleanEmail);
    if (accepted.ok) {
      return { ok: true, message: 'Signed in successfully.' };
    }
    return accepted;
  } catch {
    return {
      ok: false,
      message: friendlyAuthError({ message: 'network' }),
    };
  }
}

const PASSWORD_RESET_SENT_MESSAGE =
  'Password reset email sent. Check your inbox (and spam), open the link, then choose a new password.';
const PASSWORD_UPDATED_MESSAGE = 'Password updated. You are signed in.';

/**
 * Sends a password-reset email via Supabase.
 * The user must open the link, then set a new password in the app.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  const cleanEmail = emailCheck.email!;

  if (!supabase) {
    return {
      ok: false,
      message: ACCOUNTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });
    if (error) {
      if (isRateLimitError(error)) {
        return {
          ok: false,
          message: 'Reset email was requested recently. Please wait a moment and try again.',
          email: cleanEmail,
        };
      }
      if (isNetworkError(error)) {
        return { ok: false, message: friendlyAuthError(error), email: cleanEmail };
      }
      // Do not reveal whether the email exists (account enumeration).
      return {
        ok: true,
        message: PASSWORD_RESET_SENT_MESSAGE,
        email: cleanEmail,
      };
    }
    return {
      ok: true,
      message: PASSWORD_RESET_SENT_MESSAGE,
      email: cleanEmail,
    };
  } catch {
    return {
      ok: false,
      message: friendlyAuthError({ message: 'network' }),
      email: cleanEmail,
    };
  }
}

/**
 * Completes a password recovery session by setting a new password.
 * Call this after the user opens the reset link from their email.
 */
export async function updatePasswordAfterReset(password: string): Promise<AuthActionResult> {
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return { ok: false, message: pwCheck.error! };

  if (!supabase) {
    return {
      ok: false,
      message: ACCOUNTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (isRateLimitError(error)) {
        return { ok: false, message: 'Too many attempts. Please wait a moment and try again.' };
      }
      return { ok: false, message: friendlyAuthError(error) };
    }
    const user = data?.user ?? null;
    if (!user) return { ok: false, message: GENERIC_AUTH_MESSAGE };
    rememberUser(user);
    return { ok: true, message: PASSWORD_UPDATED_MESSAGE };
  } catch {
    return {
      ok: false,
      message: friendlyAuthError({ message: 'network' }),
    };
  }
}

export async function resendConfirmationEmail(email: string): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  const cleanEmail = emailCheck.email!;

  if (!supabase) {
    return {
      ok: false,
      message: ACCOUNTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
    if (error) {
      if (isAlreadyConfirmedError(error)) {
        return {
          ok: false,
          message: 'This email is already confirmed. Sign in with your password.',
          email: cleanEmail,
        };
      }
      if (isRateLimitError(error)) {
        return {
          ok: false,
          message: 'Confirmation email was requested recently. Please wait a moment and try again.',
          canResendConfirmation: true,
          email: cleanEmail,
        };
      }
      if (isEmailNotConfirmedError(error) || isInvalidCredentialsError(error)) {
        return emailConfirmationResult(cleanEmail);
      }
      return { ok: false, message: friendlyAuthError(error), email: cleanEmail };
    }

    return {
      ok: true,
      message: CONFIRMATION_SENT_MESSAGE,
      email: cleanEmail,
    };
  } catch {
    return {
      ok: false,
      message: friendlyAuthError({ message: 'network' }),
      canResendConfirmation: true,
      email: cleanEmail,
    };
  }
}

export async function restoreAuthSession(): Promise<User | null> {
  if (!supabase) return currentUser();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const status = error.status;
      const isAuthError = status === 400 || status === 401 || status === 403;
      if (isAuthError) {
        rememberUser(null);
        return null;
      }
      return currentUser();
    }
    if (!data.user) {
      rememberUser(null);
      return null;
    }
    // Drop stale unconfirmed sessions so a half-created account cannot open the app.
    if (!isEmailConfirmed(data.user)) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      rememberUser(null);
      return null;
    }
    rememberUser(data.user);
    return data.user;
  } catch (err) {
    console.debug('Session restoration offline fallback:', err);
    return currentUser();
  }
}

export async function logout(): Promise<void> {
  // Best-effort push before leaving so the other device can pick up latest progress.
  try {
    const { flushCloudSync } = await import('./cloudSync.ts');
    await flushCloudSync();
  } catch {
    // Offline or not configured — fine.
  }
  if (supabase) await supabase.auth.signOut();
  rememberUser(null);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    if (user && !isEmailConfirmed(user)) {
      rememberUser(null);
      callback(null);
      return;
    }
    rememberUser(user);
    callback(user);
  });
  return () => data.subscription.unsubscribe();
}
