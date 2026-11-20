import { useSyncExternalStore } from 'react';

// Which task or note is open in the desktop detail pane (null = closed).
let current: string | null = null;
const listeners = new Set<() => void>();

export function setPaneItem(id: string | null) {
  if (current === id) return;
  current = id;
  listeners.forEach((fn) => fn());
}

export const getPaneItem = () => current;

export function usePaneItem(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => null,
  );
}
