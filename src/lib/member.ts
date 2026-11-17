// 隊員欄位的解析與驗證：單筆表單、批次匯入、展示模式寫入共用
// 與 DB 端限制（member_private 的 check / trigger）保持一致

import { checkTwId, normalizeId } from './idNumber';
import { DIETS, DIET_LABEL, GENDER_LABEL, SHIRT_SIZES, type Diet, type Gender, type MemberInput, type ShirtSize } from './types';

const GENDER_MAP: Record<string, Gender> = {
  男: 'M',
  男性: 'M',
  M: 'M',
  MALE: 'M',
  女: 'F',
  女性: 'F',
  F: 'F',
  FEMALE: 'F',
};

const DIET_MAP: Record<string, Diet> = {
  葷: 'meat',
  葷食: 'meat',
  一般: 'meat',
  蛋奶素: 'ovo_lacto',
  奶蛋素: 'ovo_lacto',
  素: 'vegan',
  全素: 'vegan',
  純素: 'vegan',
};

export function parseGender(v: string): Gender | undefined {
  const t = v.trim();
  return GENDER_MAP[t.toUpperCase()] ?? GENDER_MAP[t];
}

export function parseDiet(v: string): Diet | undefined {
  const t = v.trim();
  if ((DIETS as string[]).includes(t)) return t as Diet;
  return DIET_MAP[t];
}

/** 尺寸正規化；空白回傳 null，無法辨識回傳 undefined */
export function normalizeShirtSize(v: string): ShirtSize | null | undefined {
  let s = v.trim().toUpperCase();
  if (!s) return null;
  if (s === 'XXL') s = '2XL';
  if (s === 'XXXL') s = '3XL';
  return (SHIRT_SIZES as readonly string[]).includes(s) ? (s as ShirtSize) : undefined;
}

function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 解析生日，回傳 YYYY-MM-DD；無法辨識回傳 null。
 * 支援：1990-05-12、1990/5/12、1990.5.12、19900512、民國 79/5/12、079/05/12、0790512
 */
export function parseBirthday(v: string): string | null {
  const t = v.trim().replace(/^民國\s*/, '');
  let y: number;
  let m: number;
  let d: number;
  let match = t.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[1].length <= 3) y += 1911; // 2～3 位數視為民國年
  } else if ((match = t.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = t.match(/^(\d{3})(\d{2})(\d{2})$/))) {
    [y, m, d] = [Number(match[1]) + 1911, Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

function todayIso(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 驗證整筆隊員資料，回傳第一個錯誤訊息；通過回傳 null */
export function validateMemberInput(m: MemberInput, now: Date = new Date()): string | null {
  if (!m.name.trim()) return '請填寫姓名';
  if (m.gender !== 'M' && m.gender !== 'F') return '請選擇性別';
  const id = checkTwId(m.national_id);
  if (!id.ok) return id.error!;
  if (id.gender && id.gender !== m.gender) {
    return `性別（${GENDER_LABEL[m.gender]}）與身分證字號不符`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.birthday) || !parseBirthday(m.birthday)) return '請填寫正確的生日';
  if (m.birthday < '1900-01-01' || m.birthday > todayIso(now)) return '生日超出合理範圍';
  if (!DIETS.includes(m.diet)) return `請選擇用餐習慣（${DIETS.map((d) => DIET_LABEL[d]).join(' / ')}）`;
  return null;
}

/** 送出前整理欄位（證號轉大寫、空字串轉 null） */
export function cleanMemberInput(m: MemberInput): MemberInput {
  return {
    ...m,
    name: m.name.trim(),
    national_id: normalizeId(m.national_id),
    phone: m.phone?.trim() || null,
    special_needs: m.special_needs?.trim() || null,
  };
}

/** 計算年齡（以活動日或今天為準） */
export function ageOn(birthday: string, on: Date = new Date()): number {
  const [y, m, d] = birthday.split('-').map(Number);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) age--;
  return age;
}
