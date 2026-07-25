import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const listeners: Array<(event: string, session: unknown) => void> = [];
  const fakeUser = { id: 'u1', email: 'person@example.com' } as never;
  const fakeSession = { user: fakeUser, access_token: 'tok' } as never;
  const fire = (event: string, session: unknown) => {
    for (const cb of [...listeners]) cb(event, session);
  };
  const fakeSupabase = {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
      signInWithPassword: vi.fn(async (creds: { email: string; password: string }) => {
        if (creds.password === 'wrong')
          return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
        fire('SIGNED_IN', fakeSession);
        return { data: { user: fakeUser, session: fakeSession }, error: null };
      }),
      signUp: vi.fn(async (creds: { email: string; password: string }) => {
        if (creds.password.length < 6)
          return {
            data: null,
            error: { message: 'Password should be at least 6 characters', status: 400 },
          };
        fire('SIGNED_IN', fakeSession);
        return { data: { user: fakeUser, session: fakeSession }, error: null };
      }),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => {
        fire('SIGNED_OUT', null);
        return { error: null };
      }),
    },
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    })),
  };
  return { listeners, fakeSupabase };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => hoisted.fakeSupabase) }));

vi.stubEnv('VITE_SUPABASE_URL', 'https://zgrwthwfbjzpwngfazwc.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');

const html = readFileSync('index.html', 'utf8');
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const body = bodyMatch ? bodyMatch[1] : '';

// jsdom lacks File.prototype.text(); provide it so the import path can be exercised.
beforeEach(() => {
  const proto = File.prototype as unknown as {
    text: (this: File) => Promise<string>;
  };
  if (typeof proto.text !== 'function') {
    proto.text = function (this: File) {
      return Promise.resolve((this as unknown as { __text?: string }).__text ?? '');
    };
  }
});

async function loadApp(): Promise<void> {
  (window as unknown as { scrollTo: unknown }).scrollTo = () => undefined;
  await import('../src/main.ts');
}

const overlayVisible = () => {
  const o = document.querySelector<HTMLElement>('#login-overlay')!;
  return !o.classList.contains('hidden') && o.classList.contains('show');
};

describe('Production auth/import flows', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = body;
    localStorage.clear();
    hoisted.listeners.length = 0;
    vi.clearAllMocks();
    window.confirm = () => true;
  });

  it('Bug 1: settings-login-btn reveals the login overlay WITH the email form (returning local user)', async () => {
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
    await loadApp();
    const emailForm = document.querySelector<HTMLElement>('#email-login-form')!;

    document.querySelector<HTMLElement>('#settings-btn')?.click();
    document.querySelector<HTMLElement>('#settings-login-btn')?.click();

    expect(overlayVisible()).toBe(true);
    expect(emailForm.classList.contains('hidden')).toBe(false);
  });

  it('continue locally starts a session and hides the overlay', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#skip-login-btn')?.click();
    const name = document.querySelector<HTMLInputElement>('#login-name')!;
    name.value = 'Aarav';
    document.querySelector<HTMLElement>('#login-continue-btn')?.click();
    expect(overlayVisible()).toBe(false);
  });

  it('successful sign-in hides the login overlay', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#email-login-btn')?.click();
    const email = document.querySelector<HTMLInputElement>('#login-email')!;
    const pw = document.querySelector<HTMLInputElement>('#login-password')!;
    email.value = 'person@example.com';
    pw.value = 'password123';
    document.querySelector<HTMLElement>('#send-login-btn')?.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(overlayVisible()).toBe(false);
  });

  it('logout returns to the login overlay', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#email-login-btn')?.click();
    const email = document.querySelector<HTMLInputElement>('#login-email')!;
    const pw = document.querySelector<HTMLInputElement>('#login-password')!;
    email.value = 'person@example.com';
    pw.value = 'password123';
    document.querySelector<HTMLElement>('#send-login-btn')?.click();
    await new Promise((r) => setTimeout(r, 50));
    document.querySelector<HTMLElement>('#logout-btn')?.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(overlayVisible()).toBe(true);
  });

  it('importing a backup applies the data and updates the dashboard', async () => {
    // Provide file contents for the jsdom File.text shim
    const exportObj = {
      profileName: 'Importer',
      xp: 500,
      badgesUnlocked: ['rank_1', 'first_focus'],
      habits: [],
      backlogs: [],
      battle: [],
      hasOnboarded: true,
    };
    const json = JSON.stringify(exportObj);
    const file = new File([json], 'backup.json', { type: 'application/json' });
    (file as unknown as { __text: string }).__text = json;

    await loadApp();
    const input = document.querySelector<HTMLInputElement>('#import-file-input')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 60));

    const msg = document.querySelector<HTMLElement>('#import-message')?.textContent || '';
    expect(msg).toContain('restored');
    const xpText = document.querySelector<HTMLElement>('#xp-count')?.textContent || '';
    expect(xpText).toContain('500');
  });
});
