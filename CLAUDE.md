# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概要

大型運動會（約 24 隊、900 人）報名平台：各公司窗口自行建立隊伍、填寫隊員（含身分證等個資），並為 4 項趣味競賽（同心鼓顛球、四關障礙接力、嗨ROX競賽、毛毛蟲大隊接力）＋ 1 項健力比賽（每隊 10 人、至少 4 女）安排選手；數家小公司可由管理員合組「聯隊」。
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
`supabase/tests/migration.test.ts` 以 PGlite（WASM Postgres）實際執行所有 migration，並模擬 Supabase 的 `auth.uid()` 與 `anon` / `authenticated` 角色來驗證 RLS、trigger、RPC，不需要 Docker 或 Supabase 專案。

## 架構重點

### 資料存取層：一個介面、兩種實作
- 頁面一律透過 `src/lib/api/index.ts` 匯出的 `api`（`DataApi`，定義於 `src/lib/api/types.ts`）讀寫資料，**不要在頁面直接呼叫 supabase-js**。
- 有設定 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` → `supabase.ts`；否則 → `demo.ts`（展示模式，localStorage，key 含版本號，資料結構變更時要升版）。
- `demo.ts` 必須模擬 Supabase 端的 RLS 可見範圍與 DB trigger 限制，兩種模式行為才會一致；新增 `DataApi` 方法時兩邊都要實作。
- 需要多表同交易寫入的操作走 RPC（`create_team`、`set_team_orgs`、`add_members`、`update_member`、`purge_private_data`、`join_org`、`org_names`），不要在前端拆成多次寫入。
- Supabase 單次查詢上限 1000 筆，名單 / 報名紀錄用 `supabase.ts` 的 `fetchAll` 分頁抓取。

### 資料模型與可見範圍（RLS）
`organizations`（公司）⇄ `team_orgs` ⇄ `teams` → `members` → `event_entries`；個資另存 `member_private`。
- **聯隊**：`team_orgs` 有多家公司的隊伍，只有管理員能建立 / 調整參與公司 / 刪除；`team_quota` 只限制公司「自組」（只屬於該公司）的隊伍數，聯隊不占額度。目標隊數 = 自組額度合計 + 聯隊數（`plannedTeamCount`）。
- `members`（姓名、性別、所屬公司 `org_id`）：同隊各公司都看得到，用於安排項目選手；但只能新增 / 修改 / 刪除**自己公司**的隊員。`(team_id, org_id)` 有複合外鍵指向 `team_orgs`。
- `member_private`（身分證 / 居留證、生日、手機、尺寸、用餐、特殊需求）：**只有隊員所屬公司與管理員**看得到；前端 `Member.private === null` 代表無權檢視或已被清除。`national_id` 全活動唯一。
- `organizations` 只回傳自己公司（含邀請碼）；其他公司名稱一律用 `org_names()` / `api.listOrgNames()`，避免洩漏邀請碼。
- `event_entries` 不存 team_id，隊伍經由 member 推得；聯隊內任一公司都可為全隊安排選手。
- `events` 為資料驅動，程式不應寫死特定項目；`category` 只影響標示（健力已不需體重）。
- 帳號：註冊時 trigger 建 `profiles`（`org_admin`、無公司）→ `join_org(邀請碼)` 綁定；管理員需手動把 `profiles.role` 改為 `super_admin`。

### 規則重複存在於前後端，修改時必須同步
| 規則 | 資料庫（強制） | 前端（即時提示 / 展示模式） |
| --- | --- | --- |
| 隊伍人數上限、每項每隊上限、每人項目數、截止鎖定、自組額度 | migration 中的 trigger 與 `create_team` | `src/lib/rules.ts` 的 `check*` |
| 身分證 / 居留證檢查碼、性別與證號一致、生日不可在未來 | `tw_id_valid`、`tw_id_gender`、`member_private_before_write` | `src/lib/idNumber.ts`、`src/lib/member.ts` |
| 人數 / 女性下限（「未完成」，不阻擋寫入） | — | `rules.ts` 的 `evaluate*` |

另外需同步的重複資料：比賽項目初始資料（migration 尾端 ↔ `src/lib/api/demoSeed.ts` 的 `DEMO_EVENTS`）、資料表欄位（migration ↔ `src/lib/types.ts`）。
`20261117000000_init.sql` 已於 2026-11-17 以 Supabase SQL Editor 套用到正式專案（ref `sxonocgtoupelrdolumj`），**不可再修改**。schema 變更請新增 `supabase/migrations/<timestamp>_<name>.sql`，先跑 `npx vitest run supabase/tests`，再請使用者於 SQL Editor 執行（此專案未使用 Supabase CLI 的 migration 紀錄；若日後改用 CLI，需先 `supabase migration repair --status applied 20261117000000`）。

### 環境
- 本機 `.env.local`（不提交）已指向**正式** Supabase：`npm run dev` 的操作會寫入正式資料庫。測試請用 `npm run dev:demo`（`.claude/launch.json` 的 `dev-demo`，port 5174）。
- GitHub repo `hrhexagonty/HexagonSportDay` 的 Actions secrets 存放相同的 URL / publishable key；網站：https://hrhexagonty.github.io/HexagonSportDay/
- Supabase Auth 建議關閉「Confirm email」：內建寄信服務只寄給專案成員，公司窗口收不到驗證信（未設定自訂 SMTP 前）。

### 前端路由與部署
- 使用 `HashRouter` + `vite.config.ts` 的 `base: './'`（GitHub Pages 無 SPA fallback）；頁內錨點不可用 `href="#..."`，請用 `scrollIntoView`。
- 路由守衛 `src/auth/RequireAuth.tsx`：`admin`、`org`（需綁定公司）、`member`（公司或管理員，用於 `/teams/:id`）、`any`。
- 批次匯入欄位順序定義在 `src/lib/importParse.ts` 的 `IMPORT_COLUMNS`（生日支援民國年）。
- 部署：`.github/workflows/deploy.yml` 推送 `main` 即測試 + 建置 + 部署；Supabase 連線資訊放 GitHub Actions secrets。
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
- 首頁為 Hero（12 欄分割）→ Bento（4 欄，資料驅動：大卡為各項目名額長條、高卡為報名規則、健力為萊姆強調卡）→ 淺灰對比區（報名流程 + 個資說明）。窄於 1100px 時 Hero 改單欄（12 欄 × 大間距會撐出最小寬度）。
