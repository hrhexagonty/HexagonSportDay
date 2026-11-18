import type { TeamOption } from '../lib/types';

/** 隊伍下拉選單（註冊 / 加入隊伍用）：窗口名額已滿的隊伍不可選 */
export function TeamSelect({
  options,
  value,
  onChange,
  exclude = [],
}: {
  options: TeamOption[];
  value: string;
  onChange: (teamId: string) => void;
  /** 不列出的隊伍（例如已加入的隊伍） */
  exclude?: string[];
}) {
  const shown = options.filter((o) => !exclude.includes(o.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  return (
    <select required value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        請選擇隊伍
      </option>
      {shown.map((o) => (
        <option key={o.id} value={o.id} disabled={o.is_full}>
          {o.name}
          {o.is_full ? '（窗口名額已滿）' : ''}
        </option>
      ))}
    </select>
  );
}

/** 展示模式提示：可用來體驗註冊的邀請碼 */
export const DEMO_INVITE_HINT = '展示模式邀請碼：六角科技 獵豹隊 TECH03、六角建設 鋼鐵隊 BUIL04、醫材能源文創 聯隊 MEDI09 / ARTS09';
