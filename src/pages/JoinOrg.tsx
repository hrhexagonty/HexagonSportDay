import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Field } from '../components/ui';
import { api } from '../lib/api';

export default function JoinOrg() {
  const { session, isAdmin, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (session?.orgId || isAdmin) return <Navigate to={homePathFor(session)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const name = await api.joinOrg(code);
      toast.ok(`已綁定單位：${name}`);
      navigate(homePathFor(await refresh()));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>綁定所屬單位</h1>
        <p className="muted">請輸入活動小組提供的單位邀請碼。綁定後即可建立隊伍並填寫名單；同一單位可由多位窗口共同填寫。</p>
        <form onSubmit={submit} className="stack">
          <Field label="單位邀請碼">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="例如 TECH2026"
              className="input-code"
            />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '綁定中…' : '綁定單位'}
          </button>
        </form>
        {api.mode === 'demo' && (
          <p className="muted small">展示模式可用邀請碼：BUILD026、LOGI2026、MEDI2026（參與聯隊）等（管理後台可查看全部）。</p>
        )}
      </div>
    </div>
  );
}
