import { useState } from 'react'
import { addExtraExercises } from '../db/extra'
import type { Row } from '../db/schema'
import type { Draft } from '../db/workouts'
import { muscleLabels } from '../lib/rules/workout'
import { loadLabel } from '../lib/rules/loadDisplay'

export function ExtraEditor({ draft, library, copyNeedsBack, canCopy, run }: { draft: Draft; library: Row<'exercises'>[]; copyNeedsBack: boolean; canCopy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [open,setOpen] = useState(false)
  const [query,setQuery] = useState('')
  const [muscle,setMuscle] = useState('')
  const [id,setId] = useState('')
  const [sets,setSets] = useState('3')
  const [reps,setReps] = useState('')
  const [weight,setWeight] = useState('')
  const [score,setScore] = useState(0)
  const [copy,setCopy] = useState(false)
  const [busy,setBusy] = useState(false)
  const selected = library.find(e=>e.id===id)
  const options = library.filter(e=>(!muscle || e.primary_muscle===muscle) && `${e.name_zh} ${e.name_en}`.toLowerCase().includes(query.trim().toLowerCase()) && !draft.items.some(i=>i.exercise_id===e.id || i.back_original?.exercise_id===e.id))
  function save(copyPrevious = copy) {
    setBusy(true)
    void run(async()=>{
      await addExtraExercises(draft.id, copyPrevious ? 'copy' : { exerciseId:id, sets:Number(sets), reps:reps ? Number(reps) : undefined, weight:weight ? Number(weight) : undefined }, score)
      setOpen(false);setCopy(false);setId('');setReps('');setWeight('');setScore(0)
    }).finally(()=>setBusy(false))
  }
  return <section className="card"><h2>自選補量動作</h2>{!draft.items.length && <p>目前沒有動作，可自行新增或帶入上次補量日。</p>}
    <button className="secondary" onClick={()=>{setCopy(false);setOpen(!open)}}>新增動作</button>
    {!draft.items.length && <button className="secondary" disabled={!canCopy||busy} onClick={()=>{setOpen(false);if(copyNeedsBack)setCopy(!copy);else save(true)}}>複製上次補量日</button>}
    {(open||copy)&&<form onSubmit={event=>{event.preventDefault();save()}}>
      {open&&<><label>搜尋動作<input value={query} placeholder="輸入中文或英文名稱" onChange={e=>{setQuery(e.target.value);setId('')}} /></label>
        <label>部位<select value={muscle} onChange={e=>{setMuscle(e.target.value);setId('')}}><option value="">全部部位</option>{Object.entries(muscleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>動作<select required value={id} onChange={e=>setId(e.target.value)}><option value="">請選擇</option>{options.map(e=><option key={e.id} value={e.id}>{e.name_zh}／{e.name_en}</option>)}</select></label>
        <div className="form-grid"><label>組數<input type="number" required min={1} max={30} value={sets} onChange={e=>setSets(e.target.value)} /></label>
        <label>次數<input type="number" min={1} placeholder="沿用最近次數" value={reps} onChange={e=>setReps(e.target.value)} /></label>
        <label>{selected ? loadLabel(selected.load_type) : '重量（kg）'}<input type="number" min={0} step="any" placeholder="沿用最近重量" value={weight} onChange={e=>setWeight(e.target.value)} /></label></div>
        {selected?.load_type==='bodyweight'&&<p>沒掛重請填 0。</p>}</>}
      {(copy || selected?.loads_lower_back) && <label>{copy?'若包含壓下背動作，今天腰部感覺如何？':'今天腰部感覺如何？'}<select value={score} onChange={e=>setScore(Number(e.target.value))}>{Array.from({length:11},(_,n)=><option key={n} value={n}>{n} 分</option>)}</select></label>}
      <button className="primary" disabled={busy || (!copy&&!id)}>{copy?'確認帶入':'加入訓練'}</button></form>}
  </section>
}
