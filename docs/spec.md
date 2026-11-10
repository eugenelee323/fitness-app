# 智慧健身 APP 開發文件


第三階段：每週分析與自動調整規則。所有判斷用可測試的固定規則計算，AI 只負責解釋原因；每條建議都要使用者確認後才套用。

## 1. 輸入資料與每週指標

每組記錄重量、次數、RIR；每次訓練記錄疲勞、睡眠、疼痛、是否完成；每週計算下列指標。

| 輸入 | 單位 / 範圍 | 頻率 |
| --- | --- | --- |
| 重量 | kg（啞鈴填單支） | 每組 |
| 次數 | 整數 | 每組 |
| RIR | 0–5 | 每組 |
| 疲勞 | 1–10 | 每次訓練 |
| 睡眠 | 小時 | 每次訓練前一晚 |
| 疼痛 | 部位 ＋ 0–10 分 | 每次訓練 |
| 完成 | 是 / 否 | 每次訓練 |
| 體重、腰圍 | kg、cm | 體重每天晨起，腰圍每週 |
| 飲食 | 照片 → 熱量、三大營養素 | 每餐 |

| 指標 | 算法 |
| --- | --- |
| 完成率 | 實際完成組數 ÷ 計畫組數 |
| 有效組數（各肌群） | RIR ≤ 3 的組：主要肌群算 1，輔助肌群算 0.5 |
| 容量 | 重量 × 次數，逐組加總；雙手啞鈴 ×2；單手動作左右各算；引體、雙槓用體重＋掛重 |
| 容量變化 | (本週 − 上次同菜單) ÷ 上次同菜單 |
| 估計最大重量 e1RM | 重量 × (1 + (次數 + RIR) ÷ 30)，取該動作最佳一組 |
| 進步判定 | e1RM 較上次同動作：≥ +1% 進步、−2%～+1% 持平、≤ −2% 退步 |
| 停滯 | 同一動作連續 2 次持平或退步 |
| 恢復分數 | 平均疲勞、平均睡眠、疼痛次數 |

## 2. 動作層級規則（決定下次重量）

由上到下判斷，符合第一條就停；一次只改一個變數（重量或組數）。

| 優先 | 條件 | 建議 |
| --- | --- | --- |
| 1 | 該動作相關部位疼痛 ≥ 4 分，或刺痛 | 停止該動作，改替代動作；連續 2 次就提示就醫 |
| 2 | 疼痛 1–3 分 | 重量 −10%，觀察下次 |
| 3 | 每組都超過次數上限 2 下以上 | 加重 1–2 級（啞鈴等級距大的器材取 1 級） |
| 4 | 每組都做到上限，且 RIR ≥ 1 | 加重 1 級 |
| 5 | 複合動作出現 RIR 0（力竭） | 重量不變，提醒留 1–2 下 |
| 6 | 在範圍內但未達上限 | 重量不變，目標每組 +1 下 |
| 7 | 任一組低於下限 | 重量不變；連續 2 次 → 重量 −5～10% |

| 器材 | 1 級的幅度 |
| --- | --- |
| 槓鈴（上半身） | +2.5 kg |
| 槓鈴（下半身）、腿推 | +5 kg |
| 啞鈴 | 下一個可用重量（通常 +1–2 kg） |
| 器械、滑輪 | 下一格（通常 +2.5–5 kg） |
| 引體、雙槓 | 做滿上限後掛 2.5 kg |

## 3. 肌群組數、疲勞與減量規則

每週結束後依各肌群表現調組數，上限是單次每肌群約 12 組、單日總時間 120 分鐘。

| 條件 | 建議 |
| --- | --- |
| 該肌群動作都進步，平均疲勞 ≤ 6 | 依階段計畫 +1 組（未達上限時） |
| 該肌群停滯 2 週，疲勞 ≤ 6 | +1 組；已達上限就等下次菜單輪替 |
| 該肌群退步，或平均疲勞 ≥ 7 | 組數 −20～30% |
| 完成率 < 80% | 不加組，先找原因（時間不夠？太累？） |

**減量觸發（任一成立就建議下週減量）**

- 2 個以上主動作連續 2 週退步
- 平均疲勞 ≥ 7 連續 2 週
- 平均睡眠 < 6.5 小時，且本週有退步
- 到了預定減量週（第 4、8、12 週）；但若主動作都進步、疲勞 ≤ 5、無疼痛，可延後 1–2 週

減量內容：組數 −50%、重量不變、RIR 3–4。減量後下週回到減量前的組數與重量。

**腰部安全規則**：同一天最多 1 個壓下背的動作（羅馬尼亞硬舉、槓鈴划船、深蹲）；腰部疼痛 ≥ 1 分就把該動作換成俯臥腿彎舉。

## 4. 菜單輪替、飲食與體重規則

**菜單輪替**

- A 菜單：第 1–2、5–6、9–10 週；B 菜單：第 3–4、7–8、11–12 週。
- 主動作（槓鈴臥推、引體向上、腿推機）不換，進步判定以它們為主。
- 各動作的重量紀錄分開存；回到同一菜單時，起始重量 ＝ 上次該動作最後一次套用第 2 節規則的結果。
- 第一次做的動作：用 RIR 2 試出重量，不判定進退步。

**每日飲食紀錄**

| 項目 | 規則 |
| --- | --- |
| 熱量達標 | 2,450–2,550 kcal ± 10%（約 2,200–2,800） |
| 蛋白質達標 | ≥ 145 g |
| 當日結果 | 兩項都達標 ＝ 達標；只有一項 ＝ 部分達標 |
| 紀錄完整率 | 有照片的餐數 ÷ 預計餐數（訓練日 4、休息日 3） |
| 估算來源 | 有營養標示優先用標示；其他照片傳給 Claude 估算，把結果貼入 APP，標「估」 |

**每週體重與熱量調整**

- 用 7 日平均體重，不看單日。目標每週 +0.15～0.25 kg。
- 紀錄完整率 < 70%：不調熱量，先提醒補紀錄。
- 連續 2 週平均增重 < 0.1 kg：每日 +150 kcal。
- 平均增重 > 0.35 kg/週，或腰圍 4 週 +2 cm：每日 −150 kcal。
- 蛋白質週平均 < 130 g：只提醒補蛋白質，不改熱量。
- 熱量一次最多調 150 kcal，調整後至少觀察 2 週。

