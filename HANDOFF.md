# 交接文件：HexagonSportDay 運動會報名平台

> 更新日期：2026-11-20　｜　最新功能 commit：`0f33e15`（`main`，已推送並部署；之後只有本檔的更新 commit）
> 本檔記錄**進度、決策、工作慣例與環境細節**；架構、資料模型、前後端規則同步表、UI 規範請看 [CLAUDE.md](CLAUDE.md)，兩份都要讀。

---

## 1. 目前狀態一覽

| 項目 | 狀態 |
| --- | --- |
| 程式碼 | `main` 乾淨，無未提交變更；最新功能 commit `0f33e15` |
| 部署 | GitHub Actions（測試 → 建置 → 部署）已成功；網站 https://hrhexagonty.github.io/HexagonSportDay/ 為最新版 |
| 資料庫 | 7 支 migration **全部已套用**到正式 Supabase（見第 3 節） |
| 進行中的工作 | 無。等待使用者提出下一個需求 |
| 正式站使用情況 | 使用者已開始使用：已發放邀請碼（29 組隊伍 × 公司），已有窗口完成註冊 |

---

## 2. 已完成功能（依時間）

| 日期 | commit | 內容 |
| --- | --- | --- |
| 11-17 | `5b4ae10` | 建立報名平台雛形（Vite + React + Supabase、RLS、PGlite 資料庫測試） |
| 11-18 | `15ef114` | 改用 Obsidian & Lime 玻璃擬態介面 |
| 11-18 | `fb13699` | GitHub Actions 部署工具升級至 Node 24 |
| 11-18 | `0ae6823` | 改為以「隊伍」登入：管理員建立隊伍 / 公司，隊伍 × 公司各一組邀請碼 |
| 11-18 | `f22c200` | 後台「隊伍配置」改為拖曳公司到隊伍底下（聯隊 = 一隊多公司） |
| 11-18 | `d8ea3d0` | 首頁版面調整、移除 HEXAGON 字樣、登入頁隊伍改為點選 |
| 11-18 | `4838152` | 首次註冊改為先輸入邀請碼（由邀請碼帶出隊伍）；同一信箱可代表多隊 |
| 11-18 | `8574b19` | 項目報名改為拖曳人偶；報名檢核改為男女分色進度條 |
| 11-19 | `1245145` | 新增「競賽規則」頁（規則文字 + 示範影片連結）與「我的公司」健力組隊 |
| 11-19 | `182124a` | 聯隊隱私：其他公司的窗口只看得到隊員姓名、性別、用餐習慣 |
| 11-19 | `e12083a` | 隊員只需填姓名、性別即可送出；證號 / 生日 / 用餐可之後補，名單標示「資料待補」 |
| 11-20 | `94f9341` | 新增本交接文件 |
| 11-20 | `5800992` | 新增「委外廠商」角色（唯讀後台、個資隱碼、可編輯活動與項目設定）；用餐習慣新增「葷食不吃豬」 |
| 11-20 | `0f33e15` | 每一頁頁尾最下方加入「主辦單位：特耀餐飲服務股份有限公司」「承辦廠商：桔中人娛樂文化有限公司」 |

另外產出（不在 repo）：邀請碼便條 PDF，見第 7 節。

