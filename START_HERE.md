# 從這裡開始（最簡版：只需要 GitHub 帳號）

| 檔案 | 用途 | 上傳到 GitHub？ |
| --- | --- | --- |
| `AGENTS.md` | Codex 每次工作都會先讀的規則 | 要 |
| `docs/spec.md` | 完整規格（第 1–15 節） | 要 |
| `docs/codex-prompts.md` | 階段 0–4 的指令，依序貼給 Codex | 要 |
| `.gitignore` | 防止個人資料被上傳 | 要 |
| `my-data.json` | 你的個人資料、熱量目標、第 1 週推日紀錄 | **不要**，留在自己電腦 / 手機 |

## 這個版本怎麼運作

- APP 放在 GitHub Pages（免費），用手機開網址、加到主畫面就能用。
- 訓練和飲食資料只存在你的手機裡，不在網路上。
- 沒有 AI：飲食照片照樣傳給 Claude，Claude 會用固定格式回覆，你在 APP 按「貼上 Claude 估算」貼進去即可。

## 步驟

1. 註冊 GitHub，建立一個 **Public** 的 repository，名稱例如 `fitness-app`（免費版 GitHub Pages 需要公開；程式碼公開，但你的資料不會在裡面）。
2. 把這個資料夾的檔案上傳，**除了 my-data.json**。
3. 打開 Codex，連結這個 repository，貼上 `docs/codex-prompts.md` 的「階段 0 指令」。
4. Codex 完成後，照它的說明到 repository 的 Settings → Pages 開啟部署，拿到網址。
5. 手機用 Safari（iPhone）或 Chrome（Android）打開網址 → 分享 / 選單 → 加入主畫面。**之後都從主畫面圖示打開**，資料比較不會被瀏覽器清掉。
6. 第一次打開時選「匯入個人資料」，選 `my-data.json`（先把檔案傳到手機，例如用 AirDrop 或存到雲端硬碟）。
7. 確認 `docs/spec.md` 第 14 節的階段 0 驗收標準，通過再貼「階段 1 指令」，依此類推。

## 一定要做

- **每週匯出備份一次**（設定頁 → 匯出），存到雲端硬碟。換手機或資料不見時，用匯入還原。
- `my-data.json` 裡的生日是用 33 歲推算的 1993-01-01，請改成你的實際生日再匯入。
- 之後想加雲端同步或 APP 內拍照 AI，再申請 Supabase 與 AI 金鑰即可，規格已預留欄位。
