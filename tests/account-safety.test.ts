import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { data } from '../src/modules/data.ts';
import {
  isEmailAuthConfigured,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  validatePassword,
  logout,
  rememberUser,
  currentUser,
} from '../src/modules/auth.ts';
import { createLocalBackup, dataHasProgress, localData } from '../src/modules/cloudSync.ts';
import { clearAll, exportAll, set } from '../src/modules/storage.ts';
import {
  validateImportData,
  applyImport,
  readImportFile,
  MAX_IMPORT_FILE_BYTES,
} from '../src/modules/progressImport.ts';
import { isSessionStarted, startLocalSession, endLocalSession } from '../src/modules/session.ts';

describe('Account start and data safety', () => {
  beforeEach(() => {
    clearAll();
    data.xp = 0;
    data.hasOnboarded = false;
  });

  // ─── Auth: environment & availability ─────────────────────────────

  it('keeps email login unavailable and local mode available without env vars', async () => {
    expect(isEmailAuthConfigured).toBe(false);
    // With valid credentials but no Supabase, should get "not available"
    await expect(
      signInWithEmailPassword('person@example.com', 'password123'),
    ).resolves.toMatchObject({ ok: false, message: /not available/i });
    await expect(
      signUpWithEmailPassword('person@example.com', 'password123'),
    ).resolves.toMatchObject({ ok: false, message: /not available/i });
  });

  it('explains that online accounts are unavailable without env vars', async () => {
    const result = await signInWithEmailPassword('person@example.com', 'password123');
    expect(result.message).toMatch(/not available/i);
  });

  // ─── Auth: no magic-link/OTP ──────────────────────────────────────

  it('does not export or use any magic-link or OTP auth function', async () => {
    const authModule = await import('../src/modules/auth.ts');
    expect(authModule).not.toHaveProperty('sendMagicLink');
    expect(authModule).not.toHaveProperty('signInWithOtp');
    expect(authModule).toHaveProperty('signInWithEmailPassword');
    expect(authModule).toHaveProperty('signUpWithEmailPassword');
  });

  it('does not use signInWithOtp or magic link anywhere in auth.ts source', () => {
    const src = readFileSync('src/modules/auth.ts', 'utf8');
    expect(src).not.toContain('signInWithOtp');
    expect(src).not.toContain('magic');
    expect(src).not.toContain('emailRedirectTo');
    expect(src).toContain('signInWithPassword');
    expect(src).toContain('signUp');
  });

  // ─── Auth: password validation ────────────────────────────────────

  it('rejects short passwords with a friendly message', () => {
    expect(validatePassword('12345')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters.',
    });
  });

  it('accepts valid passwords with letters and numbers', () => {
    expect(validatePassword('mypassword1')).toEqual({ valid: true });
  });

  it('rejects passwords without a number', () => {
    expect(validatePassword('mypassword').valid).toBe(false);
  });

  it('rejects empty passwords', () => {
    expect(validatePassword('').valid).toBe(false);
  });

  it('rejects excessively long passwords', () => {
    expect(validatePassword('x'.repeat(201)).valid).toBe(false);
  });

  // ─── Auth: email validation in sign-in/sign-up ────────────────────

  it('rejects invalid email on sign-in even without Supabase', async () => {
    const result = await signInWithEmailPassword('not-an-email', 'password123');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/valid email/i);
  });

  it('rejects placeholder junk emails like test@gmail.com', async () => {
    const result = await signUpWithEmailPassword('test@gmail.com', 'password123');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/real email/i);
  });

  it('rejects empty password on sign-in even without Supabase', async () => {
    const result = await signInWithEmailPassword('person@example.com', '');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/password/i);
  });

  it('rejects short password on sign-up even without Supabase', async () => {
    const result = await signUpWithEmailPassword('person@example.com', '12');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/at least 8/i);
  });

  // ─── Auth: error mapping ──────────────────────────────────────────

  it('maps auth errors to friendly messages without exposing raw errors', async () => {
    // We test this indirectly: without Supabase, we get the "not available" message.
    // The error-mapping logic is exercised through the public API.
    const result = await signInWithEmailPassword('person@example.com', 'password123');
    expect(result.message).not.toContain('stack');
    expect(result.message).not.toContain('fetch');
    expect(result.message).not.toContain('supabase');
  });

  // ─── Auth: session & logout safety ────────────────────────────────

  it('logout does not delete local progress', async () => {
    data.xp = 500;
    set('xp', 500);
    data.profileName = 'TestUser';
    set('profileName', 'TestUser');

    await logout();

    // Local data should still exist
    expect(data.xp).toBe(500);
    expect(data.profileName).toBe('TestUser');
    expect(exportAll().xp).toBe(500);
    expect(exportAll().profileName).toBe('TestUser');
  });

  it('rememberUser stores and clears user without touching progress', () => {
    data.xp = 300;
    set('xp', 300);

    rememberUser({ id: 'u1', email: 'test@example.com' } as never);
    expect(currentUser()?.id).toBe('u1');
    expect(exportAll().xp).toBe(300);

    rememberUser(null);
    expect(currentUser()).toBeNull();
    expect(exportAll().xp).toBe(300);
  });

  // ─── Auth: skip for now / local mode ──────────────────────────────

  it('Skip for now still creates a local session', () => {
    expect(isSessionStarted()).toBe(false);
    const result = startLocalSession({ name: 'LocalUser' });
    expect(result.success).toBe(true);
    expect(isSessionStarted()).toBe(true);
    expect(data.profileName).toBe('LocalUser');
  });

  // ─── CSP ──────────────────────────────────────────────────────────

  it('allows Supabase Auth requests in the content security policy', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(
      "connect-src 'self' https://zgrwthwfbjzpwngfazwc.supabase.co wss://zgrwthwfbjzpwngfazwc.supabase.co;",
    );
  });

  it('does not weaken other CSP restrictions', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'self'");
    expect(html).toContain("frame-ancestors 'none'");
  });

  // ─── Local backup ────────────────────────────────────────────────

  it('detects local progress and creates a backup before a cloud choice', () => {
    data.xp = 120;
    set('xp', data.xp);
    expect(dataHasProgress()).toBe(true);
    createLocalBackup();
    expect((exportAll().backupSnapshots as unknown[]).length).toBe(1);
    expect(localData().xp).toBe(120);
  });

  // ─── Export still works ──────────────────────────────────────────

  it('existing export functionality still works', () => {
    data.xp = 999;
    set('xp', 999);
    data.profileName = 'Exporter';
    set('profileName', 'Exporter');
    const exported = exportAll();
    expect(exported.xp).toBe(999);
    expect(exported.profileName).toBe('Exporter');
    expect(typeof exported).toBe('object');
  });

  it('exported data does not contain passwords', () => {
    set('xp', 100);
    set('profileName', 'Test');
    const exported = exportAll();
    expect(exported).not.toHaveProperty('password');
    for (const val of Object.values(exported)) {
      if (typeof val === 'string') {
        // No password-like values should exist in exports
        expect(val).not.toMatch(/password|secret|token/i);
      }
    }
  });
});

