import { expect, it } from 'vitest'
import { nutritionFixture } from '../../test/nutritionFixture'
import { nutritionWeek } from './nutrition'
import { nutritionRecommendations } from './nutritionPlanning'
it('熱量提案包含變更前後，維持與缺目標時沒有提案', () => {
  const report=nutritionWeek(nutritionFixture(),3,'2026-11-29')
  const up=nutritionRecommendations(report,3)[0]
  expect(up.before.nutrition?.kcal).toBe(2500)
  expect(up.after.nutrition).toMatchObject({kcal:2650,carbs_g:338,protein_g:150,fat_g:70,effective_from:'2026-11-30'})
  expect(up.reason).toContain('增加 150')
  const down=nutritionRecommendations({...report,delta:-150,ruleId:'N3'},3)[0]
  expect(down.after.nutrition?.kcal).toBe(2350)
  expect(down.reason).toContain('減少 150')
  expect(nutritionRecommendations({...report,target:null},3)).toEqual([])
  expect(nutritionRecommendations({...report,delta:0},3)).toEqual([])
})
