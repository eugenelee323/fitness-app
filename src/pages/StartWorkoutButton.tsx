import { useClock } from '../hooks/useClock'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { beginWorkout } from '../db/flow'
import { extraAlreadyUsed,extraWarnings,type DayType } from '../lib/rules/extra'
import { explain } from '../lib/explain'
import { taipeiDate } from '../lib/time'
export function StartWorkoutButton({weekId,day,label='開始今日訓練',nextPush=''}:{weekId:string;day:DayType;label?:string;nextPush?:string}){
  const now=useClock()
  const navigate=useNavigate(),[open,setOpen]=useState(false),[sleep,setSleep]=useState('8'),[score,setScore]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const data=useLiveQuery(async()=>({draft:await db.rows('workout_drafts').toCollection().first(),plans:await db.rows('planned_exercises').where('program_week_id').equals(weekId).toArray(),exercises:await db.rows('exercises').toArray(),sessions:await db.rows('workout_sessions').toArray()}),[weekId])
  const hasBack=!!data?.plans.some(p=>p.day_type===day&&!p.is_paused&&data.exercises.find(e=>e.id===p.exercise_id)?.loads_lower_back)
  const blocked=!!data&&day==='extra'&&!data.draft&&extraAlreadyUsed(data.sessions,weekId,taipeiDate())
  return <><button className="primary" disabled={!data||busy||blocked} onClick={()=>{
    if(data?.draft){navigate('/training');return}
    const previous=data?.sessions.filter(s=>s.sleep_h!=null).sort((a,b)=>b.date.localeCompare(a.date)||(b.started_at??'').localeCompare(a.started_at??''))[0]
    setSleep(String(previous?.sleep_h??8));setScore(0);setError('');setOpen(true)
  }}>{blocked?'本週已使用補量日':label}</button>
  {open&&<section className="card preflight" role="dialog" aria-label="開始前確認"><h2>開始前確認</h2><label>昨晚睡眠（小時）<input type="number" inputMode="decimal" min="0" max="24" step="0.5" value={sleep} onChange={e=>setSleep(e.target.value)} /></label><p className="muted">預填上次數值；沒有紀錄時暫填 8 小時，請確認。</p>
    {hasBack&&<><h3>今天腰部感覺如何？</h3><div className="button-row">{([[0,'沒感覺（0）'],[2,'有點緊（2）'],[5,'不舒服（5）']] as const).map(([value,text])=><button key={value} className="secondary" aria-pressed={score===value} onClick={()=>setScore(value)}>{text}</button>)}</div><details><summary>改選 0–10 精確分數（目前 {score}）</summary><div className="score-row">{Array.from({length:11},(_,i)=><button key={i} aria-pressed={score===i} onClick={()=>setScore(i)}>{i}</button>)}</div></details><p className={score>=3?'error':'note'}>{explain(score===0?'BACK0':score>=3?'BACK3':'BACK1',{score,after:'開始後依級距計算'})}</p></>}
    {day==='extra'&&data&&extraWarnings(data.sessions,now,nextPush).map(rule=><p className="note" key={rule}>{explain(rule,{})}</p>)}
    <button className="primary" data-primary-priority="10" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{if(!sleep.trim())throw new Error('請確認睡眠時數。');await beginWorkout(weekId,day,Number(sleep),hasBack?score:undefined);setOpen(false);navigate('/training')}catch(e){setError(e instanceof Error&&e.name!=='ZodError'?e.message:'輸入數值不正確。')}finally{setBusy(false)}}}>{busy?'準備中…':'確認並開始'}</button><button className="secondary" disabled={busy} onClick={()=>setOpen(false)}>取消</button>{error&&<p className="error" role="alert">{error}</p>}
  </section>}</>
}
