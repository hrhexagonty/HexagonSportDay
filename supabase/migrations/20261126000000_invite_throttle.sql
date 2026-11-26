-- =====================================================================
-- 邀請碼查詢節流（2026-11-23 資安評估 M2）
-- lookup_invite 開放未登入呼叫，原本沒有次數限制，可被用來暴力猜測邀請碼。
-- - 查無邀請碼時記錄來源 IP 並回傳空結果（不再 raise：raise 會讓記錄隨交易回滾）；
--   前端原本就把空結果視為「邀請碼錯誤」，不需改版
-- - 同一 IP 15 分鐘內查錯 20 次即暫停查詢（含正確的邀請碼），直到較早的錯誤超過 15 分鐘
-- - 舊版前端用的 lookup_team_invite 已無人呼叫，撤銷執行權，避免成為不受節流的猜測管道
-- 解除鎖定：於 SQL Editor 執行 delete from public.invite_lookup_failures;
-- =====================================================================

create table public.invite_lookup_failures (
  id bigint generated always as identity primary key,
  ip text not null,
  source text not null, -- IP 取自哪個請求標頭：cf-connecting-ip / x-real-ip / x-forwarded-for / none
  created_at timestamptz not null default now()
);
create index invite_lookup_failures_ip_idx on public.invite_lookup_failures (ip, created_at);
create index invite_lookup_failures_created_idx on public.invite_lookup_failures (created_at);

-- 只有資料庫擁有者（SQL Editor）讀得到；啟用 RLS 且不建立政策，並撤銷 Supabase 預設授權
alter table public.invite_lookup_failures enable row level security;
revoke all on public.invite_lookup_failures from anon, authenticated;
revoke all on sequence public.invite_lookup_failures_id_seq from anon, authenticated;

-- 以邀請碼查出身分（未登入可呼叫）：kind = 'team'（隊伍 × 公司）或 'vendor'（委外廠商）
-- 改為 volatile（預設）：查錯時要寫入失敗紀錄
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
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_inv team_invites%rowtype;
  v_vendor vendors%rowtype;
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text;
  v_source text;
begin
  -- 來源 IP：優先採用 Cloudflare 設定的 cf-connecting-ip（用戶端無法自行指定），其次 x-real-ip、x-forwarded-for 第一段
  v_ip := nullif(trim(v_headers ->> 'cf-connecting-ip'), '');
  v_source := 'cf-connecting-ip';
  if v_ip is null then
    v_ip := nullif(trim(v_headers ->> 'x-real-ip'), '');
    v_source := 'x-real-ip';
  end if;
  if v_ip is null then
    v_ip := nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '');
    v_source := 'x-forwarded-for';
  end if;
  if v_ip is null then
    v_ip := 'unknown';
    v_source := 'none';
  end if;
  v_ip := left(v_ip, 64);

  -- 同一 IP 依序處理，避免並行請求同時通過次數檢查
  perform pg_advisory_xact_lock(hashtext('invite_lookup:' || v_ip));
  if (select count(*) from invite_lookup_failures f
       where f.ip = v_ip and f.created_at > now() - interval '15 minutes') >= 20 then
    raise exception '邀請碼查詢錯誤次數過多，請 15 分鐘後再試' using errcode = 'P0001';
  end if;

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

  -- 查無邀請碼：記錄失敗（順便清除一天前的紀錄），回傳空結果
  delete from invite_lookup_failures where created_at < now() - interval '1 day';
  insert into invite_lookup_failures (ip, source) values (v_ip, v_source);
end $$;

revoke execute on function public.lookup_invite(text) from public;
grant execute on function public.lookup_invite(text) to anon, authenticated;

-- 舊版查詢函式：撤銷執行權（保留函式本體，必要時可再授權）
revoke execute on function public.lookup_team_invite(text) from public, anon, authenticated;