## 5. 建議輸出格式與實例

每條建議包含：對象、建議、原因（引用實際數據）、依據規則、狀態（待確認 / 已套用 / 已拒絕）。使用者按確認後才寫入下週課表，並留下修改紀錄。

實例：第 1 週推日（2026-11-10）套用規則的結果。

| 對象 | 實際 | 建議 | 原因 | 規則 |
| --- | --- | --- | --- | --- |
| 槓鈴臥推 | 4×8 @65 kg、RIR 1–2 | 67.5 kg | 4 組都達上限 8 下且留有餘力；e1RM 約 85–87 kg | 第 2 節第 4 條 |
| 坐姿啞鈴肩推 | 3×12 @16 kg | 18 kg、3×8–10 | 每組超過上限 10 下達 2 下；啞鈴級距大取 1 級 | 第 2 節第 3 條 |
| 上斜胸推機 | 3×10 @40 kg | 維持 40 kg，目標 11 下 | 在 8–12 下範圍內，未達上限 | 第 2 節第 6 條 |
| 滑輪三頭下壓 | 3×12 @17.5 kg | 20 kg | 達上限 12 下；本週先加重，計畫中的 +1 組延到第 3 週 | 第 2 節第 4 條、一次只改一個變數 |
| 胸（肌群） | 有效組數 12 | 維持組數 | 已達單次上限 12 組 | 第 3 節 |
| 推日容量 | 9,447 kg | — | 第一週，無對照 | 第 1 節 |

# 第四階段：APP 功能、介面與資料架構

## 6. 功能清單

MVP 先做「記錄 → 自動計算 → 每週建議 → 確認套用」完整一圈，其他放後續。

| 類別 | 功能 | 階段 |
| --- | --- | --- |
| 訓練 | 12 週計畫（A / B 菜單、減量週） | MVP |
| 訓練 | 今日訓練：每組重量、次數、RIR，預填目標值、顯示上次數據 | MVP |
| 訓練 | 組間休息計時器（依動作自動帶入 1–3 分） | MVP |
| 訓練 | 訓練後填疲勞、睡眠、疼痛 | MVP |
| 訓練 | 替代動作（器材被佔用或疼痛時一鍵替換） | MVP |
| 分析 | 容量、有效組數、e1RM、進退步自動計算 | MVP |
| 分析 | 每週報告 ＋ 下週建議（逐條接受 / 拒絕），原因用固定文字範本 | MVP |
| 分析 | 主動作進步曲線、12 週容量趨勢 | MVP |
| 飲食 | 手動輸入一餐（食物、份量、熱量、三大營養素） | MVP |
| 飲食 | 貼上 Claude 估算結果，自動拆成各項目 | MVP |
| 飲食 | 每日熱量、蛋白質進度條與達標判定 | MVP |
| 飲食 | 常用餐點（一鍵帶入常吃的便當、乳清） | MVP |
| 飲食 | APP 內拍照 AI 估算、營養標示辨識 | 後續（需 AI 金鑰與後端） |
| 身體 | 每日體重、7 日平均、每週腰圍 | MVP |
| 資料 | 全部資料匯出 / 匯入 JSON 備份、匯出 CSV、每 7 天提醒備份 | MVP |
| 資料 | 第一次開啟匯入個人初始資料（my-data.json） | MVP |
| 其他 | 雲端同步、多裝置 | 後續（需資料庫帳號） |
| 其他 | 推播提醒、步數同步、InBody、進度照 | 後續 |

## 7. 頁面規格

手機優先、繁體中文；底部 5 個分頁：首頁、訓練、飲食、分析、設定。一手操作，主要按鈕放在下半部。

| 頁面 | 顯示內容 | 主要操作 |
| --- | --- | --- |
| 1. 首頁儀表板 | 第幾週 / A 或 B 菜單 / 是否減量週；今日課表；本週完成率；今日熱量與蛋白質進度條；7 日平均體重 | 開始訓練、記一餐、記體重 |
| 2. 12 週計畫 | 12 週列表，每週可展開推日 / 拉日動作、組數、目標重量；已完成週標示實際結果 | 調整訓練日、查看動作說明 |
| 3. 今日訓練 | 動作卡片：中英文名、目標（組×次、重量、RIR、休息）、上次數據、注意事項；每組一列輸入格 | 預填目標 → 改不同處 → 按「完成這組」自動開始計時；替換動作；結束時填疲勞 / 睡眠 / 疼痛 |
| 4. 訓練分析 | 各肌群每週有效組數（與目標區間對照）、容量趨勢、主動作 e1RM 曲線 | 切換肌群 / 動作 / 時間範圍 |
| 5. 飲食紀錄 | 今日各餐（照片、食物、公克數、熱量、三大營養素），每餐合計與當日合計；估算值標「估」 | 手動輸入 / 貼上 Claude 估算 / 常用餐點；修改份量 |
| 6. 每週分析報告 | 完成率、各肌群組數與容量、進步 / 停滯動作、疲勞與睡眠、飲食達標天數、體重趨勢 | 前往下週建議 |
| 7. 下週課表建議 | 建議清單：對象、變更前後、原因、依據規則 | 逐條「接受 / 拒絕 / 修改」，全部處理後產生下週課表 |
| 8. 個人設定 | 基本資料、目標、熱量與營養素目標、訓練日、器材級距、疼痛紀錄 | 編輯、匯出 / 匯入備份 |

## 8. 主要操作流程

**訓練日**

1. 首頁按「開始訓練」，進入今日訓練。
2. 每個動作顯示目標與上次數據；每組已預填目標重量與次數。
3. 做完一組：改實際次數、選 RIR，按「完成這組」，休息計時自動開始。
4. 器材被佔或疼痛 → 按「替換」，從同肌群替代動作中選一個。
5. 全部做完 → 填疲勞（1–10）、昨晚睡眠、疼痛部位與分數 → 儲存。
6. 系統立刻算出當次容量、各肌群有效組數、主動作 e1RM，並標示「下次可加重」的動作。

