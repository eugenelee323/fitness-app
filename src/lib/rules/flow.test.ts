import { describe,expect,it } from 'vitest'
import { lowerBackCheck,stepInput,todayTraining } from './flow'
import { reportNumbers } from './report'
import { weeklyFixture,logWeek,fixtureId } from '../../test/weeklyFixture'
import { nutritionFixture } from '../../test/nutritionFixture'
import { weeklyReportText } from '../weekly/text'
import { schemas } from '../../db/schema'
describe('腰部保護、步進與今日輪替',()=>{
  it.each([[0,'keep',65],[1,'reduce',57.5],[2,'reduce',57.5],[3,'replace',null],[10,'replace',null]] as const)('%s 分規則',(score,action,weight)=>{expect(lowerBackCheck(score,65,2.5)).toMatchObject({action,weight})})
  it('未知重量不憑空填數值，級距與範圍驗證',()=>{expect(lowerBackCheck(1,null,2.5).weight).toBeNull();for(const score of [-1,11,1.5])expect(()=>lowerBackCheck(score,60,2.5)).toThrow();expect(()=>lowerBackCheck(1,60,0)).toThrow();expect(stepInput('',2.5,1)).toBe('2.5');expect(stepInput('2.5',2.5,-1)).toBe('0');expect(stepInput('NaN',1,1)).toBe('1');expect(stepInput('0',1,-1)).toBe('0')})
  it('依最近已完成訓練輪替，兩者完成才補量，忽略未完成與未到日期',()=>{const x=weeklyFixture();expect(todayTraining(x.program,x.weeks,[],'2026-11-10').day).toBe('push');logWeek(x,1,{day:'push'});expect(todayTraining(x.program,x.weeks,x.sessions,'2026-11-11').day).toBe('pull');logWeek(x,1,{day:'pull'});expect(todayTraining(x.program,x.weeks,x.sessions,'2026-11-14').day).toBe('extra');expect(todayTraining(x.program,x.weeks,x.sessions,'2026-11-17').day).toBe('push');expect(todayTraining(x.program,[],[],'2026-11-10').week).toBeUndefined();x.sessions[0].completed=false;expect(todayTraining(x.program,x.weeks,x.sessions,'2026-11-11').day).toBe('push')})
})
describe('第 1 週公開推日資料純文字週報',()=>{
  it('數字、肌群、疼痛、飲食與身體資料完整，無照片或長小數',()=>{
    const x=weeklyFixture();logWeek(x,1,{day:'push',only:['bench_bb','shoulder_press_db','incline_press_mc','pushdown_cable']})
    for(const set of x.sets){const code=x.exercises.find(e=>e.id===set.exercise_id)!.code;const [kg,reps]={bench_bb:[65,8],shoulder_press_db:[16,12],incline_press_mc:[40,10],pushdown_cable:[17.5,12]}[code]!;set.weight_kg=kg;set.reps=reps}
    x.pains.push({id:fixtureId(),session_id:x.sessions[0].id,body_part:'lower_back',score:3,phase:'pre'})
    const food=nutritionFixture();x.meals=food.meals!.map(m=>({...m,date:'2026-11-10'}));x.mealItems=food.mealItems;x.nutritionTargets=food.nutritionTargets;x.bodyMetrics=[{id:fixtureId(),date:'2026-11-08',weight_kg:60,waist_cm:80},{id:fixtureId(),date:'2026-11-15',weight_kg:60.2,waist_cm:80.5}]
    const r=reportNumbers(x,1,'2026-11-15');expect(r.metrics.volume).toBe(5062);expect(r.waistChange).toBe(.5);expect(r.average?.kcal).toBe(16800)
    const text=weeklyReportText(x,1,[],'2026-11-15');expect(text.split('\n')[0]).toBe('#週報 第1週（2026-11-09～2026-11-15）A 菜單');expect(text).toContain('65×8@RIR2');expect(text).toContain('5,062');expect(text).toContain('腰部 lower_back | 3/10 | 練前');expect(text).toContain('本週腰圍 80.5 cm');expect(text).toContain('蛋白質');expect(text).not.toContain('data:image');expect(text).not.toMatch(/\d\.\d{2,}/)
  })
  it('空資料、當週未結束與建議狀態可安全複製',()=>{
    const x=weeklyFixture();expect(reportNumbers(x,1,'2026-11-08').dietCompleteness).toBe(0);expect(reportNumbers(x,1,'2026-11-11').days).toHaveLength(3);expect(reportNumbers(x,1,'2026-11-11').average).toBeNull()
    const proposal={kind:'nutrition',rows:[],weeks:[],editable:'kcal',forced:false,postpone_allowed:false,nutrition:{based_on_id:fixtureId(),effective_from:'2026-11-16',kcal:2500,protein_g:150,carbs_g:300,fat_g:70}}
    const rec=schemas.recommendations.parse({id:fixtureId(),analysis_id:fixtureId(),target_type:'nutrition',target_ref:'daily',rule_id:'N2',reason:'測試固定原因',before:proposal,after:proposal,status:'accepted'})
    expect(weeklyReportText(x,1,[rec],'2026-11-15')).toContain('N2 | 測試固定原因 | 接受')
    expect(weeklyReportText(x,1,[{...rec,before:null,after:null}],'2026-11-15')).toContain('無資料 → 無資料')
  })
})
