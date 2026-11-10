import { z } from 'zod'
import { db, type FitnessDB } from './index'
import { schemas, type TableName } from './schema'

const allowed = ['user_profiles', 'nutrition_targets', 'body_metrics', 'workout_sessions', 'workout_sets', 'pain_reports'] as const
type ImportTable = typeof allowed[number]
const envelope = z.object({
  version: z.literal(1), kind: z.literal('my-data').optional(),
  exportedAt: z.iso.datetime({ offset: true }), rulesVersion: z.string().min(1),
  _note: z.string().optional(), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
}).strict()
export type ImportPreview = Awaited<ReturnType<typeof preparePersonalImport>>
export const tableLabels: Partial<Record<TableName, string>> = { user_profiles: '個人資料', nutrition_targets: '營養目標', body_metrics: '身體數據', workout_sessions: '訓練紀錄', workout_sets: '訓練組數', pain_reports: '疼痛紀錄' }

/** 檢查整份檔案與所有外鍵，確認前不寫入。 */
export async function preparePersonalImport(content: string, database: FitnessDB = db) {
  let raw: unknown
  try { raw = JSON.parse(content) } catch { throw new Error('檔案不是有效的 JSON，請檢查格式。') }
  const result = envelope.safeParse(raw)
  if (!result.success) throw new Error('檔案版本或格式不符，請使用第 13 節的 version: 1 個人資料格式。')
  const input = result.data.tables
  if (Object.keys(input).some(key => !allowed.includes(key as ImportTable))) throw new Error('個人資料匯入只接受個人設定、營養目標、身體與訓練紀錄。')
  if ((input.user_profiles?.length ?? 0) > 1) throw new Error('此應用程式只接受一位使用者。')
  if (!Object.values(input).some(rows => rows.length)) throw new Error('檔案沒有可匯入的資料。')
  const program = await database.rows('programs').toCollection().first()
  if (!program) throw new Error('內建計畫尚未完成，請重新開啟。')
  const weeks = await database.rows('program_weeks').where('program_id').equals(program.id).toArray()
  const exercises = await database.rows('exercises').toArray()
  const existingProfile = await database.rows('user_profiles').toCollection().first()
  const existingNutrition = await database.rows('nutrition_targets').toArray()
  const existingMetrics = await database.rows('body_metrics').toArray()
  const existingSessions = await database.rows('workout_sessions').toArray()
  const plans = await database.rows('planned_exercises').toArray()
  const normalized: Partial<Record<ImportTable, Record<string, unknown>[]>> = {}
  const sessionRefs = new Map<string, string>()
  for (const name of allowed) {
    normalized[name] = (input[name] ?? []).map(original => {
      const row = { ...original }
      delete row.user_id
      if (name === 'user_profiles') row.id = existingProfile?.id ?? row.id ?? crypto.randomUUID()
      else if (name === 'nutrition_targets') row.id = existingNutrition.find(n => n.effective_from === row.effective_from)?.id ?? row.id ?? crypto.randomUUID()
      else if (name === 'body_metrics') row.id = existingMetrics.find(n => n.date === row.date)?.id ?? row.id ?? crypto.randomUUID()
      else row.id ??= crypto.randomUUID()
      if (name === 'workout_sessions') {
        if (row.week_no != null) {
          const week = weeks.find(w => w.week_no === row.week_no)
          if (!week) throw new Error('訓練紀錄的週次不存在。')
          row.program_week_id = week.id
        }
        if (row.program_week_id != null && !weeks.some(w => w.id === row.program_week_id)) throw new Error('找不到訓練紀錄對應的週次。')
        row.id = existingSessions.find(s => s.date === row.date && s.day_type === row.day_type && s.program_week_id === row.program_week_id)?.id ?? row.id
        if (typeof original.ref === 'string') {
          if (sessionRefs.has(original.ref)) throw new Error('訓練紀錄的 ref 不可重複。')
          sessionRefs.set(original.ref, String(row.id))
        }
        if (typeof original.id === 'string') sessionRefs.set(original.id, String(row.id))
        delete row.ref
        delete row.week_no
      }
      if (name === 'workout_sets' || name === 'pain_reports') {
        if (row.session_ref != null) {
          row.session_id = sessionRefs.get(String(row.session_ref))
          delete row.session_ref
        } else if (typeof row.session_id === 'string') row.session_id = sessionRefs.get(row.session_id) ?? row.session_id
        if (!normalized.workout_sessions?.some(s => s.id === row.session_id) && !existingSessions.some(s => s.id === row.session_id)) throw new Error('找不到組數或疼痛紀錄所屬的訓練。')
        if (row.exercise_code != null) {
          row.exercise_id = exercises.find(e => e.code === row.exercise_code)?.id
          if (!row.exercise_id) throw new Error(`找不到動作代碼：${String(row.exercise_code)}`)
          delete row.exercise_code
        }
        if (row.exercise_id != null && !exercises.some(e => e.id === row.exercise_id)) throw new Error('找不到對應的動作。')
        if (row.planned_exercise_id != null && !plans.some(p => p.id === row.planned_exercise_id)) throw new Error('找不到對應的課表動作。')
      }
      const parsed = schemas[name].safeParse(row)
      if (!parsed.success) throw new Error(`${tableLabels[name]}格式錯誤：${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('；')}`)
      return parsed.data
    })
    const ids = normalized[name]?.map(row => row.id) ?? []
    if (new Set(ids).size !== ids.length) throw new Error(`${tableLabels[name]}含重複資料。`)
  }
  return { rows: normalized, counts: allowed.map(name => ({ name, label: tableLabels[name], count: normalized[name]?.length ?? 0 })) }
}

/** 使用者確認後單一交易寫入；同日資料更新，其他資料保留。 */
export async function applyPersonalImport(preview: ImportPreview, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    // 再驗證，防止呼叫端改動預覽物件繞過 zod。
    for (const name of allowed) for (const row of preview.rows[name] ?? []) schemas[name].parse(row)
    for (const session of preview.rows.workout_sessions ?? []) {
      if (preview.rows.workout_sets?.length) await database.rows('workout_sets').where('session_id').equals(String(session.id)).delete()
      if (preview.rows.pain_reports?.length) await database.rows('pain_reports').where('session_id').equals(String(session.id)).delete()
    }
    for (const name of allowed) {
      const rows = preview.rows[name] ?? []
      if (rows.length) await database.table(name).bulkPut(rows)
    }
  })
}

