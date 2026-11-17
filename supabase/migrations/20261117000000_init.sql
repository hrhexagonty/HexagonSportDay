-- =====================================================================
-- 運動會報名平台：初始 schema
-- 資料階層：organizations（公司）⇄ team_orgs ⇄ teams（隊伍）→ members（隊員）→ event_entries（項目報名）
--   - 一般隊伍只屬於 1 家公司；聯隊（數家小公司合併）由管理員建立，可屬於多家公司
--   - 隊員公開資料（姓名、性別、所屬公司）存在 members：同隊各公司窗口都看得到（用於安排選手）
--   - 隊員個資（身分證、生日、手機…）存在 member_private：只有隊員所屬公司窗口與管理員看得到
-- 權限：org_admin 只能存取自己公司 / 參與隊伍；super_admin 可存取全部（RLS 實作）
-- 業務規則：關鍵限制同時寫在 DB trigger（防止繞過前端），前端 src/lib/rules.ts 做即時提示
-- =====================================================================

-- ---------------------------------------------------------------------
-- 證號驗證（身分證 / 居留證），check constraint 會用到，需最先建立
-- ---------------------------------------------------------------------

-- 身分證與新式居留證：1 碼英文 + 9 碼數字（第 2 碼 1/2 為國民、8/9 為居留證），驗證檢查碼
-- 舊式居留證：2 碼英文 + 8 碼數字，僅檢查格式
-- 前端對應實作：src/lib/idNumber.ts
create or replace function public.tw_id_valid(p text) returns boolean
language plpgsql immutable as $$
declare
  v_code int;
  v_sum int;
  i int;
begin
  if p is null then
    return false;
  end if;
  if p ~ '^[A-Z][A-D][0-9]{8}$' then
    return true;
  end if;
  if p !~ '^[A-Z][1289][0-9]{8}$' then
    return false;
  end if;
  -- 英文字母代碼：A=10 … Z=33、I=34、O=35
  v_code := strpos('ABCDEFGHJKLMNPQRSTUVXYWZIO', substr(p, 1, 1)) + 9;
  v_sum := v_code / 10 + (v_code % 10) * 9;
  for i in 2..9 loop
    v_sum := v_sum + substr(p, i, 1)::int * (10 - i);
  end loop;
  v_sum := v_sum + substr(p, 10, 1)::int;
  return v_sum % 10 = 0;
end $$;

-- 由證號第 2 碼推得性別（1、8 = 男；2、9 = 女；舊式居留證回傳 null）
create or replace function public.tw_id_gender(p text) returns text
language sql immutable as $$
  select case substr(p, 2, 1) when '1' then 'M' when '8' then 'M' when '2' then 'F' when '9' then 'F' end;
$$;

-- ---------------------------------------------------------------------
-- 資料表
-- ---------------------------------------------------------------------

-- 活動設定（固定只有一列，id = 1）
create table public.settings (
  id smallint primary key default 1 check (id = 1),
  event_title text not null default 'Hexagon 運動會',
  event_date date,
  venue text,
  registration_open boolean not null default true,
  registration_deadline timestamptz,
  total_team_target int not null default 24 check (total_team_target > 0),
  team_min_size int not null default 30 check (team_min_size >= 0),
  team_max_size int not null default 40 check (team_max_size >= team_min_size),
  max_events_per_member int not null default 2 check (max_events_per_member > 0)
);

-- 公司；team_quota 為該公司可「自行建立」的隊伍數（聯隊由管理員建立，不占額度）
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_quota int not null default 1 check (team_quota >= 0),
  invite_code text not null unique
    default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);

-- 使用者資料：對應 auth.users，記錄角色與所屬公司
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'org_admin' check (role in ('org_admin', 'super_admin')),
  org_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 隊伍
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  captain_name text,
  captain_phone text,
  created_at timestamptz not null default now()
);

-- 隊伍參與公司（1 家 = 一般隊伍；多家 = 聯隊）
create table public.team_orgs (
  team_id uuid not null references public.teams (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  primary key (team_id, org_id)
);
create index team_orgs_org_id_idx on public.team_orgs (org_id);

-- 隊員公開資料；(team_id, org_id) 必須存在於 team_orgs，確保隊員所屬公司有參與該隊
create table public.members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  gender text not null check (gender in ('M', 'F')),
  created_at timestamptz not null default now(),
  constraint members_team_org_fkey foreign key (team_id, org_id) references public.team_orgs (team_id, org_id)
);
create index members_team_id_idx on public.members (team_id);
create index members_org_id_idx on public.members (org_id);

