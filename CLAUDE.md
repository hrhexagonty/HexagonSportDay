# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概要

大型運動會（約 24 隊、900 人）報名平台：管理員預先建立公司與隊伍，並以拖曳把公司放到隊伍底下（一隊有多家公司 = 聯隊；一家公司可加入多隊）；各隊窗口在前台「輸入邀請碼 → 確認隊伍 → 設定信箱密碼」註冊後，填寫隊員（含身分證等個資），並以拖曳人偶為 4 項趣味競賽（同心鼓顛球、四關障礙接力、嗨ROX競賽、毛毛蟲大隊接力）安排選手；健力比賽改在「我的公司」以公司為單位組隊（每隊 10 人、女性下限依項目設定）。前台另有「競賽規則」頁（規則文字 + 示範影片連結，由管理員於後台編輯）。另有「委外廠商」角色：以廠商邀請碼註冊，唯讀檢視後台大部分資料（個資隱碼），可編輯活動設定（含活動指南）與競賽項目設定。登入後導覽列有「活動指南 ▾」下拉選單：場地配置、當天活動流程、隊服顏色對照、餐食內容、交通規劃（後台「活動設定」以所見即所得 / HTML 原始碼編輯器撰寫，可貼圖片與影片連結）。
技術：Vite + React 19 + TypeScript（前端，部署 GitHub Pages）＋ Supabase（Postgres / Auth / RLS）。

## 常用指令

```bash
npm run dev                                  # 開發伺服器（讀 .env.local → 連正式 Supabase）
npm run dev:demo                             # 強制展示模式（vite --mode demo，.env.demo 清空連線資訊），UI 測試請用這個
npm test                                     # 全部測試（前端單元測試 + 資料庫測試）
npx vitest run src/lib/rules.test.ts         # 執行單一測試檔
npx vitest run -t "checkAddEntry"            # 依名稱執行特定測試
npx vitest run supabase/tests                # 只跑資料庫測試（修改 migration 後必跑）
npm run typecheck                            # tsc --noEmit（不含 supabase/tests）
npm run build                                # typecheck + vite build → dist/
```

沒有 ESLint；型別檢查（strict、noUnusedLocals）即為主要靜態檢查。
`supabase/tests/migration.test.ts` 以 PGlite（WASM Postgres）實際執行所有 migration，並模擬 Supabase 的 `auth.uid()` 與 `anon` / `authenticated` 角色來驗證 RLS、trigger、RPC，不需要 Docker 或 Supabase 專案。測試環境也模擬 Supabase 的預設授權（public schema 新資料表 / 函式自動 grant 給 anon、authenticated），所以「只靠 RLS 擋」與「已 revoke」的差別測得出來。

## 架構重點

