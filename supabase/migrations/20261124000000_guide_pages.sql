-- =====================================================================
-- 活動指南：場地配置、當天活動流程、隊服顏色對照、餐食內容、交通規劃
-- - 每頁一列，content 為 HTML（含壓縮後以 data URI 內嵌的圖片、YouTube 內嵌影片）
-- - 登入者才讀得到；管理員與委外廠商可編輯（後台「活動設定」頁籤）
-- - HTML 一律在前端顯示與存檔前以 DOMPurify 過濾（src/lib/richText.ts），資料庫只限制大小
-- 頁面清單與標題的前端對應：src/lib/guide.ts 的 GUIDE_PAGES，新增頁面時兩邊都要改
-- =====================================================================

create table public.guide_pages (
  id text primary key,
  content text not null default '' check (octet_length(content) <= 6000000),
  sort_order int not null default 0,
  updated_at timestamptz
);

insert into public.guide_pages (id, sort_order) values
  ('venue', 1),
  ('schedule', 2),
  ('uniforms', 3),
  ('meals', 4),
  ('transport', 5)
on conflict (id) do nothing;

-- 編輯時記錄更新時間；頁面代碼不可修改
create or replace function public.guide_pages_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id then
    raise exception '頁面代碼不可修改' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger guide_pages_before_update before update on public.guide_pages
  for each row execute function public.guide_pages_before_update();

alter table public.guide_pages enable row level security;

create policy guide_pages_read on public.guide_pages for select using (auth.uid() is not null);
create policy guide_pages_staff_update on public.guide_pages for update
  using ((select public.is_admin()) or (select public.is_vendor()))
  with check ((select public.is_admin()) or (select public.is_vendor()));

revoke all on public.guide_pages from anon;
grant select, update on public.guide_pages to authenticated;
