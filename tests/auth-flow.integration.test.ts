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
        if (creds.password === 'wrong' || creds.password === 'unconfirmed')
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
      resend: vi.fn(async () => ({ data: {}, error: null })),
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

  it('presents sign-in, account creation, and device-only use as distinct choices', async () => {
    await loadApp();

    const signIn = document.querySelector<HTMLButtonElement>('#email-login-btn')!;
    const createAccount = document.querySelector<HTMLButtonElement>('#create-account-btn')!;
    const deviceOnly = document.querySelector<HTMLButtonElement>('#skip-login-btn')!;
    const choice = document.querySelector<HTMLElement>('#login-choice')!;

    expect(signIn.textContent?.trim()).toBe('Sign in');
    expect(createAccount.textContent?.trim()).toBe('Create free account');
    expect(deviceOnly.textContent).toContain('Continue without an account');
    expect(choice.textContent).toContain('will not sync to other devices');
    expect(document.querySelector('#app-header')?.hasAttribute('inert')).toBe(true);
  });

  it('opens account creation with matching guidance and lets users switch modes', async () => {
    await loadApp();
    document.querySelector<HTMLButtonElement>('#create-account-btn')?.click();

    const title = document.querySelector<HTMLElement>('#login-title')!;
    const password = document.querySelector<HTMLInputElement>('#login-password')!;
    const passwordHint = document.querySelector<HTMLElement>('#password-hint')!;
    const signInMode = document.querySelector<HTMLButtonElement>('#auth-tab-signin')!;
    const signUpMode = document.querySelector<HTMLButtonElement>('#auth-tab-signup')!;
    const submit = document.querySelector<HTMLButtonElement>('#send-login-btn')!;

    expect(title.textContent).toBe('Create your account');
    expect(signUpMode.getAttribute('aria-pressed')).toBe('true');
    expect(signInMode.getAttribute('aria-pressed')).toBe('false');
    expect(password.autocomplete).toBe('new-password');
    expect(passwordHint.classList.contains('hidden')).toBe(false);
    expect(submit.textContent?.trim()).toBe('Create account');

    signInMode.click();
    expect(title.textContent).toBe('Welcome back');
    expect(signInMode.getAttribute('aria-pressed')).toBe('true');
    expect(password.autocomplete).toBe('current-password');
    expect(passwordHint.classList.contains('hidden')).toBe(true);
    expect(submit.textContent?.trim()).toBe('Sign in');
  });

  it('shows validation next to the form and clears it when the user edits the field', async () => {
    await loadApp();
    document.querySelector<HTMLButtonElement>('#email-login-btn')?.click();

    const email = document.querySelector<HTMLInputElement>('#login-email')!;
    const message = document.querySelector<HTMLElement>('#login-message')!;
    document.querySelector<HTMLButtonElement>('#send-login-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(message.textContent).toMatch(/valid email/i);
    expect(message.dataset.tone).toBe('error');
    expect(email.getAttribute('aria-invalid')).toBe('true');

    email.value = 'person@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    expect(message.textContent).toBe('');
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps local-name errors in context instead of opening a separate alert', async () => {
    await loadApp();
    // Brand-new visitors first see the welcome screen; "Get started" reveals the account start.
    document.querySelector<HTMLElement>('#welcome-cta-btn')?.click();
    document.querySelector<HTMLButtonElement>('#skip-login-btn')?.click();

    const form = document.querySelector<HTMLFormElement>('#local-login-form')!;
    const name = document.querySelector<HTMLInputElement>('#login-name')!;
    const message = document.querySelector<HTMLElement>('#local-login-message')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(overlayVisible()).toBe(true);
    expect(message.textContent).toMatch(/name cannot be empty/i);
    expect(message.dataset.tone).toBe('error');
    expect(name.getAttribute('aria-invalid')).toBe('true');
  });

  it('Bug 3: settings-login-btn reveals the login overlay WITH the email form (returning local user)', async () => {
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
    await loadApp();
    const emailForm = document.querySelector<HTMLElement>('#email-login-form')!;
    const choice = document.querySelector<HTMLElement>('#login-choice')!;
    const email = document.querySelector<HTMLInputElement>('#login-email')!;

    document.querySelector<HTMLElement>('#settings-btn')?.click();
    document.querySelector<HTMLElement>('#settings-login-btn')?.click();

    expect(overlayVisible()).toBe(true);
    expect(emailForm.classList.contains('hidden')).toBe(false);
    expect(choice.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(email);
  });

  it('surfaces unconfirmed email sign-in failures and resends confirmation email', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#email-login-btn')?.click();
    const email = document.querySelector<HTMLInputElement>('#login-email')!;
    const pw = document.querySelector<HTMLInputElement>('#login-password')!;
    const msg = document.querySelector<HTMLElement>('#login-message')!;
    const resend = document.querySelector<HTMLButtonElement>('#resend-confirmation-btn')!;
    email.value = 'person@example.com';
    pw.value = 'unconfirmed';

    document.querySelector<HTMLElement>('#send-login-btn')?.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(msg.textContent).toMatch(/email not confirmed/i);
    expect(resend.classList.contains('hidden')).toBe(false);

    resend.click();
    await new Promise((r) => setTimeout(r, 50));

    expect(hoisted.fakeSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'person@example.com',
    });
    expect(msg.textContent).toMatch(/confirmation email sent/i);
  });

  it('toggles password visibility for the email/password form', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#email-login-btn')?.click();
    const pw = document.querySelector<HTMLInputElement>('#login-password')!;
    const toggle = document.querySelector<HTMLButtonElement>('#toggle-login-password')!;

    expect(pw.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');

    toggle.click();
    expect(pw.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');

    toggle.click();
    expect(pw.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
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
});

describe('First-run onboarding flow', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = body;
    localStorage.clear();
    hoisted.listeners.length = 0;
    vi.clearAllMocks();
    window.confirm = () => true;
  });

  const welcomeVisible = () => {
    const overlay = document.querySelector<HTMLElement>('#welcome-overlay')!;
    return !overlay.classList.contains('hidden') && overlay.classList.contains('show');
  };

  const languageVisible = () => {
    const overlay = document.querySelector<HTMLElement>('#language-overlay')!;
    return !overlay.classList.contains('hidden') && overlay.classList.contains('show');
  };

  it('explains the app before asking for anything (welcome first, login behind)', async () => {
    await loadApp();
    expect(welcomeVisible()).toBe(true);
    expect(overlayVisible()).toBe(false);
    expect(document.querySelector('#welcome-title')?.textContent).toContain('game');
    expect(document.querySelector('#app-header')?.hasAttribute('inert')).toBe(true);
  });

  it('welcome CTA marks it seen and reveals the account start', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#welcome-cta-btn')?.click();
    expect(welcomeVisible()).toBe(false);
    expect(overlayVisible()).toBe(true);
    expect(JSON.parse(localStorage.getItem('nf_welcomeSeen') || 'false')).toBe(true);
  });

  it('never shows the welcome screen to users who already have a session', async () => {
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    await loadApp();
    expect(welcomeVisible()).toBe(false);
    expect(overlayVisible()).toBe(false);
  });

  it('offers the language picker after a local start, with Hinglish pinned on top', async () => {
    await loadApp();
    document.querySelector<HTMLElement>('#welcome-cta-btn')?.click();
    document.querySelector<HTMLElement>('#skip-login-btn')?.click();
    const name = document.querySelector<HTMLInputElement>('#login-name')!;
    name.value = 'Aarav';
    document.querySelector<HTMLElement>('#login-continue-btn')?.click();

    expect(languageVisible()).toBe(true);
    const options = document.querySelectorAll<HTMLElement>('.language-option');
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options[0].dataset.locale).toBe('hi-Latn');
    expect(options[0].querySelector('.language-badge')).toBeTruthy();

    // Choosing Hinglish and continuing translates the whole app immediately.
    options[0].click();
    document.querySelector<HTMLElement>('#language-continue-btn')?.click();
    expect(languageVisible()).toBe(false);
    expect(JSON.parse(localStorage.getItem('nf_locale') || '""')).toBe('hi-Latn');
    expect(JSON.parse(localStorage.getItem('nf_languageChosen') || 'false')).toBe(true);
    expect(document.documentElement.getAttribute('lang')).toBe('hi-Latn');
    expect(document.querySelector('[data-i18n="settings.save"]')?.textContent?.trim()).toBe(
      'Save karo',
    );
  });

  it('does not offer the language picker again once a language was chosen', async () => {
    localStorage.setItem('nf_languageChosen', JSON.stringify(true));
    await loadApp();
    document.querySelector<HTMLElement>('#welcome-cta-btn')?.click();
    document.querySelector<HTMLElement>('#skip-login-btn')?.click();
    const name = document.querySelector<HTMLInputElement>('#login-name')!;
    name.value = 'Aarav';
    document.querySelector<HTMLElement>('#login-continue-btn')?.click();
    expect(languageVisible()).toBe(false);
  });

  it('lets users switch language anytime from Settings, applied instantly', async () => {
    localStorage.setItem('nf_hasOnboarded', JSON.stringify(true));
    localStorage.setItem('nf_profileName', JSON.stringify('Aarav'));
    await loadApp();
    const hindi = document.querySelector<HTMLElement>(
      '#settings-language-list [data-locale="hi"]',
    )!;
    hindi.click();
    expect(JSON.parse(localStorage.getItem('nf_locale') || '""')).toBe('hi');
    expect(document.documentElement.getAttribute('lang')).toBe('hi');
    expect(document.querySelector('[data-i18n="nav.focus"]')?.textContent?.trim()).toBe('फ़ोकस');
    // The switcher highlights the active language.
    expect(
      document
        .querySelector('#settings-language-list [data-locale="hi"]')
        ?.classList.contains('selected'),
    ).toBe(true);
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
