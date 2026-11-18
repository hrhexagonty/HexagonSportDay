-- 競賽規則 + 健力比賽改以公司為單位組隊
-- 1. events 新增 rules（規則說明）、video_url（示範影片連結），由管理員於後台編輯，前台「競賽規則」顯示
-- 2. org_squads / org_squad_members：公司的健力隊伍（一家公司可組多隊，同一項目一人只能參加一隊）
--    建立後為草稿；送出時檢查人數與女性下限；送出後需先「取消送出」才能調整；截止後只有管理員能異動
-- 3. category = 'powerlifting' 的項目不再經由 event_entries 以隊伍報名，也不計入「每人最多 N 項」
-- 4. org_roster()：窗口查詢自己公司在各分隊的同仁（只有姓名、性別、分隊，不含個資）
-- 既有的健力 event_entries（若有）不刪除，只是不再顯示、也不計入項目數

-- ---------------------------------------------------------------------
-- 競賽規則
-- ---------------------------------------------------------------------
alter table public.events
  add column rules text not null default '',
  add column video_url text not null default '' check (video_url = '' or video_url ~* '^https?://\S+$');

-- ---------------------------------------------------------------------
-- 權限輔助
-- ---------------------------------------------------------------------

-- 目前使用者是否為該公司（任一隊）的窗口
create or replace function public.is_org_contact(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_contacts where user_id = auth.uid() and org_id = p_org_id);
$$;

-- 公司同仁名單（跨分隊、不含個資）：該公司窗口與管理員
create or replace function public.org_roster(p_org_id uuid)
returns table (member_id uuid, name text, gender text, team_id uuid, team_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_org_contact(p_org_id)) then
    raise exception '無權限檢視此公司的同仁' using errcode = 'P0001';
  end if;
  return query
    select m.id, m.name, m.gender, t.id, t.name
      from members m join teams t on t.id = m.team_id
     where m.org_id = p_org_id
     order by t.name, m.created_at, m.id;
end $$;

-- ---------------------------------------------------------------------
-- 公司組隊（健力）
-- ---------------------------------------------------------------------
create table public.org_squads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  event_id text not null references public.events (id) on delete cascade,
  -- null = 草稿；有值 = 已送出成隊
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, event_id)
);
create index org_squads_org_id_idx on public.org_squads (org_id);

create table public.org_squad_members (
  squad_id uuid not null,
  -- 由 trigger 依隊伍帶入，用來保證同一項目一人只能參加一隊
  event_id text not null,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (squad_id, member_id),
  unique (event_id, member_id),
  foreign key (squad_id, event_id) references public.org_squads (id, event_id) on delete cascade
);
create index org_squad_members_member_id_idx on public.org_squad_members (member_id);

create trigger org_squads_guard_open before insert or update or delete on public.org_squads
  for each row execute function public.guard_registration_open();
create trigger org_squad_members_guard_open before insert or update or delete on public.org_squad_members
  for each row execute function public.guard_registration_open();

-- 隊伍：只能為「以公司組隊」的項目建立；送出時檢查人數與女性下限；已送出的隊伍不可刪除
create or replace function public.org_squads_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_n int;
  v_female int;
begin
  if tg_op = 'DELETE' then
    if old.submitted_at is not null and not public.is_admin() then
      raise exception '已送出的隊伍不可刪除，請先取消送出' using errcode = 'P0001';
    end if;
    return old;
  end if;

  select * into v_event from events where id = new.event_id;
  if tg_op = 'INSERT' then
    if v_event.category <> 'powerlifting' then
      raise exception '「%」以隊伍為單位報名，不能以公司組隊', v_event.name using errcode = 'P0001';
    end if;
    new.submitted_at := null; -- 新建立一律為草稿
    return new;
  end if;

  if new.org_id <> old.org_id or new.event_id <> old.event_id then
    raise exception '不可變更隊伍所屬公司或項目' using errcode = 'P0001';
  end if;
  if new.submitted_at is not null and old.submitted_at is null then
    -- 與新增隊員共用同一把鎖，避免送出檢查與加人同時進行
    perform pg_advisory_xact_lock(hashtext('squad:' || new.id::text));
    select count(*), count(*) filter (where m.gender = 'F') into v_n, v_female
      from org_squad_members s join members m on m.id = s.member_id
     where s.squad_id = new.id;
    if v_n < v_event.min_per_team or v_n > v_event.max_per_team then
      if v_event.min_per_team = v_event.max_per_team then
        raise exception '「%」每隊需 % 人（目前 % 人）', v_event.name, v_event.max_per_team, v_n using errcode = 'P0001';
      end if;
      raise exception '「%」每隊需 %–% 人（目前 % 人）', v_event.name, v_event.min_per_team, v_event.max_per_team, v_n
        using errcode = 'P0001';
    end if;
    if v_female < v_event.min_female then
      raise exception '女性至少 % 人才能成隊（目前 % 人）', v_event.min_female, v_female using errcode = 'P0001';
    end if;
    new.submitted_at := now();
  elsif new.submitted_at is not null then
    new.submitted_at := old.submitted_at; -- 已送出的隊伍保留原送出時間
  end if;
  return new;
