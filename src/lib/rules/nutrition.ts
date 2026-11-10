import type { Row } from '../../db/schema'
import { dailyStatus, weeklyKcalDelta } from './index'
import { explain } from '../explain'

export interface Nutrients { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
export const nutrientLabels: Record<keyof Nutrients, string> = { kcal: '熱量', protein_g: '蛋白質', carbs_g: '碳水', fat_g: '脂肪' }
export const NUTRIENT_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const
export interface NutritionInput {
  meals?: Row<'meals'>[]; mealItems?: Row<'meal_items'>[]; nutritionTargets?: Row<'nutrition_targets'>[]
  bodyMetrics?: Row<'body_metrics'>[]; sessions?: Row<'workout_sessions'>[]; allSessions?: Row<'workout_sessions'>[]
}
export interface NutritionDay {
  date: string; total: Nutrients; target: Row<'nutrition_targets'> | null
  status: ReturnType<typeof dailyStatus> | 'unknown'; recorded: number; expected: number; completeness: number
  proteinRemaining: number | null; kcalLow: number | null; kcalHigh: number | null
}
export interface NutritionWeek {
  days: NutritionDay[]; recorded: number; expected: number; completeness: number
  loggedDays: number; metDays: number; partialDays: number; avgProtein: number | null
  weightAverages: (number | null)[]; weeklyGains: number[]; waistChange4w: number | null
  weeksSinceLastAdjust: number; target: Row<'nutrition_targets'> | null; delta: number; ruleId: string; notices: string[]
}
export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce((total, item) => ({ kcal: total.kcal + item.kcal, protein_g: total.protein_g + item.protein_g, carbs_g: total.carbs_g + item.carbs_g, fat_g: total.fat_g + item.fat_g }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
}
export function scaleNutrients(item: Nutrients & { grams: number }, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(item.grams) || item.grams <= 0) throw new Error('份量必須大於 0。')
  const ratio = grams / item.grams
  return Object.fromEntries(NUTRIENT_KEYS.map(key => [key, Math.round(item[key] * ratio * 100) / 100])) as unknown as Nutrients
}
export function targetForDate(targets: Row<'nutrition_targets'>[], date: string) {
  return targets.filter(t => t.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id))[0] ?? null
}
export function nutritionDay(input: NutritionInput, date: string): NutritionDay {
  const meals = (input.meals ?? []).filter(meal => meal.date === date)
  const items = (input.mealItems ?? []).filter(item => meals.some(meal => meal.id === item.meal_id))
  const recorded = new Set(meals.filter(meal => items.some(item => item.meal_id === meal.id)).map(meal => meal.meal_type)).size
  const expected = (input.allSessions ?? input.sessions ?? []).some(s => s.date === date) ? 4 : 3
  const total = sumNutrients(items)
  const target = targetForDate(input.nutritionTargets ?? [], date)
  return { date, total, target, status: target ? dailyStatus({ kcal: target.kcal, proteinMin: target.protein_g }, { kcal: total.kcal, protein: total.protein_g }) : 'unknown', recorded, expected, completeness: Math.min(recorded / expected, 1), proteinRemaining: target ? Math.max(0, target.protein_g - total.protein_g) : null, kcalLow: target ? target.kcal * .9 : null, kcalHigh: target ? target.kcal * 1.1 : null }
}
export function proteinReminder(now: number, selectedDate: string, remaining: number | null): boolean {
  const local = new Date(now + 8 * 3600000)
  return selectedDate === local.toISOString().slice(0, 10) && local.getUTCHours() >= 21 && remaining != null && remaining >= 30
}
export function calendarDate(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
}
export function weekDates(weekNo: number): string[] {
  return Array.from({ length: 7 }, (_, i) => calendarDate('2026-11-09', (weekNo - 1) * 7 + i))
}
export function weightAverage(metrics: Row<'body_metrics'>[], end: string): number | null {
  const start = calendarDate(end, -6)
  const values = metrics.filter(m => m.date >= start && m.date <= end && m.weight_kg != null).map(m => m.weight_kg!)
  return values.length >= 4 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
export function adjustedNutrition(target: Row<'nutrition_targets'>, kcal: number) {
  if (!Number.isInteger(kcal) || kcal <= 0 || Math.abs(kcal - target.kcal) > 150) throw new Error('熱量一次只能調整最多 150 kcal。')
  const available = target.carbs_g + (kcal - target.kcal) / 4
  if (available < 0 || kcal < target.protein_g * 4 + target.fat_g * 9) throw new Error('目標熱量不足以保留原蛋白質與脂肪，請先檢查營養目標。')
  return { kcal, protein_g: target.protein_g, carbs_g: Math.round(available), fat_g: target.fat_g }
}
export function nutritionEffectiveDate(proposed: string, today: string): string { return proposed < today ? today : proposed }
export function nutritionWeek(input: NutritionInput, weekNo: number, today: string): NutritionWeek {
  const dates = weekDates(weekNo)
  const days = dates.filter(date => date <= today).map(date => nutritionDay(input, date))
  const recorded = days.reduce((total, day) => total + day.recorded, 0)
  const expected = days.reduce((total, day) => total + day.expected, 0)
  const logged = days.filter(day => day.recorded > 0)
  const avgProtein = logged.length ? logged.reduce((sum, day) => sum + day.total.protein_g, 0) / logged.length : null
  const end = dates[6] < today ? dates[6] : today
  const target = targetForDate(input.nutritionTargets ?? [], end)
  const body = input.bodyMetrics ?? []
  const weightAverages = [weekNo - 2, weekNo - 1, weekNo].map(no => weightAverage(body, no === weekNo ? end : weekDates(no)[6]))
  const gains: number[] = []
  if (weightAverages[2] != null && weightAverages[1] != null) {
    if (weightAverages[0] != null) gains.push(weightAverages[1] - weightAverages[0])
    gains.push(weightAverages[2] - weightAverages[1])
  }
  const currentWaist = body.filter(m => m.date >= dates[0] && m.date <= end && m.waist_cm != null).sort((a, b) => b.date.localeCompare(a.date))[0]?.waist_cm
  const oldDates = weekDates(weekNo - 4)
  const oldWaist = body.filter(m => m.date >= oldDates[0] && m.date <= oldDates[6] && m.waist_cm != null).sort((a, b) => b.date.localeCompare(a.date))[0]?.waist_cm
  const waistChange4w = currentWaist != null && oldWaist != null ? currentWaist - oldWaist : null
  const history = (input.nutritionTargets ?? []).filter(t => t.effective_from <= end).sort((a, b) => a.effective_from.localeCompare(b.effective_from) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const adjustments = history.filter((t, index) => index > 0 && t.kcal !== history[index - 1].kcal)
  const lastAdjust = adjustments.at(-1)
  const weeksSinceLastAdjust = lastAdjust ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${lastAdjust.effective_from}T00:00:00Z`)) / (7 * 86400000) : 99
  const completeness = expected ? Math.min(recorded / expected, 1) : 0
  const decision = weeklyKcalDelta({ logCompleteness: completeness, weeklyGains: gains, waistChange4w: waistChange4w ?? 0, weeksSinceLastAdjust })
  const notices: string[] = []
  let delta = decision.delta
  let ruleId = decision.ruleId
  if (decision.ruleId === 'N1') notices.push(explain('N1', { completion: completeness * 100 }))
  if (decision.ruleId === 'N5') notices.push(explain('N5', { weeks: weeksSinceLastAdjust }))
  if (avgProtein != null && avgProtein < 130) { delta = 0; if (decision.ruleId !== 'N1' && decision.ruleId !== 'N5') ruleId = 'N4'; notices.push(explain('N4', { protein: avgProtein })) }
  if (!target) { delta = 0; notices.push(explain('N-no-target', {})) }
  else if (delta) {
    try { adjustedNutrition(target, target.kcal + delta) } catch { delta = 0; ruleId = 'N6'; notices.push(explain('N6', {})) }
  }
  if (target && (input.nutritionTargets ?? []).some(t => t.effective_from > end && t.kcal !== target.kcal)) { delta = 0; ruleId = 'N5'; notices.push(explain('N-future', {})) }
  if (!gains.length && waistChange4w == null) notices.push(explain('N-no-weight', {}))
  return { days, recorded, expected, completeness, loggedDays: logged.length, metDays: logged.filter(d => d.status === 'met').length, partialDays: logged.filter(d => d.status === 'partial').length, avgProtein, weightAverages, weeklyGains: gains, waistChange4w, weeksSinceLastAdjust, target, delta, ruleId, notices }
}
