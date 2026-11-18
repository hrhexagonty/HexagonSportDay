// 人偶拖曳介面的共用元件：隊員人偶（藍男、粉女）、空白名額、男女圖例與分色進度條、檢核列
// 用於隊伍頁「項目報名」與「我的公司」健力組隊
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { StatusLevel } from '../lib/rules';
import type { Gender } from '../lib/types';
import { StatusBadge } from './ui';

export function PersonIcon() {
  return (
    <svg className="figure-icon" viewBox="0 0 32 40" aria-hidden>
      <circle cx="16" cy="9" r="7.5" />
      <path d="M2 38v-5c0-7.7 6.3-14 14-14s14 6.3 14 14v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** 隊員人偶：藍色為男、粉色為女，下方顯示姓名 */
export function Figure({
  member,
  title,
  badge,
  selected = false,
  dimmed = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onRemove,
  removeLabel,
}: {
  member: { name: string; gender: Gender };
  title: string;
  /** 右上角小標（例如已報項目數） */
  badge?: ReactNode;
  selected?: boolean;
  dimmed?: boolean;
  onSelect?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onRemove?: () => void;
  /** × 按鈕的無障礙說明 */
  removeLabel?: string;
}) {
  function onKey(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.();
    }
  }
  const cls = [
    'figure',
    member.gender === 'F' ? 'figure-f' : 'figure-m',
    selected && 'is-selected',
    dimmed && 'is-dimmed',
    onDragStart && 'is-draggable',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      title={title}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      aria-label={title}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation(); // 不要觸發外層放置框的「點選加入」
        onSelect();
      }}
      onKeyDown={onSelect ? onKey : undefined}
    >
      <PersonIcon />
      <span className="figure-name">{member.name}</span>
      {badge != null && <span className="figure-badge">{badge}</span>}
      {onRemove && (
        <button
          type="button"
          className="figure-x"
          aria-label={removeLabel ?? `移除 ${member.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** 空白名額 */
export function GhostFigure() {
  return (
    <div className="figure figure-ghost" aria-hidden>
      <PersonIcon />
      <span className="figure-name">&nbsp;</span>
    </div>
  );
}

export function GenderLegend({ male, female }: { male?: number; female?: number }) {
  return (
    <span className="gender-legend">
      <span className="legend-m">男{male != null && ` ${male}`}</span>
      <span className="legend-f">女{female != null && ` ${female}`}</span>
    </span>
  );
}

/** 男女分色的進度條；min 介於 0 與 max 之間時標出下限 */
export function GenderBar({ male, female, max, min }: { male: number; female: number; max: number; min: number }) {
  const scale = Math.max(max, male + female, 1);
  const pct = (v: number) => `${(v / scale) * 100}%`;
  return (
    <div className="gbar" role="img" aria-label={`男 ${male} 人、女 ${female} 人，上限 ${max} 人`}>
      <span className="gbar-m" style={{ width: pct(male) }} />
      <span className="gbar-f" style={{ width: pct(female) }} />
      {min > 0 && min < max && <span className="gbar-min" style={{ left: pct(min) }} title={`下限 ${min} 人`} />}
    </div>
  );
}

/** 檢核列：名稱 + 狀態、男女分色進度條、人數與說明 */
export function CheckRow({
  label,
  male,
  female,
  max,
  min,
  level,
  note,
}: {
  label: string;
  male: number;
  female: number;
  max: number;
  min: number;
  level: StatusLevel;
  note: string;
}) {
  return (
    <li className={`check-row check-row-${level}`}>
      <div className="check-row-label">
        <b>{label}</b>
        <StatusBadge level={level} />
      </div>
      <GenderBar male={male} female={female} max={max} min={min} />
      <div className="check-row-count">
        <span>
          <b>{male + female}</b> / {max}
        </span>
        <span>
          男 {male} · 女 {female}
        </span>
      </div>
      <p className="check-row-note">{note}</p>
    </li>
  );
}
