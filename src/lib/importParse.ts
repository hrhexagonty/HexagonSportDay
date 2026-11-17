// 批次匯入隊員：解析從 Excel 複製貼上的文字（Tab 分隔）或 CSV（逗號分隔）
// 欄位順序見 IMPORT_COLUMNS；手機、衣服尺寸、特殊需求可留空

import { normalizeId } from './idNumber';
import { cleanMemberInput, normalizeShirtSize, parseBirthday, parseDiet, parseGender, validateMemberInput } from './member';
import { SHIRT_SIZES, type MemberInput } from './types';

export const IMPORT_COLUMNS = ['姓名', '性別', '身分證字號', '生日', '用餐習慣', '特殊需求', '手機', '衣服尺寸'] as const;

export interface ParsedRow {
  line: number;
  raw: string;
  value?: MemberInput;
  error?: string;
}

export function parseMemberRows(text: string, now: Date = new Date()): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let first = true;

  text.split(/\r?\n/).forEach((raw, idx) => {
    if (!raw.trim()) return;
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(',')).map((c) => c.trim());
    const isHeader = first && cells[0] === '姓名';
    first = false;
    if (isHeader) return;

    const line = idx + 1;
    const [name = '', genderRaw = '', idRaw = '', birthdayRaw = '', dietRaw = '', needs = '', phone = '', shirt = ''] =
      cells;
    const fail = (error: string) => rows.push({ line, raw, error });

    if (!name) return fail('缺少姓名');
    const gender = parseGender(genderRaw);
    if (!gender) return fail(`性別「${genderRaw}」無法辨識，請填 男 / 女`);
    const birthday = parseBirthday(birthdayRaw);
    if (!birthday) return fail(`生日「${birthdayRaw}」無法辨識，例如 1990/5/12 或民國 79/5/12`);
    const diet = parseDiet(dietRaw);
    if (!diet) return fail(`用餐習慣「${dietRaw}」無法辨識，請填 葷食 / 蛋奶素 / 全素`);
    const size = normalizeShirtSize(shirt);
    if (size === undefined) return fail(`衣服尺寸「${shirt}」無法辨識，可填 ${SHIRT_SIZES.join(' / ')}`);

    const value = cleanMemberInput({
      name,
      gender,
      national_id: normalizeId(idRaw),
      birthday,
      diet,
      special_needs: needs === '無' ? null : needs,
      phone,
      shirt_size: size,
    });
    const error = validateMemberInput(value, now);
    if (error) return fail(error);
    rows.push({ line, raw, value });
  });

  // 同一批資料內的證號重複
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.value) continue;
    const prev = seen.get(r.value.national_id);
    if (prev !== undefined) {
      r.error = `身分證字號與第 ${prev} 行重複`;
      r.value = undefined;
    } else {
      seen.set(r.value.national_id, r.line);
    }
  }
  return rows;
}
