import { weeklyFixture } from '../../test/weeklyFixture'
import { describe, it, expect } from 'vitest'
import { scheduledSets, scheduledRir, withPlanBaselines } from './seed'
describe('預定減量週', () => {
  it('組數減半且保留整組，正常週不變', () => {
    expect(scheduledSets(4, true)).toBe(2)
    expect(scheduledSets(3, true)).toBe(2)
    expect(scheduledSets(4, false)).toBe(4)
  })
  it('減量目標保留 3 下，正常週不變', () => {
    expect(scheduledRir(1, true)).toBe(3)
    expect(scheduledRir(2, false)).toBe(2)
  })
})

describe('舊課表正常週基準', () => {
  it('奇數組從最近同菜單正常週取得，保留已有基準及原定週次', () => {
    const input = weeklyFixture()
    const plans = input.plans.map(p => { const row = { ...p }; delete row.base_sets; delete row.base_rir; return row })
    const weeks = input.weeks.map(w => { const row = { ...w }; delete row.deload_origin_week; return row })
    const before = structuredClone(plans)
    const result = withPlanBaselines(weeks, plans)
    const deload = result.plans.filter(p => p.program_week_id === weeks[3].id)
    expect(deload.find(p => p.order_no === 1 && p.day_type === 'push')?.base_sets).toBe(4)
    expect(deload.find(p => p.order_no === 2 && p.day_type === 'push')?.base_sets).toBe(3)
    expect(result.weeks[3].deload_origin_week).toBe(4)
    expect(plans).toEqual(before)
    const explicit = { ...deload[0], base_sets: 5, base_rir: 1 }
    expect(withPlanBaselines([{ ...weeks[3], deload_origin_week: 2 }], [explicit]).plans[0].base_sets).toBe(5)
    expect(withPlanBaselines([{ ...weeks[3], deload_origin_week: 2 }], [explicit]).weeks[0].deload_origin_week).toBe(2)
    const missing = withPlanBaselines([], [{ ...plans[0], sets: 2, target_rir: 3 }])
    expect(missing.plans[0]).toMatchObject({ base_sets: 2, base_rir: 3 })
    const noRegular = withPlanBaselines([weeks[3]], [deload[0], plans.find(p => p.program_week_id === weeks[3].id && p.id !== deload[0].id)!])
    expect(noRegular.plans[1].base_sets).toBe(noRegular.plans[1].sets)
  })
})
