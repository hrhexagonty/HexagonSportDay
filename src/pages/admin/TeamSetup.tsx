// 管理員：隊伍配置
// 01 先建立公司 → 02 再建立隊伍 → 03 把隊伍拖曳到公司底下（同一隊拖到多家公司即為聯隊）
import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Badge, Eyebrow, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull } from '../../lib/format';
import type { Organization, Team } from '../../lib/types';
import type { AdminData } from './types';

const DRAG_TYPE = 'application/x-hexagon-team';

/** 拖曳中的隊伍；fromOrgId = 從哪家公司拖出（null = 從隊伍清單拖出） */
interface DragPayload {
  teamId: string;
  fromOrgId: string | null;
}

/** 解析「一行一個」的名稱清單（去除空白與重複） */
function parseNames(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** 拖放目標：拖曳經過時標示，放開時回傳隊伍資訊 */
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
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>
          {busy ? '新增中…' : `新增${parseNames(text).length > 1 ? ` ${parseNames(text).length} 筆` : ''}`}
        </button>
      </div>
    </form>
  );
}

/** 可拖曳的隊伍膠囊 */
function TeamChip({
  team,
  orgIds,
  fromOrgId,
  onRemove,
}: {
  team: Team;
  orgIds: string[];
  fromOrgId: string | null;
  onRemove?: () => void;
}) {
  const merged = orgIds.length > 1;
  return (
    <div
      className={`team-chip${merged ? ' team-chip-merged' : ''}${orgIds.length === 0 ? ' team-chip-free' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ teamId: team.id, fromOrgId } satisfies DragPayload));
        e.dataTransfer.effectAllowed = fromOrgId ? 'move' : 'copy';
      }}
      title="拖曳到公司底下"
    >
      <span className="team-chip-grip" aria-hidden>
        ⠿
      </span>
      <span className="team-chip-name">{team.name}</span>
      {merged && <Badge tone="accent">聯隊</Badge>}
      {onRemove && (
        <button type="button" className="team-chip-x" aria-label={`從此公司移除 ${team.name}`} onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

function OrgCard({
  org,
  teams,
  orgsOf,
  onDropTeam,
  onRemoveTeam,
  onChanged,
  onDelete,
}: {
  org: Organization;
  teams: Team[];
  orgsOf: (t: Team) => string[];
  onDropTeam: (p: DragPayload) => void;
  onRemoveTeam: (t: Team) => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const zone = useDropZone(onDropTeam);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: org.name, contact: org.contact_name ?? '', phone: org.contact_phone ?? '' });
  const mine = teams.filter((t) => orgsOf(t).includes(org.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  const others = teams
    .filter((t) => !orgsOf(t).includes(org.id))
    .sort((a, b) => orgsOf(a).length - orgsOf(b).length || a.name.localeCompare(b.name, 'zh-TW'));

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.updateOrganization(org.id, {
        name: form.name.trim(),
        contact_name: blankToNull(form.contact),
        contact_phone: blankToNull(form.phone),
      });
      toast.ok('公司資料已更新');
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <section className={`card org-drop${zone.over ? ' is-over' : ''}`} {...zone.props}>
      {editing ? (
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </form>
      ) : (
        <div className="org-drop-head">
          <div className="org-drop-title">
            <h3>{org.name}</h3>
            <span className="muted small" title={[org.contact_name, org.contact_phone].filter(Boolean).join(' ')}>
              {mine.length} 隊
              {org.contact_name ? ` · ${org.contact_name}` : ''}
              {org.contact_phone ? ` ${org.contact_phone}` : ''}
            </span>
          </div>
          <div className="actions">
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => {
                setForm({ name: org.name, contact: org.contact_name ?? '', phone: org.contact_phone ?? '' });
                setEditing(true);
              }}
            >
              編輯
            </button>
            <button className="btn btn-xs btn-danger-ghost" onClick={onDelete}>
              刪除
            </button>
          </div>
        </div>
      )}

      <div className="org-drop-body">
        {mine.length === 0 ? (
          <span className="org-drop-empty">把隊伍拖曳到這裡</span>
        ) : (
          mine.map((t) => <TeamChip key={t.id} team={t} orgIds={orgsOf(t)} fromOrgId={org.id} onRemove={() => onRemoveTeam(t)} />)
        )}
      </div>

      {/* 觸控裝置無法拖曳時的替代操作 */}
      {others.length > 0 && (
        <select
          className="select-sm"
          value=""
          aria-label={`加入隊伍到 ${org.name}`}
          onChange={(e) => e.target.value && onDropTeam({ teamId: e.target.value, fromOrgId: null })}
        >
          <option value="">＋ 加入隊伍…</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {orgsOf(t).length === 0 ? '（未分配）' : '（成為聯隊）'}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

function TeamPool({
  teams,
  orgsOf,
  memberCount,
  onDropTeam,
  onChanged,
}: {
  teams: Team[];
  orgsOf: (t: Team) => string[];
  memberCount: (t: Team) => number;
  onDropTeam: (p: DragPayload) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const zone = useDropZone(onDropTeam);
  const [onlyFree, setOnlyFree] = useState(false);
  const shown = teams
    .filter((t) => !onlyFree || orgsOf(t).length === 0)
    .sort((a, b) => Number(orgsOf(b).length === 0) - Number(orgsOf(a).length === 0) || a.name.localeCompare(b.name, 'zh-TW'));

  async function rename(t: Team) {
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

  async function remove(t: Team) {
    const n = memberCount(t);
    if (!confirm(`確定刪除「${t.name}」？${n ? `隊上 ${n} 名隊員與項目報名將一併刪除，` : ''}窗口綁定與邀請碼也會失效，此動作無法復原。`)) return;
    try {
      await api.deleteTeam(t.id);
      toast.ok('隊伍已刪除');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <aside className={`card team-pool${zone.over ? ' is-over' : ''}`} {...zone.props}>
      <div className="team-pool-head">
        <h3>隊伍清單</h3>
        <label className="switch small">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
          只看未分配
        </label>
      </div>
      <p className="muted small">從這裡拖曳到右側公司 = 加入；拖回這裡 = 從該公司移除。</p>
      <ul className="team-pool-list">
        {shown.map((t) => {
          const n = orgsOf(t).length;
          return (
            <li key={t.id}>
              <TeamChip team={t} orgIds={orgsOf(t)} fromOrgId={null} />
              <span className={`team-pool-meta${n === 0 ? ' warn-text' : ''}`}>{n === 0 ? '未分配' : `${n} 家`}</span>
              <span className="team-pool-actions">
                <button className="btn btn-xs btn-ghost" onClick={() => rename(t)}>
                  改名
                </button>
                <button className="btn btn-xs btn-danger-ghost" onClick={() => remove(t)}>
                  刪除
                </button>
              </span>
            </li>
          );
        })}
        {shown.length === 0 && <li className="muted small">{onlyFree ? '所有隊伍都已分配' : '尚未建立隊伍'}</li>}
      </ul>
    </aside>
  );
}

export default function TeamSetup({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, members, contacts, settings } = data;
  const toast = useToast();
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
  const memberCount = (t: Team) => members.filter((m) => m.team_id === t.id).length;
  const free = teams.filter((t) => orgsOf(t).length === 0).length;
  const merged = teams.filter((t) => orgsOf(t).length > 1).length;

  async function save(team: Team, next: string[], removedOrgId: string | null) {
    if (removedOrgId) {
      const n = members.filter((m) => m.team_id === team.id && m.org_id === removedOrgId).length;
      if (n) {
        toast.error(`「${orgName(removedOrgId)}」在「${team.name}」仍有 ${n} 名隊員，請先刪除其隊員再移除`);
        return;
      }
      const c = contacts.filter((x) => x.team_id === team.id && x.org_id === removedOrgId).length;
      if (c && !confirm(`移除後，「${orgName(removedOrgId)}」在「${team.name}」的 ${c} 位窗口將解除綁定，該組邀請碼也會作廢。確定移除？`)) {
        return;
      }
    }
    setPending((p) => ({ ...p, [team.id]: next }));
    try {
      await api.setTeamOrgs(team.id, next);
      onChanged();
    } catch (err) {
      setPending((p) => {
        const rest = { ...p };
        delete rest[team.id];
        return rest;
      });
      toast.error(err);
    }
  }

  function dropOnOrg(p: DragPayload, orgId: string) {
    const team = teams.find((t) => t.id === p.teamId);
    if (!team || p.fromOrgId === orgId) return;
    const current = orgsOf(team);
    if (p.fromOrgId === null && current.includes(orgId)) {
      toast.info(`「${team.name}」已在「${orgName(orgId)}」底下`);
      return;
    }
    // 從清單拖入 = 加入；從其他公司拖過來 = 移動
    const next = current.filter((o) => o !== p.fromOrgId);
    void save(team, next.includes(orgId) ? next : [...next, orgId], p.fromOrgId);
  }

  function removeFromOrg(team: Team, orgId: string) {
    void save(
      team,
      orgsOf(team).filter((o) => o !== orgId),
      orgId,
    );
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
          未分配 {free} 隊
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
          hint="再建立所有隊伍。一行一隊；建立後會出現在下方「隊伍清單」，等待分配公司。"
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
          <h3>拖曳隊伍到公司底下</h3>
          <p className="muted small">
            同一隊拖到多家公司即為聯隊；在公司之間拖曳 = 移動；按 × 或拖回隊伍清單 = 移除。每家公司在每一隊各有一組邀請碼（見「窗口與邀請碼」）。
            觸控裝置請使用各公司下方的「＋ 加入隊伍」選單。
          </p>
        </div>
        {orgs.length === 0 ? (
          <div className="notice notice-info">請先在 Step 01 建立公司。</div>
        ) : (
          <div className="dnd-board">
            <TeamPool
              teams={teams}
              orgsOf={orgsOf}
              memberCount={memberCount}
              onChanged={onChanged}
              onDropTeam={(p) => {
                const team = teams.find((t) => t.id === p.teamId);
                if (team && p.fromOrgId) removeFromOrg(team, p.fromOrgId);
              }}
            />
            <div className="org-grid">
              {orgs.map((o) => (
                <OrgCard
                  key={o.id}
                  org={o}
                  teams={teams}
                  orgsOf={orgsOf}
                  onDropTeam={(p) => dropOnOrg(p, o.id)}
                  onRemoveTeam={(t) => removeFromOrg(t, o.id)}
                  onChanged={onChanged}
                  onDelete={() => deleteOrg(o)}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
