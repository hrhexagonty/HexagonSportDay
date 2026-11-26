-- =====================================================================
-- 資安強化（2026-11-23 資安評估）
-- 1. 已綁定身分（管理員、委外廠商、隊伍窗口）才能讀取活動指南與公司名稱
--    Auth 允許直接註冊、不驗證信箱，未經邀請碼的帳號原本也算「已登入」
-- 2. 身分證重複時不再顯示「某證號已報名」，避免被用來查詢某人是否參加
--    （仍會拒絕寫入，因此無法完全消除推測，只是不再直接確認）
-- 3. 未登入角色（anon）撤銷敏感資料表的權限：原本只靠 RLS 擋下，
--    Supabase 預設會授權 anon 存取新資料表，這裡補上第二道防線；settings、events 維持公開可讀
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 已綁定身分才能讀取
-- ---------------------------------------------------------------------

-- 目前使用者是否為管理員、委外廠商，或已綁定隊伍的窗口
create or replace function public.is_participant() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_vendor()
      or exists (select 1 from team_contacts where user_id = auth.uid());
$$;

drop policy guide_pages_read on public.guide_pages;
create policy guide_pages_read on public.guide_pages for select using ((select public.is_participant()));

create or replace function public.org_names() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.name from organizations o where public.is_participant() order by o.name;
$$;

-- ---------------------------------------------------------------------
-- 2. 身分證重複：不透露證號已被登記（其餘與 20261122 相同）
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
        nullif(trim(r ->> 'national_id'), ''),
        nullif(trim(r ->> 'birthday'), '')::date,
        nullif(r ->> 'phone', ''),
        nullif(r ->> 'shirt_size', ''),
        nullif(r ->> 'diet', ''),
        nullif(r ->> 'special_needs', '')
      );
    exception when unique_violation then
      raise exception '「%」的身分證字號無法使用，請確認是否輸入正確；如有疑問請洽活動小組', trim(r ->> 'name')
        using errcode = 'P0001';
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
      nullif(trim(p_data ->> 'national_id'), ''),
      nullif(trim(p_data ->> 'birthday'), '')::date,
      nullif(p_data ->> 'phone', ''),
      nullif(p_data ->> 'shirt_size', ''),
      nullif(p_data ->> 'diet', ''),
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
    raise exception '身分證字號無法使用，請確認是否輸入正確；如有疑問請洽活動小組' using errcode = 'P0001';
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3. 未登入角色撤銷敏感資料表權限（其餘資料表已在先前的 migration 撤銷）
-- ---------------------------------------------------------------------
revoke all on
  public.organizations,
  public.profiles,
  public.teams,
  public.team_orgs,
  public.members,
  public.member_private,
  public.event_entries
from anon;

-- 活動設定與比賽項目：未登入只需讀取（首頁、競賽規則）
revoke insert, update, delete, truncate, references, trigger on public.settings, public.events from anon;

-- 活動指南只能修改既有的五頁（Supabase 預設會授權 authenticated 新增 / 刪除）
revoke insert, delete, truncate on public.guide_pages from authenticated;

revoke execute on function public.is_participant() from public, anon;
grant execute on function public.is_participant() to authenticated;
