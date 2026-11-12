import type { Row } from '../../db/schema'
import type { WeeklyInput } from '../rules/weekly'
import { MAIN_LIFTS } from '../rules/weekly'
import { reportNumbers } from '../rules/report'
import { dayLabels } from '../rules/extra'
import { muscleLabels } from '../rules/workout'
import { proposalSchema } from './types'
const n=(value:number|null|undefined)=>value==null?'未填／資料不足':value.toLocaleString('zh-TW',{maximumFractionDigits:1})
export function weeklyReportText(input:WeeklyInput,weekNo:number,recommendations:Row<'recommendations'>[],asOf:string):string{
  const r=reportNumbers(input,weekNo,asOf),m=r.metrics
  const lines=[`#週報 第${weekNo}週（${r.dates[0]}～${r.dates[6]}）${r.week.menu} 菜單`,'','訓練',`完成率 ${n(r.completion)}%（${n(m.completion.done)}／${n(m.completion.target)} 組）`]
  for(const {session,exercises}of r.sessions){lines.push(`${dayLabels[session.day_type]} | ${session.date} | 疲勞 ${n(session.fatigue)}/10 | 睡眠 ${n(session.sleep_h)} 小時`);for(const {exercise,sets,volume}of exercises)lines.push(`${exercise.name_zh}／${exercise.name_en} | ${sets.map(s=>`${s.side==='both'?'':s.side==='left'?'左':'右'}${n(s.weight_kg)}×${n(s.reps)}@RIR${n(s.rir)}`).join('、')} | 容量 ${n(volume)} kg`)}
  if(!r.sessions.length)lines.push('尚無已結束訓練。')
  lines.push('','各肌群有效組數與容量')
  for(const [key,value]of Object.entries(m.muscles))lines.push(`${muscleLabels[key as keyof typeof muscleLabels]} | ${n(value.sets)} 組 | ${n(value.volume)} kg`)
  lines.push(`總容量 ${n(m.volume)} kg | 與上次同菜單 ${n(r.sameMenuPercent)}%（第 ${n(m.previousSameMenuWeek)} 週）`,'容量增加不等於肌肉增加','','主動作 e1RM')
  for(const code of MAIN_LIFTS){const metric=m.exercises.find(e=>e.exercise.code===code),ex=input.exercises.find(e=>e.code===code);lines.push(`${ex?.name_zh??code} | ${n(metric?.best)} kg | ${metric?{new:'首次／資料不足',up:'進步',flat:'持平',down:'退步'}[metric.status]:'資料不足'}`)}
  lines.push('','疼痛紀錄（含練前腰部）')
  if(!m.pains.length)lines.push('無紀錄。')
  for(const pain of m.pains)lines.push(`${pain.date} | ${pain.body_part==='lower_back'?'腰部 lower_back':pain.body_part} | ${pain.score}/10 | ${pain.phase==='pre'?'練前':pain.phase==='during'?'訓練中':'練後／未分類'}${pain.sharp?' · 刺痛':''}`)
  lines.push('','飲食',`紀錄完整率：${n(r.dietCompleteness)}% · ${n(r.recorded)}／${n(r.expected)} 餐`)
  for(const day of r.days)lines.push(`${day.date} | ${day.recorded?`${n(day.total.kcal)} kcal | 蛋白質 ${n(day.total.protein_g)} g | ${{met:'達標',partial:'部分達標',missed:'未達標',unknown:'未設定目標'}[day.status]}`:'未記錄'}`)
  lines.push(`週平均（有紀錄 ${r.loggedDays} 天）：熱量 ${n(r.average?.kcal)} kcal | 蛋白質 ${n(r.average?.protein_g)} g | 碳水 ${n(r.average?.carbs_g)} g | 脂肪 ${n(r.average?.fat_g)} g`,'','身體（不含照片）',`本週體重 ${n(r.body.weeklyWeights[2])} kg | 與上週差值 ${n(r.body.change)} kg`,`本週腰圍 ${n(r.body.measurement?.waist_cm)} cm | 與上週差值 ${n(r.waistChange)} cm`,'','下週建議')
  const target=(value:unknown)=>{const result=proposalSchema.safeParse(value);if(!result.success)return '無資料';const p=result.data;if(p.nutrition)return `${p.nutrition.kcal} kcal／蛋白 ${n(p.nutrition.protein_g)} g／碳水 ${n(p.nutrition.carbs_g)} g／脂肪 ${n(p.nutrition.fat_g)} g`;return [...p.rows.map(row=>{const plan=input.plans.find(p=>p.id===row.id),ex=input.exercises.find(e=>e.id===(row.exercise_id??plan?.exercise_id));return `${ex?.name_zh??'動作'} ${n(row.sets??plan?.sets)} 組 × ${row.target_reps??plan?.target_reps??(plan?`${plan.rep_min}–${plan.rep_max}`: '未填')} 下 · ${(row.target_weight_kg === undefined ? plan?.target_weight_kg : row.target_weight_kg)==null?'試重':n(row.target_weight_kg??plan?.target_weight_kg)+' kg'} · RIR${n(row.target_rir??plan?.target_rir)}${(row.is_paused??plan?.is_paused)?'（暫停）':''}`}),...p.weeks.map(w=>`${input.weeks.find(week=>week.id===w.id)?.week_no}週 ${w.is_deload?'減量':'正常'}`)].join('；')||'維持'}
  for(const rec of recommendations)lines.push(`${rec.target_type==='nutrition'?'營養':rec.target_type==='program'?'計畫':rec.target_type==='muscle'?muscleLabels[rec.target_ref as keyof typeof muscleLabels]??rec.target_ref:input.exercises.find(e=>e.id===rec.target_ref)?.name_zh??rec.target_ref} | ${target(rec.before)} → ${target(rec.after)} | ${rec.rule_id} | ${rec.reason} | ${{pending:'待確認',accepted:'接受',rejected:'拒絕',modified:'修改'}[rec.status]}`)
  if(!recommendations.length)lines.push('尚無建議，請先結算。')
  return lines.join('\n')
}
