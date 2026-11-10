import { fixtureId } from './weeklyFixture'
import { schemas } from '../db/schema'
import { weekDates, type NutritionInput } from '../lib/rules/nutrition'
export const target = () => schemas.nutrition_targets.parse({ id: fixtureId(), effective_from: '2026-10-01', kcal: 2500, protein_g: 150, carbs_g: 300, fat_g: 70 })
export function nutritionFixture(): NutritionInput {
  const meals = weekDates(3).flatMap(date => (['breakfast', 'lunch', 'dinner'] as const).map(meal_type => schemas.meals.parse({ id: fixtureId(), date, meal_type })))
  const mealItems = meals.map(m => schemas.meal_items.parse({ id: fixtureId(), meal_id: m.id, name: '測試餐', grams: 100, kcal: 800, protein_g: 50, carbs_g: 80, fat_g: 20 }))
  const bodyMetrics = [1, 2, 3].flatMap(no => weekDates(no).map(date => schemas.body_metrics.parse({ id: fixtureId(), date, weight_kg: 60 + (no - 1) * .05, waist_cm: 80 })))
  return { meals, mealItems, nutritionTargets: [target()], bodyMetrics }
}
