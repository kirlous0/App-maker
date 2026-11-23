import { checkSupabaseConnectivity, supabaseStore } from '@/lib/db/supabase';
import { sqliteSandboxStore } from '@/lib/db/sqlite-sandbox';

export function getStoreMode(): 'supabase' | 'local-sqlite' {
  return process.env.REPO2APK_STORE_MODE === 'local-sqlite' ? 'local-sqlite' : 'supabase';
}

export const dbStore =
  getStoreMode() === 'local-sqlite' ? sqliteSandboxStore : supabaseStore;

export async function checkDatabaseHealth(): Promise<{
  mode: 'supabase' | 'local-sqlite';
  ok: boolean;
  error?: string;
}> {
  const mode = getStoreMode();
  if (mode === 'local-sqlite') {
    return { mode, ok: true };
  }
  const status = await checkSupabaseConnectivity();
  return { mode, ...status };
}
