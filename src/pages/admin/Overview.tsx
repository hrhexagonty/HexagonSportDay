import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ProgressBar, StatCard, StatusBadge } from '../../components/ui';
import {
  entriesOfMembers,
  evaluateTeam,
  isMergedTeam,
  teamEvents,
  teamSizeLabel,
  type StatusLevel,
} from '../../lib/rules';
import { CATEGORY_LABEL } from '../../lib/types';
import type { AdminData } from './types';

export default function Overview({ data }: { data: AdminData }) {
  const { settings, events, orgs, teams, members, entries } = data;
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<'all' | StatusLevel>('all');
  // 健力比賽改以公司為單位報名（尚未開放），總覽只列隊伍報名項目
  const sortedEvents = teamEvents(events);
  const target = settings.total_team_target;

  const rows = useMemo(() => {
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    return teams
      .map((t) => {
        const tm = members.filter((m) => m.team_id === t.id);
        return {
          team: t,
          orgName: t.org_ids.length ? t.org_ids.map((id) => orgName.get(id) ?? '—').join('、') : '未分配',
          status: evaluateTeam(settings, events, tm, entriesOfMembers(entries, tm)),
        };
      })
      .sort((a, b) => a.orgName.localeCompare(b.orgName, 'zh-TW') || a.team.name.localeCompare(b.team.name, 'zh-TW'));
  }, [settings, events, orgs, teams, members, entries]);

  const mergedCount = teams.filter(isMergedTeam).length;
  const unassigned = teams.filter((t) => t.org_ids.length === 0).length;
  const complete = rows.filter((r) => r.status.level === 'complete').length;
  const female = members.filter((m) => m.gender === 'F').length;
  const shown = rows.filter(
    (r) =>
      (level === 'all' || r.status.level === level) &&
      (!search || r.team.name.includes(search) || r.orgName.includes(search)),
  );

  return (
    <div className="stack-lg">
      <div className="grid grid-stats">
        <StatCard
          label="參與公司"
          value={`${orgs.length} 家`}
          hint={`聯隊 ${mergedCount} 隊 · 窗口 ${data.contacts.length} 人`}
        />
        <StatCard
          label="已建立隊伍"
          value={`${teams.length} / ${target} 隊`}
          hint={<ProgressBar value={teams.length} max={target} />}
        />
        <StatCard label="已登錄隊員" value={`${members.length} 人`} hint={`女 ${female} · 男 ${members.length - female}`} />
        <StatCard
          label="檢核完成"
          value={`${complete} / ${teams.length} 隊`}
          tone={teams.length > 0 && complete === teams.length ? 'ok' : 'neutral'}
          hint={<ProgressBar value={complete} max={Math.max(teams.length, 1)} tone="ok" />}
        />
      </div>

      {(teams.length !== target || unassigned > 0) && (
        <div className="notice notice-warn">
          {teams.length !== target && `已建立 ${teams.length} 隊，與目標 ${target} 隊不一致。`}
          {unassigned > 0 && `有 ${unassigned} 隊尚未分配公司，窗口無法註冊。`}
          請至「隊伍配置」調整。
        </div>
      )}

      <section className="card">
        <h2>各項目報名概況</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>項目</th>
                <th>類別</th>
                <th>規定</th>
                <th>已報名人數</th>
                <th>達標隊伍</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((ev) => {
                const total = entries.filter((e) => e.event_id === ev.id).length;
                const done = rows.filter((r) => r.status.events.find((s) => s.event.id === ev.id)?.level === 'complete').length;
                return (
                  <tr key={ev.id}>
                    <td>
                      <b>{ev.name}</b>
                    </td>
                    <td>
                      <Badge tone={ev.category === 'powerlifting' ? 'accent' : 'primary'}>{CATEGORY_LABEL[ev.category]}</Badge>
                    </td>
                    <td className="muted">
                      {teamSizeLabel(ev)}
                      {ev.min_female > 0 && `，女 ≥ ${ev.min_female}`}
                    </td>
                    <td>{total} 人</td>
                    <td>
                      {done} / {teams.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>隊伍檢核狀態</h2>
          <div className="spacer" />
          <input className="search" placeholder="搜尋隊名或公司" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={level} onChange={(e) => setLevel(e.target.value as 'all' | StatusLevel)}>
            <option value="all">全部狀態</option>
            <option value="complete">已完成</option>
            <option value="incomplete">未完成</option>
            <option value="error">需修正</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>隊伍</th>
                <th>公司</th>
                <th>人數</th>
                {sortedEvents.map((ev) => (
                  <th key={ev.id}>{ev.name}</th>
                ))}
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ team, orgName, status }) => (
                <tr key={team.id}>
                  <td>
                    <b>{team.name}</b>
                  </td>
                  <td className="muted">{orgName}</td>
                  <td className={status.memberCount < settings.team_min_size ? 'warn-text' : undefined}>{status.memberCount}</td>
                  {status.events.map((s) => (
                    <td key={s.event.id} className={`cell-${s.level}`} title={s.issues.map((i) => i.message).join('\n')}>
                      {s.entries.length}/{s.event.max_per_team}
                    </td>
                  ))}
                  <td>
                    <StatusBadge level={status.level} />
                  </td>
                  <td>
                    <Link className="btn btn-xs btn-ghost" to={`/teams/${team.id}`}>
                      檢視
                    </Link>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={sortedEvents.length + 5} className="muted center">
                    沒有符合條件的隊伍
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
