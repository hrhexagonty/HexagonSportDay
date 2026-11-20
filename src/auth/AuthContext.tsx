import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type SessionInfo } from '../lib/api';

interface AuthState {
  session: SessionInfo | null;
  loading: boolean;
  isAdmin: boolean;
  /** 委外廠商：管理後台部分分頁唯讀、個資隱碼 */
  isVendor: boolean;
  /** 重新讀取登入狀態並回傳最新 session（登入 / 加入隊伍後呼叫） */
  refresh: () => Promise<SessionInfo | null>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    let next: SessionInfo | null = null;
    try {
      next = await api.getSession();
    } catch (e) {
      console.error('讀取登入狀態失敗', e);
    }
    setSession(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
    return api.onAuthChange(() => void refresh());
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.signOut();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      session,
      loading,
      isAdmin: session?.role === 'super_admin',
      isVendor: session?.role === 'vendor',
      refresh,
      signOut,
    }),
    [session, loading, refresh, signOut],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth 必須在 AuthProvider 內使用');
  return v;
}

/** 登入後應前往的頁面：管理員與委外廠商進後台；只綁定一隊的窗口直接進隊伍頁 */
export function homePathFor(session: SessionInfo | null): string {
  if (!session) return '/login';
  if (session.role === 'super_admin' || session.role === 'vendor') return '/admin';
  if (session.teams.length === 0) return '/join';
  return session.teams.length === 1 ? `/teams/${session.teams[0].teamId}` : '/org';
}
