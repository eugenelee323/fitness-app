import { expect, it } from 'vitest'
import { fixtureId, logWeek, weeklyFixture } from '../../test/weeklyFixture'
import { aggregateWeek } from './weekly'
import { planRecommendations } from './planning'

it('M3 需要兩次疲勞資料；只減有疲勞訓練的肌群，首次不減組，每動作最多一組',()=>{
  const data = weeklyFixture()
  logWeek(data,1,{weight:20})
  logWeek(data,2,{day:'push',weight:20,fatigue:9})
  logWeek(data,2,{day:'pull',weight:20,fatigue:null})
  for(const set of data.sets) set.reps = data.plans.find(p=>p.id===set.planned_exercise_id)!.rep_max-1
  const proposals = () => planRecommendations(data,aggregateWeek(data,2)).filter(r=>r.rule_id==='M3')
  expect(proposals()).toEqual([])
  data.sessions.at(-1)!.fatigue=3
  const reductions = proposals()
  expect(reductions.length).toBeGreaterThan(0)
  const chest = reductions.find(r=>r.target_ref==='chest')
  expect(chest?.after.rows.length).toBeGreaterThan(1)
  for(const rec of reductions) for(const patch of rec.after.rows) {
    const row = data.plans.find(p=>p.id===patch.id)!
    expect(row.day_type).toBe('push')
    expect(patch.sets).toBe(row.sets-1)
    expect(patch.sets).toBeGreaterThanOrEqual(2)
  }
  data.sets=data.sets.filter(s=>!data.sessions.slice(0,2).some(session=>session.id===s.session_id))
  expect(proposals()).toEqual([])
})

it('補量日實績納入分析，但較重的補量日組不作為加重依據',()=>{
  const data=weeklyFixture()
  logWeek(data,1,{day:'push',weight:20})
  const exercise = data.exercises.find(e=>e.code==='bench_bb')!
  const id=fixtureId()
  data.sessions.push({...data.sessions[0],id,day_type:'extra',date:'2026-11-14'})
  data.sets.push({id:fixtureId(),session_id:id,exercise_id:exercise.id,set_no:1,weight_kg:100,reps:8,rir:2,side:'both'})
  const metrics=aggregateWeek(data,1)
  expect(metrics.exercises.find(e=>e.exercise.id===exercise.id)?.best).toBeGreaterThan(100)
  const result=planRecommendations(data,metrics).find(r=>r.target_ref===exercise.id&&r.rule_id==='L4')
  expect(result?.after.rows[0].target_weight_kg).toBe(22.5)
})