### 資料存取層：一個介面、兩種實作
- 頁面一律透過 `src/lib/api/index.ts` 匯出的 `api`（`DataApi`，定義於 `src/lib/api/types.ts`）讀寫資料，**不要在頁面直接呼叫 supabase-js**。
- 有設定 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` → `supabase.ts`；否則 → `demo.ts`（展示模式，localStorage，key 含版本號，資料結構變更時要升版）。
- `demo.ts` 必須模擬 Supabase 端的 RLS 可見範圍與 DB trigger 限制，兩種模式行為才會一致；新增 `DataApi` 方法時兩邊都要實作。展示資料的邀請碼為「公司前綴 + 隊伍編號」（例如 `TECH03`），委外廠商邀請碼為 `VENDOR01`（展示帳號 `vendor@demo.local`）。
- 需要多表同交易寫入或跨權限讀取的操作走 RPC（`create_team`、`set_team_orgs`、`add_members`、`update_member`、`purge_private_data`、`join_team`、`join_vendor`、`lookup_invite`、`my_teams`、`my_vendor`、`org_names`、`org_roster`、`member_diets`、`vendor_teams`、`vendor_member_private`），不要在前端拆成多次寫入。`lookup_team_invite` 已由 `lookup_invite` 取代，2026-11-26 起撤銷執行權（函式本體保留）。
- `supabase.ts` 在 `getSession` 時記住是否為委外廠商（`vendorSession`）：廠商的 `listTeams` / `getTeam` / `listMembers` 改走隱碼 RPC。登入後的頁面都在 `AuthProvider` 讀完 session 後才載入，因此可依賴這個狀態。
- Supabase 單次查詢上限 1000 筆，名單 / 報名紀錄用 `supabase.ts` 的 `fetchAll` 分頁抓取。

### 資料模型與可見範圍（RLS）
`organizations`（公司）⇄ `team_orgs` ⇄ `teams` → `members` → `event_entries`；個資另存 `member_private`。
登入以「隊伍」為單位：`team_invites`（隊伍 × 公司各一組邀請碼）、`team_contacts`（帳號 ⇄ 隊伍，多對多，記錄以哪家公司身分加入）。
公司組隊（健力）：`org_squads`（公司 × 項目，`submitted_at` 為 null = 草稿）→ `org_squad_members`（`event_id` 由 trigger 帶入，`unique (event_id, member_id)` = 一人只能參加一隊）。
- **隊伍與公司只由管理員建立**（`create_team` 限管理員，可不指定公司 = 未分配）；後台「隊伍配置」（`src/pages/admin/TeamSetup.tsx`）把公司拖到隊伍卡上，以 `set_team_orgs` 存檔。`team_orgs` 有多家公司即為聯隊；新增 `team_orgs` 時 trigger 自動產生該組邀請碼，移除時邀請碼與窗口綁定一併刪除（仍有隊員則拒絕）。刪除公司不會刪除隊伍。
- **窗口綁定**：`bind_team_contact`（內部函式）檢查邀請碼與所選隊伍相符、`teams.contact_limit` 未滿（advisory lock 防並行超額）。註冊時前端把 `team_id`、`invite_code` 放進 signUp 的 user metadata，由 `handle_new_user` trigger 一併綁定，失敗則整筆註冊失敗（不會留下無隊伍帳號，也不受 Confirm email 影響）；已登入帳號用 `join_team` 加入其他隊伍。同一位窗口代表多隊時共用一個帳號（Supabase 一個信箱只能一個帳號）：`registerWithInvite` 遇到已註冊的信箱會以原本的密碼登入再呼叫 `join_team`（委外廠商為 `join_vendor`）。
- `members`（姓名、性別、所屬公司 `org_id`）：同隊窗口都看得到，用於安排項目選手；但只能新增 / 修改 / 刪除**自己以該公司身分加入（`is_team_org_contact`）**的隊員。`(team_id, org_id)` 有複合外鍵指向 `team_orgs`。
- `member_private`（身分證 / 居留證、生日、手機、尺寸、用餐、特殊需求）：**只有「該隊 × 該公司」的窗口與管理員**看得到；前端 `Member.private === null` 代表無權檢視或已被清除。例外是用餐習慣：聯隊其他公司的窗口也要看得到，透過唯讀的 `member_diets()` 只開放 `diet` 一欄（前端為 `Member.diet`），不要為此放寬 `member_private` 的 RLS。`national_id` 全活動唯一。
- 隊員只有**姓名、性別必填**：`member_private` 的證號、生日、用餐都可為 null（新增隊員時一律建立 `member_private` 列，未填欄位存 null；有填才檢查格式、檢查碼、性別一致、唯一）。名單以 `member.ts` 的 `missingFields` 標示「待補」，不阻擋任何寫入或報名。
- **已綁定身分**（`is_participant()`：管理員、委外廠商或有 `team_contacts` 的窗口）才能讀活動指南與 `org_names()`。Auth 允許直接呼叫 API 註冊且不驗證信箱，未經邀請碼的帳號雖然「已登入」，但不應看到任何活動資料；新增「登入者可讀」的資料時請用 `is_participant()`，不要用 `auth.uid() is not null`。
- 未登入角色（anon）只對 `settings`、`events` 有讀取權，其餘資料表都已 revoke（Supabase 預設會 grant，新增資料表時記得 revoke）；可呼叫的函式只有 `lookup_invite`。
- **邀請碼查詢節流**：`lookup_invite` 查錯時把來源 IP（`cf-connecting-ip` 優先，其次 `x-real-ip`、`x-forwarded-for` 第一段）記到 `invite_lookup_failures` 並回傳空結果（不 raise，否則紀錄會隨交易回滾；前端把空結果視為「邀請碼錯誤」）；同一 IP 15 分鐘內查錯 20 次即暫停查詢，連正確邀請碼也查不到。紀錄只有 SQL Editor 讀得到，一天後自動清除；要提前解除鎖定請在 SQL Editor 執行 `delete from invite_lookup_failures`。正式環境已確認 IP 取自 `cf-connecting-ip`（用戶端自帶此標頭會被 Cloudflare 以 403 拒絕，偽造 `x-forwarded-for` / `x-real-ip` 無效）。展示模式不模擬節流。
- 身分證重複（unique violation）一律回「身分證字號無法使用…請洽活動小組」，不顯示證號、不說「已報名」，避免被用來查詢某人是否參加。
- `organizations`、`team_invites`、他人的 `team_contacts` 只有管理員讀得到；窗口取公司名稱用 `org_names()`，取自己的隊伍用 `my_teams()`；未登入的註冊頁只能用 `lookup_invite(邀請碼)` 查出對應隊伍與公司（或委外廠商），前台不公開隊伍清單。隊伍與廠商邀請碼共用輸入框，`invite_code_unique_across` trigger 確保兩表不重複。
- **委外廠商**（`SessionInfo.role = 'vendor'`）：`vendors`（廠商名稱、邀請碼、`account_limit`，僅管理員可讀寫，後台「窗口與邀請碼」下方管理）→ `vendor_contacts`（帳號 ⇄ 廠商，一個帳號一家）。`profiles.role` 仍為 `org_admin`，身分由 `is_vendor()`（有 `vendor_contacts` 列）判定，管理員解除或刪除廠商即失去權限。註冊時 user metadata 帶 `vendor_code`，由 `handle_new_user` 呼叫 `bind_vendor`；廠商帳號與隊伍窗口不可兼任（`bind_vendor` / `bind_team_contact` 互擋）。
  - 可見範圍：`members`、`event_entries`、`org_squads`、`org_squad_members` 有唯讀 select 政策；**不能直接讀 `teams`、`team_orgs`、`member_private`**，改由 `vendor_teams()`（隊長電話隱碼）、`vendor_member_private()`（證號 `A12****789`、生日 `1990-**-**`、手機 `0912***678`；尺寸、用餐、特殊需求照常）取得。看不到 `organizations`（用 `org_names()`）、`team_invites`、`team_contacts`、`vendors`。
  - 可寫入：只有 `settings`、`events`、`guide_pages` 的 update（`events_before_update` 擋下非管理員改 `id` / `category` / `sort_order`）；其餘寫入一律被 RLS 擋下。
  - 前端：`/admin` 路由守衛為 `staff`（管理員或廠商）；廠商只顯示「填報總覽、隊伍配置、健力報名、活動設定、競賽項目設定」分頁，`AdminData.readOnly = true` 時隊伍配置與健力報名隱藏所有編輯操作；隊伍頁 `TeamPageData.isVendor` 時 `editable = false`。
- 窗口可改隊長資料，隊名與 `contact_limit` 只有管理員能改（`teams_before_update` trigger）；刪除隊伍限管理員。
- `event_entries` 不存 team_id，隊伍經由 member 推得；聯隊內任一公司都可為全隊安排選手。
- 公司組隊：該公司**任一隊**的窗口（`is_org_contact`）都能看同仁名單 `org_roster()`（跨分隊，只有姓名 / 性別 / 分隊，不含個資）並管理該公司的隊伍；可組多隊。只能選同公司同仁、不超過人數上限；送出時檢查人數與女性下限；已送出的隊伍不能加減人、刪除，也不能刪除其中的隊員（需先取消送出）；管理員不受此限。截止後只有管理員能異動。
- `events` 為資料驅動，程式不應寫死特定項目；`category` 除了標示，只決定報名方式：`powerlifting` 以公司組隊（`rules.ts` 的 `isCompanyEvent` / `companyEvents()`，DB 端為 `org_squads_before_write`），其餘以隊伍報名（`teamEvents()`）。公司組隊項目不可寫入 `event_entries`，也不計入「每人最多 N 項」；改版前留下的健力 `event_entries` 未刪除，只是不顯示、不計入。`events.rules`（純文字）、`events.video_url`（只接受 http/https）由管理員編輯。
- **活動指南**（`guide_pages`：`id`、`content` HTML、`updated_at`）：預先建立五列（venue / schedule / uniforms / meals / transport，對應 `src/lib/guide.ts` 的 `GUIDE_PAGES`），只能 update 不能新增刪除（insert / delete 權限已 revoke）；已綁定身分者可讀（`is_participant()`），管理員與委外廠商可改；`content` 上限 6,000,000 bytes（前端 `MAX_GUIDE_BYTES` 5MB）。圖片以壓縮後的 data URI 內嵌（`compressImage`：最長邊 1600px、JPEG），不使用 Storage。
  - **HTML 一律經 `src/lib/richText.ts` 的 `sanitizeHtml`（DOMPurify）過濾**：顯示（`RichContent`）與存檔前都要過濾；資料庫不檢查 HTML 內容。只允許 YouTube / Google 地圖 iframe，禁止 script、事件屬性、style 標籤、表單、id/name；圖片只允許 `data:image` 與 https。`.rich-content` 以 `contain: paint` 防止內容中的 fixed 元素蓋住頁面。不要在其他地方用 `dangerouslySetInnerHTML` 顯示未過濾的內容。
  - 編輯器 `src/components/RichText.tsx` 的 `RichEditor`：contenteditable + `execCommand`；貼上 / 拖曳圖片自動壓縮、貼上單一網址自動轉影片 / 連結、貼上 HTML 先過濾；「原始碼」模式以 `#圖片-N` 佔位取代 data URI（`toSourceView`）。
