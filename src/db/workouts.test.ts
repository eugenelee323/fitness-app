import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FitnessDB, stores } from './index'
import { seedDatabase } from '../seed'
import { changeTimer, completeEntry, deleteWorkout, editEntry, finishWorkout, mutateDraft, replaceExercise, startWorkout } from './workouts'
import { createBackup, prepareBackup, readSnapshot, restoreBackup } from '../lib/backup'
import { applyPersonalImport, preparePersonalImport } from './import'
import { taipeiDate } from '../lib/time'
let database: FitnessDB
beforeEach(async () => { database = new FitnessDB(`stage1-${crypto.randomUUID()}`); await seedDatabase(database) })
afterEach(async () => { await database.delete() })
async function start(day: 'push' | 'pull' = 'push', weekNo = 2, date = '2026-01-01') {
  const week = (await database.rows('program_weeks').toArray()).find(w => w.week_no === weekNo)!
  return startWorkout(week.id, day, database, date)
}
async function first() {
  const draft = (await database.rows('workout_drafts').toArray())[0]
  return { draft, item: draft.items[0], entry: draft.items[0].entries[0] }
}
const personal = (extra = {}) => JSON.stringify({ version: 1, exportedAt: '2026-01-01T00:00:00Z', rulesVersion: 'test', tables: {
  user_profiles: [{ sex: 'female', height_cm: 160 }], nutrition_targets: [{ effective_from: '2026-01-01', kcal: 2000, protein_g: 100, carbs_g: 250, fat_g: 60 }], body_metrics: [{ date: '2026-01-01', weight_kg: 60 }],
  workout_sessions: [{ ref: 'initial', week_no: 2, day_type: 'push', date: '2026-01-01', completed: true }],
  workout_sets: [{ session_ref: 'initial', exercise_code: 'bench_bb', set_no: 1, side: 'both', weight_kg: 20, reps: 8, rir: 2 }], ...extra,
} })

