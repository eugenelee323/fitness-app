import { BackupPrompt } from './BackupButton'
import { CopyReport } from './CopyReport'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { weeklyData, loadWeeklyInput, decideRecommendation, applyRecommendations, acceptPendingRecommendations, type StoredRecommendation } from '../lib/weekly'
import { proposalSchema, type Proposal } from '../lib/weekly/types'
import { muscleLabels } from '../lib/rules/workout'
import type { WeeklyInput } from '../lib/rules/weekly'

function Targets({ proposal, input }: { proposal: Proposal; input: WeeklyInput }) {
  if (proposal.nutrition) { const n = proposal.nutrition; return <p>每日 {n.kcal} kcal · 蛋白質 {n.protein_g} g · 碳水 {n.carbs_g} g · 脂肪 {n.fat_g} g<br />生效日期：{n.effective_from}（逾期確認改為確認當日生效）</p> }
  if (!proposal.rows.length && !proposal.weeks.length) return <p className="muted">維持現有課表</p>
  return <>{proposal.weeks.map(w => <p key={w.id}>第 {input.weeks.find(week => week.id === w.id)?.week_no} 週：{w.is_deload ? '減量週' : '正常訓練週'}</p>)}{proposal.rows.map(row => {
    const plan = input.plans.find(p => p.id === row.id)
    const ex = input.exercises.find(e => e.id === (row.exercise_id ?? plan?.exercise_id))
    return <div className="proposal-target" key={row.id}><strong>{ex?.name_zh}<small className="english">{ex?.name_en}</small></strong><p>{row.sets != null && `${row.sets} 組 · `}{row.target_weight_kg !== undefined && (row.target_weight_kg === null ? '試重 · ' : `${row.target_weight_kg} kg · `)}{row.target_rir != null && `RIR ${row.target_rir} · `}{row.target_reps != null && `目標 ${row.target_reps} 下 · `}{row.is_paused === true ? '暫停此動作' : row.is_paused === false ? '使用此動作' : ''}</p></div>
  })}</>
}
function RecommendationCard({ rec, input, locked, run }: { rec: StoredRecommendation; input: WeeklyInput; locked: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const parsed = proposalSchema.safeParse(rec.after)
  const before = proposalSchema.safeParse(rec.before)
  if (!parsed.success || !before.success) return <section className="card"><p>建議格式無效，請重新結算。</p></section>
  const after = parsed.data
  const name = rec.target_type === 'nutrition' ? '每日營養目標' : rec.target_type === 'program' ? '減量與恢復安排' : rec.target_type === 'muscle' ? `${muscleLabels[rec.target_ref as keyof typeof muscleLabels] ?? '肌群'}組數` : input.exercises.find(e => e.id === rec.target_ref)?.name_zh ?? '動作目標'
  const editable = after.editable === 'kcal' || after.editable === 'weight' || after.editable === 'sets' || (after.editable === 'deload' && before.data.postpone_allowed)
  return <section className="card recommendation"><div className="recommendation-heading"><h2>{name}</h2><span className={`badge decision-${rec.status}`}>{{ pending: '待確認', accepted: '已接受', rejected: '已拒絕', modified: '已修改' }[rec.status]}</span></div><p className="rule-ref">依據規則：{rec.rule_id}</p><p className="reason">{rec.reason}</p>
    <details className="proposal-comparison"><summary>查看現有下週課表與建議目標</summary><div><section><h3>現有下週課表</h3><Targets proposal={before.data} input={input} /></section><section><h3>建議目標</h3><Targets proposal={after} input={input} /></section></div></details>
    {!locked && <div className="button-row"><button className="secondary" onClick={() => void run(() => decideRecommendation(rec.id, 'accepted'))}>接受原建議</button><button className="secondary" onClick={() => void run(() => decideRecommendation(rec.id, 'rejected'))}>拒絕</button><button className="secondary" disabled={!editable} onClick={() => { setValues(after.nutrition ? { kcal: String(after.nutrition.kcal) } : Object.fromEntries(after.rows.map(row => [row.id, String(after.editable === 'sets' ? row.sets ?? '' : row.target_weight_kg ?? '')]))); setEditing(!editing) }}>修改</button></div>}
    {editing && !locked && <div className="edit-recommendation"><h3>修改建議</h3>{after.editable === 'kcal' ? <label>每日熱量（kcal，較原目標最多 ±150）<input type="number" step="1" value={values.kcal ?? ''} onChange={e => setValues({ kcal: e.target.value })} /></label> : after.editable === 'deload' ? <p>可將延後建議改為「依原定週次減量」。不能將減量延後超過兩週。</p> : after.rows.map(row => {
      const ex = input.exercises.find(e => e.id === input.plans.find(p => p.id === row.id)?.exercise_id)
      return <label key={row.id}>{ex?.name_zh} / {ex?.name_en} · {after.editable === 'sets' ? '組數' : '重量 kg'}<input type="number" inputMode={after.editable === 'sets' ? 'numeric' : 'decimal'} min={after.editable === 'sets' ? 1 : 0} step={after.editable === 'sets' ? 1 : 'any'} value={values[row.id] ?? ''} onChange={e => setValues({ ...values, [row.id]: e.target.value })} /></label>
    })}<button className="primary" onClick={() => void run(async () => {
      if (after.editable !== 'deload' && Object.values(values).some(value => value.trim() === '')) throw new Error('請填寫修改數值。')
      await decideRecommendation(rec.id, 'modified', after.editable === 'kcal' ? { kcal: Number(values.kcal) } : after.editable === 'deload' ? { deload: true } : { rows: after.rows.map(row => ({ id: row.id, value: Number(values[row.id]) })) })
      setEditing(false)
    })}>{after.editable === 'deload' ? '改為照原定時間減量' : '儲存修改並確認'}</button><button className="secondary" onClick={() => setEditing(false)}>取消修改</button></div>}
  </section>
}
export function Recommendations() {
  const { week } = useParams()
  const no = Number(week)
  const [backupPrompt,setBackupPrompt]=useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = useLiveQuery(async () => ({ ...await weeklyData(), input: await loadWeeklyInput() }))
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err instanceof Error && err.name !== 'ZodError' ? err.message : '數值不符合範圍，請檢查後重試。') } finally { setBusy(false) }
  }
  const analysis = data?.analyses.find(a => a.week_no === no)
  if (!data) return <p role="status">讀取建議中…</p>
  if (!analysis || !data.input) return <><h1>尚無這週建議</h1><Link to="/analysis">返回分析並結算</Link></>
  const priority = (r: StoredRecommendation) => ['L1', 'S1'].includes(r.rule_id) ? 0 : r.target_type === 'program' ? 1 : r.rule_id === 'L0' ? 4 : r.target_type === 'muscle' ? 3 : 2
  const recs = data.recommendations.filter(r => r.analysis_id === analysis.id).sort((a, b) => priority(a) - priority(b) || a.target_ref.localeCompare(b.target_ref))
  const pending = recs.filter(r => r.status === 'pending').length
  return <><Link className="text-link" to={`/analysis/${no}`}>← 第 {no} 週報告</Link><div className="page-title"><span className="eyebrow">由你決定，再套用</span><h1>下週訓練與飲食建議</h1><p>先逐條處理建議，最後按「產生下週課表」。接受或修改單條建議都不會立即套用。營養調整保留蛋白質與脂肪，用碳水補熱量差額。</p><p className="muted">啞鈴重量填單支，徒手動作填掛重。修改後仍會檢查單次 12 組、120 分鐘及一次只改一個變數。</p></div>
    {analysis.applied_at && <div className="note">已套用確認的課表與營養建議，未再重複套用。請匯出完整備份。<Link to="/settings" className="text-link">前往備份 →</Link><Link to="/plan" className="text-link">查看課表 →</Link></div>}
    {error && <p role="alert" className="error sticky-error">{error}</p>}
    <CopyReport weekNo={no} />{backupPrompt&&<BackupPrompt onClose={()=>setBackupPrompt(false)} />}<fieldset disabled={busy} className="recommendations-list">{recs.map(rec => <RecommendationCard key={rec.id} rec={rec} input={data.input!} locked={!!analysis.applied_at} run={run} />)}</fieldset>
    {!analysis.applied_at&&recs.some(r=>r.status==='pending')&&<button className="secondary" disabled={busy} onClick={()=>void run(()=>acceptPendingRecommendations(analysis.id))}>全部接受</button>}
    {!recs.length && <section className="card"><p>本週資料不足或已到第 12 週，沒有可套用的下週建議。</p></section>}
    {!analysis.applied_at && recs.length > 0 && <section className="card"><p>尚有 {pending} 條待確認。拒絕的建議不會套用；未更改的目標保留現有值。</p><button className="primary full-width" disabled={busy || pending > 0} onClick={() => void run(async () => { await applyRecommendations(analysis.id); setBackupPrompt(true) })}>{busy ? '處理中…' : '產生下週課表並套用營養建議'}</button><p className="muted">若結算後新增或修改了訓練資料，請先重新結算；目標週已開始訓練時不再更動課表。</p></section>}
  </>
}
