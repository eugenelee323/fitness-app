import type { Row } from '../../db/schema'
import { classifyWorkingSets, effectiveLoad, e1rm, fractionalSets, setVolume, type Exercise, type LoggedSet, type Muscle } from './index'

export function exerciseRule(ex: Row<'exercises'>): Exercise {
  return { code: ex.code, primaryMuscle: ex.primary_muscle, secondaryMuscles: ex.secondary_muscles, loadType: ex.load_type, incrementKg: ex.increment_kg, isCompound: ex.is_compound, unilateral: ex.unilateral, loadsLowerBack: ex.loads_lower_back }
}
export function loggedRule(set: Row<'workout_sets'>): LoggedSet {
  return { setNo: set.set_no, weightKg: set.weight_kg, reps: set.reps, rir: set.rir ?? null, side: set.side }
}
export const muscleLabels: Record<Muscle, string> = { chest: '胸', back: '背', front_delt: '前三角', side_delt: '側三角', rear_delt: '後三角', biceps: '二頭', triceps: '三頭', quads: '股四頭', hamstrings: '腿後側', glutes: '臀' }

export function workingSetIds(sets: Row<'workout_sets'>[], exercises: Row<'exercises'>[]) {
  const groups = new Map<string, Row<'workout_sets'>[]>()
  for (const set of sets) {
    const key = set.session_id + ':' + set.exercise_id
    const group = groups.get(key)
    if (group) group.push(set)
    else groups.set(key, [set])
  }
  const ids = new Set<string>()
  for (const group of groups.values()) {
    const exercise = exercises.find(e => e.id === group[0].exercise_id)
    if (!exercise) throw new Error('紀錄的動作不存在')
    const indexed = group.map(set => ({ ...loggedRule(set), id: set.id }))
    for (const row of classifyWorkingSets(exerciseRule(exercise), indexed)) if (row.working) ids.add(row.set.id)
  }
  return ids
}

export function summarizeWorkout(sets: Row<'workout_sets'>[], exercises: Row<'exercises'>[], bodyweight?: number | null) {
  let volume = 0
  let missingBodyweight = false
  const muscles: Partial<Record<Muscle, number>> = {}
  const groups = new Map<string, Row<'workout_sets'>[]>()
  const best: Record<string, number> = {}
  const working = workingSetIds(sets, exercises)
  for (const set of sets) {
    if (!working.has(set.id)) continue
    const ex = exercises.find(e => e.id === set.exercise_id)
    if (!ex) throw new Error('紀錄的動作不存在')
    const rule = exerciseRule(ex)
    const logged = loggedRule(set)
    if ((ex.load_type === 'bodyweight' || ex.load_type === 'assisted') && bodyweight == null) missingBodyweight = true
    else {
      volume += setVolume(rule, logged, bodyweight ?? 0)
      best[ex.id] = Math.max(best[ex.id] ?? 0, e1rm(effectiveLoad(rule, logged, bodyweight ?? 0), logged.reps, logged.rir ?? 0))
    }
    const key = [set.session_id, set.exercise_id, set.planned_exercise_id].join(':')
    groups.set(key, [...(groups.get(key) ?? []), set])
  }
  for (const group of groups.values()) {
    const ex = exercises.find(e => e.id === group[0].exercise_id)!
    const result = fractionalSets(exerciseRule(ex), group.map(loggedRule))
    for (const muscle of Object.keys(result) as Muscle[]) muscles[muscle] = (muscles[muscle] ?? 0) + result[muscle]!
  }
  return { volume: missingBodyweight ? null : volume, muscles, best }
}

/** 單側左右各半組；同一計畫格重複訓練只計入一次，最高為 100%。 */
export function weeklyCompletion(plans: Row<'planned_exercises'>[], sets: Row<'workout_sets'>[], sessions: Row<'workout_sessions'>[], exercises: Row<'exercises'>[]) {
  const ids = new Set(sessions.map(s => s.id))
  const actual = sets.filter(s => ids.has(s.session_id))
  const working = workingSetIds(actual, exercises)
  const extraWithSets = sessions.filter(s=>s.day_type==='extra'&&sets.some(set=>set.session_id===s.id))
  const assignedExtra = new Set(plans.map(p=>p.extra_session_id).filter(Boolean))
  let done = 0
  let target = 0
  for (const plan of plans) {
    if (plan.is_paused || plan.day_type==='extra'&&!extraWithSets.some(s=>s.program_week_id===plan.program_week_id&&(plan.extra_session_id ? plan.extra_session_id===s.id : !assignedExtra.has(s.id)))) continue
    target += plan.sets
    const rows = actual.filter(s => s.planned_exercise_id === plan.id && working.has(s.id))
    let left = 0, right = 0
    for (const session of sessions) {
      const work = rows.filter(s => s.session_id === session.id)
      const count = (side: 'left' | 'right') => new Set(work.filter(s => s.side === side || s.side === 'both').map(s => s.set_no)).size
      left = Math.max(left, count('left'))
      right = Math.max(right, count('right'))
    }
    done += (Math.min(plan.sets, left) + Math.min(plan.sets, right)) / 2
  }
  return { done, target, ratio: target ? Math.min(done / target, 1) : 0 }
}

export function entryTarget(plan: Pick<Row<'planned_exercises'>, 'target_weight_kg' | 'rep_min' | 'target_rir' | 'target_reps'>, ex: Pick<Row<'exercises'>, 'load_type'>, previous?: Row<'workout_sets'>) {
  const weight = plan.target_weight_kg ?? previous?.weight_kg ?? (ex.load_type === 'bodyweight' ? 0 : null)
  return { weight: weight == null ? '' : String(weight), reps: String(plan.target_reps ?? plan.rep_min), rir: plan.target_rir }
}

export function currentWeek(startDate: string, today: string): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000
  return Math.max(1, Math.min(12, Math.floor(days / 7) + 1))
}
