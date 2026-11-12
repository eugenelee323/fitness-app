import { db,type FitnessDB } from './index'
import { schemas } from './schema'
import { startWorkout } from './workouts'
import { lowerBackCheck } from '../lib/rules/flow'
import { entryTarget } from '../lib/rules/workout'
import { explain } from '../lib/explain'
import { taipeiDate } from '../lib/time'
export async function applyBackScore(id:string,score:number,database:FitnessDB=db,phase:'pre'|'during'='during'){
  return database.transaction('rw',database.tables,async()=>{
    const draft=await database.rows('workout_drafts').get(id);if(!draft)throw new Error('找不到進行中訓練。')
    const exercises=await database.rows('exercises').toArray();const leg=exercises.find(e=>e.code==='leg_curl_lying');if(!leg)throw new Error('動作庫缺少俯臥腿彎舉。')
    const date=(await database.rows('workout_sessions').get(draft.session_id))?.date??taipeiDate()
    const sessions=(await database.rows('workout_sessions').toArray()).filter(s=>s.id!==id&&s.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||(b.started_at??'').localeCompare(a.started_at??''))
    const previous=(await database.rows('workout_sets').where('exercise_id').equals(leg.id).toArray()).sort((a,b)=>sessions.findIndex(s=>s.id===a.session_id)-sessions.findIndex(s=>s.id===b.session_id)||b.set_no-a.set_no).find(s=>sessions.some(session=>session.id===s.session_id))
    const before=structuredClone(draft.items)
    // 保留所有已完成組，僅重建尚未完成的部分。
    draft.items=draft.items.flatMap(item=>{
      const ex=exercises.find(e=>e.id===(item.back_original?.exercise_id??item.exercise_id))!
      if(!ex.loads_lower_back||item.entries.every(e=>e.done)||score===0&&!item.back_original)return [item]
      const pending=item.entries.filter(e=>!e.done),done=item.entries.filter(e=>e.done)
      const original=item.back_original??{exercise_id:ex.id,target_weight_kg:item.target_weight_kg,entries:structuredClone(pending)}
      const originalWeight=original.target_weight_kg??(original.entries[0]?.weight.trim()?Number(original.entries[0].weight):null)
      const decision=lowerBackCheck(score,originalWeight,ex.increment_kg)
      const replace=decision.action==='replace'
      const entries=pending.map(entry=>{
        const base=original.entries.find(e=>e.id===entry.id)??entry
        const weight=replace?entryTarget({...item,target_weight_kg:null},leg,previous).weight:decision.action==='reduce'?String(lowerBackCheck(score,base.weight.trim()?Number(base.weight):null,ex.increment_kg).weight??''):base.weight
        return {...entry,weight}
      })
      const target=replace?previous?.weight_kg??null:decision.action==='keep'?original.target_weight_kg:decision.weight
      const next={...item,id:done.length?crypto.randomUUID():item.id,exercise_id:replace?leg.id:ex.id,target_weight_kg:target,entries,back_original:original,back_reason:explain(decision.ruleId,{score,before:originalWeight,after:target})}
      return done.length?[{...item,entries:done},next]:[next]
    })
    if(JSON.stringify(before)!==JSON.stringify(draft.items))await database.rows('plan_changes').add(schemas.plan_changes.parse({id:crypto.randomUUID(),recommendation_id:null,planned_exercise_id:null,change:{scope:'session',session_id:id,ruleId:score===0?'BACK0':score>=3?'BACK3':'BACK1',score,before,after:draft.items},applied_at:new Date().toISOString()}))
    await database.rows('pain_reports').add(schemas.pain_reports.parse({id:crypto.randomUUID(),session_id:draft.session_id,body_part:'lower_back',score,phase}))
    await database.rows('workout_drafts').put(schemas.workout_drafts.parse(draft))
  })
}
export async function restoreBackItem(id:string,itemId:string,database:FitnessDB=db){
  await database.transaction('rw',database.tables,async()=>{
    const draft=await database.rows('workout_drafts').get(id),item=draft?.items.find(i=>i.id===itemId)
    if(!draft||!item?.back_original)throw new Error('沒有可還原的原動作。')
    const original=item.back_original,done=item.entries.filter(e=>e.done),pending=item.entries.filter(e=>!e.done)
    const next={...item,id:done.length?crypto.randomUUID():item.id,exercise_id:original.exercise_id,target_weight_kg:original.target_weight_kg,entries:pending.map(e=>({...e,weight:original.entries.find(o=>o.id===e.id)?.weight??e.weight})),back_reason:'已依你的選擇改回原動作。'}
    delete next.back_original
    await database.rows('plan_changes').add(schemas.plan_changes.parse({id:crypto.randomUUID(),recommendation_id:null,planned_exercise_id:null,change:{scope:'session',session_id:id,ruleId:'BACK_RESTORE',before:item,after:next},applied_at:new Date().toISOString()}))
    draft.items=draft.items.flatMap(i=>i.id!==itemId?[i]:done.length?[{...item,entries:done},next]:[next])
    await database.rows('workout_drafts').put(schemas.workout_drafts.parse(draft))
  })
}
export async function beginWorkout(week:string,day:'push'|'pull'|'extra',sleep:number,score:number|undefined,database:FitnessDB=db,date=taipeiDate()){
  if(!Number.isFinite(sleep)||sleep<0||sleep>24)throw new Error('睡眠請填 0–24 小時。')
  return database.transaction('rw',database.tables,async()=>{
    const current=await database.rows('workout_drafts').toCollection().first()
    if(current)return current.id
    const id=await startWorkout(week,day,database,date)
    const draft=(await database.rows('workout_drafts').get(id))!;draft.sleep_h=String(sleep);await database.rows('workout_drafts').put(draft)
    if(score!=null)await applyBackScore(id,score,database,'pre')
    return id
  })
}
export async function undoSet(id:string,database:FitnessDB=db,now=Date.now()){
  await database.transaction('rw',database.tables,async()=>{
    const draft=await database.rows('workout_drafts').get(id),undo=draft?.undo
    if(!draft||!undo||now>undo.expires_at)throw new Error('已超過 3 秒復原時間。')
    const entry=draft.items.flatMap(i=>i.entries).find(e=>e.id===undo.entry_id)
    if(!entry)throw new Error('找不到已完成組。')
    entry.done=false;await database.rows('workout_sets').delete(entry.id);draft.timer=undo.previous_timer;delete draft.undo;await database.rows('workout_drafts').put(draft)
  })
}
