import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Field } from '../../components/ui';
import { api } from '../../lib/api';
import { blankToNull } from '../../lib/format';
import { isMergedTeam, plannedTeamCount, soloTeamCount } from '../../lib/rules';
import type { OrgInput, Organization } from '../../lib/types';
import type { AdminData } from './types';

function OrgForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Organization;
  onSubmit: (v: OrgInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    quota: String(initial?.team_quota ?? 1),
    contact: initial?.contact_name ?? '',
    phone: initial?.contact_phone ?? '',
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      name: form.name.trim(),
      team_quota: Number(form.quota),
      contact_name: blankToNull(form.contact),
      contact_phone: blankToNull(form.phone),
    });
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row-4">
        <Field label="公司名稱">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="自組隊伍額度" hint="只參加聯隊的小公司填 0">
          <input type="number" min={0} required value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })} />
        </Field>
        <Field label="聯絡人">
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
        </Field>
        <Field label="聯絡電話">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <div className="actions">
        <button className="btn btn-primary">{initial ? '儲存' : '新增公司'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

export default function OrgsManager({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, members, settings } = data;
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const quotaSum = orgs.reduce((s, o) => s + o.team_quota, 0);
  const planned = plannedTeamCount(quotaSum, teams);
  const mergedOf = (orgId: string) => teams.filter((t) => isMergedTeam(t) && t.org_ids.includes(orgId)).length;
  const editing = orgs.find((o) => o.id === editingId);

  async function create(v: OrgInput) {
    try {
      await api.createOrganization(v);
      toast.ok(`已新增公司「${v.name}」`);
      setAdding(false);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function update(id: string, v: OrgInput) {
    const used = soloTeamCount(teams, id);
    if (v.team_quota < used) {
      toast.error(`此公司已自組 ${used} 隊，額度不可小於 ${used}`);
      return;
    }
    try {
      await api.updateOrganization(id, v);
      toast.ok('公司資料已更新');
      setEditingId(null);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove(o: Organization) {
    const solo = soloTeamCount(teams, o.id);
    const merged = mergedOf(o.id);
    const parts = [
      solo ? `自組的 ${solo} 支隊伍將整隊刪除` : '',
      merged ? `參與的 ${merged} 支聯隊中該公司隊員將被移除` : '',
    ].filter(Boolean);
    if (!confirm(`確定刪除公司「${o.name}」？${parts.length ? parts.join('；') + '，' : ''}此動作無法復原。`)) return;
    try {
      await api.deleteOrganization(o.id);
      toast.ok('公司已刪除');
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.ok(`已複製邀請碼 ${code}`);
    } catch {
      toast.info(`邀請碼：${code}`);
    }
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <span className={planned === settings.total_team_target ? 'muted' : 'warn-text'}>
          自組額度合計 <b>{quotaSum}</b> ＋ 聯隊 {teams.filter(isMergedTeam).length} ＝ {planned} / 目標 {settings.total_team_target} 隊
        </span>
        <div className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
        >
          ＋ 新增公司
        </button>
      </div>

      {adding && <OrgForm onSubmit={create} onCancel={() => setAdding(false)} />}
      {editing && <OrgForm key={editing.id} initial={editing} onSubmit={(v) => update(editing.id, v)} onCancel={() => setEditingId(null)} />}

      <div className="table-wrap card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>公司</th>
              <th>自組隊伍（已建 / 額度）</th>
              <th>參與聯隊</th>
              <th>隊員</th>
              <th>邀請碼</th>
              <th>聯絡人</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className={o.id === editingId ? 'row-active' : undefined}>
                <td>
                  <b>{o.name}</b>
                </td>
                <td>
                  {soloTeamCount(teams, o.id)} / {o.team_quota}
                </td>
                <td>{mergedOf(o.id) || '—'}</td>
                <td>{members.filter((m) => m.org_id === o.id).length}</td>
                <td>
                  <button className="code-pill code-pill-btn" onClick={() => copy(o.invite_code)} title="點擊複製">
                    {o.invite_code}
                  </button>
                </td>
                <td className="muted">
                  {o.contact_name ?? '—'}
                  {o.contact_phone ? ` · ${o.contact_phone}` : ''}
                </td>
                <td className="cell-actions">
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      setAdding(false);
                      setEditingId(o.id);
                    }}
                  >
                    編輯
                  </button>
                  <button className="btn btn-xs btn-danger-ghost" onClick={() => remove(o)}>
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        將邀請碼提供給各公司窗口：窗口註冊帳號後輸入邀請碼即可綁定公司並開始填報。聯隊請至「隊伍管理」建立。
      </p>
    </div>
  );
}
