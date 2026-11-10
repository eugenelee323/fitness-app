import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import { deleteWorkout } from '../db/workouts'
import { muscleLabels, summarizeWorkout } from '../lib/rules/workout'
import type { Row } from '../db/schema'

export function WorkoutSummary({ sets, exercises, bodyweight }: { sets: Row<'workout_sets'>[]; exercises: Row<'exercises'>[]; bodyweight?: number | null }) {
  const result = summarizeWorkout(sets, exercises, bodyweight)
  return <section className="card"><h2>本次訓練成果</h2><div className="big-number">{result.volume == null ? '待補體重' : result.volume.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}<small>{result.volume == null ? '' : ' kg'}</small></div><p>總容量 · 雙手啞鈴已乘 2，單手左右分別計算。</p><h3 className="spaced">各肌群有效組數</h3><dl>{Object.entries(result.muscles).map(([key, count]) => <div key={key}><dt>{muscleLabels[key as keyof typeof muscleLabels]}</dt><dd>{count} 組</dd></div>)}</dl><p className="muted">RIR ≤ 3；主要肌群 1 組、輔助肌群 0.5 組；同組左右合計一次。</p></section>
}
export function History() {
  const data = useLiveQuery(async () => ({ sessions: (await db.rows('workout_sessions').toArray()).sort((a, b) => b.date.localeCompare(a.date) || (b.started_at ?? '').localeCompare(a.started_at ?? '')), drafts: await db.rows('workout_drafts').toArray() }))
  return <><div className="page-title"><span className="eyebrow">每一次努力，都有紀錄</span><h1>訓練歷史</h1></div><Link className="text-link" to="/training">← 返回訓練</Link>{data?.sessions.length === 0 && <section className="card"><p>還沒有訓練紀錄，從一組開始。</p></section>}{data?.sessions.map(s => <Link className="card history-link" key={s.id} to={`/history/${s.id}`}><strong>{s.date} · {s.day_type === 'push' ? '推日' : '拉日'}</strong><span className="badge">{data.drafts.some(d => d.session_id === s.id) ? '進行中' : s.completed ? '已完成' : '部分完成'}</span></Link>)}</>
}
export function HistoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const data = useLiveQuery(async () => ({ session: await db.rows('workout_sessions').get(id ?? ''), sets: await db.rows('workout_sets').where('session_id').equals(id ?? '').toArray(), pains: await db.rows('pain_reports').where('session_id').equals(id ?? '').toArray(), draft: await db.rows('workout_drafts').where('session_id').equals(id ?? '').first(), exercises: await db.rows('exercises').toArray() }), [id])
  if (!data) return <p role="status">讀取中…</p>
  if (!data.session) return <><h1>找不到紀錄</h1><Link to="/history">返回歷史</Link></>
  const { session, sets, exercises } = data
  const groups = [...new Set(sets.map(s => s.exercise_id))]
  return <><Link className="text-link" to="/history">← 訓練歷史</Link><div className="page-title"><span className="eyebrow">{session.date}</span><h1>{session.day_type === 'push' ? '推日' : '拉日'}訓練紀錄</h1><p>{data.draft ? '進行中' : session.completed ? '已完成' : '部分完成'} · 疲勞 {session.fatigue ?? '未填'} · 睡眠 {session.sleep_h ?? '未填'} 小時</p></div>
    {data.draft && <Link className="primary" to="/training">接續這次訓練</Link>}
    <WorkoutSummary sets={sets} exercises={exercises} bodyweight={session.bodyweight_kg} />
    {groups.map(exId => { const ex = exercises.find(e => e.id === exId)!; return <section className="card" key={exId}><h2>{ex.name_zh}<small className="english">{ex.name_en}</small></h2><div className="table-scroll"><table><thead><tr><th>組</th><th>側</th><th>重量 kg</th><th>次數</th><th>RIR</th></tr></thead><tbody>{sets.filter(s => s.exercise_id === exId).sort((a, b) => a.set_no - b.set_no || a.side.localeCompare(b.side)).map(s => <tr key={s.id}><td>{s.set_no}</td><td>{{ both: '雙側', left: '左', right: '右' }[s.side]}</td><td>{s.weight_kg}</td><td>{s.reps}</td><td>{s.rir ?? '—'}</td></tr>)}</tbody></table></div></section> })}
    {data.pains.length > 0 && <section className="card"><h2>疼痛紀錄</h2>{data.pains.map(p => <p key={p.id}>{p.body_part} · {p.score} 分{p.exercise_id && ` · ${exercises.find(e => e.id === p.exercise_id)?.name_zh ?? ''}`}</p>)}</section>}
    {error && <p className="error" role="alert">{error}</p>}<button className="danger" disabled={busy} onClick={async () => {
      if (!window.confirm('確定刪除這次訓練？所有組數、疼痛與進行中草稿都會一併刪除，無法復原。')) return
      setBusy(true)
      try { await deleteWorkout(session.id); navigate('/history') } catch { setError('刪除失敗，原紀錄已保留。'); setBusy(false) }
    }}>刪除這次訓練</button></>
}
