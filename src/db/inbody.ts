import { db, type FitnessDB } from './index'
import { schemas } from './schema'
import { saveMealsBatch, type MealInput } from './meals'
import { taipeiDate } from '../lib/time'

export async function saveMeasurements(meals: MealInput[], records: unknown[], database: FitnessDB = db) {
  const rows = records.map(record => schemas.inbody_records.parse(record))
  return database.transaction('rw', database.tables, async () => {
    if (meals.length) await saveMealsBatch(meals, database)
    if (rows.length) await database.rows('inbody_records').bulkPut(rows)
  })
}

export async function saveNutritionTarget(values: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }, database: FitnessDB = db) {
  if (values.kcal <= 0) throw new Error('熱量目標須大於零。')
  const now = new Date()
  await database.rows('nutrition_targets').add(schemas.nutrition_targets.parse({
    ...values, id: crypto.randomUUID(), effective_from: taipeiDate(now), created_at: now.toISOString(), reason: '手動調整',
  }))
}

export async function clearMealRecords(expected: { meals: number; items: number }, database: FitnessDB = db) {
  return database.transaction('rw', [database.rows('meals'), database.rows('meal_items'), database.rows('app_meta'), database.rows('weekly_analyses')], async () => {
    const meals = database.rows('meals'), items = database.rows('meal_items')
    if (await meals.count() !== expected.meals || await items.count() !== expected.items) throw new Error('飲食筆數已變動，請重新確認。')
    const key = 'archived_nutrition_analyses'
    const previous = (await database.rows('app_meta').get(key))?.value
    const ids = await database.rows('weekly_analyses').toCollection().primaryKeys()
    await database.rows('app_meta').put({ key, value: [...new Set([...(Array.isArray(previous) ? previous : []), ...ids])] })
    await items.clear()
    await meals.clear()
  })
}
