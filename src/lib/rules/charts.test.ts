import { describe, expect, it } from 'vitest'
import { bodySummary, nutritionWeek, weekDates, calendarDate } from './nutrition'
import { bodyTrends, trainingTrends, nutritionTrends, dayVolumeChanges } from './charts'
import { logWeek, weeklyFixture, fixtureId } from '../../test/weeklyFixture'
import { nutritionFixture, target } from '../../test/nutritionFixture'
import { aggregateWeek } from './weekly'
import type { Row } from '../../db/schema'
const weights=(gain:number):Row<'body_metrics'>[]=>[1,2,3].flatMap(no=>weekDates(no).map(date=>({id:fixtureId(),date,weight_kg:60+(no-1)*gain})))
describe('每週量測與共用週變化',()=>{
  it.each([[.15,'target'],[.25,'target'],[.1,'below'],[.3,'above']] as const)('每週 %s kg 的目標邊界',(gain,status)=>{const result=bodySummary(weights(gain),'2026-11-29');expect(result.status).toBe(status);expect(result.change).toBe(gain);expect(result.weeklyGains).toEqual([gain,gain])})
  it('一週一筆即可；同週只取最後一筆、缺週不跨週補值',()=>{
    const data:Row<'body_metrics'>[]=[{id:fixtureId(),date:'2026-11-15',weight_kg:60},{id:fixtureId(),date:'2026-11-22',weight_kg:60.05},{id:fixtureId(),date:'2026-11-23',weight_kg:80},{id:fixtureId(),date:'2026-11-29',weight_kg:60.1,waist_cm:82},{id:fixtureId(),date:'2026-11-01',weight_kg:59,waist_cm:80}]
    const summary=bodySummary(data,'2026-11-29');expect(summary.weeklyWeights).toEqual([60,60.05,60.1]);expect(summary.weeklyGains).toEqual([.05,.05]);expect(summary.waistChange4w).toBe(2)
    expect(nutritionWeek({...nutritionFixture(),bodyMetrics:data},3,'2026-11-29').delta).toBe(-150)
    const onlyWeekly=data.filter(m=>m.date!=='2026-11-23').map(m=>({...m,waist_cm:null}))
    expect(nutritionWeek({...nutritionFixture(),bodyMetrics:onlyWeekly},3,'2026-11-29').delta).toBe(150)
    onlyWeekly.find(m=>m.date==='2026-11-29')!.weight_kg=60.5
    expect(nutritionWeek({...nutritionFixture(),bodyMetrics:onlyWeekly},3,'2026-11-29').delta).toBe(-150)
    expect(bodySummary(data.filter(m=>m.date!=='2026-11-22'),'2026-11-29').weeklyGains).toEqual([])
    expect(bodySummary([],'2026-11-29')).toMatchObject({change:null,status:'unknown',waistChange4w:null})
    expect(bodyTrends(data,'2026-11-29').at(-1)).toMatchObject({date:'2026-11-23',recordedAt:'2026-11-29',weight:60.1,waist:82})
    expect(bodyTrends([],'2026-11-29')[0]).toMatchObject({weight:null,waist:null,recordedAt:null})
    expect(bodyTrends(data,'2026-11-25',7)).toHaveLength(7)
    expect(bodyTrends(data,'2026-11-25').at(-1)?.weight).toBe(80)
    expect(bodySummary(data,'2026-11-25').weeklyWeights[1]).toBe(60.05)
  })
})

describe('圖表與訓練、飲食原始紀錄一致',()=>{
  it('推、拉與合計容量、e1RM、有效組數一致；空週為 null',()=>{
    const input=weeklyFixture();logWeek(input,1,{only:['bench_bb'],weight:20,reps:8,day:'push'});logWeek(input,1,{only:['pullup'],weight:0,reps:8,day:'pull'});logWeek(input,2,{only:['bench_bb'],weight:25,reps:8,day:'push'})
    const rows=dayVolumeChanges(trainingTrends(input));expect(rows).toHaveLength(12)
    expect(rows[0].push).toBe(640);expect(rows[0].pull).toBe(1920);expect(rows[0].total).toBe(2560)
    expect(rows[1].pushChange).toBe(.25);expect(rows[1].pullChange).toBeNull();expect(rows[0].pushChange).toBeNull()
    expect(rows[1].change).toBe((800-2560)/2560)
    const report=aggregateWeek(input,1);expect(rows[0].muscles).toEqual(report.muscles);expect(rows[0].exercises).toEqual(report.exercises)
    expect(rows[0].exercises.find(e=>e.exercise.code==='bench_bb')?.best).toBeCloseTo(20*(1+10/30))
    expect(rows[2]).toMatchObject({hasData:false,total:null,push:null,pull:null,change:null})
    input.sessions.push({...input.sessions[0],id:fixtureId()});expect(trainingTrends(input)[0].total).toBe(2560)
  })
  it('同週多次容量加總，徒手缺體重標示不足；單手左右容量只加各自實績',()=>{
    const input=weeklyFixture();logWeek(input,1,{only:['lateral_cable'],weight:10,reps:10,day:'push'})
    const first=trainingTrends(input)[0];expect(first.total).toBe(input.sets.length*100)
    logWeek(input,1,{only:['lateral_cable'],weight:10,reps:10,day:'push'});expect(trainingTrends(input)[0].push).toBe(first.total!*2)
    logWeek(input,1,{only:['pullup'],weight:0,reps:8,day:'pull'});input.sessions.find(s=>s.day_type==='pull')!.bodyweight_kg=null
    expect(trainingTrends(input)[0]).toMatchObject({total:null,pull:null})
  })
  it('最近四週採各日生效目標，分開標示未記錄、達標與未達標',()=>{
    const input=nutritionFixture();const end='2026-11-29';const rows=nutritionTrends(input,end)
    expect(rows).toHaveLength(28);expect(rows[0].date).toBe(calendarDate(end,-27));expect(rows[0].kcalPercent).toBeNull()
    expect(rows.at(-1)).toMatchObject({kcalPercent:96,proteinPercent:100,kcalMet:true,proteinMet:true,status:'met'})
    input.nutritionTargets!.push({...target(),effective_from:end,kcal:3000,protein_g:200})
    expect(nutritionTrends(input,end).at(-1)).toMatchObject({kcalPercent:80,proteinPercent:75,kcalMet:false,proteinMet:false,status:'missed'})
    expect(nutritionTrends({...input,nutritionTargets:[]},end).at(-1)?.kcalPercent).toBeNull()
    expect(nutritionTrends({...input,nutritionTargets:[{...target(),kcal:0,protein_g:0}]},end).at(-1)?.kcalPercent).toBeNull()
    expect(nutritionTrends({},end).at(-1)?.proteinMet).toBeNull()
  })
})
