import { mergeProposals } from '../rules/planning'
import type { WeeklyInput } from '../rules/weekly'
import { schemas, type Row } from '../../db/schema'
import { explain } from '../explain'
import { displayLoad } from '../rules/loadDisplay'
import { muscleLabels } from '../rules/workout'
import { proposalSchema, type Proposal, type ReviewField } from '../weekly/types'

const fields = { 重量: 'target_weight_kg', 組數: 'sets', 次數: 'target_reps', RIR: 'target_rir' } as const
const labels = { target_weight_kg: '重量', sets: '組數', target_reps: '次數', target_rir: 'RIR' }
const actions = { 接受: 'accepted', 拒絕: 'rejected', 修改: 'modified' } as const
export const reviewStatusLabels = { pending:'待確認', accepted:'接受', rejected:'拒絕', modified:'修改' }
type Action = typeof actions[keyof typeof actions]
type Values = Partial<Record<ReviewField, number>>
type Rec = Row<'recommendations'>
type Library = Pick<WeeklyInput,'exercises'|'plans'>

const normalized = (value: string) => value.normalize('NFKC').replace(/\s+/g,'').toLowerCase()

export function parseReview(raw: string, week: number) {
  const lines = raw.split(/\r?\n/).map((text,i)=>({ line: i+1, text: text.normalize('NFKC').trim() })).filter(line=>line.text)
  const first = lines.shift()
  const header = first?.text.match(/^#\s*審核\s*:?\s*第\s*(\d+)\s*週$/)
  const error = !header ? '第一行請填「#審核 第N週」。' : Number(header[1]) !== week ? '審核週次與目前頁面不符。' : null
  const rows = lines.map(({ line,text })=>{
    const [target, actionText, ...columns] = text.split('|').map(s=>s.trim())
    const action: Action | undefined = Object.hasOwn(actions,actionText) ? actions[actionText as keyof typeof actions] : undefined
    const values: Values = {}
    let issue = !target || !action ? '請填對象及接受、拒絕或修改。' : null
    if (action === 'modified' && (!columns.length || normalized(target) === '其他')) issue = '修改需指定對象及至少一項數值。'
    if (action !== 'modified' && columns.length) issue = '只有「修改」可以附加數值。'
    if (action === 'modified') for (const column of columns) {
      const match = column.match(/^(重量|組數|次數|RIR)\s*:?\s*(\d+(?:\.\d+)?)(?:\s*(kg|組|下))?$/i)
      const field = match && fields[(match[1].toUpperCase()) as keyof typeof fields]
      const value = Number(match?.[2])
      const unit = match?.[3]?.toLowerCase()
      if (!field || !Number.isFinite(value) || field in values ||
        (unit && unit !== ({target_weight_kg:'kg',sets:'組',target_reps:'下',target_rir:''})[field]) ||
        (field !== 'target_weight_kg' && !Number.isInteger(value)) ||
        ((field === 'sets' || field === 'target_reps') && !value) || (field === 'target_rir' && value > 5)) {
        issue = '數值無效或欄位重複。組數、次數需為正整數，RIR 需為 0–5。'
        break
      }
      values[field] = value
    }
    return {line,text,target,action,values,issue}
  })
  return {error,rows}
}

export function reviewAliases(rec: Rec, library: Library): string[] {
  if (rec.target_type === 'exercise') {
    const ex = library.exercises.find(e=>e.id===rec.target_ref)
    return ex ? [ex.name_zh,ex.name_en,ex.code] : [rec.target_ref]
  }
  if (rec.target_type === 'muscle') {
    const name = muscleLabels[rec.target_ref as keyof typeof muscleLabels] ?? rec.target_ref
    return [name,name+'組數',rec.target_ref]
  }
  return rec.target_type === 'nutrition' ? ['每日營養目標','營養','daily'] : ['減量與恢復安排','減量','課表']
}

function editProposal(rec: Rec, proposal: Proposal, values: Values, library: Library) {
  if (proposal.forced || proposal.kind === 'program' || proposal.kind === 'nutrition' || !proposal.rows.length) throw new Error('此建議僅能接受或拒絕。')
  const review_fields = Object.keys(values) as ReviewField[]
  const changes: string[] = []
  const rows = proposal.rows.map(row=>{
    const plan = library.plans.find(p=>p.id===row.id)
    if (!plan) throw new Error('找不到建議指向的課表。')
    if (rec.rule_id === 'M3' && values.sets != null && (values.sets !== plan.sets-1 || values.sets < 2)) throw new Error('M3 每個動作只能少一組，至少保留兩組。')
    const exercise = library.exercises.find(e=>e.id===(row.exercise_id ?? plan.exercise_id))
    const next = { ...row, ...values }
    if (values.sets != null) next.base_sets = values.sets
    if (values.target_rir != null) next.base_rir = values.target_rir
    if (values.target_reps != null) {
      // 明確指定的目標可超出原範圍，只延伸有衝突的界線。
      if (values.target_reps < (row.rep_min ?? plan.rep_min)) next.rep_min = values.target_reps
      if (values.target_reps > (row.rep_max ?? plan.rep_max)) next.rep_max = values.target_reps
    }
    schemas.planned_exercises.parse({ ...plan, ...next })
    for (const field of review_fields) {
      const before = row[field] === undefined ? plan[field] : row[field]
      const after = values[field]!
      changes.push(explain('USER_EDIT', { name:exercise?.name_zh ?? '動作',field:labels[field],
        before: field==='target_weight_kg' ? displayLoad(exercise?.load_type,before) : before,
        after: field==='target_weight_kg' ? displayLoad(exercise?.load_type,after) : after }))
    }
    return next
  })
  return { after: proposalSchema.parse({ ...proposal, rows, review_fields: [...new Set([...(proposal.review_fields ?? []),...review_fields])] }), reason: [rec.reason,...changes].join(' ') }
}

export function previewReview(raw: string, week: number, recommendations: Rec[], library: WeeklyInput) {
  const parsed = parseReview(raw,week)
  const matched = new Map<string, NonNullable<typeof parsed.rows[number]>>()
  let fallback: typeof parsed.rows[number] | undefined
  for (const row of parsed.rows) {
    if (row.issue) continue
    if (normalized(row.target) === '其他') {
      if (fallback) row.issue = '「其他」只能出現一次。'
      else fallback = row
      continue
    }
    const ids = recommendations.filter(rec=>reviewAliases(rec,library).some(alias=>normalized(alias)===normalized(row.target))).map(rec=>rec.id)
    if (!ids.length) row.issue = '無法對應本週建議。'
    else if (ids.length > 1) row.issue = '名稱對應多條建議，請改用動作代碼。'
    else if (matched.has(ids[0])) row.issue = '同一條建議重複出現。'
    else matched.set(ids[0],row)
  }
  const decisions = [...recommendations].sort((a,b)=>a.id.localeCompare(b.id)).map(rec=>{
    const row = matched.get(rec.id) ?? fallback
    const old = proposalSchema.safeParse(rec.after)
    if (!row?.action) {
      const original = proposalSchema.safeParse(rec.original_after ?? rec.after)
      return { rec, status:'pending' as const, after:original.data, reason:rec.original_reason ?? rec.reason, change:rec.status !== 'pending' && original.success }
    }
    try {
      const status = row.action
      const result = status === 'modified'
        ? editProposal(rec,proposalSchema.parse(rec.after),row.values,library)
        : { after: proposalSchema.parse(rec.original_after ?? rec.after), reason:rec.original_reason ?? rec.reason }
      return { rec,status,...result,change:true }
    } catch (e) {
      row.issue = e instanceof Error && e.name !== 'ZodError' ? e.message : '數值或建議格式有誤，請修正後重試。'
      return { rec,status:rec.status,after:old.data,reason:rec.reason,change:false }
    }
  })
  let projection: ReturnType<typeof mergeProposals> | undefined
  let conflict: string | null = null
  if (!parsed.error && !parsed.rows.some(row=>row.issue)) {
    const chosen = decisions.flatMap(row=>row.after && (row.status==='accepted'||row.status==='modified') ? [row.after] : [])
    try { projection = mergeProposals(library,chosen) }
    catch (e) { conflict = e instanceof Error ? e.message : '無法合併審核建議。' }
  }
  const valid = !conflict && !parsed.error && parsed.rows.length > 0 && !parsed.rows.some(row=>row.issue) && decisions.some(row=>row.change)
  // 含原始建議狀態，確認時比對預覽是否已被其他分頁改動。
  const signature = JSON.stringify(decisions.map(({rec,status,after,reason})=>[rec.id,rec.status,rec.decided_at,status,after,reason]))
  return { ...parsed,error:parsed.error ?? conflict,decisions,valid,signature,projection }
}
