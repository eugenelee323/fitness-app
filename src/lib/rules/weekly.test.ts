import { describe, expect, it } from 'vitest'
import { fixtureId, logWeek, weeklyFixture } from '../../test/weeklyFixture'
import { aggregateWeek, average, dueWeeks, isLumbarPain, relevantPain, settlementDeadline, volumeChange } from './weekly'
import { estimatedSeconds, latestExercise, mergeProposals, plannedMuscleSets, planRecommendations, safetyWeek, targetReps } from './planning'
import { muscleLabels } from './workout'
import type { Muscle } from './index'

describe('每週彙總與台北結算時點', () => {
  it('同一動作部分訓練缺體重，不用其餘一筆 e1RM 冒充完整週最佳', () => {
    const input = logWeek(weeklyFixture(), 1, { only: ['pullup'] })
    logWeek(input, 1, { only: ['pullup'] })
    input.sessions[1].bodyweight_kg = null
    expect(aggregateWeek(input, 1).exercises[0].best).toBeNull()
    input.sessions.reverse()
    expect(aggregateWeek(input, 1).exercises[0].best).toBeNull()
  })
  it('同週重複同動作仍按連續兩次判斷停滯，進步會中斷計數', () => {
    const input = weeklyFixture()
    logWeek(input, 1, { only: ['bench_bb'], weight: 20 })
    logWeek(input, 1, { only: ['bench_bb'], weight: 20 })
    logWeek(input, 1, { only: ['bench_bb'], weight: 20 })
    const m = aggregateWeek(input, 1).exercises[0]
    expect(m.flatWeeks).toBe(0)
    expect(m.flatOccurrences).toBe(2)
    expect(m.stalled).toBe(true)
    logWeek(input, 2, { only: ['bench_bb'], weight: 30 })
    expect(aggregateWeek(input, 2).exercises[0].flatOccurrences).toBe(0)
  })
  it('週一固定起算，週日 21:00 的前後一毫秒與跨年', () => {
    expect(new Date(settlementDeadline(1)).toISOString()).toBe('2026-11-15T13:00:00.000Z')
    expect(dueWeeks(settlementDeadline(1) - 1, [])).toEqual([])
    expect(dueWeeks(settlementDeadline(1), [])).toEqual([1])
    expect(dueWeeks(settlementDeadline(12), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toEqual([12])
  })
  it('空值不當作 0，容量 0 不能作分母', () => {
    expect(average([null, undefined])).toBeNull(); expect(average([5, null, 7])).toBe(6)
    expect(volumeChange(120, 100)).toBe(.2); expect(volumeChange(null, 100)).toBeNull(); expect(volumeChange(1, 0)).toBeNull(); expect(volumeChange(1, null)).toBeNull()
  })
  it('完成率、左右容量與肌群有效組數、疲勞及睡眠平均', () => {
    const input = logWeek(weeklyFixture(), 1)
    const metrics = aggregateWeek(input, 1)
    expect(metrics.completion.ratio).toBe(1)
    expect(metrics.completion.done).toBe(metrics.completion.target)
    expect(metrics.avgFatigue).toBe(5); expect(metrics.avgSleep).toBe(8)
    expect(metrics.muscles.chest.sets).toBe(12)
    expect(metrics.muscles.side_delt.sets).toBe(7)
    expect(metrics.exercises.every(e => e.status === 'new')).toBe(true)
    expect(metrics.volume).toBeGreaterThan(0)
    expect(Object.values(metrics.muscles).reduce((n, m) => n + (m.volume ?? 0), 0)).toBe(metrics.volume)
  })
  it('同菜單比較不混入 B 菜單，停滯與退步區分連續觀測及連續週次', () => {
    const input = weeklyFixture()
    logWeek(input, 1, { weight: 30 }); logWeek(input, 2, { weight: 30 }); logWeek(input, 3, { weight: 30 })
    const m = aggregateWeek(input, 3)
    expect(m.previousSameMenuWeek).toBeNull()
    expect(m.previousWeekVolume).not.toBeNull()
    expect(m.exercises.find(e => e.exercise.code === 'bench_bb')).toMatchObject({ status: 'flat', flatWeeks: 2, stalled: true })
    logWeek(input, 4, { weight: 20 }); logWeek(input, 5, { weight: 10 })
    const fifth = aggregateWeek(input, 5)
    expect(fifth.previousSameMenuWeek).toBe(2)
    expect(fifth.sameMenuChange).toBeLessThan(0)
    expect(fifth.exercises.find(e => e.exercise.code === 'bench_bb')?.downWeeks).toBe(2)
  })
  it('缺體重使相關容量與 e1RM 未知；舊匯入沒有 planned id 仍可對應完成率', () => {
    const input = logWeek(weeklyFixture(), 1, { only: ['pullup'] })
    input.sessions[0].bodyweight_kg = null
    input.sets.forEach(s => { s.planned_exercise_id = null })
    const m = aggregateWeek(input, 1)
    expect(m.volume).toBeNull(); expect(m.muscles.back.volume).toBeNull()
    expect(m.exercises[0].best).toBeNull(); expect(m.warnings.length).toBe(1)
    expect(m.completion.done).toBe(4)
    expect(aggregateWeek(weeklyFixture(), 1).warnings[0]).toContain('尚無')
    expect(() => aggregateWeek(weeklyFixture(), 13)).toThrow()
  })
  it('疼痛依部位或明確動作對應，連續高痛與刺痛', () => {
    const input = weeklyFixture()
    logWeek(input, 1, { only: ['bench_bb'], reps: 2 }); logWeek(input, 2, { only: ['bench_bb'], reps: 2 })
    const ex = input.exercises.find(e => e.code === 'bench_bb')!
    for (const session of input.sessions) input.pains.push({ id: fixtureId(), session_id: session.id, body_part: '左肩', score: 5, exercise_id: ex.id, sharp: true })
    const m = aggregateWeek(input, 2)
    expect(m.pains).toHaveLength(1)
    expect(m.exercises[0]).toMatchObject({ repeatedPain: true, sharp: true, previousBelowMin: true })
    const p = input.pains[0]
    expect(relevantPain({ ...p, exercise_id: null, body_part: '肩' }, ex)).toBe(true)
    expect(relevantPain({ ...p, exercise_id: null, body_part: '膝' }, ex)).toBe(false)
    expect(relevantPain({ ...p, exercise_id: null, body_part: '未明部位' }, ex)).toBe(true)
    expect(isLumbarPain({ ...p, body_part: '腰', score: 1 })).toBe(true)
    expect(isLumbarPain({ ...p, body_part: '腰', score: 0 })).toBe(false)
  })
})

describe('建議產生與課表安全', () => {
  it('低於次數上限且進步時可加組，停滯兩次加組、單週疲勞高減組', () => {
    const prepare = (mode: 'up' | 'flat' | 'tired' | 'unknown') => {
      const input = weeklyFixture()
      logWeek(input, 1, { weight: 20 }); logWeek(input, 2, { weight: mode === 'up' ? 25 : 20, fatigue: mode === 'tired' ? 8 : mode === 'unknown' ? null : 5 })
      if (mode === 'flat') logWeek(input, 5, { weight: 20 })
      for (const s of input.sets) s.reps = input.plans.find(p => p.id === s.planned_exercise_id)!.rep_max - 1
      return input
    }
    const up = prepare('up')
    const adds = planRecommendations(up, aggregateWeek(up, 2)).filter(r => r.rule_id === 'M1')
    expect(adds.length).toBeGreaterThan(0)
    expect(adds.every(r => r.after.rows.some(p => p.sets != null))).toBe(true)
    const flat = prepare('flat')
    expect(planRecommendations(flat, aggregateWeek(flat, 5)).some(r => r.rule_id === 'M2')).toBe(true)
    const tired = prepare('tired')
    expect(planRecommendations(tired, aggregateWeek(tired, 2)).some(r => r.rule_id === 'M3')).toBe(true)
    const unknown = prepare('unknown')
    expect(planRecommendations(unknown, aggregateWeek(unknown, 2)).some(r => r.rule_id === 'M3')).toBe(false)
    const merged = mergeProposals(up, adds.map(r => r.after))
    for (const w of merged.weeks) safetyWeek(merged.rows.filter(p => p.program_week_id === w.id), up.exercises)
    expect(() => mergeProposals(up, [{ kind: 'program', editable: 'none', forced: false, postpone_allowed: false, rows: [], weeks: [{ id: fixtureId(), is_deload: true }] }])).toThrow('不存在的週次')
  })
  it('純函式不改輸入；臥推達上限建議加重、首次動作不判進退步', () => {
    const input = logWeek(weeklyFixture(), 1, { only: ['bench_bb'], weight: 65, reps: 8 })
    const snapshot = structuredClone(input)
    const recs = planRecommendations(input, aggregateWeek(input, 1))
    const bench = recs.find(r => r.target_ref === input.exercises.find(e => e.code === 'bench_bb')!.id)!
    expect(bench.rule_id).toBe('L4'); expect(bench.after.rows[0].target_weight_kg).toBe(67.5)
    expect(input).toEqual(snapshot)
    expect(recs.some(r => r.rule_id === 'L0')).toBe(true)
    expect(planRecommendations(weeklyFixture(), aggregateWeek(weeklyFixture(), 1))).toEqual([])
  })
  it('一般疼痛、刺痛、反覆高痛與腰部替代優先', () => {
    for (const [score, sharp, expected] of [[2, false, 'L2'], [5, false, 'L1'], [0, true, 'L1']] as const) {
      const input = logWeek(weeklyFixture(), 1, { only: ['bench_bb'] })
      input.pains.push({ id: fixtureId(), session_id: input.sessions[0].id, body_part: '胸', score, sharp })
      const rec = planRecommendations(input, aggregateWeek(input, 1)).find(r => r.rule_id === expected)!
      expect(rec).toBeDefined()
      if (expected === 'L1') expect(rec.after.rows[0].is_paused).toBe(true)
    }
    const input = logWeek(weeklyFixture(), 1)
    input.pains.push({ id: fixtureId(), session_id: input.sessions.find(s => s.day_type === 'pull')!.id, body_part: '腰', score: 1 })
    const safe = planRecommendations(input, aggregateWeek(input, 1)).find(r => r.rule_id === 'S1')!
    expect(input.exercises.find(e => e.id === safe.after.rows[0].exercise_id)?.code).toBe('leg_curl_lying')
    const chest = input.exercises.find(e => e.code === 'incline_press_mc')!
    input.pains.push({ id: fixtureId(), session_id: input.sessions[0].id, body_part: '胸', score: 5, exercise_id: chest.id })
    const substitution = planRecommendations(input, aggregateWeek(input, 1)).find(r => r.target_ref === chest.id)!
    expect(substitution.after.rows[0].exercise_id).not.toBe(chest.id)
  })
  it('正常週的各條 L 規則、重量與組數不一起增加', () => {
    for (const [reps, rir, expected] of [[10, 2, 'L3'], [8, 0, 'L5'], [7, 2, 'L6'], [4, 2, 'L7']] as const) {
      const input = logWeek(weeklyFixture(), 1, { only: ['bench_bb'], weight: 65, reps, rir })
      expect(planRecommendations(input, aggregateWeek(input, 1)).some(r => r.rule_id === expected)).toBe(true)
    }
    expect(targetReps(6, 8, 8, true)).toBe(8)
    expect(targetReps(6, 8, 2, false)).toBe(6)
  })
  it('預定減量可延兩週，但第 6 週不能再延；最後第 12 週保留減量', () => {
    const input = weeklyFixture()
    logWeek(input, 1, { weight: 20 }); logWeek(input, 2, { weight: 25 }); logWeek(input, 3, { weight: 30 })
    const recs = planRecommendations(input, aggregateWeek(input, 3))
    const d = recs.find(r => r.rule_id === 'D4-postpone')!
    expect(d.after.weeks.map(w => w.is_deload)).toEqual([false, true])
    expect(d.after.rows.find(r => r.id === input.plans.find(p => p.program_week_id === input.weeks[3].id && p.order_no === 1 && p.day_type === 'push')!.id)?.sets).toBe(4)
    const moved = mergeProposals(input, [d.after]); input.plans = moved.rows; input.weeks = moved.weeks
    logWeek(input, 4, { weight: 35 })
    const again = planRecommendations(input, aggregateWeek(input, 4)).find(r => r.rule_id === 'D4-postpone')!
    expect(again.after.weeks[1].deload_origin_week).toBe(4)
    const second = mergeProposals(input, [again.after]); input.plans = second.rows; input.weeks = second.weeks
    logWeek(input, 5, { weight: 40 })
    const forced = planRecommendations(input, aggregateWeek(input, 5)).find(r => r.target_type === 'program')!
    expect(forced.rule_id).toBe('D4'); expect(forced.after.weeks).toHaveLength(1)
    expect(forced.after.weeks[0].is_deload).toBe(true)
    logWeek(input, 10, { weight: 45 }); logWeek(input, 11, { weight: 50 })
    expect(planRecommendations(input, aggregateWeek(input, 11)).find(r => r.target_type === 'program')?.rule_id).toBe('D4')
    logWeek(input, 12)
    expect(planRecommendations(input, aggregateWeek(input, 12))).toEqual([])
  })
  it('疲勞、睡眠與主動作連續退步觸發減量，減量後恢復原組數', () => {
    for (const option of ['fatigue', 'sleep', 'down'] as const) {
      const input = weeklyFixture()
      logWeek(input, 1, { weight: 40, fatigue: option === 'fatigue' ? 8 : 5 })
      logWeek(input, 2, { weight: 30, fatigue: option === 'fatigue' ? 8 : 5, sleep: option === 'sleep' ? 6 : 8 })
      logWeek(input, 3, { weight: 20, fatigue: option === 'fatigue' ? 8 : 5, sleep: option === 'sleep' ? 6 : 8 })
      const no = option === 'down' ? 3 : 2
      const d = planRecommendations(input, aggregateWeek(input, no)).find(r => r.target_type === 'program')!
      expect(d.rule_id).toBe(option === 'fatigue' ? 'D2' : option === 'sleep' ? 'D3' : 'D1')
      expect(d.after.rows[0].sets).toBe(2)
    }
    const input = weeklyFixture(); logWeek(input, 4)
    const recovery = planRecommendations(input, aggregateWeek(input, 4)).find(r => r.target_type === 'program')!
    expect(recovery.rule_id).toBe('D-restore'); expect(recovery.after.rows[0].sets).toBe(4)
    const postponed = weeklyFixture(); logWeek(postponed, 2, { weight: 20 }); logWeek(postponed, 3, { weight: 30 })
    expect(planRecommendations(postponed, aggregateWeek(postponed, 3), true).find(r => r.target_type === 'program')?.rule_id).toBe('D4')
  })
  it('組數加減、空缺疲勞不憑空減組，以及上限與時間守門', () => {
    const input = weeklyFixture()
    const row = input.plans.find(p => p.program_week_id === input.weeks[1].id && p.day_type === 'push')!
    expect(estimatedSeconds([row], input.exercises)).toBeGreaterThan(0)
    expect(plannedMuscleSets([row], input.exercises, 'chest')).toBe(row.sets)
    expect(plannedMuscleSets([row], input.exercises, 'triceps')).toBe(row.sets / 2)
    expect(plannedMuscleSets([row], input.exercises, 'glutes')).toBe(0)
    expect(estimatedSeconds([{ ...row, is_paused: true }], input.exercises)).toBe(0)
    expect(() => safetyWeek([{ ...row, sets: 100 }], input.exercises)).toThrow()
    expect(() => safetyWeek([{ ...row, sets: 13, rest_sec: 0 }], input.exercises)).toThrow('12 組')
    const back = input.exercises.find(e => e.loads_lower_back)!
    expect(() => safetyWeek([{ ...row, exercise_id: back.id }, { ...row, id: fixtureId(), exercise_id: back.id }], input.exercises)).toThrow('壓下背')
    expect(latestExercise(input, 1, row.exercise_id)).toBeNull()
    expect(() => mergeProposals(input, [{ rows: [{ id: fixtureId(), sets: 2 }], weeks: [], kind: 'load', editable: 'sets', forced: false, postpone_allowed: false }])).toThrow('不存在')
    for (const muscle of Object.keys(muscleLabels) as Muscle[]) expect(plannedMuscleSets([], input.exercises, muscle)).toBe(0)
  })
})
