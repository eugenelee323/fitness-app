import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { Dashboard } from './pages/Dashboard'
import { Training } from './pages/Training'
import { History, HistoryDetail } from './pages/History'
import { BackupPanel } from './pages/BackupPanel'
import { seedDatabase } from './seed'
import { applyPersonalImport, preparePersonalImport, type ImportPreview } from './db/import'

const tabs = [{ path: '/', name: '首頁', icon: '⌂' }, { path: '/training', name: '訓練', icon: '▤' }, { path: '/nutrition', name: '飲食', icon: '◉' }, { path: '/analysis', name: '分析', icon: '▥' }, { path: '/settings', name: '設定', icon: '⚙' }]
const onboardingKey = 'fitness-app:onboarding:v1'

function ImportPanel({ onDone, initial = false }: { onDone: () => void; initial?: boolean }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return <section className="card import-card">
    <span className="eyebrow">{initial ? '從這裡開始' : '個人資料'}</span>
    <h2>匯入個人資料</h2>
    <p>選擇你的 my-data.json，帶入個人設定、營養目標及初始訓練紀錄。</p>
    <p className="muted">檔案只在此裝置處理，資料儲存在這個瀏覽器。</p>
    <input ref={input} type="file" accept=".json,application/json" aria-label="選擇個人資料 JSON 檔案" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]
      setPreview(null); setError(''); setSuccess(false)
      if (!file) return
      setBusy(true)
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('檔案超過 10 MB，請選擇個人初始資料檔。')
        setPreview(await preparePersonalImport(await file.text()))
      } catch (err) { setError(err instanceof Error ? err.message : '無法讀取檔案。') }
      finally { setBusy(false); event.target.value = '' }
    }} className="file-input" />
    {preview && <div className="import-preview"><h3>確認匯入內容</h3><dl>{preview.counts.filter(row => row.count).map(row => <div key={row.name}><dt>{row.label}</dt><dd>{row.count} 筆</dd></div>)}</dl>
      <p className="muted">合併個人資料與初始訓練紀錄；不刪除任何現有紀錄，也不覆蓋另外記錄的訓練。</p>
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await applyPersonalImport(preview); setPreview(null); setSuccess(true); onDone() }
        catch { setError('匯入失敗，沒有儲存任何變更。請檢查檔案後再試。') }
        finally { setBusy(false) }
      }}>{busy ? '正在匯入…' : '確認匯入'}</button>
      <button className="secondary" disabled={busy} onClick={() => setPreview(null)}>取消</button>
    </div>}
    {!preview && <button className="primary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '檢查檔案中…' : '選擇 my-data.json'}</button>}
    {initial && <button className="secondary" disabled={busy} onClick={onDone}>先略過，之後再匯入</button>}
    <div role="status">{success && <p className="success">個人資料已匯入。</p>}</div>
    {error && <p role="alert" className="error">{error}</p>}
  </section>
}

function Plan() {
  const data = useLiveQuery(async () => ({ weeks: await db.rows('program_weeks').orderBy('week_no').toArray(), plans: await db.rows('planned_exercises').toArray(), exercises: await db.rows('exercises').toArray() }))
  return <><PageTitle kicker="循序累積，每週前進" title="12 週訓練計畫" description="每週推、拉各一次，A／B 菜單輪替。" />
    <div className="note">第 2 週已帶入初始目標重量。其他週先試重或等待後續建議確認；第 4、8、12 週為預定減量週。</div>
    <div className="weeks">{data?.weeks.map(week => <details className="card week" key={week.id}>
      <summary><span className="week-number">{String(week.week_no).padStart(2, '0')}</span><span className="week-title">第 {week.week_no} 週<small>階段 {week.phase} · {week.menu} 菜單</small></span><span className={week.is_deload ? 'badge deload' : 'badge'}>{week.is_deload ? '減量週' : '訓練週'}</span><span className="chevron">＋</span></summary>
      <div className="week-content">{(['push', 'pull'] as const).map(day => <section key={day}><h3>{day === 'push' ? '推日' : '拉日'}</h3>{data.plans.filter(p => p.program_week_id === week.id && p.day_type === day).sort((a, b) => a.order_no - b.order_no).map(plan => {
        const ex = data.exercises.find(e => e.id === plan.exercise_id)
        return <article className="exercise" key={plan.id}><h4>{ex?.name_zh}<small>{ex?.name_en}</small></h4><p>{plan.sets} 組 × {plan.rep_min}–{plan.rep_max} 下 · 保留 {plan.target_rir} 下 · 休息 {plan.rest_sec} 秒</p><span className="weight">{plan.target_weight_kg == null ? '試重／待確認' : `${plan.target_weight_kg} kg${ex?.load_type.startsWith('dumbbell') ? '／單支' : ex?.load_type === 'bodyweight' ? ' 掛重' : ''}`}</span>{ex?.cues && <p className="muted">{ex.cues}</p>}</article>
      })}</section>)}</div>
    </details>)}</div></>
}

function PageTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="page-title"><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{description}</p></div>
}

