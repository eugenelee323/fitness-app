import type { NutritionInput, NutritionWeek } from './nutrition'
import type { Row } from '../../db/schema'
import { e1rm, effectiveLoad, fractionalSets, progressStatus, setVolume, type Muscle } from './index'
import { exerciseRule, loggedRule, muscleLabels, weeklyCompletion } from './workout'

export const PROGRAM_START = '2026-11-09'
export const MAIN_LIFTS = ['bench_bb', 'pullup', 'leg_press']
export type Progress = ReturnType<typeof progressStatus>
export interface WeeklyInput extends NutritionInput {
  program: Row<'programs'>
  weeks: Row<'program_weeks'>[]
  plans: Row<'planned_exercises'>[]
  sessions: Row<'workout_sessions'>[]
  sets: Row<'workout_sets'>[]
  pains: Row<'pain_reports'>[]
  exercises: Row<'exercises'>[]
  alternatives: Row<'exercise_alternatives'>[]
}
export interface ExerciseMetric {
  exercise: Row<'exercises'>
  best: number | null
  previousBest: number | null
  status: Progress
  flatWeeks: number
  flatOccurrences: number
  downWeeks: number
  stalled: boolean
  lastSets: Row<'workout_sets'>[]
  lastPlan: Row<'planned_exercises'> | null
  previousBelowMin: boolean
  painScore: number
  sharp: boolean
  repeatedPain: boolean
  lumbarPain: boolean
}
export interface WeekMetrics {
  nutrition?: NutritionWeek
  weekNo: number
  menu: 'A' | 'B'
  isDeload: boolean
  sessionCount: number
  completion: { done: number; target: number; ratio: number }
  volume: number | null
  muscles: Record<Muscle, { sets: number; volume: number | null }>
  previousWeekVolume: number | null
  previousWeekChange: number | null
  previousSameMenuWeek: number | null
  sameMenuVolume: number | null
  sameMenuChange: number | null
  exercises: ExerciseMetric[]
  avgFatigue: number | null
  avgSleep: number | null
  pains: (Row<'pain_reports'> & { date: string })[]
  warnings: string[]
}
export function settlementDeadline(weekNo: number): number {
  return Date.parse(`${PROGRAM_START}T00:00:00+08:00`) + weekNo * 7 * 86400000 - 3 * 3600000
}
export function dueWeeks(now: number, settled: number[]): number[] {
  return Array.from({ length: 12 }, (_, i) => i + 1).filter(n => now >= settlementDeadline(n) && !settled.includes(n))
}
export function average(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null)
  return valid.length ? valid.reduce((sum, n) => sum + n, 0) / valid.length : null
}
export function volumeChange(current: number | null, previous: number | null): number | null {
  return current == null || previous == null || previous === 0 ? null : (current - previous) / previous
}
export function relevantPain(pain: Row<'pain_reports'>, ex: Row<'exercises'>): boolean {
  if (pain.exercise_id) return pain.exercise_id === ex.id
  const part = pain.body_part.toLowerCase()
  const groups: [RegExp, Muscle[]][] = [
    [/腰|下背|lower_back/, ['hamstrings', 'glutes']], [/胸|chest/, ['chest']],
    [/肩|三角|shoulder/, ['front_delt', 'side_delt', 'rear_delt']], [/肘|elbow/, ['biceps', 'triceps']],
    [/膝|大腿前|knee/, ['quads']], [/腿後|hamstring/, ['hamstrings']], [/臀|glute/, ['glutes']],
    [/背|back/, ['back']], [/二頭|biceps/, ['biceps']], [/三頭|triceps/, ['triceps']],
  ]
  const match = groups.find(([pattern]) => pattern.test(part))
  if (/腰|下背|lower_back/.test(part)) return ex.loads_lower_back
  return !match || [ex.primary_muscle, ...ex.secondary_muscles].some(m => match[1].includes(m))
}
export function isLumbarPain(pain: Row<'pain_reports'>): boolean {
  return pain.score >= 1 && /腰|下背|lower_back/i.test(pain.body_part)
}

