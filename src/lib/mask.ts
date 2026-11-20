// 委外廠商看到的隱碼個資；與 SQL 函式 public.mask_middle、vendor_member_private、vendor_teams 規則一致
// 正式環境由資料庫隱碼後才回傳（廠商拿不到原始值），這裡供展示模式模擬使用
import type { MemberPrivate } from './types';

/** 隱藏中間字元：保留前 head、後 tail 個字；太短則全部隱藏 */
export function maskMiddle(value: string, head: number, tail: number): string {
  if (value.length <= head + tail) return '*'.repeat(value.length);
  return value.slice(0, head) + '*'.repeat(value.length - head - tail) + value.slice(-tail);
}

/** 手機：0912345678 → 0912***678 */
export const maskPhone = (v: string | null): string | null => (v === null ? null : maskMiddle(v, 4, 3));

/** 證號：A123456789 → A12****789 */
export const maskNationalId = (v: string | null): string | null => (v === null ? null : maskMiddle(v, 3, 3));

/** 生日：只留年份，1990-05-12 → 1990-**-** */
export const maskBirthday = (v: string | null): string | null => (v === null ? null : `${v.slice(0, 4)}-**-**`);

/** 委外廠商看到的個資：證號、生日、手機隱碼，尺寸、用餐、特殊需求照常顯示 */
export function maskPrivate(p: MemberPrivate): MemberPrivate {
  return { ...p, national_id: maskNationalId(p.national_id), birthday: maskBirthday(p.birthday), phone: maskPhone(p.phone) };
}
