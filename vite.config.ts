import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 正式建置時在 index.html 加入 Content-Security-Policy 與 Referrer-Policy（meta 標籤）
 * - GitHub Pages 無法自訂回應標頭，只能用 meta；frame-ancestors 不支援 meta，因此無法防點擊劫持
 * - 開發伺服器會插入 inline script（React Fast Refresh），所以只在 build 套用
 * - 連線只允許本站與 Supabase；iframe 只允許 YouTube / Google 地圖（與 src/lib/richText.ts 的白名單一致）
 */
function securityMeta(supabaseUrl: string | undefined): Plugin {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    connect.push(origin, origin.replace(/^https:/, 'wss:'));
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // React 的 style 屬性與活動指南內容的 style 屬性需要 'unsafe-inline'
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // data: 為活動指南內嵌圖片與 CSS 的雜訊紋理；https: 為活動指南的外部圖片
    "img-src 'self' data: blob: https:",
    `connect-src ${connect.join(' ')}`,
    'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://www.google.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'security-meta',
    apply: 'build',
    // 放在 charset 之後，讓瀏覽器盡早套用
    transformIndexHtml: (html) =>
      html.replace(
        /(<meta charset="UTF-8" \/>)/i,
        `$1\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />` +
          '\n    <meta name="referrer" content="strict-origin-when-cross-origin" />',
      ),
  };
}

// base 使用相對路徑 + 前端採 HashRouter，部署到 GitHub Pages 任何 repo 名稱下都不需改設定
export default defineConfig(({ mode }) => {
  // 同時讀取 .env 檔與環境變數（GitHub Actions 以環境變數傳入）
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: './',
    plugins: [react(), securityMeta(env.VITE_SUPABASE_URL || undefined)],
  };
});
