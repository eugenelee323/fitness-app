import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FitnessDB, putRow } from './index'
import { schemas, tableNames } from './schema'
import { seedDatabase } from '../seed'
import { applyPersonalImport, preparePersonalImport } from './import'

let database: FitnessDB
beforeEach(async () => { database = new FitnessDB(`test-${crypto.randomUUID()}`); await seedDatabase(database) })
afterEach(async () => { await database.delete() })
// 僅使用合成測試資料，不讀取或複製使用者的 my-data.json。
function fixture(overrides = {}) {
  return JSON.stringify({ version: 1, exportedAt: '2026-01-01T00:00:00Z', rulesVersion: '2026.11-1', tables: {
    user_profiles: [{ sex: 'female', height_cm: 160 }],
    nutrition_targets: [{ effective_from: '2026-01-01', kcal: 2000, protein_g: 100, carbs_g: 250, fat_g: 60 }],
    body_metrics: [{ date: '2026-01-01', weight_kg: 60 }],
    workout_sessions: [{ ref: 'test-push', week_no: 1, day_type: 'push', date: '2026-01-01', completed: true }],
    workout_sets: [{ session_ref: 'test-push', exercise_code: 'bench_bb', set_no: 1, weight_kg: 20, reps: 6, rir: 2 }],
    ...overrides,
  } })
}

describe('內建資料與版本 1', () => {
  it('建立第 11 節應用資料表與持續訓練狀態表，不使用 auth 或 user_id', () => {
    expect(database.tables.map(t => t.name).sort()).toEqual([...tableNames].sort())
    expect(database.verno).toBe(5)
  })
  it('建立完整動作、替代動作、216 筆課表且可重複啟動', async () => {
    await seedDatabase(database)
    expect(await database.rows('exercises').count()).toBe(33)
    expect(await database.rows('exercise_alternatives').count()).toBe(30)
    expect(await database.rows('program_weeks').count()).toBe(12)
    expect(await database.rows('planned_exercises').count()).toBe(216)
    expect(await database.rows('user_profiles').count()).toBe(0)
    expect(await database.rows('workout_sets').count()).toBe(0)
    const weeks = await database.rows('program_weeks').orderBy('week_no').toArray()
    expect(weeks.map(w => w.menu).join('')).toBe('AABBAABBAABB')
    expect(weeks.filter(w => w.is_deload).map(w => w.week_no)).toEqual([4, 8, 12])
    expect(weeks.map(w => w.phase)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    const bench = await database.rows('exercises').where('code').equals('bench_bb').first()
    const secondWeek = await database.rows('planned_exercises').where('program_week_id').equals(weeks[1].id).toArray()
    expect(secondWeek.find(p => p.exercise_id === bench?.id)?.target_weight_kg).toBe(67.5)
    const fourthWeek = await database.rows('planned_exercises').where('program_week_id').equals(weeks[3].id).toArray()
    expect(fourthWeek.find(p => p.exercise_id === bench?.id)?.sets).toBe(2)
    expect(fourthWeek.every(p => p.target_rir === 3)).toBe(true)
  })
  it('資料重新開啟保留，寫入拒絕錯誤數值', async () => {
    const name = database.name
    database.close()
    database = new FitnessDB(name)
    expect(await database.rows('program_weeks').count()).toBe(12)
    await expect(putRow('body_metrics', { id: crypto.randomUUID(), date: '2026-01-01', weight_kg: -1 }, database)).rejects.toThrow()
    expect(schemas.workout_sets.safeParse({ id: crypto.randomUUID(), session_id: crypto.randomUUID(), exercise_id: crypto.randomUUID(), set_no: 1, weight_kg: 10, reps: 4, rir: 6 }).success).toBe(false)
    expect(schemas.program_weeks.safeParse({ id: crypto.randomUUID(), program_id: crypto.randomUUID(), week_no: 13, menu: 'A', phase: 1, is_deload: false }).success).toBe(false)
    expect(schemas.meals.safeParse({ id: crypto.randomUUID(), date: '2026-02-30', meal_type: 'lunch' }).success).toBe(false)
  })
})

describe('個人資料匯入', () => {
  it('預覽不寫入，確認後對應動作與週次，重複匯入不重複', async () => {
    const preview = await preparePersonalImport(fixture(), database)
    expect(await database.rows('user_profiles').count()).toBe(0)
    await applyPersonalImport(preview, database)
    await applyPersonalImport(await preparePersonalImport(fixture(), database), database)
    expect(await database.rows('user_profiles').count()).toBe(1)
    expect(await database.rows('nutrition_targets').count()).toBe(1)
    expect(await database.rows('body_metrics').count()).toBe(1)
    expect(await database.rows('workout_sessions').count()).toBe(1)
    expect(await database.rows('workout_sets').count()).toBe(1)
    const session = await database.rows('workout_sessions').toCollection().first()
    const set = await database.rows('workout_sets').toCollection().first()
    expect(set?.session_id).toBe(session?.id)
    expect((await database.rows('user_profiles').toCollection().first())?.timezone).toBe('Asia/Taipei')
    expect(await database.rows('planned_exercises').count()).toBe(216)
    expect(await database.rows('plan_changes').count()).toBe(0)
  })
  it('拒絕錯誤 JSON、版本、未知資料表、錯誤外鍵及數值', async () => {
    await expect(preparePersonalImport('{', database)).rejects.toThrow('JSON')
    await expect(preparePersonalImport(fixture().replace('"version":1', '"version":2'), database)).rejects.toThrow('版本')
    await expect(preparePersonalImport(fixture({ exercises: [] }), database)).rejects.toThrow('只接受')
    await expect(preparePersonalImport(fixture({ workout_sets: [{ session_ref: 'missing', exercise_code: 'bench_bb' }] }), database)).rejects.toThrow('所屬')
    await expect(preparePersonalImport(fixture({ body_metrics: [{ date: '2026-01-01', weight_kg: -5 }] }), database)).rejects.toThrow('格式錯誤')
    expect(await database.rows('user_profiles').count()).toBe(0)
  })
  it('任何一筆寫入失敗時整批回復，不留下部分資料', async () => {
    const preview = await preparePersonalImport(fixture(), database)
    database.rows('workout_sets').hook('creating', () => { throw new Error('測試寫入失敗') })
    await expect(applyPersonalImport(preview, database)).rejects.toThrow('測試寫入失敗')
    expect(await database.rows('user_profiles').count()).toBe(0)
    expect(await database.rows('workout_sessions').count()).toBe(0)
    expect(await database.rows('program_weeks').count()).toBe(12)
  })
})
