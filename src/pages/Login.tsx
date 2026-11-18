import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { DEMO_INVITE_HINT, TeamPicker } from '../components/TeamPicker';
import { useToast } from '../components/Toast';
import { ErrorBox, Eyebrow, Field, Loading, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { DEMO_ACCOUNTS } from '../lib/api/demoSeed';
import { normalizeInviteCode } from '../lib/inviteCode';
import { useAsync } from '../lib/useAsync';

/** 註冊步驟區塊：01 選擇隊伍 → 02 設定信箱與密碼 → 03 輸入邀請碼 */
function Step({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section className="reg-step">
      <div className="reg-step-head">
        <span className="reg-step-no">{no}</span>
        <h3>{title}</h3>
      </div>
      <div className="stack">{children}</div>
    </section>
  );
}

function SignInForm({ onDone }: { onDone: (email: string, password: string) => Promise<void> }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await onDone(email, password);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <Field label="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="密碼">
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? '登入中…' : '登入'}
      </button>
      <p className="muted small">第一次使用？請切換到「首次註冊」，選擇隊伍並輸入活動小組提供的邀請碼。</p>
    </form>
  );
}

function SignUpForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const options = useAsync(() => api.listTeamOptions(), []);
  const [teamId, setTeamId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!options.data) return options.error ? <ErrorBox message={options.error} onRetry={options.reload} /> : <Loading />;
  if (options.data.length === 0) {
    return <div className="notice notice-info">活動小組尚未開放隊伍註冊，請稍後再試或洽活動小組。</div>;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (password !== password2) {
      toast.error('兩次輸入的密碼不一致');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const teamName = options.data?.find((o) => o.id === teamId)?.name ?? '';
      // 先檢查邀請碼，避免信箱密碼都填完才因邀請碼錯誤而註冊失敗
      const orgName = await api.checkTeamInvite(teamId, code);
      const r = await api.signUp(email, password, { teamId, inviteCode: code });
      if (r.needsEmailConfirm) {
        setNotice(`已完成註冊並綁定「${teamName}」（${orgName}）。請至信箱點擊驗證連結，完成後回到此頁登入。`);
      } else {
        toast.ok(`註冊完成，已成為「${teamName}」（${orgName}）的窗口`);
        navigate(homePathFor(await refresh()));
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack-lg">
      <Step no="01" title="選擇隊伍">
        <TeamPicker options={options.data} value={teamId} onChange={setTeamId} />
      </Step>
      <Step no="02" title="設定信箱與密碼">
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="row-2">
          <Field label="密碼" hint="至少 6 個字元">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="再次輸入密碼">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </Field>
        </div>
      </Step>
      <Step no="03" title="輸入邀請碼">
        <Field label="隊伍邀請碼" hint="由活動小組提供；聯隊中各公司的邀請碼不同，請使用貴公司的那一組">
          <input
            required
            className="input-code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
            placeholder="例如 A1B2C3D4"
          />
        </Field>
        {api.mode === 'demo' && <p className="muted small">{DEMO_INVITE_HINT}</p>}
      </Step>
      {notice && <div className="notice notice-ok">{notice}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || !teamId}>
        {busy ? '處理中…' : '完成註冊並登入'}
      </button>
    </form>
  );
}

export default function Login() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to={homePathFor(session)} replace />;

  async function signInAs(e: string, p: string) {
    await api.signIn(e, p);
    navigate(homePathFor(await refresh()));
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
        <div>
          <Eyebrow>Access</Eyebrow>
          <h1>單位登入</h1>
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            各隊窗口登入後，可填寫隊員名單並安排各項目選手。
          </p>
        </div>

        <Tabs
          value={mode}
          onChange={setMode}
          items={[
            { value: 'signin', label: '登入' },
            { value: 'signup', label: '首次註冊' },
          ]}
        />

        {mode === 'signin' ? <SignInForm onDone={signInAs} /> : <SignUpForm />}

        {api.mode === 'demo' && mode === 'signin' && (
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
