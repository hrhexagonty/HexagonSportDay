// 展示模式：資料存在 localStorage，並在記憶體內模擬 Supabase 的 RLS 與 DB trigger 限制
// 讓尚未建立 Supabase 專案時也能完整操作雛形；可見範圍規則見 ./types.ts 的 DataApi 說明
import { cleanMemberInput, validateMemberInput } from '../member';
import { checkAddEntry, checkAddMembers, checkWritable, entriesOfMembers, soloTeamCount } from '../rules';
import type { Member, MemberInput, Team } from '../types';
import { createSeed, type DemoDb } from './demoSeed';
import type { DataApi } from './types';

const STORAGE_KEY = 'hexagon-sportday-demo-v3';

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed.version === 3) return parsed;
    }
  } catch {
    // localStorage 不可用或資料損毀時改用初始資料
  }
  return createSeed();
}

export function resetDemoData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}

export function createDemoApi(): DataApi {
  const db = load();
  const listeners = new Set<() => void>();

  const commit = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // 無法寫入時仍可在本次瀏覽中操作
    }
  };
  const notify = () => listeners.forEach((l) => l());
  // 回傳複本，避免頁面意外改到內部資料
  const copy = <T>(v: T): T => structuredClone(v);
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  // ---- 模擬 RLS ----
  const currentUser = () => db.users.find((u) => u.id === db.sessionUserId) ?? null;
  const isAdmin = () => currentUser()?.role === 'super_admin';
  const myOrg = () => currentUser()?.org_id ?? null;
  const requireUser = () => currentUser() ?? fail('請先登入');
  const requireAdmin = () => {
    if (!isAdmin()) fail('權限不足');
  };
  const requireWritable = () => {
    const msg = checkWritable(db.settings, isAdmin());
    if (msg) fail(msg);
  };
  const canAccessTeam = (t: Team) => isAdmin() || (!!myOrg() && t.org_ids.includes(myOrg()!));
  const teamOf = (m: Member) => db.teams.find((t) => t.id === m.team_id);
  const canSeeMember = (m: Member) => isAdmin() || m.org_id === myOrg() || (!!teamOf(m) && canAccessTeam(teamOf(m)!));
  /** 個資只有所屬公司與管理員看得到 */
  const canSeePrivate = (m: Member) => isAdmin() || m.org_id === myOrg();
  const view = (m: Member): Member => ({ ...copy(m), private: canSeePrivate(m) ? copy(m.private) : null });

  const getTeam = (id: string): Team => {
    const t = db.teams.find((x) => x.id === id);
    if (!t || !canAccessTeam(t)) return fail('找不到隊伍或無權限');
    return t;
  };
  /** 只能修改自己公司的隊員 */
  const getWritableMember = (id: string): Member => {
    const m = db.members.find((x) => x.id === id);
    if (!m || !(isAdmin() || m.org_id === myOrg())) return fail('找不到隊員或無權限修改');
    return m;
  };

  function assertMemberInput(input: MemberInput, exceptMemberId?: string): MemberInput {
    const clean = cleanMemberInput(input);
    const msg = validateMemberInput(clean);
    if (msg) fail(msg);
    // 模擬 national_id unique：全活動不可重複（不論可見與否）
    const dup = db.members.find((m) => m.id !== exceptMemberId && m.private?.national_id === clean.national_id);
    if (dup) fail(`身分證字號 ${clean.national_id} 已報名，同一人不可重複報名`);
    return clean;
  }

  const splitInput = ({ name, gender, ...priv }: MemberInput) => ({ name, gender, private: priv });

  return {
    mode: 'demo',

    async getSession() {
      const u = currentUser();
      if (!u) return null;
      const org = db.organizations.find((o) => o.id === u.org_id);
      return { userId: u.id, email: u.email, role: u.role, orgId: u.org_id, orgName: org?.name ?? null };
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    async signIn(email, password) {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
      if (!u) return fail('帳號或密碼錯誤');
      db.sessionUserId = u.id;
      commit();
      notify();
    },

    async signUp(email, password) {
      const normalized = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalized)) fail('請輸入有效的 Email');
      if (password.length < 6) fail('密碼至少 6 個字元');
      if (db.users.some((x) => x.email === normalized)) fail('此信箱已註冊，請直接登入');
      const id = crypto.randomUUID();
      db.users.push({ id, email: normalized, password, role: 'org_admin', org_id: null });
      db.sessionUserId = id;
      commit();
      notify();
      return { needsEmailConfirm: false };
    },

    async signOut() {
      db.sessionUserId = null;
      commit();
      notify();
    },

    async joinOrg(inviteCode) {
      const u = requireUser();
      const org = db.organizations.find((o) => o.invite_code === inviteCode.trim().toUpperCase());
      if (!org) return fail('邀請碼無效');
      if (u.org_id) fail('此帳號已綁定公司');
      u.org_id = org.id;
      commit();
      return org.name;
    },

    async getSettings() {
      return copy(db.settings);
    },

    async updateSettings(patch) {
      requireAdmin();
      Object.assign(db.settings, patch);
      commit();
    },

    async listEvents() {
      return copy([...db.events].sort((a, b) => a.sort_order - b.sort_order));
    },

    async updateEvent(id, patch) {
      requireAdmin();
      const ev = db.events.find((e) => e.id === id) ?? fail('找不到項目');
      const next = { ...ev, ...patch };
      if (next.max_per_team < next.min_per_team) fail('人數上限不可小於下限');
      Object.assign(ev, patch);
      commit();
    },

    async listOrganizations() {
      return copy(
        db.organizations
          .filter((o) => isAdmin() || o.id === myOrg())
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')),
      );
    },

    async listOrgNames() {
      requireUser();
      return db.organizations.map((o) => ({ id: o.id, name: o.name }));
    },

    async createOrganization(input) {
      requireAdmin();
      if (db.organizations.some((o) => o.name === input.name)) fail('單位名稱已存在');
      db.organizations.push({
        id: crypto.randomUUID(),
        invite_code: crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(),
        ...input,
      });
      commit();
    },

    async updateOrganization(id, patch) {
      requireAdmin();
      const org = db.organizations.find((o) => o.id === id) ?? fail('找不到公司');
      if (patch.name && db.organizations.some((o) => o.id !== id && o.name === patch.name)) fail('單位名稱已存在');
      Object.assign(org, patch);
      commit();
    },

    async deleteOrganization(id) {
      requireAdmin();
      // 模擬 organizations_before_delete + on delete cascade：只屬於該公司的隊伍整隊刪除，聯隊只移除該公司
      const soloTeamIds = new Set(db.teams.filter((t) => t.org_ids.length === 1 && t.org_ids[0] === id).map((t) => t.id));
      const goneMembers = new Set(db.members.filter((m) => m.org_id === id || soloTeamIds.has(m.team_id)).map((m) => m.id));
      db.entries = db.entries.filter((e) => !goneMembers.has(e.member_id));
      db.members = db.members.filter((m) => !goneMembers.has(m.id));
      db.teams = db.teams.filter((t) => !soloTeamIds.has(t.id));
      db.teams.forEach((t) => (t.org_ids = t.org_ids.filter((o) => o !== id)));
      db.organizations = db.organizations.filter((o) => o.id !== id);
      db.users.forEach((u) => {
        if (u.org_id === id) u.org_id = null;
      });
      commit();
    },

    async listTeams() {
      return copy(db.teams.filter(canAccessTeam));
    },

    async getTeam(id) {
      const t = db.teams.find((x) => x.id === id);
      return t && canAccessTeam(t) ? copy(t) : null;
    },

    async createTeam(input, orgIds) {
      requireUser();
      if (orgIds.length === 0) fail('至少需指定一家公司');
      if (!isAdmin() && (orgIds.length !== 1 || orgIds[0] !== myOrg())) {
        fail('公司窗口只能建立自己公司的隊伍；聯隊請洽管理員建立');
      }
      requireWritable();
      if (orgIds.length === 1) {
        const org = db.organizations.find((o) => o.id === orgIds[0]) ?? fail('找不到公司');
        if (soloTeamCount(db.teams, org.id) >= org.team_quota) {
          fail(`已達本公司可自組隊伍數上限（${org.team_quota} 隊）`);
        }
      }
      if (db.teams.some((t) => t.name === input.name.trim())) fail('隊名已被使用，請換一個');
      const team: Team = { id: crypto.randomUUID(), ...input, name: input.name.trim(), org_ids: [...orgIds] };
      db.teams.push(team);
      commit();
      return copy(team);
    },

    async updateTeam(id, patch) {
      const team = getTeam(id);
      requireWritable();
      if (patch.name && db.teams.some((t) => t.id !== id && t.name === patch.name)) fail('隊名已被使用，請換一個');
      Object.assign(team, patch);
      commit();
    },

    async setTeamOrgs(id, orgIds) {
      requireAdmin();
      const team = getTeam(id);
      if (orgIds.length === 0) fail('至少需指定一家公司');
      if (db.members.some((m) => m.team_id === id && !orgIds.includes(m.org_id))) {
        fail('要移除的公司在此隊仍有隊員，請先刪除其隊員');
      }
      team.org_ids = [...orgIds];
      commit();
    },

    async deleteTeam(id) {
      const team = getTeam(id);
      if (!isAdmin() && team.org_ids.some((o) => o !== myOrg())) fail('聯隊只能由管理員刪除');
      requireWritable();
      const memberIds = new Set(db.members.filter((m) => m.team_id === id).map((m) => m.id));
      db.entries = db.entries.filter((e) => !memberIds.has(e.member_id));
      db.members = db.members.filter((m) => m.team_id !== id);
      db.teams = db.teams.filter((t) => t.id !== id);
      commit();
    },

    async listMembers(filter) {
      return db.members.filter((m) => canSeeMember(m) && (!filter?.teamId || m.team_id === filter.teamId)).map(view);
    },

    async addMembers(teamId, orgId, inputs) {
      const team = getTeam(teamId);
      if (!isAdmin() && orgId !== myOrg()) fail('只能新增自己公司的隊員');
      if (!team.org_ids.includes(orgId)) fail('此公司未參與該隊伍');
      const current = db.members.filter((m) => m.team_id === teamId).length;
      const msg = checkAddMembers(db.settings, current, inputs.length, isAdmin());
      if (msg) fail(msg);
      const added: Member[] = [];
      for (const input of inputs) {
        const clean = assertMemberInput(input);
        if (added.some((m) => m.private?.national_id === clean.national_id)) {
          fail(`身分證字號 ${clean.national_id} 已報名，同一人不可重複報名`);
        }
        added.push({ id: crypto.randomUUID(), team_id: teamId, org_id: orgId, ...splitInput(clean) });
      }
      db.members.push(...added);
      commit();
    },

    async updateMember(id, input) {
      const member = getWritableMember(id);
      requireWritable();
      Object.assign(member, splitInput(assertMemberInput(input, id)));
      commit();
    },

    async deleteMember(id) {
      getWritableMember(id);
      requireWritable();
      db.entries = db.entries.filter((e) => e.member_id !== id);
      db.members = db.members.filter((m) => m.id !== id);
      commit();
    },

    async purgePrivateData() {
      requireAdmin();
      const n = db.members.filter((m) => m.private).length;
      db.members.forEach((m) => (m.private = null));
      commit();
      return n;
    },

    async listEntries(filter) {
      const visible = db.members.filter((m) => {
        const t = teamOf(m);
        return !!t && canAccessTeam(t) && (!filter?.teamId || m.team_id === filter.teamId);
      });
      return copy(entriesOfMembers(db.entries, visible));
    },

    async addEntry(entry) {
      const member = db.members.find((m) => m.id === entry.member_id);
      const team = member && teamOf(member);
      if (!member || !team || !canAccessTeam(team)) return fail('找不到隊員或無權限');
      const event = db.events.find((e) => e.id === entry.event_id) ?? fail('找不到項目');
      const teamMembers = db.members.filter((m) => m.team_id === member.team_id);
      const msg = checkAddEntry({
        settings: db.settings,
        event,
        member,
        teamEntries: entriesOfMembers(db.entries, teamMembers),
        memberEntries: db.entries.filter((e) => e.member_id === member.id),
        isAdmin: isAdmin(),
      });
      if (msg) fail(msg);
      db.entries.push({ ...entry });
      commit();
    },

    async removeEntry(eventId, memberId) {
      const member = db.members.find((m) => m.id === memberId);
      const team = member && teamOf(member);
      if (!team || !canAccessTeam(team)) fail('找不到隊員或無權限');
      requireWritable();
      db.entries = db.entries.filter((e) => !(e.event_id === eventId && e.member_id === memberId));
      commit();
    },
  };
}
