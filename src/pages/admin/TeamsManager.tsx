// 管理員：建立隊伍（含聯隊）、調整聯隊參與公司
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Badge, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull } from '../../lib/format';
import { isMergedTeam } from '../../lib/rules';
import type { Organization, Team } from '../../lib/types';
import type { AdminData } from './types';

function OrgCheckboxes({ orgs, value, onChange }: { orgs: Organization[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="org-checks">
      {orgs.map((o) => (
        <label key={o.id} className={`org-check ${value.includes(o.id) ? 'org-check-on' : ''}`}>
          <input
            type="checkbox"
            checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
          />
          {o.name}
        </label>
      ))}
    </div>
  );
}

function CreateTeamForm({ orgs, onDone }: { orgs: Organization[]; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [captain, setCaptain] = useState('');
  const [phone, setPhone] = useState('');
  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (orgIds.length === 0) {
      toast.error('請至少勾選一家公司');
      return;
    }
    setBusy(true);
    try {
      const team = await api.createTeam(
        { name: name.trim(), captain_name: blankToNull(captain), captain_phone: blankToNull(phone) },
        orgIds,
      );
      toast.ok(`已建立「${team.name}」${orgIds.length > 1 ? '（聯隊）' : ''}`);
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <h3>建立隊伍 / 聯隊</h3>
        <p className="muted small">勾選 2 家以上公司即為聯隊（不占各公司自組額度）；只勾 1 家會占用該公司額度。</p>
      </div>
      <div className="row-3">
        <Field label="隊名">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：醫材能源文創 聯隊" />
        </Field>
        <Field label="隊長姓名">
          <input value={captain} onChange={(e) => setCaptain(e.target.value)} />
        </Field>
        <Field label="隊長電話">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label={`參與公司（已選 ${orgIds.length} 家）`}>
        <OrgCheckboxes orgs={orgs} value={orgIds} onChange={setOrgIds} />
      </Field>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? '建立中…' : orgIds.length > 1 ? '建立聯隊' : '建立隊伍'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          取消
        </button>
      </div>
    </form>
  );
}

function EditOrgsRow({ team, orgs, colSpan, onDone }: { team: Team; orgs: Organization[]; colSpan: number; onDone: (saved: boolean) => void }) {
  const toast = useToast();
  const [orgIds, setOrgIds] = useState(team.org_ids);

  async function save() {
    try {
      await api.setTeamOrgs(team.id, orgIds);
      toast.ok('參與公司已更新');
      onDone(true);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <tr className="row-active">
      <td colSpan={colSpan}>
        <div className="stack">
          <span className="small">調整「{team.name}」的參與公司（要移除的公司需先刪除其隊員）：</span>
          <OrgCheckboxes orgs={orgs} value={orgIds} onChange={setOrgIds} />
          <div className="actions">
            <button className="btn btn-primary btn-sm" disabled={orgIds.length === 0} onClick={save}>
              儲存
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onDone(false)}>
              取消
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function TeamsManager({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, members } = data;
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlyMerged, setOnlyMerged] = useState(false);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const shown = teams
    .filter((t) => !onlyMerged || isMergedTeam(t))
    .sort((a, b) => Number(isMergedTeam(b)) - Number(isMergedTeam(a)) || a.name.localeCompare(b.name, 'zh-TW'));

  return (
    <div className="stack">
      <div className="toolbar">
        <span className="muted">
          共 {teams.length} 隊，其中聯隊 {teams.filter(isMergedTeam).length} 隊
        </span>
        <label className="switch small">
          <input type="checkbox" checked={onlyMerged} onChange={(e) => setOnlyMerged(e.target.checked)} />
          只看聯隊
        </label>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          ＋ 建立隊伍 / 聯隊
        </button>
      </div>

      {creating && (
        <CreateTeamForm
          orgs={orgs}
          onDone={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}

      <div className="table-wrap card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>隊伍</th>
              <th>參與公司</th>
              <th>隊員</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((t) =>
              t.id === editingId ? (
                <EditOrgsRow
                  key={t.id}
                  team={t}
                  orgs={orgs}
                  colSpan={4}
                  onDone={(saved) => {
                    setEditingId(null);
                    if (saved) onChanged();
                  }}
                />
              ) : (
                <tr key={t.id}>
                  <td>
                    <b>{t.name}</b> {isMergedTeam(t) && <Badge tone="accent">聯隊</Badge>}
                  </td>
                  <td>
                    {t.org_ids.map((id) => {
                      const n = members.filter((m) => m.team_id === t.id && m.org_id === id).length;
                      return (
                        <span key={id} className="chip chip-sm org-chip">
                          {orgName.get(id) ?? '—'}
                          {isMergedTeam(t) && <span className="muted"> {n} 人</span>}
                        </span>
                      );
                    })}
                  </td>
                  <td>{members.filter((m) => m.team_id === t.id).length}</td>
                  <td className="cell-actions">
                    <button className="btn btn-xs btn-ghost" onClick={() => setEditingId(t.id)}>
                      調整公司
                    </button>
                    <Link className="btn btn-xs btn-ghost" to={`/teams/${t.id}`}>
                      檢視
                    </Link>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
