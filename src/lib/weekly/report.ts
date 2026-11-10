import { z } from 'zod'
import { muscle, schemas } from '../../db/schema'
const nullable = z.number().finite().nullable()
export const metricsSchema = z.object({
  weekNo: z.number().int().min(1).max(12), menu: z.enum(['A', 'B']), isDeload: z.boolean(), sessionCount: z.number().int(),
  completion: z.object({ done: z.number(), target: z.number(), ratio: z.number() }), volume: nullable,
  muscles: z.record(muscle, z.object({ sets: z.number(), volume: nullable })),
  previousWeekVolume: nullable, previousWeekChange: nullable, previousSameMenuWeek: nullable, sameMenuVolume: nullable, sameMenuChange: nullable,
  exercises: z.array(z.object({ exercise: schemas.exercises, best: nullable, previousBest: nullable, status: z.enum(['new', 'up', 'flat', 'down']), flatWeeks: z.number(), flatOccurrences: z.number(), downWeeks: z.number(), stalled: z.boolean(), lastSets: z.array(schemas.workout_sets), lastPlan: schemas.planned_exercises.nullable(), previousBelowMin: z.boolean(), painScore: z.number(), sharp: z.boolean(), repeatedPain: z.boolean(), lumbarPain: z.boolean() })),
  avgFatigue: nullable, avgSleep: nullable, pains: z.array(schemas.pain_reports.extend({ date: z.iso.date() })), warnings: z.array(z.string()),
})
