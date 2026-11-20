-- =====================================================================
-- 1. 用餐習慣新增「葷食不吃豬」（meat_no_pork）
-- 2. 委外廠商（vendor）：同樣以「邀請碼 → 註冊 → 登入」取得帳號
--    - 管理員在後台建立廠商邀請碼（vendors：廠商名稱、邀請碼、可註冊帳號數），帳號綁定記錄在 vendor_contacts
--    - 可檢視：填報總覽、各隊隊員名單與項目報名、隊伍配置、健力報名（全部唯讀）
--    - 可編輯：活動設定與比賽項目（settings、events）
--    - 隊員證號、生日、手機與隊長電話一律隱碼：廠商不能直接讀 member_private 與 teams，
--      改由 vendor_member_private()、vendor_teams() 回傳隱碼後的資料
--    - 看不到：公司完整資料、隊伍邀請碼、窗口名單（窗口與邀請碼、匯出名單分頁）
--    - 委外廠商帳號不能同時擔任隊伍窗口，反之亦然
-- 3. 隊伍邀請碼與廠商邀請碼共用前台的輸入框，兩者不可重複；lookup_invite() 一次查出是哪一種
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 用餐習慣
-- ---------------------------------------------------------------------
alter table public.member_private drop constraint member_private_diet_check;
alter table public.member_private add constraint member_private_diet_check
  check (diet is null or diet in ('meat', 'meat_no_pork', 'ovo_lacto', 'vegan'));

-- ---------------------------------------------------------------------
-- 2. 資料表
-- ---------------------------------------------------------------------

-- 委外廠商與其邀請碼（僅管理員可見）
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (trim(name) <> ''),
  invite_code text not null unique default public.random_invite_code()
    check (invite_code ~ '^[A-Z0-9]{6,20}$'),
  -- 可用此邀請碼註冊的帳號數
  account_limit int not null default 3 check (account_limit >= 0),
  created_at timestamptz not null default now()
);

-- 委外廠商帳號；一個帳號只屬於一家廠商
create table public.vendor_contacts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index vendor_contacts_vendor_id_idx on public.vendor_contacts (vendor_id);

-- 隊伍邀請碼與廠商邀請碼不可重複（前台以同一個輸入框查詢）
create or replace function public.invite_code_unique_across() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_table_name = 'team_invites' and exists (select 1 from vendors where invite_code = new.invite_code))
     or (tg_table_name = 'vendors' and exists (select 1 from team_invites where invite_code = new.invite_code)) then
    raise exception '邀請碼已被使用，請換一組' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger team_invites_code_unique before insert or update of invite_code on public.team_invites
  for each row execute function public.invite_code_unique_across();
create trigger vendors_code_unique before insert or update of invite_code on public.vendors
  for each row execute function public.invite_code_unique_across();

-- ---------------------------------------------------------------------
-- 權限輔助與隱碼
-- ---------------------------------------------------------------------

-- 目前使用者是否為委外廠商
create or replace function public.is_vendor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_contacts where user_id = auth.uid());
$$;

-- 隱藏中間字元：保留前 p_head、後 p_tail 個字；太短則全部隱藏
-- 前端對應實作：src/lib/mask.ts
create or replace function public.mask_middle(p text, p_head int, p_tail int) returns text
language sql immutable as $$
  select case
    when p is null then null
    when length(p) <= p_head + p_tail then repeat('*', length(p))
    else left(p, p_head) || repeat('*', length(p) - p_head - p_tail) || right(p, p_tail)
  end;
$$;

-- ---------------------------------------------------------------------
-- 帳號綁定
-- ---------------------------------------------------------------------

-- 以邀請碼將帳號綁定為委外廠商，回傳廠商名稱（內部使用，不開放前端直接呼叫）
create or replace function public.bind_vendor(p_user_id uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_vendor vendors%rowtype;
  v_count int;
begin
  select * into v_vendor from vendors where invite_code = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception '邀請碼錯誤，請確認活動小組提供的邀請碼' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where id = p_user_id and role = 'super_admin') then
    raise exception '管理員帳號不需綁定廠商' using errcode = 'P0001';
  end if;
  if exists (select 1 from team_contacts where user_id = p_user_id) then
    raise exception '此帳號已是隊伍窗口，委外廠商請改用其他信箱註冊' using errcode = 'P0001';
  end if;
  -- 同一家廠商的綁定排隊執行，避免並行註冊超過帳號數
  perform pg_advisory_xact_lock(hashtext('vendor:' || v_vendor.id::text));
  if exists (select 1 from vendor_contacts where user_id = p_user_id) then
    raise exception '此帳號已是委外廠商帳號' using errcode = 'P0001';
  end if;
  select count(*) into v_count from vendor_contacts where vendor_id = v_vendor.id;
  if v_count >= v_vendor.account_limit then
    raise exception '此廠商帳號名額已滿（% 個），請洽活動小組', v_vendor.account_limit using errcode = 'P0001';
  end if;
  insert into vendor_contacts (user_id, vendor_id) values (p_user_id, v_vendor.id);
  return v_vendor.name;