- 管理員帳號：網站註冊必須有隊伍邀請碼，因此管理員請在 Supabase Dashboard → Authentication → Add user 建立，再把 `profiles.role` 改為 `super_admin`。

### 規則重複存在於前後端，修改時必須同步
| 規則 | 資料庫（強制） | 前端（即時提示 / 展示模式） |
| --- | --- | --- |
| 隊伍人數上限、每項每隊上限、每人項目數、截止鎖定 | migration 中的 trigger | `src/lib/rules.ts` 的 `check*` |
| 邀請碼格式（6–20 位英數大寫）、窗口人數上限、邀請碼需與隊伍相符 | `team_invites` check、`bind_team_contact` | `src/lib/inviteCode.ts`、`demo.ts` |
| 身分證 / 居留證檢查碼、性別與證號一致、生日不可在未來（皆為選填，有填才檢查；空字串視為 null） | `tw_id_valid`、`tw_id_gender`、`member_private_before_write`、`add_members` / `update_member` | `src/lib/idNumber.ts`、`src/lib/member.ts`、`src/lib/importParse.ts` |
| 公司組隊：一人一隊、人數上限、送出時人數與女性下限、已送出不可調整 | `org_squads_before_write`、`org_squad_members_before_write` | `rules.ts` 的 `checkAddSquadMember`、`checkSubmitSquad`、`evaluateSquad` |
| 示範影片連結只接受 http/https | `events.video_url` check | `src/lib/video.ts` |
| 用餐習慣選項（meat / meat_no_pork / ovo_lacto / vegan） | `member_private_diet_check` | `types.ts` 的 `DIETS`、`member.ts` 的 `DIET_MAP`（匯入文字對照） |
| 委外廠商隱碼（證號前 3 後 3、手機前 4 後 3、生日只留年份；太短全遮） | `mask_middle`、`vendor_member_private`、`vendor_teams` | `src/lib/mask.ts`（展示模式） |
| 委外廠商帳號數上限、不可兼任窗口、邀請碼不可與隊伍邀請碼重複 | `bind_vendor`、`bind_team_contact`、`invite_code_unique_across` | `demo.ts` 的 `bindVendor`、`bind`、`codeTaken` |
| 活動指南：頁面清單、大小上限、可編輯者 | `guide_pages` 預設列、`guide_pages_content_check`、RLS | `src/lib/guide.ts`、`richText.ts` 的 `MAX_GUIDE_BYTES`、`demo.ts` |
| 已綁定身分才能讀活動指南、公司名稱 | `is_participant()`、`guide_pages_read`、`org_names()` | `demo.ts` 的 `requireParticipant`、`/guide` 路由守衛 `member`、導覽列 `GuideMenu` 顯示條件 |
| 身分證重複訊息不透露證號 | `add_members`、`update_member` | `supabase.ts` 的 `translateError`、`demo.ts` |
| 活動指南 iframe 白名單 | — | `richText.ts` 的 `EMBED_PATTERNS`、`vite.config.ts` CSP 的 `frame-src` |
| 人數 / 女性下限（「未完成」，不阻擋寫入） | — | `rules.ts` 的 `evaluate*` |
| 邀請碼查詢節流（同一 IP 15 分鐘查錯 20 次暫停） | `lookup_invite`、`invite_lookup_failures` | —（前端只顯示訊息，展示模式不模擬） |

