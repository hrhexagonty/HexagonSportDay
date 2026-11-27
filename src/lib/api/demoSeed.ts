// 展示模式的初始資料（以固定亂數種子產生，每次重置都一樣；證號皆為隨機產生的假資料）
import { withCheckDigit } from '../idNumber';
import {
  SHIRT_SIZES,
  type Diet,
  type EventEntry,
  type Gender,
  type GuidePage,
  type Member,
  type MemberPrivate,
  type OrgAddress,
  type OrgSquad,
  type Organization,
  type Role,
  type Settings,
  type SportEvent,
  type Team,
  type TeamInvite,
  type Vendor,
} from '../types';

export interface DemoUser {
  id: string;
  email: string;
  password: string;
  /** 對應 profiles.role；委外廠商由 vendorContacts 判定 */
  role: Exclude<Role, 'vendor'>;
}

/** 委外廠商帳號綁定（對應 vendor_contacts 表） */
export interface DemoVendorContact {
  user_id: string;
  vendor_id: string;
  created_at: string;
}

/** 窗口與隊伍的綁定（對應 team_contacts 表） */
export interface DemoContact {
  user_id: string;
  team_id: string;
  org_id: string;
  created_at: string;
}

export interface DemoDb {
  version: 10;
  settings: Settings;
  organizations: Organization[];
  teams: Team[];
  invites: TeamInvite[];
  contacts: DemoContact[];
  /** 內部保存完整個資；回傳給頁面前依權限遮蔽 */
  members: Member[];
  events: SportEvent[];
  entries: EventEntry[];
  /** 公司組隊（健力），對應 org_squads + org_squad_members */
  squads: OrgSquad[];
  /** 委外廠商與其帳號 */
  vendors: Vendor[];
  vendorContacts: DemoVendorContact[];
  /** 公司地址（對應 org_addresses） */
  orgAddresses: OrgAddress[];
  /** 活動指南頁面（對應 guide_pages） */
  guidePages: GuidePage[];
  users: DemoUser[];
  sessionUserId: string | null;
}