-- 隊員個資：僅所屬公司窗口與管理員可讀寫；national_id 全活動唯一（同一人不可報兩隊）
create table public.member_private (
  member_id uuid primary key references public.members (id) on delete cascade,
  national_id text not null unique check (public.tw_id_valid(national_id)),
  birthday date not null check (birthday >= '1900-01-01'),
  phone text,
  shirt_size text check (shirt_size in ('XS', 'S', 'M', 'L', 'XL', '2XL', '3XL')),
  diet text not null check (diet in ('meat', 'ovo_lacto', 'vegan')),
  special_needs text,
  updated_at timestamptz not null default now()
);

-- 比賽項目：category = fun（趣味競賽）/ powerlifting（健力）
create table public.events (
  id text primary key,
  name text not null,
  category text not null check (category in ('fun', 'powerlifting')),
  description text not null default '',
  min_per_team int not null default 0 check (min_per_team >= 0),
  max_per_team int not null check (max_per_team >= min_per_team),
  min_female int not null default 0 check (min_female >= 0),
  sort_order int not null default 0
);

-- 項目報名；不存 team_id，隊伍一律經由 members 推得
create table public.event_entries (
  event_id text not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index event_entries_member_id_idx on public.event_entries (member_id);

-- ---------------------------------------------------------------------
-- 輔助函式（security definer：繞過 RLS 讀取，避免政策互相遞迴）
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.my_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

-- 目前使用者能否存取該隊伍（管理員，或自己公司有參與該隊）
create or replace function public.can_access_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from team_orgs where team_id = p_team_id and org_id = public.my_org_id());
$$;

create or replace function public.registration_is_open() returns boolean
language sql stable security definer set search_path = public as $$
  select registration_open and (registration_deadline is null or now() < registration_deadline)
  from settings where id = 1;
$$;

-- 所有公司名稱（聯隊需要顯示隊友所屬公司；不含邀請碼等欄位）
create or replace function public.org_names() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name from organizations o where auth.uid() is not null order by o.name;
$$;

-- ---------------------------------------------------------------------
-- 業務規則 trigger
-- ---------------------------------------------------------------------

-- 報名截止後，非管理員不可新增 / 修改 / 刪除隊伍、隊員、個資、報名
create or replace function public.guard_registration_open() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and not coalesce(public.registration_is_open(), false) then
    raise exception '報名已截止，無法異動資料' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger teams_guard_open before insert or update or delete on public.teams
  for each row execute function public.guard_registration_open();
create trigger members_guard_open before insert or update or delete on public.members
  for each row execute function public.guard_registration_open();
create trigger member_private_guard_open before insert or update or delete on public.member_private
  for each row execute function public.guard_registration_open();
create trigger event_entries_guard_open before insert or update or delete on public.event_entries
  for each row execute function public.guard_registration_open();

-- 隊員：禁止變更隊伍 / 公司、檢查隊伍人數上限
create or replace function public.members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max int;
  v_count int;
begin
  if tg_op = 'UPDATE' and (new.team_id <> old.team_id or new.org_id <> old.org_id) then
    raise exception '不可直接移動隊員到其他隊伍或公司，請刪除後重新新增' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('team:' || new.team_id::text));
    select team_max_size into v_max from settings where id = 1;
    select count(*) into v_count from members where team_id = new.team_id;
    if v_count >= v_max then
      raise exception '隊伍人數已達上限（% 人）', v_max using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger members_before_write before insert or update on public.members
  for each row execute function public.members_before_write();

-- 個資：證號轉大寫、生日不可為未來、性別需與證號一致
create or replace function public.member_private_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gender text;
begin
  new.national_id := upper(trim(new.national_id));
  new.updated_at := now();
  if new.birthday > current_date then
    raise exception '生日不可晚於今天' using errcode = 'P0001';
  end if;
  select gender into v_gender from members where id = new.member_id;
  if public.tw_id_gender(new.national_id) is not null and public.tw_id_gender(new.national_id) <> v_gender then
    raise exception '性別與身分證字號不符（%）', new.national_id using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger member_private_before_write before insert or update on public.member_private
  for each row execute function public.member_private_before_write();

