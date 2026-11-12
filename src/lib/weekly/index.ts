import { taipeiDate } from '../time'
import { nutritionWeek, adjustedNutrition, nutritionEffectiveDate } from '../rules/nutrition'
import { nutritionRecommendations } from '../rules/nutritionPlanning'
import { z } from 'zod'
import { db, type FitnessDB } from '../../db'
import { schemas, type Row } from '../../db/schema'
import { RULES_VERSION } from '../rules'
import { aggregateWeek, dueWeeks, type WeeklyInput } from '../rules/weekly'
import { exerciseHistory, mergeProposals, planRecommendations, safetyWeek } from '../rules/planning'
import { explain } from '../explain'
import { proposalSchema, type Proposal } from './types'
import { metricsSchema } from './report'

const jsonValue = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value)))
export async function loadWeeklyInput(database: FitnessDB = db): Promise<WeeklyInput | null> {
  const program = await database.rows('programs').where('status').equals('active').first() ?? await database.rows('programs').toCollection().first()
  if (!program) return null
  const weeks = await database.rows('program_weeks').where('program_id').equals(program.id).toArray()
  const weekIds = new Set(weeks.map(w => w.id))
  const drafts = await database.rows('workout_drafts').toArray()
  const sessions = (await database.rows('workout_sessions').toArray()).filter(s => weekIds.has(s.program_week_id ?? '') && !drafts.some(d => d.session_id === s.id))
  const ids = new Set(sessions.map(s => s.id))
  return { meals: await database.rows('meals').toArray(), mealItems: await database.rows('meal_items').toArray(), nutritionTargets: await database.rows('nutrition_targets').toArray(), bodyMetrics: await database.rows('body_metrics').toArray(), allSessions: await database.rows('workout_sessions').toArray(), program, weeks, plans: (await database.rows('planned_exercises').toArray()).filter(p => weekIds.has(p.program_week_id)), sessions, sets: (await database.rows('workout_sets').toArray()).filter(s => ids.has(s.session_id)), pains: (await database.rows('pain_reports').toArray()).filter(p => ids.has(p.session_id)), exercises: await database.rows('exercises').toArray(), alternatives: await database.rows('exercise_alternatives').toArray() }
}
export function sourceFingerprint(input: WeeklyInput): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value != null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, canonical(v)]))
    return value
  }
  const rowKey = (row: Record<string, unknown>) => String(row.id ?? `${row.exercise_id}:${row.alt_exercise_id}`)
  const stable = JSON.stringify(canonical(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((a, b) => { const x = rowKey(a); const y = rowKey(b); return x < y ? -1 : x > y ? 1 : 0 }) : value]))))
  // 用於偵測結算後的資料變動，不用作安全或身分驗證。
  let hash = 2166136261
  for (let i = 0; i < stable.length; i++) hash = Math.imul(hash ^ stable.charCodeAt(i), 16777619)
  return `${stable.length}:${hash >>> 0}`
}
export async function settleWeek(weekNo: number, recalculate = false, database: FitnessDB = db, now = new Date()) {
  return database.transaction('rw', database.tables, async () => {
    const input = await loadWeeklyInput(database)
    if (!input) throw new Error('找不到訓練計畫。')
    const week = input.weeks.find(w => w.week_no === weekNo)
    if (!week) throw new Error('找不到週次。')
    const drafts = await database.rows('workout_drafts').toArray()
    const sessions = await database.rows('workout_sessions').where('program_week_id').equals(week.id).toArray()
    if (sessions.some(s => drafts.some(d => d.session_id === s.id))) throw new Error('該週還有進行中的訓練，請先結束再結算。')
    const existing = await database.rows('weekly_analyses').where('[program_id+week_no]').equals([input.program.id, weekNo]).first()
    if (existing && !recalculate) return existing.id
    const metrics = { ...aggregateWeek(input, weekNo), nutrition: nutritionWeek(input, weekNo, taipeiDate(now)) }
    const id = existing?.id ?? crypto.randomUUID()
    if (existing?.applied_at) {
      await database.rows('weekly_analyses').put({ ...existing, metrics: jsonValue(metrics), computed_at: now.toISOString() })
      return id
    }
    const proposed = [...planRecommendations(input, metrics), ...nutritionRecommendations(metrics.nutrition, weekNo)]
    const rows = proposed.map(rec => schemas.recommendations.parse({ ...rec, id: crypto.randomUUID(), analysis_id: id, before: jsonValue(rec.before), after: jsonValue(rec.after), original_after: jsonValue(rec.after), original_reason: rec.reason, status: 'pending' }))
    if (existing) await database.rows('recommendations').where('analysis_id').equals(id).delete()
    await database.rows('weekly_analyses').put(schemas.weekly_analyses.parse({ id, program_id: input.program.id, week_no: weekNo, rules_version: RULES_VERSION, metrics: jsonValue(metrics), source_fingerprint: sourceFingerprint(input), computed_at: now.toISOString() }))
    if (rows.length) await database.rows('recommendations').bulkAdd(rows)
    return id
  })
}
export async function autoSettle(database: FitnessDB = db, now = new Date()) {
  const input = await loadWeeklyInput(database)
  if (!input) return []
  const existing = await database.rows('weekly_analyses').where('program_id').equals(input.program.id).toArray()
  const drafts = await database.rows('workout_drafts').toArray()
  const allSessions = await database.rows('workout_sessions').toArray()
  const blocked = new Set(allSessions.filter(s => drafts.some(d => d.session_id === s.id)).map(s => s.program_week_id))
  const ids: string[] = []
  for (const no of dueWeeks(now.getTime(), existing.map(a => a.week_no))) {
    if (!blocked.has(input.weeks.find(w => w.week_no === no)?.id)) ids.push(await settleWeek(no, false, database, now))
  }
  return ids
}
export interface EditRecommendation { rows?: { id: string; value: number }[]; deload?: boolean; kcal?: number }
export async function decideRecommendation(id: string, status: 'accepted' | 'rejected' | 'modified', edit?: EditRecommendation, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const rec = await database.rows('recommendations').get(id)
    const analysis = rec && await database.rows('weekly_analyses').get(rec.analysis_id)
    if (!rec || !analysis) throw new Error('找不到建議。')
    if (analysis.rules_version !== RULES_VERSION) throw new Error('計算規則已更新，請重新結算後再處理建議。')
    if (analysis.applied_at) throw new Error('此週課表已產生，不能再次更改決定。')
    const input = await loadWeeklyInput(database)
    if (!input || sourceFingerprint(input) !== analysis.source_fingerprint) throw new Error('結算後資料已變動，請重新結算後再處理建議。')
    const original = rec.original_after ? { after: proposalSchema.parse(rec.original_after), reason: rec.original_reason ?? rec.reason } : planRecommendations(input, aggregateWeek(input, analysis.week_no)).find(r => r.target_type === rec.target_type && r.target_ref === rec.target_ref && r.rule_id === rec.rule_id)
    if (!original) throw new Error('建議已失效，請重新結算。')
    let after = proposalSchema.parse(original.after)
    let reason = original.reason
    if (status === 'modified') {
      if (after.editable === 'kcal') {
        const target = input.nutritionTargets?.find(t => t.id === after.nutrition?.based_on_id)
        if (!target || edit?.kcal == null || !after.nutrition) throw new Error('請填寫目標熱量。')
        const goal = adjustedNutrition(target, edit.kcal)
        after = { ...after, nutrition: { ...after.nutrition, ...goal } }
        reason += ' ' + explain('USER_EDIT', { name: '每日營養', field: '熱量（kcal）', before: target.kcal, after: goal.kcal }) + ' ' + explain('N-target', { before: target.kcal, after: goal.kcal, protein: goal.protein_g, fat: goal.fat_g, carbs: goal.carbs_g })
      } else if (after.editable === 'deload') {
        if (edit?.deload !== true || !after.postpone_allowed) throw new Error('只能將可延後的減量改為照原定時間執行；不得延後超過 2 週。')
        const forced = planRecommendations(input, aggregateWeek(input, analysis.week_no), true).find(r => r.target_type === 'program')!
        after = forced.after; reason = forced.reason
      } else {
        if (!['weight', 'sets'].includes(after.editable) || !edit?.rows?.length) throw new Error('此建議不提供數值修改，可接受或拒絕。')
        const field = after.editable === 'weight' ? 'target_weight_kg' : 'sets'
        const seen = new Set<string>()
        for (const change of edit.rows) {
          const row = after.rows.find(p => p.id === change.id)
          if (!row || seen.has(row.id)) throw new Error('修改的課表動作不正確。')
          seen.add(row.id)
          const before = row[field]
          Object.assign(row, { [field]: change.value, ...(field === 'sets' ? { base_sets: change.value } : {}) })
          reason += ` ${explain('USER_EDIT', { name: input.exercises.find(e => e.id === input.plans.find(p => p.id === row.id)?.exercise_id)?.name_zh ?? '動作', field: field === 'sets' ? '組數' : '目標重量（kg）', before, after: change.value })}`
        }
        after = proposalSchema.parse(after)
      }
    }
    await database.rows('recommendations').put(schemas.recommendations.parse({ ...rec, status, after: jsonValue(after), reason, decided_at: new Date().toISOString() }))
  })
}
export async function acceptPendingRecommendations(analysisId: string, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const pending = await database.rows('recommendations').where('analysis_id').equals(analysisId).filter(rec => rec.status === 'pending').toArray()
    for (const rec of pending) await decideRecommendation(rec.id, 'accepted', undefined, database)
  })
}
export async function applyRecommendations(id: string, database: FitnessDB = db, now = new Date()) {
  await database.transaction('rw', database.tables, async () => {
    const analysis = await database.rows('weekly_analyses').get(id)
    if (!analysis) throw new Error('找不到每週分析。')
    if (analysis.applied_at) return
    if (analysis.rules_version !== RULES_VERSION) throw new Error('計算規則已更新，請重新結算後再套用。')
    const metrics = metricsSchema.parse(analysis.metrics)

    const recs = await database.rows('recommendations').where('analysis_id').equals(id).toArray()
    if ((!metrics.sessionCount || analysis.week_no === 12) && !recs.some(r => r.target_type === 'nutrition')) throw new Error('沒有可套用的下週課表。')
    if (recs.some(r => r.status === 'pending')) throw new Error('請先逐條接受、拒絕或修改全部建議。')
    const input = await loadWeeklyInput(database)
    if (!input || sourceFingerprint(input) !== analysis.source_fingerprint) throw new Error('結算後資料已變動，請重新結算再產生課表。')
    const accepted = recs.filter(r => r.status === 'accepted' || r.status === 'modified')
    const proposals = accepted.map(r => proposalSchema.parse(r.after))
    if (proposals.filter(p => p.nutrition).length > 1) throw new Error('同一週只能調整一次營養目標。')
    const merged = mergeProposals(input, proposals)
    const rowIds = new Set(proposals.flatMap(p => p.rows.map(r => r.id)))
    const weekIds = new Set(proposals.flatMap(p => p.weeks.map(w => w.id)))
    for (const row of merged.rows.filter(r => rowIds.has(r.id))) weekIds.add(row.program_week_id)
    if ((await database.rows('workout_sessions').toArray()).some(s => weekIds.has(s.program_week_id ?? ''))) throw new Error('目標週已有訓練紀錄或進行中訓練，為保留紀錄，不再改動該週課表。')
    for (const week of merged.weeks.filter(w => weekIds.has(w.id))) {
      if (week.week_no <= analysis.week_no) throw new Error('只能產生未來週次的課表。')
      if (week.is_deload && week.deload_origin_week != null && (week.week_no - week.deload_origin_week > 2 || week.week_no < week.deload_origin_week)) throw new Error('減量最多延後 2 週。')
      safetyWeek(merged.rows.filter(p => p.program_week_id === week.id), input.exercises)
    }
    // 最終組合再驗證一次，只改重量或組數；減量僅改組數與 RIR。
    const history = exerciseHistory(input, analysis.week_no)
    for (const row of merged.rows.filter(r => rowIds.has(r.id))) {
      schemas.planned_exercises.parse(row)
      const before = history[row.exercise_id]
      const actual = before?.lastSets.find(s => s.side !== 'left')?.weight_kg
      const baselineSets = before?.lastPlan?.base_sets ?? before?.lastPlan?.sets
      if (!accepted.some(r => r.rule_id === 'D-restore') && !row.is_paused && actual != null && baselineSets != null && row.target_weight_kg != null && row.target_weight_kg !== actual && row.sets !== baselineSets) throw new Error('一次只能改重量或組數，請拒絕其中一項調整或修改後重試。')
    }
    const at = now.toISOString()
    // 先寫審核軌跡，再更新課表，同一交易失敗時會全部回復。
    for (const rec of accepted) {
      const proposal = proposalSchema.parse(rec.after)
      if (proposal.nutrition) {
        const goal = proposal.nutrition
        const before = input.nutritionTargets?.find(t => t.id === goal.based_on_id)
        if (!before) throw new Error('營養目標已失效，請重新結算。')
        const values = adjustedNutrition(before, goal.kcal)
        const after = schemas.nutrition_targets.parse({ ...before, ...values, id: crypto.randomUUID(), effective_from: nutritionEffectiveDate(goal.effective_from, taipeiDate(now)), created_at: at, source_analysis_id: id, reason: rec.reason })
        await database.rows('nutrition_targets').add(after)
        await database.rows('plan_changes').add({ id: crypto.randomUUID(), recommendation_id: rec.id, change: jsonValue({ before, after, rule_id: rec.rule_id }), applied_at: at })
      }
      for (const patch of proposal.rows) {
        const before = input.plans.find(p => p.id === patch.id)!
        const after = merged.rows.find(p => p.id === patch.id)!
        const keys = Object.keys(patch).filter(key => key !== 'id' && JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]) && JSON.stringify(after[key as keyof typeof after]) === JSON.stringify(patch[key as keyof typeof patch]))
        if (keys.length) await database.rows('plan_changes').add({ id: crypto.randomUUID(), recommendation_id: rec.id, planned_exercise_id: patch.id, change: jsonValue({ before: Object.fromEntries(keys.map(key => [key, before[key as keyof typeof before] ?? null])), after: Object.fromEntries(keys.map(key => [key, after[key as keyof typeof after]])), rule_id: rec.rule_id }), applied_at: at })
      }
      for (const patch of proposal.weeks) {
        const before = input.weeks.find(w => w.id === patch.id)!
        const after = merged.weeks.find(w => w.id === patch.id)!
        if (JSON.stringify(before) !== JSON.stringify(after)) await database.rows('plan_changes').add({ id: crypto.randomUUID(), recommendation_id: rec.id, change: jsonValue({ before, after, rule_id: rec.rule_id }), applied_at: at })
      }
    }
    for (const row of merged.rows.filter(r => rowIds.has(r.id))) await database.rows('planned_exercises').put(row)
    for (const week of merged.weeks.filter(w => weekIds.has(w.id))) await database.rows('program_weeks').put(week)
    await database.rows('weekly_analyses').put({ ...analysis, applied_at: at })
    await database.rows('app_meta').put({ key: 'backup_requested_at', value: at })
  })
}
export async function weeklyData(database: FitnessDB = db) {
  return database.transaction('r', database.tables, async () => ({ analyses: await database.rows('weekly_analyses').toArray(), recommendations: await database.rows('recommendations').toArray() }))
}
export type Analysis = Row<'weekly_analyses'>
export type StoredRecommendation = Row<'recommendations'>
export type { Proposal }
