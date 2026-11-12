import { saveBodyMetric } from './body'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FitnessDB, stores } from './index'
import { schemas } from './schema'
import { mealData, saveMeal, saveFavorite, addFavorite, deleteMeal, type MealInput } from './meals'
import { fixtureId, weeklyFixture } from '../test/weeklyFixture'
import { nutritionFixture } from '../test/nutritionFixture'
import { createBackup, prepareBackup, readSnapshot, restoreBackup } from '../lib/backup'
import { settleWeek, decideRecommendation, applyRecommendations } from '../lib/weekly'
let database: FitnessDB
const meal: MealInput = { date:'2026-11-10',meal_type:'lunch',entry_source:'manual',items:[{name:'合成測試餐',grams:100,kcal:500,protein_g:30,carbs_g:60,fat_g:15,is_estimate:false}] }
beforeEach(()=>{database=new FitnessDB('meals-'+fixtureId())})
afterEach(async()=>{await database.delete()})
describe('餐點儲存、常用與備份',()=>{
  it('新增編輯刪除與常用拷貝獨立，無效資料不部分寫入', async()=>{
    const id=await saveMeal(meal,undefined,database); const saved=(await database.rows('meals').get(id))!
    expect((await mealData(database)).mealItems[0].kcal).toBe(500)
    await expect(saveMeal({...meal,items:[{...meal.items[0],grams:0}]},undefined,database)).rejects.toThrow()
    expect(await database.rows('meals').count()).toBe(1)
    const favorite=await saveFavorite(id,'常用測試餐',database)
    const second=await addFavorite(favorite,'2026-11-11',database)
    await saveMeal({...meal,items:[{...meal.items[0],kcal:600}]},saved,database)
    expect((await database.rows('meal_items').where('meal_id').equals(second).first())?.kcal).toBe(500)
    expect((await database.rows('favorite_meals').get(favorite))?.items[0].kcal).toBe(500)
    await expect(saveMeal(meal,saved,database)).rejects.toThrow('已被修改')
    await deleteMeal(id,database); expect(await database.rows('meal_items').where('meal_id').equals(id).count()).toBe(0)
    await expect(saveMeal(meal,saved,database)).rejects.toThrow()
    await expect(saveFavorite(id,'已刪除',database)).rejects.toThrow()
    await expect(addFavorite(fixtureId(),meal.date,database)).rejects.toThrow()
    await expect(saveFavorite(second,' ',database)).rejects.toThrow()
  })
  it('貼上來源無法取消估算標示，匯出再匯入含常用完全一致',async()=>{
    const id=await saveMeal({...meal,entry_source:'paste'},undefined,database)
    expect((await database.rows('meal_items').toArray())[0].is_estimate).toBe(true)
    await saveMeal(meal,await database.rows('meals').get(id),database)
    expect((await database.rows('meal_items').toArray())[0].is_estimate).toBe(true)
    await saveFavorite(id,'測試常用',database)
    const backup=await createBackup(database)
    const snapshot=await readSnapshot(database)
    await deleteMeal(id,database)
    await restoreBackup(prepareBackup(backup.content),database)
    expect(await readSnapshot(database)).toEqual(snapshot)
    const old=JSON.parse(backup.content); delete old.tables.favorite_meals
    expect(prepareBackup(JSON.stringify(old)).tables.favorite_meals).toEqual([])
  })
  it('版本 4 原地升級到 5，保留舊餐點並新增常用表',async()=>{
    const name=database.name; database.close()
    const old=new Dexie(name); const {favorite_meals:ignored,exercise_photos:ignoredPhotos,...oldStores}=stores; void [ignored,ignoredPhotos]
    old.version(4).stores(oldStores); await old.table('meals').add(schemas.meals.parse({id:fixtureId(),date:meal.date,meal_type:'lunch'})); old.close()
    database=new FitnessDB(name); await database.open(); expect(database.verno).toBe(6); expect(await database.rows('meals').count()).toBe(1); expect(await database.rows('favorite_meals').count()).toBe(0)
  })
})
async function prepareNutrition() {
  const data=weeklyFixture(); const food=nutritionFixture()
  await database.rows('programs').add(data.program); await database.rows('program_weeks').bulkAdd(data.weeks)
  await database.rows('exercises').bulkAdd(data.exercises); await database.rows('planned_exercises').bulkAdd(data.plans); await database.rows('exercise_alternatives').bulkAdd(data.alternatives)
  await database.rows('meals').bulkAdd(food.meals!); await database.rows('meal_items').bulkAdd(food.mealItems!); await database.rows('body_metrics').bulkAdd(food.bodyMetrics!); await database.rows('nutrition_targets').bulkAdd(food.nutritionTargets!)
  const id=await settleWeek(3,false,database,new Date('2026-11-29T13:00:00Z')); const rec=(await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r=>r.target_type==='nutrition')!
  return {id,rec,food}
}
describe('熱量建議確認與歷史',()=>{
  it('未確認不能套用；接受只記決定；最終套用新增目標與稽核且不重複',async()=>{
    const {id,rec}=await prepareNutrition(); expect(rec.rule_id).toBe('N2')
    await expect(applyRecommendations(id,database)).rejects.toThrow('逐條')
    await decideRecommendation(rec.id,'accepted',undefined,database)
    expect(await database.rows('nutrition_targets').count()).toBe(1)
    const plans=await database.rows('planned_exercises').toArray()
    await applyRecommendations(id,database,new Date('2026-12-02T00:00:00Z'))
    const targets=await database.rows('nutrition_targets').orderBy('effective_from').toArray()
    expect(targets).toHaveLength(2); expect(targets[1]).toMatchObject({kcal:2650,protein_g:150,fat_g:70,carbs_g:338,effective_from:'2026-12-02',source_analysis_id:id})
    expect(await database.rows('plan_changes').count()).toBe(1); expect(await database.rows('planned_exercises').toArray()).toEqual(plans)
    await applyRecommendations(id,database); expect(await database.rows('nutrition_targets').count()).toBe(2)
    const backup=await createBackup(database); const snapshot=await readSnapshot(database); await restoreBackup(prepareBackup(backup.content),database); expect(await readSnapshot(database)).toEqual(snapshot)
  })
  it('拒絕不新增目標，修改 +100 保留蛋白與脂肪',async()=>{
    const {id,rec}=await prepareNutrition()
    await expect(decideRecommendation(rec.id,'modified',{kcal:2800},database)).rejects.toThrow('150')
    await decideRecommendation(rec.id,'rejected',undefined,database)
    await applyRecommendations(id,database); expect(await database.rows('nutrition_targets').count()).toBe(1)
  })
  it('修改數值、未來已排定調整不重複建議；紀錄變動需重結算',async()=>{
    const {id,rec,food}=await prepareNutrition()
    await decideRecommendation(rec.id,'modified',{kcal:2600},database)
    await applyRecommendations(id,database,new Date('2026-11-29T14:00:00Z'))
    const targets=await database.rows('nutrition_targets').orderBy('effective_from').toArray(); expect(targets[1].carbs_g).toBe(325)
    const next=await settleWeek(2,true,database,new Date('2026-11-22T13:00:00Z'))
    expect((await database.rows('recommendations').where('analysis_id').equals(next).toArray()).some(r=>r.target_type==='nutrition')).toBe(false)
    // 另一份尚未套用的報告被飲食編輯後必須重結算。
    await database.rows('weekly_analyses').update(id,{applied_at:null})
    await database.rows('meal_items').update(food.mealItems![0].id,{kcal:900})
    await expect(decideRecommendation(rec.id,'accepted',undefined,database)).rejects.toThrow('資料已變動')
  })
})