-- 項目報名：每隊人數上限、每人項目數上限
create or replace function public.event_entries_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_team_id uuid;
  v_team_count int;
  v_member_limit int;
  v_member_count int;
begin
  if tg_op = 'UPDATE' then
    raise exception '報名紀錄不可修改，請刪除後重新報名' using errcode = 'P0001';
  end if;

  select * into v_event from events where id = new.event_id;
  select team_id into v_team_id from members where id = new.member_id;
  -- 與 members_before_write 共用同一把隊伍鎖，避免並行寫入超額
  perform pg_advisory_xact_lock(hashtext('team:' || v_team_id::text));

  select count(*) into v_team_count
    from event_entries e join members m on m.id = e.member_id
   where e.event_id = new.event_id and m.team_id = v_team_id;
  if v_team_count >= v_event.max_per_team then
    raise exception '「%」每隊最多 % 人', v_event.name, v_event.max_per_team using errcode = 'P0001';
  end if;

  select max_events_per_member into v_member_limit from settings where id = 1;
  select count(*) into v_member_count from event_entries where member_id = new.member_id;
  if v_member_count >= v_member_limit then
    raise exception '每人最多報名 % 個項目', v_member_limit using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger event_entries_before_write before insert or update on public.event_entries
  for each row execute function public.event_entries_before_write();

-- 刪除公司時，一併刪除「只屬於該公司」的隊伍（聯隊保留，其他公司隊員不受影響）
create or replace function public.organizations_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from teams t
   where exists (select 1 from team_orgs x where x.team_id = t.id and x.org_id = old.id)
     and not exists (select 1 from team_orgs y where y.team_id = t.id and y.org_id <> old.id);
  return old;
end $$;

create trigger organizations_before_delete before delete on public.organizations
  for each row execute function public.organizations_before_delete();

-- ---------------------------------------------------------------------
-- 帳號：註冊時自動建立 profile；以邀請碼綁定公司
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.join_org(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = 'P0001';
  end if;
  select * into v_org from organizations where invite_code = upper(trim(p_code));
  if not found then
    raise exception '邀請碼無效' using errcode = 'P0001';
  end if;
  update profiles set org_id = v_org.id where id = auth.uid() and org_id is null;
  if not found then
    raise exception '此帳號已綁定公司' using errcode = 'P0001';
  end if;
  return v_org.name;
end $$;

-- ---------------------------------------------------------------------
-- 隊伍 RPC：建立隊伍與參與公司需在同一個交易內完成
-- ---------------------------------------------------------------------

-- 建立隊伍：公司窗口只能為自己公司建立（受額度限制）；管理員可指定多家公司建立聯隊
create or replace function public.create_team(
  p_name text,
  p_captain_name text,
  p_captain_phone text,
  p_org_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_quota int;
  v_count int;
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_org_ids), 0) = 0 then
    raise exception '至少需指定一家公司' using errcode = 'P0001';
  end if;
  if not public.is_admin()
     and (cardinality(p_org_ids) <> 1 or p_org_ids[1] is distinct from public.my_org_id()) then
    raise exception '公司窗口只能建立自己公司的隊伍；聯隊請洽管理員建立' using errcode = 'P0001';
  end if;

  -- 單一公司的隊伍受額度限制（聯隊不占額度）
  if cardinality(p_org_ids) = 1 then
    perform pg_advisory_xact_lock(hashtext('quota:' || p_org_ids[1]::text));
    select team_quota into v_quota from organizations where id = p_org_ids[1];
    select count(*) into v_count
      from teams t
     where exists (select 1 from team_orgs x where x.team_id = t.id and x.org_id = p_org_ids[1])
       and not exists (select 1 from team_orgs y where y.team_id = t.id and y.org_id <> p_org_ids[1]);
    if v_count >= coalesce(v_quota, 0) then
      raise exception '已達本公司可自組隊伍數上限（% 隊）', coalesce(v_quota, 0) using errcode = 'P0001';
    end if;
  end if;

  insert into teams (name, captain_name, captain_phone)
  values (trim(p_name), p_captain_name, p_captain_phone)
  returning id into v_team_id;
  insert into team_orgs (team_id, org_id) select v_team_id, unnest(p_org_ids);
  return v_team_id;
