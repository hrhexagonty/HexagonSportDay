import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { downloadCsv, type Cell } from '../../lib/csv';
import { dateStamp, filePrefix } from '../../lib/format';
import { sortEvents } from '../../lib/rules';
import { CATEGORY_LABEL, DIETS, DIET_LABEL, GENDER_LABEL, SHIRT_SIZES, type Member } from '../../lib/types';
import type { AdminData } from './types';

/** 產生各種匯出報表（含完整證號，僅管理員可下載） */
function buildReports(data: AdminData) {
  const { orgs, teams, members, entries, events } = data;
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const eventOrder = new Map(sortEvents(events).map((e, i) => [e.id, i]));
  const teamName = (id: string) => teamById.get(id)?.name ?? '';
  const company = (m: Member) => orgName.get(m.org_id) ?? '';

  const sortedMembers = [...members].sort(
    (a, b) =>
      teamName(a.team_id).localeCompare(teamName(b.team_id), 'zh-TW') ||
      company(a).localeCompare(company(b), 'zh-TW') ||
      a.name.localeCompare(b.name, 'zh-TW'),
  );
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  // 保險需要證號與生日；尚未補齊的隊員仍列出（欄位留空）
  const insured = members.filter((m) => m.private?.national_id && m.private.birthday).length;

  const roster = (): Cell[][] => {
    const byMember = new Map<string, string[]>();
    for (const e of entries) byMember.set(e.member_id, [...(byMember.get(e.member_id) ?? []), eventById.get(e.event_id)?.name ?? e.event_id]);
    return [
      ['隊伍', '所屬公司', '姓名', '性別', '身分證字號', '生日', '手機', '衣服尺寸', '用餐習慣', '特殊需求', '報名項目'],
      ...sortedMembers.map((m) => [
        teamName(m.team_id),
        company(m),
        m.name,
        GENDER_LABEL[m.gender],
        m.private?.national_id,
        m.private?.birthday,
        m.private?.phone,
        m.private?.shirt_size,
        m.private?.diet ? DIET_LABEL[m.private.diet] : null,
        m.private?.special_needs,
        (byMember.get(m.id) ?? []).join('、'),
      ]),
    ];
  };

  const insurance = (): Cell[][] => [
    ['姓名', '身分證字號', '生日', '性別', '所屬公司', '隊伍'],
    ...sortedMembers.map((m) => [m.name, m.private?.national_id, m.private?.birthday, GENDER_LABEL[m.gender], company(m), teamName(m.team_id)]),
  ];

  const signups = (): Cell[][] => {
    const rows = entries
      .map((e) => ({ m: memberById.get(e.member_id), ev: eventById.get(e.event_id) }))
      .filter((x): x is { m: Member; ev: NonNullable<typeof x.ev> } => !!x.m && !!x.ev)
      .sort(
        (a, b) =>
          (eventOrder.get(a.ev.id) ?? 0) - (eventOrder.get(b.ev.id) ?? 0) ||
          teamName(a.m.team_id).localeCompare(teamName(b.m.team_id), 'zh-TW'),
      );
    return [
      ['項目', '類別', '隊伍', '所屬公司', '姓名', '性別'],
      ...rows.map(({ m, ev }) => [ev.name, CATEGORY_LABEL[ev.category], teamName(m.team_id), company(m), m.name, GENDER_LABEL[m.gender]]),
    ];
  };

  const meals = (): Cell[][] => {
    const count = (list: Member[]) => [
      ...DIETS.map((d) => list.filter((m) => m.private?.diet === d).length),
      list.filter((m) => !m.private?.diet).length,
      list.length,
    ];
    return [
      ['隊伍', ...DIETS.map((d) => DIET_LABEL[d]), '未填', '合計'],
      ...sortedTeams.map((t) => [t.name, ...count(members.filter((m) => m.team_id === t.id))]),
      ['總計', ...count(members)],
    ];
  };

  const needs = members.filter((m) => m.private?.special_needs);
  const specialNeeds = (): Cell[][] => [
    ['隊伍', '所屬公司', '姓名', '性別', '特殊需求', '手機'],
    ...needs
      .sort((a, b) => teamName(a.team_id).localeCompare(teamName(b.team_id), 'zh-TW'))
      .map((m) => [teamName(m.team_id), company(m), m.name, GENDER_LABEL[m.gender], m.private!.special_needs, m.private!.phone]),
  ];

  const shirts = (): Cell[][] => {
    const count = (list: Member[]) => [
      ...SHIRT_SIZES.map((s) => list.filter((m) => m.private?.shirt_size === s).length),
      list.filter((m) => !m.private?.shirt_size).length,
      list.length,
    ];
    return [
      ['隊伍', ...SHIRT_SIZES, '未填', '合計'],
      ...sortedTeams.map((t) => [t.name, ...count(members.filter((m) => m.team_id === t.id))]),
      ['總計', ...count(members)],
    ];
  };

  return [
    { key: 'roster', title: '隊員總名單', desc: '所有隊員完整資料（含身分證字號、生日、用餐與特殊需求）與報名項目。', count: `${members.length} 人`, build: roster, sensitive: true },
    { key: 'insurance', title: '保險名冊', desc: '姓名、身分證字號、生日，供投保活動保險使用；尚未補齊的隊員欄位留空。', count: `${insured} / ${members.length} 人已填`, build: insurance, sensitive: true },
    { key: 'signups', title: '項目報名名單', desc: '依項目列出各隊選手，可直接用於檢錄。', count: `${entries.length} 筆`, build: signups, sensitive: false },
    { key: 'meals', title: '用餐統計', desc: '各隊葷食 / 蛋奶素 / 全素份數，供訂餐使用。', count: `${teams.length} 隊`, build: meals, sensitive: false },
    { key: 'needs', title: '特殊需求名單', desc: '有填寫特殊需求（過敏、無障礙等）的隊員，供場地與餐點安排。', count: `${needs.length} 人`, build: specialNeeds, sensitive: true },
    { key: 'shirts', title: '衣服尺寸統計', desc: '各隊伍衣服尺寸數量，供製作隊服。', count: `${teams.length} 隊`, build: shirts, sensitive: false },
  ];
}

