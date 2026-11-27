import { describe, expect, it } from 'vitest';
import {
  cleanAddressInput,
  digitsOnly,
  missingAddressFields,
  parseBusCount,
  sampleAddressOf,
  validateAddressInput,
} from './orgAddress';
import type { OrgAddress, OrgAddressInput } from './types';

const EMPTY: OrgAddressInput = {
  shuttle_bus_count: null,
  shuttle_address: null,
  shuttle_leader_name: null,
  shuttle_leader_phone: null,
  sample_address: null,
  sample_same: false,
  sample_recipient_name: null,
  sample_recipient_phone: null,
};
const input = (patch: Partial<OrgAddressInput>): OrgAddressInput => ({ ...EMPTY, ...patch });
const addr = (patch: Partial<OrgAddress>): OrgAddress => ({
  org_id: 'o1',
  updated_at: '2026-11-27T00:00:00.000Z',
  ...EMPTY,
  ...patch,
});
const FULL = {
  shuttle_bus_count: 2,
  shuttle_address: 'A',
  shuttle_leader_name: '王車長',
  shuttle_leader_phone: '0912345678',
  sample_recipient_name: '李收件',
  sample_recipient_phone: '0223456789',
};

describe('cleanAddressInput', () => {
  it('去除前後空白，空字串存 null', () => {
    expect(
      cleanAddressInput(
        input({ shuttle_address: '  台北市一路 1 號 ', sample_address: '   ', shuttle_leader_name: ' 王車長 ', sample_recipient_phone: ' ' }),
      ),
    ).toEqual(input({ shuttle_address: '台北市一路 1 號', shuttle_leader_name: '王車長' }));
  });
  it('選「同上」時清空樣衣寄送地址，收件人照常保留', () => {
    expect(cleanAddressInput(input({ shuttle_address: 'A', sample_address: 'B', sample_same: true, sample_recipient_name: '李' }))).toEqual(
      input({ shuttle_address: 'A', sample_same: true, sample_recipient_name: '李' }),
    );
  });
});

describe('validateAddressInput', () => {
  it('地址上限 200 字、姓名上限 50 字', () => {
    expect(validateAddressInput(input({ shuttle_address: 'a'.repeat(200), shuttle_leader_name: '王'.repeat(50) }))).toBeNull();
    expect(validateAddressInput(input({ shuttle_address: 'a'.repeat(201) }))).toContain('接駁車');
    expect(validateAddressInput(input({ sample_address: 'a'.repeat(201) }))).toContain('樣衣');
    expect(validateAddressInput(input({ shuttle_leader_name: '王'.repeat(51) }))).toContain('車長姓名');
    expect(validateAddressInput(input({ sample_recipient_name: '王'.repeat(51) }))).toContain('收件人姓名');
  });
  it('電話只能包含數字、空格與 + - ( ) #，6–30 字（與 DB check 一致）', () => {
    for (const ok of ['0912345678', '0912-345-678', '+886 912 345 678', '(02) 2345-6789 #12']) {
      expect(validateAddressInput(input({ shuttle_leader_phone: ok, sample_recipient_phone: ok }))).toBeNull();
    }
    expect(validateAddressInput(input({ shuttle_leader_phone: '王小明' }))).toContain('車長電話');
    expect(validateAddressInput(input({ sample_recipient_phone: '12345' }))).toContain('收件人電話');
    expect(validateAddressInput(input({ sample_recipient_phone: '1'.repeat(31) }))).toContain('收件人電話');
  });
});

describe('需要幾台車', () => {
  it('輸入框只留數字（全形轉半形，小數點、負號、e、單位一律去除）', () => {
    expect(digitsOnly('12')).toBe('12');
    expect(digitsOnly('１２')).toBe('12');
    expect(digitsOnly('-1.5e3 台')).toBe('153');
    expect(digitsOnly('abc')).toBe('');
  });
  it('轉成數字，空白為 null', () => {
    expect(parseBusCount('3')).toBe(3);
    expect(parseBusCount('０３')).toBe(3);
    expect(parseBusCount('')).toBeNull();
  });
  it('需為 1–99 的整數（與 DB check 一致）', () => {
    expect(validateAddressInput(input({ shuttle_bus_count: 1 }))).toBeNull();
    expect(validateAddressInput(input({ shuttle_bus_count: 99 }))).toBeNull();
    expect(validateAddressInput(input({ shuttle_bus_count: null }))).toBeNull();
    expect(validateAddressInput(input({ shuttle_bus_count: 0 }))).toContain('幾台車');
    expect(validateAddressInput(input({ shuttle_bus_count: 100 }))).toContain('幾台車');
    expect(validateAddressInput(input({ shuttle_bus_count: 1.5 }))).toContain('幾台車');
  });
});

describe('sampleAddressOf / missingAddressFields', () => {
  it('「同上」取接駁車接送地址', () => {
    expect(sampleAddressOf(addr({ shuttle_address: 'A', sample_same: true }))).toBe('A');
    expect(sampleAddressOf(addr({ shuttle_address: 'A', sample_address: 'B' }))).toBe('B');
    expect(sampleAddressOf(null)).toBeNull();
  });
  it('列出尚未填寫的欄位', () => {
    expect(missingAddressFields(null)).toHaveLength(7);
    expect(missingAddressFields(addr({ ...FULL, sample_same: true, shuttle_bus_count: null }))).toEqual(['需要幾台車']);
    expect(missingAddressFields(addr({ ...FULL }))).toEqual(['樣衣寄送地址']);
    expect(missingAddressFields(addr({ ...FULL, sample_same: true }))).toEqual([]);
    expect(missingAddressFields(addr({ ...FULL, shuttle_address: null, sample_same: true }))).toEqual([
      '接駁車接送地址',
      '樣衣寄送地址',
    ]);
    expect(missingAddressFields(addr({ ...FULL, sample_same: true, shuttle_leader_phone: null }))).toEqual(['車長電話']);
  });
});
