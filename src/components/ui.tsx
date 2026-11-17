// 共用的小型 UI 元件
import type { ReactNode } from 'react';
import type { Issue, StatusLevel } from '../lib/rules';

export function Loading({ text = '載入中…' }: { text?: string }) {
  return (
    <div className="loading">
      <span className="spinner" aria-hidden />
      {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-err">
      <strong>載入失敗：</strong>
      {message}
      {onRetry && (
        <button className="btn btn-sm btn-ghost" onClick={onRetry} style={{ marginLeft: 12 }}>
          重試
        </button>
      )}
    </div>
  );
}

export type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'primary' | 'accent';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const STATUS: Record<StatusLevel, [string, Tone]> = {
  complete: ['已完成', 'ok'],
  incomplete: ['未完成', 'warn'],
  error: ['需修正', 'err'],
};

export function StatusBadge({ level }: { level: StatusLevel }) {
  const [label, tone] = STATUS[level];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={`tab ${value === it.value ? 'tab-active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const t = tone ?? (value > max ? 'err' : pct >= 100 ? 'ok' : 'primary');
  return (
    <div className="progress" aria-label={`${value} / ${max}`}>
      <div className={`progress-bar progress-${t}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function IssueList({ issues, empty }: { issues: Issue[]; empty?: ReactNode }) {
  if (issues.length === 0) return empty ? <p className="ok-text">{empty}</p> : null;
  return (
    <ul className="issues">
      {issues.map((i, idx) => (
        <li key={idx} className={`issue issue-${i.level}`}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function HexLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 2 28.1 9v14L16 30 3.9 23V9z" fill="var(--primary)" />
      <path d="M16 9.5 22.4 13v7L16 23.5 9.6 20v-7z" fill="var(--accent)" />
    </svg>
  );
}