export default function Exports({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const toast = useToast();
  const reports = buildReports(data);
  const prefix = filePrefix(data.settings.event_title);
  const privateCount = data.members.filter((m) => m.private).length;

  async function purge() {
    const answer = prompt(
      `將永久刪除 ${privateCount} 位隊員的個資（身分證字號、生日、手機、尺寸、用餐、特殊需求），僅保留姓名、性別與報名紀錄。\n此動作無法復原，請先完成所需匯出。\n\n確定請輸入「清除個資」：`,
    );
    if (answer === null) return;
    if (answer.trim() !== '清除個資') {
      toast.error('輸入不符，未執行清除');
      return;
    }
    try {
      const n = await api.purgePrivateData();
      toast.ok(`已清除 ${n} 筆隊員個資`);
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="stack-lg">
      <div className="notice notice-warn">含個資的報表（標示「含個資」）請妥善保存，勿以公開管道傳送，活動結束後請刪除檔案。</div>
      <div className="grid grid-exports">
        {reports.map((r) => (
          <div key={r.key} className="card export-card">
            <div className="title-row">
              <h3>{r.title}</h3>
              {r.sensitive && <span className="badge badge-err">含個資</span>}
            </div>
            <p className="muted small">{r.desc}</p>
            <div className="export-foot">
              <span className="muted">{r.count}</span>
              <button className="btn btn-primary btn-sm" onClick={() => downloadCsv(`${prefix}_${r.title}_${dateStamp()}.csv`, r.build())}>
                下載 CSV
              </button>
            </div>
          </div>
        ))}
      </div>

      <section className="card danger-zone">
        <div>
          <h3>活動結束後清除個資</h3>
          <p className="muted small">
            依個資保護原則，活動結束且保險期間屆滿後，請刪除所有隊員個資。清除後僅保留姓名、性別、隊伍與報名紀錄（供成績與紀念用途）。
            目前有 {privateCount} 位隊員的個資。
          </p>
        </div>
        <button className="btn btn-danger" disabled={privateCount === 0} onClick={purge}>
          清除所有個資
        </button>
      </section>
    </div>
  );
}
