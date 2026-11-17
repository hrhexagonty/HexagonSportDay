import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import { Badge, EmptyState, IssueList, ProgressBar, StatusBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { checkAddEntry, teamSizeLabel, type EventStatus } from '../../lib/rules';
import { CATEGORY_LABEL, GENDER_LABEL, type EventEntry, type Member } from '../../lib/types';
import type { TeamPageData } from './types';

function EventCard({ status, data, entriesByMember }: { status: EventStatus; data: TeamPageData; entriesByMember: Map<string, EventEntry[]> }) {
  const { event } = status;
  const { members, settings, editable, reload, merged, orgNames } = data;
  const toast = useToast();
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const pl = event.category === 'powerlifting';
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const enteredIds = new Set(status.entries.map((e) => e.member_id));
  const candidates = members.filter((m) => !enteredIds.has(m.id));
  const isFull = status.entries.length >= event.max_per_team;
  // 聯隊在名字後加註公司，方便辨識
  const label = (m: Member) => (merged ? `${m.name}（${orgNames.get(m.org_id) ?? ''}）` : m.name);

  async function add() {
    const member = membersById.get(memberId);
    if (!member) return;
    const msg = checkAddEntry({
      settings,
      event,
      member,
      teamEntries: data.entries,
      memberEntries: entriesByMember.get(member.id) ?? [],
      isAdmin: data.isAdmin,
    });
    if (msg) {
      toast.error(msg);
      return;
    }
    setBusy(true);
    try {
      await api.addEntry({ event_id: event.id, member_id: member.id });
      setMemberId('');
      reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    try {
      await api.removeEntry(event.id, m.id);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <section className={`card event-signup ${pl ? 'event-signup-pl' : ''}`}>
      <header className="event-signup-head">
        <div>
          <div className="title-row">
            <h3>{event.name}</h3>
            <Badge tone={pl ? 'accent' : 'primary'}>{CATEGORY_LABEL[event.category]}</Badge>
            <StatusBadge level={status.level} />
          </div>
          <p className="muted small">
            {teamSizeLabel(event)}
            {event.min_female > 0 && ` · 女性至少 ${event.min_female} 人`}
          </p>
        </div>
        <div className="event-signup-count">
          <span>
            <b>{status.entries.length}</b> / {event.max_per_team}
          </span>
          <span className="muted small">女 {status.female}</span>
        </div>
      </header>
      <ProgressBar value={status.entries.length} max={event.max_per_team} />
      <IssueList issues={status.issues} />

      {status.entries.length > 0 && (
        <ul className="entry-list">
          {status.entries.map((e) => {
            const m = membersById.get(e.member_id);
            if (!m) return null;
            return (
              <li key={e.member_id}>
                <span className="entry-name">
                  {m.name}
                  <Badge tone={m.gender === 'F' ? 'accent' : 'neutral'}>{GENDER_LABEL[m.gender]}</Badge>
                  {merged && <span className="muted small">{orgNames.get(m.org_id)}</span>}
                </span>
                {editable && (
                  <button className="btn btn-xs btn-danger-ghost" onClick={() => remove(m)} aria-label={`移除 ${m.name}`}>
                    移除
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && !isFull && (
        <div className="entry-add">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">選擇隊員加入…</option>
            {candidates.map((m) => {
              const n = entriesByMember.get(m.id)?.length ?? 0;
              const maxed = n >= settings.max_events_per_member;
              return (
                <option key={m.id} value={m.id} disabled={maxed}>
                  {label(m)}・{GENDER_LABEL[m.gender]}・已報 {n} 項{maxed ? '（已達上限）' : ''}
                </option>
              );
            })}
          </select>
          <button className="btn btn-primary" disabled={!memberId || busy} onClick={add}>
            加入
          </button>
        </div>
      )}
      {editable && isFull && <p className="muted small">已達本項目人數上限。</p>}
    </section>
  );
}

export default function EventsPanel({ data }: { data: TeamPageData }) {
  const entriesByMember = useMemo(() => {
    const map = new Map<string, EventEntry[]>();
    for (const e of data.entries) map.set(e.member_id, [...(map.get(e.member_id) ?? []), e]);
    return map;
  }, [data.entries]);

  if (data.members.length === 0) {
    return <EmptyState title="請先建立隊員名單">新增隊員後，即可在這裡為各項目安排選手。</EmptyState>;
  }

  return (
    <div className="grid grid-signup">
      {data.status.events.map((s) => (
        <EventCard key={s.event.id} status={s} data={data} entriesByMember={entriesByMember} />
      ))}
    </div>
  );
}