describe('訓練草稿與原子儲存', () => {
  it('單手已完成左側後替換，只為尚未完成的右側建立紀錄列', async () => {
    const id = await start()
    const draft = (await database.rows('workout_drafts').get(id))!
    const item = draft.items.find(i => i.order_no === 6)!
    const left = item.entries[0]
    await completeEntry(id, item.id, left.id, { weight: '5', reps: '12', rir: 2 }, database)
    const alt = (await database.rows('exercise_alternatives').where('exercise_id').equals(item.exercise_id).toArray())[0]
    await replaceExercise(id, item.id, alt.alt_exercise_id, database)
    const next = (await database.rows('workout_drafts').get(id))!.items.find(i => i.exercise_id === alt.alt_exercise_id)!
    expect(next.entries.filter(e => e.set_no === 1).map(e => e.side)).toEqual(['right'])
    expect(await database.rows('workout_sets').get(left.id)).toMatchObject({ side: 'left', exercise_id: item.exercise_id })
  })
  it('全部完成後正確標記；徒手需要體重，疲勞與疼痛範圍必須合法', async () => {
    const id = await start()
    const draft = (await database.rows('workout_drafts').get(id))!
    for (const item of draft.items) for (const entry of item.entries) {
      await completeEntry(id, item.id, entry.id, { weight: entry.weight || '10', reps: entry.reps, rir: entry.rir }, database)
    }
    await mutateDraft(id, d => { d.fatigue = '5'; d.sleep_h = '7' }, database)
    await expect(finishWorkout(id, database)).rejects.toThrow('體重')
    await mutateDraft(id, d => { d.bodyweight = '60'; d.fatigue = '11' }, database)
    await expect(finishWorkout(id, database)).rejects.toThrow()
    expect(await database.rows('workout_drafts').count()).toBe(1)
    await mutateDraft(id, d => { d.fatigue = '5' }, database)
    await finishWorkout(id, database)
    expect((await database.rows('workout_sessions').get(id))?.completed).toBe(true)
    expect((await database.rows('workout_sessions').get(id))?.bodyweight_kg).toBe(60)
    expect(await database.rows('workout_drafts').count()).toBe(0)
  })
  it('重複開始只接續同一份草稿；未完成欄位與已完成組數重新開啟保留', async () => {
    const id = await start()
    expect(await start('pull')).toBe(id)
    const { item, entry } = await first()
    await editEntry(id, item.id, entry.id, { weight: '25', reps: '9', rir: 1 }, database)
    await completeEntry(id, item.id, entry.id, { weight: '25', reps: '9', rir: 1 }, database, 100000)
    await completeEntry(id, item.id, entry.id, { weight: '25', reps: '9', rir: 1 }, database, 100001)
    const pending = item.entries[1]
    await editEntry(id, item.id, pending.id, { weight: '' }, database)
    const name = database.name; database.close(); database = new FitnessDB(name)
    const resumed = await database.rows('workout_drafts').get(id)
    expect(resumed?.items[0].entries[0].done).toBe(true)
    expect(resumed?.items[0].entries[1].weight).toBe('')
    expect(await database.rows('workout_sets').count()).toBe(1)
    expect(resumed?.timer.ends_at).toBe(280000)
    await changeTimer(id, 'pause', database, 110000)
    expect((await database.rows('workout_drafts').get(id))?.timer.remaining_ms).toBe(170000)
    await changeTimer(id, 'resume', database, 200000)
    expect((await database.rows('workout_drafts').get(id))?.timer.ends_at).toBe(370000)
    await changeTimer(id, 'skip', database)
    expect((await database.rows('workout_drafts').get(id))?.timer.ends_at).toBeNull()
  })
  it('無效輸入或草稿寫入失敗，組數與計時一併回復', async () => {
    const id = await start(); const { item, entry } = await first()
    await expect(completeEntry(id, item.id, entry.id, { weight: '', reps: '8', rir: 2 }, database)).rejects.toThrow('重量')
    database.rows('workout_drafts').hook('updating', () => { throw new Error('寫入失敗') })
    await expect(completeEntry(id, item.id, entry.id, { weight: '20', reps: '8', rir: 2 }, database)).rejects.toThrow('寫入失敗')
    expect(await database.rows('workout_sets').count()).toBe(0)
    expect((await first()).draft.timer.ends_at).toBeNull()
  })
  it('單手左右各一筆；中途替換保留原動作實績與變更歷史', async () => {
    const id = await start(); const { draft, item, entry } = await first()
    expect(draft.items.find(i => i.order_no === 6)?.entries.slice(0, 2).map(e => e.side)).toEqual(['left', 'right'])
    await completeEntry(id, item.id, entry.id, { weight: '20', reps: '8', rir: 2 }, database)
    const option = await database.rows('exercise_alternatives').where('exercise_id').equals(item.exercise_id).first()
    // 主動作不替換；改測第 2 個動作。
    expect(option).toBeUndefined()
    const target = draft.items[1]
    await completeEntry(id, target.id, target.entries[0].id, { weight: '20', reps: '8', rir: 2 }, database)
    const alt = (await database.rows('exercise_alternatives').where('exercise_id').equals(target.exercise_id).toArray())[0]
    await replaceExercise(id, target.id, alt.alt_exercise_id, database)
    const saved = await database.rows('workout_sets').toArray()
    expect(saved.find(s => s.id === target.entries[0].id)?.exercise_id).toBe(target.exercise_id)
    expect((await database.rows('workout_drafts').get(id))?.items.some(i => i.exercise_id === alt.alt_exercise_id)).toBe(true)
    expect(await database.rows('plan_changes').count()).toBe(1)
    expect((await database.rows('planned_exercises').get(target.planned_exercise_id))?.exercise_id).toBe(target.exercise_id)
  })
  it('結束後保留實績與多筆疼痛，草稿移除；刪除連動組數', async () => {
    const id = await start(); const { item, entry } = await first()
    await completeEntry(id, item.id, entry.id, { weight: '20', reps: '8', rir: 2 }, database)
    await mutateDraft(id, d => { d.fatigue = '5'; d.sleep_h = '7.5'; d.pains = [{ id: crypto.randomUUID(), body_part: '左肩', score: '2' }, { id: crypto.randomUUID(), body_part: '右肘', score: '1' }] }, database)
    await finishWorkout(id, database)
    expect(await database.rows('workout_drafts').count()).toBe(0)
    expect((await database.rows('workout_sessions').get(id))?.completed).toBe(false)
    expect(await database.rows('pain_reports').count()).toBe(2)
    await deleteWorkout(id, database)
    expect(await database.rows('workout_sets').count()).toBe(0)
    expect(await database.rows('pain_reports').count()).toBe(0)
    expect(await database.rows('workout_sessions').count()).toBe(0)
  })
})

