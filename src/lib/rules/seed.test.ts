import { describe, it, expect } from 'vitest'
import { scheduledSets, scheduledRir } from './seed'
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