**每日飲食**

1. 拍照傳給 Claude（在聊天中），Claude 回覆固定格式的估算（第 13 節）。
2. 在 APP 飲食頁按「貼上 Claude 估算」，貼入文字 → 自動拆成各項目，可修正後確認。
3. 包裝食品或常吃的餐點：直接手動輸入或選常用餐點。
4. 進度條更新；晚上 9 點後打開 APP 若蛋白質還差 30 g 以上，顯示補充建議（乳清、茶葉蛋、優格）。

**每週結算（週日 21:00 後第一次打開 APP 時執行）**

1. 規則引擎在手機上計算第三階段的所有指標與建議（也可手動按「結算本週」）。
2. 每條建議的原因由固定文字範本套入數字產生。
3. 使用者在「下週課表建議」逐條接受 / 拒絕 / 修改。
4. 系統產生下週課表，把每筆變更寫入修改歷史，並提醒匯出備份。

## 9. 資料架構與技術建議

資料全部存在手機瀏覽器的 IndexedDB，共 18 個資料集，分成使用者、計畫、訓練紀錄、分析、飲食、身體六組；只有一位使用者，不需要登入。所有數值以公制儲存（kg、g、cm、kcal）。

| 資料表 | 主要欄位 | 說明 |
| --- | --- | --- |
| users | id、email、建立時間 | 單一使用者（固定 id） |
| user\_profiles | 性別、生日、身高、目標、活動量、腰傷等限制、RIR 或 RPE | 個人設定 |
| nutrition\_targets | 生效日、熱量、蛋白質、碳水、脂肪、BMR、TDEE | 每次調熱量就新增一筆，保留歷史 |
| exercises | 中文名、英文名、主要肌群、輔助肌群、負重類型、加重級距、是否單側、是否壓下背、注意事項 | 動作庫 |
| exercise\_alternatives | 動作、替代動作、原因 | 替代動作對照 |
| programs | 開始日、週數、狀態 | 12 週計畫 |
| program\_weeks | 週次、A / B 菜單、是否減量、階段 | 每週設定 |
| planned\_exercises | 週次、推 / 拉日、順序、動作、組數、次數下限 / 上限、目標 RIR、目標重量、休息秒數 | 課表內容 |
| workout\_sessions | 日期、推 / 拉日、疲勞、睡眠、是否完成 | 每次訓練 |
| workout\_sets | 訓練、動作、第幾組、重量、次數、RIR、左 / 右 | 每組實際紀錄 |
| pain\_reports | 訓練、部位、分數、相關動作 | 疼痛紀錄 |
| weekly\_analyses | 週次、各項指標（JSON）、規則版本 | 每週計算結果 |
| recommendations | 分析、對象、變更前 / 後、原因、規則編號、狀態 | 建議與確認狀態 |
| plan\_changes | 建議、修改內容、套用時間 | 課表修改歷史 |
| foods / meals / meal\_items | 食物：每 100 g 營養素、來源（資料庫 / 標示 / 自訂）；餐：日期、餐別、照片、AI 原始回應；項目：公克數、熱量、三大營養素、是否估算 | 飲食紀錄 |
| body\_metrics | 日期、體重、腰圍、體脂 | 身體數據 |

**負重類型與容量計算**：槓鈴、器械、滑輪 ＝ 重量 × 次數；雙手啞鈴 ＝ 單支 × 2 × 次數；單手動作 ＝ 左右各一筆紀錄；徒手 ＝ (體重 + 掛重) × 次數；輔助引體 ＝ (體重 − 輔助重量) × 次數。

**技術選擇（已確認：最簡版—網頁版 PWA、資料存在手機、只用 GitHub）**

| 部分 | 選擇 | 原因 |
| --- | --- | --- |
| 形式 | PWA 網頁 APP，加到手機主畫面使用 | 不用上架；加到主畫面後資料較不會被瀏覽器清除 |
| 前端 | Vite + React + TypeScript + Tailwind | 純前端、建置簡單 |
| PWA | vite-plugin-pwa | 離線可用、可安裝 |
| 資料 | IndexedDB（Dexie）＋ `navigator.storage.persist()` | 不用資料庫帳號 |
| 圖表 | Recharts | 容量與進步曲線 |
| 規則引擎 | 純 TypeScript 函式 ＋ Vitest | 可測試 |
| 上線 | GitHub Pages（GitHub Actions 自動部署） | 只需 GitHub 帳號、免費 |
| AI | 不內建；飲食照片由 Claude 在聊天中估算後貼入 | 免費、不需金鑰 |

注意：免費版 GitHub Pages 需要公開的 repository，程式碼會被看到，但訓練與飲食資料只存在你的手機，不在 repository。個人資料放在 my-data.json，不要上傳。

# 第五階段：交給 Codex 的開發文件

功能清單、操作流程、頁面規格見第 6–8 節；調整規則見第 1–5 節。本階段補上實作需要的規格。

## 10. PRD 摘要

| 項目 | 內容 |
| --- | --- |
| 產品 | 12 週智慧健身訓練與營養管理 PWA（繁體中文、手機優先、資料存在手機） |
| 使用者 | 1 人，每週 2 練（推 / 拉） |
| 要解決的問題 | 訓練與飲食紀錄分散、加重靠感覺、沒有每週寢觀分析 |
| 核心價值 | 記錄後自動算出容量與有效組數，每週依固定規則提出可確認的下週調整 |
| MVP 範圍 | 第 6 節標「MVP」的功能 |
| 不做（本版） | 登入、後端伺服器、雲端同步、APP 內 AI、多使用者、原生 APP |
| 必要限制 | 重量、熱量、組數由規則計算；每條建議需使用者確認後套用 |
| 成功指標 | 記一組 ≤ 3 次點擊；飲食紀錄完整率 ≥ 80%；12 週訓練完成率 ≥ 90%；規則引擎測試覆蓋率 ≥ 90% |
| 資料安全 | 資料只在手機；每 7 天提醒匯出備份；可從備份檔完整還原 |

## 11. 資料結構（IndexedDB / Dexie）