### 最近一次變更（`5800992` 委外廠商、`0f33e15` 頁尾）重點
- DB（`20261123000000_vendor_role.sql`）：`vendors`（廠商名稱、邀請碼、帳號數）、`vendor_contacts`（帳號 ⇄ 廠商）；`is_vendor()`、`bind_vendor`、`join_vendor`、`my_vendor`、`lookup_invite`（取代 `lookup_team_invite`，可查隊伍或廠商邀請碼）、`vendor_teams()`（隊長電話隱碼）、`vendor_member_private()`（證號 / 生日 / 手機隱碼）；廠商對 `members`、`event_entries`、`org_squads`、`org_squad_members` 唯讀，對 `settings`、`events` 可 update（不可改項目代碼 / 類別 / 排序）；隊伍與廠商邀請碼不可重複；`member_private.diet` 新增 `meat_no_pork`。
- 前端：`Role` 新增 `'vendor'`（`SessionInfo.vendorName`）；`/admin` 路由守衛改為 `staff`；廠商只看到「填報總覽、隊伍配置、健力報名、活動與項目設定」，`AdminData.readOnly` / `TeamPageData.isVendor` 控制唯讀；管理員在「窗口與邀請碼」最下方「委外廠商」區塊管理廠商邀請碼與帳號；`supabase.ts` 以 `vendorSession` 讓廠商改走隱碼 RPC；`src/lib/mask.ts` 為展示模式的隱碼實作。
- `DataApi` 改名：`registerForTeam` → `registerWithInvite`、`lookupTeamInvite` → `lookupInvite`（`InviteInfo` / `JoinInput` 改為 `kind: 'team' | 'vendor'` 聯集）。
- 展示模式資料升版為 v8：新增展示廠商「（範例）活動執行公司」（邀請碼 `VENDOR01`、帳號 `vendor@demo.local` / `demo`）；部分展示隊員用餐為「葷食不吃豬」。
- 頁尾：`Layout.tsx` 的 `CREDITS` 常數（首頁大頁尾與內頁精簡頁尾都顯示在最下方）。

---

## 3. 資料庫 migration 狀態

全部由使用者在 Supabase **SQL Editor** 手動執行（未使用 Supabase CLI 的 migration 紀錄）。**已套用的檔案一律不可再修改**。

| 檔案 | 內容 | 套用 |
| --- | --- | --- |
| `20261117000000_init.sql` | 初始 schema、RLS、trigger、RPC、比賽項目 | 2026-11-17 |
| `20261118000000_team_login.sql` | 改為以隊伍登入、隊伍 × 公司邀請碼 | 2026-11-18 |
| `20261119000000_invite_first.sql` | 先輸入邀請碼、`lookup_team_invite`、一信箱多隊 | 2026-11-18 |
| `20261120000000_company_squads.sql` | 競賽規則欄位、公司組隊（健力）、`org_roster` | 2026-11-19 |
| `20261121000000_member_diets.sql` | 聯隊其他公司只看得到用餐習慣（`member_diets()`） | 2026-11-19 |
| `20261122000000_optional_member_fields.sql` | 證號、生日、用餐改為選填 | 2026-11-19 |
| `20261123000000_vendor_role.sql` | 用餐新增「葷食不吃豬」、委外廠商角色（`vendors`、`vendor_contacts`、隱碼 RPC） | 2026-11-20 |
| `20261124000000_guide_pages.sql` | 活動指南五個頁面（`guide_pages`）；登入可讀、管理員與委外廠商可改 | 2026-11-20 |
| `20261125000000_security_hardening.sql` | 資安強化：已綁定身分才能讀指南與公司名稱（`is_participant`）、身分證重複訊息不透露、anon 撤銷敏感資料表權限、指南不可新增刪除 | 2026-11-26 |
| `20261126000000_invite_throttle.sql` | 邀請碼查詢節流：查錯記錄 IP（`invite_lookup_failures`）並回傳空結果，同一 IP 15 分鐘查錯 20 次暫停；撤銷 `lookup_team_invite` | 2026-11-26 |

**正式資料與種子資料的差異**：健力（powerlifting）的女性下限在正式資料庫是 **3**，migration 種子與 `demoSeed.ts` 仍是 4。項目設定以資料庫為準，程式不寫死。

---

## 4. 使用者已確認的需求決策（不要重複詢問）

