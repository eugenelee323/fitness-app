import { afterAll, afterEach, expect, it } from 'vitest'
import { FitnessDB } from './index'
import { saveBodyMetric, deleteBodyMetric } from './body'
import { fixtureId } from '../test/weeklyFixture'
import { bodySummary } from '../lib/rules/nutrition'
const database=new FitnessDB('body-'+fixtureId())
afterEach(async()=>{await database.rows('body_metrics').clear()})
it('首頁快速體重、完整編輯、同日 upsert 保留腰圍與體脂，刪除後每週最後一筆更新',async()=>{
  const id=await saveBodyMetric({date:'2026-11-10',weight_kg:60,waist_cm:80},database)
  await database.rows('body_metrics').update(id,{bodyfat_pct:20})
  await saveBodyMetric({date:'2026-11-10',weight_kg:61},database)
  expect(await database.rows('body_metrics').get(id)).toMatchObject({weight_kg:61,waist_cm:80,bodyfat_pct:20})
  const row=(await database.rows('body_metrics').get(id))!
  await saveBodyMetric({date:row.date,weight_kg:60,waist_cm:null},database,row)
  expect(await database.rows('body_metrics').count()).toBe(1)
  await expect(saveBodyMetric({date:row.date,weight_kg:62},database,row)).rejects.toThrow('已被修改')
  for(const date of ['2026-11-11','2026-11-12','2026-11-13'])await saveBodyMetric({date,weight_kg:60},database)
  expect(bodySummary(await database.rows('body_metrics').toArray(),'2026-11-13').weeklyWeights[2]).toBe(60)
  await deleteBodyMetric(id,database)
  expect(bodySummary(await database.rows('body_metrics').toArray(),'2026-11-13').weeklyWeights[2]).toBe(60)
  await expect(saveBodyMetric({date:row.date,weight_kg:62},database,row)).rejects.toThrow('已被修改')
})
it('可只記腰圍；拒絕空白、負值、無效日期及 NaN，原資料不受影響',async()=>{
  await saveBodyMetric({date:'2026-11-10',waist_cm:80},database)
  for(const input of [{date:'2026-11-11'},{date:'2026-11-11',weight_kg:0},{date:'2026-11-11',weight_kg:NaN},{date:'2026-02-30',weight_kg:60},{date:'2026-11-11',waist_cm:-1}])await expect(saveBodyMetric(input,database)).rejects.toThrow()
  expect(await database.rows('body_metrics').count()).toBe(1)
})

afterAll(async()=>{await database.delete()})
