import { expect,it } from 'vitest'
import { parseCombinedPaste, parseInbodyLine } from './inbody'

const line = '#InBody 2026-11-14 | 體重 70.6 | 骨骼肌 30.3 | 體脂肪 15.2 | 體脂率 21.5'
it('InBody 可省選填、支援全形並標記錯誤行，混貼時保留餐點原行號',()=>{
  expect(parseInbodyLine(line)).toEqual({date:'2026-11-14',weight_kg:70.6,skeletal_muscle_kg:30.3,body_fat_kg:15.2,body_fat_pct:21.5})
  expect(parseInbodyLine('＃ＩｎＢｏｄｙ：２０２６－１１－１４ ｜ 體重：７０．６ kg ｜ 骨骼肌 ３０．３ ｜ 體脂肪 １５．２ ｜ 體脂率 ２１．５％ ｜ 內臟脂肪 ９ ｜ 基礎代謝 １６７０ ｜ 備註 空腹')).toMatchObject({visceral_fat_level:9,bmr_kcal:1670,note:'空腹'})
  const meal='#餐點 2026-11-14 早餐\n優格 | 100 g | 70 | 6 | 8 | 1'
  const mixed = parseCombinedPaste(meal+'\n'+line)
  expect(mixed.valid).toBe(true)
  expect(mixed.blocks[0].lines[0].lineNumber).toBe(2)
  expect(mixed.inbody[0].lineNumber).toBe(3)
  expect(parseCombinedPaste(meal+'\n'+line.replace('15.2','錯')).inbody[0].record).toBeNull()
  expect(parseCombinedPaste(line+'\n'+line).valid).toBe(false)
  expect(parseCombinedPaste(line).valid).toBe(true)
  expect(parseCombinedPaste('錯誤格式').valid).toBe(false)
})
