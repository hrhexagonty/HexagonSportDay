// 匯出 CSV（加上 BOM，Excel 開啟中文不會亂碼）

export type Cell = string | number | null | undefined;

function escapeCell(v: Cell): string {
  if (v == null) return '';
  let s = String(v);
  // 避免 CSV 公式注入（=、@ 開頭會被 Excel 當公式執行）
  if (/^[=@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
