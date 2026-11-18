# 運動會報名平台

由活動小組預先建立公司與隊伍，各隊窗口以「隊伍 + 邀請碼」註冊後填寫隊員，並為 4 項趣味競賽（同心鼓顛球、四關障礙接力、
嗨ROX競賽、毛毛蟲大隊接力）安排選手的報名網站（健力比賽改以公司為單位報名，另行開放）。預設規模：24 隊（可調整）、約 900 人；
數家小公司可合組聯隊。

- 前端：Vite + React + TypeScript，部署於 GitHub Pages
- 後端：Supabase（Postgres + Auth + Row Level Security）
- 未設定 Supabase 時自動進入**展示模式**（資料存在瀏覽器 localStorage），可直接體驗完整流程

## 角色與流程

| 角色 | 可以做什麼 |
| --- | --- |
| 活動管理員（`super_admin`） | 建立公司與隊伍、拖曳公司到隊伍底下（含聯隊）、設定每隊窗口人數、管理邀請碼與窗口、調整比賽規則與報名截止、查看所有隊伍進度、匯出名單（含保險名冊）、活動後清除個資 |
| 隊伍窗口（`org_admin`） | 首次註冊：輸入邀請碼 → 確認系統帶出的隊伍 → 設定信箱密碼 → 填寫 / 批次貼上隊員 → 把隊員人偶拖曳到各項目框指派選手（觸控裝置可先點人偶再點項目框）；代表多隊時可用同一個信箱（輸入原本的密碼）或登入後輸入其他隊的邀請碼，於「我的隊伍」同時管理 |

- 隊員欄位：姓名、性別、身分證 / 居留證字號（驗證檢查碼，全活動不可重複）、生日、用餐習慣、特殊需求、手機、衣服尺寸。
- **邀請碼**：每支隊伍 × 每家參與公司各一組；聯隊中窗口以哪家公司的邀請碼註冊，就歸屬哪家公司。每隊可綁定的窗口人數由管理員設定。
- **個資隔離**：隊員個資只有該隊所屬公司的窗口與管理員看得到；聯隊中其他公司只看得到姓名與性別（用於安排選手）。
- 報名規則（每隊人數、各項目人數與女性下限、每人最多報名項目數）由系統即時檢核，並同時以資料庫 trigger 強制執行；
  報名截止後公司窗口無法再修改資料。

## 本機開發

```bash
npm install
npm run dev          # http://localhost:5173 ，有 .env.local 會連正式資料庫，沒有則為展示模式
npm run dev:demo     # 強制展示模式（不論是否有 .env.local），測試 UI 或流程時使用
```

展示模式帳號：登入頁有快速登入按鈕（管理 2 隊的六角科技窗口 `org@demo.local`、參與聯隊的六角能源窗口 `energy@demo.local`、
管理員 `admin@demo.local`，密碼皆為 `demo`）。「首次註冊」可用邀請碼 `TECH03`（六角科技 獵豹隊）、`BUIL04`（六角建設 鋼鐵隊）等體驗
（管理後台「窗口與邀請碼」可查看全部）。展示資料的證號皆為隨機產生的假資料。頁首的「重置展示資料」可還原初始資料。

其他指令：

```bash
npm test             # 單元測試 + 資料庫測試（以 PGlite 實際執行 migration 驗證 RLS）
npm run typecheck    # TypeScript 型別檢查
npm run build        # 型別檢查 + 打包到 dist/
```

## 連接 Supabase

1. 在 [Supabase](https://supabase.com) 建立專案。
2. 建立資料表：到 **SQL Editor** 依檔名順序執行 `supabase/migrations/` 下每個 `.sql` 的全部內容
   （或使用 CLI：`npx supabase link --project-ref <ref>` 後 `npx supabase db push`）。
3. 設定 Auth：**Authentication → URL Configuration** 的 Site URL / Redirect URLs 加入正式網址
   （例如 `https://<帳號>.github.io/<repo>/`）與 `http://localhost:5173`，註冊驗證信才會導回網站。
   Supabase 內建寄信服務只會寄給專案成員，未設定自訂 SMTP 前，建議在 **Sign In / Providers → Email** 關閉
   「Confirm email」（否則窗口收不到驗證信就無法登入；註冊時的隊伍綁定不受影響）。
4. 複製 `.env.example` 為 `.env.local`，填入 Project URL 與 Publishable key（Project Settings → API）。
5. 建立管理員：網站註冊需要隊伍邀請碼，因此請在 **Authentication → Users → Add user** 建立帳號（勾選 Auto Confirm），
   再到 SQL Editor 執行
   ```sql
   update public.profiles set role = 'super_admin' where email = '你的信箱';
   ```
6. 以管理員登入 →「隊伍配置」：01 建立公司 → 02 建立隊伍 → 03 把公司拖曳到隊伍底下（一隊有多家公司即為聯隊）→
   「窗口與邀請碼」設定每隊窗口人數、下載邀請碼清單交給各隊窗口。
7. 活動結束、保險期間屆滿後，於「匯出名單」最下方執行「清除所有個資」。

## 部署到 GitHub Pages

1. 推送到 GitHub 的 `main` 分支。
2. Repo **Settings → Pages → Source** 選擇 **GitHub Actions**。
3. Repo **Settings → Secrets and variables → Actions** 新增 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`
   （未設定則部署為展示模式）。
4. 之後每次推送 `main`，`.github/workflows/deploy.yml` 會自動測試、建置並部署。

## 目錄

```
supabase/migrations/   資料表、RLS、業務規則 trigger、RPC、初始比賽項目
supabase/tests/        資料庫測試（PGlite）
src/lib/rules.ts       報名規則（完成度檢核、寫入前檢查）
src/lib/idNumber.ts    身分證 / 居留證驗證與遮罩
src/lib/api/           資料存取層：supabase.ts（正式）/ demo.ts（展示模式）
src/pages/             首頁、登入、單位隊伍、隊伍填報、管理後台
```