function Settings({ persisted }: { persisted: boolean | null }) {
  const data = useLiveQuery(async () => ({ profile: await db.rows('user_profiles').toCollection().first(), targets: await db.rows('nutrition_targets').orderBy('effective_from').last(), metrics: await db.rows('body_metrics').orderBy('date').last(), sessions: await db.rows('workout_sessions').count(), sets: await db.rows('workout_sets').count() }))
  const profile = data?.profile
  return <><PageTitle kicker="你的裝置，你的資料" title="設定" description="管理個人初始資料與裝置儲存。" />
    <BackupPanel /><ImportPanel onDone={() => {}} />
    <section className="card"><h2>目前個人資料</h2>{profile ? <dl className="profile-grid"><div><dt>性別</dt><dd>{profile.sex === 'male' ? '男' : profile.sex === 'female' ? '女' : '未填寫'}</dd></div><div><dt>生日</dt><dd>{profile.birth_date ?? '未填寫'}</dd></div><div><dt>身高</dt><dd>{profile.height_cm == null ? '未填寫' : `${profile.height_cm} cm`}</dd></div><div><dt>目標</dt><dd>{profile.goal === 'hypertrophy' ? '增肌' : profile.goal}</dd></div><div><dt>活動量</dt><dd>{{ sedentary: '久坐', light: '輕度', moderate: '中度' }[profile.activity_level]}</dd></div><div><dt>限制</dt><dd>{profile.limitations.map(v => v === 'lower_back' ? '腰部限制' : v).join('、') || '無'}</dd></div></dl> : <p className="muted">尚未匯入個人資料。</p>}
      {data?.targets && <p>營養目標：{data.targets.kcal} kcal · 蛋白質 {data.targets.protein_g} g · 碳水 {data.targets.carbs_g} g · 脂肪 {data.targets.fat_g} g</p>}
      {data?.metrics && <p>最近身體數據（{data.metrics.date}）：體重 {data.metrics.weight_kg ?? '—'} kg · 腰圍 {data.metrics.waist_cm ?? '—'} cm</p>}
      <p className="muted">已儲存 {data?.sessions ?? 0} 次訓練、{data?.sets ?? 0} 組紀錄。</p>
    </section><section className="card"><h2>裝置儲存</h2><p>{persisted === true ? '已取得持續儲存權限。' : persisted === false ? '瀏覽器尚未授予持續儲存權限。' : '此瀏覽器未提供持續儲存狀態。'}</p><p className="muted">時區：台北（Asia/Taipei）。資料以 kg、g、cm、kcal 儲存。清除瀏覽器資料會移除本機紀錄。</p></section></>
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [onboarding, setOnboarding] = useState(() => {
    try { return localStorage.getItem(onboardingKey) !== 'done' } catch { return true }
  })
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  useEffect(() => {
    let active = true
    void seedDatabase().then(() => { if (active) setReady(true) }).catch(() => { if (active) setError('無法開啟本機資料庫。請確認瀏覽器允許網站儲存資料，再重新整理。') })
    if (navigator.storage?.persist) void navigator.storage.persist().then(value => { if (active) setPersisted(value) }).catch(() => {})
    const offline = () => setOfflineReady(true)
    const update = () => setUpdateReady(true)
    window.addEventListener('app-offline-ready', offline)
    window.addEventListener('app-update-ready', update)
    return () => { active = false; window.removeEventListener('app-offline-ready', offline); window.removeEventListener('app-update-ready', update) }
  }, [])
  const finish = () => { try { localStorage.setItem(onboardingKey, 'done') } catch { /* 本次仍可使用 */ } setOnboarding(false) }
  if (error) return <main className="welcome"><h1>暫時無法啟動</h1><p role="alert">{error}</p><button className="primary" onClick={() => location.reload()}>重新整理</button></main>
  if (!ready) return <main className="welcome" role="status">正在準備你的 12 週計畫…</main>
  if (onboarding) return <main className="welcome"><div className="brand-mark">12</div><PageTitle kicker="12週增肌" title="把每一次訓練，累積成進步。" description="你的 12 週計畫已準備好。先帶入個人資料，或直接開始瀏覽。" /><ImportPanel initial onDone={finish} /><p className="footer-note">無需帳號 · 資料保存在此裝置</p></main>
  return <div className="app-shell"><header className="topbar"><Link to="/" className="brand"><span className="brand-mark small">12</span>12週增肌</Link><span className="local-badge"><i />本機儲存</span></header>
    <main id="main" className="main-content">{offlineReady && <div role="status" className="note">已準備好離線使用。</div>}{updateReady && <div role="status" className="note">有新版本可使用。<button className="secondary" onClick={() => window.dispatchEvent(new Event('app-apply-update'))}>重新載入更新</button></div>}
      <Routes><Route path="/" element={<Dashboard />} /><Route path="/training" element={<Training />} /><Route path="/plan" element={<Plan />} /><Route path="/history" element={<History />} /><Route path="/history/:id" element={<HistoryDetail />} /><Route path="/nutrition" element={<><PageTitle kicker="好好吃，也好好記" title="飲食" description="每日飲食與營養目標，將在後續階段加入。" /><section className="card placeholder"><span className="placeholder-icon" aria-hidden="true">◉</span><h2>準備好每一餐</h2><p>這裡將呈現你的餐點紀錄與營養進度。</p></section></>} />
        <Route path="/analysis" element={<><PageTitle kicker="看見累積的變化" title="分析" description="每週報告、訓練趨勢與建議，將在後續階段加入。" /><section className="card placeholder"><span className="placeholder-icon" aria-hidden="true">▥</span><h2>讓紀錄說話</h2><p>從每一次訓練，慢慢看見你的進步。</p></section></>} />
        <Route path="/settings" element={<Settings persisted={persisted} />} />
        <Route path="*" element={<><h1>找不到頁面</h1><Link to="/">回到首頁</Link></>} />
      </Routes></main>
    <nav className="bottom-nav" aria-label="主要分頁">{tabs.map(tab => <NavLink key={tab.path} to={tab.path} end={tab.path === '/'} className={({ isActive }) => isActive ? 'tab active' : 'tab'}><span aria-hidden="true" className="tab-icon">{tab.icon}</span><span>{tab.name}</span></NavLink>)}</nav>
  </div>
}
