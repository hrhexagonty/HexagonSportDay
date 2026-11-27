-- =====================================================================
-- 接駁車加入「需要幾台車」：一家公司可能需要多台車
-- - null = 未填（畫面標示「待填寫」，不阻擋任何操作）；有填需為 1–99 的整數
-- - 權限沿用 org_addresses（該公司窗口與管理員可寫、委外廠商唯讀、截止鎖定）
-- 前端對應：src/lib/orgAddress.ts 的 MIN_BUS_COUNT / MAX_BUS_COUNT
-- =====================================================================

alter table public.org_addresses
  add column shuttle_bus_count int check (shuttle_bus_count between 1 and 99);