function basicWeek(input: WeeklyInput, weekNo: number) {
  const week = input.weeks.find(w => w.week_no === weekNo)
  if (!week) throw new Error('找不到分析週次')
  const sessions = input.sessions.filter(s => s.program_week_id === week.id)
  const sessionIds = new Set(sessions.map(s => s.id))
  const plans = input.plans.filter(p => p.program_week_id === week.id && !p.is_paused)
  const sets = input.sets.filter(s => sessionIds.has(s.session_id)).map(s => ({ ...s, planned_exercise_id: s.planned_exercise_id ?? plans.find(p => p.exercise_id === s.exercise_id && p.day_type === sessions.find(session => session.id === s.session_id)?.day_type)?.id ?? null }))
  const muscles = Object.fromEntries(Object.keys(muscleLabels).map(m => [m, { sets: 0, volume: 0 }])) as WeekMetrics['muscles']
  const best: Record<string, number> = {}
  const missingBest = new Set<string>()
  let volume: number | null = 0
  const warnings: string[] = []
  for (const session of sessions) {
    const logged = sets.filter(s => s.session_id === session.id)
    for (const set of logged) {
      const ex = input.exercises.find(e => e.id === set.exercise_id)
      if (!ex) throw new Error('實際紀錄的動作不存在')
      const model = exerciseRule(ex)
      const data = loggedRule(set)
      if (['bodyweight', 'assisted'].includes(ex.load_type) && session.bodyweight_kg == null) {
        volume = null; muscles[ex.primary_muscle].volume = null; missingBest.add(ex.id); delete best[ex.id]
        if (!warnings.includes('部分徒手／輔助紀錄缺少體重，容量與 e1RM 不完整。')) warnings.push('部分徒手／輔助紀錄缺少體重，容量與 e1RM 不完整。')
      } else {
        const value = setVolume(model, data, session.bodyweight_kg ?? 0)
        if (volume != null) volume += value
        if (muscles[ex.primary_muscle].volume != null) muscles[ex.primary_muscle].volume! += value
        if (!missingBest.has(ex.id)) best[ex.id] = Math.max(best[ex.id] ?? 0, e1rm(effectiveLoad(model, data, session.bodyweight_kg ?? 0), data.reps, data.rir ?? 0))
      }
    }
    const groups = new Map<string, Row<'workout_sets'>[]>()
    for (const set of logged) {
      const key = `${set.exercise_id}:${set.planned_exercise_id ?? ''}`
      groups.set(key, [...(groups.get(key) ?? []), set])
    }
    for (const group of groups.values()) {
      const ex = input.exercises.find(e => e.id === group[0].exercise_id)!
      const effective = fractionalSets(exerciseRule(ex), group.map(loggedRule))
      for (const key of Object.keys(effective) as Muscle[]) muscles[key].sets += effective[key]!
    }
  }
  return { week, sessions, sets, best, muscles, volume, warnings, completion: weeklyCompletion(plans, sets, sessions) }
}

