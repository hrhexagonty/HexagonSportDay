-- =====================================================================
-- 公司地址加入聯絡人：車長姓名 / 電話、樣衣收件人姓名 / 電話
-- - 欄位都可為 null（未填只在畫面標示「待填寫」，不阻擋任何操作）
-- - 姓名上限 50 字；電話只能包含數字、空格與 + - ( ) #，6–30 字
-- - 可見範圍沿用 org_addresses：該公司窗口與管理員可讀寫，委外廠商可讀（完整電話，供安排接駁與寄送聯絡；2026-11-27 使用者決定）
-- - 屬於個資：活動結束後 purge_private_data() 一併清除
-- 前端對應：src/lib/orgAddress.ts（長度、電話格式）、src/lib/types.ts 的 OrgAddress
-- =====================================================================

alter table public.org_addresses
  add column shuttle_leader_name text check (char_length(shuttle_leader_name) <= 50),
  add column shuttle_leader_phone text check (shuttle_leader_phone ~ '^[0-9+()# -]{6,30}$'),
  add column sample_recipient_name text check (char_length(sample_recipient_name) <= 50),
  add column sample_recipient_phone text check (sample_recipient_phone ~ '^[0-9+()# -]{6,30}$');

-- 去除前後空白、空字串存 null（check 在 BEFORE trigger 之後檢查，所以檢查的是整理後的值）
create or replace function public.org_addresses_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception '不可變更地址所屬公司' using errcode = 'P0001';
  end if;
  new.shuttle_address := nullif(btrim(new.shuttle_address), '');
  new.sample_address := nullif(btrim(new.sample_address), '');
  new.shuttle_leader_name := nullif(btrim(new.shuttle_leader_name), '');
  new.shuttle_leader_phone := nullif(btrim(new.shuttle_leader_phone), '');
  new.sample_recipient_name := nullif(btrim(new.sample_recipient_name), '');
  new.sample_recipient_phone := nullif(btrim(new.sample_recipient_phone), '');
  if new.sample_same then
    new.sample_address := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 活動結束後清除個資（僅管理員）：隊員個資，以及車長、樣衣收件人的姓名與電話；回傳清除的隊員筆數
create or replace function public.purge_private_data() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception '權限不足' using errcode = 'P0001';
  end if;
  delete from member_private where member_id is not null;
  get diagnostics v_count = row_count;
  update org_addresses
     set shuttle_leader_name = null, shuttle_leader_phone = null,
         sample_recipient_name = null, sample_recipient_phone = null
   where shuttle_leader_name is not null or shuttle_leader_phone is not null
      or sample_recipient_name is not null or sample_recipient_phone is not null;
  return v_count;
end $$;
