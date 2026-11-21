import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { messageOf } from './errors';
import { useScreenFocused } from '../nav/ScreenFocus';
import { useRealtime, Watch } from './useRealtime';

interface Live<T> {
  data: T | null;
  error: string | null;
  refreshing: boolean;
  reload: () => Promise<void>;
  onRefresh: () => void;
  clearError: () => void;
}

/**
 * Loads data for a screen, reloads when `key` changes, when a watched table changes (Realtime),
 * and on pull-to-refresh. Results are tagged with the key they belong to, so a screen never shows
 * another flat's or month's data while the next load is in flight.
 */
export function useLive<T>(key: string | null, load: () => Promise<T>, watches: Watch[] = []): Live<T> {
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The latest `load` (it closes over the screen's current props), read only from callbacks.
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    if (key === null) return;
    try {
      const data = await loadRef.current();
      setResult({ key, data });
      setError(null);
    } catch (e: unknown) {
      setError(messageOf(e));
    }
  }, [key]);

  // First load, again whenever the key changes, and again when the screen is back on top (another
  // screen may have changed the data meanwhile). A load for an old key is dropped.
  const focused = useScreenFocused();
  useEffect(() => {
    if (key === null || !focused) return;
    let active = true;
    loadRef.current().then(
      (data) => {
        if (!active) return;
        setResult({ key, data });
        setError(null);
      },
      (e: unknown) => {
        if (active) setError(messageOf(e));
      },
    );
    return () => {
      active = false;
    };
  }, [key, focused]);

  useRealtime(key, watches, () => void reload());

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void reload().finally(() => setRefreshing(false));
  }, [reload]);

  return {
    data: result !== null && result.key === key ? result.data : null,
    error,
    refreshing,
    reload,
    onRefresh,
    clearError: () => setError(null),
  };
}