export function aggregateWeek(input: WeeklyInput, weekNo: number): WeekMetrics {
  const history = input.weeks.filter(w => w.week_no <= weekNo).sort((a, b) => a.week_no - b.week_no).map(w => basicWeek(input, w.week_no))
  const current = history.find(w => w.week.week_no === weekNo)!
  const past = history.filter(w => w.week.week_no < weekNo)
  const previous = past.find(w => w.week.week_no === weekNo - 1)
  const sameMenu = [...past].reverse().find(w => w.week.menu === current.week.menu && w.sets.length > 0)
  const sessionIds = new Set(current.sessions.map(s => s.id))
  const pains = input.pains.filter(p => sessionIds.has(p.session_id)).map(p => ({ ...p, date: current.sessions.find(s => s.id === p.session_id)!.date }))
  const exerciseIds = [...new Set(current.sets.map(s => s.exercise_id))]
  const exercises: ExerciseMetric[] = exerciseIds.map(id => {
    const exercise = input.exercises.find(e => e.id === id)!
    const previousResult = [...past].reverse().find(w => w.best[id] != null)
    const status = current.best[id] == null ? 'new' : progressStatus(current.best[id], previousResult?.best[id] ?? null)
    const appearances = history.filter(w => w.best[id] != null)
    let flatWeeks = 0
    let downWeeks = 0
    for (let i = appearances.length - 1; i > 0; i--) {
      const state = progressStatus(appearances[i].best[id], appearances[i - 1].best[id])
      if (state !== 'flat' && state !== 'down') break
      flatWeeks++
    }
    for (let i = appearances.length - 1; i > 0; i--) {
      if (appearances[i].week.week_no !== weekNo - downWeeks || appearances[i - 1].week.week_no !== appearances[i].week.week_no - 1 || progressStatus(appearances[i].best[id], appearances[i - 1].best[id]) !== 'down') break
      downWeeks++
    }
    const sessions = input.sessions.filter(s => input.weeks.some(w => w.id === s.program_week_id && w.week_no <= weekNo) && input.sets.some(set => set.session_id === s.id && set.exercise_id === id)).sort((a, b) => b.date.localeCompare(a.date) || (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    const observations = sessions.map(session => {
      if (['bodyweight', 'assisted'].includes(exercise.load_type) && session.bodyweight_kg == null) return null
      const sets = input.sets.filter(s => s.session_id === session.id && s.exercise_id === id)
      return Math.max(...sets.map(s => e1rm(effectiveLoad(exerciseRule(exercise), loggedRule(s), session.bodyweight_kg ?? 0), s.reps, s.rir ?? 0)))
    }).filter((v): v is number => v != null)
    let flatOccurrences = 0
    for (let i = 0; i + 1 < observations.length; i++) {
      const state = progressStatus(observations[i], observations[i + 1])
      if (state === 'up') break
      flatOccurrences++
    }
    const lastSets = current.sets.filter(s => s.session_id === sessions[0]?.id && s.exercise_id === id)
    const lastPlan = input.plans.find(p => p.id === lastSets[0]?.planned_exercise_id) ?? input.plans.find(p => p.program_week_id === current.week.id && p.exercise_id === id) ?? null
    const previousSets = input.sets.filter(s => s.session_id === sessions[1]?.id && s.exercise_id === id && s.side !== 'left')
    const previousPlan = input.plans.find(p => p.id === previousSets[0]?.planned_exercise_id) ?? lastPlan
    const relevant = pains.filter(p => relevantPain(p, exercise))
    const recentPain = sessions.slice(0, 2).map(s => input.pains.some(p => p.session_id === s.id && relevantPain(p, exercise) && (p.score >= 4 || p.sharp || p.body_part.includes('刺痛'))))
    return { exercise, best: current.best[id] ?? null, previousBest: previousResult?.best[id] ?? null, status, flatWeeks, flatOccurrences, downWeeks, stalled: current.best[id] != null && flatOccurrences >= 2, lastSets, lastPlan, previousBelowMin: previousSets.length > 0 && previousPlan != null && previousSets.some(s => s.reps < previousPlan.rep_min), painScore: Math.max(0, ...relevant.map(p => p.score)), sharp: relevant.some(p => p.sharp || p.body_part.includes('刺痛')), repeatedPain: recentPain.length === 2 && recentPain.every(Boolean), lumbarPain: exercise.loads_lower_back && pains.some(isLumbarPain) }
  })
  return {
    weekNo, menu: current.week.menu, isDeload: current.week.is_deload,
    sessionCount: current.sessions.filter(s => current.sets.some(set => set.session_id === s.id)).length,
    completion: current.completion, volume: current.volume, muscles: current.muscles,
    previousWeekVolume: previous?.sets.length ? previous.volume : null,
    previousWeekChange: volumeChange(current.volume, previous?.sets.length ? previous.volume : null),
    previousSameMenuWeek: sameMenu?.week.week_no ?? null, sameMenuVolume: sameMenu?.volume ?? null,
    sameMenuChange: volumeChange(current.volume, sameMenu?.volume ?? null), exercises,
    avgFatigue: average(current.sessions.map(s => s.fatigue)), avgSleep: average(current.sessions.map(s => s.sleep_h)), pains,
    warnings: current.sets.length ? current.warnings : ['本週尚無已結束的訓練紀錄，不推算進步或加重。'],
  }
}
