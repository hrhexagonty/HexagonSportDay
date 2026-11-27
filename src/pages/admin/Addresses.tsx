import { Fragment, useState } from 'react';
import { OrgAddressForm } from '../../components/OrgAddressForm';
import { Badge, StatCard } from '../../components/ui';
import { downloadCsv, type Cell } from '../../lib/csv';
import { dateStamp, filePrefix, formatDateTime } from '../../lib/format';
import { missingAddressFields, sampleAddressOf } from '../../lib/orgAddress';
import type { AdminData } from './types';

type Filter = 'all' | 'missing' | 'done';

/** 姓名與電話合併成一行，例如「王小明 0912-345-678」；都沒填回傳 null */
const contactLine = (name: string | null | undefined, phone: string | null | undefined) =>
  [name, phone].filter(Boolean).join(' ') || null;

/**
 * 後台「接駁與樣衣」：各公司填寫的接駁車接送地址與車長、樣衣寄送地址與收件人
 * 管理員可代填（含截止後）；委外廠商只能檢視與匯出（含完整電話）
 */
export default function Addresses({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const { orgs, teams, addresses, settings, readOnly } = data;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);

  const addressOf = new Map(addresses.map((a) => [a.org_id, a]));
  const rows = [...orgs]
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    .map((o) => {
      const address = addressOf.get(o.id) ?? null;
      return {
        org: o,
        address,
        teamNames: teams
          .filter((t) => t.org_ids.includes(o.id))
          .map((t) => t.name)
          .join('、'),
        missing: missingAddressFields(address),
      };
    });
  const done = rows.filter((r) => r.missing.length === 0).length;
  const shown = rows.filter(
    (r) =>
      (filter === 'all' || (filter === 'missing' ? r.missing.length > 0 : r.missing.length === 0)) &&
      (!search || r.org.name.includes(search) || r.teamNames.includes(search)),
  );

  function exportCsv() {
    const out: Cell[][] = [
      [
        '公司',
        '參與隊伍',
        '接駁車接送地址',
        '車長姓名',
        '車長電話',
        '樣衣寄送地址',
        '樣衣同上',
        '樣衣收件人姓名',
        '樣衣收件人電話',
        '最後更新',
      ],
    ];
    for (const { org, teamNames, address: a } of rows) {
      out.push([
        org.name,
        teamNames,
        a?.shuttle_address,
        a?.shuttle_leader_name,
        a?.shuttle_leader_phone,
        sampleAddressOf(a),
        a?.sample_same ? '是' : '',
        a?.sample_recipient_name,
        a?.sample_recipient_phone,
        formatDateTime(a?.updated_at ?? null),
      ]);
    }
    downloadCsv(`${filePrefix(settings.event_title)}接駁與樣衣寄送_${dateStamp()}.csv`, out);
  }

  const empty = <span className="muted">未填</span>;

  return (
    <div className="stack-lg">
      <div className="grid grid-stats">
        <StatCard
          label="已填寫"
          value={`${done} / ${orgs.length} 家`}
          hint="地址、車長、樣衣收件人都已填寫"
          tone={orgs.length > 0 && done === orgs.length ? 'ok' : 'neutral'}
        />
        <StatCard label="待填寫" value={`${orgs.length - done} 家`} hint="由各公司窗口在「我的公司」填寫" />
      </div>

      <section className="card stack">
        <div className="toolbar">
          <div>
            <h2>接駁車與樣衣寄送</h2>
            <p className="muted small">
              各公司窗口在「我的公司」頁填寫，同公司各分隊共用一份。
              {readOnly ? '' : '報名截止後窗口無法修改，可由管理員代為修改。'}
            </p>
          </div>
          <div className="spacer" />
          <input className="search" placeholder="搜尋公司或隊伍" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">全部公司</option>
            <option value="missing">待填寫</option>
            <option value="done">已填寫</option>
          </select>
          <button className="btn btn-sm" onClick={exportCsv} disabled={orgs.length === 0}>
            下載 CSV（含電話）
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>公司</th>
                <th>接駁車接送地址 / 車長</th>
                <th>樣衣寄送地址 / 收件人</th>
                <th>最後更新</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ org, address: a, teamNames, missing }) => (
                <Fragment key={org.id}>
                  <tr>
                    <td>
                      <b>{org.name}</b>
                      {teamNames && <div className="muted small">{teamNames}</div>}
                      {missing.length > 0 && (
                        <div title={`未填：${missing.join('、')}`}>
                          <Badge tone="warn">待填寫 {missing.length} 項</Badge>
                        </div>
                      )}
                    </td>
                    <td className="address-cell">
                      {a?.shuttle_address ?? empty}
                      <div className="muted small address-contact">
                        車長：{contactLine(a?.shuttle_leader_name, a?.shuttle_leader_phone) ?? '未填'}
                      </div>
                    </td>
                    <td className="address-cell">
                      {sampleAddressOf(a) ?? empty}
                      {a?.sample_same && <span className="muted small">（同上）</span>}
                      <div className="muted small address-contact">
                        收件人：{contactLine(a?.sample_recipient_name, a?.sample_recipient_phone) ?? '未填'}
                      </div>
                    </td>
                    <td className="nowrap muted small">{formatDateTime(a?.updated_at ?? null) ?? '—'}</td>
                    {!readOnly && (
                      <td className="nowrap">
                        <button className="btn btn-xs" onClick={() => setEditing(editing === org.id ? null : org.id)}>
                          {editing === org.id ? '收合' : '編輯'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {!readOnly && editing === org.id && (
                    <tr className="address-edit-row">
                      <td colSpan={5}>
                        <OrgAddressForm
                          key={a?.updated_at ?? 'new'}
                          orgId={org.id}
                          address={a}
                          editable
                          onSaved={() => {
                            setEditing(null);
                            onChanged();
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} className="muted center">
                    {orgs.length === 0 ? '尚未建立公司' : '沒有符合條件的公司'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
