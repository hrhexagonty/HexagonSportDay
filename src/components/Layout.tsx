import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { resetDemoData } from '../lib/api/demo';
import { HexLogo } from './ui';

function DemoBanner() {
  return (
    <div className="demo-banner">
      <div className="container demo-banner-inner">
        <span>
          <strong>展示模式</strong>：尚未連接 Supabase，所有資料只存在這個瀏覽器中。
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            if (confirm('確定要清除所有變更、還原成初始展示資料？')) {
              resetDemoData();
              window.location.reload();
            }
          }}
        >
          重置展示資料
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { session, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // 換頁時回到頁首（SPA 預設會保留上一頁的捲動位置）
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      {api.mode === 'demo' && <DemoBanner />}
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <HexLogo />
            <span>運動會報名平台</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              活動資訊
            </NavLink>
            {session?.orgId && !isAdmin && <NavLink to="/org">我的隊伍</NavLink>}
            {isAdmin && <NavLink to="/admin">管理後台</NavLink>}
          </nav>
          <div className="userbox">
            {session ? (
              <>
                <span className="userbox-name">
                  {isAdmin ? '管理員' : (session.orgName ?? '未綁定單位')}
                  <small>{session.email}</small>
                </span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                >
                  登出
                </button>
              </>
            ) : (
              <Link className="btn btn-sm btn-primary" to="/login">
                單位登入
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="container main">{children}</main>
      <footer className="footer">
        <div className="container">運動會報名平台 · 由各單位窗口填寫參賽隊伍與人員</div>
      </footer>
    </div>
  );
}
