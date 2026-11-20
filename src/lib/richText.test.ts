// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { byteSize, isAllowedEmbed, sanitizeHtml, toSourceView, videoHtml } from './richText';

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

describe('sanitizeHtml', () => {
  it('保留一般排版、表格、顏色、連結與內嵌圖片', () => {
    const html =
      '<h2>標題</h2><p><b>粗體</b><span style="color: rgb(255, 0, 0);">紅字</span></p>' +
      '<table><tbody><tr><td>A</td></tr></tbody></table>' +
      `<img src="${IMG}" alt="場地圖"><p><a href="https://example.com">連結</a></p>`;
    const out = sanitizeHtml(html);
    expect(out).toContain('<h2>標題</h2>');
    expect(out).toContain('style="color: rgb(255, 0, 0);"');
    expect(out).toContain('<td>A</td>');
    expect(out).toContain(`src="${IMG}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('移除 script、事件屬性、javascript 連結、style 標籤與表單', () => {
    const out = sanitizeHtml(
      '<p onclick="alert(1)">x</p><script>alert(1)</script><a href="javascript:alert(1)">y</a>' +
        '<style>body{display:none}</style><form action="https://evil"><input name="pw"></form><img src="x" onerror="alert(1)">',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|<style|<form|<input/i);
    // 非 data:image / https 的圖片整個移除
    expect(out).not.toContain('<img');
  });

  it('只允許 YouTube 與 Google 地圖的 iframe', () => {
    const yt = '<iframe src="https://www.youtube-nocookie.com/embed/abcdefg"></iframe>';
    expect(sanitizeHtml(yt)).toContain('src="https://www.youtube-nocookie.com/embed/abcdefg"');
    expect(sanitizeHtml(yt)).toContain('loading="lazy"');
    expect(sanitizeHtml('<iframe src="https://evil.example/x"></iframe>')).not.toContain('iframe');
    expect(sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>')).not.toContain('iframe');
    expect(isAllowedEmbed('https://www.google.com/maps/embed?pb=!1m18')).toBe(true);
    expect(isAllowedEmbed('https://www.youtube.com/embed/abc" onload="x')).toBe(false);
  });
});

describe('videoHtml', () => {
  it('YouTube 轉成內嵌播放器、其他連結轉成連結、非網址回傳 null', () => {
    expect(videoHtml('https://youtu.be/abcdefgh')).toContain('https://www.youtube-nocookie.com/embed/abcdefgh');
    expect(videoHtml(' https://drive.google.com/file/d/1/view ')).toContain('<a href="https://drive.google.com/file/d/1/view">');
    expect(videoHtml('javascript:alert(1)')).toBeNull();
    expect(videoHtml('影片')).toBeNull();
    // 產生的 HTML 經過過濾後仍保留播放器
    expect(sanitizeHtml(videoHtml('https://www.youtube.com/watch?v=abcdefgh')!)).toContain('<iframe');
  });
});

describe('toSourceView', () => {
  it('原始碼模式以佔位取代內嵌圖片，切回時還原', () => {
    const html = `<p>a</p><img src="${IMG}"><img src="${IMG}">`;
    const { source, restore } = toSourceView(html);
    expect(source).not.toContain('base64');
    expect(source).toContain('src="#圖片-1"');
    expect(source).toContain('src="#圖片-2"');
    expect(source).toContain('<p>a</p>\n');
    expect(restore(source).replace(/\n/g, '')).toBe(html);
  });
});

describe('byteSize', () => {
  it('以 UTF-8 計算', () => {
    expect(byteSize('abc')).toBe(3);
    expect(byteSize('中文')).toBe(6);
  });
});
