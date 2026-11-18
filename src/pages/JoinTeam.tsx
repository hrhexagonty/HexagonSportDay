import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DEMO_INVITE_HINT, TeamPicker } from '../components/TeamPicker';
import { useToast } from '../components/Toast';
import { ErrorBox, Eyebrow, Field, Loading } from '../components/ui';
import { api } from '../lib/api';
import { normalizeInviteCode } from '../lib/inviteCode';
import { useAsync } from '../lib/useAsync';

/** 已登入的窗口以邀請碼加入（其他）隊伍；尚未綁定任何隊伍的帳號也會被導到這裡 */
export default function JoinTeam() {
  const { session, isAdmin, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const options = useAsync(() => api.listTeamOptions(), []);
  const [teamId, setTeamId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAdmin) return <Navigate to="/admin" replace />;
  const joined = session?.teams ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const name = await api.joinTeam(teamId, code);
      toast.ok(`已加入「${name}」`);
      await refresh();
      navigate(`/teams/${teamId}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        {joined.length > 0 && (
          <Link className="back-link" to="/org">
            ← 回我的隊伍
          </Link>
        )}
        <div>
          <Eyebrow>Invite code</Eyebrow>
          <h1>{joined.length > 0 ? '加入其他隊伍' : '綁定參賽隊伍'}</h1>
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            {joined.length > 0
              ? '同一個帳號可以擔任多支隊伍的窗口。選擇隊伍並輸入該隊的邀請碼即可加入。'
              : '這個帳號尚未綁定隊伍。請選擇隊伍並輸入活動小組提供的邀請碼。'}
          </p>
        </div>

        {joined.length > 0 && (
          <div className="chips">
            {joined.map((t) => (
              <span key={t.teamId} className="chip">
                {t.teamName}（{t.orgName}）
              </span>
            ))}
          </div>
        )}

        {!options.data ? (
          options.error ? (
            <ErrorBox message={options.error} onRetry={options.reload} />
          ) : (
            <Loading />
          )
        ) : (
          <form onSubmit={submit} className="stack">
            {/* 點選元件內含 label，不可再包在 Field（label）裡 */}
            <div className="field">
              <span className="field-label">隊伍</span>
              <TeamPicker options={options.data} value={teamId} onChange={setTeamId} exclude={joined.map((t) => t.teamId)} />
            </div>
            <Field label="隊伍邀請碼" hint="聯隊中各公司的邀請碼不同，請使用貴公司的那一組">
              <input
                required
                className="input-code"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
                placeholder="例如 A1B2C3D4"
              />
            </Field>
            <button className="btn btn-primary btn-block" disabled={busy || !teamId}>
              {busy ? '加入中…' : '加入隊伍'}
            </button>
            {api.mode === 'demo' && <p className="muted small">{DEMO_INVITE_HINT}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
