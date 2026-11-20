// 管理員：每隊窗口人數上限、各公司邀請碼、已綁定的窗口帳號；委外廠商邀請碼與帳號
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Badge, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';
import { dateStamp, filePrefix } from '../../lib/format';
import { randomInviteCode } from '../../lib/inviteCode';
import type { Team, TeamContact, TeamInvite, Vendor, VendorContact } from '../../lib/types';
import type { AdminData } from './types';

/** 人數上限輸入：離開欄位或按 Enter 時才儲存 */
function LimitInput({ value: saved, label, onSave }: { value: number; label: string; onSave: (limit: number) => Promise<void> }) {
  const [value, setValue] = useState(String(saved));
  const commit = async () => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isInteger(n) || n < 0) {
      setValue(String(saved));
      return;
    }
    if (n !== saved) await onSave(n);
  };
  return (
    <input
      className="input-num"
      type="number"
      min={0}
      value={value}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** 複製邀請碼到剪貼簿 */
function useCopyCode() {
  const toast = useToast();
  return async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.ok(`已複製邀請碼 ${code}`);
    } catch {
      toast.info(`邀請碼：${code}`);
    }
  };
}

/** 委外廠商：建立廠商邀請碼、設定可註冊帳號數、解除已註冊的帳號 */
function VendorSection({
  vendors,
  contacts,
  run,
}: {
  vendors: Vendor[];
  contacts: VendorContact[];
  run: (action: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const copy = useCopyCode();
  const [form, setForm] = useState({ name: '', limit: '3' });
  const contactsOf = (v: Vendor) => contacts.filter((c) => c.vendor_id === v.id);

  async function create(e: FormEvent) {
    e.preventDefault();
    const limit = Number(form.limit);
    await run(() => api.createVendor({ name: form.name.trim(), account_limit: limit }), `已建立「${form.name.trim()}」的邀請碼`);
    setForm({ name: '', limit: '3' });
  }

  function editCode(v: Vendor) {
    const code = prompt(`「${v.name}」的邀請碼（6–20 位英文字母或數字）`, v.invite_code);
    if (code === null || code.trim().toUpperCase() === v.invite_code) return;
    void run(() => api.updateVendor(v.id, { invite_code: code }), '邀請碼已更新');
  }

  function regenerate(v: Vendor) {
    if (!confirm(`重新產生「${v.name}」的邀請碼？舊邀請碼會立即失效（已註冊的帳號不受影響）。`)) return;
    void run(() => api.updateVendor(v.id, { invite_code: randomInviteCode() }), '已重新產生邀請碼');
  }

  function rename(v: Vendor) {
    const name = prompt('廠商名稱', v.name)?.trim();
    if (!name || name === v.name) return;
    void run(() => api.updateVendor(v.id, { name }), '廠商名稱已更新');
  }

  function remove(v: Vendor) {
    const n = contactsOf(v).length;
    if (!confirm(`刪除「${v.name}」？邀請碼會失效${n ? `，已註冊的 ${n} 個帳號也會失去廠商權限` : ''}。`)) return;
    void run(() => api.deleteVendor(v.id), '已刪除廠商');
  }

  function removeContact(v: Vendor, c: VendorContact) {
    if (!confirm(`解除「${c.email}」的委外廠商身分（${v.name}）？該帳號將無法再進入管理後台，名額會釋出。`)) return;
    void run(() => api.removeVendorContact(c.user_id), '已解除廠商帳號');
  }

  return (
    <section className="card stack">
      <div>
        <h2>委外廠商</h2>
        <p className="muted small">
          委外廠商在前台「首次註冊」輸入廠商邀請碼即可註冊。可檢視填報總覽、各隊隊員與項目報名、隊伍配置、健力報名（皆唯讀；隊員證號、生日、手機與隊長電話為隱碼），並可編輯「活動設定」（含活動指南）與「競賽項目設定」；看不到「窗口與邀請碼」與「匯出名單」。委外廠商帳號不能同時擔任隊伍窗口。
        </p>
      </div>

      <form className="toolbar vendor-form" onSubmit={create}>
        <Field label="廠商名稱">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 ○○活動執行公司" />
        </Field>
        <Field label="可註冊帳號數">
          <input
            className="vendor-limit"
            type="number"
            min={0}
            required
            value={form.limit}
            onChange={(e) => setForm({ ...form, limit: e.target.value })}
          />
        </Field>
        <button className="btn btn-primary btn-sm" disabled={!form.name.trim()}>
          建立廠商邀請碼
        </button>
      </form>

      {vendors.length === 0 ? (
        <p className="muted small">尚未建立委外廠商。</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>廠商</th>
                <th>邀請碼</th>
                <th>帳號數上限</th>
                <th>已註冊帳號</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const list = contactsOf(v);
                return (
                  <tr key={v.id}>
                    <td>
                      <b>{v.name}</b>{' '}
                      <button className="btn btn-xs btn-ghost" onClick={() => rename(v)}>
                        改名
                      </button>
                    </td>
                    <td>
                      <div className="invite-row">
                        <button className="code-pill code-pill-btn" onClick={() => copy(v.invite_code)} title="點擊複製">
                          {v.invite_code}
                        </button>
                        <button className="btn btn-xs btn-ghost" onClick={() => editCode(v)}>
                          自訂
                        </button>
                        <button className="btn btn-xs btn-ghost" onClick={() => regenerate(v)}>
                          重新產生
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="limit-cell">
                        <LimitInput
                          key={v.account_limit}
                          value={v.account_limit}
                          label={`${v.name} 帳號數上限`}
                          onSave={(n) => run(() => api.updateVendor(v.id, { account_limit: n }), `「${v.name}」帳號數已設為 ${n} 個`)}
                        />
                        <span className={list.length >= v.account_limit ? 'warn-text small' : 'muted small'}>
                          已註冊 {list.length} / {v.account_limit}
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
                              <button
                                className="drag-chip-x"
                                aria-label={`解除 ${c.email} 的委外廠商身分`}
                                title="解除"
                                onClick={() => removeContact(v, c)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-xs btn-danger-ghost" onClick={() => remove(v)}>
                        刪除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ContactsManager({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, invites, contacts, settings } = data;
  const toast = useToast();
  const copy = useCopyCode();
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
                        value={t.contact_limit}
                        label={`${t.name} 窗口人數上限`}
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

      <VendorSection vendors={data.vendors} contacts={data.vendorContacts} run={run} />
    </div>
  );
}
