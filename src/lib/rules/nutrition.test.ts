import { describe, expect, it } from 'vitest'
import type { Row } from '../../db/schema'
import { adjustedNutrition, calendarDate, nutritionDay, nutritionEffectiveDate, nutritionWeek, proteinReminder, scaleNutrients, sumNutrients, targetForDate, weekDates, weightAverage, type NutritionInput } from './nutrition'

// 僅使用合成資料；固定 UUID 方便比對。
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const target = (over: Partial<Row<'nutrition_targets'>> = {}): Row<'nutrition_targets'> => ({ id: uid(900), created_at: '2026-11-01T00:00:00Z', source_analysis_id: null, effective_from: '2026-11-01', bmr_kcal: 1753, tdee_kcal: 2400, kcal: 2500, protein_g: 145, carbs_g: 325, fat_g: 70, reason: null, ...over })
let seq = 1
function day(date: string, protein = 40, kcal = 625, types: Row<'meals'>['meal_type'][] = ['breakfast', 'lunch', 'dinner', 'snack']) {
  const meals: Row<'meals'>[] = []
  const items: Row<'meal_items'>[] = []
  for (const meal_type of types) {
    const meal = { id: uid(seq++), date, meal_type, photo_path: null, ai_raw: null, confirmed: true }
    meals.push(meal)
    items.push({ id: uid(seq++), meal_id: meal.id, food_id: null, name: '測試餐', grams: 300, kcal, protein_g: protein, carbs_g: 80, fat_g: 20, is_estimate: true, kcal_low: null, kcal_high: null })
  }
  return { meals, items }
}
function weekLog(weekNo: number, protein = 40): Pick<NutritionInput, 'meals' | 'mealItems'> {
  const parts = weekDates(weekNo).map(date => day(date, protein))
  return { meals: parts.flatMap(p => p.meals), mealItems: parts.flatMap(p => p.items) }
}
function weights(perWeek: number[], waist: Record<string, number> = {}): Row<'body_metrics'>[] {
  return perWeek.flatMap((kg, index) => weekDates(index + 1).map((date, i) => ({ id: uid(5000 + index * 10 + i), date, weight_kg: kg, waist_cm: waist[date] ?? null, bodyfat_pct: null })))
}

