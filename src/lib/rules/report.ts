import type { WeeklyInput } from './weekly'
import { aggregateWeek } from './weekly'
import { summarizeWorkout, workingSetIds } from './workout'
import { weekDates,nutritionDay,sumNutrients,NUTRIENT_KEYS,type NutritionDay } from './nutrition'
export function reportNumbers(input:WeeklyInput,weekNo:number,asOf:string,savedDays?:NutritionDay[]){
  const week=input.weeks.find(w=>w.week_no===weekNo)!,dates=weekDates(weekNo),end=dates[6]<asOf?dates[6]:asOf
  const metrics=aggregateWeek(input,weekNo)
  const sessions=input.sessions.filter(s=>s.program_week_id===week.id).sort((a,b)=>a.date.localeCompare(b.date)).map(session=>({session,exercises:[...new Set(input.sets.filter(s=>s.session_id===session.id).map(s=>s.exercise_id))].map(id=>{
    const sets=input.sets.filter(s=>s.session_id===session.id&&s.exercise_id===id).sort((a,b)=>a.set_no-b.set_no||a.side.localeCompare(b.side)),exercise=input.exercises.find(e=>e.id===id)!
    const working = workingSetIds(sets,input.exercises)
    return {exercise,sets:sets.filter(s=>working.has(s.id)),warmups:sets.filter(s=>!working.has(s.id)),volume:summarizeWorkout(sets,input.exercises,session.bodyweight_kg).volume}
  })}))
  const days=savedDays??dates.filter(date=>date<=end).map(date=>nutritionDay(input,date)),logged=days.filter(d=>d.recorded)
  const totals=sumNutrients(logged.map(d=>d.total)),average=logged.length?Object.fromEntries(NUTRIENT_KEYS.map(key=>[key,totals[key]/logged.length])):null
  const recorded=days.reduce((s,d)=>s+d.recorded,0),expected=days.reduce((s,d)=>s+d.expected,0)
  return {week,dates,metrics,sessions,days,loggedDays:logged.length,average,completion:metrics.completion.ratio*100,sameMenuPercent:metrics.sameMenuChange==null?null:metrics.sameMenuChange*100,recorded,expected,dietCompleteness:expected?Math.min(recorded/expected,1)*100:0}
}
