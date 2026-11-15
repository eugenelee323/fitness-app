import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { saveMeasurements } from '../db/inbody'
import { elapsedDays, inbodyDifference, inbodyFields, inbodyMain, recentInbody } from '../lib/rules/inbody'
import { taipeiDate } from '../lib/time'
import { useClock } from '../hooks/useClock'
import { formatN } from '../lib/format'

const InbodyTrend = lazy(() => import('./Charts').then(m=>({ default:m.InbodyTrend })))
const reminder = '建議固定早上空腹、運動前，用同一台機器測量，數據才能比較。'
const unit = (field: typeof inbodyMain[number]) => field === 'body_fat_pct' ? '%' : ' kg'
export function InbodyCard({ trend = false }: { trend?: boolean }) {
  const date = taipeiDate(new Date(useClock()))
  const data = useLiveQuery(() => db.rows('inbody_records').toArray())
  if (!data) return null
  const rows = recentInbody(data, date)
  const [latest, previous] = rows
  const age = latest ? elapsedDays(latest.date,date) : null
  return <section className="card"><h2>InBody</h2>
    {latest ? <><p className={age != null && age > 7 ? 'note backup-alert' : undefined}>距離上次 InBody 已 {age} 天（{latest.date}）。{age != null && age > 7 && '可以安排下次測量。'}</p>
      <dl className="profile-grid">{inbodyMain.map(key => {
        const diff = previous ? inbodyDifference(previous,latest,key) : null
        return <div key={key}><dt>{inbodyFields[key]}</dt><dd>{formatN(latest[key])}{unit(key)}</dd>{diff != null && <small>較 {previous.date} {diff >= 0 ? '+' : ''}{formatN(diff)}{key === 'body_fat_pct' ? ' 個百分點' : ' kg'}</small>}</div>
      })}</dl></> : <p>尚無 InBody 紀錄。</p>}
    <p className="muted">{reminder}</p><Link className="secondary" to="/inbody">記錄 InBody</Link>
    {trend && rows.length > 0 && <Suspense fallback={<p>讀取趨勢…</p>}><InbodyTrend rows={rows} /></Suspense>}
  </section>
}

export function InbodyForm() {
  const today = taipeiDate()
  const [status,setStatus] = useState('')
  const [busy,setBusy] = useState(false)
  return <><h1>記錄 InBody</h1><p>{reminder}</p><form className="card" onSubmit={async event => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const values = Object.fromEntries([...fields].filter(([,v])=>String(v).trim()).map(([k,v])=>[k,k === 'date' || k === 'note' ? String(v).trim() : Number(v)]))
    setBusy(true)
    try { await saveMeasurements([], [values]); setStatus('已儲存。相同日期以本次輸入為準。') }
    catch { setStatus('無法儲存，請檢查必填欄位與數值。') }
    finally { setBusy(false) }
  }}>
    <label>日期<input type="date" name="date" required defaultValue={today} max={today}/></label>
    {Object.entries(inbodyFields).map(([key,label],index)=><label key={key}>{label}{index >= 4 ? '（選填）' : key === 'body_fat_pct' ? '（%）' : '（kg）'}
      {key === 'note' ? <textarea name={key} /> : <input name={key} type="number" min={key === 'weight_kg' ? '0.01' : key === 'bmr_kcal' ? 1 : 0} max={key==='body_fat_pct'?100:undefined} step={key==='bmr_kcal'?1:'any'} inputMode="decimal" required={index < 4} />}</label>)}
    <button className="primary" disabled={busy}>儲存 InBody</button>{status && <p role="status">{status}</p>}
  </form><InbodyCard /></>
}
