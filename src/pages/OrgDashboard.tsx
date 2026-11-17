import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, EmptyState, ErrorBox, Field, Loading, ProgressBar, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { blankToNull, formatDateTime } from '../lib/format';
import { entriesOfMembers, evaluateTeam, isMergedTeam, registrationOpen, soloTeamCount, type TeamStatus } from '../lib/rules';
import type { Settings, Team } from '../lib/types';
import { useAsync } from '../lib/useAsync';

function TeamCard({
  team,
  status,
  settings,
  orgNames,
}: {
  team: Team;
  status: TeamStatus;
  settings: Settings;
  orgNames: Map<string, string>;
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
      <p className="muted small">隊長：{team.captain_name ?? '未填寫'}</p>
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

function CreateTeamForm({ orgId, defaultName, onCreated }: { orgId: string; defaultName: string; onCreated: (t: Team) => void }) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [captain, setCaptain] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const team = await api.createTeam(
        { name: name.trim(), captain_name: blankToNull(captain), captain_phone: blankToNull(phone) },
        [orgId],
      );
      toast.ok(`已建立「${team.name}」`);
      onCreated(team);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card create-team" onSubmit={submit}>
      <h3>＋ 新增隊伍</h3>
      <Field label="隊名" hint="全活動隊名不可重複">
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="row-2">
        <Field label="隊長姓名">
          <input value={captain} onChange={(e) => setCaptain(e.target.value)} />
        </Field>
        <Field label="隊長電話">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? '建立中…' : '建立隊伍'}
      </button>
    </form>
  );
}

export default function OrgDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const orgId = session!.orgId!;

  const q = useAsync(async () => {
    // RLS 已限制只回傳本公司有參與的隊伍（含聯隊）與其隊員
    const [settings, events, orgs, orgNames, teams, members, entries] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrganizations(),
      api.listOrgNames(),
      api.listTeams(),
      api.listMembers(),
      api.listEntries(),
    ]);
    return {
      settings,
      events,
      org: orgs.find((o) => o.id === orgId) ?? null,
      orgNames: new Map(orgNames.map((o) => [o.id, o.name])),
      teams,
      members,
      entries,
    };
  }, [orgId]);

  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const { settings, events, org, orgNames, teams, members, entries } = q.data;
  if (!org) return <ErrorBox message="找不到所屬公司，請聯絡活動小組。" />;

  const open = registrationOpen(settings);
  const statuses = teams.map((t) => {
    const tm = members.filter((m) => m.team_id === t.id);
    return { team: t, status: evaluateTeam(settings, events, tm, entriesOfMembers(entries, tm)) };
  });
  const done = statuses.filter((s) => s.status.level === 'complete').length;
  const solo = soloTeamCount(teams, org.id);
  const mergedCount = teams.filter(isMergedTeam).length;
  const myMembers = members.filter((m) => m.org_id === org.id).length;
  const canCreate = open && solo < org.team_quota;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{org.name}</h1>
          <p className="muted">
            自組隊伍 <b>{solo}</b> / {org.team_quota} 隊
            {mergedCount > 0 && ` · 參與聯隊 ${mergedCount} 隊`} · 已完成 {done} 隊 · 本公司隊員 {myMembers} 人
          </p>
        </div>
        <div className="page-head-side">
          <span className="muted small">公司邀請碼（可分享給同事共同填寫）</span>
          <code className="code-pill">{org.invite_code}</code>
        </div>
      </div>

      {open ? (
        settings.registration_deadline && (
          <div className="notice notice-info">報名截止：{formatDateTime(settings.registration_deadline)}，截止後資料將鎖定。</div>
        )
      ) : (
        <div className="notice notice-err">報名已截止，資料僅供檢視；如需修改請聯絡活動小組。</div>
      )}

      {teams.length === 0 && !canCreate ? (
        <EmptyState title="尚未有隊伍">
          本公司目前沒有可自組的隊伍額度；若與其他公司合組聯隊，請洽活動小組建立。
        </EmptyState>
      ) : (
        <div className="grid grid-teams">
          {statuses.map(({ team, status }) => (
            <TeamCard key={team.id} team={team} status={status} settings={settings} orgNames={orgNames} />
          ))}
          {canCreate && (
            <CreateTeamForm
              key={teams.length}
              orgId={org.id}
              defaultName={`${org.name} 第${solo + 1}隊`}
              onCreated={(t) => navigate(`/teams/${t.id}`)}
            />
          )}
        </div>
      )}

      {open && org.team_quota > 0 && solo >= org.team_quota && (
        <p className="muted small">
          <Badge>已達額度</Badge> 本公司自組隊伍額度已用完，如需增加請聯絡活動小組。
        </p>
      )}
    </div>
  );
}