describe('合併匯入與完整備份', () => {
  it('同一天自行記錄的訓練及草稿不被初始匯入覆寫，重複匯入不新增', async () => {
    const id = await start(); const { item, entry } = await first()
    await completeEntry(id, item.id, entry.id, { weight: '30', reps: '9', rir: 1 }, database)
    const original = await database.rows('workout_sets').get(entry.id)
    await applyPersonalImport(await preparePersonalImport(personal(), database), database)
    await applyPersonalImport(await preparePersonalImport(personal(), database), database)
    expect(await database.rows('workout_sessions').count()).toBe(2)
    expect(await database.rows('workout_sets').count()).toBe(2)
    expect(await database.rows('workout_drafts').count()).toBe(1)
    expect(await database.rows('workout_sets').get(entry.id)).toEqual(original)
    expect((await database.rows('workout_sessions').get(id))?.completed).toBe(false)
    const initial = (await database.rows('workout_sessions').toArray()).find(s => s.id !== id)!
    const extra = { id: crypto.randomUUID(), session_id: initial.id, exercise_id: item.exercise_id, set_no: 2, weight_kg: 35, reps: 8, rir: 2, side: 'both' as const }
    await database.rows('workout_sets').add(extra)
    await applyPersonalImport(await preparePersonalImport(personal(), database), database)
    expect(await database.rows('workout_sets').get(extra.id)).toEqual(extra)
  })
  it('預覽後新增同日身體數據，確認時重新對應，不產生衝突', async () => {
    const preview = await preparePersonalImport(personal(), database)
    await database.rows('body_metrics').add({ id: crypto.randomUUID(), date: '2026-01-01', weight_kg: 55 })
    await applyPersonalImport(preview, database)
    expect(await database.rows('body_metrics').count()).toBe(1)
    expect((await database.rows('body_metrics').toArray())[0].weight_kg).toBe(60)
  })
  it('完整備份匯出還原後每張表與進行中草稿完全一致', async () => {
    await applyPersonalImport(await preparePersonalImport(personal(), database), database)
    const id = await start('pull')
    await mutateDraft(id, d => { d.sleep_h = '6.5' }, database)
    const result = await createBackup(database, new Date('2026-01-01T18:00:00Z'))
    expect(result.filename).toBe('fitness-backup-20260102.json')
    const snapshot = await readSnapshot(database)
    const parsed = prepareBackup(result.content)
    await deleteWorkout(id, database)
    await restoreBackup(parsed, database)
    expect(await readSnapshot(database)).toEqual(snapshot)
    expect((await database.rows('app_meta').get('last_backup_at'))?.value).toBe('2026-01-01T18:00:00.000Z')
  })
  it('拒絕缺表、重複主鍵、無效外鍵、未知版本且原資料不變', async () => {
    const backup = await createBackup(database)
    const raw = JSON.parse(backup.content)
    const before = await readSnapshot(database)
    expect(() => prepareBackup('{')).toThrow()
    expect(() => prepareBackup(JSON.stringify({ ...raw, version: 2 }))).toThrow()
    const missing = structuredClone(raw); delete missing.tables.exercises
    expect(() => prepareBackup(JSON.stringify(missing))).toThrow('缺少')
    const duplicate = structuredClone(raw); duplicate.tables.exercises.push(duplicate.tables.exercises[0])
    expect(() => prepareBackup(JSON.stringify(duplicate))).toThrow('重複')
    const dangling = structuredClone(raw); dangling.tables.planned_exercises[0].exercise_id = crypto.randomUUID()
    expect(() => prepareBackup(JSON.stringify(dangling))).toThrow('對應')
    expect(await readSnapshot(database)).toEqual(before)
  })
  it('還原中途寫入失敗，整庫取代會回復到還原前狀態', async () => {
    const backup = prepareBackup((await createBackup(database)).content)
    await start()
    const before = await readSnapshot(database)
    database.rows('exercises').hook('creating', () => { throw new Error('測試中斷') })
    await expect(restoreBackup(backup, database)).rejects.toThrow('測試中斷')
    expect(await readSnapshot(database)).toEqual(before)
  })
  it('版本 2 升級保留既有計畫與訓練', async () => {
    const name = database.name
    await database.delete()
    const old = new Dexie(name)
    old.version(2).stores(Object.fromEntries(Object.entries(stores).filter(([key]) => !['workout_drafts', 'app_meta', 'import_links'].includes(key))))
    const id = crypto.randomUUID()
    await old.table('workout_sessions').add({ id, date: '2026-01-01', day_type: 'push', completed: true })
    old.close()
    database = new FitnessDB(name)
    expect(await database.rows('workout_sessions').get(id)).toMatchObject({ completed: true })
    expect(await database.rows('workout_drafts').count()).toBe(0)
  })
  it('日期明確使用台北時區', () => expect(taipeiDate(new Date('2026-01-01T18:00:00Z'))).toBe('2026-01-02'))
})