end $$;

create trigger org_squads_before_write before insert or update or delete on public.org_squads
  for each row execute function public.org_squads_before_write();

-- 隊員：只能選同公司同仁、一人只能參加一隊、不超過人數上限；已送出的隊伍不可調整
create or replace function public.org_squad_members_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_squad org_squads%rowtype;
  v_event events%rowtype;
  v_member members%rowtype;
  v_n int;
begin
  if tg_op = 'UPDATE' then
    raise exception '隊伍成員不可修改，請移除後重新加入' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    -- 刪除整支隊伍時（cascade）隊伍已不存在，不需檢查
    select * into v_squad from org_squads where id = old.squad_id;
    if found and v_squad.submitted_at is not null and not public.is_admin() then
      raise exception '此同仁在已送出的隊伍中，請先取消送出再調整' using errcode = 'P0001';
    end if;
    return old;
  end if;

  select * into v_squad from org_squads where id = new.squad_id;
  if not found then
    raise exception '找不到隊伍' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('squad:' || v_squad.id::text));
  if v_squad.submitted_at is not null then
    raise exception '已送出的隊伍不可調整，請先取消送出' using errcode = 'P0001';
  end if;

  select * into v_member from members where id = new.member_id;
  if not found or v_member.org_id <> v_squad.org_id then
    raise exception '只能選擇同公司的同仁' using errcode = 'P0001';
  end if;

  new.event_id := v_squad.event_id;
  select * into v_event from events where id = v_squad.event_id;
  if exists (select 1 from org_squad_members where squad_id = new.squad_id and member_id = new.member_id) then
    raise exception '% 已在這一隊', v_member.name using errcode = 'P0001';
  end if;
  if exists (select 1 from org_squad_members where event_id = new.event_id and member_id = new.member_id) then
    raise exception '% 已加入其他「%」隊伍（每人只能參加一隊）', v_member.name, v_event.name using errcode = 'P0001';
  end if;
  select count(*) into v_n from org_squad_members where squad_id = new.squad_id;
  if v_n >= v_event.max_per_team then
    raise exception '「%」每隊最多 % 人', v_event.name, v_event.max_per_team using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger org_squad_members_before_write before insert or update or delete on public.org_squad_members
  for each row execute function public.org_squad_members_before_write();

-- ---------------------------------------------------------------------
-- 隊伍報名：以公司組隊的項目不可再以隊伍報名，也不計入每人項目數
-- ---------------------------------------------------------------------
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
  if v_event.category = 'powerlifting' then
    raise exception '「%」改以公司為單位組隊，請至「我的公司」報名', v_event.name using errcode = 'P0001';
  end if;
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
  select count(*) into v_member_count
    from event_entries e join events ev on ev.id = e.event_id
   where e.member_id = new.member_id and ev.category <> 'powerlifting';
  if v_member_count >= v_member_limit then
    raise exception '每人最多報名 % 個項目', v_member_limit using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- RLS 與權限
-- ---------------------------------------------------------------------
alter table public.org_squads enable row level security;
alter table public.org_squad_members enable row level security;

create policy org_squads_rw on public.org_squads for all
  using ((select public.is_admin()) or public.is_org_contact(org_id))
  with check ((select public.is_admin()) or public.is_org_contact(org_id));

create policy org_squad_members_rw on public.org_squad_members for all
  using (exists (
    select 1 from public.org_squads s
     where s.id = squad_id and ((select public.is_admin()) or public.is_org_contact(s.org_id))
  ))
  with check (exists (
    select 1 from public.org_squads s
     where s.id = squad_id and ((select public.is_admin()) or public.is_org_contact(s.org_id))
  ));

revoke all on public.org_squads, public.org_squad_members from anon;
grant select, insert, update, delete on public.org_squads, public.org_squad_members to authenticated;

revoke execute on function public.org_roster(uuid), public.is_org_contact(uuid) from public, anon;
grant execute on function public.org_roster(uuid), public.is_org_contact(uuid) to authenticated;