另外需同步的重複資料：比賽項目初始資料（migration 尾端 ↔ `src/lib/api/demoSeed.ts` 的 `DEMO_EVENTS`）、資料表欄位（migration ↔ `src/lib/types.ts`）。
`20261117000000_init.sql` 已於 2026-11-17 以 Supabase SQL Editor 套用到正式專案（ref `sxonocgtoupelrdolumj`），**不可再修改**；`20261118000000_team_login.sql`（改為以隊伍登入）已於 2026-11-18 套用；`20261119000000_invite_first.sql`（先輸入邀請碼）已於 2026-11-18 套用；`20261120000000_company_squads.sql`（競賽規則欄位、公司組隊、`org_roster`）已於 2026-11-19 套用；`20261121000000_member_diets.sql`（聯隊其他公司可看用餐習慣）已於 2026-11-19 套用；`20261122000000_optional_member_fields.sql`（證號、生日、用餐改為選填）已於 2026-11-19 套用；`20261123000000_vendor_role.sql`（用餐新增「葷食不吃豬」、委外廠商角色）已於 2026-11-20 套用；`20261124000000_guide_pages.sql`（活動指南）已於 2026-11-20 套用；`20261125000000_security_hardening.sql`（資安強化）已於 2026-11-26 套用；`20261126000000_invite_throttle.sql`（邀請碼查詢節流）已於 2026-11-26 套用。已套用的 migration 不可再修改。前端依賴新 schema 時，SQL 套用並確認前不可推送。schema 變更請新增 `supabase/migrations/<timestamp>_<name>.sql`，先跑 `npx vitest run supabase/tests`，再請使用者於 SQL Editor 執行（此專案未使用 Supabase CLI 的 migration 紀錄；若日後改用 CLI，需先 `supabase migration repair --status applied 20261117000000`）。

