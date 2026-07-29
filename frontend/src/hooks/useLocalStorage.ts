"use client";
import { useState, useEffect } from "react";

// The browser's own "storage" event only fires in *other* tabs, never the
// one that made the change — so two components in the same tab each calling
// useLocalStorage(key) independently would otherwise never see each other's
// updates (e.g. Sidebar's own settings read going stale the moment a page
// changes the default farm elsewhere). This custom event closes that gap
// for same-tab, cross-component instances of the same key.
const EVENT = "gh-local-storage";

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {}

    const onUpdate = (e: Event) => {
      const { key: changedKey, value: newValue } = (e as CustomEvent).detail;
      if (changedKey === key) setValue(newValue as T);
    };
    window.addEventListener(EVENT, onUpdate);
    return () => window.removeEventListener(EVENT, onUpdate);
  }, [key]);

  const set = (newValue: T) => {
    setValue(newValue);
    try {
      localStorage.setItem(key, JSON.stringify(newValue));
    } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value: newValue } }));
  };

  return [value, set] as const;
}
