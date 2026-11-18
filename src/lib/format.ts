// 顯示格式與錯誤訊息的小工具

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '發生未知錯誤';
}

/** YYYY-MM-DD → 2027年3月27日 週六 */
export function formatDate(d: string | null): string | null {
  if (!d) return null;
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** ISO 時間 → <input type="datetime-local"> 需要的本地時間字串 */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 空字串轉 null，方便表單送出 */
export function blankToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

/** 匯出檔名用的日期，例如 20261118 */
export function dateStamp(d: Date = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** 匯出檔名前綴：活動名稱去除不能當檔名的字元 */
export function filePrefix(title: string): string {
  return title.replace(/[\\/:*?"<>|\s]+/g, '_');
}
