import Dexie, { type Table } from 'dexie'
import { schemas, type Row, type TableName } from './schema'
import { withPlanBaselines } from '../lib/rules/seed'

export const stores: Record<TableName, string> = {
  user_profiles: 'id', nutrition_targets: 'id, effective_from',
  exercises: 'id, &code, primary_muscle',
  exercise_alternatives: '[exercise_id+alt_exercise_id], exercise_id, alt_exercise_id',
  programs: 'id, start_date, status',
  program_weeks: 'id, program_id, &[program_id+week_no]',
  planned_exercises: 'id, program_week_id, exercise_id, &[program_week_id+day_type+order_no]',
  workout_sessions: 'id, program_week_id, date, day_type',
  workout_sets: 'id, session_id, planned_exercise_id, exercise_id, [session_id+exercise_id]',
  pain_reports: 'id, session_id, exercise_id',
  weekly_analyses: 'id, program_id, &[program_id+week_no]',
  recommendations: 'id, analysis_id, status',
  plan_changes: 'id, recommendation_id, planned_exercise_id',
  foods: 'id, name', meals: 'id, date', meal_items: 'id, meal_id, food_id',
  body_metrics: 'id, &date',
  body_photos:'date', exercise_photos: 'exercise_code', favorite_meals: 'id, name', workout_drafts: 'id, &session_id', app_meta: 'key', import_links: 'key, entity_id',
}

export class FitnessDB extends Dexie {
  constructor(name = 'fitness-app') {
    super(name)
    // 後續結構異動須新增 version(n).stores(...).upgrade(...)，保留舊資料。
    const { workout_drafts: _drafts, app_meta: _meta, import_links: _links, favorite_meals: _favorites, exercise_photos: _photos, body_photos:_bodyPhotos, ...originalStores } = stores
    void [_drafts, _meta, _links, _favorites, _photos, _bodyPhotos]
    this.version(1).stores(originalStores)
    // 版本 2 新增週次排序索引；Dexie 原地建立索引，不刪除既有紀錄。
    this.version(2).stores({ program_weeks: 'id, program_id, week_no, &[program_id+week_no]' })
    this.version(3).stores({ workout_drafts: stores.workout_drafts, app_meta: stores.app_meta, import_links: stores.import_links })
    this.version(4).stores({}).upgrade(async tx => {
      const weeks = await tx.table('program_weeks').toArray() as Row<'program_weeks'>[]
      const plans = await tx.table('planned_exercises').toArray() as Row<'planned_exercises'>[]
      const normalized = withPlanBaselines(weeks, plans)
      if (normalized.weeks.length) await tx.table('program_weeks').bulkPut(normalized.weeks)
      if (normalized.plans.length) await tx.table('planned_exercises').bulkPut(normalized.plans)
    })
    this.version(5).stores({ favorite_meals: stores.favorite_meals, nutrition_targets: 'id, effective_from, created_at, source_analysis_id' })
    this.version(6).stores({ exercise_photos: stores.exercise_photos, workout_sessions: 'id, program_week_id, date, day_type, [program_week_id+day_type]' })
    this.version(7).stores({body_photos:stores.body_photos}).upgrade(async tx=>{ await tx.table('app_meta').put({key:'schema_version',value:7}) })
    for (const name of Object.keys(stores) as TableName[]) {
      this.table(name).hook('creating', (_key, obj: unknown) => { schemas[name].parse(obj) })
      this.table(name).hook('updating', (changes, _key, obj: object) => {
        // Dexie 對整列 put 也可能產生巢狀差異；先還原完整更新結果再驗證。
        const updated = structuredClone(obj)
        for (const [path, value] of Object.entries(changes)) {
          if (path.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) throw new Error('不允許的資料路徑')
          Dexie.setByKeyPath(updated, path, value)
        }
        schemas[name].parse(updated)
      })
    }
  }
  rows<K extends TableName>(name: K): Table<Row<K>, string> { return this.table(name) }
}
export const db = new FitnessDB()

/** 寫入前先套用 zod 預設值並驗證。 */
export async function putRow<K extends TableName>(name: K, value: unknown, database = db) {
  const row = schemas[name].parse(value)
  return database.table(name).put(row)
}
