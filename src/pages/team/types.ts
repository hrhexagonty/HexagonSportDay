import type { TeamStatus } from '../../lib/rules';
import type { EventEntry, Member, Settings, SportEvent, Team } from '../../lib/types';

/** 隊伍頁各面板共用的資料 */
export interface TeamPageData {
  settings: Settings;
  events: SportEvent[];
  team: Team;
  members: Member[];
  entries: EventEntry[];
  status: TeamStatus;
  /** 公司 id → 名稱 */
  orgNames: Map<string, string>;
  /** 是否為聯隊（多家公司） */
  merged: boolean;
  /** 目前登入者所屬公司（管理員為 null） */
  myOrgId: string | null;
  /** 新增隊員時預設的所屬公司 */
  defaultOrgId: string;
  /** 報名開放中或管理員（委外廠商一律 false） */
  editable: boolean;
  isAdmin: boolean;
  /** 委外廠商：唯讀，個資為隱碼 */
  isVendor: boolean;
  reload: () => void;
}
