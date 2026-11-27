import type {
  EventEntry,
  Member,
  OrgAddress,
  OrgSquad,
  Organization,
  Settings,
  SportEvent,
  Team,
  TeamContact,
  TeamInvite,
  Vendor,
  VendorContact,
} from '../../lib/types';

export interface AdminData {
  settings: Settings;
  events: SportEvent[];
  /** 委外廠商只取得公司名稱（聯絡人、電話為 null） */
  orgs: Organization[];
  teams: Team[];
  /** 以下三項只有管理員載入（委外廠商為空陣列） */
  invites: TeamInvite[];
  contacts: TeamContact[];
  vendors: Vendor[];
  vendorContacts: VendorContact[];
  members: Member[];
  entries: EventEntry[];
  /** 公司組隊（健力） */
  squads: OrgSquad[];
  /** 公司地址（接駁車接送、樣衣寄送）；尚未填寫的公司沒有資料 */
  addresses: OrgAddress[];
  /** 委外廠商檢視：隊伍配置、健力報名唯讀，不顯示窗口資訊 */
  readOnly: boolean;
}