下方 SQL 只當作欄位與型別定義。實作時轉成 Dexie schema：每張表一個 store，id 用 `crypto.randomUUID()`，外鍵改成一般欄位並建索引；不需要 `auth.users`、`user_id`、RLS；check 條件在寫入前用 zod 驗證。`meals.photo_path`、`ai_raw` 保留為空，供日後加入 AI 時使用。

```sql
create extension if not exists pgcrypto;

create table user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  sex text check (sex in ('male','female')),
  birth_date date,
  height_cm numeric(5,1),
  goal text not null default 'hypertrophy',
  activity_level text not null default 'sedentary',
  limitations text[] not null default '{}',      -- 例：{'lower_back'}
  intensity_scale text not null default 'RIR',
  timezone text not null default 'Asia/Taipei'
);

create table nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  effective_from date not null,
  bmr_kcal int, tdee_kcal int,
  kcal int not null, protein_g int not null, carbs_g int not null, fat_g int not null,
  reason text
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                     -- 例：'bench_bb'
  name_zh text not null, name_en text not null,
  primary_muscle text not null,                  -- chest, back, side_delt ...
  secondary_muscles text[] not null default '{}',
  load_type text not null check (load_type in
    ('barbell','dumbbell_pair','dumbbell_single','machine','cable','bodyweight','assisted')),
  increment_kg numeric(4,2) not null,
  is_compound boolean not null default false,
  unilateral boolean not null default false,
  loads_lower_back boolean not null default false,
  cues text
);

create table exercise_alternatives (
  exercise_id uuid references exercises on delete cascade,
  alt_exercise_id uuid references exercises on delete cascade,
  reason text,
  primary key (exercise_id, alt_exercise_id)
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  start_date date not null,
  weeks int not null default 12,
  status text not null default 'active'
);

create table program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs on delete cascade,
  week_no int not null check (week_no between 1 and 12),
  menu text not null check (menu in ('A','B')),
  phase int not null check (phase between 1 and 3),
  is_deload boolean not null default false,
  unique (program_id, week_no)
);

create table planned_exercises (
  id uuid primary key default gen_random_uuid(),
  program_week_id uuid not null references program_weeks on delete cascade,
  day_type text not null check (day_type in ('push','pull')),
  order_no int not null,
  exercise_id uuid not null references exercises,
  sets int not null, rep_min int not null, rep_max int not null,
  target_rir int not null default 2,
  target_weight_kg numeric(6,2),
  rest_sec int not null default 90
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  program_week_id uuid references program_weeks,
  day_type text not null check (day_type in ('push','pull')),
  date date not null,
  bodyweight_kg numeric(5,1),
  fatigue int check (fatigue between 1 and 10),
  sleep_h numeric(3,1),
  completed boolean not null default false,
  notes text
);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions on delete cascade,
  planned_exercise_id uuid references planned_exercises,
  exercise_id uuid not null references exercises,
  set_no int not null,
  side text not null default 'both' check (side in ('both','left','right')),
  weight_kg numeric(6,2) not null default 0,     -- 啞鈴填單支；徒手填掛重；輔助填輔助量
  reps int not null,
  rir int check (rir between 0 and 5)
);

create table pain_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions on delete cascade,
  body_part text not null,
  score int not null check (score between 0 and 10),
  exercise_id uuid references exercises
);

create table weekly_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  program_id uuid not null references programs,
  week_no int not null,
  rules_version text not null,
  metrics jsonb not null,
  ai_summary text,
  computed_at timestamptz not null default now(),
  unique (program_id, week_no)
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references weekly_analyses on delete cascade,
  target_type text not null check (target_type in ('exercise','muscle','program','nutrition')),
  target_ref text not null,
  before jsonb, after jsonb,
  rule_id text not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','modified')),
  decided_at timestamptz
);

create table plan_changes (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references recommendations,
  planned_exercise_id uuid references planned_exercises,
  change jsonb not null,
  applied_at timestamptz not null default now()
);

create table foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,  -- null = 共用資料
  name text not null,
  kcal_100g numeric(6,1) not null, protein_100g numeric(5,1) not null,
  carbs_100g numeric(5,1) not null, fat_100g numeric(5,1) not null,
  source text not null check (source in ('database','label','custom'))
);

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  photo_path text,
  ai_raw jsonb,
  confirmed boolean not null default false
);

create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals on delete cascade,
  food_id uuid references foods,
  name text not null,
  grams numeric(6,1) not null,
  kcal numeric(6,1) not null, protein_g numeric(5,1) not null,
  carbs_g numeric(5,1) not null, fat_g numeric(5,1) not null,
  is_estimate boolean not null default true,
  kcal_low numeric(6,1), kcal_high numeric(6,1)
);

create table body_metrics (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  weight_kg numeric(5,1), waist_cm numeric(5,1), bodyfat_pct numeric(4,1),
  primary key (user_id, date)
);
```

## 12. 計算公式與每週調整演算法

放在 `lib/rules/`，全部是純函式（不讀資料庫、不呼叫 AI），每個函式都要有單元測試。規則編號對應第 2–4 節：L = 動作、M = 肌群、D = 減量、N = 飲食。

| 公式 | 算法 |
| --- | --- |
| 容量 | 有效負重 × 次數，逐組加總 |
| e1RM | 有效負重 × (1 + (次數 + RIR) ÷ 30) |
| BMR（Mifflin-St Jeor） | 10 × 體重 + 6.25 × 身高 − 5 × 年齡 + 5（男）或 −161（女） |
| TDEE | BMR × 活動係數（久坐 1.2、輕度 1.375、中度 1.55）＋ 每次訓練約 300 kcal × 每週次數 ÷ 7 |
| 7 日平均體重 | 過去 7 天有紀錄的體重平均（至少 4 筆才計算） |

