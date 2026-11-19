import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export const supabase = createClient(
  SUPABASE_URL || 'https://not-configured.invalid',
  SUPABASE_ANON_KEY || 'not-configured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Token refresh only needs to run while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

type AuthStart = { code: string; secret: string; url: string };
type AuthPoll =
  | { status: 'pending' | 'expired' | 'denied' }
  | { status: 'ok'; token_hash: string };

async function authCall<T>(body: Record<string, string>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return (await res.json()) as T;
}

export const startLogin = () => authCall<AuthStart>({ action: 'start' });
export const pollLogin = (code: string, secret: string) =>
  authCall<AuthPoll>({ action: 'poll', code, secret });

export async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('files').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
