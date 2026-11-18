import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { resetDemoData } from '../lib/api/demo';
import { BrandMark, StatusTag } from './ui';

function DemoBanner() {
  return (
    <div className="demo-banner">
      <span>
        <strong>DEMO MODE</strong> · 尚未連接 Supabase，所有資料只存在這個瀏覽器中
      </span>
      <button
        className="btn btn-xs"
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
  );
}

/** 浮動外殼的背景特效：60px 格線、光暈球、雜訊 */
function ShellEffects() {
  return (
    <div className="shell-fx" aria-hidden>
      <div className="shell-grid" />
      <div className="glow glow-lime" />
      <div className="glow glow-emerald" />
      <div className="noise" />
    </div>
  );
}

function Footer({ full }: { full: boolean }) {
  const { session } = useAuth();
  const year = new Date().getFullYear();
  const bottom = (
    <div className="footer-bottom">
      <span>© {year} Hexagon Sport Day</span>
      <nav className="footer-links">
        <Link to="/">活動資訊</Link>
        <Link to={homePathFor(session)}>{session ? '前往填報' : '單位登入'}</Link>
      </nav>
      <div className="footer-icons">
        <button className="icon-circle" aria-label="回到頁首" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑
        </button>
      </div>
    </div>
  );

  if (!full) return <footer className="footer">{bottom}</footer>;

  return (
    <footer className="footer footer-full">
      <div className="footer-watermark" aria-hidden>
        HEXAGON
      </div>
      <div className="footer-cta">
        <StatusTag>Ready when you are</StatusTag>
        <h2>準備好組隊了嗎？</h2>
        <Link className="btn-mega" to={homePathFor(session)}>
          {session ? '前往填報' : '開始報名'} <span aria-hidden>→</span>
        </Link>
      </div>
      {bottom}
    </footer>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { session, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  // 隊伍頁不是 /org、/admin 的子路由，手動讓對應導覽保持啟用
  const onTeamPage = pathname.startsWith('/teams/');
  const activeIf = (extra: boolean) => ({ isActive }: { isActive: boolean }) =>
    isActive || extra ? 'active' : undefined;

  // 換頁時回到頁首（SPA 預設會保留上一頁的捲動位置）
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // 窗口顯示所代表的公司（可能擔任多家公司、多隊的窗口）
  const myOrgs = [...new Set(session?.teams.map((t) => t.orgName) ?? [])];
  const status = session
    ? isAdmin
      ? 'Admin'
      : myOrgs.length > 0
        ? myOrgs.join('、')
        : '未綁定隊伍'
    : api.mode === 'demo'
      ? 'Demo'
      : 'Online';

  return (
    <div className="viewport">
      <div className="shell">
        <ShellEffects />
        {api.mode === 'demo' && <DemoBanner />}
        <header className="topbar">
          <Link to="/" className="brand" aria-label="回首頁">
            <BrandMark />
            <span className="brand-text">
              <b>SPORT DAY</b>
            </span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              活動資訊
            </NavLink>
            {session && !isAdmin && session.teams.length > 0 && (
              <NavLink to="/org" className={activeIf(onTeamPage)}>
                我的隊伍
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={activeIf(onTeamPage)}>
                管理後台
              </NavLink>
            )}
          </nav>
          <div className="topbar-right">
            <StatusTag className="topbar-status" title={session?.email}>
              {status}
            </StatusTag>
            {session ? (
              <button
                className="btn btn-white btn-sm"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
              >
                登出
              </button>
            ) : (
              <Link className="btn btn-white btn-sm" to="/login">
                單位登入
              </Link>
            )}
          </div>
        </header>
        <main className={isHome ? 'main main-home' : 'main'}>{children}</main>
        <Footer full={isHome} />
      </div>
    </div>
  );
}
