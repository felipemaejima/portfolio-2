import { useEffect, useState } from 'react';
import { api } from './api';

/** Loads `path` whenever it changes; responses for a path no longer current are ignored. */
export function useFetch<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: unknown }>();
  useEffect(() => {
    let current = true;
    api<T>(path).then(
      (data) => current && setResult({ path, data }),
      (error: unknown) => current && setResult({ path, error }),
    );
    return () => {
      current = false;
    };
  }, [path]);
  // While a new path loads, the previous data stays on screen (no flicker between filter changes).
  return { data: result?.data, error: result?.error, loading: result?.path !== path };
}
