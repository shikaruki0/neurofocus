/**
 * Authentication Module — Google sign-in + email/password auth via Supabase.
 *
 * Product rule (v14.1): "Continue with Google" is the primary way to create a
 * free account, because it needs no email delivery at all. Email + password
 * stays available for the accounts that already exist, and password sign-up is
 * paused (see `isEmailSignupEnabled`) until reliable email delivery exists.
 *
 * Security rules:
 *  - Only real email formats are accepted (client-side gate).
 *  - Passwords must meet a minimum strength policy.
 *  - Unconfirmed email/password accounts cannot use the app (sign out immediately).
 *  - Google accounts are trusted only because Google verifies the email; the
 *    client still never marks anything confirmed itself.
 *  - OAuth starts and returns only on an exact, allow-listed origin (no wildcards).
 *  - Wrong password never silently "logs you in".
 *  - Errors never expose raw Supabase internals.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { get, set } from './storage.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const ACCOUNTS_UNAVAILABLE_MESSAGE =
  'Online accounts are not available right now. You can continue locally.';
const GENERIC_AUTH_MESSAGE = 'Something went wrong. Please try again.';
const GOOGLE_UNAVAILABLE_MESSAGE =
  'Google sign-in is not available right now. You can sign in with email and password, or continue without an account.';
const GOOGLE_CANCELLED_MESSAGE =
  'Google sign-in was cancelled. You can try again, or sign in with your email and password.';
const GOOGLE_FAILED_MESSAGE = 'We could not finish signing you in with Google. Please try again.';
const GOOGLE_ORIGIN_MESSAGE =
  'Google sign-in works on the live app. Here you can sign in with email and password, or continue without an account.';
const GOOGLE_REDIRECTING_MESSAGE = 'Connecting to Google…';
const LINK_EXPIRED_MESSAGE = 'That sign-in link has expired. Please start again.';
const EMAIL_SIGNUP_PAUSED_MESSAGE =
  'Creating a new password account is paused right now. Use “Continue with Google” to create your free account.';

/**
 * Captures an OAuth/email-link error that Supabase appended to the URL, BEFORE
 * the Supabase client is created.
 *
 * Why before: `createClient()` starts consuming the URL hash asynchronously. If
 * we read the hash afterwards, a cancelled Google sign-in can be cleared by the
 * client and the user would land on the login screen with no explanation.
 */
const initialRedirectError = readAuthRedirectError();

