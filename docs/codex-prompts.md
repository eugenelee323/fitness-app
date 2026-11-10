# 交給 Codex 的指令（依序貼上，每階段驗收通過再貼下一段）

## 階段 0 指令

```text
請依 docs/spec.md 建立專案骨架：
1. Vite + React + TypeScript + Tailwind + vite-plugin-pwa（manifest、離線快取、可加到主畫面；APP 名稱「12週增肌」）。
2. src/db/：依第 11 節建立 Dexie schema 與 zod 驗證。
3. src/seed/：內建第 15 節「初始資料」的動作庫、替代動作、12 週計畫（A / B 菜單、階段、減量週、第 2 週目標重量），第一次開啟時寫入。
4. 第一次開啟顯示「匯入個人資料」畫面，可選 my-data.json（第 13 節格式）匯入；也可略過，之後在設定頁匯入。
5. 底部 5 個分頁（首頁、訓練、飲食、分析、設定）的空白頁面；用 HashRouter，避免 GitHub Pages 重新整理時 404。
6. GitHub Actions：push 到 main 自動 build 並部署到 GitHub Pages；vite base 設為 repository 名稱。
完成後用條列告訴我：怎麼在 GitHub 開啟 Pages、網址是什麼、怎麼在 iPhone 與 Android 加到主畫面。
```

## 階段 1 指令

```text
依 docs/spec.md 第 7、8 節實作訓練紀錄：
1. 首頁儀表板：第幾週、A / B 菜單、是否減量、今日課表、本週完成率、備份提醒。
2. 今日訓練：動作卡片顯示目標與上次數據；每組預填目標；「完成這組」後自動開始休息計時；單手動作分左右記錄；替換動作。
3. 結束訓練填疲勞、睡眠、疼痛；顯示當次容量、各肌群有效組數（用 src/lib/rules 的 setVolume、fractionalSets）。
4. 訓練歷史列表與單次詳情。
5. 設定頁：匯出 / 匯入 JSON 備份（第 13 節格式），匯入前顯示各表筆數並確認。
驗收：第 14 節階段 1。
```

## 階段 2 指令

```text
依 docs/spec.md 第 1–5、12、13 節實作規則引擎與每週分析：
1. src/lib/rules/ 依第 12 節程式碼實作，補齊每週彙總函式（完成率、各肌群組數與容量、e1RM 進退步、停滯週數、疲勞與睡眠平均）。
2. 單元測試含第 12 節全部案例，覆蓋率 ≥ 90%。
3. src/lib/weekly/：結算 → 寫入 weekly_analyses 與 recommendations；打開 APP 時若已過週日 21:00 且未結算就自動執行，設定頁另有「結算本週」按鈕。
4. src/lib/explain/：每個 ruleId 一個繁中文文字範本。
5. 每週報告頁與下週建議頁：逐條接受 / 拒絕 / 修改；全部處理後產生下週 planned_exercises 並寫入 plan_changes，提醒匯出備份。
驗收：第 14 節階段 2。
```

## 階段 3 指令

```text
依 docs/spec.md 第 4、6–8、13 節實作飲食：
1. 手動輸入一餐：餐別、食物名稱、公克數、熱量、蛋白質、碳水、脂肪；修正公克數時依比例重算。
2. src/lib/paste/：解析第 13 節「Claude 估算的貼上格式」，寫單元測試（範例文字應解析成 2 項、全形符號也可、錯誤行標出不當掉）。
3. 常用餐點：把一餐存成常用，之後一鍵帶入。
4. 當日熱量、蛋白質進度條與 dailyStatus 達標判定；晚上 9 點後打開 APP 若蛋白質還差 30 g 以上就提示。
5. 每週結算加入 weeklyKcalDelta 建議。
驗收：第 14 節階段 3。
```

## 階段 4 指令

```text
依 docs/spec.md 實作身體數據與圖表：
1. 體重（每日）與腰圍（每週）輸入；7 日平均。
2. 訓練分析頁：各肌群每週有效組數（標出 10–20 組區間）、每週容量趨勢、主動作 e1RM 曲線（Recharts）。
3. 匯出 CSV：每張表一個 CSV 打包成 zip，UTF-8 BOM 以便 Excel 開啟。
驗收：第 14 節階段 4。
```

