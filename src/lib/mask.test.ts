import { describe, expect, it } from 'vitest';
import { maskBirthday, maskMiddle, maskNationalId, maskPhone, maskPrivate } from './mask';

describe('隱碼（與 SQL mask_middle 一致）', () => {
  it('證號、手機、生日', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789');
    expect(maskPhone('0912345678')).toBe('0912***678');
    expect(maskPhone('02-2700-1000')).toBe('02-2*****000');
    expect(maskBirthday('1990-05-12')).toBe('1990-**-**');
  });

  it('太短的值全部隱藏、null 維持 null', () => {
    expect(maskMiddle('0912', 4, 3)).toBe('****');
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBeNull();
    expect(maskNationalId(null)).toBeNull();
    expect(maskBirthday(null)).toBeNull();
  });

  it('尺寸、用餐、特殊需求不隱碼', () => {
    const p = maskPrivate({
      national_id: 'A123456789',
      birthday: '1990-05-12',
      phone: '0912345678',
      shirt_size: 'L',
      diet: 'meat_no_pork',
      special_needs: '海鮮過敏',
    });
    expect(p).toEqual({
      national_id: 'A12****789',
      birthday: '1990-**-**',
      phone: '0912***678',
      shirt_size: 'L',
      diet: 'meat_no_pork',
      special_needs: '海鮮過敏',
    });
  });
});
