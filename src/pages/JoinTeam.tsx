import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { InviteCodeForm, InviteCodeOk, InviteTeamCard } from '../components/InviteCode';
import { useToast } from '../components/Toast';
import { Eyebrow } from '../components/ui';
import { api, type InviteInfo } from '../lib/api';

/** 已登入的窗口以邀請碼加入（其他）隊伍；尚未綁定任何隊伍的帳號也會被導到這裡 */
export default function JoinTeam() {
  const { session, isAdmin, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [invite, setInvite] = useState<{ info: InviteInfo; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isAdmin) return <Navigate to="/admin" replace />;
  const joined = session?.teams ?? [];
  const already = !!invite && joined.some((t) => t.teamId === invite.info.teamId);

  async function join() {
    if (!invite) return;
    setBusy(true);
    try {
      const name = await api.joinTeam(invite.info.teamId, invite.code);
      toast.ok(`已加入「${name}」`);
      await refresh();
      navigate(`/teams/${invite.info.teamId}`);
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
              ? '同一個帳號可以擔任多支隊伍的窗口。輸入該隊的邀請碼即可加入，並在「我的隊伍」同時管理。'
              : '這個帳號尚未綁定隊伍。請輸入活動小組派發的邀請碼。'}
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

        {invite ? (
          <div className="stack">
            <InviteCodeOk code={invite.code} onReset={() => setInvite(null)} />
            <InviteTeamCard info={invite.info} />
            {already ? (
              <div className="notice notice-info">
                你已是這一隊的窗口。<Link to={`/teams/${invite.info.teamId}`}>前往隊伍頁 →</Link>
              </div>
            ) : (
              <button className="btn btn-primary btn-block" disabled={busy} onClick={join}>
                {busy ? '加入中…' : '加入此隊伍'}
              </button>
            )}
          </div>
        ) : (
          <InviteCodeForm onFound={(info, code) => setInvite({ info, code })} />
        )}
      </div>
    </div>
  );
}