- 規模約 24 隊（可能調整）、約 900 人；一家公司可派多隊，多家小公司可合併為一隊（聯隊）。
- 4 項趣味競賽：同心鼓顛球、四關障礙接力、嗨ROX競賽、毛毛蟲大隊接力。每隊每項暫訂 10 人、無男女比例，管理員可在後台修改。
- 公司窗口可替全隊（含聯隊其他公司的隊員）安排比賽項目。
- 證號檢查：身分證與新式居留證（第 2 碼 8 / 9）檢查檢查碼與性別；舊式居留證（2 碼英文）只檢查格式、不判斷性別。
- 健力：以**公司**為單位組隊（不是隊伍），每隊 10 人、至少 3 女（正式設定）；不限隊數；不計入「每人最多 N 項」；截止前可「取消送出」再調整。
- 競賽規則的示範影片：貼連結（http/https），不上傳檔案。
- 邀請碼發給各隊代表；首次註冊必須先輸入邀請碼，不讓使用者自選隊伍；同一窗口可用同一信箱代表多隊。
- 聯隊隱私：自己公司的隊員看得到完整個資；聯隊其他公司的隊員只看得到姓名、性別、用餐習慣。
- 隊員只有姓名、性別必填，其餘可之後補。
- 用餐習慣選項：葷食、葷食不吃豬、蛋奶素、全素。
- 委外廠商：以廠商邀請碼「輸入邀請碼 → 註冊 → 登入」；管理員可建立**多組**廠商邀請碼（每組有廠商名稱、可註冊帳號數）。權限：
  - 填報總覽、各隊隊員名單（姓名、性別、用餐、特殊需求、尺寸、已報項目）、項目報名、隊伍配置、健力報名（含下載 CSV）：**只能檢視**。
  - 證號、生日、手機、**隊長電話**一律隱碼。
  - 「活動與項目設定」**整頁可編輯**（含報名開關、截止時間、人數上下限；使用者已知會影響所有隊伍）。
  - 「窗口與邀請碼」「匯出名單」看不到。
  - 廠商帳號不能同時擔任隊伍窗口。
- 頁尾最下方固定顯示：主辦單位：特耀餐飲服務股份有限公司；承辦廠商：桔中人娛樂文化有限公司。
- 活動指南（場地配置、當天活動流程、隊服顏色對照、餐食內容、交通規劃）：導覽列以「活動指南 ▾」下拉選單呈現；登入才能看；管理員與委外廠商在後台「活動設定」編輯；編輯器為所見即所得 + 可切換 HTML 原始碼（顯示前過濾危險語法）；圖片壓縮後存在頁面內容（每頁約 5MB 上限），不用 Supabase Storage。後台原「活動與項目設定」拆成「活動設定」與「競賽項目設定」兩個頁籤。

---

## 5. 使用者的工作慣例（務必遵守）

### 溝通
- 回答與 commit message 一律**繁體中文**；程式碼註解用**中文**。
- 開啟 `.md` 文件一律用 `code <path>`，不要直接把內容印出來。
- 需求以 `/新功能` 開頭時：**先不要實作**。先檢查與現有功能的矛盾、衝突、可行性問題，提出挑戰與參考解法，等使用者明確指示再規劃或實作。
- 使用者常附截圖說明需求；需求有不明確之處時用選項方式詢問（附推薦選項）。

### 提交與推送
- 只有使用者要求時才 commit / push。常見說法：「提交並推送」、「提交工作目錄中的變更…」、「推送」；若說「完成後自行推送與部署」則可自行推送並確認部署。
- commit message：繁中、第一行一句話說明變更，結尾加
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（依當時使用的模型調整）。
- 推送 `main` 即自動部署，推送前確認 `npm test` 與 `npm run build` 都通過。

### 資料庫 schema 變更流程
1. 新增 `supabase/migrations/<timestamp>_<name>.sql`（時間戳接在 `20261123000000` 之後），**不要修改已套用的檔案**。
2. 同步更新：`src/lib/types.ts`、`demo.ts`（模擬 RLS / trigger）、`rules.ts` 等前端規則（見 CLAUDE.md 的同步表）；展示資料結構變更時把 `demo.ts` 的 `STORAGE_KEY` 與 `demoSeed.ts` 的 version 一起升版（目前 v8）。
3. 跑 `npx vitest run supabase/tests`、`npm test`、`npm run build`。
4. 請使用者到 Supabase SQL Editor 執行該檔全文。使用者回覆「**SQL 已執行**」後，再提交 / 推送前端。
5. 前端依賴新 schema 時，**SQL 套用前不可推送**（否則正式站會壞）。順序固定是「先 SQL → 再推送」，中間會有短暫的新舊不相容空窗。
6. 能用 publishable key 驗證的就驗證（例如以 anon 呼叫新 RPC，回 `42501` 代表函式存在但無權限、`PGRST202` 代表不存在）；驗證不了的（例如欄位是否可 null）請使用者在 SQL Editor 查 `information_schema.columns`。
7. 更新 CLAUDE.md 的 migration 狀態段落。

