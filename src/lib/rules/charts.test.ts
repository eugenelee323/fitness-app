import { describe, expect, it } from 'vitest'
import { bodySummary, nutritionWeek, weekDates, calendarDate } from './nutrition'
import { bodyTrends, trainingTrends, nutritionTrends, dayVolumeChanges } from './charts'
import { logWeek, weeklyFixture, fixtureId } from '../../test/weeklyFixture'
import { nutritionFixture, target } from '../../test/nutritionFixture'
import { aggregateWeek } from './weekly'
import type { Row } from '../../db/schema'
const weights=(gain:number):Row<'body_metrics'>[]=>[1,2,3].flatMap(no=>weekDates(no).map(date=>({id:fixtureId(),date,weight_kg:60+(no-1)*gain})))
describe('7 日平均與共用週變化',()=>{
  it.each([[.15,'target'],[.25,'target'],[.1,'below'],[.3,'above']] as const)('每週 %s kg 的目標範圍邊界', (gain,status)=>{
    const result=bodySummary(weights(gain),'2026-11-29')
    expect(result.status).toBe(status);expect(result.change).toBe(gain);expect(result.weeklyGains).toEqual([gain,gain]);expect(result.count).toBe(7)
  })
  it('不足四筆不計算；缺其中一週不假設為零，腰圍比較四週前最後一筆',()=>{
    expect(bodySummary([], '2026-11-29')).toMatchObject({status:'unknown',change:null,count:0,waistChange4w:null})
    const data=weights(.2)
    expect(bodySummary(data.slice(-3),'2026-11-29').weightAverages[2]).toBeNull()
    expect(bodySummary(data.slice(-4),'2026-11-29').weightAverages[2]).toBeCloseTo(60.4)
    expect(bodySummary(data.slice(7),'2026-11-29').weeklyGains).toEqual([.2])
    data.push({id:fixtureId(),date:'2026-11-29',waist_cm:82},{id:fixtureId(),date:'2026-11-28',waist_cm:81},{id:fixtureId(),date:'2026-11-01',waist_cm:79},{id:fixtureId(),date:'2026-10-31',waist_cm:78})
    expect(bodySummary(data,'2026-11-29').waistChange4w).toBe(3)
    const input={...nutritionFixture(),bodyMetrics:data}
    const report=nutritionWeek(input,3,'2026-11-29')
    expect(report.weightAverages).toEqual(bodySummary(data,'2026-11-29').weightAverages)
    expect(report.weeklyGains).toEqual([.2,.2]);expect(report.delta).toBe(-150)
  })
  it('進行中週也比較連續不重疊的 7 日視窗，忽略未到日期',()=>{
    const data=weights(.2); const end='2026-11-25'
    const summary=bodySummary(data,end)
    expect(nutritionWeek({...nutritionFixture(),bodyMetrics:data},3,end).weeklyGains).toEqual(summary.weeklyGains)
    expect(bodyTrends(data,end,7)).toHaveLength(7)
    expect(bodyTrends(data,end,7).at(-1)?.average).toEqual(summary.weightAverages[2])
    expect(bodyTrends([],end)[0]).toMatchObject({weight:null,average:null,waist:null})
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
