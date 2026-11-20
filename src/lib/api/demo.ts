// 展示模式：資料存在 localStorage，並在記憶體內模擬 Supabase 的 RLS 與 DB trigger 限制
// 讓尚未建立 Supabase 專案時也能完整操作雛形；可見範圍規則見 ./types.ts 的 DataApi 說明
import { INVITE_CODE_PATTERN, normalizeInviteCode, randomInviteCode } from '../inviteCode';
import { maskPhone, maskPrivate } from '../mask';
import { MAX_GUIDE_BYTES, byteSize } from '../richText';
import { cleanMemberInput, validateMemberInput } from '../member';
import {
  checkAddEntry,
  checkAddMembers,
  checkAddSquadMember,
  checkSubmitSquad,
  checkWritable,
  entriesOfMembers,
  isCompanyEvent,
} from '../rules';
import type { Member, MemberInput, Team } from '../types';
import { createSeed, type DemoDb } from './demoSeed';
import type { DataApi, InviteInfo } from './types';

const STORAGE_KEY = 'hexagon-sportday-demo-v9';

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed.version === 9) return parsed;
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
  const myContacts = () => db.contacts.filter((c) => c.user_id === db.sessionUserId);
  const requireUser = () => currentUser() ?? fail('請先登入');
  const requireAdmin = () => {
    if (!isAdmin()) fail('權限不足');
  };
  /** 模擬 is_vendor()：委外廠商可唯讀全部隊伍，個資隱碼 */
  const myVendor = () => {
    const vc = db.vendorContacts.find((c) => c.user_id === db.sessionUserId);
    return vc ? (db.vendors.find((v) => v.id === vc.vendor_id) ?? null) : null;
  };
  const isVendor = () => !!myVendor();
  /** 活動設定與比賽項目：管理員與委外廠商可改 */
  const requireAdminOrVendor = () => {
    if (!isAdmin() && !isVendor()) fail('權限不足');
  };
  const requireWritable = () => {
    const msg = checkWritable(db.settings, isAdmin());
    if (msg) fail(msg);
  };
  /** 管理員，或該隊窗口 */
  const canAccessTeam = (t: Team) => isAdmin() || myContacts().some((c) => c.team_id === t.id);
  /** 該隊 × 該公司的窗口：可編輯該公司隊員、檢視其個資 */
  const isTeamOrgContact = (teamId: string, orgId: string) =>
    myContacts().some((c) => c.team_id === teamId && c.org_id === orgId);
  /** 可讀取（不含寫入）：窗口與管理員之外，委外廠商可唯讀全部隊伍 */
  const canViewTeam = (t: Team) => canAccessTeam(t) || isVendor();
  const teamOf = (m: Member) => db.teams.find((t) => t.id === m.team_id);
  const canSeeMember = (m: Member) => !!teamOf(m) && canViewTeam(teamOf(m)!);
  const canSeePrivate = (m: Member) => isAdmin() || isTeamOrgContact(m.team_id, m.org_id);
  // 模擬 member_diets()：用餐習慣同隊都看得到，其餘個資只限所屬公司
  // 模擬 vendor_member_private()：委外廠商看得到全部隊員的個資，但證號、生日、手機隱碼
  const view = (m: Member): Member => ({
    ...copy(m),
    diet: m.private?.diet ?? null,
    private: canSeePrivate(m) ? copy(m.private) : isVendor() && m.private ? maskPrivate(m.private) : null,
  });
  // 模擬 vendor_teams()：委外廠商看到的隊長電話隱碼
  const viewTeam = (t: Team): Team =>
    canAccessTeam(t) ? copy(t) : { ...copy(t), captain_phone: maskPhone(t.captain_phone) };
  /** 管理員，或該公司（任一隊）的窗口：可看同仁名單、管理公司組隊 */
  const canManageOrg = (orgId: string) => isAdmin() || myContacts().some((c) => c.org_id === orgId);
  const getSquad = (id: string) => {
    const sq = db.squads.find((x) => x.id === id);
    if (!sq || !canManageOrg(sq.org_id)) return fail('找不到隊伍或無權限');
    return sq;
  };
  const inSubmittedSquad = (memberId: string) => db.squads.some((s) => s.submitted_at && s.member_ids.includes(memberId));

  const getTeam = (id: string): Team => {
    const t = db.teams.find((x) => x.id === id);
    if (!t || !canAccessTeam(t)) return fail('找不到隊伍或無權限');
    return t;
  };
  /** 只能修改自己以該公司身分加入的隊員 */
  const getWritableMember = (id: string): Member => {
    const m = db.members.find((x) => x.id === id);
    if (!m || !(isAdmin() || isTeamOrgContact(m.team_id, m.org_id))) return fail('找不到隊員或無權限修改');
    return m;
  };

  function assertMemberInput(input: MemberInput, exceptMemberId?: string): MemberInput {
    const clean = cleanMemberInput(input);
    const msg = validateMemberInput(clean);
    if (msg) fail(msg);
    // 模擬 national_id unique：全活動不可重複（不論可見與否）；未填（null）不互相衝突
    const dup =
      clean.national_id &&
      db.members.find((m) => m.id !== exceptMemberId && m.private?.national_id === clean.national_id);
    if (dup) fail(`身分證字號 ${clean.national_id} 已報名，同一人不可重複報名`);
    return clean;
  }

  const splitInput = ({ name, gender, ...priv }: MemberInput) => ({ name, gender, diet: priv.diet, private: priv });

  // ---- 邀請碼與窗口綁定（模擬 team_invites / team_contacts 與 bind_team_contact） ----
  const contactCount = (teamId: string) => db.contacts.filter((c) => c.team_id === teamId).length;

  const findInvite = (code: string) => db.invites.find((i) => i.invite_code === normalizeInviteCode(code));

  const findVendor = (code: string) => db.vendors.find((v) => v.invite_code === normalizeInviteCode(code));
  const vendorCount = (vendorId: string) => db.vendorContacts.filter((c) => c.vendor_id === vendorId).length;
  /** 模擬 invite_code_unique_across：隊伍與廠商邀請碼不可重複 */
  const codeTaken = (code: string) => db.invites.some((i) => i.invite_code === code) || db.vendors.some((v) => v.invite_code === code);

  /** 模擬 bind_team_contact：邀請碼需與隊伍相符 → 不是委外廠商 → 不可重複綁定 → 窗口人數未滿 */
  function bind(userId: string, teamId: string, inviteCode: string) {
    const inv = findInvite(inviteCode);
    if (!inv || inv.team_id !== teamId) return fail('邀請碼錯誤，或與所選隊伍不符');
    if (db.vendorContacts.some((c) => c.user_id === userId)) fail('委外廠商帳號不能擔任隊伍窗口，請改用其他信箱註冊');
    if (db.contacts.some((c) => c.user_id === userId && c.team_id === teamId)) fail('此帳號已是該隊窗口');
    const team = db.teams.find((t) => t.id === teamId) ?? fail('找不到隊伍');
    if (contactCount(teamId) >= team.contact_limit) fail(`此隊窗口名額已滿（${team.contact_limit} 人），請洽活動小組`);
    db.contacts.push({ user_id: userId, team_id: teamId, org_id: inv.org_id, created_at: new Date().toISOString() });
  }

  /** 模擬 bind_vendor：邀請碼正確 → 不是管理員 / 隊伍窗口 → 尚未綁定 → 帳號數未滿 */
  function bindVendor(userId: string, inviteCode: string) {
    const v = findVendor(inviteCode) ?? fail('邀請碼錯誤，請確認活動小組提供的邀請碼');
    if (db.users.find((u) => u.id === userId)?.role === 'super_admin') fail('管理員帳號不需綁定廠商');
    if (db.contacts.some((c) => c.user_id === userId)) fail('此帳號已是隊伍窗口，委外廠商請改用其他信箱註冊');
    if (db.vendorContacts.some((c) => c.user_id === userId)) fail('此帳號已是委外廠商帳號');
    if (vendorCount(v.id) >= v.account_limit) fail(`此廠商帳號名額已滿（${v.account_limit} 個），請洽活動小組`);
    db.vendorContacts.push({ user_id: userId, vendor_id: v.id, created_at: new Date().toISOString() });
  }

  function newInviteCode(): string {
    for (;;) {
      const code = randomInviteCode();
      if (!codeTaken(code)) return code;
    }
  }

  /** 模擬 set_team_orgs：新增的公司產生邀請碼；移除的公司刪除其邀請碼與窗口綁定 */
  function applyTeamOrgs(team: Team, orgIds: string[]) {
    team.org_ids = [...orgIds];
    db.invites = db.invites.filter((i) => i.team_id !== team.id || orgIds.includes(i.org_id));
    db.contacts = db.contacts.filter((c) => c.team_id !== team.id || orgIds.includes(c.org_id));
    for (const orgId of orgIds) {
      if (!db.invites.some((i) => i.team_id === team.id && i.org_id === orgId)) {
        db.invites.push({ team_id: team.id, org_id: orgId, invite_code: newInviteCode() });
      }
    }
  }

  function removeMembers(predicate: (m: Member) => boolean) {
    const gone = new Set(db.members.filter(predicate).map((m) => m.id));
    db.entries = db.entries.filter((e) => !gone.has(e.member_id));
    db.squads.forEach((s) => (s.member_ids = s.member_ids.filter((id) => !gone.has(id))));
    db.members = db.members.filter((m) => !gone.has(m.id));
  }

  return {
    mode: 'demo',

    async getSession() {
      const u = currentUser();
      if (!u) return null;
      const teams = myContacts()
        .map((c) => ({
          teamId: c.team_id,
          teamName: db.teams.find((t) => t.id === c.team_id)?.name ?? '',
          orgId: c.org_id,
          orgName: db.organizations.find((o) => o.id === c.org_id)?.name ?? '',
        }))
        .sort((a, b) => a.teamName.localeCompare(b.teamName, 'zh-TW'));
      const vendor = u.role === 'super_admin' ? null : myVendor();
      return { userId: u.id, email: u.email, role: vendor ? 'vendor' : u.role, teams, vendorName: vendor?.name ?? null };
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

    async registerWithInvite(email, password, join) {
      const normalized = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(normalized)) fail('請輸入有效的 Email');
      if (password.length < 6) fail('密碼至少 6 個字元');
      const doBind = (userId: string) =>
        join.kind === 'vendor' ? bindVendor(userId, join.inviteCode) : bind(userId, join.teamId, join.inviteCode);
      const existing = db.users.find((x) => x.email === normalized);
      if (existing) {
        // 同一位窗口代表多隊：需輸入原本的密碼，把這一隊加入同一個帳號
        if (existing.password !== password) {
          fail(
            join.kind === 'vendor'
              ? '此信箱已註冊：請輸入該帳號原本的密碼'
              : '此信箱已註冊：請輸入該帳號原本的密碼，即可把這一隊加入同一個帳號',
          );
        }
        if (existing.role === 'super_admin') fail('管理員帳號不需綁定隊伍');
        try {
          doBind(existing.id);
        } catch (e) {
          if (!(e instanceof Error && /已是該隊窗口|已是委外廠商帳號/.test(e.message))) throw e;
        }
        db.sessionUserId = existing.id;
        commit();
        notify();
        return { needsEmailConfirm: false, existingAccount: true };
      }
      const id = crypto.randomUUID();
      // 先綁定再建立帳號：綁定失敗時不會留下帳號（同 handle_new_user）
      doBind(id);
      db.users.push({ id, email: normalized, password, role: 'org_admin' });
      db.sessionUserId = id;
      commit();
      notify();
      return { needsEmailConfirm: false, existingAccount: false };
    },

    async signOut() {
      db.sessionUserId = null;
      commit();
      notify();
    },

    async lookupInvite(inviteCode): Promise<InviteInfo> {
      const vendor = findVendor(inviteCode);
      if (vendor) return { kind: 'vendor', vendorName: vendor.name, isFull: vendorCount(vendor.id) >= vendor.account_limit };
      const inv = findInvite(inviteCode) ?? fail('邀請碼錯誤，請確認活動小組提供的邀請碼');
      const team = db.teams.find((t) => t.id === inv.team_id) ?? fail('找不到隊伍');
      return {
        kind: 'team',
        teamId: team.id,
        teamName: team.name,
        orgId: inv.org_id,
        orgName: db.organizations.find((o) => o.id === inv.org_id)?.name ?? '',
        isFull: contactCount(team.id) >= team.contact_limit,
      };
    },

    async joinTeam(teamId, inviteCode) {
      const u = requireUser();
      if (isAdmin()) fail('管理員帳號不需綁定隊伍');
      bind(u.id, teamId, inviteCode);
      commit();
      notify();
      return db.teams.find((t) => t.id === teamId)?.name ?? '';
    },

    async getSettings() {
      return copy(db.settings);
    },

    async updateSettings(patch) {
      requireAdminOrVendor();
      Object.assign(db.settings, patch);
      commit();
    },

    async listEvents() {
      return copy([...db.events].sort((a, b) => a.sort_order - b.sort_order));
    },

    async updateEvent(id, patch) {
      requireAdminOrVendor();
      const ev = db.events.find((e) => e.id === id) ?? fail('找不到項目');
      const next = { ...ev, ...patch };
      if (next.max_per_team < next.min_per_team) fail('人數上限不可小於下限');
      if (next.video_url && !/^https?:\/\/\S+$/i.test(next.video_url)) fail('影片連結需以 http:// 或 https:// 開頭');
      Object.assign(ev, patch);
      commit();
    },

    async listGuidePages() {
      requireUser();
      return copy(db.guidePages);
    },

    async getGuidePage(id) {
      requireUser();
      return copy(db.guidePages.find((p) => p.id === id) ?? null);
    },

    async updateGuidePage(id, content) {
      // 模擬 guide_pages 的 RLS（管理員與委外廠商）與大小上限
      requireAdminOrVendor();
      const page = db.guidePages.find((p) => p.id === id) ?? fail('找不到頁面');
      if (byteSize(content) > MAX_GUIDE_BYTES) fail('內容太大，請減少或縮小圖片');
      page.content = content;
      page.updated_at = new Date().toISOString();
      commit();
    },

    async listOrganizations() {
      if (!isAdmin()) return [];
      return copy([...db.organizations].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')));
    },

    async listOrgNames() {
      requireUser();
      return db.organizations.map((o) => ({ id: o.id, name: o.name }));
    },

    async createOrganization(input) {
      requireAdmin();
      if (db.organizations.some((o) => o.name === input.name)) fail('公司名稱已存在');
      db.organizations.push({ id: crypto.randomUUID(), ...input });
      commit();
    },

    async updateOrganization(id, patch) {
      requireAdmin();
      const org = db.organizations.find((o) => o.id === id) ?? fail('找不到公司');
      if (patch.name && db.organizations.some((o) => o.id !== id && o.name === patch.name)) fail('公司名稱已存在');
      Object.assign(org, patch);
      commit();
    },

    async deleteOrganization(id) {
      requireAdmin();
      // 模擬 on delete cascade：該公司隊員、邀請碼、窗口綁定一併刪除，隊伍保留
      removeMembers((m) => m.org_id === id);
      db.teams.forEach((t) => (t.org_ids = t.org_ids.filter((o) => o !== id)));
      db.invites = db.invites.filter((i) => i.org_id !== id);
      db.contacts = db.contacts.filter((c) => c.org_id !== id);
      db.squads = db.squads.filter((s) => s.org_id !== id);
      db.organizations = db.organizations.filter((o) => o.id !== id);
      commit();
    },

    async listTeams() {
      return db.teams.filter(canViewTeam).map(viewTeam);
    },

    async getTeam(id) {
      const t = db.teams.find((x) => x.id === id);
      return t && canViewTeam(t) ? viewTeam(t) : null;
    },

    async createTeam(input, orgIds) {
      if (!isAdmin()) fail('隊伍由活動小組建立，請洽管理員');
      const name = input.name.trim();
      if (!name) fail('請輸入隊名');
      if (db.teams.some((t) => t.name === name)) fail('隊名已被使用，請換一個');
      const team: Team = { id: crypto.randomUUID(), ...input, name, contact_limit: 2, org_ids: [] };
      db.teams.push(team);
      applyTeamOrgs(team, orgIds);
      commit();
      return copy(team);
    },

    async updateTeam(id, patch) {
      const team = getTeam(id);
      requireWritable();
      if (!isAdmin() && ((patch.name !== undefined && patch.name !== team.name) || patch.contact_limit !== undefined)) {
        fail('隊名與窗口人數只能由活動小組修改');
      }
      if (patch.name !== undefined && db.teams.some((t) => t.id !== id && t.name === patch.name)) fail('隊名已被使用，請換一個');
      if (patch.contact_limit !== undefined && !(Number.isInteger(patch.contact_limit) && patch.contact_limit >= 0)) {
        fail('窗口人數需為 0 以上的整數');
      }
      Object.assign(team, patch);
      commit();
    },

    async setTeamOrgs(id, orgIds) {
      requireAdmin();
      const team = getTeam(id);
      if (db.members.some((m) => m.team_id === id && !orgIds.includes(m.org_id))) {
        fail('要移除的公司在此隊仍有隊員，請先刪除其隊員');
      }
      applyTeamOrgs(team, orgIds);
      commit();
    },

    async deleteTeam(id) {
      requireAdmin();
      getTeam(id);
      removeMembers((m) => m.team_id === id);
      db.invites = db.invites.filter((i) => i.team_id !== id);
      db.contacts = db.contacts.filter((c) => c.team_id !== id);
      db.teams = db.teams.filter((t) => t.id !== id);
      commit();
    },

    async listTeamInvites() {
      requireAdmin();
      return copy(db.invites);
    },

    async setTeamInviteCode(teamId, orgId, inviteCode) {
      requireAdmin();
      const code = normalizeInviteCode(inviteCode);
      if (!INVITE_CODE_PATTERN.test(code)) fail('邀請碼需為 6–20 位英文字母或數字');
      const inv = db.invites.find((i) => i.team_id === teamId && i.org_id === orgId) ?? fail('找不到邀請碼');
      if (inv.invite_code !== code && codeTaken(code)) fail('邀請碼已被使用，請換一組');
      inv.invite_code = code;
      commit();
    },

    async listTeamContacts() {
      requireAdmin();
      return db.contacts.map((c) => ({ ...c, email: db.users.find((u) => u.id === c.user_id)?.email ?? '' }));
    },

    async removeTeamContact(userId, teamId) {
      requireAdmin();
      db.contacts = db.contacts.filter((c) => !(c.user_id === userId && c.team_id === teamId));
      commit();
    },

    async listVendors() {
      requireAdmin();
      return copy(db.vendors);
    },

    async createVendor(input) {
      requireAdmin();
      const name = input.name.trim();
      if (!name) fail('請輸入廠商名稱');
      if (!(Number.isInteger(input.account_limit) && input.account_limit >= 0)) fail('帳號數需為 0 以上的整數');
      db.vendors.push({ id: crypto.randomUUID(), name, invite_code: newInviteCode(), account_limit: input.account_limit });
      commit();
    },

    async updateVendor(id, patch) {
      requireAdmin();
      const v = db.vendors.find((x) => x.id === id) ?? fail('找不到廠商');
      const next = { ...v, ...patch };
      next.name = next.name.trim();
      next.invite_code = normalizeInviteCode(next.invite_code);
      if (!next.name) fail('請輸入廠商名稱');
      if (!(Number.isInteger(next.account_limit) && next.account_limit >= 0)) fail('帳號數需為 0 以上的整數');
      if (!INVITE_CODE_PATTERN.test(next.invite_code)) fail('邀請碼需為 6–20 位英文字母或數字');
      if (next.invite_code !== v.invite_code && codeTaken(next.invite_code)) fail('邀請碼已被使用，請換一組');
      Object.assign(v, next);
      commit();
    },

    async deleteVendor(id) {
      requireAdmin();
      db.vendors = db.vendors.filter((v) => v.id !== id);
      db.vendorContacts = db.vendorContacts.filter((c) => c.vendor_id !== id);
      commit();
    },

    async listVendorContacts() {
      requireAdmin();
      return db.vendorContacts.map((c) => ({ ...c, email: db.users.find((u) => u.id === c.user_id)?.email ?? '' }));
    },

    async removeVendorContact(userId) {
      requireAdmin();
      db.vendorContacts = db.vendorContacts.filter((c) => c.user_id !== userId);
      commit();
    },

    async listMembers(filter) {
      return db.members.filter((m) => canSeeMember(m) && (!filter?.teamId || m.team_id === filter.teamId)).map(view);
    },

    async addMembers(teamId, orgId, inputs) {
      const team = getTeam(teamId);
      if (!isAdmin() && !isTeamOrgContact(teamId, orgId)) fail('只能新增自己公司的隊員');
      if (!team.org_ids.includes(orgId)) fail('此公司未參與該隊伍');
      const current = db.members.filter((m) => m.team_id === teamId).length;
      const msg = checkAddMembers(db.settings, current, inputs.length, isAdmin());
      if (msg) fail(msg);
      const added: Member[] = [];
      for (const input of inputs) {
        const clean = assertMemberInput(input);
        if (clean.national_id && added.some((m) => m.private?.national_id === clean.national_id)) {
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
      if (!isAdmin() && inSubmittedSquad(id)) fail('此同仁在已送出的隊伍中，請先取消送出再調整');
      removeMembers((m) => m.id === id);
      commit();
    },

    async purgePrivateData() {
      requireAdmin();
      const n = db.members.filter((m) => m.private).length;
      db.members.forEach((m) => {
        m.private = null;
        m.diet = null;
      });
      commit();
      return n;
    },

    async listOrgRoster(orgId) {
      requireUser();
      if (!canManageOrg(orgId)) fail('無權限檢視此公司的同仁');
      return db.members
        .filter((m) => m.org_id === orgId)
        .map((m) => ({ id: m.id, name: m.name, gender: m.gender, team_id: m.team_id, team_name: teamOf(m)?.name ?? '' }))
        .sort((a, b) => a.team_name.localeCompare(b.team_name, 'zh-TW'));
    },

    async listOrgSquads(orgId) {
      requireUser();
      return copy(
        db.squads
          .filter((s) => (canManageOrg(s.org_id) || isVendor()) && (!orgId || s.org_id === orgId))
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      );
    },

    async createOrgSquad(orgId, eventId) {
      requireUser();
      if (!canManageOrg(orgId)) fail('權限不足');
      requireWritable();
      const event = db.events.find((e) => e.id === eventId) ?? fail('找不到項目');
      if (!isCompanyEvent(event)) fail(`「${event.name}」以隊伍為單位報名，不能以公司組隊`);
      const squad = {
        id: crypto.randomUUID(),
        org_id: orgId,
        event_id: eventId,
        submitted_at: null,
        created_at: new Date().toISOString(),
        member_ids: [],
      };
      db.squads.push(squad);
      commit();
      return copy(squad);
    },

    async deleteOrgSquad(id) {
      const sq = getSquad(id);
      requireWritable();
      if (sq.submitted_at && !isAdmin()) fail('已送出的隊伍不可刪除，請先取消送出');
      db.squads = db.squads.filter((s) => s.id !== id);
      commit();
    },

    async addSquadMember(squadId, memberId) {
      const sq = getSquad(squadId);
      const member = db.members.find((m) => m.id === memberId);
      if (!member || member.org_id !== sq.org_id) return fail('只能選擇同公司的同仁');
      const event = db.events.find((e) => e.id === sq.event_id) ?? fail('找不到項目');
      const msg = checkAddSquadMember({
        settings: db.settings,
        event,
        squad: sq,
        member,
        eventSquads: db.squads.filter((s) => s.event_id === sq.event_id),
        isAdmin: isAdmin(),
      });
      if (msg) fail(msg);
      sq.member_ids.push(memberId);
      commit();
    },

    async removeSquadMember(squadId, memberId) {
      const sq = getSquad(squadId);
      requireWritable();
      if (sq.submitted_at && !isAdmin()) fail('此同仁在已送出的隊伍中，請先取消送出再調整');
      sq.member_ids = sq.member_ids.filter((id) => id !== memberId);
      commit();
    },

    async setSquadSubmitted(id, submitted) {
      const sq = getSquad(id);
      requireWritable();
      if (submitted && !sq.submitted_at) {
        const event = db.events.find((e) => e.id === sq.event_id) ?? fail('找不到項目');
        const genders = sq.member_ids.map((mid) => db.members.find((m) => m.id === mid)?.gender ?? 'M');
        const msg = checkSubmitSquad(event, genders);
        if (msg) fail(msg);
        sq.submitted_at = new Date().toISOString();
      } else if (!submitted) {
        sq.submitted_at = null;
      }
      commit();
    },

    async listEntries(filter) {
      const visible = db.members.filter((m) => canSeeMember(m) && (!filter?.teamId || m.team_id === filter.teamId));
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
        // 以公司組隊的項目不計入每人項目數
        memberEntries: db.entries.filter(
          (e) => e.member_id === member.id && !db.events.some((ev) => ev.id === e.event_id && isCompanyEvent(ev)),
        ),
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
