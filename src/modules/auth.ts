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
function validateEmail(email: string): { valid: boolean; error?: string } {
  const clean = (email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(clean)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }
  return { valid: true };
}

/**
 * Maps Supabase auth errors to friendly user-facing messages.
 * Never exposes raw error details.
 */
function friendlyAuthError(err: { message?: string; status?: number } | null): string {
  if (!err) return 'Something went wrong. Please try again.';
  const msg = (err.message || '').toLowerCase();
  const status = err.status || 0;

  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'The email or password is incorrect. Please try again.';
  }
  if (msg.includes('user already registered') || msg.includes('already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (
    msg.includes('password should be at least') ||
    msg.includes('password is too weak') ||
    msg.includes('password')
  ) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (msg.includes('email not confirmed')) {
    return 'Please check your email or try again.';
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('connection') ||
    msg.includes('failed to fetch')
  ) {
    return 'Connection problem. Please check your internet and try again.';
  }
  if (msg.includes('email')) {
    return 'Enter a valid email address.';
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Create a new account with email and password.
 * Because Confirm Email is OFF, a usable session is returned immediately.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  const pwCheck = validatePassword(password);
  if (!pwCheck.valid) return { ok: false, message: pwCheck.error! };

  if (!supabase) {
    return {
      ok: false,
      message: 'Online accounts are not available right now. You can continue locally.',
    };
  }

  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, message: friendlyAuthError(error) };
  return { ok: true, message: 'Account created! You are signed in.' };
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error! };
  if (!password || typeof password !== 'string') {
    return { ok: false, message: 'Enter your password.' };
  }

  if (!supabase) {
    return {
      ok: false,
      message: 'Online accounts are not available right now. You can continue locally.',
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, message: friendlyAuthError(error) };
  return { ok: true, message: 'Signed in successfully.' };
}

export async function restoreAuthSession(): Promise<User | null> {
  if (!supabase) return currentUser();
  const { data } = await supabase.auth.getUser();
  rememberUser(data.user);
  return data.user;
}

export async function logout(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
  rememberUser(null);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    rememberUser(session?.user ?? null);
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
