// 後台「活動設定」：活動指南五個頁面的內容編輯（管理員與委外廠商）
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RichEditor } from '../../components/RichText';
import { useToast } from '../../components/Toast';
import { Badge, ErrorBox, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { GUIDE_PAGES } from '../../lib/guide';
import { MAX_GUIDE_BYTES, byteSize, formatBytes, sanitizeHtml } from '../../lib/richText';
import type { GuidePage } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

function GuideEditorCard({ title, page, onSaved }: { title: string; page: GuidePage; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState(page.content);
  const [busy, setBusy] = useState(false);
  const size = byteSize(draft);
  const tooBig = size > MAX_GUIDE_BYTES;
  // 編輯器輸出的 HTML 與原本內容可能只差在過濾，比對過濾後的結果
  const dirty = sanitizeHtml(draft) !== sanitizeHtml(page.content);

  // 有未儲存的變更時，離開頁面前提醒
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    setBusy(true);
    try {
      await api.updateGuidePage(page.id, sanitizeHtml(draft));
      toast.ok(`「${title}」已儲存`);
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack guide-editor">
      <div className="toolbar">
        <div>
          <div className="title-row">
            <h3>{title}</h3>
            {dirty && <Badge tone="warn">未儲存</Badge>}
          </div>
          <p className="muted small">
            {page.updated_at ? `最後更新：${formatDateTime(page.updated_at)}` : '尚未編輯（前台顯示「尚未公布」）'}
          </p>
        </div>
        <div className="spacer" />
        <Link className="btn btn-ghost btn-sm" to={`/guide/${page.id}`} target="_blank" rel="noopener">
          查看頁面 ↗
        </Link>
      </div>
      <RichEditor label={title} value={draft} onChange={setDraft} />
      <div className="toolbar">
        <span className={`small ${tooBig ? 'warn-text' : 'muted'}`}>
          內容大小 {formatBytes(size)} / {formatBytes(MAX_GUIDE_BYTES)}
          {tooBig && '，請刪除或改用較小的圖片'}
        </span>
        <div className="spacer" />
        {dirty && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDraft(page.content)}>
            還原
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty || tooBig} onClick={save}>
          {busy ? '儲存中…' : '儲存'}
        </button>
      </div>
    </section>
  );
}

export default function GuideEditors() {
  const q = useAsync(() => api.listGuidePages(), []);
  if (!q.data) return q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : <Loading />;
  const byId = new Map(q.data.map((p) => [p.id, p]));

  return (
    <div className="stack-lg">
      <div>
        <h2>活動指南</h2>
        <p className="muted small">
          內容顯示在上方「活動指南」選單（登入後可見）。可直接貼上圖片（自動壓縮）或 YouTube 連結（自動轉成播放器）；按「原始碼」可直接編輯 HTML，存檔與顯示前會自動移除 script 等不安全的語法。
        </p>
      </div>
      {GUIDE_PAGES.map((g) => {
        const page = byId.get(g.id);
        if (!page) return null;
        // 儲存後以伺服器內容重新建立，避免草稿與已存內容不同步
        return <GuideEditorCard key={`${page.id}-${page.updated_at ?? ''}`} title={g.title} page={page} onSaved={q.reload} />;
      })}
    </div>
  );
}