```ts
// lib/rules/index.ts
export const RULES_VERSION = '2026.11-1';

export type Muscle = 'chest' | 'back' | 'front_delt' | 'side_delt' | 'rear_delt'
  | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes';
export type LoadType = 'barbell' | 'dumbbell_pair' | 'dumbbell_single' | 'machine'
  | 'cable' | 'bodyweight' | 'assisted';

export interface Exercise {
  code: string; primaryMuscle: Muscle; secondaryMuscles: Muscle[];
  loadType: LoadType; incrementKg: number;
  isCompound: boolean; unilateral: boolean; loadsLowerBack: boolean;
}
export interface LoggedSet { setNo: number; weightKg: number; reps: number; rir: number | null; side: 'both' | 'left' | 'right'; }
export interface Planned { sets: number; repMin: number; repMax: number; targetRir: number; targetWeightKg: number | null; }

// ---- 基本計算 ----
export function effectiveLoad(ex: Exercise, s: LoggedSet, bodyweightKg: number): number {
  switch (ex.loadType) {
    case 'dumbbell_pair': return s.weightKg * 2;            // weightKg 填單支
    case 'bodyweight':    return bodyweightKg + s.weightKg;  // weightKg 填掛重
    case 'assisted':      return Math.max(bodyweightKg - s.weightKg, 0);
    default:              return s.weightKg;
  }
}
export const setVolume = (ex: Exercise, s: LoggedSet, bw: number) => effectiveLoad(ex, s, bw) * s.reps;
export const e1rm = (loadKg: number, reps: number, rir: number) => loadKg * (1 + (reps + rir) / 30);
export const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function progressStatus(curr: number, prev: number | null): 'new' | 'up' | 'flat' | 'down' {
  if (prev == null) return 'new';
  const d = (curr - prev) / prev;
  return d >= 0.01 ? 'up' : d <= -0.02 ? 'down' : 'flat';
}

// 有效組數：RIR ≤ 3 才算；單手動作左右合算 1 組；主要肌群 1、輔助肌群 0.5
export function fractionalSets(ex: Exercise, sets: LoggedSet[]): Partial<Record<Muscle, number>> {
  const valid = new Set(sets.filter(s => (s.rir ?? 0) <= 3).map(s => s.setNo)).size;
  const out: Partial<Record<Muscle, number>> = { [ex.primaryMuscle]: valid };
  for (const m of ex.secondaryMuscles) out[m] = (out[m] ?? 0) + valid * 0.5;
  return out;
}

// ---- L：動作層級（決定下次重量）----
export interface LoadDecision { action: 'stop' | 'reduce' | 'increase' | 'hold'; weightKg: number | null; ruleId: string; }

export function nextLoad(ex: Exercise, p: Planned, sets: LoggedSet[], painScore: number, prevBelowMin: boolean): LoadDecision {
  const work = sets.filter(s => s.side !== 'left');          // 單手動作用右側判斷
  const w = p.targetWeightKg ?? work[0]?.weightKg ?? 0;
  const up = (steps: number, ruleId: string): LoadDecision => ({ action: 'increase', weightKg: w + ex.incrementKg * steps, ruleId });
  const hold = (ruleId: string): LoadDecision => ({ action: 'hold', weightKg: w, ruleId });

  if (painScore >= 4) return { action: 'stop', weightKg: null, ruleId: 'L1' };
  if (painScore >= 1) return { action: 'reduce', weightKg: roundTo(w * 0.9, ex.incrementKg), ruleId: 'L2' };
  if (work.length === 0) return hold('L0');

  const done = work.length >= p.sets;
  const minReps = Math.min(...work.map(s => s.reps));
  const minRir = Math.min(...work.map(s => s.rir ?? 0));
  const bigStep = w > 0 && ex.incrementKg / w >= 0.1;       // 級距 ≥ 10% 只加 1 級

  if (done && minReps >= p.repMax + 2) return up(bigStep ? 1 : 2, 'L3');
  if (done && minReps >= p.repMax && minRir >= 1) return up(1, 'L4');
  if (ex.isCompound && minRir === 0) return hold('L5');
  if (minReps < p.repMin) {
    return prevBelowMin
      ? { action: 'reduce', weightKg: roundTo(w * 0.925, ex.incrementKg), ruleId: 'L7' }
      : hold('L7');
  }
  return hold('L6');                                           // 目標：每組 +1 下
}

// ---- M：肌群組數 ----
export function muscleSetDelta(m: { status: 'new' | 'up' | 'flat' | 'down'; flatWeeks: number; avgFatigue: number;
  completion: number; currentSets: number; cap: number; planDelta: number }): { delta: number; ruleId: string } {
  if (m.completion < 0.8) return { delta: 0, ruleId: 'M4' };
  if (m.status === 'down' || m.avgFatigue >= 7) return { delta: -Math.max(1, Math.round(m.currentSets * 0.25)), ruleId: 'M3' };
  if (m.status === 'up' && m.avgFatigue <= 6) return { delta: Math.max(0, Math.min(m.planDelta, m.cap - m.currentSets)), ruleId: 'M1' };
  if (m.flatWeeks >= 2 && m.avgFatigue <= 6) return { delta: m.currentSets < m.cap ? 1 : 0, ruleId: 'M2' };
  return { delta: 0, ruleId: 'M0' };
}

// ---- D：減量 ----
export function deloadDecision(w: { mainLiftsDown2Weeks: number; fatigueHigh2Weeks: boolean; avgSleep: number;
  anyDown: boolean; scheduledDeload: boolean; allMainUp: boolean; avgFatigue: number; anyPain: boolean;
  weeksSinceDeload: number }): { deload: boolean; ruleId: string } {
  if (w.mainLiftsDown2Weeks >= 2) return { deload: true, ruleId: 'D1' };
  if (w.fatigueHigh2Weeks) return { deload: true, ruleId: 'D2' };
  if (w.avgSleep < 6.5 && w.anyDown) return { deload: true, ruleId: 'D3' };
  if (w.scheduledDeload) {
    const postpone = w.allMainUp && w.avgFatigue <= 5 && !w.anyPain && w.weeksSinceDeload < 5; // 最多延 2 週
    return { deload: !postpone, ruleId: postpone ? 'D4-postpone' : 'D4' };
  }
  return { deload: false, ruleId: 'D0' };
}

// ---- N：飲食與體重 ----
export const bmr = (sex: 'male' | 'female', kg: number, cm: number, age: number) =>
  10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55 } as const;
export const tdee = (bmrKcal: number, activity: keyof typeof ACTIVITY, sessionsPerWeek: number) =>
  bmrKcal * ACTIVITY[activity] + (300 * sessionsPerWeek) / 7;

export function dailyStatus(t: { kcal: number; proteinMin: number }, d: { kcal: number; protein: number }) {
  const kcalOk = Math.abs(d.kcal - t.kcal) <= t.kcal * 0.1;
  const proteinOk = d.protein >= t.proteinMin;
  return kcalOk && proteinOk ? 'met' : kcalOk || proteinOk ? 'partial' : 'missed';
}

export function weeklyKcalDelta(i: { logCompleteness: number; weeklyGains: number[]; // 最近兩週，kg/週（由 7 日平均算）
  waistChange4w: number; weeksSinceLastAdjust: number }): { delta: number; ruleId: string } {
  if (i.logCompleteness < 0.7) return { delta: 0, ruleId: 'N1' };
  if (i.weeksSinceLastAdjust < 2) return { delta: 0, ruleId: 'N5' };
  const last = i.weeklyGains[i.weeklyGains.length - 1] ?? 0;
  if (last > 0.35 || i.waistChange4w >= 2) return { delta: -150, ruleId: 'N3' };
  if (i.weeklyGains.length >= 2 && i.weeklyGains.slice(-2).every(g => g < 0.1)) return { delta: 150, ruleId: 'N2' };
  return { delta: 0, ruleId: 'N0' };
}
```

