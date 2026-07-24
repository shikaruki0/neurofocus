import { beforeEach, describe, expect, it } from 'vitest';
import { data } from '../src/modules/data.ts';
import { isEmailAuthConfigured, sendMagicLink } from '../src/modules/auth.ts';
import { createLocalBackup, dataHasProgress, localData } from '../src/modules/cloudSync.ts';
import { clearAll, exportAll, set } from '../src/modules/storage.ts';

describe('Account start and data safety', () => {
  beforeEach(() => {
    clearAll();
    data.xp = 0;
    data.hasOnboarded = false;
  });

  it('keeps email login unavailable and local mode available without env vars', async () => {
    expect(isEmailAuthConfigured).toBe(false);
    await expect(sendMagicLink('person@example.com')).resolves.toMatchObject({ ok: false });
  });

  it('detects local progress and creates a backup before a cloud choice', () => {
    data.xp = 120;
    set('xp', data.xp);
    expect(dataHasProgress()).toBe(true);
    createLocalBackup();
    expect((exportAll().backupSnapshots as unknown[]).length).toBe(1);
    expect(localData().xp).toBe(120);
  });
});
