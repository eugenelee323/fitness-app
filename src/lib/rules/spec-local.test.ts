import { existsSync, readFileSync } from 'node:fs'
import { it, expect } from 'vitest'
import { z } from 'zod'
import catalog from '../../seed/catalog.json'
import { schemas } from '../../db/schema'
import { summarizeWorkout } from './workout'
// 只在本機存在私有檔案時驗證原始規格案例；不將任何個人紀錄複製進 repo。
const file = new URL('../../../my-data.json', import.meta.url)
it.skipIf(!existsSync(file))('第 12 節原始推日容量 9,447 kg（私有檔不在 CI 時略過）', () => {
  const input = z.object({ tables: z.object({ workout_sessions: z.array(z.object({ ref: z.string(), bodyweight_kg: z.number() })), workout_sets: z.array(z.object({ session_ref: z.string(), exercise_code: z.string(), set_no: z.number(), side: z.enum(['both', 'left', 'right']), weight_kg: z.number(), reps: z.number(), rir: z.number().nullable() })) }) }).parse(JSON.parse(readFileSync(file, 'utf8')))
  const session = input.tables.workout_sessions[0]
  const exercises = catalog.exercises.map(ex => schemas.exercises.parse({ ...ex, id: crypto.randomUUID() }))
  const sessionId = crypto.randomUUID()
  const sets = input.tables.workout_sets.filter(s => s.session_ref === session.ref).map(s => schemas.workout_sets.parse({ id: crypto.randomUUID(), session_id: sessionId, exercise_id: exercises.find(ex => ex.code === s.exercise_code)?.id, set_no: s.set_no, weight_kg: s.weight_kg, reps: s.reps, rir: s.rir, side: s.side }))
  expect(summarizeWorkout(sets, exercises, session.bodyweight_kg).volume).toBe(9447)
})
