// 展示模式的初始資料（以固定亂數種子產生，每次重置都一樣；證號皆為隨機產生的假資料）
import { withCheckDigit } from '../idNumber';
import {
  SHIRT_SIZES,
  type Diet,
  type EventEntry,
  type Gender,
  type Member,
  type Organization,
  type Role,
  type Settings,
  type SportEvent,
  type Team,
} from '../types';

export interface DemoUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  org_id: string | null;
}

export interface DemoDb {
  version: 3;
  settings: Settings;
  organizations: Organization[];
  teams: Team[];
  /** 內部保存完整個資；回傳給頁面前依權限遮蔽 */
  members: Member[];
  events: SportEvent[];
  entries: EventEntry[];
  users: DemoUser[];
  sessionUserId: string | null;
}

/** 與 supabase/migrations 初始資料相同，修改時需同步 */
export const DEMO_EVENTS: SportEvent[] = [
  { id: 'fun1', name: '同心鼓顛球', category: 'fun', description: '全隊拉繩控制同心鼓，合力讓球在鼓面上連續彈跳。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 1 },
  { id: 'fun2', name: '四關障礙接力', category: 'fun', description: '隊員分棒接力，依序完成四個障礙關卡。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 2 },
  { id: 'fun3', name: '嗨ROX競賽', category: 'fun', description: '結合跑步與多項體能關卡的團隊挑戰。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 3 },
  { id: 'fun4', name: '毛毛蟲大隊接力', category: 'fun', description: '隊員組成毛毛蟲隊形同步前進，完成大隊接力。', min_per_team: 10, max_per_team: 10, min_female: 0, sort_order: 4 },
  { id: 'powerlifting', name: '健力比賽', category: 'powerlifting', description: '深蹲、臥推、硬舉三項，每隊 10 人參賽。', min_per_team: 10, max_per_team: 10, min_female: 4, sort_order: 5 },
];

export const DEMO_ACCOUNTS = {
  org: { email: 'org@demo.local', password: 'demo', label: '公司窗口（六角科技）' },
  merged: { email: 'energy@demo.local', password: 'demo', label: '公司窗口（六角能源，參與聯隊）' },
  admin: { email: 'admin@demo.local', password: 'demo', label: '活動管理員' },
} as const;

// [公司名稱, 自組隊伍額度, 邀請碼, 聯絡人]；額度合計 23 + 1 支聯隊 = 24 隊
const ORGS: [string, number, string, string][] = [
  ['六角科技', 6, 'TECH2026', '林雅婷'],
  ['六角建設', 5, 'BUILD026', '陳建宏'],
  ['六角物流', 4, 'LOGI2026', '黃志明'],
  ['六角餐飲', 4, 'FOOD2026', '張怡君'],
  ['六角金融', 4, 'FINA2026', '李冠宇'],
  ['六角醫材', 0, 'MEDI2026', '王佳穎'],
  ['六角能源', 0, 'ENGY2026', '吳家豪'],
  ['六角文創', 0, 'ARTS2026', '劉詩涵'],
];

// [參與公司索引, 隊名, 各公司隊員數, 報名完成度]
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
    return r < 0.85 ? 'meat' : r < 0.95 ? 'ovo_lacto' : 'vegan';
  }

  const organizations: Organization[] = ORGS.map(([name, quota, code, contact], i) => ({
    id: `org-${i + 1}`,
    name,
    team_quota: quota,
    invite_code: code,
    contact_name: contact,
    contact_phone: `02-2700-${String(1000 + i * 37).padStart(4, '0')}`,
  }));

  const teams: Team[] = [];
  const members: Member[] = [];
  const entries: EventEntry[] = [];

  TEAMS.forEach(([orgIdxs, name, sizes, fill], ti) => {
    const team: Team = {
      id: `team-${ti + 1}`,
      name,
      captain_name: null,
      captain_phone: null,
      org_ids: orgIdxs.map((i) => organizations[i].id),
    };
    teams.push(team);

    const teamMembers: Member[] = [];
    orgIdxs.forEach((orgIdx, k) => {
      for (let i = 0; i < sizes[k]; i++) {
        const gender: Gender = rng() < 0.45 ? 'F' : 'M';
        teamMembers.push({
          id: `m-${ti + 1}-${teamMembers.length + 1}`,
          team_id: team.id,
          org_id: organizations[orgIdx].id,
          name: pick(SURNAMES) + pick(GIVEN) + pick(GIVEN),
          gender,
          private: {
            national_id: fakeId(gender),
            birthday: `${int(1966, 2003)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
            phone: `09${String(Math.floor(rng() * 1e8)).padStart(8, '0')}`,
            shirt_size: pick(SHIRT_SIZES.slice(1, 6)),
            diet: fakeDiet(),
            special_needs: rng() < 0.06 ? pick(NEEDS) : null,
          },
        });
      }
    });
    members.push(...teamMembers);

    if (teamMembers[0]) {
      team.captain_name = teamMembers[0].name;
      team.captain_phone = teamMembers[0].private?.phone ?? null;
    }

    if (fill === 'none') return;
    const events = fill === 'full' ? DEMO_EVENTS : DEMO_EVENTS.slice(0, 2);
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

  return {
    version: 3,
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
    members,
    events: DEMO_EVENTS.map((e) => ({ ...e })),
    entries,
    users: [
      { id: 'u-admin', email: DEMO_ACCOUNTS.admin.email, password: 'demo', role: 'super_admin', org_id: null },
      { id: 'u-org', email: DEMO_ACCOUNTS.org.email, password: 'demo', role: 'org_admin', org_id: 'org-1' },
      { id: 'u-energy', email: DEMO_ACCOUNTS.merged.email, password: 'demo', role: 'org_admin', org_id: 'org-7' },
    ],
    sessionUserId: null,
  };
}
