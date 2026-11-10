import { z } from 'zod'
import { schemas } from '../../db/schema'
export const planPatchSchema = z.object({
  id: z.uuid(), exercise_id: z.uuid().optional(), sets: z.number().int().min(1).optional(),
  target_weight_kg: z.number().finite().nonnegative().nullable().optional(),
  target_rir: z.number().int().min(0).max(5).optional(), target_reps: z.number().int().positive().optional(),
  is_paused: z.boolean().optional(), base_sets: z.number().int().positive().optional(),
  base_rir: z.number().int().min(0).max(5).optional(), base_weight_kg: z.number().finite().nonnegative().nullable().optional(),
}).strict()
export const weekPatchSchema = schemas.program_weeks.pick({ id: true, is_deload: true, deload_origin_week: true })
export const proposalSchema = z.object({
  kind: z.enum(['load', 'muscle', 'program', 'nutrition']),
  rows: z.array(planPatchSchema), weeks: z.array(weekPatchSchema),
  editable: z.enum(['weight', 'sets', 'deload', 'none', 'kcal']),
  forced: z.boolean(), postpone_allowed: z.boolean(),
  nutrition: z.object({ based_on_id: z.uuid(), effective_from: z.iso.date(), kcal: z.number().int().positive(), protein_g: z.number().int().nonnegative(), carbs_g: z.number().int().nonnegative(), fat_g: z.number().int().nonnegative() }).strict().optional(),
}).strict()
export type Proposal = z.infer<typeof proposalSchema>
export type PlanPatch = Proposal['rows'][number]
export type WeekPatch = Proposal['weeks'][number]
export interface Suggestion {
  target_type: 'exercise' | 'muscle' | 'program' | 'nutrition'
  target_ref: string
  rule_id: string
  reason: string
  before: Proposal
  after: Proposal
}
