// 身分證 / 居留證字號驗證；與 SQL 函式 public.tw_id_valid、tw_id_gender 規則一致
// - 身分證、新式居留證：1 碼英文 + 9 碼數字，第 2 碼 1/2（國民）或 8/9（居留證），最後一碼為檢查碼
// - 舊式居留證：2 碼英文 + 8 碼數字，僅檢查格式（無法判斷性別）

import type { Gender } from './types';

// 依序對應代碼 10～35（A=10 … H=17, J=18 … Z=33, I=34, O=35）
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';

export function normalizeId(v: string): string {
  return v.trim().toUpperCase();
}

function checksumSum(first9: string): number {
  const code = LETTERS.indexOf(first9[0]) + 10;
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let i = 1; i <= 8; i++) sum += Number(first9[i]) * (9 - i);
  return sum;
}

export interface IdCheck {
  ok: boolean;
  error?: string;
  /** 由證號推得的性別；舊式居留證為 null */
  gender: Gender | null;
}

export function checkTwId(raw: string): IdCheck {
  const id = normalizeId(raw);
  if (!id) return { ok: false, error: '請填寫身分證字號', gender: null };
  if (/^[A-Z][A-D]\d{8}$/.test(id)) return { ok: true, gender: null };
  if (!/^[A-Z][1289]\d{8}$/.test(id)) {
    return { ok: false, error: `證號「${raw.trim()}」格式錯誤（應為 1 碼英文 + 9 碼數字）`, gender: null };
  }
  const sum = checksumSum(id.slice(0, 9)) + Number(id[9]);
  if (sum % 10 !== 0) return { ok: false, error: `證號「${id}」檢查碼錯誤，請確認是否輸入正確`, gender: null };
  return { ok: true, gender: id[1] === '1' || id[1] === '8' ? 'M' : 'F' };
}

/** 畫面顯示用遮罩：A123456789 → A12****789 */
export function maskId(id: string): string {
  if (id.length < 7) return id;
  return `${id.slice(0, 3)}${'*'.repeat(id.length - 6)}${id.slice(-3)}`;
}

/** 依前 9 碼補上檢查碼（展示資料與測試用） */
export function withCheckDigit(first9: string): string {
  const sum = checksumSum(first9.toUpperCase());
  return first9.toUpperCase() + String((10 - (sum % 10)) % 10);
}
