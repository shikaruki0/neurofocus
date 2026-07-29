/**
 * Authentication Module — Email/password auth via Supabase.
 * No OTP, no email links, no Firebase. Only email+password.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { get, set } from './storage.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isEmailAuthConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isEmailAuthConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Minimum password length matching Supabase default policy. */
export const MIN_PASSWORD_LENGTH = 6;
/** Maximum password length to avoid abuse. */
export const MAX_PASSWORD_LENGTH = 200;

const ACCOUNTS_UNAVAILABLE_MESSAGE =
  'Online accounts are not available right now. You can continue locally.';
const GENERIC_AUTH_MESSAGE = 'Something went wrong. Please try again.';
const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Email not confirmed. Please confirm your email before signing in. If the message is missing, use Resend confirmation email.';
const POSSIBLE_EMAIL_NOT_CONFIRMED_MESSAGE =
  'Email not confirmed yet? Please confirm your email or use Resend confirmation email. If you already confirmed it, check the email/password and try again.';
const CONFIRMATION_SENT_MESSAGE = 'Confirmation email sent. Check your inbox, then sign in.';

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
  return { valid: true };
}

/**
 * Validates an email string.
 */
function validateEmail(email: string): { valid: boolean; error?: string; email?: string } {
  const clean = (email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(clean)) {
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
    msg.includes('email is not confirmed') ||
    (msg.includes('confirm') && msg.includes('email') && !msg.includes('already'))
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
  if (isInvalidCredentialsError(err)) {
    return 'The email or password is incorrect. If this is a new account, confirm your email or resend confirmation.';
  }
  if (isAlreadyRegisteredError(err)) {
    return 'This account already exists. Try signing in instead.';
  }
  if (
    msg.includes('password should be at least') ||
    msg.includes('password is too weak') ||
    msg.includes('password')
  ) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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
 * Create a new account with email and password.
 * When Confirm Email is OFF, Supabase returns a usable session immediately.
 * When Confirm Email is ON, no session exists yet, so the UI must keep the
 * user on the email/password form with a confirmation-resend path.
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
      return { ok: false, message: friendlyAuthError(error) };
    }

    if (signUpLooksLikeExistingAccount(data)) {
      return { ok: false, message: 'This account already exists. Try signing in instead.' };
    }

    // Confirm-email OFF: signUp returns a session. Store it immediately so the
    // app transitions to the signed-in state without waiting for auth callbacks.
    const sessionUser = data?.session?.user ?? null;
    if (sessionUser) {
      rememberUser(sessionUser);
      return { ok: true, message: 'Account created! You are signed in.' };
    }

    // Defensive fallback for Supabase/browser races: if signUp did not include
    // a session but email confirmation is actually off, password sign-in should
    // succeed and establish the session. If confirmation is on, this fails with
    // the same protected credentials error and we fall through to confirmation.
    const signInAfterSignUp = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    const fallbackUser =
      signInAfterSignUp.data?.session?.user ?? signInAfterSignUp.data?.user ?? null;
    if (!signInAfterSignUp.error && fallbackUser) {
      rememberUser(fallbackUser);
      return { ok: true, message: 'Account created! You are signed in.' };
    }

    return emailConfirmationResult(
      cleanEmail,
      'Account created. Email not confirmed yet. Check your inbox, then sign in. You can resend the confirmation email if needed.',
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
      if (isEmailNotConfirmedError(error)) return emailConfirmationResult(cleanEmail);
      // Supabase often returns "Invalid login credentials" for unconfirmed
      // users. Surface the confirmation path without leaking raw auth details.
      if (isInvalidCredentialsError(error)) {
        return emailConfirmationResult(cleanEmail, POSSIBLE_EMAIL_NOT_CONFIRMED_MESSAGE);
      }
      return { ok: false, message: friendlyAuthError(error) };
    }

    const user = data?.session?.user ?? data?.user ?? null;
    if (!user) {
      return { ok: false, message: GENERIC_AUTH_MESSAGE };
    }
    rememberUser(user);
    return { ok: true, message: 'Signed in successfully.' };
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
    rememberUser(data.user);
    return data.user;
  } catch (err) {
    console.debug('Session restoration offline fallback:', err);
    return currentUser();
  }
}

export async function logout(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  rememberUser(null);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    rememberUser(user);
    callback(user);
  });
  return () => data.subscription.unsubscribe();
}
