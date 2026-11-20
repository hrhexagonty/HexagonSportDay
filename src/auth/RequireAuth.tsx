import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loading } from '../components/ui';
import { useAuth } from './AuthContext';

/**
 * 路由守衛
 * - staff：管理員或委外廠商（管理後台；各分頁權限由頁面與 RLS 決定）
 * - org：需已綁定隊伍的窗口（管理員、委外廠商導向後台）
 * - member：已綁定隊伍的窗口、管理員或委外廠商（隊伍頁共用；能否看到該隊由 RLS 決定）
 * - any：只要登入
 */
export function RequireAuth({ need, children }: { need: 'staff' | 'org' | 'member' | 'any'; children: ReactNode }) {
  const { session, loading, isAdmin, isVendor } = useAuth();
  const staff = isAdmin || isVendor;
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (need === 'staff' && !staff) return <Navigate to="/" replace />;
  if (need === 'org' && staff) return <Navigate to="/admin" replace />;
  if ((need === 'org' || need === 'member') && !staff && session.teams.length === 0) return <Navigate to="/join" replace />;
  return <>{children}</>;
}
