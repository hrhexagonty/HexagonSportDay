import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { InviteCodeForm, InviteCodeOk, InviteTeamCard } from '../components/InviteCode';
import { useToast } from '../components/Toast';
import { Eyebrow, Field, Tabs } from '../components/ui';
import { api, type InviteInfo } from '../lib/api';
import { DEMO_ACCOUNTS } from '../lib/api/demoSeed';

/** 註冊步驟區塊：01 輸入邀請碼 → 02 確認隊伍 → 03 設定信箱與密碼 */
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
      <p className="muted small">第一次使用？請切換到「首次註冊」，輸入活動小組派發的邀請碼。</p>
    </form>
  );
}

/** 首次註冊：先輸入邀請碼，正確後才顯示對應隊伍與信箱密碼設定 */
function SignUpForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [invite, setInvite] = useState<{ info: InviteInfo; code: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!invite) return;
    if (password !== password2) {
      toast.error('兩次輸入的密碼不一致');
      return;
    }
    setBusy(true);
    setNotice(null);
    const { info, code } = invite;
    try {
      const r = await api.registerForTeam(email, password, { teamId: info.teamId, inviteCode: code });
      if (r.needsEmailConfirm) {
        setNotice(`已完成註冊並綁定「${info.teamName}」（${info.orgName}）。請至信箱點擊驗證連結，完成後回到此頁登入。`);
      } else {
        toast.ok(
          r.existingAccount
            ? `已把「${info.teamName}」加入你的帳號，可在「我的隊伍」同時管理`
            : `註冊完成，已成為「${info.teamName}」（${info.orgName}）的窗口`,
        );
        navigate(homePathFor(await refresh()));
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <Step no="01" title="輸入邀請碼">
        {invite ? (
          <InviteCodeOk
            code={invite.code}
            onReset={() => {
              setInvite(null);
              setNotice(null);
            }}
          />
        ) : (
          <InviteCodeForm onFound={(info, code) => setInvite({ info, code })} />
        )}
      </Step>

      {invite && (
        <>
          <Step no="02" title="確認隊伍">
            <InviteTeamCard info={invite.info} />
          </Step>
          <form onSubmit={submit} className="stack-lg">
            <Step no="03" title="設定信箱與密碼">
              <Field label="Email">
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
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
              <p className="muted small">
                同一位窗口代表多隊時，可使用同一個信箱：若此信箱已註冊，請輸入原本的密碼，這一隊會加入同一個帳號，登入後在「我的隊伍」同時管理。
              </p>
            </Step>
            {notice && <div className="notice notice-ok">{notice}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? '處理中…' : '完成註冊並登入'}
            </button>
          </form>
        </>
      )}
    </div>
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
