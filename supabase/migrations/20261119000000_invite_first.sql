-- =====================================================================
-- 首次註冊改為「先輸入邀請碼」
-- - 以邀請碼查出隊伍與公司（未登入可呼叫）：邀請碼本身就對應「隊伍 × 公司」，不需再選隊伍
-- - 前台不再公開隊伍清單：移除 team_options()；註冊前檢查改由 lookup_team_invite() 取代 check_team_invite()
-- 綁定規則不變：仍由 handle_new_user / join_team → bind_team_contact 檢查邀請碼與窗口人數
-- =====================================================================

create or replace function public.lookup_team_invite(p_code text)
returns table (team_id uuid, team_name text, org_id uuid, org_name text, is_full boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_inv team_invites%rowtype;
begin
  select * into v_inv from team_invites where invite_code = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception '邀請碼錯誤，請確認活動小組提供的邀請碼' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.name, o.id, o.name,
           (select count(*) from team_contacts c where c.team_id = t.id) >= t.contact_limit
      from teams t, organizations o
     where t.id = v_inv.team_id and o.id = v_inv.org_id;
end $$;

drop function public.team_options();
drop function public.check_team_invite(uuid, text);

revoke execute on function public.lookup_team_invite(text) from public;
grant execute on function public.lookup_team_invite(text) to anon, authenticated;
