import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('公式開頭（= + - @ Tab CR）前面加單引號，避免 Excel 當成公式執行', () => {
    const cells = ['=1+1', '+886912345678', '-2+3+cmd', '@SUM(A1)', '\t=1', '\r=1'];
    expect(toCsv([cells]).split(',').slice(0, 4)).toEqual(["'=1+1", "'+886912345678", "'-2+3+cmd", "'@SUM(A1)"]);
    expect(toCsv([['\t=1']])).toBe("'\t=1");
    // 含 CR 的欄位另外以雙引號包住
    expect(toCsv([['\r=1']])).toBe(`"'\r=1"`);
  });

  it('一般文字、數字與空值照常輸出，逗號與雙引號會跳脫', () => {
    expect(toCsv([['王小明', 0, 12, null, undefined, 'a,b', '說"明"']])).toBe('王小明,0,12,,,"a,b","說""明"""');
  });
});
