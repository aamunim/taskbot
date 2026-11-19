import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Small persisted preferences (filters, view modes). Kept in memory so every
// screen sharing a key updates together; storage is best-effort.
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<(v: unknown) => void>>();
const storageKey = (key: string) => `pref:${key}`;

export function setPref<T>(key: string, value: T) {
  cache.set(key, value);
  listeners.get(key)?.forEach((fn) => fn(value));
  AsyncStorage.setItem(storageKey(key), JSON.stringify(value)).catch(() => {});
}

export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : initial));

  useEffect(() => {
    const fn = (v: unknown) => setValue(v as T);
    const set = listeners.get(key) ?? new Set();
    set.add(fn);
    listeners.set(key, set);
    if (!cache.has(key)) {
      AsyncStorage.getItem(storageKey(key))
        .then((raw) => {
          if (raw == null || cache.has(key)) return;
          const parsed = JSON.parse(raw) as T;
          cache.set(key, parsed);
          set.forEach((l) => l(parsed));
        })
        .catch(() => {});
    }
    return () => {
      set.delete(fn);
    };
  }, [key]);

  const update = useCallback((v: T) => setPref(key, v), [key]);
  return [value, update];
}
