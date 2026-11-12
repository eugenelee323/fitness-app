import { describe, expect, it } from 'vitest'
import { extraPlans, extraAlreadyUsed, extraWarnings } from './extra'
import { calendarWeekStart, isMeasurementSunday } from './nutrition'
import { weeklyFixture, fixtureId } from '../../test/weeklyFixture'
import { weeklyCompletion } from './workout'
import { aggregateWeek } from './weekly'
import { trainingTrends } from './charts'
import { schemas } from '../../db/schema'
describe('補量日純函式與選填完成率',()=>{
  it('六個動作及 18 組、RIR 與休息符合規格，缺動作或 id 時拒絕',()=>{
    const input=weeklyFixture();const ids=Array.from({length:6},fixtureId);const rows=extraPlans(input.weeks[0].id,input.exercises,ids)
    expect(rows.map(r=>[input.exercises.find(e=>e.id===r.exercise_id)!.code,r.sets,r.rep_min,r.rep_max,r.target_rir,r.rest_sec])).toEqual([['incline_press_db',3,8,12,2,90],['row_cable',3,10,12,2,90],['lateral_mc',4,12,15,2,60],['curl_cable',3,10,12,2,60],['pushdown_rope',3,10,12,2,60],['face_pull',2,12,15,2,60]])
    expect(rows.every(r=>r.target_weight_kg===null&&r.day_type==='extra')).toBe(true)
    expect(()=>extraPlans(input.weeks[0].id,[],ids)).toThrow();expect(()=>extraPlans(input.weeks[0].id,input.exercises,[])).toThrow()
  })
  it('同一日曆週或同一計畫週最多一次，跨週且不同計畫可使用',()=>{
    const week=fixtureId();const session=schemas.workout_sessions.parse({id:fixtureId(),date:'2026-11-15',day_type:'extra',program_week_id:week})
    expect(extraAlreadyUsed([session],fixtureId(),'2026-11-09')).toBe(true);expect(extraAlreadyUsed([session],week,'2026-11-23')).toBe(true);expect(extraAlreadyUsed([session],fixtureId(),'2026-11-16')).toBe(false);expect(extraAlreadyUsed([{...session,day_type:'push'}],week,'2026-11-15')).toBe(false)
    expect(calendarWeekStart('2026-11-15')).toBe('2026-11-09');expect(calendarWeekStart('2026-11-16')).toBe('2026-11-16');expect(calendarWeekStart('2027-01-01')).toBe('2026-12-28');expect(isMeasurementSunday('2026-11-15')).toBe(true);expect(isMeasurementSunday('2026-11-14')).toBe(false)
  })
  it('48 小時內拉日與推日前一天提醒，邊界 48 小時不提醒',()=>{
    const now=Date.parse('2026-11-15T01:00:00Z');const row=schemas.workout_sessions.parse({id:fixtureId(),date:'2026-11-14',day_type:'pull',started_at:new Date(now-47*3600000).toISOString()})
    expect(extraWarnings([row],now,'2026-11-16')).toEqual(['EX-pull','EX-push'])
    expect(extraWarnings([{...row,started_at:new Date(now-48*3600000).toISOString()}],now)).toEqual([])
    expect(extraWarnings([{...row,started_at:undefined,date:'2026-11-13'}],now)).toEqual(['EX-pull'])
    expect(extraWarnings([{...row,started_at:undefined,date:'2026-11-12'}],now)).toEqual([])
    expect(extraWarnings([{...row,day_type:'push',date:'2026-11-16'}],now)).toEqual(['EX-push'])
    expect(extraWarnings([],now,'2026-11-17')).toEqual([])
  })
  it('未記補量日分母不增加；有記組時計 18 組並納入容量與肌群',()=>{
    const input=weeklyFixture(),week=input.weeks[0];const plans=extraPlans(week.id,input.exercises,Array.from({length:6},fixtureId));const regular=input.plans.filter(p=>p.program_week_id===week.id);input.plans.push(...plans)
    const base=weeklyCompletion(regular,[],[]);expect(weeklyCompletion([...regular,...plans],[],[]).target).toBe(base.target)
    const session=schemas.workout_sessions.parse({id:fixtureId(),date:'2026-11-15',day_type:'extra',program_week_id:week.id,bodyweight_kg:60});input.sessions.push(session)
    expect(weeklyCompletion([...regular,...plans],[],[session]).target).toBe(base.target)
    input.sets.push(schemas.workout_sets.parse({id:fixtureId(),session_id:session.id,planned_exercise_id:plans[0].id,exercise_id:plans[0].exercise_id,set_no:1,weight_kg:10,reps:10,rir:2}))
    expect(weeklyCompletion([...regular,...plans],input.sets,[session])).toMatchObject({done:1,target:base.target+18})
    const report=aggregateWeek(input,1);expect(report.volume).toBe(200);expect(report.muscles.chest.sets).toBe(1);expect(trainingTrends(input)[0].extra).toBe(200)
  })
})
