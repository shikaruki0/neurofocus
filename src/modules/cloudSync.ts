import { currentUser, supabase } from './auth.ts';
import { exportAll, importAll, set } from './storage.ts';
import { data } from './data.ts';

export type SyncChoice = 'local' | 'cloud' | 'merge';
export interface CloudState {
  app_data: Record<string, unknown>;
  updated_at: string;
}
export interface SyncResult {
  kind: 'uploaded' | 'restored' | 'conflict' | 'merged' | 'offline';
  cloud?: CloudState;
}

const META_KEYS = new Set(['authUser', 'backupSnapshots']);
function appSnapshot(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(exportAll()).filter(([key]) => !META_KEYS.has(key)));
}
function hasProgress(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(
    ([key, item]) =>
      key !== 'hasOnboarded' &&
      item !== null &&
      item !== '' &&
      (!Array.isArray(item) || item.length > 0) &&
      !(typeof item === 'number' && item === 0),
  );
}
function backup(): void {
  const snapshots = (exportAll().backupSnapshots as unknown[] | undefined) ?? [];
  snapshots.push({ createdAt: new Date().toISOString(), appData: appSnapshot() });
  set('backupSnapshots', snapshots.slice(-5));
}

export function createLocalBackup(): void {
  backup();
}
export function localData(): Record<string, unknown> {
  return appSnapshot();
}
export function dataHasProgress(value = appSnapshot()): boolean {
  return hasProgress(value);
}
function restoreApp(value: Record<string, unknown>): void {
  importAll(value);
  for (const key of Object.keys(data) as Array<keyof typeof data>) {
    if (key in value) (data[key] as unknown) = value[key];
  }
}

async function readCloud(userId: string): Promise<CloudState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_states')
    .select('app_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudState | null;
}
async function writeCloud(userId: string, appData: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase
    .from('user_states')
    .upsert({ user_id: userId, app_data: appData, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function syncOnLogin(choice?: SyncChoice): Promise<SyncResult> {
  const user = currentUser();
  if (!user || !supabase) return { kind: 'offline' };
  const local = appSnapshot();
  const cloud = await readCloud(user.id);
  const localExists = hasProgress(local);
  const cloudExists = Boolean(cloud && hasProgress(cloud.app_data));
  if (!cloudExists) {
    await writeCloud(user.id, local);
    return { kind: 'uploaded' };
  }
  if (!localExists) {
    restoreApp(cloud!.app_data);
    return { kind: 'restored', cloud: cloud! };
  }
  if (!choice) return { kind: 'conflict', cloud: cloud! };
  backup();
  if (choice === 'local') {
    await writeCloud(user.id, local);
    return { kind: 'uploaded', cloud: cloud! };
  }
  if (choice === 'cloud') {
    restoreApp(cloud!.app_data);
    return { kind: 'restored', cloud: cloud! };
  }
  // Merge is intentionally conservative: local keys win, cloud-only keys are restored.
  restoreApp({ ...cloud!.app_data, ...local });
  await writeCloud(user.id, appSnapshot());
  return { kind: 'merged', cloud: cloud! };
}

export async function syncNow(): Promise<SyncResult> {
  return syncOnLogin('merge');
}
