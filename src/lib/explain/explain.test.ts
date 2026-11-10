import { describe, expect, it } from 'vitest'
import { explain, templates, type RuleId } from './index'
describe('固定繁中文範本', () => {
  it('每條規則皆可渲染，不殘留占位符或產生 NaN', () => {
    for (const ruleId of Object.keys(templates) as RuleId[]) {
      const text = explain(ruleId, { name: '測試動作', beforeWeight: 65, afterWeight: 67.5, sets: 4, minReps: 8, repMax: 8, minRir: 2 })
      expect(text).not.toMatch(/\{\w+\}|NaN|Infinity/)
      expect(text.length).toBeGreaterThan(10)
    }
  })
  it('原因引用實際數據與空值，未擅自補數', () => {
    expect(explain('L4', { name: '槓鈴臥推', sets: 4, repMax: 8, minRir: 2, beforeWeight: 65, afterWeight: 67.5 })).toContain('67.5 kg')
    expect(explain('D0', { fatigue: null, sleep: 7 })).toContain('未填')
    expect(explain('N3', { gain: Number.NaN, waist: 2 })).not.toContain('NaN')
  })
})
