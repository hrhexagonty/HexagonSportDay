// 活動指南的內容顯示與編輯器
// - RichContent：顯示已過濾的 HTML
// - RichEditor：所見即所得編輯（contenteditable + execCommand），可切換 HTML 原始碼；
//   圖片貼上 / 拖曳 / 選擇檔案時自動壓縮內嵌，貼上 YouTube 連結自動轉成播放器
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { compressImage, sanitizeHtml, toSourceView, videoHtml } from '../lib/richText';
import { useToast } from './Toast';

/** 顯示活動指南內容（一律先過濾） */
export function RichContent({ html }: { html: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}

const TABLE_HTML =
  '<table><thead><tr><th>標題</th><th>標題</th><th>標題</th></tr></thead><tbody>' +
  '<tr><td>內容</td><td>內容</td><td>內容</td></tr><tr><td>內容</td><td>內容</td><td>內容</td></tr></tbody></table><p><br></p>';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function RichEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const toast = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** 最後一次在編輯區內的選取範圍（按工具列或開啟對話框時會失去焦點） */
  const rangeRef = useRef<Range | null>(null);
  /** 最後一次由編輯器送出的內容，用來分辨外部是否換了內容（例如儲存後重新載入） */
  const lastEmitted = useRef<string | null>(null);
  const [source, setSource] = useState<{ text: string; restore: (s: string) => string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 外部內容變更時（初次載入、儲存後重新載入）或編輯區重新出現（從原始碼切回）才覆寫，避免打字時游標跳動
  useEffect(() => {
    const el = editorRef.current;
    if (!el || (value === lastEmitted.current && el.dataset.filled === '1')) return;
    el.innerHTML = sanitizeHtml(value);
    el.dataset.filled = '1';
    lastEmitted.current = value;
  }, [value, source]);

  // 記住編輯區內的選取範圍
  useEffect(() => {
    const onSelect = () => {
      const sel = document.getSelection();
      const el = editorRef.current;
      if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)) rangeRef.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  function emit() {
    const html = editorRef.current?.innerHTML ?? '';
    lastEmitted.current = html;
    onChange(html);
  }

  /** 還原選取範圍（沒有則放在最後面）並聚焦 */
  function restoreSelection() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (!sel) return;
    let range = rangeRef.current;
    if (!range || !el.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function exec(command: string, arg?: string) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, arg);
    emit();
  }

  /** 在游標位置插入 HTML（先過濾） */
  function insertHtml(html: string) {
    restoreSelection();
    const clean = sanitizeHtml(html);
    if (!document.execCommand('insertHTML', false, clean)) editorRef.current?.insertAdjacentHTML('beforeend', clean);
    emit();
  }

  async function insertImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setBusy(true);
    try {
      const uris = await Promise.all(images.map((f) => compressImage(f)));
      insertHtml(uris.map((uri) => `<p><img src="${uri}" alt=""></p>`).join(''));
    } catch (err) {
      toast.error(err instanceof Error ? `圖片處理失敗：${err.message}` : '圖片處理失敗');
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      void insertImages(files);
      return;
    }
    const text = e.clipboardData.getData('text/plain').trim();
    // 只貼上一個網址：影片連結轉成播放器 / 連結
    if (/^https?:\/\/\S+$/i.test(text)) {
      e.preventDefault();
      insertHtml(videoHtml(text) ?? `<a href="${escapeHtml(text)}">${escapeHtml(text)}</a>`);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    if (html) {
      // 從 Word / 網頁貼上：過濾後再插入
      e.preventDefault();
      insertHtml(html);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    const files = [...e.dataTransfer.files];
    if (!files.some((f) => f.type.startsWith('image/'))) return;
    e.preventDefault();
    // 放在滑鼠放開的位置
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (pos) rangeRef.current = pos;
    void insertImages(files);
  }

  function addLink() {
    const url = prompt('連結網址（https://…）')?.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
      toast.error('連結需以 https://、http://、mailto: 或 tel: 開頭');
      return;
    }
    const sel = document.getSelection();
    const hasText = !!rangeRef.current && !rangeRef.current.collapsed && !!sel;
    if (hasText) exec('createLink', url);
    else insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
  }

  function addVideo() {
    const url = prompt('影片連結（YouTube 會直接內嵌播放，其他連結以新分頁開啟）')?.trim();
    if (!url) return;
    const html = videoHtml(url);
    if (!html) {
      toast.error('影片連結需以 http:// 或 https:// 開頭');
      return;
    }
    insertHtml(html);
  }

  function toggleSource() {
    if (source) {
      // 切回編輯畫面：還原內嵌圖片並過濾
      // 編輯區重新出現後，由上方的 effect 填入內容
      const html = sanitizeHtml(source.restore(source.text));
      setSource(null);
      onChange(html);
    } else {
      const html = editorRef.current?.innerHTML ?? value;
      const view = toSourceView(html);
      setSource({ text: view.source, restore: view.restore });
    }
  }

  const tool = (text: string, title: string, run: () => void, extra = '') => (
    <button
      type="button"
      className={`rte-btn ${extra}`}
      title={title}
      aria-label={title}
      disabled={!!source}
      // 不讓按鈕搶走編輯區的選取範圍
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {text}
    </button>
  );

  return (
    <div className={`rte${source ? ' rte-source-mode' : ''}`}>
      <div className="rte-toolbar" role="toolbar" aria-label={`${label}編輯工具`}>
        <select
          className="rte-select"
          aria-label="段落樣式"
          disabled={!!source}
          value=""
          onChange={(e) => e.target.value && exec('formatBlock', e.target.value)}
        >
          <option value="">段落樣式</option>
          <option value="P">內文</option>
          <option value="H2">標題</option>
          <option value="H3">小標題</option>
          <option value="BLOCKQUOTE">引言</option>
        </select>
        {tool('B', '粗體', () => exec('bold'), 'rte-b')}
        {tool('I', '斜體', () => exec('italic'), 'rte-i')}
        {tool('U', '底線', () => exec('underline'), 'rte-u')}
        <label className={`rte-btn rte-color${source ? ' is-disabled' : ''}`} title="文字顏色">
          A
          <input
            type="color"
            aria-label="文字顏色"
            disabled={!!source}
            defaultValue="#ccff00"
            onChange={(e) => exec('foreColor', e.target.value)}
          />
        </label>
        <span className="rte-sep" />
        {tool('•', '項目清單', () => exec('insertUnorderedList'))}
        {tool('1.', '編號清單', () => exec('insertOrderedList'))}
        {tool('▦', '插入表格', () => insertHtml(TABLE_HTML))}
        {tool('—', '分隔線', () => exec('insertHorizontalRule'))}
        <span className="rte-sep" />
        {tool('🔗', '插入連結', addLink)}
        {tool('🖼', '插入圖片（也可直接貼上或拖曳圖片）', () => fileRef.current?.click())}
        {tool('▶', '插入影片連結（也可直接貼上 YouTube 連結）', addVideo)}
        {tool('⌫', '清除格式', () => exec('removeFormat'))}
        <span className="rte-spacer" />
        <button type="button" className={`rte-btn rte-code${source ? ' is-active' : ''}`} onClick={toggleSource} title="切換 HTML 原始碼">
          {'</>'} 原始碼
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void insertImages(files);
          }}
        />
      </div>
      {busy && <div className="rte-busy small">圖片壓縮中…</div>}
      {source ? (
        <textarea
          className="rte-source"
          aria-label={`${label} HTML 原始碼`}
          spellCheck={false}
          value={source.text}
          onChange={(e) => {
            const text = e.target.value;
            setSource({ ...source, text });
            const html = source.restore(text);
            lastEmitted.current = html;
            onChange(html);
          }}
        />
      ) : (
        <div
          ref={editorRef}
          className="rich-content rte-area"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          onInput={emit}
          onBlur={emit}
          onPaste={onPaste}
          onDrop={onDrop}
          data-placeholder="輸入內容；可直接貼上圖片或 YouTube 連結"
        />
      )}
      {source && <p className="muted small rte-hint">內嵌圖片以「#圖片-N」表示；切回編輯畫面時會還原，並自動移除不安全的語法（script、事件屬性等）。</p>}
    </div>
  );
}
