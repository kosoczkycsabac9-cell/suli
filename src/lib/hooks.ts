import { useCallback, useEffect, useRef, useState } from 'react';
import type { Result } from '@shared/types';

/** Aszinkron adatbetöltés egységes loading/error kezeléssel. */
export function useAsyncData<T>(loader: () => Promise<Result<T>>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (!mounted.current) return;
      if (result.ok) setData(result.data);
      else setError(result.error);
    } catch (err) {
      if (mounted.current) setError((err as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** Időzített, láthatóságra érzékeny poll – háttérben nem terheli a rendszert. */
export function useInterval(callback: () => void, delayMs: number | null) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (delayMs == null) return;
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current();
    };
    const id = window.setInterval(tick, delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}

/** Csúszóablakos előzmény a sparkline grafikonokhoz. */
export function useHistory(value: number | undefined, length = 40) {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    setHistory((prev) => [...prev, value].slice(-length));
  }, [value, length]);
  return history;
}
