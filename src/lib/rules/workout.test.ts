import { describe, expect, it } from 'vitest'
import { schemas, type Row } from '../../db/schema'
import { currentWeek, entryTarget, exerciseRule, loggedRule, summarizeWorkout, weeklyCompletion } from './workout'
const id = () => crypto.randomUUID()
const makeExercise = (load_type: Row<'exercises'>['load_type'], overrides = {}) => schemas.exercises.parse({ id: id(), code: load_type, name_zh: '測試動作', name_en: 'Test', primary_muscle: 'chest', secondary_muscles: ['triceps'], load_type, increment_kg: 1, is_compound: true, unilateral: false, loads_lower_back: false, ...overrides })
const sessionId = id()
const makeSet = (exercise_id: string, weight_kg: number, reps: number, overrides = {}) => schemas.workout_sets.parse({ id: id(), exercise_id, session_id: sessionId, set_no: 1, weight_kg, reps, rir: 2, ...overrides })
describe('訓練彙總與預填', () => {
  it('資料層映射為純函式參數', () => {
    const ex = makeExercise('barbell')
    expect(exerciseRule(ex).loadType).toBe('barbell')
    expect(loggedRule(makeSet(ex.id, 20, 8)).weightKg).toBe(20)
  })
  it('各負重類型混合、左右容量加總與有效組數', () => {
    const ex = makeExercise('dumbbell_single', { unilateral: true })
    const pair = makeExercise('dumbbell_pair', { primary_muscle: 'front_delt', secondary_muscles: ['triceps'] })
    const rows = [makeSet(ex.id, 5, 12, { side: 'left' }), makeSet(ex.id, 5, 10, { side: 'right' }), makeSet(pair.id, 10, 8)]
    const result = summarizeWorkout(rows, [ex, pair], 60)
    expect(result.volume).toBe(270)
    expect(result.muscles).toEqual({ chest: 1, front_delt: 1, triceps: 1 })
    expect(result.best[ex.id]).toBeGreaterThan(5)
  })
  it('合成混合容量案例 9,447 kg，並非使用者個人紀錄', () => {
    const a = makeExercise('barbell'), b = makeExercise('dumbbell_pair'), c = makeExercise('bodyweight'), d = makeExercise('cable')
    const rows = [makeSet(a.id, 100, 30), makeSet(b.id, 20, 30), makeSet(c.id, 0, 50), makeSet(d.id, 43, 29)]
    expect(summarizeWorkout(rows, [a, b, c, d], 80).volume).toBe(9447)
  })
  it('同一肌群不同動作、同動作不同課表格不誤合併', () => {
    const ex = makeExercise('barbell')
    const rows = [makeSet(ex.id, 10, 10, { planned_exercise_id: id() }), makeSet(ex.id, 10, 10, { planned_exercise_id: id() })]
    expect(summarizeWorkout(rows, [ex], null).muscles.chest).toBe(2)
    const bw = makeExercise('bodyweight')
    expect(summarizeWorkout([makeSet(bw.id, 0, 8)], [bw], null).volume).toBeNull()
  })
  it('完成率左右各半組且重複訓練不超算', () => {
    const ex = makeExercise('dumbbell_single')
    const p = schemas.planned_exercises.parse({ id: id(), exercise_id: ex.id, program_week_id: id(), day_type: 'push', order_no: 1, sets: 2, rep_min: 8, rep_max: 10, target_rir: 2, rest_sec: 60 })
    const session = schemas.workout_sessions.parse({ id: sessionId, date: '2026-01-01', day_type: 'push', completed: false })
    const left = makeSet(ex.id, 5, 8, { planned_exercise_id: p.id, side: 'left' })
    expect(weeklyCompletion([p], [left], [session]).ratio).toBe(.25)
    expect(weeklyCompletion([p], [left, { ...left, id: id(), side: 'right' }, left], [session]).ratio).toBe(.5)
    expect(weeklyCompletion([], [], []).ratio).toBe(0)
  })
  it('預填目標優先，上次重量次之，首次器械必須試重', () => {
    const ex = makeExercise('machine')
    const plan = { target_weight_kg: 30, rep_min: 8, target_rir: 2 }
    expect(entryTarget(plan, ex).weight).toBe('30')
    expect(entryTarget({ ...plan, target_weight_kg: null }, ex, makeSet(ex.id, 20, 10)).weight).toBe('20')
    expect(entryTarget({ ...plan, target_weight_kg: null }, ex).weight).toBe('')
    expect(entryTarget({ ...plan, target_weight_kg: null }, { load_type: 'bodyweight' }).weight).toBe('0')
  })
  it('台北日期週次上下界與週一切換', () => {
    expect(currentWeek('2026-11-09', '2026-11-08')).toBe(1)
    expect(currentWeek('2026-11-09', '2026-11-15')).toBe(1)
    expect(currentWeek('2026-11-09', '2026-11-16')).toBe(2)
    expect(currentWeek('2026-11-09', '2027-11-16')).toBe(12)
  })
})
