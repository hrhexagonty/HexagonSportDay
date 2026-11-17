import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Field, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { DEMO_ACCOUNTS } from '../lib/api/demoSeed';

export default function Login() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!loading && session) return <Navigate to={homePathFor(session)} replace />;

  async function signInAs(e: string, p: string) {
    await api.signIn(e, p);
    navigate(homePathFor(await refresh()));
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await signInAs(email, password);
      } else {
        const r = await api.signUp(email, password);
        if (r.needsEmailConfirm) setNotice('註冊成功！請至信箱點擊驗證連結，完成後回到此頁登入。');
        else navigate(homePathFor(await refresh()));
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin(account: { email: string; password: string }) {
    setBusy(true);
    try {
      await signInAs(account.email, account.password);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>單位窗口登入</h1>
        <p className="muted">各單位窗口登入後，可建立隊伍並填寫參賽人員。</p>

        <Tabs
          value={mode}
          onChange={(v) => {
            setMode(v);
            setNotice(null);
          }}
          items={[
            { value: 'signin', label: '登入' },
            { value: 'signup', label: '註冊新帳號' },
          ]}
        />

        <form onSubmit={submit} className="stack">
          <Field label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="密碼" hint={mode === 'signup' ? '至少 6 個字元' : undefined}>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {notice && <div className="notice notice-ok">{notice}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '處理中…' : mode === 'signin' ? '登入' : '註冊'}
          </button>
          {mode === 'signup' && <p className="muted small">註冊後需輸入活動小組提供的「單位邀請碼」以綁定單位。</p>}
        </form>

        {api.mode === 'demo' && (
          <div className="demo-login">
            <div className="divider">
              <span>展示模式快速體驗</span>
            </div>
            <div className="demo-buttons">
              {Object.values(DEMO_ACCOUNTS).map((a) => (
                <button key={a.email} className="btn btn-ghost" disabled={busy} onClick={() => demoLogin(a)}>
                  以「{a.label}」登入
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
