import { IconCheck } from '@tabler/icons-react'
import { StartWorkoutButton } from './StartWorkoutButton'
import { applyBackScore,restoreBackItem,undoSet } from '../db/flow'
import { stepInput } from '../lib/rules/flow'
import { ExercisePhoto } from './ExercisePhoto'
import { dayLabels, extraMenu, extraWarnings, extraAlreadyUsed, type DayType } from '../lib/rules/extra'
import { explain } from '../lib/explain'
import { useClock } from '../hooks/useClock'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { Row } from '../db/schema'
import { changeTimer, completeEntry, editEntry, finishWorkout, mutateDraft, replaceExercise, type Draft, type DraftEntry, type DraftItem } from '../db/workouts'
import { currentWeek } from '../lib/rules/workout'
import { taipeiDate } from '../lib/time'

function SetEntry({ draftId, item, entry, increment, run }: { draftId: string; item: DraftItem; entry: DraftEntry; increment:number; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [weight,setWeight]=useState(entry.weight),[reps,setReps]=useState(entry.reps),[busy,setBusy]=useState(false)
  const label=`第 ${entry.set_no} 組${{both:'',left:'左',right:'右'}[entry.side]}`
  async function change(field:'weight'|'reps',value:string){if(field==='weight')setWeight(value);else setReps(value);await run(()=>editEntry(draftId,item.id,entry.id,{[field]:value}))}
  return <div className={`set-entry ${entry.done?'done':''}`} id={`set-${entry.id}`}><div className="set-heading"><strong>{label}</strong><span>{entry.done?<span className="status-icon"><IconCheck size={16}/>已儲存</span>:'選 RIR 即完成並計時'}</span></div>
    <fieldset disabled={entry.done||busy} className="set-controls">{(['weight','reps'] as const).map(field=><label key={field}>{field==='weight'?'重量 kg':'次數'}<div className="step-control"><button type="button" aria-label={`${label}${field==='weight'?'重量':'次數'}減少`} onClick={()=>void change(field,stepInput(field==='weight'?weight:reps,field==='weight'?increment:1,-1))}>−</button><input aria-label={`${label}${field==='weight'?'重量':'次數'}`} type="number" inputMode={field==='weight'?'decimal':'numeric'} min="0" step={field==='weight'?increment:1} value={field==='weight'?weight:reps} placeholder="試重" onChange={e=>void change(field,e.target.value)}/><button type="button" aria-label={`${label}${field==='weight'?'重量':'次數'}增加`} onClick={()=>void change(field,stepInput(field==='weight'?weight:reps,field==='weight'?increment:1,1))}>＋</button></div></label>)}</fieldset>
    <fieldset className="rir-picker" disabled={entry.done||busy}><legend>RIR · 點選即完成</legend><div>{[0,1,2,3,4,5].map(value=><button key={value} type="button" aria-label={`${label} RIR ${value}，完成這組`} aria-pressed={entry.rir===value} onClick={async()=>{setBusy(true);await run(async()=>{
      await completeEntry(draftId,item.id,entry.id,{weight,reps,rir:value})
      const fresh=await db.rows('workout_drafts').get(draftId),index=fresh?.items.findIndex(i=>i.id===item.id)??-1
      if(fresh&&index>=0&&fresh.items[index].entries.every(e=>e.done)){const next=fresh.items[index+1];if(next)requestAnimationFrame(()=>document.getElementById('exercise-'+next.id)?.scrollIntoView({behavior:'smooth',block:'start'}))}
    });setBusy(false)}}>{entry.done&&entry.rir===value?<IconCheck size={14}/>:null}{value}</button>)}</div></fieldset>
    {busy&&<p role="status">儲存中…</p>}
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
  return <aside className="rest-timer" aria-label="組間休息"><div><span>組間休息{timer.paused ? ' · 已暫停' : ''}</span><strong>{remaining ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '休息結束'}</strong></div>{draft.undo&&now<=draft.undo.expires_at&&<button onClick={()=>void run(async()=>{await undoSet(draft.id);document.getElementById('set-'+draft.undo!.entry_id)?.scrollIntoView({behavior:'smooth',block:'center'})})}>復原（3 秒內）</button>}<button onClick={() => void run(() => changeTimer(draft.id, timer.paused ? 'resume' : 'pause'))}>{timer.paused ? '繼續' : '暫停'}</button><button onClick={() => void run(() => changeTimer(draft.id, 'skip'))}>略過</button></aside>
}
function ExerciseCard({ draft, item, exercises, alternatives, previous, run }: { draft: Draft; item: DraftItem; exercises: Row<'exercises'>[]; alternatives: Row<'exercise_alternatives'>[]; previous: { date: string; sets: Row<'workout_sets'>[] } | null; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [selecting, setSelecting] = useState(false)
  const [alternative, setAlternative] = useState('')
  const ex = exercises.find(e => e.id === item.exercise_id)!
  const options = alternatives.filter(a => a.exercise_id === ex.id)
  return <section className="card workout-card" id={`exercise-${item.id}`}><span className="eyebrow">動作 {item.order_no}</span><h2>{ex.name_zh}<small className="english">{ex.name_en}</small></h2><ExercisePhoto code={ex.code} name={ex.name_zh} /><p>{item.sets} 組 × {item.rep_min}–{item.rep_max} 下 · RIR {item.target_rir} · 休息 {item.rest_sec} 秒</p><p className="target-weight">目標：{item.target_weight_kg == null ? '試重／沿用上次紀錄' : `${item.target_weight_kg} kg`}{ex.load_type.startsWith('dumbbell') ? '（單支）' : ex.load_type === 'bodyweight' ? '（填掛重；徒手填 0）' : ex.load_type === 'assisted' ? '（填輔助重量）' : ''}</p>
    {item.back_reason&&<p className="note">{item.back_reason}</p>}{item.back_original&&item.entries.some(e=>!e.done)&&<button className="secondary" onClick={()=>void run(()=>restoreBackItem(draft.id,item.id))}>改回原動作（僅未完成組）</button>}
    {ex.cues && <p className="note">{ex.cues}</p>}
    <details className="previous"><summary>上次同動作 {previous?.date ?? '尚無紀錄'}</summary>{previous && previous.sets.map(set => <p key={set.id}>第 {set.set_no} 組{{ both: '', left: ' 左', right: ' 右' }[set.side]}：{set.weight_kg} kg × {set.reps} 下 · RIR {set.rir ?? '未填'}</p>)}</details>
    {options.length > 0 && item.entries.some(e => !e.done) && <button className="secondary" onClick={() => setSelecting(!selecting)}>替換動作</button>}
    {selecting && <div className="replacement"><label>選擇替代動作<select value={alternative} onChange={e => setAlternative(e.target.value)}><option value="">請選擇</option>{options.map(option => { const other = exercises.find(e => e.id === option.alt_exercise_id)!; return <option key={other.id} value={other.id}>{other.name_zh} / {other.name_en}</option> })}</select></label><p className="muted">僅替換本次尚未完成的組；已完成紀錄保留，未來課表不變。新動作請重新試重。</p><button className="primary" disabled={!alternative} onClick={() => void run(() => replaceExercise(draft.id, item.id, alternative))}>確認替換</button></div>}
    <div className="entries">{item.entries.map(entry => <SetEntry key={entry.id} draftId={draft.id} item={item} entry={entry} increment={ex.increment_kg} run={run} />)}</div>
  </section>
}
function FinishForm({ draft, exercises, run }: { draft: Draft; exercises: Row<'exercises'>[]; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const navigate = useNavigate()
  const [fatigue, setFatigue] = useState(draft.fatigue)
  const [sleep, setSleep] = useState(draft.sleep_h)
  const legacySleepMissing = !draft.sleep_h.trim()
  const [bodyweight, setBodyweight] = useState(draft.bodyweight)
  const [pains, setPains] = useState(draft.pains)
  const [busy, setBusy] = useState(false)
  const [hasPain,setHasPain]=useState(draft.pains.length>0)
  const savePain = (id: string, values: Partial<Draft['pains'][number]>) => {
    setPains(previous => previous.map(p => p.id === id ? { ...p, ...values } : p))
    void run(() => mutateDraft(draft.id, d => { const pain = d.pains.find(p => p.id === id); if (pain) Object.assign(pain, values) }))
  }
  return <section className="card finish-form"><h2>結束訓練</h2><p>填寫恢復狀況。疼痛紀錄可略過；所有欄位會自動儲存。</p>
    <p>昨晚睡眠：{sleep||'未填'} 小時</p>{(legacySleepMissing || draft.sleep_h !== sleep) && <label>補填舊訓練的睡眠（小時）<input type="number" min="0" max="24" step="0.5" value={sleep} onChange={e => setSleep(e.target.value)} /></label>}<h3>練後疲勞 1–10</h3><div className="fatigue-buttons">{Array.from({length:10},(_,i)=>i+1).map(value=><button key={value} aria-pressed={fatigue===String(value)} onClick={()=>{setFatigue(String(value));void run(()=>mutateDraft(draft.id,d=>{d.fatigue=String(value)}))}}>{value}</button>)}</div><div className="form-grid"><label>本次體重 kg<input type="number" inputMode="decimal" min="0.1" step="any" value={bodyweight} onChange={e => { const value = e.target.value; setBodyweight(value); void run(() => mutateDraft(draft.id, d => { d.bodyweight = value })) }} /></label></div><button className="secondary" aria-pressed={!hasPain} onClick={()=>setHasPain(!hasPain)}>{hasPain?'有疼痛（點此收合）':'無新增疼痛 · 有疼痛再展開'}</button><p className="muted">練前與訓練中腰部分數已另外保留。</p>
    {hasPain&&<>{pains.map(pain => <div className="pain-row" key={pain.id}><label>疼痛部位<input value={pain.body_part} placeholder="例如：左肩" onChange={e => savePain(pain.id, { body_part: e.target.value })} /></label><label>分數（0–10）<input type="number" inputMode="numeric" min="0" max="10" step="1" value={pain.score} onChange={e => savePain(pain.id, { score: e.target.value })} /></label><label className="confirm-label"><input type="checkbox" checked={pain.sharp ?? false} onChange={e => savePain(pain.id, { sharp: e.target.checked })} />刺痛</label><label>相關動作（選填）<select value={pain.exercise_id ?? ''} onChange={e => savePain(pain.id, { exercise_id: e.target.value || null })}><option value="">未指定</option>{exercises.filter(e => draft.items.some(i => i.exercise_id === e.id)).map(e => <option value={e.id} key={e.id}>{e.name_zh} / {e.name_en}</option>)}</select></label><button className="secondary" onClick={() => { setPains(pains.filter(p => p.id !== pain.id)); void run(() => mutateDraft(draft.id, d => { d.pains = d.pains.filter(p => p.id !== pain.id) })) }}>移除此部位</button></div>)}
    <button className="secondary" onClick={() => { const pain = { id: crypto.randomUUID(), body_part: '', score: '0', exercise_id: null }; setPains([...pains, pain]); void run(() => mutateDraft(draft.id, d => { d.pains.push(pain) })) }}>＋ 新增疼痛部位</button>
    </>}<button className="primary full-width" disabled={busy} onClick={async () => {
      if (draft.items.some(i => i.entries.some(e => !e.done)) && !window.confirm('仍有未完成的組，確定以「部分完成」儲存並結束訓練？')) return
      setBusy(true)
      await run(async () => { if(sleep!==draft.sleep_h)await mutateDraft(draft.id,d=>{d.sleep_h=sleep}); await finishWorkout(draft.id); navigate(`/history/${draft.session_id}`) })
      setBusy(false)
    }}>{busy ? '正在儲存…' : '儲存並查看本次成果'}</button>
  </section>
}
export function Training() {
  const now=useClock()
  const [nextPush,setNextPush]=useState('')
  const [weekId, setWeekId] = useState('')
  const [day, setDay] = useState<DayType | ''>('')
  const [backOpen,setBackOpen]=useState(false)
  const [backScore,setBackScore]=useState(5)
  const [showFinish, setShowFinish] = useState(false)
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
  return <><div className="page-title"><span className="eyebrow">{draft ? '你的進度會自動保留' : '依今天的狀態，自由安排'}</span><h1>{draft ? '今日訓練' : '準備開始訓練'}</h1><p>{draft ? (saving ? '正在儲存…' : error ? '請先處理下方錯誤，再繼續訓練。' : '所有變更已儲存，可安心離開再接續。') : '選擇週次與推日、拉日或選填補量日。'}</p></div>
    <div className="link-row"><Link className="text-link" to="/plan">12 週計畫</Link><Link className="text-link" to="/history">訓練歷史 →</Link></div>
    {error && <p className="error sticky-error" role="alert">{error}</p>}
    {!draft ? <section className="card"><label>訓練週次<select value={selectedWeek} onChange={e => setWeekId(e.target.value)}>{data.weeks.map(w => <option value={w.id} key={w.id}>第 {w.week_no} 週 · {w.menu} 菜單{w.is_deload ? ' · 減量週' : ''}</option>)}</select></label><fieldset className="day-picker"><legend>今日課表</legend><button aria-pressed={selectedDay === 'push'} onClick={() => setDay('push')}>推日</button><button aria-pressed={selectedDay === 'pull'} onClick={() => setDay('pull')}>拉日</button><button aria-pressed={selectedDay==='extra'} onClick={()=>setDay('extra')}>補量日</button></fieldset>{selectedDay==='extra'&&<><p className="note">每週最多一次，選填不練不影響完成率。18 組、RIR 2–3、休息 60–90 秒；重量沿用最近實績，首次試重。</p><details><summary>查看補量日六項動作</summary>{extraMenu.map(item=>{const ex=data.exercises.find(ex=>ex.code===item.code);return <p key={item.code}>{ex?.name_zh}／{ex?.name_en}<br />{item.sets} 組 × {item.min}–{item.max} 下 · RIR 2–3 · 休息 {item.rest} 秒</p>})}</details><label>預計下次推日日期（選填）<input type="date" value={nextPush} onChange={e=>setNextPush(e.target.value)} /></label>{extraAlreadyUsed(data.sessions,selectedWeek,taipeiDate(new Date(now)))&&<p className="error">本週已使用一次補量日，請至歷史查看。</p>}{extraWarnings(data.sessions,now,nextPush).map(rule=><p className="note" key={rule}>{explain(rule,{})}</p>)}</>}<StartWorkoutButton weekId={selectedWeek} day={selectedDay} label="開始訓練" nextPush={nextPush} /><p className="muted">試重動作請先填重量；其餘欄位已預填，選 RIR 後按「完成這組」即可。</p></section> : <>
      <p className="note">{(() => { const session = data.sessions.find(s => s.id === draft.session_id); const week = data.weeks.find(w => w.id === session?.program_week_id); return `第 ${week?.week_no ?? "—"} 週 · ${week?.menu ?? "—"} 菜單 · ${session ? dayLabels[session.day_type] : "—"}${week?.is_deload ? " · 減量週" : ""}` })()}</p><RestTimer draft={draft} run={run} /><button className="secondary" onClick={()=>setBackOpen(!backOpen)}>腰不舒服</button>{backOpen&&<section className="card"><h2>今天腰部感覺如何？</h2><div className="score-row">{Array.from({length:11},(_,i)=><button aria-pressed={backScore===i} key={i} onClick={()=>setBackScore(i)}>{i}</button>)}</div><p>只調整尚未完成的壓下背動作，已完成組保留。</p><button className="secondary" onClick={()=>void run(async()=>{await applyBackScore(draft.id,backScore);setBackOpen(false)})}>套用腰部規則</button></section>}
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
