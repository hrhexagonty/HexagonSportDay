// 公司地址與聯絡人（接駁車接送地址、車長；樣衣寄送地址、樣衣收件人）
// 與 org_addresses 的 check constraint 與 trigger 一致，修改時需同步 migration
import type { OrgAddress, OrgAddressInput } from './types';

/** 與 org_addresses 的 char_length 上限一致 */
export const MAX_ADDRESS_LENGTH = 200;
export const MAX_CONTACT_NAME_LENGTH = 50;
/** 與 org_addresses 的 shuttle_bus_count check 一致 */
export const MIN_BUS_COUNT = 1;
export const MAX_BUS_COUNT = 99;
/** 與 org_addresses 的電話 check 一致：數字、空格與 + - ( ) #，6–30 字 */
export const CONTACT_PHONE_PATTERN = /^[0-9+()# -]{6,30}$/;

const clean = (v: string | null | undefined) => v?.trim() || null;

/** 台數輸入框只留數字：全形數字轉半形，其餘字元（含小數點、負號、e）一律去除 */
export function digitsOnly(text: string): string {
  return text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\D/g, '');
}

/** 台數輸入框的文字轉數字；空白為 null */
export function parseBusCount(text: string): number | null {
  const digits = digitsOnly(text);
  return digits ? Number(digits) : null;
}

/** 去除前後空白、空字串存 null；選「同上」時清空樣衣寄送地址（同 org_addresses_before_write） */
export function cleanAddressInput(input: OrgAddressInput): OrgAddressInput {
  return {
    shuttle_bus_count: input.shuttle_bus_count ?? null,
    shuttle_address: clean(input.shuttle_address),
    shuttle_leader_name: clean(input.shuttle_leader_name),
    shuttle_leader_phone: clean(input.shuttle_leader_phone),
    sample_address: input.sample_same ? null : clean(input.sample_address),
    sample_same: input.sample_same,
    sample_recipient_name: clean(input.sample_recipient_name),
    sample_recipient_phone: clean(input.sample_recipient_phone),
  };
}

/** 檢查長度與電話格式（輸入需先經 cleanAddressInput）；回傳錯誤訊息或 null */
export function validateAddressInput(input: OrgAddressInput): string | null {
  const tooLong = (v: string | null, max: number) => (v?.length ?? 0) > max;
  const badPhone = (v: string | null) => !!v && !CONTACT_PHONE_PATTERN.test(v);
  if (tooLong(input.shuttle_address, MAX_ADDRESS_LENGTH)) return `接駁車接送地址不可超過 ${MAX_ADDRESS_LENGTH} 字`;
  if (tooLong(input.sample_address, MAX_ADDRESS_LENGTH)) return `樣衣寄送地址不可超過 ${MAX_ADDRESS_LENGTH} 字`;
  if (tooLong(input.shuttle_leader_name, MAX_CONTACT_NAME_LENGTH)) return `車長姓名不可超過 ${MAX_CONTACT_NAME_LENGTH} 字`;
  if (tooLong(input.sample_recipient_name, MAX_CONTACT_NAME_LENGTH))
    return `樣衣收件人姓名不可超過 ${MAX_CONTACT_NAME_LENGTH} 字`;
  const n = input.shuttle_bus_count;
  if (n !== null && (!Number.isInteger(n) || n < MIN_BUS_COUNT || n > MAX_BUS_COUNT))
    return `需要幾台車請填 ${MIN_BUS_COUNT}–${MAX_BUS_COUNT} 的整數`;
  const phoneRule = '只能包含數字、空格與 + - ( ) #，6–30 字';
  if (badPhone(input.shuttle_leader_phone)) return `車長電話${phoneRule}`;
  if (badPhone(input.sample_recipient_phone)) return `樣衣收件人電話${phoneRule}`;
  return null;
}

/** 實際的樣衣寄送地址（「同上」取接駁車接送地址） */
export function sampleAddressOf(a: OrgAddress | null | undefined): string | null {
  if (!a) return null;
  return a.sample_same ? a.shuttle_address : a.sample_address;
}

/** 尚未填寫的欄位名稱（不阻擋任何操作，只用來標示「待填寫」） */
export function missingAddressFields(a: OrgAddress | null | undefined): string[] {
  const missing: string[] = [];
  if (a?.shuttle_bus_count == null) missing.push('需要幾台車');
  if (!a?.shuttle_address) missing.push('接駁車接送地址');
  if (!a?.shuttle_leader_name) missing.push('車長姓名');
  if (!a?.shuttle_leader_phone) missing.push('車長電話');
  if (!sampleAddressOf(a)) missing.push('樣衣寄送地址');
  if (!a?.sample_recipient_name) missing.push('樣衣收件人姓名');
  if (!a?.sample_recipient_phone) missing.push('樣衣收件人電話');
  return missing;
}
