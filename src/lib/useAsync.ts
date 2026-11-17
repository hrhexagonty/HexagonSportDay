import { useCallback, useEffect, useState, type DependencyList } from 'react';
import { errorMessage } from './format';

interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/**
 * 載入非同步資料；reload() 重新抓取時保留舊資料，避免畫面閃爍。
 * deps 變動時會重新執行 fn。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (e: unknown) => alive && setState((s) => ({ data: s.data, error: errorMessage(e), loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