/** 與 supabase/migrations 初始資料相同，修改時需同步 */
export const DEMO_EVENTS: SportEvent[] = [
  { id: 'fun1', name: '同心鼓顛球', category: 'fun', description: '全隊拉繩控制同心鼓，合力讓球在鼓面上連續彈跳。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 1, rules: '', video_url: '' },
  { id: 'fun2', name: '四關障礙接力', category: 'fun', description: '隊員分棒接力，依序完成四個障礙關卡。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 2, rules: '', video_url: '' },
  { id: 'fun3', name: '嗨ROX競賽', category: 'fun', description: '結合跑步與多項體能關卡的團隊挑戰。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 3, rules: '', video_url: '' },
  { id: 'fun4', name: '毛毛蟲大隊接力', category: 'fun', description: '隊員組成毛毛蟲隊形同步前進，完成大隊接力。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 4, rules: '', video_url: '' },
  { id: 'powerlifting', name: '健力比賽', category: 'powerlifting', description: '深蹲、臥推、硬舉三項，每隊 10 人參賽。', min_per_team: 10, max_per_team: 10, min_female: 4, sort_order: 5, rules: '', video_url: '' },
];

/** 展示用的範例競賽規則（正式環境由管理員於後台填寫） */
const DEMO_RULES: Record<string, string> = {
  fun1: '1. 每隊 10 人，每人各拉一條繩，不可用手直接碰觸鼓面或球。\n2. 計時 2 分鐘，以球在鼓面上連續彈跳的最高次數計分。\n3. 球落地即中斷，重新開始計算連續次數。',
  fun2: '1. 每隊 10 人分棒接力，依序通過四個障礙關卡。\n2. 漏關或關卡未完成者需回到該關重來。\n3. 以最後一棒抵達終點的時間計算成績。',
  fun3: '1. 跑步與體能關卡交替進行，每位隊員至少完成一個關卡。\n2. 關卡動作不標準由裁判判定加罰次數。\n3. 以全隊完成時間排名。',
  fun4: '1. 全隊 10 人跨坐毛毛蟲道具同步前進。\n2. 隊員雙腳需保持在道具內，中途脫隊需回到起點重來。\n3. 以抵達終點的時間計算成績。',
  powerlifting:
    '1. 以公司為單位組隊，每隊 10 人且女性需達規定人數；同一位同仁只能參加一隊。\n2. 比賽項目為深蹲、臥推、硬舉，每項三次試舉，取最佳成績。\n3. 依體重係數換算後的總和計算團體成績。',
};

export const DEMO_ACCOUNTS = {
  org: { email: 'org@demo.local', password: 'demo', label: '隊伍窗口（六角科技，管理 2 隊）' },
  merged: { email: 'energy@demo.local', password: 'demo', label: '隊伍窗口（六角能源，參與聯隊）' },
  admin: { email: 'admin@demo.local', password: 'demo', label: '活動管理員' },
  vendor: { email: 'vendor@demo.local', password: 'demo', label: '委外廠商（活動執行公司）' },
} as const;

/** 展示用的活動指南內容（其餘頁面留白，用來展示「尚未公布」） */
const DEMO_GUIDE: Record<string, string> = {
  schedule:
    '<h2>當天活動流程</h2><p>（範例）實際流程以活動小組公告為準。</p>' +
    '<table><thead><tr><th>時間</th><th>流程</th><th>地點</th></tr></thead><tbody>' +
    '<tr><td>08:00</td><td>各隊報到、領取號碼布</td><td>體育館大門</td></tr>' +
    '<tr><td>09:00</td><td>開幕式、暖身操</td><td>中央草坪</td></tr>' +
    '<tr><td>09:40</td><td>趣味競賽（同心鼓顛球、四關障礙接力）</td><td>A、B 場</td></tr>' +
    '<tr><td>12:00</td><td>午餐</td><td>各隊休息區</td></tr>' +
    '<tr><td>13:00</td><td>嗨ROX競賽、健力比賽</td><td>C 場、重訓區</td></tr>' +
    '<tr><td>15:30</td><td>毛毛蟲大隊接力</td><td>田徑場</td></tr>' +
    '<tr><td>16:30</td><td>頒獎、閉幕</td><td>中央草坪</td></tr>' +
    '</tbody></table>',
  uniforms:
    '<h2>隊服顏色對照</h2><p>（範例）各隊隊服顏色如下，請於報到時確認。</p>' +
    '<table><thead><tr><th>隊伍</th><th>顏色</th></tr></thead><tbody>' +
    '<tr><td>六角科技 閃電隊</td><td><span style="color: #ffd400;">■</span> 閃電黃</td></tr>' +
    '<tr><td>六角建設 鋼鐵隊</td><td><span style="color: #8a8f98;">■</span> 鋼鐵灰</td></tr>' +
    '<tr><td>六角餐飲 美味隊</td><td><span style="color: #ff6b35;">■</span> 橘紅</td></tr>' +
    '<tr><td>醫材能源文創 聯隊</td><td><span style="color: #10b981;">■</span> 翡翠綠</td></tr>' +
    '</tbody></table>',
};

// [公司名稱, 邀請碼前綴, 聯絡人]；邀請碼 = 前綴 + 隊伍編號，例如 TECH01
const ORGS: [string, string, string][] = [
  ['六角科技', 'TECH', '林雅婷'],
  ['六角建設', 'BUIL', '陳建宏'],
  ['六角物流', 'LOGI', '黃志明'],
  ['六角餐飲', 'FOOD', '張怡君'],
  ['六角金融', 'FINA', '李冠宇'],
  ['六角醫材', 'MEDI', '王佳穎'],
  ['六角能源', 'ENGY', '吳家豪'],
  ['六角文創', 'ARTS', '劉詩涵'],
];

// [參與公司索引, 隊名, 各公司隊員數, 報名完成度]；參與公司為空 = 尚未分配
const TEAMS: [number[], string, number[], 'full' | 'partial' | 'none'][] = [
  [[0], '六角科技 閃電隊', [36], 'full'],
  [[0], '六角科技 火箭隊', [24], 'partial'],
  [[0], '六角科技 獵豹隊', [0], 'none'],
  [[1], '六角建設 鋼鐵隊', [38], 'full'],
  [[1], '六角建設 磐石隊', [15], 'partial'],
  [[2], '六角物流 疾風隊', [31], 'partial'],
  [[3], '六角餐飲 美味隊', [34], 'full'],
  [[4], '六角金融 金牛隊', [20], 'none'],
  [[5, 6, 7], '醫材能源文創 聯隊', [12, 10, 11], 'full'],
  [[], '飛鷹隊', [], 'none'],
];

const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周';
const GIVEN = '雅婷志明怡君冠宇佳穎家豪俊傑淑芬建宏詩涵承恩宜蓁柏翰欣妤彥廷思妍子晴品睿孟哲郁安';
const ID_LETTERS = 'AABBCDEFFHHJKLMNPQRSTUVXY';
const NEEDS = ['不吃牛', '海鮮過敏', '需無障礙通道', '花生過敏'];

/** 固定種子的亂數產生器（mulberry32） */
function createRng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeed(): DemoDb {
  const rng = createRng(20261117);
  const pick = <T>(arr: ArrayLike<T>): T => arr[Math.floor(rng() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const usedIds = new Set<string>();

  /** 產生通過檢查碼的假證號（約 4% 為新式居留證） */
  function fakeId(gender: Gender): string {
    for (;;) {
      const foreign = rng() < 0.04;
      const d1 = foreign ? (gender === 'M' ? '8' : '9') : gender === 'M' ? '1' : '2';
      const id = withCheckDigit(pick(ID_LETTERS) + d1 + String(int(0, 9999999)).padStart(7, '0'));
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
  }

  function fakeDiet(): Diet {
    const r = rng();
    return r < 0.78 ? 'meat' : r < 0.86 ? 'meat_no_pork' : r < 0.95 ? 'ovo_lacto' : 'vegan';
  }

  const organizations: Organization[] = ORGS.map(([name, , contact], i) => ({
    id: `org-${i + 1}`,
    name,
    contact_name: contact,
    contact_phone: `02-2700-${String(1000 + i * 37).padStart(4, '0')}`,
  }));

  const teams: Team[] = [];
  const invites: TeamInvite[] = [];
  const members: Member[] = [];
  const entries: EventEntry[] = [];

  TEAMS.forEach(([orgIdxs, name, sizes, fill], ti) => {
    const team: Team = {
      id: `team-${ti + 1}`,
      name,
      captain_name: null,
      captain_phone: null,
      contact_limit: 2,
      org_ids: orgIdxs.map((i) => organizations[i].id),
    };
    teams.push(team);
    for (const i of orgIdxs) {
      invites.push({ team_id: team.id, org_id: organizations[i].id, invite_code: `${ORGS[i][1]}${String(ti + 1).padStart(2, '0')}` });
    }

    const teamMembers: Member[] = [];
    orgIdxs.forEach((orgIdx, k) => {
      for (let i = 0; i < sizes[k]; i++) {
        const gender: Gender = rng() < 0.45 ? 'F' : 'M';
        const name = pick(SURNAMES) + pick(GIVEN) + pick(GIVEN);
        const priv: MemberPrivate = {
          national_id: fakeId(gender),
          birthday: `${int(1966, 2003)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
          phone: `09${String(Math.floor(rng() * 1e8)).padStart(8, '0')}`,
          shirt_size: pick(SHIRT_SIZES.slice(1, 6)),
          diet: fakeDiet(),
          special_needs: rng() < 0.06 ? pick(NEEDS) : null,
        };
        // 展示「資料待補」：部分隊員只先填了姓名與性別（先產生完整資料再清空，不影響亂數序列）
        if ((teamMembers.length + ti) % 11 === 5) Object.assign(priv, { national_id: null, birthday: null, diet: null });
        teamMembers.push({
          id: `m-${ti + 1}-${teamMembers.length + 1}`,
          team_id: team.id,
          org_id: organizations[orgIdx].id,
          name,
          gender,
          diet: priv.diet,
          private: priv,
        });
      }
    });
    members.push(...teamMembers);

    if (teamMembers[0]) {
      team.captain_name = teamMembers[0].name;
      team.captain_phone = teamMembers[0].private?.phone ?? null;
    }

    if (fill === 'none') return;
    // 健力比賽改以公司為單位報名（尚未開放），展示資料只安排隊伍報名項目
    const teamEvs = DEMO_EVENTS.filter((e) => e.category !== 'powerlifting');
    const events = fill === 'full' ? teamEvs : teamEvs.slice(0, 2);
    const ratio = fill === 'full' ? 1 : 0.6;
    const load = new Map<string, number>();

    for (const ev of events) {
      const target = Math.round(ev.max_per_team * ratio);
      const picked: Member[] = [];
      const available = (g?: Gender) =>
        teamMembers
          .filter((m) => (load.get(m.id) ?? 0) < 2 && !picked.includes(m) && (!g || m.gender === g))
          .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
      const needFemale = fill === 'full' ? Math.min(ev.min_female, target) : Math.floor(ev.min_female / 2);
      picked.push(...available('F').slice(0, needFemale));
      picked.push(...available().slice(0, target - picked.length));
      for (const m of picked) {
        load.set(m.id, (load.get(m.id) ?? 0) + 1);
        entries.push({ event_id: ev.id, member_id: m.id });
      }
    }
  });

  // 範例：六角科技已建立一支健力隊伍草稿（跨分隊選人）
  const techMembers = members.filter((m) => m.org_id === 'org-1');
  const squads: OrgSquad[] = [
    {
      id: 'squad-1',
      org_id: 'org-1',
      event_id: 'powerlifting',
      submitted_at: null,
      created_at: '2026-11-15T01:00:00.000Z',
      member_ids: [
        ...techMembers.filter((m) => m.gender === 'F').slice(0, 2),
        ...techMembers.filter((m) => m.gender === 'M').slice(-4),
      ].map((m) => m.id),
    },
  ];

  return {
    version: 10,
    settings: {
      event_title: 'Hexagon 運動會',
      event_date: '2027-03-27',
      venue: '（範例）市立綜合體育館',
      registration_open: true,
      registration_deadline: '2027-02-26T15:59:00.000Z', // 台灣時間 2027/2/26 23:59
      total_team_target: 24,
      team_min_size: 30,
      team_max_size: 40,
      max_events_per_member: 2,
    },
    organizations,
    teams,
    invites,
    contacts: [
      { user_id: 'u-org', team_id: 'team-1', org_id: 'org-1', created_at: '2026-11-18T01:00:00.000Z' },
      { user_id: 'u-org', team_id: 'team-2', org_id: 'org-1', created_at: '2026-11-18T01:00:00.000Z' },
      { user_id: 'u-energy', team_id: 'team-9', org_id: 'org-7', created_at: '2026-11-18T02:00:00.000Z' },
    ],
    members,
    events: DEMO_EVENTS.map((e) => ({ ...e, rules: DEMO_RULES[e.id] ?? '' })),
    entries,
    squads,
    // 範例：六角科技已填寫地址（樣衣同上）；其他公司尚未填寫
    orgAddresses: [
      {
        org_id: 'org-1',
        shuttle_address: '（範例）台北市內湖區瑞光路 100 號 1 樓大廳',
        shuttle_leader_name: '（範例）陳車長',
        shuttle_leader_phone: '0912-000-111',
        sample_address: null,
        sample_same: true,
        sample_recipient_name: '（範例）林收件',
        sample_recipient_phone: '02-2700-0000 #123',
        updated_at: '2026-11-20T03:00:00.000Z',
      },
    ],
    vendors: [{ id: 'vendor-1', name: '（範例）活動執行公司', invite_code: 'VENDOR01', account_limit: 3 }],
    vendorContacts: [{ user_id: 'u-vendor', vendor_id: 'vendor-1', created_at: '2026-11-19T01:00:00.000Z' }],
    guidePages: ['venue', 'schedule', 'uniforms', 'meals', 'transport'].map((id) => ({
      id,
      content: DEMO_GUIDE[id] ?? '',
      updated_at: DEMO_GUIDE[id] ? '2026-11-20T02:00:00.000Z' : null,
    })),
    users: [
      { id: 'u-admin', email: DEMO_ACCOUNTS.admin.email, password: 'demo', role: 'super_admin' },
      { id: 'u-org', email: DEMO_ACCOUNTS.org.email, password: 'demo', role: 'org_admin' },
      { id: 'u-energy', email: DEMO_ACCOUNTS.merged.email, password: 'demo', role: 'org_admin' },
      { id: 'u-vendor', email: DEMO_ACCOUNTS.vendor.email, password: 'demo', role: 'org_admin' },
    ],
    sessionUserId: null,
  };
}
