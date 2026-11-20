import type {
  EventEntry,
  EventInput,
  Member,
  MemberInput,
  OrgInput,
  OrgName,
  OrgSquad,
  Organization,
  Role,
  RosterMember,
  Settings,
  SportEvent,
  Team,
  TeamContact,
  TeamInput,
  TeamInvite,
  TeamPatch,
  Vendor,
  VendorContact,
  VendorInput,
} from '../types';

/** 帳號綁定的隊伍；orgId = 以哪家公司的邀請碼加入 */
export interface SessionTeam {
  teamId: string;
  teamName: string;
  orgId: string;
  orgName: string;
}

export interface SessionInfo {
  userId: string;
  email: string;
  role: Role;
  /** 綁定的隊伍（管理員、委外廠商為空陣列） */
  teams: SessionTeam[];
  /** 委外廠商名稱（role = 'vendor' 時才有） */
  vendorName: string | null;
}

/** 以邀請碼綁定的身分：隊伍窗口（隊伍 × 公司）或委外廠商 */
export type JoinInput = { kind: 'team'; teamId: string; inviteCode: string } | { kind: 'vendor'; inviteCode: string };

/** 以邀請碼查出的身分：隊伍邀請碼對應「隊伍 × 公司」；廠商邀請碼對應一家委外廠商 */
export type InviteInfo =
  | {
      kind: 'team';
      teamId: string;
      teamName: string;
      orgId: string;
      orgName: string;
      /** 窗口名額已滿 */
      isFull: boolean;
    }
  | {
      kind: 'vendor';
      vendorName: string;
      /** 廠商帳號名額已滿 */
      isFull: boolean;
    };

/**
 * 資料存取介面。頁面只透過這個介面讀寫資料，實作有兩種：
 * - supabase.ts：正式環境，權限由 Supabase RLS 控管
 * - demo.ts：展示模式，資料存在 localStorage，並模擬 RLS 與 DB trigger 的限制
 *
 * 可見範圍（兩種實作需一致）：
 * - 隊伍：管理員看全部；窗口看自己綁定的隊伍
 * - 隊員公開資料（姓名、性別、所屬公司、用餐習慣 Member.diet）：同隊窗口都看得到（含聯隊其他公司）
 * - 隊員個資 Member.private：只有「該隊 × 該公司」的窗口與管理員看得到，其餘為 null
 * - 公司完整資料、邀請碼、窗口名單：只有管理員
 * - 公司同仁名單（跨分隊，只有姓名、性別）與公司組隊：該公司（任一隊）的窗口與管理員
 * - 委外廠商：唯讀全部隊伍、隊員、報名與公司組隊；個資（證號、生日、手機）與隊長電話為隱碼；
 *   可修改活動設定與比賽項目；看不到公司完整資料、邀請碼、窗口名單
 */
export interface DataApi {
  readonly mode: 'supabase' | 'demo';

  // ---- 帳號 ----
  getSession(): Promise<SessionInfo | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /**
   * 首次註冊：新信箱建立帳號並綁定隊伍或委外廠商（綁定失敗則不會建立帳號）；
   * 已註冊的信箱（同一位窗口代表多隊）需輸入原本的密碼，登入後把這一隊加入同一個帳號。
   */
  registerWithInvite(
    email: string,
    password: string,
    join: JoinInput,
  ): Promise<{ needsEmailConfirm: boolean; existingAccount: boolean }>;
  signOut(): Promise<void>;
  /** 以邀請碼查出隊伍與公司，或委外廠商（未登入可呼叫；前台不公開隊伍清單） */
  lookupInvite(inviteCode: string): Promise<InviteInfo>;
  /** 已登入帳號以邀請碼加入（其他）隊伍，回傳隊名（委外廠商帳號不可） */
  joinTeam(teamId: string, inviteCode: string): Promise<string>;

  // ---- 活動設定與項目 ----
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  listEvents(): Promise<SportEvent[]>;
  updateEvent(id: string, patch: Partial<EventInput>): Promise<void>;