describe('飲食純函式', () => {
  it('加總營養素，並依公克數等比例重算', () => {
    expect(sumNutrients([{ kcal: 100, protein_g: 10, carbs_g: 5, fat_g: 2 }, { kcal: 50, protein_g: 1.5, carbs_g: 0, fat_g: 1 }])).toEqual({ kcal: 150, protein_g: 11.5, carbs_g: 5, fat_g: 3 })
    expect(scaleNutrients({ grams: 550, kcal: 820, protein_g: 38, carbs_g: 95, fat_g: 30 }, 275)).toEqual({ kcal: 410, protein_g: 19, carbs_g: 47.5, fat_g: 15 })
    expect(scaleNutrients({ grams: 3, kcal: 10, protein_g: 1, carbs_g: 1, fat_g: 1 }, 1)).toEqual({ kcal: 3.33, protein_g: 0.33, carbs_g: 0.33, fat_g: 0.33 })
  })
  it.each([[0, 100], [-5, 100], [Number.NaN, 100], [100, 0], [100, Number.NaN]])('份量 %s（原 %s g）無效時拒絕', (grams, original) => {
    expect(() => scaleNutrients({ grams: original, kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }, grams)).toThrow('份量必須大於 0')
  })
  it('依生效日、建立時間及 id 選擇營養目標', () => {
    const a = target({ id: uid(1), effective_from: '2026-11-01', created_at: undefined })
    const b = target({ id: uid(2), effective_from: '2026-11-01', created_at: '2026-11-02T00:00:00Z' })
    const c = target({ id: uid(3), effective_from: '2026-11-20' })
    const d = target({ id: uid(4), effective_from: '2026-11-01', created_at: undefined })
    expect(targetForDate([a, b, c], '2026-11-10')?.id).toBe(uid(2))
    expect(targetForDate([a, d], '2026-11-10')?.id).toBe(uid(4))
    expect(targetForDate([c], '2026-11-10')).toBeNull()
  })
  it('計算單日合計、達標與紀錄完整率', () => {
    const { meals, items } = day('2026-11-10', 40, 625)
    const empty = { id: uid(800), date: '2026-11-10', meal_type: 'snack' as const, photo_path: null, ai_raw: null, confirmed: true }
    const session = { id: uid(801), program_week_id: null, day_type: 'push' as const, date: '2026-11-10', bodyweight_kg: null, fatigue: null, sleep_h: null, completed: true, notes: null }
    const result = nutritionDay({ meals: [...meals, empty], mealItems: items, nutritionTargets: [target()], sessions: [session] }, '2026-11-10')
    expect(result.total).toEqual({ kcal: 2500, protein_g: 160, carbs_g: 320, fat_g: 80 })
    expect(result).toMatchObject({ status: 'met', recorded: 4, expected: 4, completeness: 1, proteinRemaining: 0, kcalLow: 2250, kcalHigh: 2750 })
    const rest = nutritionDay({ meals, mealItems: items.slice(0, 2), nutritionTargets: [target()], allSessions: [] }, '2026-11-10')
    expect(rest).toMatchObject({ recorded: 2, expected: 3, status: 'missed', proteinRemaining: 65 })
    expect(rest.completeness).toBeCloseTo(2 / 3)
    expect(nutritionDay({}, '2026-11-10')).toMatchObject({ status: 'unknown', recorded: 0, expected: 3, proteinRemaining: null, kcalLow: null, kcalHigh: null })
  })
  it('晚上 9 點後蛋白質還差 30 g 以上才提醒', () => {
    const at = (iso: string) => Date.parse(iso)
    expect(proteinReminder(at('2026-11-10T13:00:00Z'), '2026-11-10', 30)).toBe(true)
    expect(proteinReminder(at('2026-11-10T12:59:00Z'), '2026-11-10', 80)).toBe(false)
    expect(proteinReminder(at('2026-11-10T13:00:00Z'), '2026-11-09', 80)).toBe(false)
    expect(proteinReminder(at('2026-11-10T13:00:00Z'), '2026-11-10', 29.9)).toBe(false)
    expect(proteinReminder(at('2026-11-10T13:00:00Z'), '2026-11-10', null)).toBe(false)
  })
  it('日期、週次與 7 日平均體重', () => {
    expect(calendarDate('2026-11-30', 1)).toBe('2026-12-01')
    expect(weekDates(1)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    const metrics = weights([80])
    expect(weightAverage(metrics, '2026-11-15')).toBe(80)
    expect(weightAverage(metrics.slice(0, 3), '2026-11-15')).toBeNull()
    expect(weightAverage(metrics.map(m => ({ ...m, weight_kg: m.date < '2026-11-13' ? null : 81 })), '2026-11-15')).toBeNull()
  })
  it('熱量調整只改碳水，且一次最多 150 kcal', () => {
    expect(adjustedNutrition(target(), 2650)).toEqual({ kcal: 2650, protein_g: 145, carbs_g: 363, fat_g: 70 })
    expect(() => adjustedNutrition(target(), 2651.5)).toThrow('150 kcal')
    expect(() => adjustedNutrition(target(), 2700)).toThrow('150 kcal')
    expect(() => adjustedNutrition(target({ kcal: 100 }), 0)).toThrow('150 kcal')
    expect(() => adjustedNutrition(target({ kcal: 1000 }), 1150)).toThrow('蛋白質與脂肪')
    expect(nutritionEffectiveDate('2026-11-16', '2026-11-15')).toBe('2026-11-16')
    expect(nutritionEffectiveDate('2026-11-16', '2026-11-18')).toBe('2026-11-18')
  })
})

describe('每週熱量建議', () => {
  const today = '2026-11-29'
  it('沒有目標與紀錄時不調整並提示原因', () => {
    const result = nutritionWeek({}, 1, '2026-11-11')
    expect(result.days).toHaveLength(3)
    expect(result).toMatchObject({ delta: 0, ruleId: 'N1', recorded: 0, avgProtein: null, target: null })
    expect(result.notices.join()).toContain('低於 70%')
    expect(result.notices.join()).toContain('尚無當日生效')
    expect(result.notices.join()).toContain('體重資料不足')
  })
  it('連續 2 週增重 < 0.1 kg 時建議 +150 kcal', () => {
    const result = nutritionWeek({ ...weekLog(3), nutritionTargets: [target()], bodyMetrics: weights([80, 80.05, 80.1]) }, 3, today)
    expect(result).toMatchObject({ delta: 150, ruleId: 'N2', completeness: 1, loggedDays: 7, metDays: 7, partialDays: 0, avgProtein: 160 })
    expect(result.weeklyGains.map(g => Math.round(g * 100) / 100)).toEqual([0.05, 0.05])
  })
  it('增重過快或腰圍 4 週 +2 cm 時建議 −150 kcal', () => {
    const fast = nutritionWeek({ ...weekLog(3), nutritionTargets: [target()], bodyMetrics: weights([80, 80.1, 80.5]) }, 3, today)
    expect(fast).toMatchObject({ delta: -150, ruleId: 'N3' })
    const waist = nutritionWeek({ ...weekLog(5), nutritionTargets: [target()], bodyMetrics: weights([80, 80, 80, 80.1, 80.2], { '2026-11-15': 84, '2026-12-13': 86 }) }, 5, '2026-12-14')
    expect(waist).toMatchObject({ delta: -150, ruleId: 'N3', waistChange4w: 2 })
  })
  it('只有兩週體重時以單週增重判定，維持熱量', () => {
    const result = nutritionWeek({ ...weekLog(2), nutritionTargets: [target()], bodyMetrics: weights([80, 80.2]) }, 2, '2026-11-22')
    expect(result.weeklyGains).toHaveLength(1)
    expect(result).toMatchObject({ delta: 0, ruleId: 'N0' })
  })
  it('蛋白質週平均 < 130 g 只提醒，不改熱量', () => {
    const result = nutritionWeek({ ...weekLog(3, 30), nutritionTargets: [target()], bodyMetrics: weights([80, 80.05, 80.1]) }, 3, today)
    expect(result).toMatchObject({ delta: 0, ruleId: 'N4', avgProtein: 120, metDays: 0, partialDays: 7 })
    expect(result.notices.join()).toContain('蛋白質週平均 120 g')
    const low = weekLog(3, 30)
    const incomplete = nutritionWeek({ meals: low.meals?.slice(0, 4), mealItems: low.mealItems, nutritionTargets: [target()] }, 3, today)
    expect(incomplete.avgProtein).toBe(120)
    expect(incomplete.ruleId).toBe('N1')
  })
  it('上次調整未滿 2 週時維持觀察', () => {
    const recent = [target(), target({ id: uid(901), effective_from: '2026-11-23', kcal: 2650, carbs_g: 363, created_at: undefined }), target({ id: uid(902), effective_from: '2026-11-23', kcal: 2650, carbs_g: 363 })]
    const result = nutritionWeek({ ...weekLog(3), nutritionTargets: recent, bodyMetrics: weights([80, 80.05, 80.1]) }, 3, today)
    expect(result).toMatchObject({ delta: 0, ruleId: 'N5', weeksSinceLastAdjust: 6 / 7 })
    expect(result.notices.join()).toContain('未滿 2 週')
  })
  it('調整後無法保留蛋白質與脂肪時不調整', () => {
    const result = nutritionWeek({ ...weekLog(3, 40), nutritionTargets: [target({ kcal: 1000, protein_g: 145, fat_g: 70 })], bodyMetrics: weights([80, 80.05, 80.1]) }, 3, today)
    expect(result).toMatchObject({ delta: 0, ruleId: 'N6' })
    expect(result.notices.join()).toContain('不足以保留')
  })
})
