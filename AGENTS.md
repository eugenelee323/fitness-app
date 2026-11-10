# AGENTS.md
專案：12 週智慧健身訓練與營養管理 PWA（單一使用者、繁體中文、手機優先、資料存在手機）。
規格：docs/spec.md（第 1–15 節）。衝突時以 spec 為準，不確定就停下來問。

技術：Vite + React + TypeScript strict + Tailwind；vite-plugin-pwa；Dexie（IndexedDB）+ zod；Recharts；Vitest；pnpm。
部署：GitHub Actions → GitHub Pages。

硬性規則：
1. 沒有後端、沒有登入、沒有任何 API 金鑰或外部服務呼叫。
2. 重量、組數、熱量、容量只能由 src/lib/rules/ 的純函式計算；建議文字用 src/lib/explain/ 的固定範本。
3. src/lib/rules/ 每個函式都要有單元測試；spec 第 12 節的測試案例必須通過。
4. 建議需使用者接受後才可改課表；每筆變更寫入 plan_changes。
5. 個人資料不可寫進程式碼或 repo，只能從 my-data.json 匯入；my-data.json 與 *backup*.json 列入 .gitignore。
6. 數值以公制儲存；時區 Asia/Taipei。
7. 介面文字一律繁體中文；動作名稱顯示中文＋英文。
8. 啟動時呼叫 navigator.storage.persist()；資料結構變更一律寫 Dexie 版本升級，不可清空舊資料。
9. 每次交付前執行 pnpm lint、pnpm typecheck、pnpm test 並全部通過。
