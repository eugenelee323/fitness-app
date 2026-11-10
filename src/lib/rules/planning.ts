import type { Row } from '../../db/schema'
import { deloadDecision, muscleSetDelta, nextLoad, type Muscle } from './index'
import { exerciseRule, loggedRule, muscleLabels } from './workout'
import { aggregateWeek, isLumbarPain, MAIN_LIFTS, relevantPain, type WeekMetrics, type WeeklyInput } from './weekly'
import { scheduledRir, scheduledSets } from './seed'
import { explain, type RuleId } from '../explain'
import type { PlanPatch, Proposal, Suggestion } from '../weekly/types'

export function estimatedSeconds(rows: Row<'planned_exercises'>[], exercises: Row<'exercises'>[]): number {
  return rows.filter(p => !p.is_paused).reduce((total, p) => total + p.sets * (p.rest_sec + p.rep_max * 4) * (exercises.find(e => e.id === p.exercise_id)?.unilateral ? 2 : 1), 0)
}
export function plannedMuscleSets(rows: Row<'planned_exercises'>[], exercises: Row<'exercises'>[], muscle: Muscle): number {
  return rows.filter(p => !p.is_paused).reduce((sum, p) => {
    const ex = exercises.find(e => e.id === p.exercise_id)!
    return sum + p.sets * (ex.primary_muscle === muscle ? 1 : ex.secondary_muscles.includes(muscle) ? 0.5 : 0)
  }, 0)
}
export function targetReps(minimum: number, maximum: number, actual: number, increase: boolean): number {
  return Math.min(maximum, Math.max(minimum, increase ? actual + 1 : minimum))
}
export function exerciseHistory(input: WeeklyInput, weekNo: number) {
  const result: Record<string, WeekMetrics['exercises'][number]> = {}
  const recorded = input.weeks.filter(w => w.week_no <= weekNo && input.sessions.some(s => s.program_week_id === w.id && input.sets.some(set => set.session_id === s.id))).sort((a, b) => a.week_no - b.week_no)
  for (const week of recorded) for (const metric of aggregateWeek(input, week.week_no).exercises) result[metric.exercise.id] = metric
  return result
}
export function latestExercise(input: WeeklyInput, weekNo: number, exId: string) {
  return exerciseHistory(input, weekNo)[exId] ?? null
}
export function safetyWeek(rows: Row<'planned_exercises'>[], exercises: Row<'exercises'>[]) {
  for (const day of ['push', 'pull'] as const) {
    const daily = rows.filter(p => p.day_type === day && !p.is_paused)
    if (daily.filter(p => exercises.find(e => e.id === p.exercise_id)?.loads_lower_back).length > 1) throw new Error('同一天最多一個壓下背動作。')
    if (estimatedSeconds(daily, exercises) > 7200) throw new Error('計畫估計超過單日 120 分鐘，請減少組數。')
    for (const m of Object.keys(muscleLabels) as Muscle[]) if (plannedMuscleSets(daily, exercises, m) > 12) throw new Error(`${muscleLabels[m]}超過單次 12 組上限。`)
  }
}
function envelope(editable: Proposal['editable'], kind: Proposal['kind'], forced = false, postpone_allowed = false): Proposal {
  return { kind, rows: [], weeks: [], editable, forced, postpone_allowed }
}
function suggestion(input: WeeklyInput, target_type: Suggestion['target_type'], target_ref: string, rule_id: RuleId, after: Proposal, context: Parameters<typeof explain>[1]): Suggestion {
  const before = { ...after, rows: after.rows.map(patch => {
    const row = input.plans.find(p => p.id === patch.id)!
    const copy: PlanPatch = { id: row.id }
    for (const key of Object.keys(patch) as (keyof PlanPatch)[]) if (key !== 'id' && row[key] !== undefined) Object.assign(copy, { [key]: row[key] })
    return copy
  }), weeks: after.weeks.map(patch => {
    const week = input.weeks.find(w => w.id === patch.id)!
    return { id: week.id, is_deload: week.is_deload, deload_origin_week: week.deload_origin_week ?? null }
  }) }
  return { target_type, target_ref, rule_id, reason: explain(rule_id, context), before, after }
}
export function planRecommendations(input: WeeklyInput, metrics: WeekMetrics, forceDeload = false): Suggestion[] {
  const source = input.weeks.find(w => w.week_no === metrics.weekNo)!
  const next = input.weeks.find(w => w.week_no === metrics.weekNo + 1)
  if (!next || !metrics.sessionCount) return []
  const rows = input.plans.filter(p => p.program_week_id === next.id).sort((a, b) => a.order_no - b.order_no)
  const knownMetrics = exerciseHistory(input, metrics.weekNo)
  const currentRows = input.plans.filter(p => p.program_week_id === source.id)
  const regular = rows.map(row => {
    const current = currentRows.find(p => p.day_type === row.day_type && p.order_no === row.order_no)
    return { ...row, sets: current?.base_sets ?? current?.sets ?? row.base_sets ?? row.sets, target_rir: current?.base_rir ?? row.base_rir ?? row.target_rir }
  })
  const previous = metrics.weekNo > 1 ? aggregateWeek(input, metrics.weekNo - 1) : null
  const main = metrics.exercises.filter(e => MAIN_LIFTS.includes(e.exercise.code))
  const origin = next.deload_origin_week ?? next.week_no
  const delayed = Math.max(0, next.week_no - origin)
  const d = deloadDecision({ mainLiftsDown2Weeks: main.filter(e => e.downWeeks >= 2).length, fatigueHigh2Weeks: metrics.avgFatigue != null && metrics.avgFatigue >= 7 && previous?.avgFatigue != null && previous.avgFatigue >= 7, avgSleep: metrics.avgSleep ?? 24, anyDown: metrics.exercises.some(e => e.status === 'down'), scheduledDeload: next.is_deload && !source.is_deload, allMainUp: main.length === 3 && main.every(e => e.status === 'up'), avgFatigue: metrics.avgFatigue ?? 10, anyPain: metrics.pains.some(p => p.score > 0 || p.sharp || p.body_part.includes('刺痛')), weeksSinceDeload: metrics.weekNo - Math.max(0, ...input.weeks.filter(w => w.week_no <= metrics.weekNo && w.is_deload).map(w => w.week_no)), postponedWeeks: delayed })
  const postpone = d.ruleId === 'D4-postpone' && next.week_no < 12 && !forceDeload
  const deload = d.deload || (d.ruleId === 'D4-postpone' && !postpone)
  const recovery = source.is_deload && !deload && !postpone
  const recommendations: Suggestion[] = []
  const weightChanged = new Set<string>()
  const safetyIds = new Set<string>()
  for (const row of rows) {
    const ex = input.exercises.find(e => e.id === row.exercise_id)!
    const known = (knownMetrics[ex.id] ?? null)
    const currentPain = metrics.pains.filter(p => relevantPain(p, ex))
    const painScore = Math.max(known?.painScore ?? 0, ...currentPain.map(p => p.score), 0)
    const lumbar = ex.loads_lower_back && (metrics.pains.some(isLumbarPain) || !!known?.lumbarPain)
    const sharp = known?.sharp || currentPain.some(p => p.sharp || p.body_part.includes('刺痛'))
    const base = regular.find(p => p.id === row.id)!
    const actualWeight = known?.lastSets.find(s => s.side !== 'left')?.weight_kg ?? row.target_weight_kg ?? null
    const beforePlan = known?.lastPlan
    const work = known?.lastSets.filter(s => s.side !== 'left') ?? []
    const minReps = work.length ? Math.min(...work.map(s => s.reps)) : base.rep_min
    const minRir = work.length ? Math.min(...work.map(s => s.rir ?? 0)) : base.target_rir
    const result = nextLoad(exerciseRule(ex), { sets: beforePlan?.sets ?? base.sets, repMin: beforePlan?.rep_min ?? base.rep_min, repMax: beforePlan?.rep_max ?? base.rep_max, targetRir: base.target_rir, targetWeightKg: actualWeight }, known?.lastSets.map(loggedRule) ?? [], sharp ? Math.max(painScore, 4) : painScore, known?.previousBelowMin ?? false)
    const context = { name: `${ex.name_zh} / ${ex.name_en}`, pain: painScore, painKind: sharp ? '刺痛' : '疼痛', sets: work.length, minReps, minRir, repMin: beforePlan?.rep_min ?? base.rep_min, repMax: beforePlan?.rep_max ?? base.rep_max, beforeWeight: actualWeight, afterWeight: result.weightKg, targetReps: targetReps(base.rep_min, base.rep_max, minReps, result.ruleId === 'L6'), belowCount: known?.previousBelowMin ? 2 : 1 }
    if (lumbar || result.action === 'stop') {
      const alt = lumbar ? input.exercises.find(e => e.code === 'leg_curl_lying') : input.exercises.find(e => input.alternatives.some(a => a.exercise_id === ex.id && a.alt_exercise_id === e.id) && !e.loads_lower_back)
      const after = envelope('none', 'load', true)
      after.rows = [alt ? { id: row.id, exercise_id: alt.id, target_weight_kg: null, is_paused: false } : { id: row.id, is_paused: true }]
      const rec = suggestion(input, 'exercise', ex.id, lumbar ? 'S1' : 'L1', after, context)
      if (known?.repeatedPain) rec.reason += ` ${explain('L1-medical', context)}`
      recommendations.push(rec); safetyIds.add(row.id); continue
    }
    if (deload || postpone || recovery) continue
    if (!known) {
      if (row.target_weight_kg == null) {
        const after = envelope('none', 'load')
        after.rows = [{ id: row.id, target_rir: 2 }]
        recommendations.push(suggestion(input, 'exercise', ex.id, 'L0', after, context))
      }
      continue
    }
    const after = envelope('weight', 'load')
    const keptSets = result.action === 'increase' || result.action === 'reduce' ? known.lastPlan?.base_sets ?? known.lastPlan?.sets ?? base.sets : base.sets
    after.rows = [{ id: row.id, target_weight_kg: result.weightKg, sets: keptSets, base_sets: keptSets, target_reps: context.targetReps, target_rir: result.ruleId === 'L5' ? 2 : base.target_rir }]
    if (result.action === 'increase' || result.action === 'reduce') weightChanged.add(row.id)
    recommendations.push(suggestion(input, 'exercise', ex.id, result.ruleId as RuleId, after, context))
  }
  if (deload || postpone || recovery) {
    const after = envelope('deload', 'program', deload && delayed >= 2, postpone)
    after.weeks = [{ id: next.id, is_deload: deload, deload_origin_week: deload ? origin : null }]
    after.rows = regular.map(base => {
      const known = (knownMetrics[base.exercise_id] ?? null)
      const current = currentRows.find(p => p.exercise_id === base.exercise_id)
      const weight = recovery ? current?.base_weight_kg ?? known?.lastSets.find(s => s.side !== 'left')?.weight_kg ?? base.target_weight_kg ?? null : known?.lastSets.find(s => s.side !== 'left')?.weight_kg ?? base.target_weight_kg ?? null
      return { id: base.id, sets: scheduledSets(base.sets, deload), target_rir: scheduledRir(base.target_rir, deload), base_sets: base.sets, base_rir: base.target_rir, base_weight_kg: weight, ...(safetyIds.has(base.id) ? {} : { target_weight_kg: weight }) }
    })
    if (postpone) {
      const deferred = input.weeks.find(w => w.week_no === next.week_no + 1)!
      after.weeks.push({ id: deferred.id, is_deload: true, deload_origin_week: origin })
      for (const row of input.plans.filter(p => p.program_week_id === deferred.id)) {
        const base = regular.find(p => p.day_type === row.day_type && p.order_no === row.order_no)
        const sets = base?.sets ?? row.base_sets ?? row.sets
        const rir = base?.target_rir ?? row.base_rir ?? row.target_rir
        after.rows.push({ id: row.id, sets: scheduledSets(sets, true), target_rir: 3, base_sets: sets, base_rir: rir })
      }
    }
    const rule = recovery ? 'D-restore' : postpone ? 'D4-postpone' : d.ruleId === 'D4-postpone' ? 'D4' : d.ruleId as RuleId
    recommendations.push(suggestion(input, 'program', next.id, rule, after, { sourceWeek: source.week_no, nextWeek: next.week_no, originWeek: origin, postponed: postpone ? delayed + 1 : delayed, deferredWeek: next.week_no + 1, fatigue: metrics.avgFatigue, sleep: metrics.avgSleep, downLifts: main.filter(e => e.downWeeks >= 2).length }))
    return recommendations
  }
  const working = regular.map(p => ({ ...p }))
  for (const muscle of Object.keys(muscleLabels) as Muscle[]) {
    const related = metrics.exercises.filter(e => e.exercise.primary_muscle === muscle)
    const muscleRows = working.filter(p => input.exercises.find(e => e.id === p.exercise_id)!.primary_muscle === muscle)
    if (!related.length || !muscleRows.length) continue
    const beforeSets = muscleRows.reduce((n, p) => n + p.sets, 0)
    const flatWeeks = Math.min(...related.map(e => e.flatWeeks))
    const state = related.some(e => e.status === 'down') ? 'down' : related.every(e => e.status === 'up') && currentRows.filter(p => input.exercises.find(e => e.id === p.exercise_id)?.primary_muscle === muscle && !p.is_paused).every(p => related.some(e => e.exercise.id === p.exercise_id && e.status === 'up')) ? 'up' : related.some(e => e.status === 'new') ? 'new' : 'flat'
    const delta = muscleSetDelta({ status: state, flatWeeks, avgFatigue: metrics.avgFatigue ?? (state === 'down' ? 0 : 6.5), completion: metrics.completion.ratio, currentSets: beforeSets, cap: beforeSets + 1, planDelta: 1 })
    if (!delta.delta) continue
    let remaining = delta.delta
    const patches: PlanPatch[] = []
    for (const row of muscleRows) {
      if (weightChanged.has(row.id) || safetyIds.has(row.id)) continue
      const count = remaining > 0 ? 1 : Math.max(remaining, 1 - row.sets)
      if (!count) continue
      const proposal = working.map(p => p.id === row.id ? { ...p, sets: p.sets + count } : p)
      try { safetyWeek(proposal, input.exercises) } catch { continue }
      row.sets += count; row.base_sets = row.sets
      patches.push({ id: row.id, sets: row.sets, base_sets: row.sets })
      remaining -= count
      if (!remaining) break
    }
    const after = envelope(patches.length ? 'sets' : 'none', 'muscle')
    after.rows = patches
    recommendations.push(suggestion(input, 'muscle', muscle, patches.length ? delta.ruleId as RuleId : 'M-defer', after, { name: muscleLabels[muscle], effectiveSets: metrics.muscles[muscle].sets, fatigue: metrics.avgFatigue, flatWeeks, beforeSets, afterSets: muscleRows.reduce((n, p) => n + p.sets, 0) }))
  }
  return recommendations
}

export function mergeProposals(input: WeeklyInput, proposals: Proposal[]): { rows: Row<'planned_exercises'>[]; weeks: Row<'program_weeks'>[] } {
  const rows = input.plans.map(p => ({ ...p }))
  const weeks = input.weeks.map(w => ({ ...w }))
  const rank = (p: Proposal) => p.kind === 'muscle' ? 1 : p.kind === 'program' ? 2 : 0
  for (const proposal of [...proposals].sort((a, b) => rank(a) - rank(b))) {
    for (const patch of proposal.rows) {
      const row = rows.find(p => p.id === patch.id)
      if (!row) throw new Error('建議指向不存在的課表')
      Object.assign(row, patch)
    }
    for (const patch of proposal.weeks) {
      const week = weeks.find(w => w.id === patch.id)
      if (!week) throw new Error('建議指向不存在的週次')
      Object.assign(week, patch)
    }
  }
  return { rows, weeks }
}