---

## 6. 安全與資料界線

- **絕不**索取或使用 Supabase 的 service_role / secret key、資料庫密碼；只用 `.env.local` 裡的 publishable key（它本來就會出現在前端 bundle）。
- 不用使用者的帳號密碼登入任何網站；管理員帳號由使用者在 Supabase Dashboard → Authentication → Add user 建立，再把 `profiles.role` 改為 `super_admin`。
- `.env.local` 不提交。
- `npm run dev` 連的是**正式資料庫**；UI 測試一律用 `npm run dev:demo`（展示模式，port 5174）。不要在正式站建立測試資料。
- 邀請碼、隊員個資（身分證、生日、手機等）屬敏感資料：邀請碼 CSV / PDF、隊員匯出檔只留在本機，**不可發布成 Artifact、不可上傳到外部服務、不可寫進 repo**。

---

## 7. 環境與操作細節

### 本機 / 帳號
- Windows 10，PowerShell 與 Git Bash 都可用。專案路徑 `C:\Users\owner\HexagonSportDay`。
- repo 的 git 身分已設為 repo-local（`user.name = jim`），不要改全域設定。
- GitHub：repo 為 `hrhexagonty/HexagonSportDay`，`gh` 已登入 `hrhexagonty`。Windows 認證管理員快取了另一個 GitHub 帳號的憑證，直接 `git push` 會用錯帳號，請用：
  ```bash
  git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main
  ```
- 部署確認：
  ```bash
  gh run list --repo hrhexagonty/HexagonSportDay --limit 3
  gh run watch <run-id> --repo hrhexagonty/HexagonSportDay --exit-status
  ```
  完成後抓正式站 `index.html` 引用的 `assets/index-*.js`，搜尋這次新增的文字，確認已上線。
- `.env.local`（不提交）：`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`，指向正式專案（ref `sxonocgtoupelrdolumj`）。若換電腦，請使用者提供或從 Supabase Dashboard 取得；GitHub Actions secrets 存放相同的值。

### 本機產出檔（不在 repo，含敏感資料）
- `C:\Users\owner\Downloads\2027集團運動會_隊伍邀請碼_20261119.csv`：後台匯出的邀請碼清單。
- `C:\Users\owner\Downloads\2027集團運動會_邀請碼便條_20261119.pdf`：A4 共 4 頁、29 張便條（每頁 2×4，沿虛線裁切），每張含隊伍、公司、邀請碼、窗口人數、聯隊註記、註冊步驟、網址與截止時間 2027/3/15（一）20:00。尚未實際送印測試裁切尺寸。

### 測試與驗證技巧
- 單元 + 資料庫測試：`npm test`（PGlite 實際跑全部 migration 並模擬 `auth.uid()`、anon / authenticated）。DB 測試輔助函式：`as`、`asAnon`、`addMembers`、`row`、`memberId`、`twId(gender, seq)`；測試用證號要注意性別碼（男 `A1…`、女 `B2…`），否則會先觸發「性別不符」。
- 展示模式資料存在 localStorage `hexagon-sportday-demo-v9`；展示資料的邀請碼為「公司前綴 + 隊伍編號」（例如 `TECH03`），委外廠商為 `VENDOR01`；登入頁有各角色（含委外廠商）的快速登入按鈕。
- 內建瀏覽器窗格很窄，視覺檢查改用 playwright-core + 系統 Edge 截圖（之前的腳本放在舊工作階段的暫存資料夾，已不可用，需要時重新安裝 / 撰寫）。窗格被隱藏時截圖會是全黑，改用 `javascript_tool` 讀 DOM 與 `getBoundingClientRect` 檢查版面。
- 原生拖曳（HTML5 drag & drop）無法用 CDP 滑鼠事件驅動；測試拖曳邏輯請 dispatch 合成的 `DragEvent`（帶 `DataTransfer`），或用觸控的「點選人偶 → 點項目框」模式。
- 用 Bash heredoc 跑 Python 改檔時，`\t` / `\n` 會被轉成真的 Tab / 換行而弄壞原始碼；內容含反引號（JS 樣板字串）的 heredoc 在 Bash 工具中也會解析失敗。請先用 Write 工具把改檔腳本寫成 `.py`（放暫存資料夾）再執行，或直接用編輯工具。

