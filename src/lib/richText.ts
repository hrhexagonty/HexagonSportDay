// 活動指南的 HTML 內容：過濾、圖片壓縮、影片內嵌
// 內容由管理員與委外廠商編輯、所有登入者閱讀，顯示與存檔前一律經過 sanitizeHtml，
// 避免被植入 script、事件屬性、表單或任意 iframe（可能竊取其他登入者的權杖）
import DOMPurify from 'dompurify';
import { youTubeEmbedUrl } from './video';

/** 每頁內容大小上限（資料庫上限為 6,000,000 bytes，前端保留緩衝） */
export const MAX_GUIDE_BYTES = 5 * 1024 * 1024;

/** 只允許內嵌 YouTube 影片與 Google 地圖 */
const EMBED_PATTERNS = [
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+(\?[^"'<>\s]*)?$/,
  /^https:\/\/www\.youtube\.com\/embed\/[\w-]+(\?[^"'<>\s]*)?$/,
  /^https:\/\/www\.google\.com\/maps\/embed\?[^"'<>\s]+$/,
];
export const isAllowedEmbed = (src: string) => EMBED_PATTERNS.some((p) => p.test(src));

const SANITIZE_CONFIG = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'loading', 'referrerpolicy', 'target'],
  // style 標籤會影響整個網站外觀；表單元素可能被用來釣魚
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'object', 'embed'],
  // id / name 可能與頁面元素衝突（DOM clobbering）
  FORBID_ATTR: ['id', 'name', 'srcset'],
};

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    switch (el.tagName) {
      case 'IFRAME': {
        const src = el.getAttribute('src') ?? '';
        if (!isAllowedEmbed(src)) {
          el.remove();
          return;
        }
        el.setAttribute('loading', 'lazy');
        el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        // 全螢幕由 allow 的 fullscreen 控制（同時設定 allowfullscreen 會出現瀏覽器警告）
        el.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
        el.removeAttribute('allowfullscreen');
        break;
      }
      case 'A':
        if (el.getAttribute('href')) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
        break;
      case 'IMG': {
        // 只保留內嵌圖片（data:image）或 https 圖片；其他（例如 Word 貼上的 file:// 被移除後）整個刪掉
        const src = el.getAttribute('src') ?? '';
        if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) && !/^https:\/\//i.test(src)) el.remove();
        else el.setAttribute('loading', 'lazy');
        break;
      }
    }
  });
}

/** 過濾 HTML：移除 script、事件屬性、表單、非白名單的 iframe 等 */
export function sanitizeHtml(html: string): string {
  ensureHooks();
  return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string;
}

/** HTML 的位元組數（UTF-8） */
export const byteSize = (s: string) => new TextEncoder().encode(s).length;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** 貼上的影片連結：YouTube 轉成內嵌播放器，其他 http(s) 連結轉成「觀看影片」連結；無效回傳 null */
export function videoHtml(url: string): string | null {
  const u = url.trim();
  if (!/^https?:\/\/\S+$/i.test(u)) return null;
  const embed = youTubeEmbedUrl(u);
  if (embed) return `<div class="rich-video"><iframe src="${escapeAttr(embed)}" title="影片"></iframe></div><p><br></p>`;
  return `<p><a href="${escapeAttr(u)}">▶ 觀看影片</a></p>`;
}

/**
 * 原始碼模式：內嵌圖片的 data URI 很長，換成「#圖片-N」佔位，切回編輯畫面時再還原
 * 回傳顯示用的原始碼與還原函式
 */
export function toSourceView(html: string): { source: string; restore: (source: string) => string } {
  const images: string[] = [];
  const source = html
    .replace(/src="(data:image\/[^"]+)"/g, (_, uri: string) => `src="#圖片-${images.push(uri)}"`)
    // 區塊結尾換行，方便閱讀
    .replace(/(<\/(p|h[1-6]|li|tr|thead|tbody|table|ul|ol|div|blockquote)>|<br>|<hr>)(?!\n)/g, '$1\n');
  const restore = (src: string) => src.replace(/src="#圖片-(\d+)"/g, (m, n: string) => (images[Number(n) - 1] ? `src="${images[Number(n) - 1]}"` : m));
  return { source, restore };
}

/**
 * 壓縮圖片：寬高不超過 maxSize，轉成 JPEG data URI（透明背景補白）
 * 會用到 canvas，只能在瀏覽器執行
 */
export async function compressImage(file: Blob, maxSize = 1600, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援圖片處理');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
