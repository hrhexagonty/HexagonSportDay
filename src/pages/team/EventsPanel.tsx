import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { CheckRow, Figure, GenderLegend, GhostFigure } from '../../components/Figure';
import { useToast } from '../../components/Toast';
import { EmptyState, IssueList } from '../../components/ui';
import { api } from '../../lib/api';
import { checkAddEntry, evaluateTeam, isCompanyEvent, levelOf, teamSizeLabel, type EventStatus } from '../../lib/rules';
import { GENDER_LABEL, type EventEntry, type Member } from '../../lib/types';
import type { TeamPageData } from './types';

// 項目報名：隊員以人偶顯示在中央，各項目為上下左右的拖曳框
// - 從中央拖到項目框 = 報名；項目框之間拖曳 = 換項目；拖回中央或按 × = 取消報名
// - 觸控裝置無法 HTML5 拖曳：先點選人偶，再點項目框即可加入

/** 自訂拖曳資料型別，避免接收到其他來源（例如檔案）的拖曳 */
const DRAG_TYPE = 'application/x-hexagon-member';

/** 項目框依排序放在人偶群的上、左、右、下；超過四項的排在最下方 */
const SLOTS = ['top', 'left', 'right', 'bottom'] as const;

/** 項目人數上限不超過此數時，以空白人偶框顯示剩餘名額 */
const MAX_GHOSTS = 24;

interface DragState {
  memberId: string;
  /** 從哪個項目拖出；null = 從中央隊員區 */
  fromEventId: string | null;
}

const sameEntry = (e: EventEntry, eventId: string, memberId: string) => e.event_id === eventId && e.member_id === memberId;