### 環境
- 本機 `.env.local`（不提交）已指向**正式** Supabase：`npm run dev` 的操作會寫入正式資料庫。測試請用 `npm run dev:demo`（`.claude/launch.json` 的 `dev-demo`，port 5174）。
- GitHub repo `hrhexagonty/HexagonSportDay` 的 Actions secrets 存放相同的 URL / publishable key；網站：https://hrhexagonty.github.io/HexagonSportDay/
- Supabase Auth 建議關閉「Confirm email」：內建寄信服務只寄給專案成員，公司窗口收不到驗證信（未設定自訂 SMTP 前）。

### 前端路由與部署
- 使用 `HashRouter` + `vite.config.ts` 的 `base: './'`（GitHub Pages 無 SPA fallback）；頁內錨點不可用 `href="#..."`，請用 `scrollIntoView`。
- `/guide/:pageId`（活動指南）需登入（`any`）；導覽列的「活動指南 ▾」（`Layout.tsx` 的 `GuideMenu`）以 portal 放在 body 並固定定位，因為手機版導覽列可橫向捲動會裁掉子元素。
- 路由守衛 `src/auth/RequireAuth.tsx`：`staff`（管理員或委外廠商，`/admin`）、`org`（需綁定至少一隊的窗口：`/org` = 我的隊伍、`/company` = 我的公司（健力報名），代表多家公司時以 `?org=` 切換）、`member`（窗口、管理員或委外廠商，用於 `/teams/:id`）、`any`（`/join` 加入其他隊伍；只接受隊伍邀請碼）。`/rules`（競賽規則）不需登入，但導覽列只在登入後顯示。`homePathFor`：管理員與委外廠商進後台，只綁一隊的窗口登入後直接進該隊頁。
- `SessionInfo.teams` 為帳號綁定的隊伍與代表公司；隊伍頁以此決定 `myOrgId`（可編輯 / 檢視個資的公司）。
- 批次匯入欄位順序定義在 `src/lib/importParse.ts` 的 `IMPORT_COLUMNS`（生日支援民國年）。
- 部署：`.github/workflows/deploy.yml` 推送 `main` 即測試 + 建置 + 部署；Supabase 連線資訊放 GitHub Actions secrets。
- **CSP**：`vite.config.ts` 的 `securityMeta` 只在 build 時把 Content-Security-Policy 與 Referrer-Policy 以 meta 加進 `index.html`（GitHub Pages 不能設回應標頭；開發伺服器有 inline script 所以不套用）。`connect-src` 由 `VITE_SUPABASE_URL` 產生；新增外部資源（字型、iframe、API）時要同步放寬。驗證方式：`npx vite build --mode demo --outDir node_modules/.preview-demo --emptyOutDir` 後以 `.claude/launch.json` 的 `preview-demo`（port 5175）開啟，監聽 `securitypolicyviolation` 事件。
- CSV 匯出（`src/lib/csv.ts`）：`= + - @ Tab CR` 開頭的欄位前加單引號，避免 Excel 公式注入。
- 資料載入用 `src/lib/useAsync.ts`（reload 時保留舊資料避免閃爍）；訊息用 `useToast()`。

