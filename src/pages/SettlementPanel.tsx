import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import { currentWeek } from '../lib/rules/workout'
import { taipeiDate } from '../lib/time'
import { settleWeek } from '../lib/weekly'

export function SettlementPanel({ initialWeek }: { initialWeek?: number }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(initialWeek ?? currentWeek('2026-11-09', taipeiDate()))
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = useLiveQuery(async () => {
    const program = await db.rows('programs').where('status').equals('active').first() ?? await db.rows('programs').toCollection().first()
    return program ? await db.rows('weekly_analyses').where('[program_id+week_no]').equals([program.id, selected]).first() ?? null : null
  }, [selected])
  async function run() {
    setBusy(true); setError('')
    try { await settleWeek(selected, true); setConfirm(false); navigate(`/analysis/${selected}`) }
    catch (err) { setError(err instanceof Error ? err.message : '結算失敗，原課表未變更。') }
    finally { setBusy(false) }
  }
  return <section className="card"><h2>每週結算</h2><p>週日 21:00 後開啟會自動結算；也可手動結算本週或重新計算報告。</p><label>結算週次<select value={selected} disabled={busy} onChange={event => { setSelected(Number(event.target.value)); setConfirm(false); setError('') }}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>第 {i + 1} 週</option>)}</select></label>
    {confirm ? <div className="note"><p>{existing?.applied_at ? '此週已產生課表。重新結算只更新報告，保留既有建議與變更歷史，不會重複套用。' : '重新結算會替換尚未套用的建議，先前的接受、拒絕與修改需要重新處理。課表不會因此變更。'}</p><button className="primary" disabled={busy} onClick={() => void run()}>確認重新結算</button><button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>取消</button></div> : <button className="primary" disabled={busy} onClick={() => existing ? setConfirm(true) : void run()}>{busy ? '結算中…' : '結算本週／所選週次'}</button>}
    {existing && <Link className="text-link" to={`/analysis/${selected}`}>查看第 {selected} 週報告 →</Link>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
