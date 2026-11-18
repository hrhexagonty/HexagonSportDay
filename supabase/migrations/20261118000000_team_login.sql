-- =====================================================================
-- 改為「以隊伍登入」
-- - 隊伍與公司一律由管理員建立；公司窗口不再自組隊伍（移除自組額度）
-- - 每支隊伍 × 每家參與公司各有一組邀請碼（team_invites）：窗口輸入哪組碼就歸屬哪家公司，
--   聯隊中各公司仍只看得到自己公司隊員的個資
-- - 窗口帳號與隊伍為多對多（team_contacts），一個帳號可加入多隊；每隊可綁定的窗口數由 teams.contact_limit 限制
-- - 前台註冊：選隊伍 → 設定信箱密碼 → 輸入邀請碼；註冊時由 handle_new_user 依 user metadata 一併綁定
-- 既有資料自動轉換：原本綁定公司的窗口，改為該公司所有參與隊伍的窗口
-- =====================================================================

-- ---------------------------------------------------------------------
-- 資料表
-- ---------------------------------------------------------------------

create or replace function public.random_invite_code() returns text
language sql volatile as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

-- 每隊可綁定的窗口帳號數
alter table public.teams add column contact_limit int not null default 2 check (contact_limit >= 0);

-- 隊伍 × 公司邀請碼（僅管理員可見）；team_orgs 新增時自動產生，移除時一併刪除
create table public.team_invites (
  team_id uuid not null,
  org_id uuid not null,
  invite_code text not null unique default public.random_invite_code()
    check (invite_code ~ '^[A-Z0-9]{6,20}$'),
  primary key (team_id, org_id),
  foreign key (team_id, org_id) references public.team_orgs (team_id, org_id) on delete cascade
);

insert into public.team_invites (team_id, org_id) select team_id, org_id from public.team_orgs;

create or replace function public.team_orgs_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_invites (team_id, org_id) values (new.team_id, new.org_id) on conflict do nothing;
  return new;
end $$;

create trigger team_orgs_after_insert after insert on public.team_orgs
  for each row execute function public.team_orgs_after_insert();

-- 窗口帳號與隊伍的綁定；org_id = 以哪家公司的邀請碼加入（決定可編輯 / 檢視個資的範圍）
create table public.team_contacts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null,
  org_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id),
  foreign key (team_id, org_id) references public.team_orgs (team_id, org_id) on delete cascade
);
create index team_contacts_team_org_idx on public.team_contacts (team_id, org_id);

-- 既有資料轉換：綁定公司的窗口 → 該公司所有參與隊伍的窗口
insert into public.team_contacts (user_id, team_id, org_id)
select p.id, x.team_id, x.org_id
  from public.profiles p
  join public.team_orgs x on x.org_id = p.org_id
 where p.role = 'org_admin'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 移除公司層級的登入與自組額度
-- ---------------------------------------------------------------------

-- 先移除引用 my_org_id() 的政策，稍後以隊伍綁定重建
drop policy organizations_read on public.organizations;
drop policy teams_delete on public.teams;
drop policy members_read on public.members;
drop policy members_write on public.members;
drop policy members_update on public.members;
drop policy members_delete on public.members;
drop policy member_private_rw on public.member_private;

drop function public.join_org(text);
drop function public.my_org_id();

-- 隊伍改由管理員獨立建立：刪除公司時不再連帶刪除隊伍（隊伍保留為未分配）
drop trigger organizations_before_delete on public.organizations;
drop function public.organizations_before_delete();

alter table public.organizations drop column team_quota, drop column invite_code;
alter table public.profiles drop column org_id;

-- ---------------------------------------------------------------------
-- 權限輔助函式
-- ---------------------------------------------------------------------

-- 目前使用者能否存取該隊伍（管理員，或該隊窗口）
create or replace function public.can_access_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from team_contacts where user_id = auth.uid() and team_id = p_team_id);
$$;

-- 目前使用者是否為「該隊 × 該公司」的窗口（可編輯該公司隊員、檢視其個資）
create or replace function public.is_team_org_contact(p_team_id uuid, p_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_contacts where user_id = auth.uid() and team_id = p_team_id and org_id = p_org_id
  );
$$;

-- ---------------------------------------------------------------------
-- 隊伍：只有管理員能建立 / 刪除 / 改隊名與窗口人數；窗口可改隊長資料
-- ---------------------------------------------------------------------

