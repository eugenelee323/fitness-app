import type { Row } from '../../db/schema'
import { currentWeek } from './workout'
import { extraAlreadyUsed, type DayType } from './extra'
export function todayTraining(program:Row<'programs'>,weeks:Row<'program_weeks'>[],sessions:Row<'workout_sessions'>[],date:string){
  const week=weeks.find(w=>w.week_no===currentWeek(program.start_date,date))
  const done=sessions.filter(s=>s.completed&&s.date<=date)
  const inWeek=done.filter(s=>s.program_week_id===week?.id)
  const last=done.filter(s=>s.day_type!=='extra').sort((a,b)=>b.date.localeCompare(a.date)||(b.started_at??'').localeCompare(a.started_at??''))[0]
  const both=inWeek.some(s=>s.day_type==='push')&&inWeek.some(s=>s.day_type==='pull')
  const day:DayType=both?'extra':last?.day_type==='push'?'pull':'push'
  return {week,day,extraUsed:week?extraAlreadyUsed(sessions,week.id,date):false}
}
export function lowerBackCheck(score:number,weight:number|null,increment:number):{action:'keep'|'reduce'|'replace';weight:number|null;ruleId:'BACK0'|'BACK1'|'BACK3'}{
  if(!Number.isInteger(score)||score<0||score>10||!Number.isFinite(increment)||increment<=0)throw new Error('腰部分數須為 0–10，器材級距須大於 0。')
  if(score===0)return {action:'keep',weight,ruleId:'BACK0'}
  if(score>=3)return {action:'replace',weight:null,ruleId:'BACK3'}
  return {action:'reduce',weight:weight==null?null:Math.round(Math.floor((weight*.9+1e-8)/increment)*increment*1000)/1000,ruleId:'BACK1'}
}
export function stepInput(raw:string,increment:number,direction:1|-1):string{
  const value=Number(raw)
  return String(Math.round(Math.max(0,(Number.isFinite(value)?value:0)+increment*direction)*1000)/1000)
}
