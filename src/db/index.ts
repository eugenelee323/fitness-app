import Dexie, { type Table } from 'dexie'
import { schemas, type Row, type TableName } from './schema'

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
}

export class FitnessDB extends Dexie {
  constructor(name = 'fitness-app') {
    super(name)
    // 後續結構異動須新增 version(n).stores(...).upgrade(...)，保留舊資料。
    this.version(1).stores(stores)
    // 版本 2 新增週次排序索引；Dexie 原地建立索引，不刪除既有紀錄。
    this.version(2).stores({ program_weeks: 'id, program_id, week_no, &[program_id+week_no]' })
    for (const name of Object.keys(stores) as TableName[]) {
      this.table(name).hook('creating', (_key, obj: unknown) => { schemas[name].parse(obj) })
      this.table(name).hook('updating', (changes, _key, obj: object) => {
        // 禁止繞過驗證以點路徑修改 JSON；目前資料存取統一使用整列 put。
        if (Object.keys(changes).some(key => key.includes('.'))) throw new Error('請以完整資料列更新')
        schemas[name].parse({ ...obj, ...changes })
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
