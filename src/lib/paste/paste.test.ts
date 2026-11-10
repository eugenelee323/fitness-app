import { describe, expect, it } from 'vitest'
import { parseMealText } from './index'

const sample = `#餐點 2026-11-11 午餐
雞腿便當 | 550 g | 820 kcal | P 38 | C 95 | F 30
無糖豆漿 | 450 ml | 150 kcal | P 15 | C 8 | F 7`

describe('Claude 估算貼上格式', () => {
  it('第 13 節範例解析成 2 項，ml 以 1 g 記錄並標為估算', () => {
    const result = parseMealText(sample)
    expect(result.valid).toBe(true)
    expect(result.header).toEqual({ date: '2026-11-11', meal_type: 'lunch' })
    expect(result.lines.map(line => line.item)).toEqual([
      { name: '雞腿便當', grams: 550, kcal: 820, protein_g: 38, carbs_g: 95, fat_g: 30, is_estimate: true },
      { name: '無糖豆漿', grams: 450, kcal: 150, protein_g: 15, carbs_g: 8, fat_g: 7, is_estimate: true },
    ])
  })
  it('接受全形符號、前後空白、BOM 與 Windows 換行', () => {
    const result = parseMealText('﻿\r\n ＃餐點　２０２６－１１－１２　早餐 \r\n 茶葉蛋 ｜ ５５ ｇ ｜ ７５ ｋｃａｌ ｜ Ｐ ６．５ ｜ Ｃ ０．５ ｜ Ｆ ５ \r\n')
    expect(result.valid).toBe(true)
    expect(result.header).toEqual({ date: '2026-11-12', meal_type: 'breakfast' })
    expect(result.lines[0].item).toMatchObject({ name: '茶葉蛋', grams: 55, kcal: 75, protein_g: 6.5, carbs_g: 0.5, fat_g: 5 })
  })
  it('格式錯誤的行標出行號與原因，不會丟出例外', () => {
    const result = parseMealText(`#餐點 2026-11-11 晚餐
白飯 | 200 g | 280 kcal | P 5 | C 62 | F 0.5
沒有欄位的一行
乳清 | 一匙 | 120 kcal | P 24 | C 3 | F 1
優格 | 150 g | -10 kcal | P 5 | C 10 | F 3`)
    expect(result.valid).toBe(false)
    expect(result.header?.meal_type).toBe('dinner')
    expect(result.lines.map(line => [line.lineNumber, !!line.item])).toEqual([[2, true], [3, false], [4, false], [5, false]])
    expect(result.lines[1].error).toContain('6 欄')
    expect(result.lines[2].error).toContain('份量')
  })
  it('第一行格式或日期錯誤時提示，空白內容不算有效', () => {
    expect(parseMealText('#餐點 2026-02-30 午餐\n香蕉 | 120 g | 105 kcal | P 1 | C 27 | F 0').headerError).toContain('第一行')
    expect(parseMealText('午餐\n香蕉 | 120 g | 105 kcal | P 1 | C 27 | F 0').header).toBeNull()
    expect(parseMealText('').valid).toBe(false)
    expect(parseMealText('#餐點 2026-11-11 點心').valid).toBe(false)
  })
})

it('全形冒號與欄位標籤可解析，零份量與非數字不可儲存', () => {
  expect(parseMealText('#餐點：2026-11-11：午餐\n豆漿 ｜ 份量：450 ml ｜ 熱量：150 kcal ｜ P：15 ｜ C：8 ｜ F：7').valid).toBe(true)
  expect(parseMealText('#餐點 2026-11-11 午餐\n豆漿 | 0 g | 150 | P 15 | C 8 | F 7').valid).toBe(false)
  expect(parseMealText('#餐點 2026-11-11 午餐\n豆漿 | 450 g | NaN | P 15 | C 8 | F 7').valid).toBe(false)
})