export const isEmailAuthConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isEmailAuthConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Minimum password length (stronger than Supabase's bare minimum of 6). */
export const MIN_PASSWORD_LENGTH = 8;
/** Maximum password length to avoid abuse. */
export const MAX_PASSWORD_LENGTH = 200;

/** Only basic identity scopes — never Gmail, Drive, Contacts or Calendar. */
export const GOOGLE_OAUTH_SCOPES = 'openid email profile';
/** OAuth provider used for the one-tap account path. */
export const GOOGLE_PROVIDER = 'google';

/**
 * Exact origins where an OAuth round-trip is allowed to start/return.
 * Wildcards (for example `*.vercel.app`) are deliberately NOT supported: a
 * preview deployment is a different origin and can be controlled by anyone who
 * can create a Vercel project. Extra origins can be added for local work with
 * `VITE_AUTH_ALLOWED_ORIGINS` (comma separated, exact origins only).
 */
const DEFAULT_ALLOWED_AUTH_ORIGINS = [
  'https://neurofocusx.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * Email/password sign-up switch.
 *
 * Paused until reliable email delivery exists (custom SMTP + a verified
 * sending domain). Supabase's built-in mailer is rate limited and often lands
 * in spam, so a new sign-up would be stranded on "confirm your email".
 * This is a product switch, NOT a security control: Supabase still enforces
 * email confirmation for every password account created out-of-band.
 */
export const isEmailSignupEnabled = false;
const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Please confirm your email before signing in. Open the link we sent, then try again. Missing the email? Use Resend confirmation email.';
const CONFIRMATION_SENT_MESSAGE =
  'Confirmation email sent. Check your inbox (and spam), then sign in.';
const INVALID_CREDENTIALS_MESSAGE =
  'The email or password is incorrect. Create an account first if you are new, or double-check your password.';

/**
 * Increments whenever account state changes locally or through Supabase.
 *
 * Session restoration is asynchronous. Without this guard, a slow request
 * started before sign-in can resolve with its old "no user" response after a
 * successful sign-in and erase the newly saved user from local storage.
 */
let authStateRevision = 0;

/**
 * Machine-readable reason codes so the UI can show the same friendly message in
 * every supported language. `message` always carries an English fallback.
 */
export type AuthReason =
  | 'accounts-unavailable'
  | 'google-unavailable'
  | 'google-cancelled'
  | 'google-failed'
  | 'google-origin'
  | 'google-offline'
  | 'link-expired';

export type AuthActionResult = {
  ok: boolean;
  message: string;
  needsEmailConfirmation?: boolean;
  canResendConfirmation?: boolean;
  email?: string;
  /** True while the browser is being sent to the provider (keep the spinner). */
  redirecting?: boolean;
  /** Optional code so the UI can translate the failure message. */
  reason?: AuthReason;
};

/** Result of a failed OAuth/email-link return. */
export type AuthRedirectNotice = { message: string; reason: AuthReason };

type AuthErrorLike = { message?: string; status?: number; code?: string } | null;

export function currentUser(): User | null {
  return get<User | null>('authUser', null);
}

export function rememberUser(user: User | null): void {
  // Mark every transition so an older in-flight restore cannot overwrite it.
  authStateRevision += 1;
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

/** Providers that verify the email address themselves (Google does). */
const TRUSTED_OAUTH_PROVIDERS = new Set([GOOGLE_PROVIDER]);

/**
 * True when the account was created through Google (or another trusted OAuth
 * provider). Google only releases an address it has already verified, so these
 * accounts need no confirmation email. Nothing is written to the account here —
 * the provider metadata comes from the Supabase Auth server and is read-only
 * for the browser.
 */
export function isTrustedOAuthUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const record = user as User & {
    app_metadata?: { provider?: string; providers?: string[] };
    identities?: Array<{ provider?: string }> | null;
  };
  const provider = record.app_metadata?.provider;
  if (provider && TRUSTED_OAUTH_PROVIDERS.has(String(provider).toLowerCase())) return true;
  const providers = record.app_metadata?.providers;
  if (Array.isArray(providers)) {
    if (providers.some((item) => TRUSTED_OAUTH_PROVIDERS.has(String(item).toLowerCase()))) {
      return true;
    }
  }
  if (Array.isArray(record.identities)) {
    if (
      record.identities.some((identity) =>
        TRUSTED_OAUTH_PROVIDERS.has(String(identity?.provider || '').toLowerCase()),
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this session may enter the app.
 *
 * Email/password accounts must be confirmed (Confirm Email stays ON in
 * Supabase). Google accounts count as verified because the identity provider
 * verified them — this only reads server-provided metadata, it never flips any
 * confirmation flag.
 */
export function isAccountVerified(user: User | null | undefined): boolean {
  if (!user) return false;
  return isEmailConfirmed(user) || isTrustedOAuthUser(user);
}

/** Exact origins allowed to start/return an OAuth round-trip. */
export function getAllowedAuthOrigins(): string[] {
  const configured = (import.meta.env.VITE_AUTH_ALLOWED_ORIGINS as string | undefined) || '';
  const extra = configured
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_AUTH_ORIGINS, ...extra];
}

/** True only for an exact, non-wildcard allow-listed origin. */
export function isAuthOriginAllowed(origin: string): boolean {
  return getAllowedAuthOrigins().includes(origin.replace(/\/+$/, ''));
}

/**
 * The URL Google should send the user back to.
 *
 * Returns the current page on an allow-listed origin, or null when this origin
 * must not use Google sign-in (preview deployments, unknown hosts, insecure
 * origins). No wildcard matching, no fallback to an arbitrary host.
 */
export function getOAuthRedirectUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = new URL(window.location.href);
    if (!isAuthOriginAllowed(current.origin)) return null;
    const isLocal = current.hostname === 'localhost' || current.hostname === '127.0.0.1';
    if (current.protocol !== 'https:' && !isLocal) return null;
    const path = current.pathname && current.pathname !== '' ? current.pathname : '/';
    // Query/hash are dropped on purpose: Supabase appends its own tokens there.
    return `${current.origin}${path}`;
  } catch {
    return null;
  }
}

/** Removes Supabase error parameters from the URL so a refresh is clean. */
function clearRedirectErrorParams(source: 'hash' | 'search'): void {
  try {
    const current = new URL(window.location.href);
    if (source === 'hash') current.hash = '';
    else {
      for (const key of ['error', 'error_code', 'error_description']) {
        current.searchParams.delete(key);
      }
    }
    const cleaned = `${current.pathname}${current.search}${current.hash}`;
    window.history.replaceState(null, '', cleaned);
  } catch {
    // History API unavailable (rare) — the message is still shown once.
  }
}

/** Maps a Supabase redirect error to a friendly message. Never raw internals. */
function redirectErrorMessage(code: string, description: string): AuthRedirectNotice {
  const haystack = `${code} ${description}`.toLowerCase();
  if (
    haystack.includes('access_denied') ||
    haystack.includes('denied') ||
    haystack.includes('cancelled') ||
    haystack.includes('canceled')
  ) {
    return { message: GOOGLE_CANCELLED_MESSAGE, reason: 'google-cancelled' };
  }
  if (haystack.includes('expired') || haystack.includes('otp_expired')) {
    return { message: LINK_EXPIRED_MESSAGE, reason: 'link-expired' };
  }
  if (haystack.includes('provider') || haystack.includes('oauth')) {
    return { message: GOOGLE_UNAVAILABLE_MESSAGE, reason: 'google-unavailable' };
  }
  return { message: GOOGLE_FAILED_MESSAGE, reason: 'google-failed' };
}

/**
 * Reads (and clears) an error that Supabase appended to the URL.
 * A successful implicit-flow return carries `access_token` instead of `error`,
 * so tokens are never touched here.
 */
function readAuthRedirectError(): AuthRedirectNotice | null {
  if (typeof window === 'undefined') return null;
  try {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    if (hashParams.get('access_token') || hashParams.get('code')) return null;
    if (hashParams.has('error') || hashParams.has('error_code')) {
      const message = redirectErrorMessage(
        hashParams.get('error_code') || hashParams.get('error') || '',
        hashParams.get('error_description') || '',
      );
      clearRedirectErrorParams('hash');
      return message;
    }
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('error') || searchParams.has('error_code')) {
      const message = redirectErrorMessage(
        searchParams.get('error_code') || searchParams.get('error') || '',
        searchParams.get('error_description') || '',
      );
      clearRedirectErrorParams('search');
      return message;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Friendly message for a failed OAuth/email-link return, or null when this page
 * load is not a redirect. The error is removed from the URL at page load, so a
 * later refresh does not repeat a stale message. Reading it is side-effect free
 * and safe to repeat (the login screen may render more than once).
 */
export function getOAuthRedirectNotice(): AuthRedirectNotice | null {
  return initialRedirectError;
}

/** How long a successful provider check is trusted (ms). */
const PROVIDER_CHECK_TTL_MS = 5 * 60 * 1000;
let cachedGoogleAvailableAt = 0;

/**
 * Asks Supabase (with the public anon key) whether the Google provider is
 * enabled. This stops the user from being redirected into a raw JSON error page
 * when the dashboard is not configured yet.
 *
 * 'available' → provider enabled, 'unavailable' → provider disabled,
 * 'unknown' → could not tell (offline/slow); the caller may still try.
 */
export async function checkGoogleSignInAvailability(): Promise<
  'available' | 'unavailable' | 'unknown'
> {
  if (!url || !anonKey) return 'unavailable';
  if (cachedGoogleAvailableAt && Date.now() - cachedGoogleAvailableAt < PROVIDER_CHECK_TTL_MS) {
    return 'available';
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: anonKey, Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!response?.ok) return 'unknown';
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    if (!settings || typeof settings !== 'object' || !settings.external) return 'unknown';
    if (settings.external[GOOGLE_PROVIDER] === true) {
      cachedGoogleAvailableAt = Date.now();
      return 'available';
    }
    return 'unavailable';
  } catch {
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Starts the official Supabase Google OAuth flow (implicit flow, like the rest
 * of the app). On success the browser is redirected to Google and Supabase
 * returns the user to the allow-listed origin; `restoreAuthSession()` /
 * `onAuthChange()` then accept the session and the normal sync flow runs.
 */
export async function signInWithGoogle(): Promise<AuthActionResult> {
  if (!supabase) {
    return { ok: false, message: ACCOUNTS_UNAVAILABLE_MESSAGE, reason: 'accounts-unavailable' };
  }

  const redirectTo = getOAuthRedirectUrl();
  if (!redirectTo) {
    return { ok: false, message: GOOGLE_ORIGIN_MESSAGE, reason: 'google-origin' };
  }

  const availability = await checkGoogleSignInAvailability();
  if (availability === 'unavailable') {
    return { ok: false, message: GOOGLE_UNAVAILABLE_MESSAGE, reason: 'google-unavailable' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: GOOGLE_PROVIDER,
      options: {
        redirectTo,
        scopes: GOOGLE_OAUTH_SCOPES,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      return { ok: false, message: friendlyAuthError(error), reason: 'google-failed' };
    }
    if (!data?.url) return { ok: false, message: GOOGLE_FAILED_MESSAGE, reason: 'google-failed' };
    return { ok: true, message: GOOGLE_REDIRECTING_MESSAGE, redirecting: true };
  } catch {
    return {
      ok: false,
      message: 'Connection problem. Please check your internet and try again.',
      reason: 'google-offline',
    };
  }
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
  // OAuth/provider problems: e.g. provider not enabled, consent cancelled.
  if (
    msg.includes('provider is not enabled') ||
    msg.includes('unsupported provider') ||
    msg.includes('provider is disabled') ||
    msg.includes('oauth')
  ) {
    return msg.includes('access_denied') || msg.includes('denied')
      ? GOOGLE_CANCELLED_MESSAGE
      : GOOGLE_UNAVAILABLE_MESSAGE;
  }
  if (
    msg.includes('access_denied') ||
    msg.includes('user denied') ||
    msg.includes('cancelled') ||
    msg.includes('canceled')
  ) {
    return GOOGLE_CANCELLED_MESSAGE;
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
async function acceptAuthenticatedUser(user: User, cleanEmail: string): Promise<AuthActionResult> {
  // Some Supabase projects return a user object before confirmation. Never treat
  // an unconfirmed email/password user as signed-in — that is the "random email
  // works" loophole when combined with confusing client state. Google accounts
  // are accepted because Google already verified that address.
  if (!isAccountVerified(user)) {
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

  // Product switch: new password accounts stay closed until reliable email
  // delivery exists. Nothing is sent to Supabase, so no half-created account
  // can be left behind waiting for a confirmation email that never arrives.
  if (!isEmailSignupEnabled) {
    return { ok: false, message: EMAIL_SIGNUP_PAUSED_MESSAGE };
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
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : undefined;
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

  // `getUser()` is network-backed. Capture the revision before awaiting it so
  // a sign-in/sign-out that happens while the request is in flight wins.
  const revisionAtRequestStart = authStateRevision;
  try {
    const { data, error } = await supabase.auth.getUser();

    // Do not let a response for an earlier session overwrite newer auth state.
    // This is especially important on first load: a person can sign in before
    // the initial anonymous restore request finishes.
    if (revisionAtRequestStart !== authStateRevision) return currentUser();

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
    if (!isAccountVerified(data.user)) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      // A real auth event could have occurred while the best-effort sign-out
      // awaited. Respect that newer state rather than clearing it again.
      if (revisionAtRequestStart !== authStateRevision) return currentUser();
      rememberUser(null);
      return null;
    }
    rememberUser(data.user);
    return data.user;
  } catch (err) {
    if (revisionAtRequestStart !== authStateRevision) return currentUser();
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
    if (user && !isAccountVerified(user)) {
      rememberUser(null);
      callback(null);
      return;
    }
    rememberUser(user);
    callback(user);
  });
  return () => data.subscription.unsubscribe();
}
