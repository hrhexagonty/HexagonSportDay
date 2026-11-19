-- 隊員資料可先只填「姓名、性別」送出，身分證 / 居留證字號、生日、用餐習慣改為選填（之後再補）
-- 有填寫時仍照舊檢查：證號格式與檢查碼、性別與證號一致、生日不可在未來、證號全活動唯一
-- （unique 允許多筆 null，未填證號的隊員不會互相衝突）

alter table public.member_private
  alter column national_id drop not null,
  alter column birthday drop not null,
  alter column diet drop not null;

-- 原本的 check 以 tw_id_valid(null) = false 擋下空值，改為「未填或格式正確」
alter table public.member_private drop constraint member_private_national_id_check;
alter table public.member_private add constraint member_private_national_id_check
  check (national_id is null or public.tw_id_valid(national_id));

-- 個資：空字串視為未填；證號轉大寫、生日不可為未來、性別需與證號一致
create or replace function public.member_private_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gender text;
begin
  new.national_id := nullif(upper(trim(new.national_id)), '');
  new.diet := nullif(trim(new.diet), '');
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

-- 隊員 RPC：選填欄位的空字串一律轉為 null（生日空字串不能直接轉 date）
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
    raise exception '身分證字號 % 已報名，同一人不可重複報名', upper(p_data ->> 'national_id') using errcode = 'P0001';
  end;
end $$;
