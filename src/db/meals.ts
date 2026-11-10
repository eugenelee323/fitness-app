import { z } from 'zod'
import { db, type FitnessDB } from './index'
import { mealValueSchema, mealType, type Row } from './schema'
export const mealInputSchema = z.object({ date: z.iso.date(), meal_type: mealType, items: z.array(mealValueSchema).min(1), entry_source: z.enum(['manual', 'paste', 'favorite']) })
export type MealInput = z.infer<typeof mealInputSchema>
export async function mealData(database: FitnessDB = db) {
  return database.transaction('r', database.tables, async () => ({ meals: await database.rows('meals').toArray(), mealItems: await database.rows('meal_items').toArray(), nutritionTargets: await database.rows('nutrition_targets').toArray(), allSessions: await database.rows('workout_sessions').toArray(), favorites: await database.rows('favorite_meals').toArray() }))
}
export async function saveMeal(raw: MealInput, existing?: Row<'meals'>, database: FitnessDB = db) {
  const input = mealInputSchema.parse(raw)
  return database.transaction('rw', database.tables, async () => {
    const old = existing && await database.rows('meals').get(existing.id)
    if (existing && (!old || old.updated_at !== existing.updated_at)) throw new Error('這餐已被修改或刪除，請重新開啟。')
    const id = old?.id ?? crypto.randomUUID()
    const source = old?.entry_source === 'paste' ? 'paste' : input.entry_source
    await database.rows('meals').put({ ...old, id, date: input.date, meal_type: input.meal_type, entry_source: source, confirmed: true, photo_path: null, ai_raw: null, updated_at: new Date().toISOString() })
    await database.rows('meal_items').where('meal_id').equals(id).delete()
    await database.rows('meal_items').bulkAdd(input.items.map(item => ({ ...item, id: crypto.randomUUID(), meal_id: id, is_estimate: source === 'paste' || item.is_estimate })))
    return id
  })
}
export async function deleteMeal(id: string, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => { await database.rows('meal_items').where('meal_id').equals(id).delete(); await database.rows('meals').delete(id) })
}
export async function saveFavorite(id: string, name: string, database: FitnessDB = db) {
  return database.transaction('rw', database.tables, async () => {
    const meal = await database.rows('meals').get(id)
    if (!meal) throw new Error('找不到餐點。')
    const items = await database.rows('meal_items').where('meal_id').equals(id).toArray()
    const favorite = { id: crypto.randomUUID(), name: name.trim(), meal_type: meal.meal_type, items: items.map(({ name, grams, kcal, protein_g, carbs_g, fat_g, is_estimate }) => ({ name, grams, kcal, protein_g, carbs_g, fat_g, is_estimate })), created_at: new Date().toISOString() }
    await database.rows('favorite_meals').add(favorite)
    return favorite.id
  })
}
export async function addFavorite(id: string, date: string, database: FitnessDB = db) {
  const favorite = await database.rows('favorite_meals').get(id)
  if (!favorite) throw new Error('找不到常用餐點。')
  return saveMeal({ date, meal_type: favorite.meal_type, items: favorite.items, entry_source: 'favorite' }, undefined, database)
}
