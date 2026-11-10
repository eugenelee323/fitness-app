import catalog from '../seed/catalog.json'
import { schemas, type Row } from '../db/schema'
import type { WeeklyInput } from '../lib/rules/weekly'
let serial = 1
export const fixtureId = () => `00000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`
export function weeklyFixture(): WeeklyInput {
  const program = schemas.programs.parse({ id: fixtureId(), start_date: '2026-11-09', status: 'active' })
  const exercises = catalog.exercises.map(ex => schemas.exercises.parse({ ...ex, id: fixtureId() }))
  const exId = (code: string) => exercises.find(e => e.code === code)!.id
  const alternatives: Row<'exercise_alternatives'>[] = []
  catalog.a.forEach((a, index) => {
    const b = catalog.bCodes[index]
    if (a.code !== b) for (const [from, to] of [[a.code, b], [b, a.code]]) alternatives.push({ exercise_id: exId(from), alt_exercise_id: exId(to) })
  })
  const weeks = Array.from({ length: 12 }, (_, i) => schemas.program_weeks.parse({ id: fixtureId(), program_id: program.id, week_no: i + 1, menu: [0, 1, 4, 5, 8, 9].includes(i) ? 'A' : 'B', phase: Math.floor(i / 4) + 1, is_deload: [3, 7, 11].includes(i), deload_origin_week: [3, 7, 11].includes(i) ? i + 1 : null }))
  const plans = weeks.flatMap(week => catalog.a.map((a, index) => schemas.planned_exercises.parse({ id: fixtureId(), program_week_id: week.id, day_type: a.day_type, order_no: a.order_no, exercise_id: exId(week.menu === 'A' ? a.code : catalog.bCodes[index]), sets: week.is_deload ? Math.ceil(a.sets / 2) : a.sets, base_sets: a.sets, base_rir: a.target_rir, rep_min: a.rep_min, rep_max: a.rep_max, target_rir: week.is_deload ? 3 : a.target_rir, target_weight_kg: week.week_no === 2 ? a.target_weight_kg : null, rest_sec: a.rest_sec })))
  return { program, exercises, alternatives, weeks, plans, sessions: [], sets: [], pains: [] }
}
export function logWeek(input: WeeklyInput, no: number, options: { weight?: number; reps?: number; rir?: number; fatigue?: number | null; sleep?: number | null; only?: string[]; day?: 'push' | 'pull' } = {}) {
  const week = input.weeks.find(w => w.week_no === no)!
  for (const day of (options.day ? [options.day] : ['push', 'pull']) as ('push' | 'pull')[]) {
    const date = new Date(Date.parse('2026-11-09T00:00:00Z') + ((no - 1) * 7 + (day === 'push' ? 1 : 4)) * 86400000).toISOString().slice(0, 10)
    const session = schemas.workout_sessions.parse({ id: fixtureId(), program_week_id: week.id, date, day_type: day, fatigue: options.fatigue === undefined ? 5 : options.fatigue, sleep_h: options.sleep === undefined ? 8 : options.sleep, bodyweight_kg: 60, completed: true })
    const plans = input.plans.filter(p => p.program_week_id === week.id && p.day_type === day && (!options.only || options.only.includes(input.exercises.find(e => e.id === p.exercise_id)!.code)))
    if (!plans.length) continue
    input.sessions.push(session)
    for (const plan of plans) {
      const ex = input.exercises.find(e => e.id === plan.exercise_id)!
      for (let n = 1; n <= plan.sets; n++) for (const side of (ex.unilateral ? ['left', 'right'] : ['both']) as ('left' | 'right' | 'both')[]) {
        input.sets.push(schemas.workout_sets.parse({ id: fixtureId(), session_id: session.id, exercise_id: ex.id, planned_exercise_id: plan.id, set_no: n, side, weight_kg: options.weight ?? 20, reps: options.reps ?? plan.rep_max, rir: options.rir ?? 2 }))
      }
    }
  }
  return input
}
