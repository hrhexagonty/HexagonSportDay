import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loading } from '../components/ui';
import { useAuth } from './AuthContext';

/**
 * 路由守衛
 * - admin：僅管理員
 * - org：需已綁定單位（管理員導向後台）
 * - member：已綁定單位或管理員（隊伍頁共用）
 * - any：只要登入
 */
export function RequireAuth({ need, children }: { need: 'admin' | 'org' | 'member' | 'any'; children: ReactNode }) {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (need === 'admin' && !isAdmin) return <Navigate to="/" replace />;
  if (need === 'org' && isAdmin) return <Navigate to="/admin" replace />;
  if ((need === 'org' || need === 'member') && !isAdmin && !session.orgId) return <Navigate to="/join" replace />;
  return <>{children}</>;
}
