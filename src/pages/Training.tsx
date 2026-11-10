import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { Row } from '../db/schema'
import { changeTimer, completeEntry, editEntry, finishWorkout, mutateDraft, replaceExercise, startWorkout, type Draft, type DraftEntry, type DraftItem } from '../db/workouts'
import { currentWeek } from '../lib/rules/workout'
import { taipeiDate } from '../lib/time'

function SetEntry({ draftId, item, entry, run }: { draftId: string; item: DraftItem; entry: DraftEntry; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [weight, setWeight] = useState(entry.weight)
  const [reps, setReps] = useState(entry.reps)
  const [rir, setRir] = useState(entry.rir)
  const [busy, setBusy] = useState(false)
  const side = { both: '', left: '左', right: '右' }[entry.side]
  const label = `第 ${entry.set_no} 組${side}`
  return <div className={`set-entry ${entry.done ? 'done' : ''}`}><div className="set-heading"><strong>{label}</strong><span>{entry.done ? '✓ 已儲存' : '預填目標，修改不同處即可'}</span></div>
    <div className="set-inputs"><label>重量 kg<input aria-label={`${label}重量`} type="number" inputMode="decimal" min="0" step="any" value={weight} placeholder="試重" disabled={entry.done || busy} onChange={e => { const value = e.target.value; setWeight(value); void run(() => editEntry(draftId, item.id, entry.id, { weight: value })) }} /></label><label>次數<input aria-label={`${label}次數`} type="number" inputMode="numeric" min="0" step="1" value={reps} disabled={entry.done || busy} onChange={e => { const value = e.target.value; setReps(value); void run(() => editEntry(draftId, item.id, entry.id, { reps: value })) }} /></label></div>
    <fieldset className="rir-picker" disabled={entry.done || busy}><legend>RIR（還能做幾下）</legend><div>{[0, 1, 2, 3, 4, 5].map(value => <button key={value} type="button" aria-label={`${label} RIR ${value}`} aria-pressed={rir === value} className={rir === value ? 'chosen' : ''} onClick={() => { setRir(value); void run(() => editEntry(draftId, item.id, entry.id, { rir: value })) }}>{value}</button>)}</div></fieldset>
    <button className="complete-button" disabled={entry.done || busy} onClick={async () => { setBusy(true); await run(() => completeEntry(draftId, item.id, entry.id, { weight, reps, rir })); setBusy(false) }}>{entry.done ? '已完成這組' : busy ? '正在儲存…' : '完成這組'}</button>
  </div>
}
function RestTimer({ draft, run }: { draft: Draft; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const interval = window.setInterval(refresh, 500)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  const timer = draft.timer
  const remaining = Math.max(0, Math.ceil((timer.paused ? timer.remaining_ms : Math.min(timer.remaining_ms, (timer.ends_at ?? now) - now)) / 1000))
  if (!timer.ends_at && !timer.paused) return null
  return <aside className="rest-timer" aria-label="組間休息"><div><span>組間休息{timer.paused ? ' · 已暫停' : ''}</span><strong>{remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '休息結束'}</strong></div><button onClick={() => void run(() => changeTimer(draft.id, timer.paused ? 'resume' : 'pause'))}>{timer.paused ? '繼續' : '暫停'}</button><button onClick={() => void run(() => changeTimer(draft.id, 'skip'))}>略過</button></aside>
}
function ExerciseCard({ draft, item, exercises, alternatives, previous, run }: { draft: Draft; item: DraftItem; exercises: Row<'exercises'>[]; alternatives: Row<'exercise_alternatives'>[]; previous: { date: string; sets: Row<'workout_sets'>[] } | null; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [selecting, setSelecting] = useState(false)
  const [alternative, setAlternative] = useState('')
  const ex = exercises.find(e => e.id === item.exercise_id)!
  const options = alternatives.filter(a => a.exercise_id === ex.id)
  return <section className="card workout-card"><span className="eyebrow">動作 {item.order_no}</span><h2>{ex.name_zh}<small className="english">{ex.name_en}</small></h2><p>{item.sets} 組 × {item.rep_min}–{item.rep_max} 下 · RIR {item.target_rir} · 休息 {item.rest_sec} 秒</p><p className="target-weight">目標：{item.target_weight_kg == null ? '試重／沿用上次紀錄' : `${item.target_weight_kg} kg`}{ex.load_type.startsWith('dumbbell') ? '（單支）' : ex.load_type === 'bodyweight' ? '（填掛重；徒手填 0）' : ex.load_type === 'assisted' ? '（填輔助重量）' : ''}</p>
    {ex.cues && <p className="note">{ex.cues}</p>}
    <details className="previous"><summary>上次同動作 {previous?.date ?? '尚無紀錄'}</summary>{previous && previous.sets.map(set => <p key={set.id}>第 {set.set_no} 組{{ both: '', left: ' 左', right: ' 右' }[set.side]}：{set.weight_kg} kg × {set.reps} 下 · RIR {set.rir ?? '未填'}</p>)}</details>
    {options.length > 0 && item.entries.some(e => !e.done) && <button className="secondary" onClick={() => setSelecting(!selecting)}>替換動作</button>}
    {selecting && <div className="replacement"><label>選擇替代動作<select value={alternative} onChange={e => setAlternative(e.target.value)}><option value="">請選擇</option>{options.map(option => { const other = exercises.find(e => e.id === option.alt_exercise_id)!; return <option key={other.id} value={other.id}>{other.name_zh} / {other.name_en}</option> })}</select></label><p className="muted">僅替換本次尚未完成的組；已完成紀錄保留，未來課表不變。新動作請重新試重。</p><button className="primary" disabled={!alternative} onClick={() => void run(() => replaceExercise(draft.id, item.id, alternative))}>確認替換</button></div>}
    <div className="entries">{item.entries.map(entry => <SetEntry key={entry.id} draftId={draft.id} item={item} entry={entry} run={run} />)}</div>
  </section>
}
function FinishForm({ draft, exercises, run }: { draft: Draft; exercises: Row<'exercises'>[]; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const navigate = useNavigate()
  const [fatigue, setFatigue] = useState(draft.fatigue)
  const [sleep, setSleep] = useState(draft.sleep_h)
  const [bodyweight, setBodyweight] = useState(draft.bodyweight)
  const [pains, setPains] = useState(draft.pains)
  const [busy, setBusy] = useState(false)
  const savePain = (id: string, values: Partial<Draft['pains'][number]>) => {
    setPains(previous => previous.map(p => p.id === id ? { ...p, ...values } : p))
    void run(() => mutateDraft(draft.id, d => { const pain = d.pains.find(p => p.id === id); if (pain) Object.assign(pain, values) }))
  }
  return <section className="card finish-form"><h2>結束訓練</h2><p>填寫恢復狀況。疼痛紀錄可略過；所有欄位會自動儲存。</p>
    <div className="form-grid"><label>疲勞（1–10）<input type="number" inputMode="numeric" min="1" max="10" step="1" value={fatigue} onChange={e => { const value = e.target.value; setFatigue(value); void run(() => mutateDraft(draft.id, d => { d.fatigue = value })) }} /></label><label>昨晚睡眠（小時）<input type="number" inputMode="decimal" min="0" max="24" step="0.1" value={sleep} onChange={e => { const value = e.target.value; setSleep(value); void run(() => mutateDraft(draft.id, d => { d.sleep_h = value })) }} /></label><label>本次體重 kg<input type="number" inputMode="decimal" min="0.1" step="any" value={bodyweight} onChange={e => { const value = e.target.value; setBodyweight(value); void run(() => mutateDraft(draft.id, d => { d.bodyweight = value })) }} /></label></div><p className="muted">徒手與輔助動作需要體重才能計算容量。</p>
    {pains.map(pain => <div className="pain-row" key={pain.id}><label>疼痛部位<input value={pain.body_part} placeholder="例如：左肩" onChange={e => savePain(pain.id, { body_part: e.target.value })} /></label><label>分數（0–10）<input type="number" inputMode="numeric" min="0" max="10" step="1" value={pain.score} onChange={e => savePain(pain.id, { score: e.target.value })} /></label><label className="confirm-label"><input type="checkbox" checked={pain.sharp ?? false} onChange={e => savePain(pain.id, { sharp: e.target.checked })} />刺痛</label><label>相關動作（選填）<select value={pain.exercise_id ?? ''} onChange={e => savePain(pain.id, { exercise_id: e.target.value || null })}><option value="">未指定</option>{exercises.filter(e => draft.items.some(i => i.exercise_id === e.id)).map(e => <option value={e.id} key={e.id}>{e.name_zh} / {e.name_en}</option>)}</select></label><button className="secondary" onClick={() => { setPains(pains.filter(p => p.id !== pain.id)); void run(() => mutateDraft(draft.id, d => { d.pains = d.pains.filter(p => p.id !== pain.id) })) }}>移除此部位</button></div>)}
    <button className="secondary" onClick={() => { const pain = { id: crypto.randomUUID(), body_part: '', score: '0', exercise_id: null }; setPains([...pains, pain]); void run(() => mutateDraft(draft.id, d => { d.pains.push(pain) })) }}>＋ 新增疼痛部位</button>
    <button className="primary full-width" disabled={busy} onClick={async () => {
      if (draft.items.some(i => i.entries.some(e => !e.done)) && !window.confirm('仍有未完成的組，確定以「部分完成」儲存並結束訓練？')) return
      setBusy(true)
      await run(async () => { await finishWorkout(draft.id); navigate(`/history/${draft.session_id}`) })
      setBusy(false)
    }}>{busy ? '正在儲存…' : '儲存並查看本次成果'}</button>
  </section>
}
export function Training() {
  const [weekId, setWeekId] = useState('')
  const [day, setDay] = useState<'push' | 'pull' | ''>('')
  const [showFinish, setShowFinish] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState('')
  const data = useLiveQuery(async () => ({ draft: await db.rows('workout_drafts').toCollection().first(), weeks: await db.rows('program_weeks').orderBy('week_no').toArray(), program: await db.rows('programs').where('status').equals('active').first() ?? await db.rows('programs').toCollection().first(), sessions: await db.rows('workout_sessions').toArray(), sets: await db.rows('workout_sets').toArray(), exercises: await db.rows('exercises').toArray(), alternatives: await db.rows('exercise_alternatives').toArray() }))
  async function run(fn: () => Promise<unknown>) {
    setSaving(n => n + 1); setError('')
    try { await fn() } catch (err) { setError(err instanceof Error && err.name !== 'ZodError' ? err.message : '輸入值不符合範圍，請檢查重量、整數次數、疲勞與疼痛分數。') } finally { setSaving(n => n - 1) }
  }
  if (!data) return <p role="status">讀取訓練中…</p>
  const { draft, exercises } = data
  const defaultWeek = data.weeks.find(w => w.week_no === currentWeek(data.program?.start_date ?? taipeiDate(), taipeiDate()))
  const selectedWeek = weekId || defaultWeek?.id || data.weeks[0]?.id
  const selectedDay = day || (data.sessions.some(s => s.program_week_id === selectedWeek && s.day_type === 'push' && s.completed) ? 'pull' : 'push')
  return <><div className="page-title"><span className="eyebrow">{draft ? '你的進度會自動保留' : '依今天的狀態，自由安排'}</span><h1>{draft ? '今日訓練' : '準備開始訓練'}</h1><p>{draft ? (saving ? '正在儲存…' : error ? '請先處理下方錯誤，再繼續訓練。' : '所有變更已儲存，可安心離開再接續。') : '選擇週次與推／拉日，帶入課表目標。'}</p></div>
    <div className="link-row"><Link className="text-link" to="/plan">12 週計畫</Link><Link className="text-link" to="/history">訓練歷史 →</Link></div>
    {error && <p className="error sticky-error" role="alert">{error}</p>}
    {!draft ? <section className="card"><label>訓練週次<select value={selectedWeek} onChange={e => setWeekId(e.target.value)}>{data.weeks.map(w => <option value={w.id} key={w.id}>第 {w.week_no} 週 · {w.menu} 菜單{w.is_deload ? ' · 減量週' : ''}</option>)}</select></label><fieldset className="day-picker"><legend>今日課表</legend><button aria-pressed={selectedDay === 'push'} onClick={() => setDay('push')}>推日</button><button aria-pressed={selectedDay === 'pull'} onClick={() => setDay('pull')}>拉日</button></fieldset><button className="primary full-width" disabled={busy || !selectedWeek} onClick={async () => { setBusy(true); await run(() => startWorkout(selectedWeek, selectedDay)); setBusy(false) }}>開始訓練</button><p className="muted">試重動作請先填重量；其餘欄位已預填，選 RIR 後按「完成這組」即可。</p></section> : <>
      <p className="note">{(() => { const session = data.sessions.find(s => s.id === draft.session_id); const week = data.weeks.find(w => w.id === session?.program_week_id); return `第 ${week?.week_no ?? "—"} 週 · ${week?.menu ?? "—"} 菜單 · ${session?.day_type === "push" ? "推日" : "拉日"}${week?.is_deload ? " · 減量週" : ""}` })()}</p><RestTimer draft={draft} run={run} />
      {draft.items.map(item => {
        const previousSessions = data.sessions.filter(s => s.id !== draft.session_id && data.sets.some(set => set.session_id === s.id && set.exercise_id === item.exercise_id)).sort((a, b) => b.date.localeCompare(a.date) || (b.started_at ?? '').localeCompare(a.started_at ?? ''))
        const previous = previousSessions[0]
        return <ExerciseCard key={item.id} draft={draft} item={item} exercises={exercises} alternatives={data.alternatives} previous={previous ? { date: previous.date, sets: data.sets.filter(s => s.session_id === previous.id && s.exercise_id === item.exercise_id).sort((a, b) => a.set_no - b.set_no) } : null} run={run} />
      })}
      {!showFinish && <button className="primary full-width" onClick={() => setShowFinish(true)}>結束訓練</button>}
      {showFinish && <FinishForm key={draft.id} draft={draft} exercises={exercises} run={run} />}
      <p className="muted">如需刪除此訓練，請前往訓練歷史。</p>
    </>}
  </>
}
