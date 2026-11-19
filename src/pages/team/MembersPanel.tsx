import { useMemo, useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toast';
import { Badge, EmptyState, Field } from '../../components/ui';
import { api } from '../../lib/api';
import { checkTwId, maskId } from '../../lib/idNumber';
import { IMPORT_COLUMNS, parseMemberRows } from '../../lib/importParse';
import { cleanMemberInput, missingFields, validateMemberInput } from '../../lib/member';
import { checkAddMembers } from '../../lib/rules';
import {
  DIETS,
  DIET_LABEL,
  GENDER_LABEL,
  SHIRT_SIZES,
  type Diet,
  type Gender,
  type Member,
  type MemberInput,
  type ShirtSize,
} from '../../lib/types';
import type { TeamPageData } from './types';

/** 個資告知（新增 / 匯入隊員時需勾選同意） */
const PRIVACY_NOTICE =
  '我已告知隊員：所填個資（身分證字號、生日、手機、用餐習慣、特殊需求等）僅用於本次運動會之報名、保險、餐點與場地安排，活動結束後即刪除，並已取得隊員同意。';

// 只有姓名、性別必填；其餘欄位可先留空，之後再用「編輯」補上
const EMPTY_FORM = {
  name: '',
  gender: 'M' as Gender,
  national_id: '',
  birthday: '',
  diet: '' as Diet | '',
  special_needs: '',
  phone: '',
  shirt_size: '',
};

function toInput(f: typeof EMPTY_FORM): MemberInput {
  return cleanMemberInput({
    name: f.name,
    gender: f.gender,
    national_id: f.national_id,
    birthday: f.birthday,
    diet: f.diet || null,
    special_needs: f.special_needs,
    phone: f.phone,
    shirt_size: (f.shirt_size || null) as ShirtSize | null,
  });
}

/** 所屬公司選擇：管理員可選隊伍內任一公司；窗口固定為自己公司 */
function OrgPicker({ data, value, onChange }: { data: TeamPageData; value: string; onChange: (v: string) => void }) {
  if (!data.isAdmin) {
    return <span className="muted small">所屬公司：{data.orgNames.get(value) ?? '—'}</span>;
  }
  return (
    <Field label="所屬公司">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {data.team.org_ids.map((id) => (
          <option key={id} value={id}>
            {data.orgNames.get(id) ?? id}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{PRIVACY_NOTICE}</span>
    </label>
  );
}

/** 新增 / 編輯單一隊員 */
function MemberForm({
  data,
  initial,
  onSubmit,
  onCancel,
}: {
  data: TeamPageData;
  initial?: Member;
  onSubmit: (v: MemberInput, orgId: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const p = initial?.private;
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          gender: initial.gender,
          national_id: p?.national_id ?? '',
          birthday: p?.birthday ?? '',
          diet: (p?.diet ?? '') as Diet | '',
          special_needs: p?.special_needs ?? '',
          phone: p?.phone ?? '',
          shirt_size: p?.shirt_size ?? '',
        }
      : EMPTY_FORM,
  );
  const [orgId, setOrgId] = useState(initial?.org_id ?? data.defaultOrgId);
  const [consent, setConsent] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  // 證號輸入完成後，依第 2 碼自動帶入性別
  function onIdBlur() {
    const r = checkTwId(form.national_id);
    if (r.ok && r.gender && r.gender !== form.gender) setForm({ ...form, gender: r.gender });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const input = toInput(form);
    const msg = validateMemberInput(input);
    if (msg) {
      toast.error(msg);
      return;
    }
    setBusy(true);
    const ok = await onSubmit(input, orgId);
    setBusy(false);
    if (ok && !initial) setForm(EMPTY_FORM); // 新增成功後清空，方便連續輸入
  }

  return (
    <form className="card member-form" onSubmit={submit}>
      <div className="title-row">
        <h3>{initial ? `編輯隊員：${initial.name}` : '新增隊員'}</h3>
        {data.merged && <OrgPicker data={data} value={orgId} onChange={setOrgId} />}
      </div>
      <div className="row-4">
        <Field label="姓名">
          <input required autoFocus value={form.name} onChange={set('name')} />
        </Field>
        <Field label="身分證 / 居留證字號">
          <input value={form.national_id} onChange={set('national_id')} onBlur={onIdBlur} className="mono" placeholder="可之後再補" />
        </Field>
        <Field label="性別">
          <select value={form.gender} onChange={set('gender')}>
            <option value="M">男</option>
            <option value="F">女</option>
          </select>
        </Field>
        <Field label="生日">
          <input type="date" value={form.birthday} onChange={set('birthday')} />
        </Field>
      </div>
      <div className="row-4">
        <Field label="用餐習慣">
          <select value={form.diet} onChange={set('diet')}>
            <option value="">未填</option>
            {DIETS.map((d) => (
              <option key={d} value={d}>
                {DIET_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="特殊需求" hint="無則留空，例如：海鮮過敏、需無障礙通道">
          <input value={form.special_needs} onChange={set('special_needs')} />
        </Field>
        <Field label="手機">
          <input value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="衣服尺寸">
          <select value={form.shirt_size} onChange={set('shirt_size')}>
            <option value="">未填</option>
            {SHIRT_SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted small">
        只有<b>姓名、性別</b>必填，其餘欄位可先留空送出，之後按「編輯」補上；身分證字號、生日、用餐習慣供投保與訂餐使用，請於報名截止前補齊。
      </p>
      {!initial && <ConsentCheck checked={consent} onChange={setConsent} />}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !consent}>
          {busy ? '儲存中…' : initial ? '儲存變更' : '新增'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {initial ? '取消' : '關閉'}
        </button>
      </div>
    </form>
  );
}

/** 從 Excel 複製貼上批次匯入 */
function ImportPanel({ data, onDone }: { data: TeamPageData; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [orgId, setOrgId] = useState(data.defaultOrgId);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseMemberRows(text), [text]);
  const valid = rows.filter((r) => r.value).map((r) => r.value!);
  const errors = rows.filter((r) => r.error);
  const capacityMsg = valid.length
    ? checkAddMembers(data.settings, data.members.length, valid.length, data.isAdmin)
    : null;

  async function doImport() {
    setBusy(true);
    try {
      await api.addMembers(data.team.id, orgId, valid);
      toast.ok(`已匯入 ${valid.length} 位隊員`);
      setText('');
      onDone();
      data.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="title-row">
        <h3>批次貼上匯入</h3>
        {data.merged && <OrgPicker data={data} value={orgId} onChange={setOrgId} />}
      </div>
      <p className="muted small">
        從 Excel 選取欄位後直接貼上（每列一人）。欄位順序：<b>{IMPORT_COLUMNS.join('、')}</b>。
        只有姓名、性別必填，其餘欄位可留空之後再補；生日可填 1990/5/12 或民國 79/5/12；第一列若是表頭會自動略過。
      </p>
      <textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`${IMPORT_COLUMNS.join('\t')}\n王小明\t男\tA123456789\t1990/5/12\t葷食\t\t0912345678\tL\n李小華\t女`}
        className="mono"
      />
      {rows.length > 0 && (
        <div className="import-summary">
          <Badge tone="ok">可匯入 {valid.length} 筆</Badge>
          {errors.length > 0 && <Badge tone="err">錯誤 {errors.length} 筆</Badge>}
          {errors.length > 0 && (
            <ul className="issues">
              {errors.slice(0, 8).map((r) => (
                <li key={r.line} className="issue issue-error">
                  第 {r.line} 行：{r.error}
                </li>
              ))}
              {errors.length > 8 && <li className="muted small">…另有 {errors.length - 8} 筆錯誤</li>}
            </ul>
          )}
          {capacityMsg && <div className="notice notice-err">{capacityMsg}</div>}
        </div>
      )}
      <ConsentCheck checked={consent} onChange={setConsent} />
      <div className="actions">
        <button
          className="btn btn-primary"
          disabled={busy || valid.length === 0 || !!capacityMsg || !consent}
          onClick={doImport}
        >
          {busy ? '匯入中…' : `匯入 ${valid.length} 位隊員`}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          關閉
        </button>
      </div>
    </div>
  );
}

export default function MembersPanel({ data }: { data: TeamPageData }) {
  const { members, entries, events, editable, settings, reload, merged, orgNames } = data;
  const toast = useToast();
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const eventsByMember = useMemo(() => {
    const names = new Map(events.map((e) => [e.id, e.name]));
    const map = new Map<string, string[]>();
    for (const e of entries) map.set(e.member_id, [...(map.get(e.member_id) ?? []), names.get(e.event_id) ?? e.event_id]);
    return map;
  }, [entries, events]);

  const canEdit = (m: Member) => editable && (data.isAdmin || m.org_id === data.myOrgId);
  // 資料待補：只算看得到個資的隊員（聯隊其他公司的隊員由該公司窗口負責）
  const missingOf = (m: Member) => (m.private ? missingFields(m.private) : []);
  const missingCount = members.filter((m) => missingOf(m).length > 0).length;
  const shown = members.filter(
    (m) => (!filter || m.name.includes(filter)) && (!onlyMissing || missingOf(m).length > 0),
  );
  const editing = members.find((m) => m.id === editingId);
  const full = members.length >= settings.team_max_size;

  async function add(v: MemberInput, orgId: string) {
    const msg = checkAddMembers(settings, members.length, 1, data.isAdmin);
    if (msg) {
      toast.error(msg);
      return false;
    }
    try {
      await api.addMembers(data.team.id, orgId, [v]);
      toast.ok(`已新增 ${v.name}`);
      reload();
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  }

  async function update(id: string, v: MemberInput) {
    try {
      await api.updateMember(id, v);
      toast.ok('已更新');
      setEditingId(null);
      reload();
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  }

  async function remove(m: Member) {
    const evs = eventsByMember.get(m.id);
    const extra = evs?.length ? `\n此隊員已報名：${evs.join('、')}，將一併取消。` : '';
    if (!confirm(`確定要刪除隊員「${m.name}」？${extra}`)) return;
    try {
      await api.deleteMember(m.id);
      toast.ok(`已刪除 ${m.name}`);
      reload();
    } catch (err) {
      toast.error(err);
    }
  }

  // 只限所屬公司檢視的欄位：證號、生日、特殊需求、手機、尺寸
  const privateCols = 5;

  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder="搜尋姓名" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted small">
          {members.length} / {settings.team_max_size} 人
        </span>
        {(missingCount > 0 || onlyMissing) && (
          <button
            className={`chip${onlyMissing ? ' chip-active' : ''}`}
            title="尚未填寫身分證字號、生日或用餐習慣的隊員；點選只顯示這些隊員"
            onClick={() => setOnlyMissing(!onlyMissing)}
          >
            資料待補 {missingCount} 人
          </button>
        )}
        <div className="spacer" />
        {editable && (
          <>
            <button className="btn btn-ghost" disabled={full} onClick={() => setPanel(panel === 'import' ? 'none' : 'import')}>
              批次貼上
            </button>
            <button className="btn btn-primary" disabled={full} onClick={() => setPanel(panel === 'add' ? 'none' : 'add')}>
              ＋ 新增隊員
            </button>
          </>
        )}
      </div>

      {merged && !data.isAdmin && (
        <div className="notice notice-info">
          這是聯隊：你只能新增、編輯「{orgNames.get(data.myOrgId ?? '')}」的隊員，其他公司隊員只顯示姓名、性別與用餐習慣；身分證 / 居留證字號、生日、特殊需求、手機、衣服尺寸只有該公司窗口看得到。
        </div>
      )}

      {editable && panel === 'add' && !editing && (
        <MemberForm data={data} onSubmit={add} onCancel={() => setPanel('none')} />
      )}
      {editable && panel === 'import' && <ImportPanel data={data} onDone={() => setPanel('none')} />}
      {editing && (
        <MemberForm
          key={editing.id}
          data={data}
          initial={editing}
          onSubmit={(v) => update(editing.id, v)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {members.length === 0 ? (
        <EmptyState title="尚未新增隊員">點選「新增隊員」逐筆輸入，或用「批次貼上」從 Excel 匯入整份名單。</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>姓名</th>
                {merged && <th>所屬公司</th>}
                <th>性別</th>
                <th>用餐</th>
                <th>證號</th>
                <th>生日</th>
                <th>特殊需求</th>
                <th>手機</th>
                <th>尺寸</th>
                <th>已報項目</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((m, i) => {
                const p = m.private;
                const missing = missingOf(m);
                const blank = <span className="muted">未填</span>;
                return (
                  <tr key={m.id} className={m.id === editingId ? 'row-active' : undefined}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <b>{m.name}</b>
                      {missing.length > 0 && (
                        <span className="member-missing" title={`待補：${missing.join('、')}`}>
                          <Badge tone="warn">待補</Badge>
                        </span>
                      )}
                    </td>
                    {merged && <td className="muted">{orgNames.get(m.org_id) ?? '—'}</td>}
                    <td>
                      <Badge tone={m.gender === 'F' ? 'accent' : 'primary'}>{GENDER_LABEL[m.gender]}</Badge>
                    </td>
                    <td>
                      {!m.diet ? (
                        p ? blank : <span className="muted">—</span>
                      ) : m.diet === 'meat' ? (
                        DIET_LABEL[m.diet]
                      ) : (
                        <Badge tone="ok">{DIET_LABEL[m.diet]}</Badge>
                      )}
                    </td>
                    {p ? (
                      <>
                        <td className="mono">{p.national_id ? maskId(p.national_id) : blank}</td>
                        <td className="mono">{p.birthday ?? blank}</td>
                        <td>{p.special_needs ? <Badge tone="warn">{p.special_needs}</Badge> : <span className="muted">—</span>}</td>
                        <td className="mono">{p.phone ?? '—'}</td>
                        <td>{p.shirt_size ?? '—'}</td>
                      </>
                    ) : (
                      <td colSpan={privateCols} className="muted small private-hidden">
                        {data.isAdmin || m.org_id === data.myOrgId ? '個資已清除' : '個資僅限所屬公司檢視'}
                      </td>
                    )}
                    <td>
                      <div className="chips">
                        {(eventsByMember.get(m.id) ?? []).map((n) => (
                          <span key={n} className="chip chip-sm">
                            {n}
                          </span>
                        ))}
                      </div>
                    </td>
                    {editable && (
                      <td className="cell-actions">
                        {canEdit(m) && (
                          <>
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() => {
                                setPanel('none');
                                setEditingId(m.id);
                              }}
                            >
                              編輯
                            </button>
                            <button className="btn btn-xs btn-danger-ghost" onClick={() => remove(m)}>
                              刪除
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
