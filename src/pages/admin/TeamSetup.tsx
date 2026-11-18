// 管理員：隊伍配置
// 01 先建立公司 → 02 再建立隊伍 → 03 把公司拖曳到隊伍底下（一隊有多家公司即為聯隊；一家公司可加入多隊）
import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Badge, Eyebrow, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull } from '../../lib/format';
import type { Organization, Team } from '../../lib/types';
import type { AdminData } from './types';

const DRAG_TYPE = 'application/x-hexagon-org';

/** 拖曳中的公司；fromTeamId = 從哪一隊拖出（null = 從公司清單拖出） */
interface DragPayload {
  orgId: string;
  fromTeamId: string | null;
}

/** 解析「一行一個」的名稱清單（去除空白與重複） */
function parseNames(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'zh-TW');

/** 拖放目標：拖曳經過時標示，放開時回傳公司資訊 */
function useDropZone(onDrop: (p: DragPayload) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) onDrop(JSON.parse(raw) as DragPayload);
      },
    },
  };
}

/** 批次新增（一行一個名稱） */
function BulkAdd({
  no,
  title,
  hint,
  placeholder,
  existing,
  onAdd,
  onDone,
}: {
  no: string;
  title: string;
  hint: string;
  placeholder: string;
  existing: string[];
  onAdd: (name: string) => Promise<void>;
  /** 有新增成功時呼叫（重新載入後台資料） */
  onDone: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const count = parseNames(text).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const names = parseNames(text);
    const dup = names.filter((n) => existing.includes(n));
    const todo = names.filter((n) => !existing.includes(n));
    if (todo.length === 0) {
      toast.error(dup.length ? `「${dup.join('、')}」已存在` : '請輸入名稱');
      return;
    }
    setBusy(true);
    let done = 0;
    try {
      for (const name of todo) {
        await onAdd(name);
        done++;
      }
      toast.ok(`已新增 ${done} 筆${dup.length ? `（略過已存在的 ${dup.length} 筆）` : ''}`);
      setText('');
    } catch (err) {
      toast.error(`已新增 ${done} 筆，「${todo[done]}」失敗：${err instanceof Error ? err.message : String(err)}`);
      setText(todo.slice(done).join('\n'));
    } finally {
      setBusy(false);
      if (done > 0) onDone();
    }
  }

  return (
    <form className="card stack setup-step" onSubmit={submit}>
      <div>
        <Eyebrow>Step {no}</Eyebrow>
        <h3>{title}</h3>
        <p className="muted small">{hint}</p>
      </div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={busy || count === 0}>
          {busy ? '新增中…' : `新增${count > 1 ? ` ${count} 筆` : ''}`}
        </button>
      </div>
    </form>
  );
}

