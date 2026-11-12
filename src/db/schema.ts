import { z } from 'zod'

const id = z.uuid()
const date = z.iso.date()
const num = z.number().finite().nonnegative()
const integer = num.int()
const text = z.string().min(1)
const nullable = <T extends z.ZodType>(schema: T) => schema.nullish()
const day = z.enum(['push', 'pull', 'extra'])
const json = z.json()
const draftEntry = z.object({ id, set_no: integer.min(1), side: z.enum(['both', 'left', 'right']), weight: z.string(), reps: z.string(), rir: integer.max(5), done: z.boolean() }).strict()
const draftItem = z.object({ id, planned_exercise_id: id, exercise_id: id, order_no: integer.min(1), sets: integer.min(1), base_sets: integer.min(1).optional(), base_rir: integer.max(5).optional(), base_weight_kg: nullable(num), target_reps: integer.min(1).optional(), is_paused: z.boolean().optional(), rep_min: integer.min(1), rep_max: integer.min(1), target_rir: integer.max(5), target_weight_kg: nullable(num), rest_sec: integer, entries: z.array(draftEntry) }).strict()
export const muscle = z.enum(['chest', 'back', 'front_delt', 'side_delt', 'rear_delt', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes'])

export const mealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export const mealValueSchema = z.object({ name: text, grams: num.positive(), kcal: num, protein_g: num, carbs_g: num, fat_g: num, is_estimate: z.boolean() }).strict()

export const schemas = {
  user_profiles: z.object({ id, sex: nullable(z.enum(['male', 'female'])), birth_date: nullable(date), height_cm: nullable(num.positive()), goal: text.default('hypertrophy'), activity_level: z.enum(['sedentary', 'light', 'moderate']).default('sedentary'), limitations: z.array(text).default([]), intensity_scale: z.enum(['RIR', 'RPE']).default('RIR'), timezone: z.literal('Asia/Taipei').default('Asia/Taipei') }).strict(),
  nutrition_targets: z.object({ id, created_at: z.iso.datetime({ offset: true }).optional(), source_analysis_id: nullable(id), effective_from: date, bmr_kcal: nullable(integer), tdee_kcal: nullable(integer), kcal: integer, protein_g: integer, carbs_g: integer, fat_g: integer, reason: nullable(z.string()) }).strict(),
  exercises: z.object({ id, code: text, name_zh: text, name_en: text, primary_muscle: muscle, secondary_muscles: z.array(muscle), load_type: z.enum(['barbell', 'dumbbell_pair', 'dumbbell_single', 'machine', 'cable', 'bodyweight', 'assisted']), increment_kg: num.positive(), is_compound: z.boolean(), unilateral: z.boolean(), loads_lower_back: z.boolean(), cues: nullable(z.string()) }).strict(),
  exercise_alternatives: z.object({ exercise_id: id, alt_exercise_id: id, reason: nullable(z.string()) }).strict(),
  programs: z.object({ id, start_date: date, weeks: z.literal(12).default(12), status: z.enum(['active', 'completed', 'paused']).default('active') }).strict(),
  program_weeks: z.object({ id, program_id: id, week_no: integer.min(1).max(12), menu: z.enum(['A', 'B']), phase: integer.min(1).max(3), is_deload: z.boolean(), deload_origin_week: nullable(integer.min(1).max(12)) }).strict(),
  planned_exercises: z.object({ id, program_week_id: id, day_type: day, order_no: integer.min(1), exercise_id: id, sets: integer.min(1), base_sets: integer.min(1).optional(), base_rir: integer.max(5).optional(), base_weight_kg: nullable(num), target_reps: integer.min(1).optional(), is_paused: z.boolean().optional(), rep_min: integer.min(1), rep_max: integer.min(1), target_rir: integer.max(5), target_weight_kg: nullable(num), rest_sec: integer }).strict().refine(v => v.rep_max >= v.rep_min, { message: '次數上限不得小於下限', path: ['rep_max'] }).refine(v => v.target_reps == null || v.target_reps >= v.rep_min && v.target_reps <= v.rep_max, { message: '目標次數必須在設定範圍內', path: ['target_reps'] }),
  workout_sessions: z.object({ id, started_at: z.iso.datetime({ offset: true }).optional(), program_week_id: nullable(id), day_type: day, date, bodyweight_kg: nullable(num.positive()), fatigue: nullable(integer.min(1).max(10)), sleep_h: nullable(num.max(24)), completed: z.boolean().default(false), notes: nullable(z.string()) }).strict(),
  workout_sets: z.object({ id, session_id: id, planned_exercise_id: nullable(id), exercise_id: id, set_no: integer.min(1), side: z.enum(['both', 'left', 'right']).default('both'), weight_kg: num.default(0), reps: integer, rir: nullable(integer.max(5)) }).strict(),
  pain_reports: z.object({ id, session_id: id, body_part: text, score: integer.max(10), sharp: z.boolean().optional(), exercise_id: nullable(id) }).strict(),
  weekly_analyses: z.object({ id, program_id: id, week_no: integer.min(1).max(12), rules_version: text, applied_at: nullable(z.iso.datetime({ offset: true })), source_fingerprint: z.string().optional(), metrics: json, ai_summary: nullable(z.string()), computed_at: z.iso.datetime({ offset: true }) }).strict(),
  recommendations: z.object({ id, analysis_id: id, target_type: z.enum(['exercise', 'muscle', 'program', 'nutrition']), target_ref: text, before: json.optional(), after: json.optional(), rule_id: text, reason: text, original_after: json.optional(), original_reason: z.string().optional(), status: z.enum(['pending', 'accepted', 'rejected', 'modified']).default('pending'), decided_at: nullable(z.iso.datetime({ offset: true })) }).strict(),
  plan_changes: z.object({ id, recommendation_id: nullable(id), planned_exercise_id: nullable(id), change: json, applied_at: z.iso.datetime({ offset: true }) }).strict(),
  foods: z.object({ id, name: text, kcal_100g: num, protein_100g: num, carbs_100g: num, fat_100g: num, source: z.enum(['database', 'label', 'custom']) }).strict(),
  meals: z.object({ id, date, updated_at: z.iso.datetime({ offset: true }).optional(), entry_source: z.enum(['manual', 'paste', 'favorite']).optional(), meal_type: mealType, photo_path: z.null().default(null), ai_raw: z.null().default(null), confirmed: z.boolean().default(false) }).strict(),
  meal_items: z.object({ id, meal_id: id, food_id: nullable(id), name: text, grams: num, kcal: num, protein_g: num, carbs_g: num, fat_g: num, is_estimate: z.boolean().default(true), kcal_low: nullable(num), kcal_high: nullable(num) }).strict(),
  body_metrics: z.object({ id, date, weight_kg: nullable(num.positive()), waist_cm: nullable(num.positive()), bodyfat_pct: nullable(num.max(100)) }).strict(),
  workout_drafts: z.object({ id, session_id: id, items: z.array(draftItem), bodyweight: z.string(), fatigue: z.string(), sleep_h: z.string(), pains: z.array(z.object({ id, body_part: z.string(), score: z.string(), sharp: z.boolean().optional(), exercise_id: nullable(id) }).strict()), timer: z.object({ ends_at: num.nullable(), remaining_ms: num, paused: z.boolean() }).strict(), updated_at: z.iso.datetime({ offset: true }) }).strict(),
  exercise_photos: z.object({ exercise_code: text, blob: z.instanceof(Blob).refine(b=>b.type==='image/jpeg'&&b.size>0&&b.size<=4*1024*1024,'照片須為 4 MB 以下 JPEG。'), updated_at: z.iso.datetime({offset:true}) }).strict(),
  favorite_meals: z.object({ id, name: text, meal_type: mealType, items: z.array(mealValueSchema).min(1), created_at: z.iso.datetime({ offset: true }) }).strict(),
  app_meta: z.object({ key: text, value: json }).strict(),
  import_links: z.object({ key: text, entity_id: id }).strict(),
} as const

export type TableName = keyof typeof schemas
export type Row<K extends TableName> = z.infer<(typeof schemas)[K]>
export const tableNames = Object.keys(schemas) as TableName[]
