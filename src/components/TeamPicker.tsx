import { useState } from 'react';
import type { TeamOption } from '../lib/types';

/** 隊伍點選（註冊 / 加入隊伍用）：以膠囊按鈕列出所有隊伍，窗口名額已滿的隊伍不可選 */
export function TeamPicker({
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
  const [query, setQuery] = useState('');
  const all = options.filter((o) => !exclude.includes(o.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  const q = query.trim();
  const shown = q ? all.filter((o) => o.name.includes(q)) : all;
  const selected = all.find((o) => o.id === value);

  return (
    <div className="team-picker">
      {all.length > 12 && (
        <input className="search" placeholder="搜尋隊名" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="team-picks" role="radiogroup" aria-label="選擇隊伍">
        {shown.map((o) => (
          <label
            key={o.id}
            className={`team-pick${o.id === value ? ' is-on' : ''}${o.is_full ? ' is-full' : ''}`}
            title={o.is_full ? '此隊窗口名額已滿，請洽活動小組' : undefined}
          >
            <input
              type="radio"
              name="team-pick"
              value={o.id}
              checked={o.id === value}
              disabled={o.is_full}
              onChange={() => onChange(o.id)}
            />
            <span>{o.name}</span>
            {o.is_full && <small>名額已滿</small>}
          </label>
        ))}
        {shown.length === 0 && <span className="muted small">{all.length ? '找不到符合的隊伍' : '目前沒有可加入的隊伍'}</span>}
      </div>
      <p className="muted small">{selected ? `已選擇：${selected.name}` : '請點選要加入的隊伍'}</p>
    </div>
  );
}

/** 展示模式提示：可用來體驗註冊的邀請碼 */
export const DEMO_INVITE_HINT = '展示模式邀請碼：六角科技 獵豹隊 TECH03、六角建設 鋼鐵隊 BUIL04、醫材能源文創 聯隊 MEDI09 / ARTS09';