## UI 設計規範（Obsidian & Lime 玻璃擬態）

全站樣式集中在 `src/styles.css`，色彩 / 圓角 / 字型都是 `:root` 的 CSS 變數，新增樣式請沿用變數與既有 class，不要寫死色碼。
- **只有深色**：視窗 `#000`、浮動外殼 `#0c0c0c`（`.viewport > .shell`，最大寬 1600px、圓角 2.5rem）；主色萊姆 `#ccff00`（`--lime`）、輔色 `#10b981`（`--emerald`）；文字 `#ebebeb` / 60% / 30%。
- **字型**：Space Grotesk（標題、內文）、JetBrains Mono（技術標籤，大寫、拉開字距）、中文由 Noto Sans TC 補字（三者都在 `index.html` 由 Google Fonts 載入），不要用系統字型。
- **玻璃**：`rgba(255,255,255,.03)` + `blur(16px)` + `1px rgba(255,255,255,.1)` 邊框（`.glass`、`.card`、`.stat`、`.bento-card`）；容器圓角至少 2rem；按鈕、分頁、徽章一律膠囊形。表格列不要加 `backdrop-filter`（效能）。
- **主要按鈕**：`.btn-primary`（Neon Pulse：萊姆底黑字、光暈、hover 放大 1.05）；次要 `.btn`（玻璃）；白色 `.btn-white`（導覽列右側）；首頁頁尾 `.btn-mega`（hover 白底由下滑上）。
- **元件**：`StatusTag`（等寬字 + 脈動萊姆點）、`Eyebrow`（標題上方等寬小標，例如 `ADMIN CONSOLE`）、`BrandMark`，定義在 `src/components/ui.tsx`；內頁標題一律「Eyebrow + h1」。
- **質感**：外殼背景的 60px 格線、光暈球（blur 120px）、15% 雜訊由 `Layout.tsx` 的 `ShellEffects` 提供；首頁才有大型頁尾（HEXAGON 浮水印 + CTA），內頁為精簡頁尾。
- **中文排版**：斜體漸層（`.hero-title-accent`）只用在英文字；-0.06em 緊字距只用在大型展示字（hero、大數字），一般中文標題用 -0.03em。
- 隊伍頁「項目報名」（`src/pages/team/EventsPanel.tsx`）：中央為隊員人偶（`--male` 藍 / `--female` 粉），項目框依排序放在上、左、右、下；拖曳到項目框 = 報名、項目框之間 = 換項目、拖回中央或按 × = 取消。觸控裝置以「點選人偶 → 點項目框」代替拖曳。操作先反映在畫面，全部完成後才 reload。下方「報名檢核」以男女分色進度條顯示隊伍人數與各項目人數。人偶、空白名額、男女圖例 / 進度條、檢核列是 `src/components/Figure.tsx` 的共用元件。
- 我的公司（`src/pages/Company.tsx`）：左側為公司同仁人偶（依分隊分組、可搜尋），右側為健力隊伍區塊（「組成健力隊伍」產生空白區塊）；拖曳 / 點選邏輯同項目報名。隊伍編號依 `created_at` 排序，與後台「健力報名」分頁一致。人偶與放置框不要宣告成元件內部的子元件（每次重繪會重新掛載、打斷拖曳），用 render 函式。
- 首頁為 Hero（12 欄分割）→ 比賽項目（4 欄 Bento，資料驅動：趣味競賽各一張卡，健力為整列萊姆強調卡）→ 淺灰對比區（報名流程 + 個資說明）。窄於 1100px 時 Hero 改單欄（12 欄 × 大間距會撐出最小寬度）。
- Hero 標題（活動名稱、Sport Day 年份）一律單行不換行，寬度不足時由 `Home.tsx` 的 `FitLine` 自動縮小字級。
- 頁首品牌只有萊姆方塊 + 「SPORT DAY」（不放 HEXAGON 字樣與字首）；首次註冊與加入隊伍一律先輸入邀請碼（`src/components/InviteCode.tsx`），由邀請碼帶出隊伍，不讓使用者自選隊伍。
