// 示範影片連結：只接受 http/https（與 events.video_url 的 check 一致），YouTube 連結轉成內嵌網址

export const VIDEO_URL_PATTERN = /^https?:\/\/\S+$/i;

export function isValidVideoUrl(url: string): boolean {
  return url === '' || VIDEO_URL_PATTERN.test(url);
}

/** YouTube 連結（watch、youtu.be、shorts、live、embed）轉成 youtube-nocookie 內嵌網址；其他連結回傳 null */
export function youTubeEmbedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(shorts|live|embed)\/([^/]+)/);
      id = m ? m[2] : null;
    }
  }
  if (!id || !/^[\w-]{6,}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
