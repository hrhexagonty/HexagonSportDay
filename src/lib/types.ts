// 系統共用型別：欄位與 supabase/migrations 中的資料表一一對應，修改 schema 時需同步

export type Gender = 'M' | 'F';
export type Role = 'org_admin' | 'super_admin';
export type EventCategory = 'fun' | 'powerlifting';
export type Diet = 'meat' | 'ovo_lacto' | 'vegan';

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const DIETS: Diet[] = ['meat', 'ovo_lacto', 'vegan'];
export const DIET_LABEL: Record<Diet, string> = { meat: '葷食', ovo_lacto: '蛋奶素', vegan: '全素' };
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

/** 公司；team_quota = 可自行建立的隊伍數（聯隊不占額度） */
export interface Organization {
  id: string;
  name: string;
  team_quota: number;
  invite_code: string;
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
  /** 參與公司；超過 1 家即為聯隊 */
  org_ids: string[];
}

/** 隊員個資（member_private 表）：只有隊員所屬公司窗口與管理員看得到 */
export interface MemberPrivate {
  national_id: string; // 身分證 / 居留證
  birthday: string; // YYYY-MM-DD
  phone: string | null;
  shirt_size: ShirtSize | null;
  diet: Diet;
  special_needs: string | null; // null = 無特殊需求
}

/** 隊員；private 為 null 代表無權檢視（聯隊其他公司隊員）或個資已清除 */
export interface Member {
  id: string;
  team_id: string;
  org_id: string; // 所屬公司
  name: string;
  gender: Gender;
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
}

/** 項目報名；隊伍由 member 推得 */
export interface EventEntry {
  event_id: string;
  member_id: string;
}

// ---- 表單輸入型別 ----
export type OrgInput = Pick<Organization, 'name' | 'team_quota' | 'contact_name' | 'contact_phone'>;
export type TeamInput = Pick<Team, 'name' | 'captain_name' | 'captain_phone'>;
export type MemberInput = Pick<Member, 'name' | 'gender'> & MemberPrivate;
export type EventInput = Pick<SportEvent, 'name' | 'description' | 'min_per_team' | 'max_per_team' | 'min_female'>;
