-- 聯隊：同隊其他公司的窗口可看到隊員的「用餐習慣」
-- 其餘個資（身分證 / 居留證字號、生日、手機、衣服尺寸、特殊需求）仍只限「該隊 × 該公司」的窗口與管理員：
-- member_private 的 RLS 不變，只透過此函式額外開放 diet 一個欄位（唯讀）
create or replace function public.member_diets(p_team_id uuid default null)
returns table (member_id uuid, diet text)
language sql stable security definer set search_path = public as $$
  select m.id, p.diet
    from members m join member_private p on p.member_id = m.id
   where (p_team_id is null or m.team_id = p_team_id)
     and public.can_access_team(m.team_id)
   order by m.id;
$$;

revoke execute on function public.member_diets(uuid) from public, anon;
grant execute on function public.member_diets(uuid) to authenticated;
