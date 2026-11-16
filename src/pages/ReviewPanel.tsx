import { useState } from 'react'
import type { WeeklyInput } from '../lib/rules/weekly'
import { previewReview, reviewAliases, reviewStatusLabels } from '../lib/paste/review'
import { saveReview, type Analysis, type StoredRecommendation } from '../lib/weekly'
import { Targets } from './RecommendationTargets'

export function ReviewPanel({ analysis, input, recs, disabled }: {
  analysis: Analysis; input: WeeklyInput; recs: StoredRecommendation[]; disabled: boolean
}) {
  const [open,setOpen] = useState(false)
  const [raw,setRaw] = useState('')
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const preview = open && raw.trim() ? previewReview(raw,analysis.week_no,recs,input) : null
  async function show() {
    setOpen(true)
    setNotice('')
    if (raw) return
    try { const text = await navigator.clipboard.readText(); setRaw(value=>value || text) }
    catch { /* iPhone 或剪貼簿拒絕時可直接貼入文字框。 */ }
  }
  return <section className="card"><h2>Claude 審核</h2>
    <button className="secondary" disabled={disabled || busy} onClick={()=>open?setOpen(false):void show()}>{open?'收合審核結果':'貼上審核結果'}</button>
    {open && <>
      <label>審核文字<textarea rows={7} disabled={busy} value={raw} onChange={event=>{setRaw(event.target.value);setNotice('')}} placeholder={`#審核 第${analysis.week_no}週\n槓鈴臥推 | 接受\n其他 | 拒絕`} /></label>
      <p className="muted">修改可附重量、組數、次數或 RIR；名稱可填中文、英文或動作代碼。</p>
      {preview && <>
        {preview.error && <p className="error" role="alert">{preview.error}</p>}
        {preview.rows.filter(row=>row.issue).map(row=><p className="error invalid-line" key={row.line}>第 {row.line} 行：{row.text}<br />{row.issue}</p>)}
        <details open><summary>預覽全部建議</summary>
          {preview.decisions.map(({rec,status,after})=><article className="proposal-target" key={rec.id}>
            <strong>{reviewAliases(rec,input)[0]}</strong> · <span className="badge">{reviewStatusLabels[status]}</span>
            {after && <Targets proposal={status==='pending'||!preview.projection ? after : {
              ...after,
              nutrition: status==='rejected' ? undefined : after.nutrition,
              weeks: after.weeks.map(p=>preview.projection!.weeks.find(w=>w.id===p.id) ?? p),
              rows: after.rows.map(p=>preview.projection!.rows.find(r=>r.id===p.id) ?? p),
            }} input={input} full />}
          </article>)}
        </details>
        <button className="primary" data-primary-priority="10" disabled={disabled||busy||!preview.valid} onClick={async()=>{
          setBusy(true); setNotice('')
          try {
            await saveReview(analysis.id,raw,preview.signature)
            setRaw(''); setOpen(false); setNotice('已儲存審核結果。確認其餘建議後，請按「產生下週課表」。')
          } catch (e) { setNotice(e instanceof Error?e.message:'儲存失敗，請重試。') }
          finally { setBusy(false) }
        }}>{busy?'儲存中…':'確認並儲存審核'}</button>
      </>}
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
