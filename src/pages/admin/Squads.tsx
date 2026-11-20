import { useToast } from '../../components/Toast';
import { Badge, EmptyState, StatCard } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadCsv, type Cell } from '../../lib/csv';
import { dateStamp, filePrefix, formatDateTime } from '../../lib/format';
import { companyEvents, evaluateSquad, teamSizeLabel } from '../../lib/rules';
import { GENDER_LABEL, type Member, type OrgSquad } from '../../lib/types';
import type { AdminData } from './types';

/** 後台「健力報名」：各公司組成的隊伍、狀態與成員；可退回草稿、刪除、匯出（委外廠商只能檢視與匯出） */
export default function Squads({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, members, events, squads, settings, readOnly } = data;
  const toast = useToast();
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const cEvents = companyEvents(events);

  // 依公司排序後，各公司分別編號（與「我的公司」頁一致：依建立時間）
  const label = new Map<string, string>();
  for (const ev of cEvents) {
    const short = ev.name.replace(/(比賽|競賽)$/, '') || ev.name;
    const byOrg = new Map<string, OrgSquad[]>();
    for (const s of squads.filter((x) => x.event_id === ev.id).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      byOrg.set(s.org_id, [...(byOrg.get(s.org_id) ?? []), s]);
    }
    for (const list of byOrg.values()) list.forEach((s, i) => label.set(s.id, `${short}隊伍 #${i + 1}`));
  }
  const sorted = [...squads].sort(
    (a, b) =>
      (orgName.get(a.org_id) ?? '').localeCompare(orgName.get(b.org_id) ?? '', 'zh-TW') ||
      a.created_at.localeCompare(b.created_at),
  );
  const people = (s: OrgSquad) => s.member_ids.map((id) => memberById.get(id)).filter((m): m is Member => !!m);

  const submitted = squads.filter((s) => s.submitted_at);
  const joined = submitted.reduce((n, s) => n + s.member_ids.length, 0);

  async function run(op: () => Promise<void>, ok: string) {
    try {
      await op();
      toast.ok(ok);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  function exportCsv() {
    const rows: Cell[][] = [['公司', '項目', '隊伍', '狀態', '送出時間', '姓名', '性別', '所屬分隊']];
    for (const s of sorted) {
      const ev = events.find((e) => e.id === s.event_id);
      for (const m of people(s)) {
        rows.push([
          orgName.get(s.org_id) ?? '',
          ev?.name ?? s.event_id,
          label.get(s.id) ?? '',
          s.submitted_at ? '已成隊' : '草稿',
          formatDateTime(s.submitted_at) ?? '',
          m.name,
          GENDER_LABEL[m.gender],
          teamName.get(m.team_id) ?? '',
        ]);
      }
    }
    downloadCsv(`${filePrefix(settings.event_title)}健力報名_${dateStamp()}.csv`, rows);
  }

  if (cEvents.length === 0) return <EmptyState title="目前沒有以公司為單位組隊的項目" />;

  return (
    <div className="stack-lg">
      <div className="grid grid-stats">
        <StatCard label="已成隊" value={`${submitted.length} 隊`} hint={`參賽 ${joined} 人`} tone={submitted.length ? 'ok' : 'neutral'} />
        <StatCard label="草稿" value={`${squads.length - submitted.length} 隊`} hint="窗口尚未送出" />
        <StatCard label="已組隊公司" value={`${new Set(squads.map((s) => s.org_id)).size} / ${orgs.length} 家`} />
      </div>

      {cEvents.map((ev) => {
        const list = sorted.filter((s) => s.event_id === ev.id);
        return (
          <section key={ev.id} className="card stack">
            <div className="toolbar">
              <div>
                <h2>{ev.name}</h2>
                <p className="muted small">
                  以公司為單位組隊 · {teamSizeLabel(ev)} · 女性至少 {ev.min_female} 人 · 一人只能參加一隊
                </p>
              </div>
              <div className="spacer" />
              <button className="btn btn-sm" onClick={exportCsv} disabled={squads.length === 0}>
                下載健力名單 CSV
              </button>
            </div>
            {list.length === 0 ? (
              <p className="muted">尚無公司組隊。</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>公司</th>
                      <th>隊伍</th>
                      <th>狀態</th>
                      <th>人數</th>
                      <th>成員</th>
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const ps = people(s);
                      const st = evaluateSquad(
                        ev,
                        ps.map((m) => m.gender),
                      );
                      return (
                        <tr key={s.id}>
                          <td>
                            <b>{orgName.get(s.org_id)}</b>
                          </td>
                          <td>{label.get(s.id)}</td>
                          <td>
                            {s.submitted_at ? <Badge tone="ok">已成隊</Badge> : <Badge tone="warn">草稿</Badge>}
                            {s.submitted_at && <div className="muted small">{formatDateTime(s.submitted_at)}</div>}
                          </td>
                          <td className="nowrap">
                            {st.count} / {ev.max_per_team}
                            <div className="muted small">女 {st.female}</div>
                          </td>
                          <td>
                            <div className="chips">
                              {ps.map((m) => (
                                <span key={m.id} className={`chip chip-sm chip-${m.gender === 'F' ? 'f' : 'm'}`} title={teamName.get(m.team_id)}>
                                  {m.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          {!readOnly && (
                          <td className="nowrap">
                            {s.submitted_at && (
                              <button
                                className="btn btn-xs"
                                onClick={() => run(() => api.setSquadSubmitted(s.id, false), '已退回草稿')}
                              >
                                退回草稿
                              </button>
                            )}
                            <button
                              className="btn btn-xs btn-danger-ghost"
                              onClick={() => {
                                if (confirm(`刪除「${orgName.get(s.org_id)} ${label.get(s.id)}」？`)) {
                                  void run(() => api.deleteOrgSquad(s.id), '隊伍已刪除');
                                }
                              }}
                            >
                              刪除
                            </button>
                          </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
