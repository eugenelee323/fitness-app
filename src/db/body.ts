import { z } from 'zod'
import { db, type FitnessDB } from './index'
import { schemas, type Row } from './schema'
const bodyInput = schemas.body_metrics.pick({ date: true, weight_kg: true, waist_cm: true }).strict().refine(v => v.weight_kg != null || v.waist_cm != null, '請至少填體重或腰圍。')
export type BodyInput = z.infer<typeof bodyInput>
/** 同日更新保留 id 與體脂；首頁快速輸入只覆寫體重。 */
export async function saveBodyMetric(raw: BodyInput, database: FitnessDB = db, expected?: Row<'body_metrics'>) {
  const input = bodyInput.parse(raw)
  return database.transaction('rw', database.rows('body_metrics'), async () => {
    const old = await database.rows('body_metrics').where('date').equals(input.date).first()
    if (expected && JSON.stringify(old) !== JSON.stringify(expected)) throw new Error('這筆資料已被修改或刪除，請重新開啟。')
    const row = schemas.body_metrics.parse({ ...old, ...input, id: old?.id ?? crypto.randomUUID(), waist_cm: input.waist_cm === undefined ? old?.waist_cm : input.waist_cm })
    await database.rows('body_metrics').put(row)
    return row.id
  })
}
export async function deleteBodyMetric(id: string, database: FitnessDB = db) { await database.rows('body_metrics').delete(id) }