end $$;

-- 隊伍窗口綁定：與 20261118 相同，另外擋下委外廠商帳號
create or replace function public.bind_team_contact(p_user_id uuid, p_team_id uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_inv team_invites%rowtype;
  v_limit int;
  v_count int;
begin
  select * into v_inv from team_invites where invite_code = upper(trim(coalesce(p_code, '')));
  if not found or v_inv.team_id is distinct from p_team_id then
    raise exception '邀請碼錯誤，或與所選隊伍不符' using errcode = 'P0001';
  end if;
  if exists (select 1 from vendor_contacts where user_id = p_user_id) then
    raise exception '委外廠商帳號不能擔任隊伍窗口，請改用其他信箱註冊' using errcode = 'P0001';
  end if;
  -- 同一隊的綁定排隊執行，避免並行註冊超過窗口人數
  perform pg_advisory_xact_lock(hashtext('contacts:' || p_team_id::text));
  if exists (select 1 from team_contacts where user_id = p_user_id and team_id = p_team_id) then
    raise exception '此帳號已是該隊窗口' using errcode = 'P0001';
  end if;
  select contact_limit into v_limit from teams where id = p_team_id;
  select count(*) into v_count from team_contacts where team_id = p_team_id;
  if v_count >= v_limit then
    raise exception '此隊窗口名額已滿（% 人），請洽活動小組', v_limit using errcode = 'P0001';
  end if;
  insert into team_contacts (user_id, team_id, org_id) values (p_user_id, p_team_id, v_inv.org_id);
  return v_inv.org_id;
end $$;

-- 註冊時建立 profile；user metadata 帶有 vendor_code 時綁定為委外廠商，帶有 team_id + invite_code 時綁定隊伍
-- 綁定失敗會讓整筆註冊失敗，避免產生無身分的帳號
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_team text;
  v_code text;
  v_vendor text;
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  v_vendor := nullif(new.raw_user_meta_data ->> 'vendor_code', '');
  if v_vendor is not null then
    perform public.bind_vendor(new.id, v_vendor);
    return new;
  end if;
  v_team := nullif(new.raw_user_meta_data ->> 'team_id', '');
  v_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');
  if v_team is not null and v_code is not null then
    perform public.bind_team_contact(new.id, v_team::uuid, v_code);
  end if;
  return new;
end $$;

-- 已註冊的帳號（例如被解除後重新綁定）以廠商邀請碼綁定，回傳廠商名稱
create or replace function public.join_vendor(p_code text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = 'P0001';
  end if;
  return public.bind_vendor(auth.uid(), p_code);
end $$;

-- 以邀請碼查出身分（未登入可呼叫）：kind = 'team'（隊伍 × 公司）或 'vendor'（委外廠商）
create or replace function public.lookup_invite(p_code text)
returns table (
  kind text,
  team_id uuid,
  team_name text,
  org_id uuid,
  org_name text,
  vendor_name text,
  is_full boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_inv team_invites%rowtype;
  v_vendor vendors%rowtype;
begin
  select * into v_inv from team_invites where invite_code = v_code;
  if found then
    return query
      select 'team'::text, t.id, t.name, o.id, o.name, null::text,
             (select count(*) from team_contacts c where c.team_id = t.id) >= t.contact_limit
        from teams t, organizations o
       where t.id = v_inv.team_id and o.id = v_inv.org_id;
    return;
  end if;
  select * into v_vendor from vendors where invite_code = v_code;
  if found then
    return query
      select 'vendor'::text, null::uuid, null::text, null::uuid, null::text, v_vendor.name,
             (select count(*) from vendor_contacts c where c.vendor_id = v_vendor.id) >= v_vendor.account_limit;
    return;
  end if;
  raise exception '邀請碼錯誤，請確認活動小組提供的邀請碼' using errcode = 'P0001';
end $$;

-- 目前帳號所屬的委外廠商名稱（不是廠商則為 null）
create or replace function public.my_vendor() returns text
language sql stable security definer set search_path = public as $$
  select v.name from vendor_contacts c join vendors v on v.id = c.vendor_id where c.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 委外廠商的唯讀資料（隱碼）
-- ---------------------------------------------------------------------

-- 隊伍（含參與公司）；隊長電話隱碼。非委外廠商呼叫回傳空結果
create or replace function public.vendor_teams(p_team_id uuid default null)
returns table (
  id uuid,
  name text,
  captain_name text,
  captain_phone text,
  contact_limit int,
  org_ids uuid[],
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.captain_name, public.mask_middle(t.captain_phone, 4, 3), t.contact_limit,
         coalesce((select array_agg(x.org_id order by x.org_id) from team_orgs x where x.team_id = t.id), '{}'),
         t.created_at
    from teams t
   where (p_team_id is null or t.id = p_team_id)
     and public.is_vendor()
   order by t.created_at, t.id;
$$;

-- 隊員個資：證號（A12****789）、生日（只留年份）、手機（0912***678）隱碼，尺寸、用餐、特殊需求照常顯示
-- 非委外廠商呼叫回傳空結果
create or replace function public.vendor_member_private(p_team_id uuid default null)
returns table (
  member_id uuid,
  national_id text,
  birthday text,
  phone text,
  shirt_size text,
  diet text,
  special_needs text
)
language sql stable security definer set search_path = public as $$
  select m.id,
         public.mask_middle(p.national_id, 3, 3),
         to_char(p.birthday, 'YYYY') || '-**-**',
         public.mask_middle(p.phone, 4, 3),
         p.shirt_size,
         p.diet,
         p.special_needs
    from members m join member_private p on p.member_id = m.id
   where (p_team_id is null or m.team_id = p_team_id)
     and public.is_vendor()
   order by m.id;
$$;

-- 項目的代碼、類別、排序只有管理員能改（委外廠商可改名稱、人數、規則、影片）
create or replace function public.events_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin()
     and (new.id is distinct from old.id or new.category is distinct from old.category
          or new.sort_order is distinct from old.sort_order) then
    raise exception '項目代碼、類別與排序只能由活動小組修改' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger events_before_update before update on public.events
  for each row execute function public.events_before_update();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.vendors enable row level security;
alter table public.vendor_contacts enable row level security;

-- vendors：只有管理員可讀寫
create policy vendors_admin on public.vendors for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- vendor_contacts：本人看得到自己的綁定；管理員看全部並可解除
create policy vendor_contacts_read on public.vendor_contacts for select
  using (user_id = auth.uid() or (select public.is_admin()));
create policy vendor_contacts_admin_delete on public.vendor_contacts for delete using ((select public.is_admin()));

-- 委外廠商：唯讀隊員公開資料（姓名、性別、所屬公司）、項目報名、健力隊伍
-- （只加 select 政策；新增 / 修改 / 刪除仍只有窗口與管理員的政策）
create policy members_vendor_read on public.members for select using ((select public.is_vendor()));
create policy event_entries_vendor_read on public.event_entries for select using ((select public.is_vendor()));
create policy org_squads_vendor_read on public.org_squads for select using ((select public.is_vendor()));
create policy org_squad_members_vendor_read on public.org_squad_members for select using ((select public.is_vendor()));

-- 委外廠商：可編輯活動設定與比賽項目
create policy settings_vendor_update on public.settings for update
  using ((select public.is_vendor())) with check ((select public.is_vendor()));
create policy events_vendor_update on public.events for update
  using ((select public.is_vendor())) with check ((select public.is_vendor()));

-- ---------------------------------------------------------------------
-- 權限
-- ---------------------------------------------------------------------
revoke all on public.vendors, public.vendor_contacts from anon;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, delete on public.vendor_contacts to authenticated;

revoke execute on function public.bind_vendor(uuid, text) from public, anon, authenticated;
revoke execute on function
  public.join_vendor(text),
  public.my_vendor(),
  public.vendor_teams(uuid),
  public.vendor_member_private(uuid)
from public, anon;
grant execute on function
  public.join_vendor(text),
  public.my_vendor(),
  public.vendor_teams(uuid),
  public.vendor_member_private(uuid)
to authenticated;
revoke execute on function public.lookup_invite(text) from public;
grant execute on function public.lookup_invite(text) to anon, authenticated;