**必要的測試案例**（用第 1 週推日實際數據）：

| 輸入 | 預期 |
| --- | --- |
| 臥推 4×8 @65 kg、RIR 2，計畫 4×6–8 | nextLoad → increase 67.5 kg，L4 |
| 啞鈴肩推 3×12 @16 kg（級距 2），計畫 3×8–10 | increase 18 kg，L3（級距 12.5% 只加 1 級） |
| 上斜胸推機 3×10 @40 kg，計畫 3×8–12 | hold 40 kg，L6 |
| 三頭下壓 3×12 @17.5 kg（級距 2.5），計畫 3×10–12 | increase 20 kg，L4 |
| 任一動作疼痛 5 分 | stop，L1 |
| 推日容量（體重 80 kg） | 9,447 kg |
| BMR（80 kg、178 cm、33 歲、男） | 1,752.5 kcal |

## 13. 程式模組、備份與資料匯入

沒有後端 API；所有功能都在手機上執行，由下列模組負責。

| 模組 | 路徑 | 職責 |
| --- | --- | --- |
| 資料層 | `src/db/` | Dexie schema、zod 驗證、資料存取函式 |
| 規則引擎 | `src/lib/rules/` | 第 12 節全部純函式 |
| 每週結算 | `src/lib/weekly/` | 彙總指標 → 產生建議 → 套用已接受的建議 → 產生下週課表 |
| 建議文字 | `src/lib/explain/` | 每個 ruleId 一個繁中文範本，例：L4 →「{動作} 每組都達 {repMax} 下且留有餘力，下次加到 {重量} kg」 |
| 備份 | `src/lib/backup/` | 匯出 / 匯入 JSON、匯出 CSV |
| 貼上解析 | `src/lib/paste/` | 解析 Claude 估算文字 |

**每週結算觸發**：打開 APP 時，若現在已過週日 21:00（Asia/Taipei）且該週還沒結算，就自動執行；設定頁也有「結算本週」按鈕。

**Claude 估算的貼上格式**（Claude 在聊天中依此格式回覆）：第一行是日期與餐別，之後每行一個食物，欄位用「|」分隔。解析時允許前後空白與全形符號；解析失敗的行標紅、讓使用者手動修正；全部存成 `is_estimate = true`。

```text
#餐點 2026-11-11 午餐
雞腿便當 | 550 g | 820 kcal | P 38 | C 95 | F 30
無糖豆漿 | 450 ml | 150 kcal | P 15 | C 8 | F 7
```

餐別對照：早餐 = breakfast、午餐 = lunch、晚餐 = dinner、點心 = snack。份量的 ml 以 1 ml = 1 g 記錄。

**備份格式**：匯出檔 `fitness-backup-YYYYMMDD.json`，內容 `{ "version": 1, "exportedAt": "...", "rulesVersion": "...", "tables": { "<表名>": [ ... ] } }`。匯入前先驗證版本與格式，顯示各表筆數，使用者確認後整庫取代。距離上次備份超過 7 天，首頁顯示提醒。

**個人初始資料 my-data.json**：同備份格式，只含 user\_profiles、nutrition\_targets、body\_metrics 與第 1 週推日紀錄。第一次開啟 APP 時請使用者匯入；此檔列入 `.gitignore`，不上傳到 GitHub。動作庫與 12 週計畫則內建在程式的 seed 中。

## 14. 開發階段與驗收標準

依序開發，每個階段做完、通過驗收才進下一個。第 1–4 階段就是 MVP。

| 階段 | 內容 | 驗收標準 |
| --- | --- | --- |
| 0. 專案骨架 | Vite + React + TypeScript + Tailwind、PWA、Dexie 資料層、內建 seed（動作庫、替代動作、12 週計畫）、匯入 my-data.json、GitHub Actions 部署到 GitHub Pages、底部 5 個分頁 | 手機可用網址開啟並加到主畫面；離線可開；匯入後看得到 12 週計畫與個人資料 |
| 1. 訓練紀錄 | 首頁、今日訓練、休息計時、替代動作、訓練後填疲勞 / 睡眠 / 疼痛、歷史紀錄、備份匯出 / 匯入 | 一組記錄 ≤ 3 次點擊；關掉 APP 再開資料仍在；匯出再匯入後資料完全一致 |
| 2. 規則引擎與每週分析 | `src/lib/rules/` 與測試、每週報告、建議確認、產生下週課表、修改歷史、建議文字範本 | 第 12 節測試案例全過；覆蓋率 ≥ 90%；未確認的建議不會改課表 |
| 3. 飲食 | 手動輸入、貼上 Claude 估算、常用餐點、當日進度與達標判定、熱量調整建議 | 第 13 節範例文字可正確解析成 2 項；格式錯誤不會當掉 |
| 4. 身體與分析圖表 | 體重 / 腰圍、7 日平均、容量趨勢、e1RM 曲線、CSV 匯出 | 圖表與資料一致；CSV 可用 Excel 開啟 |
| 5. 後續 | 雲端同步、APP 內 AI 拍照、推播、步數同步 | 需要時再加，會用到資料庫與 AI 帳號 |