/** 可拖曳的公司膠囊 */
function OrgChip({
  org,
  fromTeamId,
  free = false,
  onRemove,
}: {
  org: Organization;
  fromTeamId: string | null;
  /** 尚未加入任何隊伍 */
  free?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`drag-chip${free ? ' drag-chip-free' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ orgId: org.id, fromTeamId } satisfies DragPayload));
        e.dataTransfer.effectAllowed = fromTeamId ? 'move' : 'copy';
      }}
      title={`${org.name}（拖曳到隊伍底下）`}
    >
      <span className="drag-chip-grip" aria-hidden>
        ⠿
      </span>
      <span className="drag-chip-name">{org.name}</span>
      {onRemove && (
        <button type="button" className="drag-chip-x" aria-label={`從此隊移除 ${org.name}`} onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

/** 公司資料編輯（名稱、聯絡人、電話） */
function OrgEditForm({ org, onDone }: { org: Organization; onDone: (saved: boolean) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: org.name, contact: org.contact_name ?? '', phone: org.contact_phone ?? '' });

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.updateOrganization(org.id, {
        name: form.name.trim(),
        contact_name: blankToNull(form.contact),
        contact_phone: blankToNull(form.phone),
      });
      toast.ok('公司資料已更新');
      onDone(true);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <Field label="公司名稱">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="row-2">
        <Field label="聯絡人">
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </Field>
        <Field label="聯絡電話">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-sm">儲存</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDone(false)}>
          取消
        </button>
      </div>
    </form>
  );
}

/** 左側公司清單：拖出 = 加入隊伍；從隊伍拖回 = 移除 */
function OrgPool({
  orgs,
  teamCount,
  onDropOrg,
  onDelete,
  onChanged,
}: {
  orgs: Organization[];
  teamCount: (o: Organization) => number;
  onDropOrg: (p: DragPayload) => void;
  onDelete: (o: Organization) => void;
  onChanged: () => void;
}) {
  const zone = useDropZone(onDropOrg);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <aside className={`card dnd-pool${zone.over ? ' is-over' : ''}`} {...zone.props}>
      <div className="dnd-pool-head">
        <h3>公司清單</h3>
        <span className="muted small">{orgs.length} 家</span>
      </div>
      <p className="muted small">拖曳到右側隊伍 = 加入；從隊伍拖回這裡 = 移除。一家公司可加入多隊。</p>
      <ul className="dnd-pool-list">
        {[...orgs].sort(byName).map((o) => {
          const n = teamCount(o);
          if (o.id === editingId) {
            return (
              <li key={o.id} className="dnd-pool-edit">
                <OrgEditForm
                  org={o}
                  onDone={(saved) => {
                    setEditingId(null);
                    if (saved) onChanged();
                  }}
                />
              </li>
            );
          }
          return (
            <li key={o.id}>
              <OrgChip org={o} fromTeamId={null} free={n === 0} />
              <span className={`dnd-pool-meta${n === 0 ? ' warn-text' : ''}`}>{n === 0 ? '未加入' : `${n} 隊`}</span>
              <span className="dnd-pool-actions">
                <button className="btn btn-xs btn-ghost" onClick={() => setEditingId(o.id)}>
                  編輯
                </button>
                <button className="btn btn-xs btn-danger-ghost" onClick={() => onDelete(o)}>
                  刪除
                </button>
              </span>
            </li>
          );
        })}
        {orgs.length === 0 && <li className="muted small">尚未建立公司</li>}
      </ul>
    </aside>
  );
}

/** 右側隊伍卡：把公司拖進來 */
function TeamCard({
  team,
  orgs,
  orgIds,
  onDropOrg,
  onRemoveOrg,
  onRename,
  onDelete,
}: {
  team: Team;
  orgs: Organization[];
  /** 目前畫面上的參與公司（含尚未存檔完成的拖放） */
  orgIds: string[];
  onDropOrg: (p: DragPayload) => void;
  onRemoveOrg: (orgId: string) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const zone = useDropZone(onDropOrg);
  const mine = orgIds.map((id) => orgs.find((o) => o.id === id)).filter((o): o is Organization => !!o);
  const others = orgs.filter((o) => !orgIds.includes(o.id)).sort(byName);

  return (
    <section
      className={`card drop-card${orgIds.length === 0 ? ' drop-card-free' : ''}${zone.over ? ' is-over' : ''}`}
      {...zone.props}
    >
      <div className="drop-card-head">
        <div className="drop-card-title">
          <h3>{team.name}</h3>
          <span className={orgIds.length === 0 ? 'warn-text small' : 'muted small'}>
            {orgIds.length === 0 ? '尚未加入公司' : `${orgIds.length} 家公司`} {orgIds.length > 1 && <Badge tone="accent">聯隊</Badge>}
          </span>
        </div>
        <div className="actions">
          <button className="btn btn-xs btn-ghost" onClick={onRename}>
            改名
          </button>
          <button className="btn btn-xs btn-danger-ghost" onClick={onDelete}>
            刪除
          </button>
        </div>
      </div>

      <div className="drop-card-body">
        {mine.length === 0 ? (
          <span className="drop-card-empty">把公司拖曳到這裡</span>
        ) : (
          mine.map((o) => <OrgChip key={o.id} org={o} fromTeamId={team.id} onRemove={() => onRemoveOrg(o.id)} />)
        )}
      </div>

      {/* 觸控裝置無法拖曳時的替代操作 */}
      {others.length > 0 && (
        <select
          className="select-sm"
          value=""
          aria-label={`加入公司到 ${team.name}`}
          onChange={(e) => e.target.value && onDropOrg({ orgId: e.target.value, fromTeamId: null })}
        >
          <option value="">＋ 加入公司…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

export default function TeamSetup({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, members, contacts, settings } = data;
  const toast = useToast();
  const [onlyFree, setOnlyFree] = useState(false);
  const [search, setSearch] = useState('');
  // 拖放後先更新畫面，等重新載入完成再以伺服器資料為準
  const [pending, setPending] = useState<Record<string, string[]>>({});
  useEffect(() => {
    setPending((p) => {
      const next = { ...p };
      for (const t of teams) if (next[t.id] && sameSet(next[t.id], t.org_ids)) delete next[t.id];
      return next;
    });
  }, [teams]);

  const orgsOf = (t: Team) => pending[t.id] ?? t.org_ids;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? '—';
  const teamById = (id: string | null) => teams.find((t) => t.id === id);
  const free = teams.filter((t) => orgsOf(t).length === 0).length;
  const merged = teams.filter((t) => orgsOf(t).length > 1).length;
  const shown = teams
    .filter((t) => (!onlyFree || orgsOf(t).length === 0) && (!search || t.name.includes(search)))
    .sort(byName);

  /** 儲存隊伍的參與公司；removedOrgId 有值時先檢查隊員與窗口 */
  async function save(team: Team, next: string[], removedOrgId: string | null): Promise<boolean> {
    if (removedOrgId) {
      const n = members.filter((m) => m.team_id === team.id && m.org_id === removedOrgId).length;
      if (n) {
        toast.error(`「${orgName(removedOrgId)}」在「${team.name}」仍有 ${n} 名隊員，請先刪除其隊員再移除`);
        return false;
      }
      const c = contacts.filter((x) => x.team_id === team.id && x.org_id === removedOrgId).length;
      if (c && !confirm(`移除後，「${orgName(removedOrgId)}」在「${team.name}」的 ${c} 位窗口將解除綁定，該組邀請碼也會作廢。確定移除？`)) {
        return false;
      }
    }
    setPending((p) => ({ ...p, [team.id]: next }));
    try {
      await api.setTeamOrgs(team.id, next);
      onChanged();
      return true;
    } catch (err) {
      setPending((p) => {
        const rest = { ...p };
        delete rest[team.id];
        return rest;
      });
      toast.error(err);
      return false;
    }
  }

  const removeOrg = (team: Team, orgId: string) =>
    save(
      team,
      orgsOf(team).filter((o) => o !== orgId),
      orgId,
    );

  async function dropOnTeam(p: DragPayload, target: Team) {
    if (p.fromTeamId === target.id) return;
    if (orgsOf(target).includes(p.orgId)) {
      toast.info(`「${orgName(p.orgId)}」已在「${target.name}」`);
      return;
    }
    // 從其他隊伍拖過來 = 移動：先從原隊移除（會檢查隊員、確認窗口），成功才加入新隊
    const source = teamById(p.fromTeamId);
    if (source && !(await removeOrg(source, p.orgId))) return;
    await save(target, [...orgsOf(target), p.orgId], null);
  }

  function dropOnPool(p: DragPayload) {
    const source = teamById(p.fromTeamId);
    if (source) void removeOrg(source, p.orgId);
  }

  async function renameTeam(t: Team) {
    const name = prompt('新的隊名', t.name)?.trim();
    if (!name || name === t.name) return;
    try {
      await api.updateTeam(t.id, { name });
      toast.ok(`已改名為「${name}」`);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function deleteTeam(t: Team) {
    const n = members.filter((m) => m.team_id === t.id).length;
    if (!confirm(`確定刪除「${t.name}」？${n ? `隊上 ${n} 名隊員與項目報名將一併刪除，` : ''}窗口綁定與邀請碼也會失效，此動作無法復原。`)) return;
    try {
      await api.deleteTeam(t.id);
      toast.ok('隊伍已刪除');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function deleteOrg(o: Organization) {
    const n = members.filter((m) => m.org_id === o.id).length;
    const c = contacts.filter((x) => x.org_id === o.id).length;
    const parts = [n ? `${n} 名隊員` : '', c ? `${c} 筆窗口綁定` : ''].filter(Boolean);
    if (!confirm(`確定刪除公司「${o.name}」？${parts.length ? `此公司在各隊的 ${parts.join('、')}與邀請碼將一併刪除；` : ''}隊伍會保留。此動作無法復原。`)) {
      return;
    }
    try {
      await api.deleteOrganization(o.id);
      toast.ok('公司已刪除');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <span className={teams.length === settings.total_team_target && free === 0 ? 'muted' : 'warn-text'}>
          公司 <b>{orgs.length}</b> 家 · 隊伍 <b>{teams.length}</b> / 目標 {settings.total_team_target} 隊 · 聯隊 {merged} 隊 ·
          未加入公司 {free} 隊
        </span>
      </div>

      <div className="grid setup-inputs">
        <BulkAdd
          no="01"
          title="公司名稱"
          hint="先建立所有參賽公司。一行一家，可一次貼上多家。"
          placeholder={'六角科技\n六角建設\n六角物流'}
          existing={orgs.map((o) => o.name)}
          onAdd={(name) => api.createOrganization({ name, contact_name: null, contact_phone: null })}
          onDone={onChanged}
        />
        <BulkAdd
          no="02"
          title="隊伍名稱"
          hint="再建立所有隊伍。一行一隊；建立後會出現在下方，等待把公司拖進來。"
          placeholder={'閃電隊\n火箭隊\n醫材能源文創 聯隊'}
          existing={teams.map((t) => t.name)}
          onAdd={async (name) => {
            await api.createTeam({ name, captain_name: null, captain_phone: null }, []);
          }}
          onDone={onChanged}
        />
      </div>

      <section className="stack">
        <div>
          <Eyebrow>Step 03</Eyebrow>
          <h3>拖曳公司到隊伍底下</h3>
          <p className="muted small">
            從左側「公司清單」拖到隊伍 = 加入；一隊有多家公司即為聯隊，一家公司也可加入多隊。在隊伍之間拖曳 = 移動；按 × 或拖回公司清單 = 移除。
            觸控裝置請使用各隊下方的「＋ 加入公司」選單。各隊邀請碼請至「窗口與邀請碼」查看並發給各隊代表。
          </p>
        </div>
        {teams.length === 0 ? (
          <div className="notice notice-info">請先在 Step 02 建立隊伍。</div>
        ) : (
          <div className="dnd-board">
            <OrgPool
              orgs={orgs}
              teamCount={(o) => teams.filter((t) => orgsOf(t).includes(o.id)).length}
              onDropOrg={dropOnPool}
              onDelete={deleteOrg}
              onChanged={onChanged}
            />
            <div>
              <div className="drop-grid-head">
                <input className="search" placeholder="搜尋隊名" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="switch small">
                  <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
                  只看尚未加入公司的隊伍
                </label>
              </div>
              <div className="drop-grid">
                {shown.map((t) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    orgs={orgs}
                    orgIds={orgsOf(t)}
                    onDropOrg={(p) => void dropOnTeam(p, t)}
                    onRemoveOrg={(orgId) => void removeOrg(t, orgId)}
                    onRename={() => renameTeam(t)}
                    onDelete={() => deleteTeam(t)}
                  />
                ))}
                {shown.length === 0 && <p className="muted small">{onlyFree ? '所有隊伍都已加入公司' : '沒有符合條件的隊伍'}</p>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
