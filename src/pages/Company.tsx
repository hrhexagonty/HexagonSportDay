import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Figure, GenderLegend, GhostFigure } from '../components/Figure';
import { useToast } from '../components/Toast';
import { Badge, EmptyState, ErrorBox, Eyebrow, IssueList, Loading } from '../components/ui';
import { api } from '../lib/api';
import {
  checkAddSquadMember,
  checkSubmitSquad,
  companyEvents,
  evaluateSquad,
  registrationOpen,
  teamSizeLabel,
} from '../lib/rules';
import { GENDER_LABEL, type OrgSquad, type RosterMember, type Settings, type SportEvent } from '../lib/types';
import { useAsync } from '../lib/useAsync';

// 我的公司（健力報名）：顯示公司在各分隊的同仁（人偶，只有姓名與性別），以拖曳組成公司健力隊伍
// - 「組成隊伍」建立一組空白報名區塊（草稿）；同仁拖進區塊即加入，拖回左側或按 × 移出
// - 送出時檢查人數與女性下限（與 DB trigger 同規則），通過才成隊；截止前可取消送出再修改
// - 觸控裝置：先點人偶，再點隊伍區塊

const DRAG_TYPE = 'application/x-hexagon-colleague';

interface DragState {
  memberId: string;
  /** 從哪一隊拖出；null = 從左側同仁區 */
  fromSquadId: string | null;
}

/** 「健力比賽」→「健力」，用於按鈕與隊伍名稱 */
const shortName = (ev: SportEvent) => ev.name.replace(/(比賽|競賽)$/, '') || ev.name;

