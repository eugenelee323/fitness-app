import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { saveBodyMetric, deleteBodyMetric } from '../db/body'
import type { Row } from '../db/schema'
import { bodySummary, isMeasurementSunday } from '../lib/rules/nutrition'
import { useClock } from '../hooks/useClock'
import { taipeiDate } from '../lib/time'
import { formatN } from '../lib/format'

function BodySummary({ rows, date }: { rows: Row<'body_metrics'>[]; date: string }) {
  const summary=bodySummary(rows,date)
  return <><p>本週體重：<strong>{summary.weeklyWeights[2] == null ? '資料不足' : `${formatN(summary.weeklyWeights[2])} kg`}</strong>（同週 {summary.count} 筆，取最後一筆）</p>
    <p>上週體重：{summary.weeklyWeights[1] == null ? '資料不足' : `${formatN(summary.weeklyWeights[1])} kg`} · 差值：{summary.change == null ? '無對照' : `${summary.change >= 0 ? '+' : ''}${formatN(summary.change)} kg`}</p>
    <p className="badge">{{ unknown:'尚無足夠資料比較', below:'低於目標增重範圍', target:'在目標增重範圍內', above:'高於目標增重範圍' }[summary.status]}</p><p className="muted">目標每週 +0.15～0.25 kg；以週一至週日為一週，固定週日早上起床如廁後、進食前測量。</p></>
}
function BodyForm({ date, row, quick=false }: { date:string; row?:Row<'body_metrics'>; quick?:boolean }) {
  const [weight,setWeight]=useState(row?.weight_kg == null ? '' : String(row.weight_kg))
  const [waist,setWaist]=useState(row?.waist_cm == null ? '' : String(row.waist_cm))
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  return <form onSubmit={event=>{event.preventDefault();setBusy(true);setError('');setMessage('');void (async()=>{
    try { if(quick && !weight.trim())throw new Error('請填寫今日體重。');await saveBodyMetric({date,weight_kg:weight.trim()?Number(weight):null,...(quick?{}:{waist_cm:waist.trim()?Number(waist):null})},db,row);setMessage('身體數據已儲存。') }
    catch(err){setError(err instanceof Error && err.name!=='ZodError'?err.message:'請輸入大於 0 的有效數值。')}finally{setBusy(false)}
  })()}}><fieldset disabled={busy}><div className="form-grid"><label>{quick?'今日體重':'體重'}（kg）<input type="number" inputMode="decimal" min="0.01" step="any" value={weight} onChange={e=>setWeight(e.target.value)} /></label>
    {!quick && <label>腰圍（cm，每週選填）<input type="number" inputMode="decimal" min="0.01" step="any" value={waist} onChange={e=>setWaist(e.target.value)} /></label>}</div><button className="primary" type="submit">{busy?'儲存中…':quick?'儲存今日體重':row?'更新身體數據':'儲存身體數據'}</button></fieldset>
    {message && <p role="status" className="success">{message}</p>}{error && <p role="alert" className="error">{error}</p>}</form>
}
export function QuickBody() {
  const today=taipeiDate(new Date(useClock()))
  const rows=useLiveQuery(()=>db.rows('body_metrics').toArray())
  if(!rows)return null
  if(!isMeasurementSunday(today))return <Link to="/body" className="text-link">每週體重與腰圍紀錄 →</Link>
  return <section className="card"><h2>本週量體重與腰圍</h2><p>固定週日早上起床如廁後、進食前測量。</p><Link to="/body" className="primary">記錄本週體重與腰圍</Link><BodySummary rows={rows} date={today} /><Link to="/body" className="text-link">體重與腰圍紀錄 →</Link></section>
}
export function Body() {
  const today=taipeiDate(new Date(useClock()))
  const [date,setDate]=useState(today)
  const [deleting,setDeleting]=useState<string|null>(null)
  const [error,setError]=useState('')
  const rows=useLiveQuery(()=>db.rows('body_metrics').orderBy('date').reverse().toArray())
  if(!rows)return <p role="status">讀取身體數據中…</p>
  const row=rows.find(r=>r.date===date)
  return <><Link to="/" className="text-link">← 首頁</Link><div className="page-title"><span className="eyebrow">看趨勢，逐週調整</span><h1>身體數據</h1><p>每週記錄一次體重與腰圍。固定週日早上起床如廁後、進食前測量；同一週多筆時取最後一筆，舊紀錄保留。</p></div>
    <section className="card"><label>紀錄日期<input aria-label="身體數據日期" type="date" value={date} max={today} onChange={e=>{if(e.target.value)setDate(e.target.value)}} /></label><BodyForm key={`${date}:${row?.id}:${row?.weight_kg}:${row?.waist_cm}`} date={date} row={row} /><BodySummary rows={rows} date={date} /></section>
    <Link to="/analysis" className="secondary">查看趨勢圖 →</Link><section className="card"><h2>身體數據歷史</h2>{!rows.length && <p>尚無紀錄，先輸入一筆體重或腰圍。</p>}{rows.map(r=><article className="body-record" key={r.id}><strong>{r.date}</strong><p>體重 {r.weight_kg == null?'未填':`${formatN(r.weight_kg)} kg`} · 腰圍 {r.waist_cm == null?'未填':`${formatN(r.waist_cm)} cm`}</p><button className="secondary" onClick={()=>{setDate(r.date);window.scrollTo({top:0,behavior:'smooth'})}}>編輯 {r.date}</button><button className="secondary" onClick={()=>setDeleting(r.id)}>刪除 {r.date}</button></article>)}</section>
    {deleting && <section className="card" role="alertdialog" aria-label="刪除身體數據"><h2>確定刪除這筆身體數據？</h2><p>此操作無法復原；不會刪除訓練中的體重紀錄。</p><button className="danger" onClick={()=>void (async()=>{try{await deleteBodyMetric(deleting);setDeleting(null)}catch{setError('刪除失敗，請重試。')}})()}>確認刪除</button><button className="secondary" onClick={()=>setDeleting(null)}>取消</button>{error && <p role="alert" className="error">{error}</p>}</section>}
  </>
}
