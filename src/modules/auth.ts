import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { get, set } from './storage.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isEmailAuthConfigured = Boolean(url && anonKey);
export const supabase: SupabaseClient | null = isEmailAuthConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

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

export async function sendMagicLink(email: string): Promise<{ ok: boolean; message: string }> {
  if (!supabase)
    return {
      ok: false,
      message: 'Email login is not available right now. You can continue locally.',
    };
  const clean = email.trim();
  if (!/^\S+@\S+\.\S+$/.test(clean)) return { ok: false, message: 'Enter a valid email address.' };
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  return error
    ? { ok: false, message: 'We could not send that email. Please try again.' }
    : { ok: true, message: 'Check your inbox for a secure sign-in link.' };
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
