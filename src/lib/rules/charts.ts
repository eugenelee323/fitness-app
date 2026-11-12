import type { Row } from '../../db/schema'
import { aggregateWeek, volumeChange, type WeeklyInput } from './weekly'
import { summarizeWorkout } from './workout'
import { weeklyMeasurement, calendarWeekStart, calendarDate, nutritionDay, type NutritionInput } from './nutrition'
/** 所有圖表讀實際紀錄；未結束草稿由資料層排除，空週保持 null。 */
export function trainingTrends(input: WeeklyInput) {
  return [...input.weeks].sort((a,b)=>a.week_no-b.week_no).map(week => {
    const metrics = aggregateWeek(input, week.week_no)
    const sessions = input.sessions.filter(s => s.program_week_id === week.id && input.sets.some(set=>set.session_id === s.id))
    const dayVolume = (day: 'push' | 'pull' | 'extra') => {
      const values = sessions.filter(s => s.day_type === day).map(s => summarizeWorkout(input.sets.filter(set=>set.session_id===s.id), input.exercises, s.bodyweight_kg).volume)
      return !values.length || values.some(v=>v==null) ? null : values.reduce<number>((sum,v)=>sum+v!,0)
    }
    return { weekNo: week.week_no, label: `第 ${week.week_no} 週`, hasData: sessions.length>0, push: dayVolume('push'), pull: dayVolume('pull'), extra: dayVolume('extra'), total: sessions.length ? metrics.volume : null, change: sessions.length ? metrics.previousWeekChange : null, muscles: metrics.muscles, exercises: metrics.exercises }
  })
}
export function bodyTrends(metrics: Row<'body_metrics'>[], end: string, weeks = 4) {
  const start=calendarWeekStart(end)
  return Array.from({length:weeks},(_,i)=>calendarDate(start,(i-weeks+1)*7)).map(weekStart=>{
    const until=weekStart===start?end:calendarDate(weekStart,6)
    const row=weeklyMeasurement(metrics,until)
    return {date:weekStart,label:weekStart.slice(5),recordedAt:row?.date ?? null,weight:row?.weight_kg ?? null,waist:row?.waist_cm ?? null}
  })
}
export function nutritionTrends(input: NutritionInput, end: string) {
  return Array.from({length:28},(_,i)=>nutritionDay(input,calendarDate(end,i-27))).map(day=>({ ...day, label:day.date.slice(5), kcalPercent:day.target?.kcal && day.recorded ? day.total.kcal/day.target.kcal*100 : null, proteinPercent:day.target?.protein_g && day.recorded ? day.total.protein_g/day.target.protein_g*100 : null, kcalMet: day.target && day.recorded ? Math.abs(day.total.kcal-day.target.kcal)<=day.target.kcal*.1 : null, proteinMet:day.target && day.recorded ? day.total.protein_g>=day.target.protein_g : null }))
}
export function dayVolumeChanges(rows: ReturnType<typeof trainingTrends>) {
  return rows.map((row,i)=>({ ...row, pushChange:volumeChange(row.push,rows[i-1]?.push ?? null), pullChange:volumeChange(row.pull,rows[i-1]?.pull ?? null) }))
}
