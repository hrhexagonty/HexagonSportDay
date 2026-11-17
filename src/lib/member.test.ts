import { describe, expect, it } from 'vitest';
import { checkTwId, maskId, withCheckDigit } from './idNumber';
import { ageOn, normalizeShirtSize, parseBirthday, validateMemberInput } from './member';
import type { MemberInput } from './types';

describe('checkTwId', () => {
  it('驗證身分證檢查碼並推得性別', () => {
    expect(checkTwId('A123456789')).toEqual({ ok: true, gender: 'M' });
    expect(checkTwId(' b200000004 ')).toEqual({ ok: true, gender: 'F' });
    expect(checkTwId('A123456788').ok).toBe(false);
  });
  it('新式居留證（第 2 碼 8/9）使用相同檢查碼', () => {
    expect(checkTwId('A800000014')).toEqual({ ok: true, gender: 'M' });
    expect(checkTwId('A900000016')).toEqual({ ok: true, gender: 'F' });
  });
  it('舊式居留證只檢查格式', () => {
    expect(checkTwId('AC12345678')).toEqual({ ok: true, gender: null });
  });
  it('格式錯誤', () => {
    expect(checkTwId('A323456789').ok).toBe(false);
    expect(checkTwId('12345').ok).toBe(false);
    expect(checkTwId('').error).toBe('請填寫身分證字號');
  });
  it('補檢查碼後必定通過驗證', () => {
    for (const first9 of ['F12345678', 'Z29876543', 'I10000000', 'O20000000', 'W81234567']) {
      expect(checkTwId(withCheckDigit(first9)).ok).toBe(true);
    }
  });
  it('遮罩顯示', () => {
    expect(maskId('A123456789')).toBe('A12****789');
  });
});

describe('parseBirthday', () => {
  it('支援西元與民國年', () => {
    expect(parseBirthday('1990-05-12')).toBe('1990-05-12');
    expect(parseBirthday('1990/5/12')).toBe('1990-05-12');
    expect(parseBirthday('1990.5.12')).toBe('1990-05-12');
    expect(parseBirthday('19900512')).toBe('1990-05-12');
    expect(parseBirthday('79/5/12')).toBe('1990-05-12');
    expect(parseBirthday('民國 079/05/12')).toBe('1990-05-12');
    expect(parseBirthday('0790512')).toBe('1990-05-12');
  });
  it('不存在的日期回傳 null', () => {
    expect(parseBirthday('1990/2/30')).toBeNull();
    expect(parseBirthday('abc')).toBeNull();
  });
});

describe('validateMemberInput', () => {
  const ok: MemberInput = {
    name: '王小明',
    gender: 'M',
    national_id: 'A123456789',
    birthday: '1990-05-12',
    diet: 'meat',
    special_needs: null,
    phone: null,
    shirt_size: null,
  };
  const now = new Date('2026-11-17');

  it('完整資料通過', () => {
    expect(validateMemberInput(ok, now)).toBeNull();
  });
  it('性別需與證號一致', () => {
    expect(validateMemberInput({ ...ok, gender: 'F' }, now)).toContain('不符');
  });
  it('生日不可在未來', () => {
    expect(validateMemberInput({ ...ok, birthday: '2027-01-01' }, now)).toContain('生日');
  });
});

describe('其他欄位', () => {
  it('衣服尺寸正規化', () => {
    expect(normalizeShirtSize('xxl')).toBe('2XL');
    expect(normalizeShirtSize('')).toBeNull();
    expect(normalizeShirtSize('XXXXL')).toBeUndefined();
  });
  it('計算年齡', () => {
    expect(ageOn('1990-05-12', new Date('2027-03-27'))).toBe(36);
    expect(ageOn('1990-05-12', new Date('2027-05-11'))).toBe(36);
    expect(ageOn('1990-05-12', new Date('2027-05-12'))).toBe(37);
  });
});
