import type { Row } from '../../db/schema'
import { calendarDate, calendarWeekStart } from './nutrition'
export const dayLabels={push:'推日',pull:'拉日',extra:'補量日'} as const
export type DayType=keyof typeof dayLabels
export const extraMenu=[
  {code:'incline_press_db',sets:3,min:8,max:12,rest:90},
  {code:'row_cable',sets:3,min:10,max:12,rest:90},
  {code:'lateral_mc',sets:4,min:12,max:15,rest:60},
  {code:'curl_cable',sets:3,min:10,max:12,rest:60},
  {code:'pushdown_rope',sets:3,min:10,max:12,rest:60},
  {code:'face_pull',sets:2,min:12,max:15,rest:60},
] as const
export function extraPlans(weekId:string, exercises:Row<'exercises'>[], ids:string[]):Row<'planned_exercises'>[] {
  return extraMenu.map((item,i)=>{
    const ex=exercises.find(ex=>ex.code===item.code)
    if(!ex||!ids[i])throw new Error('補量日動作或識別碼不完整。')
    return {id:ids[i],program_week_id:weekId,day_type:'extra',order_no:i+1,exercise_id:ex.id,sets:item.sets,base_sets:item.sets,rep_min:item.min,rep_max:item.max,target_rir:2,base_rir:2,rest_sec:item.rest,target_weight_kg:null}
  })
}
export function extraAlreadyUsed(sessions:Row<'workout_sessions'>[],weekId:string,date:string):boolean {
  const start=calendarWeekStart(date),end=calendarDate(start,6)
  return sessions.some(s=>s.day_type==='extra'&&(s.program_week_id===weekId||s.date>=start&&s.date<=end))
}
/** 日期缺開始時間時，保守以該日任一時間可能不足 48 小時提醒。 */
export function extraWarnings(sessions:Row<'workout_sessions'>[],now:number,nextPush?:string):('EX-pull'|'EX-push')[] {
  const date=new Date(now+8*3600000).toISOString().slice(0,10)
  const nearPull=sessions.some(s=>s.day_type==='pull'&&(s.started_at?Math.abs(Date.parse(s.started_at)-now)<48*3600000:Math.abs(Date.parse(s.date+'T00:00:00+08:00')-Date.parse(date+'T00:00:00+08:00'))<3*86400000))
  const beforePush=nextPush===calendarDate(date,1)||sessions.some(s=>s.day_type==='push'&&s.date===calendarDate(date,1))
  return [...(nearPull?['EX-pull' as const]:[]),...(beforePush?['EX-push' as const]:[])]
}