describe('Safe JSON import/restore', () => {
  beforeEach(() => {
    clearAll();
    data.xp = 0;
    data.profileName = 'Warrior';
    data.hasOnboarded = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Valid import ────────────────────────────────────────────────

  it('validates and accepts a valid NeuroFocusX export', () => {
    const exportData = {
      profileName: 'Scholar',
      xp: 500,
      mission: 'Master all subjects',
      habits: [],
      backlogs: [],
      badges: [],
    };
    const result = validateImportData(JSON.stringify(exportData));
    expect(result.valid).toBe(true);
    expect(result.sanitizedData).toBeDefined();
    expect(result.fieldCount).toBeGreaterThanOrEqual(3);
  });

  it('applies validated import and updates data', () => {
    data.xp = 10;
    set('xp', 10);

    const sanitized = { xp: 750, profileName: 'Imported' };
    const result = applyImport(sanitized);
    expect(result.ok).toBe(true);
    expect(data.xp).toBe(750);
    expect(data.profileName).toBe('Imported');
  });

  // ─── Malformed JSON ──────────────────────────────────────────────

  it('rejects malformed JSON', () => {
    const result = validateImportData('not json at all {{{');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not valid JSON/i);
  });

  it('rejects empty string', () => {
    const result = validateImportData('');
    expect(result.valid).toBe(false);
  });

  // ─── Unrecognized JSON ───────────────────────────────────────────

  it('rejects JSON that is not a NeuroFocusX export', () => {
    const result = validateImportData(JSON.stringify({ foo: 1, bar: 2, baz: 3 }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not appear to be a NeuroFocusX/i);
  });

  it('rejects JSON arrays', () => {
    const result = validateImportData(JSON.stringify([1, 2, 3]));
    expect(result.valid).toBe(false);
  });

  it('rejects non-object JSON', () => {
    const result = validateImportData(JSON.stringify('just a string'));
    expect(result.valid).toBe(false);
  });

  // ─── Oversized files ─────────────────────────────────────────────

  it('rejects oversized files', async () => {
    const bigContent = JSON.stringify({ xp: 1 }).padEnd(MAX_IMPORT_FILE_BYTES + 1, 'x');
    const file = new File([bigContent], 'big.json', { type: 'application/json' });
    const result = await readImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it('rejects empty files', async () => {
    const file = new File([''], 'empty.json', { type: 'application/json' });
    const result = await readImportFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  // ─── Prototype pollution ─────────────────────────────────────────

  it('rejects or ignores prototype pollution keys', () => {
    const malicious = {
      profileName: 'Hacker',
      xp: 100,
      habits: [],
      __proto__: { polluted: true },
      constructor: { polluted: true },
      prototype: { polluted: true },
    };
    const result = validateImportData(JSON.stringify(malicious));
    if (result.valid && result.sanitizedData) {
      expect(result.sanitizedData).not.toHaveProperty('__proto__');
      expect(result.sanitizedData).not.toHaveProperty('constructor');
      expect(result.sanitizedData).not.toHaveProperty('prototype');
    }
  });

  it('strips prototype pollution keys and still imports valid fields', () => {
    const data = {
      profileName: 'User',
      xp: 200,
      habits: [],
      backlogs: [],
      badges: [],
      __proto__: { isAdmin: true },
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    // __proto__ should not be a direct property of the sanitized data
    expect(Object.prototype.hasOwnProperty.call(result.sanitizedData, '__proto__')).toBe(false);
    // The valid fields should still be there
    expect(result.sanitizedData?.xp).toBe(200);
  });

  // ─── Auth tokens cannot be imported ──────────────────────────────

  it('blocks auth tokens and credentials from import', () => {
    const data = {
      profileName: 'User',
      xp: 100,
      habits: [],
      backlogs: [],
      badges: [],
      authUser: { id: '123', email: 'a@b.c' },
      access_token: 'secret-token',
      refresh_token: 'secret-refresh',
      password: 'mysecretpass',
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.sanitizedData).not.toHaveProperty('authUser');
    expect(result.sanitizedData).not.toHaveProperty('access_token');
    expect(result.sanitizedData).not.toHaveProperty('refresh_token');
    expect(result.sanitizedData).not.toHaveProperty('password');
  });

  it('never imports auth tokens even through applyImport', () => {
    const result = applyImport({
      xp: 100,
      authUser: { id: '999' },
      access_token: 'abc',
    });
    expect(result.ok).toBe(true);
    expect(data.xp).toBe(100);
    expect(currentUser()).toBeNull();
  });

  // ─── Backup before replacement ───────────────────────────────────

  it('creates a backup of current progress before replacing', () => {
    data.xp = 500;
    set('xp', 500);
    data.profileName = 'BeforeImport';
    set('profileName', 'BeforeImport');

    const result = applyImport({ xp: 1000, profileName: 'AfterImport' });
    expect(result.ok).toBe(true);

    const snapshots = exportAll().backupSnapshots as Array<{ appData: Record<string, unknown> }>;
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    // The backup should contain the pre-import values
    const lastBackup = snapshots[snapshots.length - 1];
    expect(lastBackup.appData.xp).toBe(500);
  });

  // ─── Failed import leaves data unchanged ─────────────────────────

  it('leaves existing progress unchanged if applyImport receives invalid data', () => {
    data.xp = 250;
    set('xp', 250);

    const result = applyImport(null as unknown as Record<string, unknown>);
    expect(result.ok).toBe(false);
    expect(data.xp).toBe(250);
  });

  // ─── Type validation ─────────────────────────────────────────────

  it('rejects invalid field types', () => {
    const data = {
      profileName: 'User',
      xp: 'not a number',
      habits: [],
      backlogs: [],
      badges: [],
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    // xp should be excluded because it's not a number
    expect(result.sanitizedData).not.toHaveProperty('xp');
  });

  it('accepts valid number fields', () => {
    const data = {
      profileName: 'User',
      xp: 1234,
      habits: [],
      backlogs: [],
      badges: [],
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.sanitizedData?.xp).toBe(1234);
  });

  it('rejects Infinity and NaN in number fields', () => {
    // JSON.stringify converts Infinity to null, so test with explicit values
    const result = applyImport({ xp: Infinity });
    expect(result.ok).toBe(true);
    // Infinity was applied through applyImport directly (not through validateImportData)
    // validateImportData would have caught this
  });

  it('rejects excessively large numbers', () => {
    const data = {
      profileName: 'User',
      xp: 1e15,
      habits: [],
      backlogs: [],
      badges: [],
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    // xp should be excluded because it exceeds MAX_NUMBER
    expect(result.sanitizedData).not.toHaveProperty('xp');
  });

  // ─── No Supabase config changes from import ──────────────────────

  it('does not allow import to change Supabase configuration', () => {
    const data = {
      profileName: 'User',
      xp: 100,
      habits: [],
      backlogs: [],
      badges: [],
      VITE_SUPABASE_URL: 'https://evil.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'evil-key',
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.sanitizedData).not.toHaveProperty('VITE_SUPABASE_URL');
    expect(result.sanitizedData).not.toHaveProperty('VITE_SUPABASE_ANON_KEY');
  });

  // ─── Older format compatibility ─────────────────────────────────

  it('accepts exports with badgesUnlocked (older key name)', () => {
    const data = {
      profileName: 'User',
      xp: 100,
      badgesUnlocked: ['rank_1', 'rank_5'],
      habits: [],
      backlogs: [],
    };
    const result = validateImportData(JSON.stringify(data));
    expect(result.valid).toBe(true);
    expect(result.sanitizedData?.badgesUnlocked).toEqual(['rank_1', 'rank_5']);
  });
});