it('營養套用中途失敗時，新增目標、稽核、套用狀態全部回復', async () => {
  const {id,rec}=await prepareNutrition()
  await decideRecommendation(rec.id,'accepted',undefined,database)
  const before=await readSnapshot(database)
  const fail=()=>{throw new Error('合成交易失敗')}
  database.rows('plan_changes').hook('creating',fail)
  try { await expect(applyRecommendations(id,database)).rejects.toThrow('合成交易失敗') }
  finally { database.rows('plan_changes').hook('creating').unsubscribe(fail) }
  expect(await readSnapshot(database)).toEqual(before)
})

it('修改身體數據使舊建議失效，重新結算後用新每週體重判斷熱量', async () => {
  const {id,rec,food}=await prepareNutrition()
  for(const row of food.bodyMetrics!.filter(r=>r.date>='2026-11-23')) await saveBodyMetric({date:row.date,weight_kg:61},database)
  await expect(decideRecommendation(rec.id,'accepted',undefined,database)).rejects.toThrow('資料已變動')
  await settleWeek(3,true,database,new Date('2026-11-29T13:00:00Z'))
  const next=(await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r=>r.target_type==='nutrition')!
  expect(next.rule_id).toBe('N3')
  const report=(await database.rows('weekly_analyses').get(id))!.metrics as {nutrition:{weeklyGains:number[]}}
  expect(report.nutrition.weeklyGains).toEqual([.05,.95])
  expect(await database.rows('nutrition_targets').count()).toBe(1)
})
