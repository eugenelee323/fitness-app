import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { db } from '../db'
import { weeklyData } from '../lib/weekly'
import { metricsSchema } from '../lib/weekly/report'
import { MAIN_LIFTS } from '../lib/rules/weekly'
import { muscleLabels } from '../lib/rules/workout'
import { SettlementPanel } from './SettlementPanel'

const number = (value: number | null) => value == null ? '未填／無對照' : value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
const percent = (value: number | null) => value == null ? '無對照' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
const progressNames = { new: '首次／資料不足', up: '進步', flat: '持平', down: '退步' }
export function AnalysisIndex() {
  const data = useLiveQuery(() => weeklyData())
  return <><div className="page-title"><span className="eyebrow">固定規則，清楚看見原因</span><h1>每週分析</h1><p>先記錄訓練，再結算報告；所有課表建議都需要你確認。</p></div><SettlementPanel />
    {data?.analyses.length === 0 && <section className="card"><p>尚未結算任何一週。可從上方手動結算，課表不會自動變更。</p></section>}
    {data?.analyses.sort((a, b) => b.week_no - a.week_no).map(a => <Link className="card history-link" to={`/analysis/${a.week_no}`} key={a.id}><strong>第 {a.week_no} 週報告</strong><span className="badge">{a.applied_at ? '已產生課表' : data.recommendations.filter(r => r.analysis_id === a.id && r.status === 'pending').length ? '有待確認建議' : '已結算'}</span></Link>)}
    <Link to="/plan" className="text-link">查看 12 週計畫 →</Link>
  </>
}
export function WeeklyReport() {
  const { week } = useParams()
  const no = Number(week)
  const data = useLiveQuery(async () => ({ analysis: (await db.rows('weekly_analyses').toArray()).find(a => a.week_no === no), recs: await db.rows('recommendations').toArray() }), [no])
  if (!Number.isInteger(no) || no < 1 || no > 12) return <p>找不到週次。<Link to="/analysis">返回分析</Link></p>
  if (!data) return <p role="status">讀取報告中…</p>
  const parsed = metricsSchema.safeParse(data.analysis?.metrics)
  if (!parsed.success || !data.analysis) return <><h1>第 {no} 週尚無有效報告</h1><SettlementPanel initialWeek={no} /></>
  const m = parsed.data
  const recs = data.recs.filter(r => r.analysis_id === data.analysis!.id)
  return <><Link className="text-link" to="/analysis">← 每週分析</Link><div className="page-title"><span className="eyebrow">第 {no} 週 · {m.menu} 菜單 · {m.isDeload ? '減量週' : '訓練週'}</span><h1>你的每週訓練報告</h1><p>結算時間：{new Date(data.analysis.computed_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p></div>
    {m.warnings.map(w => <p className="note" key={w}>{w}</p>)}
    {data.analysis.applied_at && <div className="note">下週課表已產生；重新結算只更新報告，不會重複套用建議。<Link to="/settings" className="text-link">記得匯出備份 →</Link></div>}
    <section className="card"><h2>完成與恢復</h2><div className="report-grid"><div><strong>{(m.completion.ratio * 100).toFixed(1)}%</strong><small>完成率 · {m.completion.done}／{m.completion.target} 組</small></div><div><strong>{m.sessionCount}</strong><small>次已結束訓練</small></div><div><strong>{number(m.avgFatigue)}</strong><small>平均疲勞／10</small></div><div><strong>{number(m.avgSleep)}</strong><small>平均睡眠／小時</small></div></div></section>
    <section className="card"><h2>容量比較</h2><div className="big-number">{number(m.volume)}<small> kg</small></div><p>與上週比：{percent(m.previousWeekChange)} · 上週 {number(m.previousWeekVolume)} kg</p><p>與上次同菜單比：{percent(m.sameMenuChange)}{m.previousSameMenuWeek != null && ` · 第 ${m.previousSameMenuWeek} 週 ${number(m.sameMenuVolume)} kg`}</p><p className="muted">A／B 菜單不同，請同時參考完成率與同菜單對照。沒有對照或對照為 0 時不計百分比。</p></section>
    <section className="card"><h2>各肌群有效組數</h2><p className="muted">每週建議區間 10–20 組；容量按主要肌群歸屬，不重複加計輔助肌群。</p>{Object.entries(m.muscles).map(([key, value]) => <div className="muscle-row" key={key}><div><strong>{muscleLabels[key as keyof typeof muscleLabels]}</strong><span>{number(value.sets)} 組 · {number(value.volume)} kg</span></div><meter min="0" max="30" low={10} high={20} optimum={15} value={value.sets} aria-label={`${muscleLabels[key as keyof typeof muscleLabels]}每週有效組數，建議 10 到 20 組`} /><small>建議 10–20 組</small></div>)}</section>
    <section className="card"><h2>動作進步與停滯</h2><p className="muted">e1RM ≥ +1% 為進步、≤ −2% 為退步。停滯以同動作有紀錄的週次觀測累計；空白週不當作持平。</p>{m.exercises.length === 0 && <p>本週沒有可比較的動作。</p>}{m.exercises.map(e => <article className="exercise" key={e.exercise.id}><h3>{MAIN_LIFTS.includes(e.exercise.code) && <span className="badge">主動作</span>} {e.exercise.name_zh}<small className="english">{e.exercise.name_en}</small></h3><p>e1RM：{number(e.best)} kg · 上次 {number(e.previousBest)} kg</p><p><span className={`status-${e.status}`}>{progressNames[e.status]}</span> · 持平／退步 {e.flatOccurrences} 次 · 停滯觀測 {e.flatWeeks} 週{e.stalled ? '（已停滯）' : ''}{e.downWeeks ? ` · 連續退步 ${e.downWeeks} 週` : ''}</p></article>)}</section>
    <section className="card"><h2>疼痛紀錄</h2>{m.pains.length ? m.pains.map(p => <p key={p.id}>{p.date} · {p.body_part} {p.score} 分{p.sharp ? ' · 刺痛' : ''}</p>) : <p>本週沒有疼痛紀錄。</p>}</section>
    {recs.length > 0 && <Link className="primary full-width" to={`/analysis/${no}/recommendations`}>查看下週建議（{recs.length} 條）</Link>}
    {no === 12 && <div className="note">12 週計畫已到最後一週，保留測量與報告，不產生第 13 週課表。</div>}
    <SettlementPanel initialWeek={no} />
  </>
}
