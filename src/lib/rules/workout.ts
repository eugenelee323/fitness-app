import type { Row } from '../../db/schema'
import { effectiveLoad, e1rm, fractionalSets, setVolume, type Exercise, type LoggedSet, type Muscle } from './index'

export function exerciseRule(ex: Row<'exercises'>): Exercise {
  return { code: ex.code, primaryMuscle: ex.primary_muscle, secondaryMuscles: ex.secondary_muscles, loadType: ex.load_type, incrementKg: ex.increment_kg, isCompound: ex.is_compound, unilateral: ex.unilateral, loadsLowerBack: ex.loads_lower_back }
}
export function loggedRule(set: Row<'workout_sets'>): LoggedSet {
  return { setNo: set.set_no, weightKg: set.weight_kg, reps: set.reps, rir: set.rir ?? null, side: set.side }
}
export const muscleLabels: Record<Muscle, string> = { chest: '胸', back: '背', front_delt: '前三角', side_delt: '側三角', rear_delt: '後三角', biceps: '二頭', triceps: '三頭', quads: '股四頭', hamstrings: '腿後側', glutes: '臀' }

export function summarizeWorkout(sets: Row<'workout_sets'>[], exercises: Row<'exercises'>[], bodyweight?: number | null) {
  let volume = 0
  let missingBodyweight = false
  const muscles: Partial<Record<Muscle, number>> = {}
  const groups = new Map<string, Row<'workout_sets'>[]>()
  const best: Record<string, number> = {}
  for (const set of sets) {
    const ex = exercises.find(e => e.id === set.exercise_id)
    if (!ex) throw new Error('紀錄的動作不存在')
    const rule = exerciseRule(ex)
    const logged = loggedRule(set)
    if ((ex.load_type === 'bodyweight' || ex.load_type === 'assisted') && bodyweight == null) missingBodyweight = true
    else {
      volume += setVolume(rule, logged, bodyweight ?? 0)
      best[ex.id] = Math.max(best[ex.id] ?? 0, e1rm(effectiveLoad(rule, logged, bodyweight ?? 0), logged.reps, logged.rir ?? 0))
    }
    const key = `${set.exercise_id}:${set.planned_exercise_id ?? ''}`
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
export function weeklyCompletion(plans: Row<'planned_exercises'>[], sets: Row<'workout_sets'>[], sessions: Row<'workout_sessions'>[]) {
  const ids = new Set(sessions.map(s => s.id))
  let done = 0
  let target = 0
  for (const plan of plans) {
    if (plan.is_paused || plan.day_type==='extra'&&!sessions.some(session=>session.program_week_id===plan.program_week_id&&session.day_type==='extra'&&sets.some(set=>set.session_id===session.id))) continue
    target += plan.sets
    const rows = sets.filter(s => ids.has(s.session_id) && s.planned_exercise_id === plan.id && s.set_no <= plan.sets)
    const numbers = new Set(rows.map(s => s.set_no))
    for (const n of numbers) {
      const sides = new Set(rows.filter(s => s.set_no === n).map(s => s.side))
      done += sides.has('both') ? 1 : (sides.has('left') ? 0.5 : 0) + (sides.has('right') ? 0.5 : 0)
    }
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
