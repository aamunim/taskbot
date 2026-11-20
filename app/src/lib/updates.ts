import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { DEMO } from './demo';

// Over-the-air updates (EAS Update). One small store shared by the full-screen
// "Update ready" prompt and the row in Settings.

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
export type UpdateState = {
  phase: UpdatePhase;
  /** 0..1 while downloading, when the platform reports it. */
  progress: number | null;
  error: string | null;
  /** The person chose "Later" on the full-screen prompt. */
  later: boolean;
  checkedAt: number | null;
};

/** Updates only exist in a real installed build: never in development, on web, or in the demo. */
export const updatesEnabled = !DEMO && !__DEV__ && Platform.OS !== 'web' && Updates.isEnabled;

let state: UpdateState = { phase: 'idle', progress: null, error: null, later: false, checkedAt: null };
const listeners = new Set<(s: UpdateState) => void>();
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};

export function useUpdateState(): UpdateState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export const setDownloadProgress = (progress: number | null) => {
  if (state.phase === 'downloading') set({ progress });
};
export const dismissUpdate = () => set({ later: true });
export const showUpdatePrompt = () => set({ later: false });

const MIN_GAP_MS = 10 * 60 * 1000;

/**
 * Looks for an update and downloads it. Automatic checks (launch, return to
 * foreground) are quiet and rate-limited; a manual check always runs and
 * reports "up to date" or the error.
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (DEMO) return manual ? simulate() : undefined;
  if (!updatesEnabled) {
    if (manual) set({ phase: 'error', error: 'Updates are only available in the installed app.' });
    return;
  }
  if (state.phase === 'checking' || state.phase === 'downloading') return;
  if (state.phase === 'ready') {
    if (manual) set({ later: false });
    return;
  }
  if (!manual && state.checkedAt && Date.now() - state.checkedAt < MIN_GAP_MS) return;
  set({ phase: 'checking', error: null, checkedAt: Date.now() });
  try {
    const found = await Updates.checkForUpdateAsync();
    if (!found.isAvailable) return set({ phase: 'current' });
    set({ phase: 'downloading', progress: null });
    const fetched = await Updates.fetchUpdateAsync();
    set(fetched.isNew || fetched.isRollBackToEmbedded ? { phase: 'ready', progress: 1, later: false } : { phase: 'current' });
  } catch (e) {
    // A failed background check is not the user's problem; only a manual one shows it.
    set({ phase: manual ? 'error' : 'idle', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function restartToUpdate(): Promise<void> {
  if (DEMO) return set({ phase: 'current', later: false });
  try {
    await Updates.reloadAsync();
  } catch (e) {
    set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Demo only: walks through the same states so the screens can be reviewed. */
function simulate() {
  set({ phase: 'checking', error: null, later: false });
  setTimeout(() => {
    set({ phase: 'downloading', progress: 0 });
    let p = 0;
    const id = setInterval(() => {
      p += 0.2;
      if (p >= 1) {
        clearInterval(id);
        set({ phase: 'ready', progress: 1 });
      } else set({ progress: p });
    }, 250);
  }, 500);
}

/** What is running now, for the Settings row. */
export function runningVersion(): { update: string; channel: string | null } {
  if (!Updates.isEnabled) return { update: 'Built-in', channel: null };
  return { update: Updates.isEmbeddedLaunch || !Updates.updateId ? 'Built-in' : `Update ${Updates.updateId.slice(0, 8)}`, channel: Updates.channel ?? null };
}
