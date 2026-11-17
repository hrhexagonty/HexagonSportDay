import { describe, expect, it } from 'vitest';
import { parseMemberRows } from './importParse';

const NOW = new Date('2026-11-17T12:00:00+08:00');

describe('parseMemberRows', () => {
  it('解析 Excel 貼上的 Tab 分隔資料並略過表頭', () => {
    const text = [
      '姓名\t性別\t身分證字號\t生日\t用餐習慣\t特殊需求\t手機\t衣服尺寸',
      '王小明\t男\ta123456789\t1990/5/12\t葷食\t\t0912345678\tl',
      '陳美玲\t女\tB200000004\t民國79/05/12\t蛋奶素\t海鮮過敏',
    ].join('\n');
    const rows = parseMemberRows(text, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toEqual({
      name: '王小明',
      gender: 'M',
      national_id: 'A123456789',
      birthday: '1990-05-12',
      diet: 'meat',
      special_needs: null,
      phone: '0912345678',
      shirt_size: 'L',
    });
    expect(rows[1].value).toMatchObject({ birthday: '1990-05-12', diet: 'ovo_lacto', special_needs: '海鮮過敏', phone: null });
  });

  it('支援逗號分隔，特殊需求填「無」視為沒有', () => {
    const rows = parseMemberRows('Amy,F,B200000004,1995-01-31,素,無', NOW);
    expect(rows[0].value).toMatchObject({ gender: 'F', diet: 'vegan', special_needs: null });
  });

  it('標記錯誤列與批次內重複證號', () => {
    const rows = parseMemberRows(
      [
        '王小明\t男\tA123456789\t1990/5/12\t葷',
        '李四\t男\tA123456788\t1990/5/12\t葷', // 檢查碼錯誤
        '張三\t女\tA123456789\t1990/5/12\t葷', // 性別與證號不符
        '林五\t男\tA123456789\t1990/5/12\t葷', // 與第 1 行重複
        '趙六\t男\tA800000014\t1990/2/30\t葷', // 日期不存在
        '錢七\t男\tA800000014\t1990/2/3\t吃肉', // 用餐習慣無法辨識
      ].join('\n'),
      NOW,
    );
    expect(rows.map((r) => r.error ?? 'ok')).toEqual([
      'ok',
      '證號「A123456788」檢查碼錯誤，請確認是否輸入正確',
      '性別（女）與身分證字號不符',
      '身分證字號與第 1 行重複',
      '生日「1990/2/30」無法辨識，例如 1990/5/12 或民國 79/5/12',
      '用餐習慣「吃肉」無法辨識，請填 葷食 / 蛋奶素 / 全素',
    ]);
  });
});
