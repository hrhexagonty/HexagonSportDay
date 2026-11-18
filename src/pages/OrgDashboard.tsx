// 窗口首頁：列出自己綁定的隊伍（一個帳號可擔任多隊窗口）
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge, EmptyState, ErrorBox, Eyebrow, Loading, ProgressBar, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { entriesOfMembers, evaluateTeam, isMergedTeam, registrationOpen, type TeamStatus } from '../lib/rules';
import type { Settings, Team } from '../lib/types';
import { useAsync } from '../lib/useAsync';

function TeamCard({
  team,
  status,
  settings,
  orgNames,
  myOrgName,
}: {
  team: Team;
  status: TeamStatus;
  settings: Settings;
  orgNames: Map<string, string>;
  /** 自己在這隊代表的公司 */
  myOrgName: string | null;
}) {
  const merged = isMergedTeam(team);
  return (
    <Link to={`/teams/${team.id}`} className="card team-card">
      <div className="team-card-head">
        <h3>{team.name}</h3>
        <StatusBadge level={status.level} />
      </div>
      {merged && (
        <p className="small">
          <Badge tone="accent">聯隊</Badge> <span className="muted">{team.org_ids.map((id) => orgNames.get(id)).join('、')}</span>
        </p>
      )}
      <p className="muted small">
        {myOrgName && `你的身分：${myOrgName} 窗口 · `}隊長：{team.captain_name ?? '未填寫'}
      </p>
      <div className="team-card-size">
        <span>
          隊員 <b>{status.memberCount}</b> / {settings.team_max_size} 人
          <span className="muted small">（女 {status.femaleCount}）</span>
        </span>
      </div>
      <ProgressBar
        value={status.memberCount}
        max={settings.team_max_size}
        tone={
          status.memberCount > settings.team_max_size
            ? 'err'
            : status.memberCount >= settings.team_min_size
              ? 'ok'
              : 'primary'
        }
      />
      <div className="event-dots">
        {status.events.map((s) => (
          <span key={s.event.id} className={`event-dot event-dot-${s.level}`} title={s.issues.map((i) => i.message).join('\n')}>
            {s.event.name} {s.entries.length}/{s.event.max_per_team}
          </span>
        ))}
      </div>
      <span className="team-card-go">進入填報 →</span>
    </Link>
  );
}

export default function OrgDashboard() {
  const { session } = useAuth();
  const myTeams = session?.teams ?? [];

  const q = useAsync(async () => {
    // RLS 已限制只回傳自己綁定的隊伍與其隊員
    const [settings, events, orgNames, teams, members, entries] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrgNames(),
      api.listTeams(),
      api.listMembers(),
      api.listEntries(),
    ]);
    return { settings, events, orgNames: new Map(orgNames.map((o) => [o.id, o.name])), teams, members, entries };
  }, [myTeams.map((t) => t.teamId).join()]);

  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const { settings, events, orgNames, teams, members, entries } = q.data;

  const open = registrationOpen(settings);
  const roleOf = new Map(myTeams.map((t) => [t.teamId, t.orgName]));
  const statuses = teams
    .map((t) => {
      const tm = members.filter((m) => m.team_id === t.id);
      return { team: t, status: evaluateTeam(settings, events, tm, entriesOfMembers(entries, tm)) };
    })
    .sort((a, b) => a.team.name.localeCompare(b.team.name, 'zh-TW'));
  const done = statuses.filter((s) => s.status.level === 'complete').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>My teams</Eyebrow>
          <h1>我的隊伍</h1>
          <p className="muted">
            {session?.email} · 擔任 <b>{teams.length}</b> 隊窗口 · 已完成 {done} 隊
          </p>
        </div>
        <Link className="btn btn-sm" to="/join">
          ＋ 加入其他隊伍
        </Link>
      </div>

      {open ? (
        settings.registration_deadline && (
          <div className="notice notice-info">報名截止：{formatDateTime(settings.registration_deadline)}，截止後資料將鎖定。</div>
        )
      ) : (
        <div className="notice notice-err">報名已截止，資料僅供檢視；如需修改請聯絡活動小組。</div>
      )}

      {teams.length === 0 ? (
        <EmptyState title="尚未綁定隊伍">請至「加入其他隊伍」選擇隊伍並輸入邀請碼。</EmptyState>
      ) : (
        <div className="grid grid-teams">
          {statuses.map(({ team, status }) => (
            <TeamCard
              key={team.id}
              team={team}
              status={status}
              settings={settings}
              orgNames={orgNames}
              myOrgName={roleOf.get(team.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