export default function EventsPanel({ data }: { data: TeamPageData }) {
  const { settings, events, members, editable, isAdmin, merged, orgNames, team, reload } = data;
  const toast = useToast();

  // 只處理以隊伍報名的項目；健力（以公司組隊）改版前留下的報名不顯示、也不計入每人項目數
  const serverEntries = useMemo(() => {
    const companyIds = new Set(events.filter(isCompanyEvent).map((e) => e.id));
    return data.entries.filter((e) => !companyIds.has(e.event_id));
  }, [data.entries, events]);

  // 畫面上的報名紀錄：操作後立即反映；沒有進行中的操作時才以伺服器資料為準（避免連續拖曳時閃爍）
  const [entries, setEntries] = useState<EventEntry[]>(serverEntries);
  const inflight = useRef(0);
  useEffect(() => {
    if (inflight.current === 0) setEntries(serverEntries);
  }, [serverEntries]);

  const [drag, setDrag] = useState<DragState | null>(null);
  /** 拖曳經過的放置區：項目 id 或 'pool' */
  const [over, setOver] = useState<string | null>(null);
  /** 點選模式選取的隊員 */
  const [selected, setSelected] = useState<string | null>(null);

  const status = useMemo(() => evaluateTeam(settings, events, members, entries), [settings, events, members, entries]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const eventNames = useMemo(() => new Map(events.map((e) => [e.id, e.name])), [events]);
  const entriesByMember = useMemo(() => {
    const map = new Map<string, EventEntry[]>();
    for (const e of entries) map.set(e.member_id, [...(map.get(e.member_id) ?? []), e]);
    return map;
  }, [entries]);

  // Esc 取消點選
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const selectedMember = selected ? membersById.get(selected) : undefined;
  const female = status.femaleCount;
  const male = status.memberCount - female;

  /** 把隊員放進項目前的檢查（與資料庫 trigger 同規則）；fromEventId 不為 null 代表從其他項目換過來 */
  function blockReason(target: EventStatus, memberId: string, fromEventId: string | null): string | null {
    const member = membersById.get(memberId);
    if (!member) return '找不到隊員';
    const rest = fromEventId ? entries.filter((e) => !sameEntry(e, fromEventId, memberId)) : entries;
    return checkAddEntry({
      settings,
      event: target.event,
      member,
      teamEntries: rest,
      memberEntries: rest.filter((e) => e.member_id === memberId),
      isAdmin,
    });
  }

  async function apply(update: (prev: EventEntry[]) => EventEntry[], op: () => Promise<unknown>) {
    setEntries(update);
    inflight.current += 1;
    try {
      await op();
    } catch (err) {
      toast.error(err);
    } finally {
      inflight.current -= 1;
      // 全部操作完成後重新載入；失敗時伺服器資料會把畫面還原
      if (inflight.current === 0) reload();
    }
  }

  function place(target: EventStatus, memberId: string, fromEventId: string | null) {
    const to = target.event.id;
    if (fromEventId === to) return;
    const reason = blockReason(target, memberId, fromEventId);
    if (reason) {
      toast.error(reason);
      return;
    }
    const entry = { event_id: to, member_id: memberId };
    if (!fromEventId) {
      void apply((prev) => [...prev, entry], () => api.addEntry(entry));
      return;
    }
    const from = fromEventId;
    // 換項目：先移除原項目再加入（避免被每人項目數上限擋住）；加入失敗時放回原項目
    void apply(
      (prev) => prev.map((e) => (sameEntry(e, from, memberId) ? entry : e)),
      async () => {
        await api.removeEntry(from, memberId);
        try {
          await api.addEntry(entry);
        } catch (err) {
          await api.addEntry({ event_id: from, member_id: memberId }).catch(() => undefined);
          throw err;
        }
      },
    );
  }

  function unplace(eventId: string, memberId: string) {
    void apply((prev) => prev.filter((e) => !sameEntry(e, eventId, memberId)), () => api.removeEntry(eventId, memberId));
  }

  // ---- 拖曳 ----
  function startDrag(e: DragEvent, memberId: string, fromEventId: string | null) {
    e.dataTransfer.setData(DRAG_TYPE, memberId);
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ memberId, fromEventId });
    setSelected(null);
  }

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  function dragOver(e: DragEvent, zone: string) {
    if (!drag || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== zone) setOver(zone);
  }

  function dragLeave(e: DragEvent, zone: string) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOver((cur) => (cur === zone ? null : cur));
  }

  function dropOnEvent(e: DragEvent, target: EventStatus) {
    e.preventDefault();
    const d = drag;
    endDrag();
    if (d) place(target, d.memberId, d.fromEventId);
  }

  function dropOnPool(e: DragEvent) {
    e.preventDefault();
    const d = drag;
    endDrag();
    if (d?.fromEventId) unplace(d.fromEventId, d.memberId);
  }

  const toggleSelect = (memberId: string) => setSelected((cur) => (cur === memberId ? null : memberId));

  function figureTitle(m: Member) {
    const mine = entriesByMember.get(m.id) ?? [];
    const org = merged ? ` · ${orgNames.get(m.org_id) ?? ''}` : '';
    const list = mine.length ? `：${mine.map((e) => eventNames.get(e.event_id) ?? '').join('、')}` : '';
    return `${m.name}（${GENDER_LABEL[m.gender]}）${org}\n已報 ${mine.length} / ${settings.max_events_per_member} 項${list}`;
  }

  if (status.events.length === 0) {
    return <EmptyState title="目前沒有以隊伍報名的項目">請洽活動小組。</EmptyState>;
  }

  // 聯隊依公司分組顯示
  const groups = merged
    ? team.org_ids
        .map((orgId) => ({ orgId, list: members.filter((m) => m.org_id === orgId) }))
        .filter((g) => g.list.length > 0)
    : [{ orgId: '', list: members }];

  const pool = (
    <section
      className={`card entry-pool ${drag?.fromEventId ? 'is-target' : ''} ${over === 'pool' ? 'is-over' : ''}`}
      onDragOver={(e) => drag?.fromEventId && dragOver(e, 'pool')}
      onDragLeave={(e) => dragLeave(e, 'pool')}
      onDrop={dropOnPool}
    >
      <header className="entry-pool-head">
        <h3>隊員 {members.length} 人</h3>
        <GenderLegend male={male} female={female} />
      </header>
      {members.length === 0 ? (
        <p className="entry-pool-empty muted small">尚無隊員，請先到「隊員名單」新增隊員。</p>
      ) : (
        <>
          <p className="entry-pool-hint muted small">
            {!editable
              ? '報名已截止，僅供檢視。'
              : drag?.fromEventId
                ? '放開即取消這一項的報名'
                : `拖曳人偶到項目框報名；也可先點選人偶再點項目框。每人最多 ${settings.max_events_per_member} 項。`}
          </p>
          {groups.map((g) => (
            <div key={g.orgId} className="entry-pool-group">
              {merged && <div className="entry-pool-org">{orgNames.get(g.orgId) ?? ''}</div>}
              <div className="figure-grid">
                {g.list.map((m) => {
                  const count = entriesByMember.get(m.id)?.length ?? 0;
                  const maxed = count >= settings.max_events_per_member;
                  return (
                    <Figure
                      key={m.id}
                      member={m}
                      title={figureTitle(m)}
                      badge={count > 0 ? count : undefined}
                      selected={selected === m.id || drag?.memberId === m.id}
                      dimmed={maxed}
                      onSelect={editable ? () => toggleSelect(m.id) : undefined}
                      onDragStart={editable && !maxed ? (e) => startDrag(e, m.id, null) : undefined}
                      onDragEnd={endDrag}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );

  const zones = status.events.map((s, i) => {
    const ev = s.event;
    const n = s.entries.length;
    const home = drag?.fromEventId === ev.id;
    // 拖曳或點選中：判斷能否放進這個項目
    const memberId = drag?.memberId ?? (editable ? selected : null);
    const active = !!memberId && !home;
    const reason = active && memberId ? blockReason(s, memberId, drag?.fromEventId ?? null) : null;
    const clickable = !drag && !!selected && editable;
    const ghosts = ev.max_per_team <= MAX_GHOSTS ? Math.max(0, ev.max_per_team - n) : 0;
    const meta = `${teamSizeLabel(ev)}${ev.min_female > 0 ? ` · 女性至少 ${ev.min_female} 人` : ''}`;
    const cls = [
      'card',
      'entry-zone',
      `entry-zone-${SLOTS[i] ?? 'extra'}`,
      active && (reason ? 'is-blocked' : 'is-target'),
      over === ev.id && 'is-over',
      clickable && 'is-clickable',
      s.level === 'complete' && 'is-complete',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <section
        key={ev.id}
        className={cls}
        onDragOver={(e) => dragOver(e, ev.id)}
        onDragLeave={(e) => dragLeave(e, ev.id)}
        onDrop={(e) => dropOnEvent(e, s)}
        onClick={clickable ? () => selected && place(s, selected, null) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' && selected) place(s, selected, null);
              }
            : undefined
        }
        aria-label={clickable ? `把 ${selectedMember?.name ?? ''} 加入「${ev.name}」` : undefined}
      >
        <header className="entry-zone-head">
          <div className="entry-zone-title">
            <h3>{ev.name}</h3>
            <span className={`small ${reason ? 'entry-zone-reason' : 'muted'}`}>{reason ?? meta}</span>
          </div>
          <div className="entry-zone-count">
            <b>{n}</b>/ {ev.max_per_team}
          </div>
        </header>
        <div className="entry-zone-body">
          {s.entries.map((e) => {
            const m = membersById.get(e.member_id);
            if (!m) return null;
            return (
              <Figure
                key={m.id}
                member={m}
                title={figureTitle(m)}
                selected={selected === m.id || drag?.memberId === m.id}
                onSelect={editable ? () => toggleSelect(m.id) : undefined}
                onDragStart={editable ? (de) => startDrag(de, m.id, ev.id) : undefined}
                onDragEnd={endDrag}
                onRemove={editable ? () => unplace(ev.id, m.id) : undefined}
                removeLabel={`取消 ${m.name} 的這項報名`}
              />
            );
          })}
          {Array.from({ length: ghosts }, (_, k) => (
            <GhostFigure key={`ghost-${k}`} />
          ))}
          {n === 0 && ghosts === 0 && <span className="entry-zone-empty">拖曳隊員到這裡</span>}
        </div>
      </section>
    );
  });

  const sizeLevel = levelOf(status.sizeIssues);

  return (
    <div className="stack-lg">
      <div className="entry-board">
        {pool}
        {zones}
      </div>

      {selectedMember && (
        <div className="entry-selbar" role="status">
          <span>
            已選取 <b>{selectedMember.name}</b>：點選項目框即可加入
          </span>
          <button className="btn btn-sm" onClick={() => setSelected(null)}>
            取消選取
          </button>
        </div>
      )}

      <section className="card check-card">
        <div className="check-head">
          <h2>報名檢核</h2>
          <GenderLegend />
        </div>
        <ul className="check-rows">
          <CheckRow
            label="隊伍人數"
            male={male}
            female={female}
            max={settings.team_max_size}
            min={settings.team_min_size}
            level={sizeLevel}
            note={
              status.sizeIssues.map((i) => i.message).join('；') ||
              `符合規定（${settings.team_min_size}–${settings.team_max_size} 人）`
            }
          />
          {status.events.map((s) => (
            <CheckRow
              key={s.event.id}
              label={s.event.name}
              male={s.entries.length - s.female}
              female={s.female}
              max={s.event.max_per_team}
              min={s.event.min_per_team}
              level={s.level}
              note={s.issues.map((i) => i.message).join('；') || '人數已達標'}
            />
          ))}
        </ul>
        <IssueList issues={status.loadIssues} />
        <p className="muted small">
          每人最多報名 {settings.max_events_per_member} 項。健力比賽改以公司為單位報名，將另行開放。
        </p>
      </section>
    </div>
  );
}
