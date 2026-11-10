import { describe, expect, it } from 'vitest'
import { effectiveLoad, setVolume, e1rm, fractionalSets, nextLoad, roundTo, progressStatus, muscleSetDelta, deloadDecision, bmr, tdee, dailyStatus, weeklyKcalDelta, type Exercise, type LoggedSet } from './index'
const ex: Exercise = { code: 'test', primaryMuscle: 'chest', secondaryMuscles: ['triceps'], loadType: 'barbell', incrementKg: 2.5, isCompound: true, unilateral: false, loadsLowerBack: false }
const set: LoggedSet = { setNo: 1, weightKg: 20, reps: 10, rir: 2, side: 'both' }
const sets = (count: number, weight: number, reps: number, rir = 2) => Array.from({ length: count }, (_, i) => ({ ...set, setNo: i + 1, weightKg: weight, reps, rir }))
const plan = { sets: 4, repMin: 6, repMax: 8, targetRir: 2, targetWeightKg: 65 }
describe('第 12 節純函式', () => {
  it.each([['barbell', 20], ['machine', 20], ['cable', 20], ['dumbbell_pair', 40], ['dumbbell_single', 20], ['bodyweight', 100], ['assisted', 60]] as const)('有效負重 %s', (loadType, expected) => {
    expect(effectiveLoad({ ...ex, loadType }, set, 80)).toBe(expected)
    expect(setVolume({ ...ex, loadType }, set, 80)).toBe(expected * 10)
  })
  it('輔助重量超過體重時不產生負容量', () => expect(effectiveLoad({ ...ex, loadType: 'assisted' }, { ...set, weightKg: 100 }, 80)).toBe(0))
  it('e1RM 與重量級距', () => { expect(e1rm(60, 8, 2)).toBe(80); expect(roundTo(66, 2.5)).toBe(65) })
  it('有效組數左右去重，排除 RIR 4–5', () => {
    expect(fractionalSets(ex, [{ ...set, side: 'left' }, { ...set, side: 'right' }, { ...set, setNo: 2, rir: 4 }])).toEqual({ chest: 1, triceps: 0.5 })
  })
  it('第 12 節四個加重／維持案例及疼痛停止', () => {
    expect(nextLoad(ex, plan, sets(4, 65, 8), 0, false)).toEqual({ action: 'increase', weightKg: 67.5, ruleId: 'L4' })
    expect(nextLoad({ ...ex, loadType: 'dumbbell_pair', incrementKg: 2 }, { ...plan, sets: 3, repMin: 8, repMax: 10, targetWeightKg: 16 }, sets(3, 16, 12), 0, false)).toEqual({ action: 'increase', weightKg: 18, ruleId: 'L3' })
    expect(nextLoad(ex, { ...plan, sets: 3, repMin: 8, repMax: 12, targetWeightKg: 40 }, sets(3, 40, 10), 0, false)).toEqual({ action: 'hold', weightKg: 40, ruleId: 'L6' })
    expect(nextLoad({ ...ex, isCompound: false }, { ...plan, sets: 3, repMin: 10, repMax: 12, targetWeightKg: 17.5 }, sets(3, 17.5, 12), 0, false)).toEqual({ action: 'increase', weightKg: 20, ruleId: 'L4' })
    expect(nextLoad(ex, plan, [set], 5, false)).toEqual({ action: 'stop', weightKg: null, ruleId: 'L1' })
  })
  it('疼痛減重、無紀錄、兩級加重、力竭與低於次數下限', () => {
    expect(nextLoad(ex, plan, [], 1, false).ruleId).toBe('L2')
    expect(nextLoad(ex, plan, [], 0, false).ruleId).toBe('L0')
    expect(nextLoad(ex, plan, sets(4, 65, 10), 0, false).weightKg).toBe(70)
    expect(nextLoad(ex, plan, sets(4, 65, 7, 0), 0, false).ruleId).toBe('L5')
    expect(nextLoad(ex, plan, sets(4, 65, 5), 0, false).action).toBe('hold')
    expect(nextLoad(ex, plan, sets(4, 65, 5), 0, true).action).toBe('reduce')
  })
  it('進步分類', () => {
    expect(progressStatus(100, null)).toBe('new'); expect(progressStatus(102, 100)).toBe('up'); expect(progressStatus(99, 100)).toBe('flat'); expect(progressStatus(98, 100)).toBe('down')
  })
  it('肌群組數各條件', () => {
    const m = { status: 'up' as const, flatWeeks: 0, avgFatigue: 5, completion: 1, currentSets: 10, cap: 12, planDelta: 1 }
    expect(muscleSetDelta(m)).toEqual({ delta: 1, ruleId: 'M1' })
    expect(muscleSetDelta({ ...m, completion: 0.7 }).ruleId).toBe('M4')
    expect(muscleSetDelta({ ...m, status: 'down' }).delta).toBe(-3)
    expect(muscleSetDelta({ ...m, status: 'flat', flatWeeks: 2 }).ruleId).toBe('M2')
    expect(muscleSetDelta({ ...m, status: 'new' }).ruleId).toBe('M0')
  })
  it('減量判斷', () => {
    const w = { mainLiftsDown2Weeks: 0, fatigueHigh2Weeks: false, avgSleep: 8, anyDown: false, scheduledDeload: false, allMainUp: true, avgFatigue: 5, anyPain: false, weeksSinceDeload: 3 }
    expect(deloadDecision(w).deload).toBe(false)
    expect(deloadDecision({ ...w, mainLiftsDown2Weeks: 2 }).ruleId).toBe('D1')
    expect(deloadDecision({ ...w, fatigueHigh2Weeks: true }).ruleId).toBe('D2')
    expect(deloadDecision({ ...w, avgSleep: 6, anyDown: true }).ruleId).toBe('D3')
    expect(deloadDecision({ ...w, scheduledDeload: true }).ruleId).toBe('D4-postpone')
    expect(deloadDecision({ ...w, scheduledDeload: true, weeksSinceDeload: 5 }).deload).toBe(true)
  })
  it('BMR 規格案例及 TDEE', () => { expect(bmr('male', 80, 178, 33)).toBe(1752.5); expect(bmr('female', 60, 160, 30)).toBe(1289); expect(tdee(1000, 'sedentary', 0)).toBe(1200) })
  it('每日飲食與每週熱量', () => {
    expect(dailyStatus({ kcal: 2000, proteinMin: 100 }, { kcal: 2000, protein: 100 })).toBe('met')
    expect(dailyStatus({ kcal: 2000, proteinMin: 100 }, { kcal: 2000, protein: 80 })).toBe('partial')
    expect(dailyStatus({ kcal: 2000, proteinMin: 100 }, { kcal: 1000, protein: 80 })).toBe('missed')
    const i = { logCompleteness: 1, weeklyGains: [0, 0.05], waistChange4w: 0, weeksSinceLastAdjust: 2 }
    expect(weeklyKcalDelta(i).delta).toBe(150)
    expect(weeklyKcalDelta({ ...i, logCompleteness: 0.5 }).ruleId).toBe('N1')
    expect(weeklyKcalDelta({ ...i, weeksSinceLastAdjust: 1 }).ruleId).toBe('N5')
    expect(weeklyKcalDelta({ ...i, weeklyGains: [0.4] }).delta).toBe(-150)
    expect(weeklyKcalDelta({ ...i, weeklyGains: [0.2] }).delta).toBe(0)
  })
})
