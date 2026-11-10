import { z } from 'zod'
import { db, type FitnessDB } from './index'
import { schemas } from './schema'
import { readSnapshot, validateSnapshot, tableLabels } from '../lib/backup'
export { tableLabels }
const allowed = ['user_profiles', 'nutrition_targets', 'body_metrics', 'workout_sessions', 'workout_sets', 'pain_reports'] as const
 type ImportTable = typeof allowed[number]
const envelope = z.object({ version: z.literal(1), kind: z.literal('my-data').optional(), exportedAt: z.iso.datetime({ offset: true }), rulesVersion: z.string().min(1), _note: z.string().optional(), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }).strict()
export type ImportPreview = Awaited<ReturnType<typeof preparePersonalImport>>
/** 來源 ref 識別初始訓練，不以同日推拉判定同一次訓練。 */
export async function preparePersonalImport(content: string, database: FitnessDB = db) {
  let raw: unknown
  try { raw = JSON.parse(content) } catch { throw new Error('檔案不是有效的 JSON。') }
  const result = envelope.safeParse(raw)
  if (!result.success) throw new Error('檔案版本或格式不符，請使用 version: 1 個人資料格式。')
  const input = result.data.tables
  if (Object.keys(input).some(key => !allowed.includes(key as ImportTable))) throw new Error('個人資料匯入只接受個人設定、營養目標、身體與訓練紀錄。')
  if ((input.user_profiles?.length ?? 0) > 1) throw new Error('此應用程式只接受一位使用者。')
  if (!Object.values(input).some(rows => rows.length)) throw new Error('檔案沒有可匯入的資料。')
  const existing = await readSnapshot(database)
  const normalized: Partial<Record<ImportTable, Record<string, unknown>[]>> = {}
  const links: { key: string; entity_id: string }[] = []
  const sessionRefs = new Map<string, string>()
  const program = existing.programs.find(p => p.status === 'active') ?? existing.programs[0]
  if (!program) throw new Error('內建計畫尚未完成。')
  const idFor = (key: string) => {
    const previous = existing.import_links.find(l => l.key === key)
    const entity_id = String(previous?.entity_id ?? crypto.randomUUID())
    links.push({ key, entity_id })
    return entity_id
  }
  for (const name of allowed) {
    normalized[name] = (input[name] ?? []).map((original, index) => {
      const row = { ...original }
      delete row.user_id
      row.id = crypto.randomUUID()
      if (name === 'user_profiles') row.id = existing.user_profiles[0]?.id ?? row.id
      if (name === 'nutrition_targets') row.id = existing.nutrition_targets.find(n => n.effective_from === row.effective_from)?.id ?? row.id
      if (name === 'body_metrics') row.id = existing.body_metrics.find(n => n.date === row.date)?.id ?? row.id
      if (name === 'workout_sessions') {
        const source = String(original.ref ?? original.id ?? `${row.date}:${row.day_type}:${original.week_no ?? index}`)
        row.id = idFor(`personal:session:${source}`)
        if (row.week_no != null) row.program_week_id = existing.program_weeks.find(w => w.program_id === program.id && w.week_no === row.week_no)?.id
        if (original.week_no != null && !row.program_week_id) throw new Error('訓練紀錄的週次不存在。')
        const current = existing.workout_sessions.find(s => s.id === row.id)
        if (current && existing.workout_drafts.some(d => d.session_id === current.id)) throw new Error('初始紀錄正在訓練中，請先結束訓練再匯入。')
        if (sessionRefs.has(source)) throw new Error('訓練紀錄 ref 不可重複。')
        sessionRefs.set(source, String(row.id))
        delete row.ref; delete row.week_no
      }
      if (name === 'workout_sets' || name === 'pain_reports') {
        const source = String(original.session_ref ?? original.session_id ?? '')
        row.session_id = sessionRefs.get(source)
        if (!row.session_id) throw new Error('找不到組數或疼痛紀錄所屬的訓練。')
        if (row.exercise_code != null) {
          row.exercise_id = existing.exercises.find(e => e.code === row.exercise_code)?.id
          if (!row.exercise_id) throw new Error(`找不到動作代碼：${String(row.exercise_code)}`)
        }
        delete row.session_ref; delete row.exercise_code
        if (name === 'workout_sets' && row.planned_exercise_id == null) {
          const session = normalized.workout_sessions?.find(s => s.id === row.session_id)
          row.planned_exercise_id = existing.planned_exercises.find(p => p.program_week_id === session?.program_week_id && p.day_type === session?.day_type && p.exercise_id === row.exercise_id)?.id ?? null
        }
        row.id = idFor(`personal:${name}:${row.session_id}:${name === 'workout_sets' ? `${row.exercise_id}:${row.set_no}:${row.side ?? 'both'}` : original.id ?? index}`)
      }
      const parsed = schemas[name].safeParse(row)
      if (!parsed.success) throw new Error(`${tableLabels[name]}格式錯誤：${parsed.error.issues.map(i => i.path.join('.')).join('、')}`)
      return parsed.data
    })
  }
  const combined = structuredClone(existing)
  for (const name of allowed) {
    const rows = normalized[name] ?? []
    const keys = rows.map(r => r.id)
    if (new Set(keys).size !== keys.length) throw new Error(`${tableLabels[name]}含重複資料。`)
    for (const row of rows) { combined[name] = combined[name].filter(r => r.id !== row.id); combined[name].push(row) }
  }
  validateSnapshot(combined)
  return { content, rows: normalized, links, counts: allowed.map(name => ({ name, label: tableLabels[name], count: normalized[name]?.length ?? 0 })) }
}
/** 確認時在交易內重新對應。完全不刪除任何紀錄。 */
export async function applyPersonalImport(preview: ImportPreview, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const fresh = await preparePersonalImport(preview.content, database)
    for (const name of allowed) if (fresh.rows[name]?.length) await database.table(name).bulkPut(fresh.rows[name]!)
    if (fresh.links.length) await database.rows('import_links').bulkPut(fresh.links)
  })
}