function CompanyBoard({
  orgId,
  settings,
  events,
  roster,
  serverSquads,
  reload,
}: {
  orgId: string;
  settings: Settings;
  events: SportEvent[];
  roster: RosterMember[];
  serverSquads: OrgSquad[];
  reload: () => void;
}) {
  const toast = useToast();
  const editable = registrationOpen(settings);
  const cEvents = companyEvents(events);

  // 操作後立即反映；沒有進行中的操作時才以伺服器資料為準
  const [squads, setSquads] = useState<OrgSquad[]>(serverSquads);
  const inflight = useRef(0);
  useEffect(() => {
    if (inflight.current === 0) setSquads(serverSquads);
  }, [serverSquads]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const byId = useMemo(() => new Map(roster.map((m) => [m.id, m])), [roster]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  /** 依建立時間排序（與後台編號一致） */
  const ordered = useMemo(() => [...squads].sort((a, b) => a.created_at.localeCompare(b.created_at)), [squads]);
  /** 隊伍名稱：依項目分別編號，例如「健力隊伍 #2」 */
  const squadLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of cEvents) {
      ordered
        .filter((s) => s.event_id === ev.id)
        .forEach((s, i) => map.set(s.id, `${shortName(ev)}隊伍 #${i + 1}`));
    }
    return map;
  }, [ordered, cEvents]);
  /** 同仁 → 所在隊伍 */
  const squadOf = useMemo(() => {
    const map = new Map<string, OrgSquad>();
    for (const s of squads) for (const id of s.member_ids) map.set(id, s);
    return map;
  }, [squads]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const genders = (s: OrgSquad) => s.member_ids.map((id) => byId.get(id)?.gender ?? 'M');

  /** 把同仁放進隊伍前的檢查；fromSquadId 不為 null 代表從其他隊換過來 */
  function blockReason(target: OrgSquad, memberId: string, fromSquadId: string | null): string | null {
    const member = byId.get(memberId);
    const event = eventById.get(target.event_id);
    if (!member || !event) return '找不到同仁或項目';
    const from = fromSquadId ? squads.find((s) => s.id === fromSquadId) : undefined;
    if (from?.submitted_at) return '已送出的隊伍不可調整，請先取消送出';
    const eventSquads = squads
      .filter((s) => s.event_id === target.event_id)
      .map((s) => (s.id === fromSquadId ? { ...s, member_ids: s.member_ids.filter((x) => x !== memberId) } : s));
    return checkAddSquadMember({
      settings,
      event,
      squad: eventSquads.find((s) => s.id === target.id) ?? target,
      member,
      eventSquads,
      isAdmin: false,
    });
  }

  async function apply(update: (prev: OrgSquad[]) => OrgSquad[], op: () => Promise<unknown>) {
    setSquads(update);
    inflight.current += 1;
    try {
      await op();
    } catch (err) {
      toast.error(err);
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0) reload();
    }
  }

  const withMembers = (prev: OrgSquad[], id: string, fn: (ids: string[]) => string[]) =>
    prev.map((s) => (s.id === id ? { ...s, member_ids: fn(s.member_ids) } : s));

  function place(target: OrgSquad, memberId: string, fromSquadId: string | null) {
    if (fromSquadId === target.id) return;
    const reason = blockReason(target, memberId, fromSquadId);
    if (reason) {
      toast.error(reason);
      return;
    }
    if (!fromSquadId) {
      void apply(
        (prev) => withMembers(prev, target.id, (ids) => [...ids, memberId]),
        () => api.addSquadMember(target.id, memberId),
      );
      return;
    }
    const from = fromSquadId;
    // 換隊：先移出原隊再加入；加入失敗時放回原隊
    void apply(
      (prev) =>
        withMembers(
          withMembers(prev, from, (ids) => ids.filter((x) => x !== memberId)),
          target.id,
          (ids) => [...ids, memberId],
        ),
      async () => {
        await api.removeSquadMember(from, memberId);
        try {
          await api.addSquadMember(target.id, memberId);
        } catch (err) {
          await api.addSquadMember(from, memberId).catch(() => undefined);
          throw err;
        }
      },
    );
  }

  function unplace(squad: OrgSquad, memberId: string) {
    if (squad.submitted_at) {
      toast.error('已送出的隊伍不可調整，請先取消送出');
      return;
    }
    void apply(
      (prev) => withMembers(prev, squad.id, (ids) => ids.filter((x) => x !== memberId)),
      () => api.removeSquadMember(squad.id, memberId),
    );
  }

  /** 建立 / 刪除 / 送出：等伺服器完成再重新載入 */
  async function act(key: string, op: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await op();
      if (ok) toast.ok(ok);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
      if (inflight.current === 0) reload();
    }
  }

  function submit(squad: OrgSquad, event: SportEvent) {
    const msg = checkSubmitSquad(event, genders(squad));
    if (msg) {
      toast.error(`無法成隊：${msg}`);
      return;
    }
    void act(squad.id, () => api.setSquadSubmitted(squad.id, true), `「${squadLabel.get(squad.id)}」已送出成隊`);
  }

  // ---- 拖曳 ----
  function startDrag(e: DragEvent, memberId: string, fromSquadId: string | null) {
    e.dataTransfer.setData(DRAG_TYPE, memberId);
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ memberId, fromSquadId });
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
  function dropOnSquad(e: DragEvent, target: OrgSquad) {
    e.preventDefault();
    const d = drag;
    endDrag();
    if (d) place(target, d.memberId, d.fromSquadId);
  }
  function dropOnPool(e: DragEvent) {
    e.preventDefault();
    const d = drag;
    endDrag();
    const from = d?.fromSquadId ? squads.find((s) => s.id === d.fromSquadId) : undefined;
    if (d && from) unplace(from, d.memberId);
  }

  const toggleSelect = (id: string) => setSelected((cur) => (cur === id ? null : id));

  function title(m: RosterMember) {
    const s = squadOf.get(m.id);
    return `${m.name}（${GENDER_LABEL[m.gender]}）· ${m.team_name}${s ? `\n已加入「${squadLabel.get(s.id)}」` : ''}`;
  }

  // ---- 同仁區（依分隊分組、可搜尋） ----
  const keyword = search.trim().toLowerCase();
  const shown = keyword
    ? roster.filter((m) => m.name.toLowerCase().includes(keyword) || m.team_name.toLowerCase().includes(keyword))
    : roster;
  const groups: { teamId: string; teamName: string; list: RosterMember[] }[] = [];
  for (const m of shown) {
    const g = groups.find((x) => x.teamId === m.team_id);
    if (g) g.list.push(m);
    else groups.push({ teamId: m.team_id, teamName: m.team_name, list: [m] });
  }
  const female = roster.filter((m) => m.gender === 'F').length;
  const selectedMember = selected ? byId.get(selected) : undefined;
  const draggingFromSquad = !!drag?.fromSquadId;

  const pool = (
    <section
      className={`card entry-pool company-pool ${draggingFromSquad ? 'is-target' : ''} ${over === 'pool' ? 'is-over' : ''}`}
      onDragOver={(e) => draggingFromSquad && dragOver(e, 'pool')}
      onDragLeave={(e) => dragLeave(e, 'pool')}
      onDrop={dropOnPool}
    >
      <header className="entry-pool-head">
        <h3>公司同仁 {roster.length} 人</h3>
        <GenderLegend male={roster.length - female} female={female} />
      </header>
      <input
        className="search company-search"
        type="search"
        placeholder="搜尋姓名或分隊"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="搜尋同仁"
      />
      <p className="entry-pool-hint muted small">
        {!editable
          ? '報名已截止，僅供檢視。'
          : draggingFromSquad
            ? '放開即把同仁移出隊伍'
            : '拖曳人偶到隊伍區塊；也可先點人偶再點隊伍。每人只能參加一隊。'}
      </p>
      {roster.length === 0 ? (
        <p className="entry-pool-empty muted small">各分隊尚未登錄這家公司的同仁，請先在「我的隊伍」的隊員名單新增。</p>
      ) : groups.length === 0 ? (
        <p className="entry-pool-empty muted small">找不到符合「{search}」的同仁</p>
      ) : (
        groups.map((g) => (
          <div key={g.teamId} className="entry-pool-group">
            <div className="entry-pool-org">
              {g.teamName}（{g.list.length}）
            </div>
            <div className="figure-grid">
              {g.list.map((m) => {
                const s = squadOf.get(m.id);
                const no = s ? squadLabel.get(s.id)?.split('#')[1] : undefined;
                return (
                  <Figure
                    key={m.id}
                    member={m}
                    title={title(m)}
                    badge={no ? `#${no}` : undefined}
                    dimmed={!!s}
                    selected={selected === m.id || drag?.memberId === m.id}
                    onSelect={editable ? () => toggleSelect(m.id) : undefined}
                    onDragStart={editable && !s ? (e) => startDrag(e, m.id, null) : undefined}
                    onDragEnd={endDrag}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );

  // 以函式產生（不要宣告成內部元件，否則每次重繪都會重新掛載、打斷拖曳）
  function renderSquad(squad: OrgSquad, event: SportEvent) {
    const st = evaluateSquad(event, genders(squad));
    const submitted = !!squad.submitted_at;
    const home = drag?.fromSquadId === squad.id;
    const memberId = drag?.memberId ?? (editable ? selected : null);
    const active = !!memberId && !home;
    const reason = active && memberId ? blockReason(squad, memberId, drag?.fromSquadId ?? null) : null;
    const clickable = !drag && !!selected && editable && !submitted;
    const ghosts = Math.max(0, event.max_per_team - squad.member_ids.length);
    const cls = [
      'card',
      'entry-zone',
      'squad-card',
      submitted && 'is-submitted',
      active && (reason ? 'is-blocked' : 'is-target'),
      over === squad.id && 'is-over',
      clickable && 'is-clickable',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <section
        key={squad.id}
        className={cls}
        onDragOver={(e) => dragOver(e, squad.id)}
        onDragLeave={(e) => dragLeave(e, squad.id)}
        onDrop={(e) => dropOnSquad(e, squad)}
        onClick={clickable ? () => selected && place(squad, selected, null) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' && selected) place(squad, selected, null);
              }
            : undefined
        }
        aria-label={clickable ? `把 ${selectedMember?.name ?? ''} 加入「${squadLabel.get(squad.id)}」` : undefined}
      >
        <header className="entry-zone-head">
          <div className="entry-zone-title">
            <div className="title-row">
              <h3>{squadLabel.get(squad.id)}</h3>
              {submitted ? <Badge tone="ok">已成隊</Badge> : <Badge tone="warn">草稿</Badge>}
            </div>
            <span className={`small ${reason ? 'entry-zone-reason' : 'muted'}`}>
              {reason ??
                `女 ${st.female} 人（至少 ${event.min_female} 人）· 男 ${st.count - st.female} 人`}
            </span>
          </div>
          <div className="entry-zone-count">
            <b>{st.count}</b>/ {event.max_per_team}
          </div>
        </header>
        <div className="entry-zone-body">
          {squad.member_ids.map((id) => {
            const m = byId.get(id);
            if (!m) return null;
            const canEdit = editable && !submitted;
            return (
              <Figure
                key={id}
                member={m}
                title={title(m)}
                selected={selected === id || drag?.memberId === id}
                onSelect={editable ? () => toggleSelect(id) : undefined}
                onDragStart={canEdit ? (e) => startDrag(e, id, squad.id) : undefined}
                onDragEnd={endDrag}
                onRemove={canEdit ? () => unplace(squad, id) : undefined}
                removeLabel={`把 ${m.name} 移出隊伍`}
              />
            );
          })}
          {Array.from({ length: ghosts }, (_, k) => (
            <GhostFigure key={`ghost-${k}`} />
          ))}
        </div>
        {!submitted && <IssueList issues={st.issues} />}
        {editable && (
          <div className="squad-actions" onClick={(e) => e.stopPropagation()}>
            {submitted ? (
              <button
                className="btn btn-sm"
                disabled={busy === squad.id}
                onClick={() => {
                  if (confirm(`取消送出「${squadLabel.get(squad.id)}」？取消後可再調整成員，需重新送出才算成隊。`)) {
                    void act(squad.id, () => api.setSquadSubmitted(squad.id, false), '已取消送出，可再調整成員');
                  }
                }}
              >
                取消送出
              </button>
            ) : (
              <>
                <button
                  className="btn btn-danger-ghost btn-sm"
                  disabled={busy === squad.id}
                  onClick={() => {
                    if (confirm(`刪除「${squadLabel.get(squad.id)}」？隊伍內的同仁會移回未分隊。`)) {
                      void act(squad.id, () => api.deleteOrgSquad(squad.id), '隊伍已刪除');
                    }
                  }}
                >
                  刪除隊伍
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy === squad.id} onClick={() => submit(squad, event)}>
                  {busy === squad.id ? '送出中…' : '送出'}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    );
  }

  if (cEvents.length === 0) {
    return <EmptyState title="目前沒有以公司為單位組隊的項目">請洽活動小組。</EmptyState>;
  }

  return (
    <>
      <div className="company-board">
        {pool}
        <div className="stack-lg">
          {cEvents.map((ev) => {
            const list = ordered.filter((s) => s.event_id === ev.id);
            const done = list.filter((s) => s.submitted_at).length;
            return (
              <section key={ev.id} className="stack">
                <div className="squad-section-head">
                  <div>
                    <h2>{ev.name}</h2>
                    <p className="muted small">
                      以公司為單位組隊 · {teamSizeLabel(ev)} · 女性至少 {ev.min_female} 人 · 一人只能參加一隊 · 已成隊 {done} /{' '}
                      {list.length} 隊
                    </p>
                  </div>
                  {editable && (
                    <button
                      className="btn btn-primary"
                      disabled={busy === `new-${ev.id}`}
                      onClick={() => act(`new-${ev.id}`, () => api.createOrgSquad(orgId, ev.id))}
                    >
                      ＋ 組成{shortName(ev)}隊伍
                    </button>
                  )}
                </div>
                {list.length === 0 ? (
                  <div className="empty">
                    <div className="empty-title">尚未組隊</div>
                    <div className="empty-body">
                      {editable ? `按「組成${shortName(ev)}隊伍」產生一組 ${ev.max_per_team} 人的報名區塊，再把同仁拖進去。` : '報名已截止。'}
                    </div>
                  </div>
                ) : (
                  list.map((s) => renderSquad(s, ev))
                )}
              </section>
            );
          })}
        </div>
      </div>

      {selectedMember && (
        <div className="entry-selbar" role="status">
          <span>
            已選取 <b>{selectedMember.name}</b>：點選隊伍區塊即可加入
          </span>
          <button className="btn btn-sm" onClick={() => setSelected(null)}>
            取消選取
          </button>
        </div>
      )}
    </>
  );
}

export default function CompanyPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();

  // 帳號代表的公司（可能代表多家公司的多支隊伍）
  const orgs = useMemo(() => {
    const map = new Map<string, { orgId: string; orgName: string; teams: string[] }>();
    for (const t of session?.teams ?? []) {
      const o = map.get(t.orgId) ?? { orgId: t.orgId, orgName: t.orgName, teams: [] };
      o.teams.push(t.teamName);
      map.set(t.orgId, o);
    }
    return [...map.values()];
  }, [session]);
  const orgId = orgs.find((o) => o.orgId === params.get('org'))?.orgId ?? orgs[0]?.orgId;

  const q = useAsync(async () => {
    if (!orgId) return null;
    const [settings, events, roster, squads] = await Promise.all([
      api.getSettings(),
      api.listEvents(),
      api.listOrgRoster(orgId),
      api.listOrgSquads(orgId),
    ]);
    return { settings, events, roster, squads };
  }, [orgId]);

  if (!orgId) return <Navigate to="/join" replace />;
  const org = orgs.find((o) => o.orgId === orgId)!;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Eyebrow>My company</Eyebrow>
          <h1>{org.orgName}</h1>
          <p className="muted">
            你是「{org.teams.join('、')}」的窗口。這裡列出公司在各分隊的所有同仁（只顯示姓名與性別），用來組成公司健力隊伍。
          </p>
        </div>
      </div>

      {orgs.length > 1 && (
        <div className="chips company-switch" role="tablist" aria-label="切換公司">
          {orgs.map((o) => (
            <button
              key={o.orgId}
              type="button"
              role="tab"
              aria-selected={o.orgId === orgId}
              className={`chip ${o.orgId === orgId ? 'chip-active' : ''}`}
              onClick={() => setParams({ org: o.orgId })}
            >
              {o.orgName}
            </button>
          ))}
        </div>
      )}

      {!q.data ? (
        q.error ? (
          <ErrorBox message={q.error} onRetry={q.reload} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          {!registrationOpen(q.data.settings) && <div className="notice notice-err">報名已截止，資料僅供檢視。</div>}
          <CompanyBoard
            key={orgId}
            orgId={orgId}
            settings={q.data.settings}
            events={q.data.events}
            roster={q.data.roster}
            serverSquads={q.data.squads}
            reload={q.reload}
          />
        </>
      )}
    </div>
  );
}
