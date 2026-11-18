// 隊伍邀請碼：6–20 位英數大寫（與 team_invites.invite_code 的 check 一致）

export const INVITE_CODE_PATTERN = /^[A-Z0-9]{6,20}$/;

/** 去除空白並轉大寫（輸入時不分大小寫） */
export function normalizeInviteCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

/** 隨機產生 8 碼邀請碼；排除 0/O、1/I/L 等容易看錯的字 */
export function randomInviteCode(length = 8): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