## 15. 交給 Codex 的開發指令與初始資料

用法：把本文件匯出成 Markdown，放進專案的 `docs/spec.md`；把下面的 AGENTS.md 放在專案根目錄；然後依序貼上階段 0–4 的指令，每個階段驗收後再貼下一個。只需要 GitHub 帳號。

### AGENTS.md

```markdown
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
```

### 階段 0 指令

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

### 階段 1 指令

```text
依 docs/spec.md 第 7、8 節實作訓練紀錄：
1. 首頁儀表板：第幾週、A / B 菜單、是否減量、今日課表、本週完成率、備份提醒。
2. 今日訓練：動作卡片顯示目標與上次數據；每組預填目標；「完成這組」後自動開始休息計時；單手動作分左右記錄；替換動作。
3. 結束訓練填疲勞、睡眠、疼痛；顯示當次容量、各肌群有效組數（用 src/lib/rules 的 setVolume、fractionalSets）。
4. 訓練歷史列表與單次詳情。
5. 設定頁：匯出 / 匯入 JSON 備份（第 13 節格式），匯入前顯示各表筆數並確認。
驗收：第 14 節階段 1。
```

### 階段 2 指令

```text
依 docs/spec.md 第 1–5、12、13 節實作規則引擎與每週分析：
1. src/lib/rules/ 依第 12 節程式碼實作，補齊每週彙總函式（完成率、各肌群組數與容量、e1RM 進退步、停滯週數、疲勞與睡眠平均）。
2. 單元測試含第 12 節全部案例，覆蓋率 ≥ 90%。
3. src/lib/weekly/：結算 → 寫入 weekly_analyses 與 recommendations；打開 APP 時若已過週日 21:00 且未結算就自動執行，設定頁另有「結算本週」按鈕。
4. src/lib/explain/：每個 ruleId 一個繁中文文字範本。
5. 每週報告頁與下週建議頁：逐條接受 / 拒絕 / 修改；全部處理後產生下週 planned_exercises 並寫入 plan_changes，提醒匯出備份。
驗收：第 14 節階段 2。
```

### 階段 3 指令

```text
依 docs/spec.md 第 4、6–8、13 節實作飲食：
1. 手動輸入一餐：餐別、食物名稱、公克數、熱量、蛋白質、碳水、脂肪；修正公克數時依比例重算。
2. src/lib/paste/：解析第 13 節「Claude 估算的貼上格式」，寫單元測試（範例文字應解析成 2 項、全形符號也可、錯誤行標出不當掉）。
3. 常用餐點：把一餐存成常用，之後一鍵帶入。
4. 當日熱量、蛋白質進度條與 dailyStatus 達標判定；晚上 9 點後打開 APP 若蛋白質還差 30 g 以上就提示。
5. 每週結算加入 weeklyKcalDelta 建議。
驗收：第 14 節階段 3。
```

### 階段 4 指令

```text
依 docs/spec.md 實作身體數據與圖表：
1. 體重（每日）與腰圍（每週）輸入；7 日平均。
2. 訓練分析頁：各肌群每週有效組數（標出 10–20 組區間）、每週容量趨勢、主動作 e1RM 曲線（Recharts）。
3. 匯出 CSV：每張表一個 CSV 打包成 zip，UTF-8 BOM 以便 Excel 開啟。
驗收：第 14 節階段 4。
```

### 初始資料

**個人資料**：個人基本資料、營養目標、體重與第 1 週推日紀錄放在 my-data.json（不上傳 GitHub），第一次開啟 APP 時匯入。下方是內建在程式中的通用資料。

**12 週設定**（起始日 2026-11-09 週一當週）

| 週 | 菜單 | 階段 | 減量 |
| --- | --- | --- | --- |
| 1–2 | A | 1 | 否 |
| 3 | B | 1 | 否 |
| 4 | B | 1 | 是（可延後） |
| 5–6 | A | 2 | 否 |
| 7 | B | 2 | 否 |
| 8 | B | 2 | 是 |
| 9–10 | A | 3 | 否 |
| 11 | B | 3 | 否 |
| 12 | B | 3 | 是（含測量） |

**A 菜單動作（第 2 週目標重量）**

