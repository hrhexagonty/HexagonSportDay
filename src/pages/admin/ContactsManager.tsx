// 管理員：每隊窗口人數上限、各公司邀請碼、已綁定的窗口帳號
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Badge } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { dateStamp, filePrefix } from '../../lib/format';
import { randomInviteCode } from '../../lib/inviteCode';
import type { Team, TeamContact, TeamInvite } from '../../lib/types';
import type { AdminData } from './types';

/** 窗口人數輸入：離開欄位或按 Enter 時才儲存 */
function LimitInput({ team, onSave }: { team: Team; onSave: (limit: number) => Promise<void> }) {
  const [value, setValue] = useState(String(team.contact_limit));
  const commit = async () => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isInteger(n) || n < 0) {
      setValue(String(team.contact_limit));
      return;
    }
    if (n !== team.contact_limit) await onSave(n);
  };
  return (
    <input
      className="input-num"
      type="number"
      min={0}
      value={value}
      aria-label={`${team.name} 窗口人數上限`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export default function ContactsManager({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, invites, contacts, settings } = data;
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [bulk, setBulk] = useState('2');
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const contactsOf = (t: Team) => contacts.filter((c) => c.team_id === t.id);
  const invitesOf = (t: Team) =>
    t.org_ids.map((id) => invites.find((i) => i.team_id === t.id && i.org_id === id)).filter((i): i is TeamInvite => !!i);
  const rows = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    .filter(
      (t) =>
        !search ||
        t.name.includes(search) ||
        t.org_ids.some((id) => orgName.get(id)?.includes(search)) ||
        contactsOf(t).some((c) => c.email.includes(search)),
    );
  const full = teams.filter((t) => t.org_ids.length > 0 && contactsOf(t).length >= t.contact_limit).length;

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.ok(ok);
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

  function editCode(t: Team, inv: TeamInvite) {
    const v = prompt(`「${t.name}」×「${orgName.get(inv.org_id)}」的邀請碼（6–20 位英文字母或數字）`, inv.invite_code);
    if (v === null || v.trim().toUpperCase() === inv.invite_code) return;
    void run(() => api.setTeamInviteCode(inv.team_id, inv.org_id, v), '邀請碼已更新');
  }

  function regenerate(t: Team, inv: TeamInvite) {
    if (!confirm(`重新產生「${t.name}」×「${orgName.get(inv.org_id)}」的邀請碼？舊邀請碼會立即失效（已綁定的窗口不受影響）。`)) return;
    void run(() => api.setTeamInviteCode(inv.team_id, inv.org_id, randomInviteCode()), '已重新產生邀請碼');
  }

  function removeContact(t: Team, c: TeamContact) {
    if (!confirm(`解除「${c.email}」在「${t.name}」的窗口身分？該帳號將無法再檢視或編輯這一隊，名額會釋出。`)) return;
    void run(() => api.removeTeamContact(c.user_id, c.team_id), '已解除窗口綁定');
  }

  async function applyAll() {
    const n = Number(bulk);
    if (!Number.isInteger(n) || n < 0) {
      toast.error('請輸入 0 以上的整數');
      return;
    }
    const targets = teams.filter((t) => t.contact_limit !== n);
    if (targets.length === 0) {
      toast.info(`所有隊伍的窗口人數已是 ${n} 人`);
      return;
    }
    if (!confirm(`將 ${targets.length} 隊的窗口人數上限都設為 ${n} 人？已綁定的窗口不會被移除。`)) return;
    await run(async () => {
      for (const t of targets) await api.updateTeam(t.id, { contact_limit: n });
    }, `已將 ${targets.length} 隊設為 ${n} 人`);
  }

  function exportCodes() {
    const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    downloadCsv(`${filePrefix(settings.event_title)}_隊伍邀請碼_${dateStamp()}.csv`, [
      ['隊伍', '公司', '邀請碼', '窗口人數上限', '已綁定窗口數'],
      ...sorted.flatMap((t) =>
        invitesOf(t).map((i) => [t.name, orgName.get(i.org_id) ?? '', i.invite_code, t.contact_limit, contactsOf(t).length]),
      ),
    ]);
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <span className="muted">
          已綁定窗口 <b>{contacts.length}</b> 人 · 名額已滿 {full} 隊
        </span>
        <div className="spacer" />
        <input className="search" placeholder="搜尋隊名、公司或 Email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="toolbar-group">
          每隊
          <input className="input-num" type="number" min={0} value={bulk} onChange={(e) => setBulk(e.target.value)} />人
          <button className="btn btn-sm" onClick={applyAll}>
            全部套用
          </button>
        </span>
        <button className="btn btn-sm" onClick={exportCodes} disabled={invites.length === 0}>
          下載邀請碼清單
        </button>
      </div>

      <div className="table-wrap card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>隊伍</th>
              <th>公司與邀請碼</th>
              <th>窗口人數上限</th>
              <th>已綁定窗口</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const list = contactsOf(t);
              const merged = t.org_ids.length > 1;
              return (
                <tr key={t.id}>
                  <td>
                    <Link to={`/teams/${t.id}`}>
                      <b>{t.name}</b>
                    </Link>{' '}
                    {merged && <Badge tone="accent">聯隊</Badge>}
                  </td>
                  <td>
                    {t.org_ids.length === 0 ? (
                      <span className="warn-text small">尚未分配公司（請至「隊伍配置」拖曳），窗口無法註冊</span>
                    ) : (
                      <div className="invite-list">
                        {invitesOf(t).map((inv) => (
                          <div key={inv.org_id} className="invite-row">
                            <span className="invite-org">{orgName.get(inv.org_id)}</span>
                            <button className="code-pill code-pill-btn" onClick={() => copy(inv.invite_code)} title="點擊複製">
                              {inv.invite_code}
                            </button>
                            <button className="btn btn-xs btn-ghost" onClick={() => editCode(t, inv)}>
                              自訂
                            </button>
                            <button className="btn btn-xs btn-ghost" onClick={() => regenerate(t, inv)}>
                              重新產生
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="limit-cell">
                      <LimitInput
                        key={t.contact_limit}
                        team={t}
                        onSave={(n) => run(() => api.updateTeam(t.id, { contact_limit: n }), `「${t.name}」窗口人數已設為 ${n} 人`)}
                      />
                      <span className={list.length >= t.contact_limit ? 'warn-text small' : 'muted small'}>
                        已綁 {list.length} / {t.contact_limit}
                      </span>
                    </div>
                  </td>
                  <td>
                    {list.length === 0 ? (
                      <span className="muted small">—</span>
                    ) : (
                      <ul className="contact-list">
                        {list.map((c) => (
                          <li key={c.user_id}>
                            <span>{c.email}</span>
                            {merged && <span className="muted small">{orgName.get(c.org_id)}</span>}
                            <button
                              className="drag-chip-x"
                              aria-label={`解除 ${c.email} 的窗口身分`}
                              title="解除綁定"
                              onClick={() => removeContact(t, c)}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted center">
                  {teams.length === 0 ? '尚未建立隊伍，請先到「隊伍配置」建立' : '沒有符合條件的隊伍'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        將邀請碼交給各隊窗口：在前台「單位登入 → 首次註冊」先輸入邀請碼，系統帶出對應隊伍後設定信箱密碼即可完成註冊；同一位窗口代表多隊可用同一個信箱。聯隊中各公司的邀請碼不同，窗口以哪組碼註冊就歸屬哪家公司，只能編輯、檢視自己公司隊員的個資。
      </p>
    </div>
  );
}
