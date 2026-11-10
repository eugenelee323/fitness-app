# 12週增肌

單一使用者、繁體中文、手機優先的離線 PWA。階段 0 已建立：React／TypeScript strict／Tailwind、HashRouter 五分頁、Dexie 與 zod、內建計畫、個人資料匯入與 Pages 部署流程。

## 本機使用

需要 Node.js 24 與 pnpm 11.25.0。在專案目錄執行：

```sh
pnpm install
pnpm dev
```

開啟終端機顯示的 `http://127.0.0.1:5173/fitness-app/`。若要驗收離線功能，使用正式建置預覽：

```sh
pnpm build
pnpm preview --port 4173 --strictPort
```

瀏覽器開啟 `http://127.0.0.1:4173/fitness-app/`。首次連線載入完成後，service worker 會快取應用程式；之後可離線重新開啟。開發模式不註冊 service worker。本機伺服器只綁定電腦的 127.0.0.1；手機請使用部署後的 HTTPS 網址。

## 匯入與階段 0 驗收

1. 首次開啟會顯示「匯入個人資料」。選擇本機 `my-data.json`，檢查各表筆數，再按「確認匯入」。也可以略過後從設定頁匯入。
2. 前往「訓練」，展開週次，確認 12 週的菜單、階段、減量週與中英文動作名稱。第 2 週套用規格的目標重量，其餘週重量保留為試重／待確認；不預先套用未接受的建議。
3. 減量週組數減半，奇數組向上取整；目標 RIR 3。第 4 週的延後減量判斷將於階段 2 實作。
4. 前往「設定」，確認已匯入的個人資料、營養目標、身體數據與紀錄筆數。重新整理後資料仍保留。
5. 匯入只接受第 13 節個人資料的六張表，支援 `week_no`、`ref`、`session_ref`、`exercise_code`，會對應內建 UUID。確認前不寫入；寫入失敗整批回復。同日營養／身體數據及同次訓練更新，其他紀錄保留。
6. 首次載入完成後，以瀏覽器開發工具的離線模式重新整理，確認首頁與各 HashRouter 路徑可開啟。實體手機安裝仍需在部署後驗收。

首頁保留入口；飲食與分析保留空白狀態。階段 1–4 的訓練操作、備份、每週規則與圖表尚未實作。第 12 節規則引擎的完整案例屬階段 2；目前測試涵蓋本階段的減量計畫純函式、初始化、持久化、驗證與匯入交易。

## GitHub Pages

1. 建立名為 `fitness-app` 的 repository，將程式碼推送到 `main`。不要上傳 `my-data.json` 或任何備份；這些檔案已列入 `.gitignore`。若透過網頁手動上傳，仍須自行排除，GitHub 上傳介面不會套用本機 `.gitignore`。
2. 在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. `main` 的 push 會執行 lint、typecheck、test、build，再部署 `dist/`。也可在 Actions 手動執行「部署 GitHub Pages」。
4. 部署網址為 `https://<GitHub帳號>.github.io/fitness-app/`，實際連結可在 Pages 或 workflow 的 deployment 結果取得。Vite base 已固定 `/fitness-app/`。
5. iPhone：Safari 開啟部署網址 → 分享 → 加入主畫面。
6. Android：Chrome 開啟部署網址 → 選單 → 安裝應用程式／加到主畫面。

GitHub repository：[eugenelee323/fitness-app](https://github.com/eugenelee323/fitness-app)。推送後仍需在 Settings → Pages 選擇 GitHub Actions，並確認部署工作流程成功。

## 資料與開發規範

- 沒有後端、登入、API 金鑰或執行期外部服務呼叫；所有資產由本站提供。
- 個人資料只來自使用者選取的檔案；不會讀取專案中的 `my-data.json` 並打包。
- 第 11 節 SQL 共 17 張應用資料表，移除 `auth.users`、`user_id`；單人資料仍以 UUID 主鍵儲存，替代動作使用複合主鍵。
- 資料結構定義於 `src/db/schema.ts`；Dexie 版本 2 新增週次排序索引，保留版本 1 既有資料。後續異動必須使用新版本升級，不可刪庫重建。
- 動作與課表位於 `src/seed/`，交易式初始化，重複啟動不會重複寫入。
- 重量、組數、熱量、容量計算放在 `src/lib/rules/` 並逐一測試；未來建議文字放在 `src/lib/explain/` 固定範本。
- 啟動時呼叫 `navigator.storage.persist()`；是否授權由瀏覽器決定。
- 資料儲存在目前瀏覽器與來源網址的 IndexedDB；不同電腦、瀏覽器或網址不會共享資料。

交付前必須執行：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

技術參考：[Tailwind 的 Vite 安裝方式](https://tailwindcss.com/docs/installation/using-vite)、[Vite PWA 官方文件](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/guide/index.md)。
