import { expect,it } from 'vitest'
import { parseReview, previewReview } from './review'
import { fixtureId, weeklyFixture } from '../../test/weeklyFixture'
import { schemas } from '../../db/schema'

function fixture() {
  const input=weeklyFixture()
  const exercise=input.exercises.find(e=>e.code==='bench_bb')!
  const plan=input.plans.find(p=>p.exercise_id===exercise.id)!
  const after={kind:'load',rows:[{id:plan.id,target_weight_kg:24,sets:4,target_rir:2,target_reps:8}],weeks:[],editable:'weight',forced:false,postpone_allowed:false}
  const bench=schemas.recommendations.parse({id:fixtureId(),analysis_id:fixtureId(),target_type:'exercise',target_ref:exercise.id,rule_id:'L4',reason:'測試建議',after,original_after:after})
  const chest=schemas.recommendations.parse({...bench,id:fixtureId(),target_type:'muscle',target_ref:'chest',after:{...after,rows:[]},original_after:{...after,rows:[]}})
  return {input,exercise,recs:[bench,chest]}
}

it('忽略名稱空白、大小寫，允許全形。拒絕與其他預設正確',()=>{
  const {input,exercise,recs} = fixture()
  const preview=previewReview('  ＃審核：第 １ 週  \n'+exercise.name_en.toUpperCase().replaceAll(' ','    ')+' ｜ 接受\n其他｜拒絕',1,recs,input)
  expect(preview.valid).toBe(true)
  expect(preview.decisions.map(r=>r.status)).toEqual(['accepted','rejected'])
  expect(previewReview('#審核 第1週\n胸 | 拒絕\n其他 | 接受',1,recs,input).decisions.map(r=>r.status)).toEqual(['accepted','rejected'])
})

it('只修改指定欄位，原建議值保留，不改庫中的物件；未列出待確認',()=>{
  const {input,recs} = fixture()
  const result=previewReview('#審核 第1週\n bench_ bb | 修改 | 重量：25 | rir 3',1,recs,input)
  expect(result.valid).toBe(true)
  expect(result.decisions[0]).toMatchObject({status:'modified',after:{rows:[{target_weight_kg:25,sets:4,target_rir:3,target_reps:8}]}})
  expect(result.decisions[1]).toMatchObject({status:'pending',change:false})
  expect(recs[0].after).toMatchObject({rows:[{target_weight_kg:24,target_rir:2}]})
})

it('錯列、週次、重複對象與無效數值均攔截',()=>{
  const {input,recs} = fixture()
  const wrong=previewReview('#審核 第2週\n其他 | 接受',1,recs,input)
  expect(wrong.valid).toBe(false)
  expect(wrong.error).toContain('週次')
  const unknown=previewReview('#審核 第1週\n未知動作 | 接受\n其他 | 接受',1,recs,input)
  expect(unknown.valid).toBe(false)
  expect(unknown.rows[0].issue).toContain('無法對應')
  expect(previewReview('#審核 第1週\n槓鈴臥推 | 接受\n bench_bb | 拒絕',1,recs,input).rows[1].issue).toContain('重複')
  for(const line of ['胸 | 修改 | RIR 6','胸 | 接受 | 組數 2','其他 | 修改 | 組數 3','胸 | 修改 | 次數 0']) expect(parseReview('#審核 第1週\n'+line,1).rows[0].issue).toBeTruthy()
})

it('保護安全建議，合併預覽有衝突時禁止儲存',()=>{
  const {input,recs} = fixture()
  const blocked = {...recs[0], after:{...(recs[0].after as object), forced:true}}
  expect(previewReview('#審核 第1週\n bench_bb | 修改 | 重量 25',1,[blocked],input).rows[0].issue).toContain('僅能')
  const plan = input.plans[0]
  const conflicting = {...recs[1],after:{kind:'program',rows:[{id:plan.id,target_rir:3}],weeks:[],editable:'none',forced:true,postpone_allowed:false},original_after:undefined}
  const result=previewReview('#審核 第1週\n bench_bb | 修改 | RIR 2\n胸 | 接受',1,[recs[0],conflicting],input)
  expect(result.valid).toBe(false)
  expect(result.error).toContain('衝突')
})