  // ---- 公司（管理員） ----
  listOrganizations(): Promise<Organization[]>;
  /** 所有公司名稱（登入者皆可取得，顯示聯隊隊友所屬公司用） */
  listOrgNames(): Promise<OrgName[]>;
  createOrganization(input: OrgInput): Promise<void>;
  updateOrganization(id: string, patch: Partial<OrgInput>): Promise<void>;
  /** 刪除公司：該公司隊員、邀請碼與窗口綁定一併刪除，隊伍保留 */
  deleteOrganization(id: string): Promise<void>;

  // ---- 隊伍 ----
  listTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | null>;
  /** 建立隊伍（僅管理員；orgIds 可為空 = 未分配） */
  createTeam(input: TeamInput, orgIds: string[]): Promise<Team>;
  /** 窗口只能改隊長資料；隊名與窗口人數僅管理員 */
  updateTeam(id: string, patch: TeamPatch): Promise<void>;
  /** 調整參與公司（僅管理員）；移除的公司其邀請碼與窗口綁定一併刪除 */
  setTeamOrgs(id: string, orgIds: string[]): Promise<void>;
  /** 刪除隊伍（僅管理員） */
  deleteTeam(id: string): Promise<void>;

  // ---- 邀請碼與窗口（管理員） ----
  listTeamInvites(): Promise<TeamInvite[]>;
  setTeamInviteCode(teamId: string, orgId: string, inviteCode: string): Promise<void>;
  listTeamContacts(): Promise<TeamContact[]>;
  /** 解除窗口與隊伍的綁定（釋出名額） */
  removeTeamContact(userId: string, teamId: string): Promise<void>;

  // ---- 委外廠商（管理員） ----
  listVendors(): Promise<Vendor[]>;
  /** 建立廠商並產生邀請碼 */
  createVendor(input: VendorInput): Promise<void>;
  updateVendor(id: string, patch: Partial<VendorInput & Pick<Vendor, 'invite_code'>>): Promise<void>;
  /** 刪除廠商：其帳號綁定一併移除（帳號失去廠商權限） */
  deleteVendor(id: string): Promise<void>;
  listVendorContacts(): Promise<VendorContact[]>;
  /** 解除廠商帳號（釋出名額） */
  removeVendorContact(userId: string): Promise<void>;

  // ---- 隊員 ----
  listMembers(filter?: { teamId?: string }): Promise<Member[]>;
  /** 批次新增某公司的隊員（全部成功或全部失敗） */
  addMembers(teamId: string, orgId: string, inputs: MemberInput[]): Promise<void>;
  updateMember(id: string, input: MemberInput): Promise<void>;
  deleteMember(id: string): Promise<void>;
  /** 活動結束後清除所有隊員個資（僅管理員），回傳筆數 */
  purgePrivateData(): Promise<number>;

  // ---- 公司組隊（健力；category = 'powerlifting' 的項目） ----
  /** 公司同仁名單（跨分隊、不含個資） */
  listOrgRoster(orgId: string): Promise<RosterMember[]>;
  /** 公司隊伍；不指定公司 = 可見的全部（管理員為全部） */
  listOrgSquads(orgId?: string): Promise<OrgSquad[]>;
  /** 建立草稿隊伍 */
  createOrgSquad(orgId: string, eventId: string): Promise<OrgSquad>;
  /** 刪除隊伍（已送出的需先取消送出） */
  deleteOrgSquad(id: string): Promise<void>;
  addSquadMember(squadId: string, memberId: string): Promise<void>;
  removeSquadMember(squadId: string, memberId: string): Promise<void>;
  /** 送出（檢查人數與女性下限）或取消送出 */
  setSquadSubmitted(id: string, submitted: boolean): Promise<void>;

  // ---- 項目報名 ----
  listEntries(filter?: { teamId?: string }): Promise<EventEntry[]>;
  addEntry(entry: EventEntry): Promise<void>;
  removeEntry(eventId: string, memberId: string): Promise<void>;
}