create or replace function public.create_team(
  p_name text,
  p_captain_name text,
  p_captain_phone text,
  p_org_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
begin
  if not public.is_admin() then
    raise exception '隊伍由活動小組建立，請洽管理員' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '請輸入隊名' using errcode = 'P0001';
  end if;
  insert into teams (name, captain_name, captain_phone)
  values (trim(p_name), p_captain_name, p_captain_phone)
  returning id into v_team_id;
  if coalesce(cardinality(p_org_ids), 0) > 0 then
    insert into team_orgs (team_id, org_id) select v_team_id, unnest(p_org_ids);
  end if;
  return v_team_id;
end $$;

-- 調整參與公司（僅管理員；可設為空 = 未分配）。移除的公司若仍有隊員則拒絕；其邀請碼與窗口綁定一併移除
create or replace function public.set_team_orgs(p_team_id uuid, p_org_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '權限不足' using errcode = 'P0001';
  end if;
  p_org_ids := coalesce(p_org_ids, '{}');
  if exists (select 1 from members where team_id = p_team_id and org_id <> all (p_org_ids)) then
    raise exception '要移除的公司在此隊仍有隊員，請先刪除其隊員' using errcode = 'P0001';
  end if;
  delete from team_orgs where team_id = p_team_id and org_id <> all (p_org_ids);
  insert into team_orgs (team_id, org_id) select p_team_id, unnest(p_org_ids) on conflict do nothing;
end $$;

create or replace function public.teams_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin()
     and (new.name is distinct from old.name or new.contact_limit is distinct from old.contact_limit) then
    raise exception '隊名與窗口人數只能由活動小組修改' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger teams_before_update before update on public.teams
  for each row execute function public.teams_before_update();

-- ---------------------------------------------------------------------
-- 窗口綁定
-- ---------------------------------------------------------------------

-- 以邀請碼將帳號綁定為隊伍窗口，回傳公司 id（內部使用，不開放前端直接呼叫）
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

-- 註冊前檢查（未登入可呼叫）：邀請碼與隊伍相符且尚有名額時，回傳公司名稱
create or replace function public.check_team_invite(p_team_id uuid, p_code text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv team_invites%rowtype;
begin
  select * into v_inv from team_invites where invite_code = upper(trim(coalesce(p_code, '')));
  if not found or v_inv.team_id is distinct from p_team_id then
    raise exception '邀請碼錯誤，或與所選隊伍不符' using errcode = 'P0001';
  end if;
  if (select count(*) from team_contacts where team_id = p_team_id)
     >= (select contact_limit from teams where id = p_team_id) then
    raise exception '此隊窗口名額已滿，請洽活動小組' using errcode = 'P0001';
  end if;
  return (select name from organizations where id = v_inv.org_id);
end $$;

-- 已登入帳號加入（其他）隊伍，回傳隊名
create or replace function public.join_team(p_team_id uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '請先登入' using errcode = 'P0001';
  end if;
  if public.is_admin() then
    raise exception '管理員帳號不需綁定隊伍' using errcode = 'P0001';
  end if;
  perform public.bind_team_contact(auth.uid(), p_team_id, p_code);
  return (select name from teams where id = p_team_id);
end $$;

-- 前台登入頁的隊伍下拉選單（未登入可呼叫）：只列出已分配公司的隊伍，不含邀請碼
create or replace function public.team_options() returns table (id uuid, name text, is_full boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, (select count(*) from team_contacts c where c.team_id = t.id) >= t.contact_limit
    from teams t
   where exists (select 1 from team_orgs x where x.team_id = t.id)
   order by t.name;
$$;

-- 目前帳號綁定的隊伍與所屬公司
create or replace function public.my_teams() returns table (team_id uuid, team_name text, org_id uuid, org_name text)
language sql stable security definer set search_path = public as $$
  select c.team_id, t.name, c.org_id, o.name
    from team_contacts c
    join teams t on t.id = c.team_id
    join organizations o on o.id = c.org_id
   where c.user_id = auth.uid()
   order by t.name;
$$;

-- 註冊時建立 profile；user metadata 帶有 team_id + invite_code 時一併綁定隊伍
-- 綁定失敗（邀請碼錯誤、名額已滿）會讓整筆註冊失敗，避免產生無隊伍的帳號
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_team text;
  v_code text;
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  v_team := nullif(new.raw_user_meta_data ->> 'team_id', '');
  v_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');
  if v_team is not null and v_code is not null then
    perform public.bind_team_contact(new.id, v_team::uuid, v_code);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.team_invites enable row level security;
alter table public.team_contacts enable row level security;

-- organizations：只有管理員讀得到完整資料；窗口一律用 org_names() 取得名稱
create policy organizations_read on public.organizations for select using ((select public.is_admin()));

create policy teams_delete on public.teams for delete using ((select public.is_admin()));

-- members（公開資料）：同隊窗口皆可讀；只能新增 / 修改 / 刪除「自己以該公司身分加入」的隊員
create policy members_read on public.members for select using (public.can_access_team(team_id));
create policy members_write on public.members for insert
  with check ((select public.is_admin()) or public.is_team_org_contact(team_id, org_id));
create policy members_update on public.members for update
  using ((select public.is_admin()) or public.is_team_org_contact(team_id, org_id))
  with check ((select public.is_admin()) or public.is_team_org_contact(team_id, org_id));
create policy members_delete on public.members for delete
  using ((select public.is_admin()) or public.is_team_org_contact(team_id, org_id));

-- member_private（個資）：只有該隊 × 該公司的窗口與管理員
create policy member_private_rw on public.member_private for all
  using (
    (select public.is_admin())
    or exists (select 1 from public.members m where m.id = member_id and public.is_team_org_contact(m.team_id, m.org_id))
  )
  with check (
    (select public.is_admin())
    or exists (select 1 from public.members m where m.id = member_id and public.is_team_org_contact(m.team_id, m.org_id))
  );

-- team_invites：只有管理員可讀、可改邀請碼（新增 / 刪除隨 team_orgs 自動處理）
create policy team_invites_admin on public.team_invites for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- team_contacts：本人看得到自己的綁定；管理員看全部並可解除綁定（釋出名額）
create policy team_contacts_read on public.team_contacts for select
  using (user_id = auth.uid() or (select public.is_admin()));
create policy team_contacts_admin_delete on public.team_contacts for delete using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 權限
-- ---------------------------------------------------------------------

revoke all on public.team_invites, public.team_contacts from anon;
grant select, update on public.team_invites to authenticated;
grant select, delete on public.team_contacts to authenticated;

revoke execute on function public.bind_team_contact(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.join_team(uuid, text), public.my_teams() from public, anon;
grant execute on function public.join_team(uuid, text), public.my_teams() to authenticated;
revoke execute on function public.team_options(), public.check_team_invite(uuid, text) from public;
grant execute on function public.team_options(), public.check_team_invite(uuid, text) to anon, authenticated;
