import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FitnessDB, stores } from '../../db'
import { startWorkout, deleteWorkout } from '../../db/workouts'
import { fixtureId, logWeek, weeklyFixture } from '../../test/weeklyFixture'
import { applyRecommendations, autoSettle, decideRecommendation, loadWeeklyInput, settleWeek, sourceFingerprint } from './index'
import { settlementDeadline, type WeeklyInput } from '../rules/weekly'
import { readSnapshot, createBackup, prepareBackup, restoreBackup } from '../backup'
let database: FitnessDB
let input: WeeklyInput
async function persist(data: WeeklyInput) {
  await database.rows('programs').put(data.program)
  await database.rows('exercises').bulkPut(data.exercises)
  await database.rows('exercise_alternatives').bulkPut(data.alternatives)
  await database.rows('program_weeks').bulkPut(data.weeks)
  await database.rows('planned_exercises').bulkPut(data.plans)
  if (data.sessions.length) await database.rows('workout_sessions').bulkPut(data.sessions)
  if (data.sets.length) await database.rows('workout_sets').bulkPut(data.sets)
  if (data.pains.length) await database.rows('pain_reports').bulkPut(data.pains)
}
async function decideAll(id: string, status: 'accepted' | 'rejected' = 'accepted') {
  for (const rec of await database.rows('recommendations').where('analysis_id').equals(id).toArray()) if (rec.status === 'pending') await decideRecommendation(rec.id, status, undefined, database)
}
beforeEach(async () => { database = new FitnessDB(`weekly-${fixtureId()}`); input = weeklyFixture(); await persist(input) })
afterEach(async () => { await database.delete() })
describe('結算與明確確認才能套用', () => {
  it('使用者把維持重量改成加重時，不能同時接受該動作加組', async () => {
    for (const week of [1, 2, 5]) logWeek(input, week, { weight: 20 })
    for (const set of input.sets) set.reps = input.plans.find(p => p.id === set.planned_exercise_id)!.rep_max - 1
    await persist(input)
    const id = await settleWeek(5, false, database)
    const recs = await database.rows('recommendations').where('analysis_id').equals(id).toArray()
    const muscle = recs.find(r => r.rule_id === 'M2' && r.target_ref === 'side_delt')!
    const row = (muscle.after as { rows: { id: string }[] }).rows[0]
    const plan = input.plans.find(p => p.id === row.id)!
    const load = recs.find(r => r.target_ref === plan.exercise_id && r.rule_id === 'L6')!
    await decideRecommendation(load.id, 'modified', { rows: [{ id: row.id, value: 21 }] }, database)
    await decideAll(id)
    const before = await database.rows('planned_exercises').toArray()
    await expect(applyRecommendations(id, database)).rejects.toThrow('一次只能改重量或組數')
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    expect(await database.rows('plan_changes').count()).toBe(0)
  })
  it('加組可修改，實際變更只歸因至對應建議一次', async () => {
    logWeek(input, 1, { weight: 20 }); logWeek(input, 2, { weight: 25 })
    for (const set of input.sets) set.reps = input.plans.find(p => p.id === set.planned_exercise_id)!.rep_max - 1
    await persist(input)
    const id = await settleWeek(2, false, database)
    const recs = await database.rows('recommendations').where('analysis_id').equals(id).toArray()
    const muscle = recs.find(r => r.rule_id === 'M1' && r.target_ref === 'side_delt')!
    const patch = (muscle.after as { rows: { id: string; sets: number }[] }).rows[0]
    await decideRecommendation(muscle.id, 'modified', { rows: [{ id: patch.id, value: patch.sets }] }, database)
    await decideAll(id)
    await applyRecommendations(id, database)
    expect((await database.rows('planned_exercises').get(patch.id))?.sets).toBe(patch.sets)
    // 同一課表欄位的實際變更只歸因一次，不會把加組歸到維持重量建議。
    const changes = await database.rows('plan_changes').where('planned_exercise_id').equals(patch.id).toArray()
    const setsChanges = changes.filter(c => c.change && typeof c.change === 'object' && 'after' in c.change && JSON.stringify(c.change.after).includes('"sets"'))
    expect(setsChanges).toHaveLength(1)
  })
  it('安全停止需接受，套用後訓練不再帶入該動作', async () => {
    logWeek(input, 1, { only: ['bench_bb'] })
    input.pains.push({ id: fixtureId(), session_id: input.sessions[0].id, body_part: '左肩', score: 5 })
    await persist(input)
    const id = await settleWeek(1, false, database)
    const stop = (await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r => r.rule_id === 'L1')!
    await expect(decideRecommendation(stop.id, 'modified', { rows: [{ id: fixtureId(), value: 1 }] }, database)).rejects.toThrow('不提供')
    await decideAll(id)
    await applyRecommendations(id, database)
    const draftId = await startWorkout(input.weeks[1].id, 'push', database)
    const draft = await database.rows('workout_drafts').get(draftId)
    const bench = input.exercises.find(e => e.code === 'bench_bb')!
    expect(draft?.items.some(i => i.exercise_id === bench.id)).toBe(false)
  })
  it('結算、接受及修改都不改課表，全部處理後才套用，重複點擊不再加重', async () => {
    logWeek(input, 1, { only: ['bench_bb'], weight: 65, reps: 8 }); await persist(input)
    const before = await database.rows('planned_exercises').toArray()
    const id = await settleWeek(1, false, database)
    expect(await settleWeek(1, false, database)).toBe(id)
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    await expect(applyRecommendations(id, database)).rejects.toThrow('逐條')
    const rec = (await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r => r.rule_id === 'L4')!
    const target = (rec.after as { rows: { id: string }[] }).rows[0].id
    await decideRecommendation(rec.id, 'accepted', undefined, database)
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    await decideRecommendation(rec.id, 'modified', { rows: [{ id: target, value: 70 }] }, database)
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    await decideAll(id)
    await applyRecommendations(id, database)
    expect((await database.rows('planned_exercises').get(target))?.target_weight_kg).toBe(70)
    expect(await database.rows('plan_changes').count()).toBeGreaterThan(0)
    expect((await database.rows('app_meta').get('backup_requested_at'))?.value).toBeTruthy()
    const applied = await database.rows('plan_changes').count()
    await applyRecommendations(id, database)
    expect(await database.rows('plan_changes').count()).toBe(applied)
    await expect(decideRecommendation(rec.id, 'rejected', undefined, database)).rejects.toThrow('已產生')
  })
  it('全部拒絕時保留既有課表，無套用紀錄', async () => {
    logWeek(input, 1, { only: ['bench_bb'] }); await persist(input)
    const before = await database.rows('planned_exercises').toArray()
    const id = await settleWeek(1, false, database)
    await decideAll(id, 'rejected'); await applyRecommendations(id, database)
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    expect(await database.rows('plan_changes').count()).toBe(0)
  })
  it('重新結算只重建尚未套用建議；已套用後只更新報告', async () => {
    logWeek(input, 1, { only: ['bench_bb'] }); await persist(input)
    const id = await settleWeek(1, false, database)
    const first = await database.rows('recommendations').where('analysis_id').equals(id).toArray()
    await decideRecommendation(first[0].id, 'rejected', undefined, database)
    await settleWeek(1, true, database)
    const second = await database.rows('recommendations').where('analysis_id').equals(id).toArray()
    expect(second.every(r => r.status === 'pending')).toBe(true)
    expect(second.map(r => r.id)).not.toEqual(first.map(r => r.id))
    await decideAll(id); await applyRecommendations(id, database)
    const plans = await database.rows('planned_exercises').toArray()
    const changes = await database.rows('plan_changes').toArray()
    const recs = await database.rows('recommendations').toArray()
    await settleWeek(1, true, database)
    expect(await database.rows('planned_exercises').toArray()).toEqual(plans)
    expect(await database.rows('plan_changes').toArray()).toEqual(changes)
    expect(await database.rows('recommendations').toArray()).toEqual(recs)
  })
  it('結算後資料變更必須重算，不能套用過期建議', async () => {
    logWeek(input, 1); await persist(input)
    const id = await settleWeek(1, false, database); await decideAll(id)
    await database.rows('workout_sets').put({ ...input.sets[0], reps: 1 })
    const before = await database.rows('planned_exercises').toArray()
    await expect(applyRecommendations(id, database)).rejects.toThrow('資料已變動')
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    const rec = await database.rows('recommendations').where('analysis_id').equals(id).first()
    await expect(decideRecommendation(rec!.id, 'accepted', undefined, database)).rejects.toThrow('資料已變動')
  })
  it('目標週已開始就不再更改該週，套用失敗整批回復', async () => {
    logWeek(input, 1, { only: ['bench_bb'] }); await persist(input)
    const id = await settleWeek(1, false, database); await decideAll(id)
    await startWorkout(input.weeks[1].id, 'push', database)
    const before = await database.rows('planned_exercises').toArray()
    await expect(applyRecommendations(id, database)).rejects.toThrow('已有訓練')
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    expect(await database.rows('plan_changes').count()).toBe(0)
  })
  it('任一更新失敗，課表、歷史與已套用狀態一起回復', async () => {
    logWeek(input, 1, { only: ['bench_bb'] }); await persist(input)
    const id = await settleWeek(1, false, database); await decideAll(id)
    const before = await readSnapshot(database)
    database.rows('planned_exercises').hook('updating', () => { throw new Error('中斷') })
    await expect(applyRecommendations(id, database)).rejects.toThrow('中斷')
    expect(await readSnapshot(database)).toEqual(before)
  })
  it('非法修改、安全停止建議與不存在對象都被拒絕', async () => {
    logWeek(input, 1); await persist(input)
    const id = await settleWeek(1, false, database)
    const rec = (await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r => r.rule_id === 'L4')!
    const target = (rec.after as { rows: { id: string }[] }).rows[0].id
    await expect(decideRecommendation(rec.id, 'modified', { rows: [{ id: target, value: -1 }] }, database)).rejects.toThrow()
    await expect(decideRecommendation(rec.id, 'modified', { rows: [{ id: fixtureId(), value: 2 }] }, database)).rejects.toThrow('不正確')
    await expect(decideRecommendation(rec.id, 'modified', undefined, database)).rejects.toThrow('不提供')
    await expect(decideRecommendation(fixtureId(), 'accepted', undefined, database)).rejects.toThrow('找不到')
    await expect(applyRecommendations(fixtureId(), database)).rejects.toThrow('找不到')
  })
})
describe('時間觸發、減量與完整備份', () => {
  it('Dexie 3 升級 4 保留既有訓練並建立正確的減量前基準', async () => {
    const name = database.name
    await database.delete()
    const old = new Dexie(name)
    old.version(3).stores({ ...stores, program_weeks: 'id, program_id, week_no, &[program_id+week_no]' })
    const weeks = input.weeks.map(w => { const copy = { ...w }; delete copy.deload_origin_week; return copy })
    const plans = input.plans.map(p => { const copy = { ...p }; delete copy.base_sets; delete copy.base_rir; return copy })
    await old.table('programs').put(input.program)
    await old.table('exercises').bulkAdd(input.exercises)
    await old.table('program_weeks').bulkAdd(weeks)
    await old.table('planned_exercises').bulkAdd(plans)
    const session = { id: fixtureId(), date: '2026-11-10', day_type: 'push', completed: true }
    await old.table('workout_sessions').put(session)
    old.close()
    database = new FitnessDB(name)
    expect(await database.rows('workout_sessions').get(session.id)).toEqual(session)
    expect(await database.rows('planned_exercises').count()).toBe(216)
    const restored = (await database.rows('planned_exercises').toArray()).find(p => p.program_week_id === weeks[3].id && p.order_no === 2 && p.day_type === 'push')!
    expect(restored).toMatchObject({ sets: 2, base_sets: 3, base_rir: 2 })
    expect((await database.rows('program_weeks').get(weeks[3].id))?.deload_origin_week).toBe(4)
  })
  it('備份還原不因欄位順序改變而使已確認建議失效；舊備份補齊正常組數', async () => {
    logWeek(input, 1, { only: ['bench_bb'] }); await persist(input)
    const id = await settleWeek(1, false, database); await decideAll(id)
    const before = (await loadWeeklyInput(database))!
    const reordered = { ...before, program: Object.fromEntries(Object.entries(before.program).reverse()) as typeof before.program }
    expect(sourceFingerprint(reordered)).toBe(sourceFingerprint(before))
    const backup = await createBackup(database)
    await restoreBackup(prepareBackup(backup.content), database)
    await expect(applyRecommendations(id, database)).resolves.toBeUndefined()
    const old = JSON.parse((await createBackup(database)).content)
    for (const plan of old.tables.planned_exercises) { delete plan.base_sets; delete plan.base_rir }
    for (const week of old.tables.program_weeks) delete week.deload_origin_week
    const restored = prepareBackup(JSON.stringify(old))
    const week = restored.tables.program_weeks.find(w => w.week_no === 4)!
    const regular = restored.tables.planned_exercises.find(p => p.program_week_id === week.id && p.order_no === 2 && p.day_type === 'push')!
    expect(regular.sets).toBe(2); expect(regular.base_sets).toBe(3)
  })
  it('台北週日 21:00 才自動結算，不重複、不修改課表；草稿未結束時延後', async () => {
    const before = await database.rows('planned_exercises').toArray()
    expect(await autoSettle(database, new Date(settlementDeadline(1) - 1))).toEqual([])
    const draft = await startWorkout(input.weeks[0].id, 'push', database)
    expect(await autoSettle(database, new Date(settlementDeadline(1)))).toEqual([])
    await expect(settleWeek(1, true, database)).rejects.toThrow('進行中')
    await deleteWorkout(draft, database)
    expect(await autoSettle(database, new Date(settlementDeadline(1)))).toHaveLength(1)
    expect(await autoSettle(database, new Date(settlementDeadline(1)))).toEqual([])
    expect(await database.rows('planned_exercises').toArray()).toEqual(before)
    const analysis = (await database.rows('weekly_analyses').toArray())[0]
    await expect(applyRecommendations(analysis.id, database)).rejects.toThrow('沒有可套用')
  })
  it('減量延後會移動旗標與組數，重算重開仍保留原定週次，最多 2 週', async () => {
    logWeek(input, 1, { weight: 20 }); logWeek(input, 2, { weight: 25 }); logWeek(input, 3, { weight: 30 }); await persist(input)
    const id = await settleWeek(3, false, database)
    const rec = (await database.rows('recommendations').toArray()).find(r => r.rule_id === 'D4-postpone')!
    const original = await database.rows('program_weeks').toArray()
    await decideRecommendation(rec.id, 'accepted', undefined, database)
    expect(await database.rows('program_weeks').toArray()).toEqual(original)
    await applyRecommendations(id, database)
    expect((await database.rows('program_weeks').get(input.weeks[3].id))?.is_deload).toBe(false)
    expect((await database.rows('program_weeks').get(input.weeks[4].id))?.deload_origin_week).toBe(4)
    const saved = await createBackup(database)
    await restoreBackup(prepareBackup(saved.content), database)
    const refreshed = (await loadWeeklyInput(database))!
    logWeek(refreshed, 4, { weight: 35 }); await persist(refreshed)
    const next = await settleWeek(4, false, database); await decideAll(next); await applyRecommendations(next, database)
    expect((await database.rows('program_weeks').get(input.weeks[5].id))?.deload_origin_week).toBe(4)
    const last = (await loadWeeklyInput(database))!
    logWeek(last, 5, { weight: 40 }); await persist(last)
    const deadline = await settleWeek(5, false, database)
    const force = (await database.rows('recommendations').where('analysis_id').equals(deadline).toArray()).find(r => r.target_type === 'program')!
    expect(force.rule_id).toBe('D4')
    await expect(decideRecommendation(force.id, 'modified', { deload: false }, database)).rejects.toThrow('不得延後')
  })
  it('可修改延後建議為原定減量，但不可任意延後', async () => {
    logWeek(input, 2, { weight: 20 }); logWeek(input, 3, { weight: 30 }); await persist(input)
    const id = await settleWeek(3, false, database)
    const rec = (await database.rows('recommendations').where('analysis_id').equals(id).toArray()).find(r => r.rule_id === 'D4-postpone')!
    await decideRecommendation(rec.id, 'modified', { deload: true }, database)
    await applyRecommendations(id, database)
    expect((await database.rows('program_weeks').get(input.weeks[3].id))?.is_deload).toBe(true)
    expect((await database.rows('program_weeks').get(input.weeks[4].id))?.is_deload).toBe(false)
  })
})