| 日 | 順序 | code | 中文 / English | 主要肌群 | 輔助肌群 | 負重類型 | 級距 kg | 複合 | 單側 | 壓下背 | 組×次 | RIR | 休息秒 | 目標 kg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 1 | bench\_bb | 槓鈴臥推 / Barbell Bench Press | chest | triceps, front\_delt | barbell | 2.5 | 是 | 否 | 否 | 4×6–8 | 2 | 180 | 67.5 |
| push | 2 | incline\_press\_mc | 上斜胸推機 / Incline Chest Press Machine | chest | triceps, front\_delt | machine | 5 | 是 | 否 | 否 | 3×8–12 | 2 | 120 | 40 |
| push | 3 | lateral\_db | 啞鈴側平舉 / Dumbbell Lateral Raise | side\_delt | — | dumbbell\_pair | 1 | 否 | 否 | 否 | 4×12–15 | 1 | 60 | 7 |
| push | 4 | shoulder\_press\_db | 坐姿啞鈴肩推 / Seated DB Shoulder Press | front\_delt | triceps | dumbbell\_pair | 2 | 是 | 否 | 否 | 3×8–10 | 2 | 120 | 18 |
| push | 5 | pec\_deck | 蝴蝶機夾胸 / Pec Deck Fly | chest | — | machine | 5 | 否 | 否 | 否 | 3×12–15 | 1 | 75 | 40 |
| push | 6 | lateral\_cable | 滑輪單手側平舉 / Cable Lateral Raise | side\_delt | — | cable | 1 | 否 | 是 | 否 | 3×12–15 | 1 | 60 | 5.5 |
| push | 7 | dips | 雙槓撐體 / Dips | chest | triceps, front\_delt | bodyweight | 2.5 | 是 | 否 | 否 | 2×8–12 | 2 | 120 | 0 |
| push | 8 | pushdown\_cable | 滑輪三頭下壓 / Cable Triceps Pushdown | triceps | — | cable | 2.5 | 否 | 否 | 否 | 3×10–12 | 1 | 60 | 20 |
| push | 9 | oh\_ext\_cable | 過頭繩索三頭伸展 / Overhead Cable Triceps Extension | triceps | — | cable | 2.5 | 否 | 否 | 否 | 3×10–12 | 1 | 60 | 18 |
| pull | 1 | pullup | 引體向上 / Pull-up | back | biceps, rear\_delt | bodyweight | 2.5 | 是 | 否 | 否 | 4×6–8 | 2 | 180 | 0 |
| pull | 2 | row\_chest\_sup\_mc | 胸靠式划船機 / Chest-Supported Row Machine | back | biceps, rear\_delt | machine | 5 | 是 | 否 | 否 | 3×8–10 | 2 | 150 | 50 |
| pull | 3 | rdl\_bb | 羅馬尼亞硬舉 / Romanian Deadlift | hamstrings | glutes | barbell | 5 | 是 | 否 | 是 | 3×8–10 | 2 | 180 | 50 |
| pull | 4 | pulldown | 滑輪下拉 / Lat Pulldown | back | biceps | cable | 5 | 是 | 否 | 否 | 3×10–12 | 2 | 120 | 51 |
| pull | 5 | leg\_press | 腿推機 / Leg Press | quads | glutes | machine | 10 | 是 | 否 | 否 | 4×10–12 | 2 | 150 | 試重 |
| pull | 6 | curl\_mc | 二頭彎舉機 / Machine Biceps Curl | biceps | — | machine | 2.5 | 否 | 否 | 否 | 3×8–12 | 1 | 60 | 20 |
| pull | 7 | face\_pull | 臉拉 / Face Pull | rear\_delt | — | cable | 2.5 | 否 | 否 | 否 | 3×12–15 | 1 | 60 | 15 |
| pull | 8 | incline\_curl\_db | 上斜啞鈴彎舉 / Incline Dumbbell Curl | biceps | — | dumbbell\_pair | 2 | 否 | 否 | 否 | 4×10–12 | 1 | 60 | 8 |
| pull | 9 | reverse\_pec\_deck | 反向蝴蝶機 / Reverse Pec Deck | rear\_delt | — | machine | 5 | 否 | 否 | 否 | 2×12–15 | 1 | 60 | 20 |

**B 菜單（同順序替換，組數、次數、RIR、休息同 A；重量第一次試重）**

| 日 | 順序 | code | 中文 / English | 主要肌群 | 輔助肌群 | 負重類型 | 級距 kg | 複合 | 單側 | 壓下背 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| push | 1 | bench\_bb | 槓鈴臥推（不換） | chest | triceps, front\_delt | barbell | 2.5 | 是 | 否 | 否 |
| push | 2 | incline\_press\_db | 上斜啞鈴臥推 / Incline Dumbbell Press | chest | triceps, front\_delt | dumbbell\_pair | 2 | 是 | 否 | 否 |
| push | 3 | lateral\_mc | 側平舉機 / Machine Lateral Raise | side\_delt | — | machine | 2.5 | 否 | 否 | 否 |
| push | 4 | shoulder\_press\_mc | 器械肩推 / Machine Shoulder Press | front\_delt | triceps | machine | 5 | 是 | 否 | 否 |
| push | 5 | cable\_fly | 繩索夾胸 / Cable Fly | chest | — | cable | 2.5 | 否 | 否 | 否 |
| push | 6 | lateral\_leanaway\_db | 側傾單手啞鈴側平舉 / Lean-away DB Lateral Raise | side\_delt | — | dumbbell\_single | 1 | 否 | 是 | 否 |
| push | 7 | dip\_mc | 器械撐體 / Machine Dip | chest | triceps | machine | 5 | 是 | 否 | 否 |
| push | 8 | pushdown\_rope | 繩索三頭下壓 / Rope Pushdown | triceps | — | cable | 2.5 | 否 | 否 | 否 |
| push | 9 | lying\_ext\_db | 仰臥啞鈴三頭伸展 / Lying DB Triceps Extension | triceps | — | dumbbell\_pair | 1 | 否 | 否 | 否 |
| pull | 1 | pullup | 引體向上（不換） | back | biceps, rear\_delt | bodyweight | 2.5 | 是 | 否 | 否 |
| pull | 2 | row\_cable | 坐姿繩索划船 / Seated Cable Row | back | biceps, rear\_delt | cable | 5 | 是 | 否 | 否 |
| pull | 3 | leg\_curl\_lying | 俯臥腿彎舉 / Lying Leg Curl | hamstrings | — | machine | 2.5 | 否 | 否 | 否 |
| pull | 4 | pulldown\_neutral | 對握下拉 / Neutral-grip Pulldown | back | biceps | cable | 5 | 是 | 否 | 否 |
| pull | 5 | leg\_press | 腿推機（不換） | quads | glutes | machine | 10 | 是 | 否 | 否 |
| pull | 6 | curl\_cable | 繩索彎舉 / Cable Curl | biceps | — | cable | 2.5 | 否 | 否 | 否 |
| pull | 7 | rear\_fly\_cable | 繩索後三角飛鳥 / Cable Rear Delt Fly | rear\_delt | — | cable | 2.5 | 否 | 否 | 否 |
| pull | 8 | hammer\_curl\_db | 錘式彎舉 / Hammer Curl | biceps | — | dumbbell\_pair | 2 | 否 | 否 | 否 |
| pull | 9 | rear\_raise\_chest\_sup | 上斜凳胸靠反向飛鳥 / Chest-supported Rear Delt Raise | rear\_delt | — | dumbbell\_pair | 1 | 否 | 否 | 否 |

**替代動作對照**：A 與 B 同順序動作互為替代；rdl\_bb 的腰部替代為 leg\_curl\_lying。
