import { expect, it } from 'vitest'
import { elapsedDays, inbodyComparison, inbodyText, recentInbody } from './inbody'
import { displayLoad, loadLabel, looksLikeBodyweight } from './loadDisplay'
import { inbodyFixture } from '../../test/nutritionFixture'
import { nextLoad, setVolume, tdee } from './index'
import { exerciseRule } from './workout'
import { weeklyFixture } from '../../test/weeklyFixture'

it('只比較截止日前 10–21 天內最接近 14 天的 InBody', () => {
  const [baseline, latest] = inbodyFixture()
  const rows = [latest, { ...baseline, date:'2026-11-22' }, { ...baseline, date:'2026-11-16' }, baseline, { ...latest, date:'2026-12-01' }]
  expect(recentInbody(rows,'2026-11-29')[0]).toEqual(latest)
  expect(inbodyComparison(rows,'2026-11-29')).toEqual({ baseline, latest })
  expect(inbodyComparison(rows.slice(0,2),'2026-11-29')).toBeNull()
  expect(inbodyComparison([], '2026-11-29')).toBeNull()
  expect(elapsedDays(baseline.date, latest.date)).toBe(14)
  expect(inbodyText(latest)).toContain('骨骼肌 30 kg')
  expect(tdee(1400,'moderate',2,1700)).toBeCloseTo(2040+600/7)
})

it('辨別加重與體重，確認繩索容量不乘二且熱身不足以加重', () => {
  expect(displayLoad('bodyweight',0)).toBe('體重')
  expect(displayLoad('bodyweight',5)).toBe('體重 + 5 kg')
  expect(displayLoad('cable',20,false)).toBe('20')
  expect(displayLoad('cable',20)).toBe('20 kg')
  expect(displayLoad('machine',null)).toBe('未填')
  expect(looksLikeBodyweight(73,70)).toBe(true)
  expect(looksLikeBodyweight(74,70)).toBe(false)
  expect(looksLikeBodyweight(0,70)).toBe(false)
  expect(looksLikeBodyweight(70, null)).toBe(false)
  expect(looksLikeBodyweight(1, 0)).toBe(false)
  expect(['bodyweight','dumbbell_pair','dumbbell_single','cable','machine','assisted','barbell'].map(t=>loadLabel(t as Parameters<typeof loadLabel>[0]))).toEqual(['加重（kg）','單支重量（kg）','單支重量（kg）','配重（kg）','配重（kg）','輔助（kg）','重量（kg）'])
  const model = exerciseRule(weeklyFixture().exercises.find(e=>e.code==='hammer_curl_cable')!)
  const heaviest = { setNo:2, side:'both' as const, weightKg:25, reps:10, rir:2 }
  expect(setVolume(model,heaviest,70)).toBe(250)
  expect(nextLoad(model,{ sets:2, repMin:8, repMax:10, targetRir:2, targetWeightKg:20 }, [{...heaviest,setNo:1,weightKg:20,reps:6},heaviest],0,false)).toMatchObject({ruleId:'L8',weightKg:25})
})
