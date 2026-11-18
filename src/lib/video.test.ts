import { describe, expect, it } from 'vitest';
import { isValidVideoUrl, youTubeEmbedUrl } from './video';

describe('示範影片連結', () => {
  it('只接受 http/https 或空白', () => {
    expect(isValidVideoUrl('')).toBe(true);
    expect(isValidVideoUrl('https://drive.google.com/file/d/abc/view')).toBe(true);
    expect(isValidVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isValidVideoUrl('www.youtube.com/watch?v=abc')).toBe(false);
  });

  it('各種 YouTube 連結轉成內嵌網址，其他網站回傳 null', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe(embed);
    expect(youTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe(embed);
    expect(youTubeEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed);
    expect(youTubeEmbedUrl('https://m.youtube.com/live/dQw4w9WgXcQ')).toBe(embed);
    expect(youTubeEmbedUrl('https://drive.google.com/file/d/abc/view')).toBeNull();
    expect(youTubeEmbedUrl('not a url')).toBeNull();
  });
});