end $$;

-- 調整聯隊參與公司（僅管理員）；移除的公司若仍有隊員則拒絕
create or replace function public.set_team_orgs(p_team_id uuid, p_org_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '權限不足' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_org_ids), 0) = 0 then
    raise exception '至少需指定一家公司' using errcode = 'P0001';
  end if;
  if exists (select 1 from members where team_id = p_team_id and org_id <> all (p_org_ids)) then
    raise exception '要移除的公司在此隊仍有隊員，請先刪除其隊員' using errcode = 'P0001';
  end if;
  delete from team_orgs where team_id = p_team_id and org_id <> all (p_org_ids);
  insert into team_orgs (team_id, org_id) select p_team_id, unnest(p_org_ids) on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- 隊員 RPC：公開資料與個資需在同一個交易內寫入
-- security invoker：以呼叫者身分執行，RLS 與 trigger 照常生效
-- ---------------------------------------------------------------------

create or replace function public.add_members(p_team_id uuid, p_org_id uuid, p_rows jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_id uuid;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into members (team_id, org_id, name, gender)
    values (p_team_id, p_org_id, trim(r ->> 'name'), r ->> 'gender')
    returning id into v_id;
    begin
      insert into member_private (member_id, national_id, birthday, phone, shirt_size, diet, special_needs)
      values (
        v_id,
        r ->> 'national_id',
        (r ->> 'birthday')::date,
        nullif(r ->> 'phone', ''),
        nullif(r ->> 'shirt_size', ''),
        r ->> 'diet',
        nullif(r ->> 'special_needs', '')
      );
    exception when unique_violation then
      raise exception '身分證字號 % 已報名，同一人不可重複報名', upper(r ->> 'national_id') using errcode = 'P0001';
    end;
  end loop;
end $$;

create or replace function public.update_member(p_member_id uuid, p_data jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update members set name = trim(p_data ->> 'name'), gender = p_data ->> 'gender' where id = p_member_id;
  if not found then
    raise exception '找不到隊員或無權限修改' using errcode = 'P0001';
  end if;
  begin
    insert into member_private (member_id, national_id, birthday, phone, shirt_size, diet, special_needs)
    values (
      p_member_id,
      p_data ->> 'national_id',
      (p_data ->> 'birthday')::date,
      nullif(p_data ->> 'phone', ''),
      nullif(p_data ->> 'shirt_size', ''),
      p_data ->> 'diet',
      nullif(p_data ->> 'special_needs', '')
    )
    on conflict (member_id) do update set
      national_id = excluded.national_id,
      birthday = excluded.birthday,
      phone = excluded.phone,
      shirt_size = excluded.shirt_size,
      diet = excluded.diet,
      special_needs = excluded.special_needs;
  exception when unique_violation then
    raise exception '身分證字號 % 已報名，同一人不可重複報名', upper(p_data ->> 'national_id') using errcode = 'P0001';
  end;
end $$;

-- 活動結束後清除所有隊員個資（僅管理員）；回傳刪除筆數
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
  return v_count;
end $$;

revoke execute on function
  public.join_org(text),
  public.create_team(text, text, text, uuid[]),
  public.set_team_orgs(uuid, uuid[]),
  public.add_members(uuid, uuid, jsonb),
  public.update_member(uuid, jsonb),
  public.purge_private_data(),
  public.org_names()
from public, anon;
grant execute on function
  public.join_org(text),
  public.create_team(text, text, text, uuid[]),
  public.set_team_orgs(uuid, uuid[]),
  public.add_members(uuid, uuid, jsonb),
  public.update_member(uuid, jsonb),
  public.purge_private_data(),
  public.org_names()
to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.settings enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_orgs enable row level security;
alter table public.members enable row level security;
alter table public.member_private enable row level security;
alter table public.events enable row level security;
alter table public.event_entries enable row level security;

-- 活動設定與比賽項目：公開可讀，僅管理員可改
create policy settings_read on public.settings for select using (true);
create policy settings_admin_update on public.settings for update
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy events_read on public.events for select using (true);
create policy events_admin_write on public.events for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- profiles：本人可讀；角色與公司只能由管理員或 join_org() 修改
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or (select public.is_admin()));
create policy profiles_admin_update on public.profiles for update
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- organizations：窗口只讀得到自己公司（含邀請碼）；其他公司名稱透過 org_names() 取得
create policy organizations_read on public.organizations for select
  using (id = (select public.my_org_id()) or (select public.is_admin()));
create policy organizations_admin_write on public.organizations for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- teams：參與公司可讀、可改隊名與隊長；新增只能透過 create_team()
-- 刪除：管理員，或「只屬於自己公司」的隊伍（聯隊只有管理員能刪）
create policy teams_read on public.teams for select using (public.can_access_team(id));
create policy teams_update on public.teams for update
  using (public.can_access_team(id)) with check (public.can_access_team(id));
create policy teams_delete on public.teams for delete
  using (
    (select public.is_admin())
    or (
      public.can_access_team(id)
      and not exists (
        select 1 from public.team_orgs x where x.team_id = teams.id and x.org_id <> (select public.my_org_id())
      )
    )
  );

-- team_orgs：參與公司可讀（得知聯隊有哪些公司）；異動只能透過 RPC
create policy team_orgs_read on public.team_orgs for select using (public.can_access_team(team_id));

-- members（公開資料）：同隊各公司可讀；只能新增 / 修改 / 刪除自己公司的隊員
create policy members_read on public.members for select
  using (org_id = (select public.my_org_id()) or public.can_access_team(team_id));
create policy members_write on public.members for insert
  with check (
    (select public.is_admin())
    or (org_id = (select public.my_org_id()) and public.can_access_team(team_id))
  );
create policy members_update on public.members for update
  using ((select public.is_admin()) or org_id = (select public.my_org_id()))
  with check ((select public.is_admin()) or org_id = (select public.my_org_id()));
create policy members_delete on public.members for delete
  using ((select public.is_admin()) or org_id = (select public.my_org_id()));

-- member_private（個資）：只有隊員所屬公司與管理員
create policy member_private_rw on public.member_private for all
  using (
    (select public.is_admin())
    or exists (select 1 from public.members m where m.id = member_id and m.org_id = (select public.my_org_id()))
  )
  with check (
    (select public.is_admin())
    or exists (select 1 from public.members m where m.id = member_id and m.org_id = (select public.my_org_id()))
  );

-- event_entries：同隊各公司都可安排選手（含聯隊其他公司的隊員）
create policy event_entries_rw on public.event_entries for all
  using (exists (select 1 from public.members m where m.id = member_id and public.can_access_team(m.team_id)))
  with check (exists (select 1 from public.members m where m.id = member_id and public.can_access_team(m.team_id)));

-- ---------------------------------------------------------------------
-- 權限（明確授權，避免專案預設不對外暴露資料表）
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.settings, public.events to anon, authenticated;
grant update on public.settings to authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.organizations to authenticated;
grant select, update, delete on public.teams to authenticated;
grant select on public.team_orgs to authenticated;
grant select, insert, update, delete on public.members, public.member_private, public.event_entries to authenticated;

-- ---------------------------------------------------------------------
-- 初始資料（趣味競賽暫訂每隊 10 人、不限性別比例；可於管理後台調整）
-- 注意：src/lib/api/demoSeed.ts 的 DEMO_EVENTS 為同一份資料，修改時需同步
-- ---------------------------------------------------------------------

insert into public.settings (id) values (1) on conflict (id) do nothing;

insert into public.events (id, name, category, description, min_per_team, max_per_team, min_female, sort_order) values
  ('fun1', '同心鼓顛球', 'fun', '全隊拉繩控制同心鼓，合力讓球在鼓面上連續彈跳。', 10, 10, 0, 1),
  ('fun2', '四關障礙接力', 'fun', '隊員分棒接力，依序完成四個障礙關卡。', 10, 10, 0, 2),
  ('fun3', '嗨ROX競賽', 'fun', '結合跑步與多項體能關卡的團隊挑戰。', 10, 10, 0, 3),
  ('fun4', '毛毛蟲大隊接力', 'fun', '隊員組成毛毛蟲隊形同步前進，完成大隊接力。', 10, 10, 0, 4),
  ('powerlifting', '健力比賽', 'powerlifting', '深蹲、臥推、硬舉三項，每隊 10 人參賽。', 10, 10, 4, 5)
on conflict (id) do nothing;
