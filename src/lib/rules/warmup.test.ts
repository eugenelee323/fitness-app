import { expect,it } from 'vitest'
import { classifyWorkingSets, countWorkingSets, nextLoad, type LoggedSet } from './index'
import { exerciseRule, summarizeWorkout, weeklyCompletion } from './workout'
import { logWeek, weeklyFixture, fixtureId } from '../../test/weeklyFixture'
import { aggregateWeek } from './weekly'
import { weeklyReportText } from '../weekly/text'
import { planRecommendations } from './planning'

const logged = (weights:number[], side:LoggedSet['side']='both'):LoggedSet[] =>
  weights.map((weightKg,i)=>({setNo:i+1,weightKg,reps:15,rir:2,side}))

it.each([
  ['face_pull',[9,14,18],1,18],
  ['reverse_pec_deck',[18,25],1,25],
  ['row_chest_sup_mc',[50,60,60],2,60],
  ['hammer_curl_cable',[20,27,27,27],3,27],
  ['bench_bb',[65,65,65,65],4,65],
  ['lateral_db',[6,7],2,7],
  ['pullup',[0,0,0],3,0],
] as const)('%s 依最重組與級距辨認熱身', (code,weights,count,top)=>{
  const ex = exerciseRule(weeklyFixture().exercises.find(e=>e.code===code)!)
  const sets = logged([...weights])
  const work = classifyWorkingSets(ex,sets).filter(row=>row.working).map(row=>row.set)
  expect(work).toHaveLength(count)
  if (count < weights.length) expect(nextLoad(ex,{sets:weights.length,repMin:8,repMax:15,targetRir:2,targetWeightKg:42},sets,0,false)).toEqual({action:'hold',ruleId:'L8',weightKg:top})
})

it('單手左右各用自己的最重組，次數不足的側會擋下加重',()=>{
  const ex = { ...exerciseRule(weeklyFixture().exercises[0]), unilateral:true, incrementKg:1 }
  const sets = [...logged([6,10],'left'), ...logged([5,6],'right')]
  const work = classifyWorkingSets(ex,sets).filter(row=>row.working).map(row=>row.set)
  expect(work.map(s=>s.weightKg)).toEqual([10,5,6])
  expect(countWorkingSets(ex,work)).toBe(1)
  expect(countWorkingSets(ex,logged([7,7]))).toBe(2)
  expect(nextLoad(ex,{sets:2,repMin:8,repMax:15,targetRir:2,targetWeightKg:10},sets,0,false).ruleId).toBe('L8')
})

it('容量、有效組、完成率、e1RM 與週報使用正式組；並保留熱身實績',()=>{
  const data = weeklyFixture()
  const exercise = data.exercises.find(e=>e.code==='face_pull')!
  const plan = data.plans.find(p=>p.program_week_id===data.weeks[0].id&&p.exercise_id===exercise.id)!
  logWeek(data,1,{day:plan.day_type as 'push'|'pull',only:[exercise.code]})
  const base = data.sets[0]
  data.sets = [9,14,18].map((weight_kg,i)=>({...base,id:fixtureId(),set_no:i+1,weight_kg,reps:i===0?99:15,rir:2}))
  const summary = summarizeWorkout(data.sets,data.exercises,60)
  expect(summary.volume).toBe(270)
  expect(summary.muscles.rear_delt).toBe(1)
  expect(summary.best[exercise.id]).toBeCloseTo(28.2)
  expect(weeklyCompletion([plan],data.sets,data.sessions,data.exercises).done).toBe(1)
  const metrics = aggregateWeek(data,1)
  expect(metrics).toMatchObject({ volume:270, completion:{done:1} })
  expect(planRecommendations(data,metrics).find(r=>r.target_ref===exercise.id)).toMatchObject({rule_id:'L8',reason:expect.stringMatching(/正式組只有 1 組，下次 3 組都用 18 kg/)})
  const output = weeklyReportText(data,1,[],'2026-11-15')
  expect(output).toContain('正式組 18×15@RIR2 | 熱身 2 組')
  expect(output).toContain('熱身（自動判定）：9×99@RIR2、14×15@RIR2')
  expect(output).toContain('容量（正式組） 270 kg')
})
