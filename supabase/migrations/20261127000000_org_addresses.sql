-- =====================================================================
-- 公司地址：接駁車接送地址、樣衣寄送地址（「我的公司」頁填寫）
-- - 以公司為單位（一家公司一列）：該公司任一隊的窗口都能填寫、修改，同公司窗口共用同一份
-- - 樣衣寄送地址可選「同上」（sample_same = true），此時 sample_address 一律存 null，顯示時取接駁車接送地址
-- - 管理員可讀寫全部；委外廠商唯讀全部；其他帳號讀不到
-- - 報名截止後只有管理員能異動（與其他窗口填寫的資料相同）
-- 前端對應：src/lib/orgAddress.ts（長度上限、同上規則）、src/lib/types.ts 的 OrgAddress
-- =====================================================================

create table public.org_addresses (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  shuttle_address text check (char_length(shuttle_address) <= 200),
  sample_address text check (char_length(sample_address) <= 200),
  sample_same boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 去除前後空白、空字串存 null；選「同上」時清空樣衣寄送地址；記錄更新時間
create or replace function public.org_addresses_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception '不可變更地址所屬公司' using errcode = 'P0001';
  end if;
  new.shuttle_address := nullif(btrim(new.shuttle_address), '');
  new.sample_address := nullif(btrim(new.sample_address), '');
  if new.sample_same then
    new.sample_address := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger org_addresses_guard_open before insert or update or delete on public.org_addresses
  for each row execute function public.guard_registration_open();
create trigger org_addresses_before_write before insert or update on public.org_addresses
  for each row execute function public.org_addresses_before_write();

alter table public.org_addresses enable row level security;

create policy org_addresses_read on public.org_addresses for select
  using ((select public.is_admin()) or (select public.is_vendor()) or public.is_org_contact(org_id));
create policy org_addresses_insert on public.org_addresses for insert
  with check ((select public.is_admin()) or public.is_org_contact(org_id));
create policy org_addresses_update on public.org_addresses for update
  using ((select public.is_admin()) or public.is_org_contact(org_id))
  with check ((select public.is_admin()) or public.is_org_contact(org_id));

-- Supabase 預設會授權 anon / authenticated：未登入不可存取；不開放刪除（刪除公司時由 cascade 一併刪除）
revoke all on public.org_addresses from anon;
revoke delete, truncate, references, trigger on public.org_addresses from authenticated;
grant select, insert, update on public.org_addresses to authenticated;
