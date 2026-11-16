import { displayLoad } from '../lib/rules/loadDisplay'
import type { Proposal } from '../lib/weekly/types'
import type { WeeklyInput } from '../lib/rules/weekly'

export function Targets({ proposal, input, full = false }: { proposal: Proposal; input: WeeklyInput; full?: boolean }) {
  if (proposal.nutrition) { const n = proposal.nutrition; return <p>每日 {n.kcal} kcal · 蛋白質 {n.protein_g} g · 碳水 {n.carbs_g} g · 脂肪 {n.fat_g} g<br />生效日期：{n.effective_from}（逾期確認改為確認當日生效）</p> }
  if (!proposal.rows.length && !proposal.weeks.length) return <p className="muted">維持現有課表</p>
  return <>{proposal.weeks.map(w => <p key={w.id}>第 {input.weeks.find(week => week.id === w.id)?.week_no} 週：{w.is_deload ? '減量週' : '正常訓練週'}</p>)}{proposal.rows.map(row => {
    const plan = input.plans.find(p => p.id === row.id)
    const ex = input.exercises.find(e => e.id === (row.exercise_id ?? plan?.exercise_id))
    const sets = row.sets ?? (full ? plan?.sets : undefined)
    const weight = row.target_weight_kg === undefined && full ? (plan?.target_weight_kg ?? null) : row.target_weight_kg
    const rir = row.target_rir ?? (full ? plan?.target_rir : undefined)
    const reps = row.target_reps ?? (full ? plan?.target_reps : undefined)
    const range = reps == null && full && plan ? plan.rep_min+'–'+plan.rep_max : undefined
    return <div className="proposal-target" key={row.id}><strong>{ex?.name_zh}<small className="english">{ex?.name_en}</small></strong><p>{sets != null && `${sets} 組 · `}{weight !== undefined && (weight === null ? '試重 · ' : `${displayLoad(ex?.load_type,weight)} · `)}{rir != null && `RIR ${rir} · `}{range != null && ('目標 '+range+' 下 · ')}{reps != null && `目標 ${reps} 下 · `}{row.is_paused === true ? '暫停此動作' : row.is_paused === false ? '使用此動作' : ''}</p></div>
  })}</>
}
