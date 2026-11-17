import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/format';

type Tone = 'ok' | 'err' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

const ToastCtx = createContext<((tone: Tone, text: string) => void) | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((tone: Tone, text: string) => {
    const id = nextId++;
    setItems((xs) => [...xs, { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'err' ? 5000 : 3000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastCtx);
  if (!show) throw new Error('useToast 必須在 ToastProvider 內使用');
  return useMemo(
    () => ({
      ok: (text: string) => show('ok', text),
      info: (text: string) => show('info', text),
      error: (e: unknown) => show('err', errorMessage(e)),
    }),
    [show],
  );
}
