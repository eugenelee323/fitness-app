import type { Suggestion } from '../weekly/types'
import { explain } from '../explain'
import { adjustedNutrition, weekDates, type NutritionWeek } from './nutrition'
export function nutritionRecommendations(report: NutritionWeek, weekNo: number): Suggestion[] {
  const target = report.target
  if (!target || !report.delta) return []
  const goal = adjustedNutrition(target, target.kcal + report.delta)
  const base = { kind: 'nutrition' as const, rows: [], weeks: [], editable: 'kcal' as const, forced: false, postpone_allowed: false }
  return [{ target_type: 'nutrition', target_ref: 'daily', rule_id: report.ruleId,
    reason: explain(report.delta > 0 ? 'N2' : 'N3', { gainBefore: report.weeklyGains.at(-2), completion: report.completeness * 100, gain: report.weeklyGains.at(-1), waist: report.waistChange4w }) + ' ' + explain('N-target', { before: target.kcal, after: goal.kcal, protein: goal.protein_g, fat: goal.fat_g, carbs: goal.carbs_g }),
    before: { ...base, nutrition: { based_on_id: target.id, effective_from: target.effective_from, kcal: target.kcal, protein_g: target.protein_g, carbs_g: target.carbs_g, fat_g: target.fat_g } },
    after: { ...base, nutrition: { based_on_id: target.id, effective_from: weekDates(weekNo + 1)[0], ...goal } } }]
}