---

## 8. 待辦與未驗證事項

- [x] **資安強化（2026-11-26 上線，`dcdafd4`）**：依本機的資安評估報告（`資安評估報告_2026-11-23.md`，已列入 `.git/info/exclude`，**不可提交到公開 repo**）完成 M1、M3、L1、L2、L4。`20261125000000_security_hardening.sql` 已套用並以未登入身分驗證（敏感資料表與 `is_participant` / `org_names` 皆回 42501，`settings`、`events`、`lookup_invite` 照常）；正式站未登入頁面監聽 `securitypolicyviolation` 為 0，使用者登入後檢查活動指南與後台也正常。報告中標為「可選」或「視需要」的項目（擋下沒有邀請碼的註冊、限制外部圖片、repo 改 private、換主機）使用者決定暫不處理。
- [x] **邀請碼查詢節流（2026-11-26 套用）**：`20261126000000_invite_throttle.sql` 已套用，前端不需改版（空結果原本就顯示「邀請碼錯誤」）。正式環境實測：`lookup_team_invite` 回 42501；帶偽造 `X-Forwarded-For` / `X-Real-IP` 查假邀請碼回 `[]`，失敗紀錄的 `source` 為 `cf-connecting-ip`、IP 為真實來源（偽造值無效）；自帶 `CF-Connecting-IP` 的請求被 Cloudflare 以 403（error code 1000）擋下。
- [x] Dependabot：2026-11-26 已以 `gh api` 開啟漏洞警示（vulnerability-alerts）與自動安全更新（automated-security-fixes）。Dependabot 的 PR 不會跑 CI（workflow 只在推送 `main` 時執行），合併後才在部署流程中跑測試，測試失敗就不會部署。
- [ ] 資安評估中需使用者自行處理的設定：Supabase / GitHub 兩步驟驗證、密碼長度與 Leaked password protection、收斂各隊窗口名額、個資匯出與清除流程（見報告第 6、7 節）。

- [ ] **活動指南正式站實測**：`20261124000000_guide_pages.sql` 已套用（anon 查詢 `guide_pages` 回 `42501`，表示資料表存在且未登入讀不到）。尚未驗證：五列預設資料（可在 SQL Editor 執行 `select id from guide_pages`）、實際編輯存檔，以及大內容（數 MB 圖片）是否會被 Supabase API 的請求大小限制擋下。

- [ ] **委外廠商正式站實測**：`20261123000000_vendor_role.sql` 已套用（anon 呼叫 `lookup_invite` 回 P0001、其餘廠商函式與 `vendors` 表回 `42501`），前端已部署；但正式站尚未實測「管理員建立廠商邀請碼 → 廠商註冊 → 後台唯讀與隱碼」（避免在正式資料庫建立測試資料），請使用者以真正要給廠商的邀請碼實測。
- [ ] **正式站實測**：只填姓名、性別新增一位隊員，確認可存檔（為避免在正式資料庫產生測試資料，交接前未實測；資料庫是否已允許 null 依使用者回報判斷）。若出現「欄位不可為空」之類錯誤，代表 `20261122` 未套用成功。
- [ ] 競賽規則頁的 YouTube 示範影片：嵌入畫面在預覽窗格顯示為黑畫面，實際播放未驗證。
- [ ] 邀請碼便條 PDF 未實際列印測試裁切。
- 已知殘留風險（已告知使用者）：身分證重複時訊息已改為不透露證號，但因資料庫仍拒絕重複寫入，「被拒絕」本身仍可用來推測某人已報名；要完全消除需改為允許重複、由管理員事後審核。
- 建議（尚未處理，視使用者需要）：Supabase Auth 建議關閉「Confirm email」，或設定自訂 SMTP；內建寄信服務只寄給專案成員，公司窗口收不到驗證信。
- 目前沒有進行中的實作任務。
