import { z } from 'zod'
import { db, type FitnessDB } from '../../db'
import { schemas, tableNames, type TableName } from '../../db/schema'
import { RULES_VERSION } from '../rules'
import { taipeiDate } from '../time'

export type Snapshot = Record<TableName, Record<string, unknown>[]>
const baseTables = tableNames.filter(n => !['workout_drafts', 'app_meta', 'import_links'].includes(n))
const envelope = z.object({ version: z.literal(1), exportedAt: z.iso.datetime({ offset: true }), rulesVersion: z.string().min(1), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }).strict()

export function validateSnapshot(tables: Snapshot) {
  const ids = (name: TableName) => new Set(tables[name].map(r => r.id))
  const has = (name: TableName, value: unknown) => value == null || ids(name).has(value)
  const requireRef = (from: TableName, field: string, to: TableName) => {
    if (tables[from].some(r => !has(to, r[field]))) throw new Error(`${from}.${field} 找不到對應資料`)
  }
  for (const name of tableNames) {
    for (const row of tables[name]) schemas[name].parse(row)
    const keys = tables[name].map(r => name === 'exercise_alternatives' ? `${r.exercise_id}:${r.alt_exercise_id}` : name === 'app_meta' || name === 'import_links' ? r.key : r.id)
    if (new Set(keys).size !== keys.length) throw new Error(`${name} 含重複主鍵`)
  }
  const unique = (name: TableName, fields: string[]) => {
    const values = tables[name].map(r => JSON.stringify(fields.map(f => r[f])))
    if (new Set(values).size !== values.length) throw new Error(`${name} 含重複資料`)
  }
  unique('exercises', ['code']); unique('program_weeks', ['program_id', 'week_no'])
  unique('planned_exercises', ['program_week_id', 'day_type', 'order_no'])
  unique('weekly_analyses', ['program_id', 'week_no']); unique('body_metrics', ['date'])
  unique('workout_drafts', ['session_id'])
  if (tables.user_profiles.length > 1 || tables.workout_drafts.length > 1) throw new Error('最多一份個人資料與一份進行中訓練')
  for (const [from, field, to] of [
    ['exercise_alternatives', 'exercise_id', 'exercises'], ['exercise_alternatives', 'alt_exercise_id', 'exercises'],
    ['program_weeks', 'program_id', 'programs'], ['planned_exercises', 'program_week_id', 'program_weeks'], ['planned_exercises', 'exercise_id', 'exercises'],
    ['workout_sessions', 'program_week_id', 'program_weeks'], ['workout_sets', 'session_id', 'workout_sessions'], ['workout_sets', 'exercise_id', 'exercises'], ['workout_sets', 'planned_exercise_id', 'planned_exercises'],
    ['pain_reports', 'session_id', 'workout_sessions'], ['pain_reports', 'exercise_id', 'exercises'], ['weekly_analyses', 'program_id', 'programs'],
    ['recommendations', 'analysis_id', 'weekly_analyses'], ['plan_changes', 'recommendation_id', 'recommendations'], ['plan_changes', 'planned_exercise_id', 'planned_exercises'],
    ['meal_items', 'meal_id', 'meals'], ['meal_items', 'food_id', 'foods'], ['workout_drafts', 'session_id', 'workout_sessions'],
  ] as [TableName, string, TableName][]) requireRef(from, field, to)
  for (const raw of tables.workout_drafts) {
    const draft = schemas.workout_drafts.parse(raw)
    if (tables.workout_sessions.find(s => s.id === draft.session_id)?.completed) throw new Error('已結束訓練不可含草稿')
    for (const item of draft.items) {
      if (!has('exercises', item.exercise_id) || !has('planned_exercises', item.planned_exercise_id)) throw new Error('草稿動作不存在')
      for (const entry of item.entries) {
        const saved = tables.workout_sets.find(s => s.id === entry.id)
        if (entry.done && (!saved || saved.session_id !== draft.session_id || saved.exercise_id !== item.exercise_id || saved.set_no !== entry.set_no || saved.side !== entry.side)) throw new Error('草稿的已完成組缺少對應紀錄')
      }
    }
  }
}
export async function readSnapshot(database: FitnessDB = db): Promise<Snapshot> {
  return database.transaction('r', database.tables, async () => {
    const pairs = await Promise.all(tableNames.map(async name => [name, await database.table(name).toArray()]))
    return JSON.parse(JSON.stringify(Object.fromEntries(pairs))) as Snapshot
  })
}
export function prepareBackup(content: string) {
  const parsed = envelope.safeParse(JSON.parse(content))
  if (!parsed.success) throw new Error('備份格式或版本不符，必須是 version: 1 完整備份。')
  const input = parsed.data.tables
  if (Object.keys(input).some(n => !tableNames.includes(n as TableName)) || baseTables.some(n => !Array.isArray(input[n]))) throw new Error('完整備份缺少必要資料表或含未知資料表。')
  const tables = {} as Snapshot
  for (const name of tableNames) tables[name] = (input[name] ?? []).map(row => schemas[name].parse(row))
  validateSnapshot(tables)
  return { ...parsed.data, tables, counts: tableNames.map(name => ({ name, count: tables[name].length })) }
}
export type BackupPreview = ReturnType<typeof prepareBackup>
export async function createBackup(database: FitnessDB = db, now = new Date()) {
  const exportedAt = now.toISOString()
  return database.transaction('rw', database.tables, async () => {
    await database.rows('app_meta').put({ key: 'last_backup_at', value: exportedAt })
    const tables = await readSnapshot(database)
    return { filename: `fitness-backup-${taipeiDate(now).replaceAll('-', '')}.json`, content: JSON.stringify({ version: 1, exportedAt, rulesVersion: RULES_VERSION, tables }, null, 2) }
  })
}
export async function restoreBackup(preview: BackupPreview, database: FitnessDB = db) {
  validateSnapshot(preview.tables)
  await database.transaction('rw', database.tables, async () => {
    for (const name of tableNames) await database.table(name).clear()
    for (const name of tableNames) if (preview.tables[name].length) await database.table(name).bulkAdd(preview.tables[name])
  })
}
export const tableLabels: Record<TableName, string> = { user_profiles: '個人資料', nutrition_targets: '營養目標', exercises: '動作庫', exercise_alternatives: '替代動作', programs: '訓練計畫', program_weeks: '計畫週次', planned_exercises: '計畫動作', workout_sessions: '訓練紀錄', workout_sets: '實際組數', pain_reports: '疼痛紀錄', weekly_analyses: '每週分析', recommendations: '建議', plan_changes: '課表變更', foods: '食物', meals: '餐點', meal_items: '餐點項目', body_metrics: '身體數據', workout_drafts: '進行中訓練', app_meta: '本機設定', import_links: '匯入對應' }
