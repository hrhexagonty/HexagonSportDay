import type {
  EventEntry,
  EventInput,
  Member,
  MemberInput,
  OrgInput,
  OrgName,
  Organization,
  Role,
  Settings,
  SportEvent,
  Team,
  TeamInput,
} from '../types';

export interface SessionInfo {
  userId: string;
  email: string;
  role: Role;
  orgId: string | null;
  orgName: string | null;
}

/**
 * 資料存取介面。頁面只透過這個介面讀寫資料，實作有兩種：
 * - supabase.ts：正式環境，權限由 Supabase RLS 控管
 * - demo.ts：展示模式，資料存在 localStorage，並模擬 RLS 與 DB trigger 的限制
 *
 * 可見範圍（兩種實作需一致）：
 * - 隊伍：管理員看全部；公司窗口看自己公司有參與的隊伍（含聯隊）
 * - 隊員公開資料（姓名、性別、所屬公司）：同隊各公司都看得到
 * - 隊員個資 Member.private：只有隊員所屬公司與管理員看得到，其餘為 null
 */
export interface DataApi {
  readonly mode: 'supabase' | 'demo';

  // ---- 帳號 ----
  getSession(): Promise<SessionInfo | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsEmailConfirm: boolean }>;
  signOut(): Promise<void>;
  /** 以邀請碼綁定公司，回傳公司名稱 */
  joinOrg(inviteCode: string): Promise<string>;

  // ---- 活動設定與項目 ----
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  listEvents(): Promise<SportEvent[]>;
  updateEvent(id: string, patch: Partial<EventInput>): Promise<void>;

  // ---- 公司 ----
  /** 完整公司資料（含邀請碼）：窗口只拿得到自己公司，管理員拿得到全部 */
  listOrganizations(): Promise<Organization[]>;
  /** 所有公司名稱（顯示聯隊隊友所屬公司用） */
  listOrgNames(): Promise<OrgName[]>;
  createOrganization(input: OrgInput): Promise<void>;
  updateOrganization(id: string, patch: Partial<OrgInput>): Promise<void>;
  deleteOrganization(id: string): Promise<void>;

  // ---- 隊伍 ----
  listTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | null>;
  /** 窗口只能傳入自己公司（受額度限制）；管理員可傳多家公司建立聯隊 */
  createTeam(input: TeamInput, orgIds: string[]): Promise<Team>;
  updateTeam(id: string, patch: Partial<TeamInput>): Promise<void>;
  /** 調整參與公司（僅管理員） */
  setTeamOrgs(id: string, orgIds: string[]): Promise<void>;
  deleteTeam(id: string): Promise<void>;

  // ---- 隊員 ----
  listMembers(filter?: { teamId?: string }): Promise<Member[]>;
  /** 批次新增某公司的隊員（全部成功或全部失敗） */
  addMembers(teamId: string, orgId: string, inputs: MemberInput[]): Promise<void>;
  updateMember(id: string, input: MemberInput): Promise<void>;
  deleteMember(id: string): Promise<void>;
  /** 活動結束後清除所有隊員個資（僅管理員），回傳筆數 */
  purgePrivateData(): Promise<number>;

  // ---- 項目報名 ----
  listEntries(filter?: { teamId?: string }): Promise<EventEntry[]>;
  addEntry(entry: EventEntry): Promise<void>;
  removeEntry(eventId: string, memberId: string): Promise<void>;
}
