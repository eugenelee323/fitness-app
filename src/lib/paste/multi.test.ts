import { expect,it } from 'vitest'
import { parseMealsText } from './index'
it('四餐、多區塊跨日期可一次解析，錯誤行位置可修正',()=>{
  const text=['早餐','午餐','晚餐','點心'].map((meal,i)=>`#餐點 ${i===3?'2026-11-11':'2026-11-10'} ${meal}\n測試餐 ｜ 100 g ｜ 100 kcal ｜ P：10 ｜ C：10 ｜ F：2`).join('\n\n')
  const parsed=parseMealsText(text);expect(parsed.valid).toBe(true);expect(parsed.blocks).toHaveLength(4);expect(parsed.blocks[3].header?.date).toBe('2026-11-11');expect(parsed.blocks[1].lines[0].lineNumber).toBe(5)
  expect(parseMealsText(text+'\n錯誤行').valid).toBe(false);expect(parseMealsText('').valid).toBe(false);expect(parseMealsText('壞掉的第一行\n'+text).valid).toBe(false)
})
