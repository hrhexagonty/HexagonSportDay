// 系統共用型別：欄位與 supabase/migrations 中的資料表一一對應，修改 schema 時需同步

export type Gender = 'M' | 'F';
/** 登入身分：隊伍窗口 / 管理員 / 委外廠商（委外廠商由 vendor_contacts 判定，profiles.role 仍為 org_admin） */
export type Role = 'org_admin' | 'super_admin' | 'vendor';
export type EventCategory = 'fun' | 'powerlifting';
export type Diet = 'meat' | 'meat_no_pork' | 'ovo_lacto' | 'vegan';

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

// 與 member_private.diet 的 check constraint 一致，修改時需同步 migration
export const DIETS: Diet[] = ['meat', 'meat_no_pork', 'ovo_lacto', 'vegan'];
export const DIET_LABEL: Record<Diet, string> = { meat: '葷食', meat_no_pork: '葷食不吃豬', ovo_lacto: '蛋奶素', vegan: '全素' };
export const GENDER_LABEL: Record<Gender, string> = { M: '男', F: '女' };
export const CATEGORY_LABEL: Record<EventCategory, string> = { fun: '趣味競賽', powerlifting: '健力比賽' };

/** 活動設定（settings 表，固定一列） */
export interface Settings {
  event_title: string;
  event_date: string | null; // YYYY-MM-DD
  venue: string | null;
  registration_open: boolean;
  registration_deadline: string | null; // ISO 時間字串
  total_team_target: number;
  team_min_size: number;
  team_max_size: number;
  max_events_per_member: number;
}

/** 公司（完整資料僅管理員可讀） */
export interface Organization {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
}

/** 公司名稱（所有登入者皆可取得，用於顯示聯隊隊友所屬公司） */
export interface OrgName {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  captain_name: string | null;
  captain_phone: string | null;
  /** 可綁定的窗口帳號數 */
  contact_limit: number;
  /** 參與公司；超過 1 家即為聯隊，0 家為尚未分配 */
  org_ids: string[];
}

/** 隊伍 × 公司的邀請碼（僅管理員可讀）：窗口輸入哪組碼就歸屬哪家公司 */
export interface TeamInvite {
  team_id: string;
  org_id: string;
  invite_code: string;
}

/** 已綁定隊伍的窗口帳號（管理員檢視用） */
export interface TeamContact {
  user_id: string;
  team_id: string;
  org_id: string;
  email: string;
  created_at: string;
}

/** 委外廠商與其邀請碼（vendors 表，僅管理員可讀） */
export interface Vendor {
  id: string;
  name: string;
  invite_code: string;
  /** 可用此邀請碼註冊的帳號數 */
  account_limit: number;
}

/** 已註冊的委外廠商帳號（管理員檢視用） */
export interface VendorContact {
  user_id: string;
  vendor_id: string;
  email: string;
  created_at: string;
}

/**
 * 隊員個資（member_private 表）：只有隊員所屬公司窗口與管理員看得到
 * 新增隊員只需姓名與性別，以下欄位皆可先不填（null）之後再補
 * 委外廠商拿到的是隱碼後的值（證號 A12****789、生日 1990-**-**、手機 0912***678），見 src/lib/mask.ts
 */
export interface MemberPrivate {
  national_id: string | null; // 身分證 / 居留證
  birthday: string | null; // YYYY-MM-DD（委外廠商為 YYYY-**-**）
  phone: string | null;
  shirt_size: ShirtSize | null;
  diet: Diet | null;
  special_needs: string | null; // null = 無特殊需求
}

/** 隊員；private 為 null 代表無權檢視（聯隊其他公司隊員）或個資已清除 */
export interface Member {
  id: string;
  team_id: string;
  org_id: string; // 所屬公司
  name: string;
  gender: Gender;
  /** 用餐習慣：同隊窗口（含聯隊其他公司）都看得到；null = 未填或個資已清除 */
  diet: Diet | null;
  private: MemberPrivate | null;
}

export interface SportEvent {
  id: string;
  name: string;
  category: EventCategory;
  description: string;
  min_per_team: number;
  max_per_team: number;
  min_female: number;
  sort_order: number;
  /** 競賽規則說明（純文字，保留換行） */
  rules: string;
  /** 示範影片連結（http/https；空字串 = 無） */
  video_url: string;
}

/** 活動指南頁面（guide_pages 表）：content 為已過濾的 HTML；updated_at 為 null 代表尚未編輯過 */
export interface GuidePage {
  id: string;
  content: string;
  updated_at: string | null;
}

/** 公司同仁（跨分隊，只有姓名、性別與分隊，不含個資） */
export interface RosterMember {
  id: string;
  name: string;
  gender: Gender;
  team_id: string;
  team_name: string;
}

/** 公司組隊（健力）；submitted_at 為 null = 草稿 */
export interface OrgSquad {
  id: string;
  org_id: string;
  event_id: string;
  submitted_at: string | null;
  created_at: string;
  /** 依加入順序 */
  member_ids: string[];
}

/**
 * 公司地址與聯絡人（org_addresses 表，一家公司一列）：該公司任一隊的窗口填寫，管理員可代填，委外廠商唯讀（含完整電話）
 * sample_same = 樣衣寄送地址「同上」（此時 sample_address 為 null，顯示時取接駁車接送地址）
 * 車長、樣衣收件人的姓名與電話屬於個資，清除個資時一併清除
 */
export interface OrgAddress {
  org_id: string;
  shuttle_address: string | null;
  shuttle_leader_name: string | null;
  shuttle_leader_phone: string | null;
  sample_address: string | null;
  sample_same: boolean;
  sample_recipient_name: string | null;
  sample_recipient_phone: string | null;
  updated_at: string;
}

/** 項目報名；隊伍由 member 推得 */
export interface EventEntry {
  event_id: string;
  member_id: string;
}

// ---- 表單輸入型別 ----
export type OrgInput = Pick<Organization, 'name' | 'contact_name' | 'contact_phone'>;
export type TeamInput = Pick<Team, 'name' | 'captain_name' | 'captain_phone'>;
/** 隊伍可修改欄位；name、contact_limit 只有管理員能改 */
export type TeamPatch = Partial<TeamInput & Pick<Team, 'contact_limit'>>;
export type MemberInput = Pick<Member, 'name' | 'gender'> & MemberPrivate;
export type VendorInput = Pick<Vendor, 'name' | 'account_limit'>;
export type OrgAddressInput = Omit<OrgAddress, 'org_id' | 'updated_at'>;
export type EventInput = Pick<
  SportEvent,
  'name' | 'description' | 'min_per_team' | 'max_per_team' | 'min_female' | 'rules' | 'video_url'
>;
