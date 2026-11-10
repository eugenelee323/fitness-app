import { db, type FitnessDB } from './index'
import { schemas, type Row } from './schema'
import { entryTarget } from '../lib/rules/workout'
import { taipeiDate } from '../lib/time'

export type Draft = Row<'workout_drafts'>
export type DraftItem = Draft['items'][number]
export type DraftEntry = DraftItem['entries'][number]
export async function mutateDraft(id: string, mutate: (draft: Draft) => void, database: FitnessDB = db) {
  return database.transaction('rw', database.tables, async () => {
    const draft = await database.rows('workout_drafts').get(id)
    if (!draft) throw new Error('這次訓練已結束或不存在，請重新開啟。')
    mutate(draft)
    draft.updated_at = new Date().toISOString()
    await database.rows('workout_drafts').put(schemas.workout_drafts.parse(draft))
  })
}
export async function startWorkout(weekId: string, day: 'push' | 'pull', database: FitnessDB = db, date = taipeiDate()) {
  return database.transaction('rw', database.tables, async () => {
    const current = await database.rows('workout_drafts').toCollection().first()
    if (current) return current.id
    const plans = (await database.rows('planned_exercises').where('program_week_id').equals(weekId).toArray()).filter(p => p.day_type === day && !p.is_paused).sort((a, b) => a.order_no - b.order_no)
    if (!plans.length) throw new Error('這個週次沒有可用課表。')
    const exercises = await database.rows('exercises').toArray()
    const sessions = (await database.rows('workout_sessions').toArray()).filter(s => s.date <= date).sort((a, b) => b.date.localeCompare(a.date) || (b.started_at ?? '').localeCompare(a.started_at ?? ''))
    const allSets = await database.rows('workout_sets').toArray()
    const latestSets = allSets.filter(s => sessions.some(session => session.id === s.session_id)).sort((a, b) => sessions.findIndex(s => s.id === a.session_id) - sessions.findIndex(s => s.id === b.session_id))
    const metric = await database.rows('body_metrics').where('date').belowOrEqual(date).last()
    const session = schemas.workout_sessions.parse({ id: crypto.randomUUID(), started_at: new Date().toISOString(), program_week_id: weekId, day_type: day, date, completed: false, bodyweight_kg: metric?.weight_kg ?? null })
    const items = plans.map(plan => {
      const ex = exercises.find(e => e.id === plan.exercise_id)!
      const entries = Array.from({ length: plan.sets }, (_, i) => (ex.unilateral ? ['left', 'right'] as const : ['both'] as const).map(side => ({ id: crypto.randomUUID(), set_no: i + 1, side, ...entryTarget(plan, ex, latestSets.find(s => s.exercise_id === ex.id && s.side === side)), done: false }))).flat()
      return { ...plan, id: crypto.randomUUID(), planned_exercise_id: plan.id, entries }
    }).map(({ program_week_id: _week, day_type: _day, ...item }) => { void [_week, _day]; return item })
    const draft = schemas.workout_drafts.parse({ id: session.id, session_id: session.id, items, bodyweight: session.bodyweight_kg == null ? '' : String(session.bodyweight_kg), fatigue: '', sleep_h: '', pains: [], timer: { ends_at: null, remaining_ms: 0, paused: false }, updated_at: new Date().toISOString() })
    await database.rows('workout_sessions').add(session)
    await database.rows('workout_drafts').add(draft)
    return draft.id
  })
}
export async function editEntry(draftId: string, itemId: string, entryId: string, values: Partial<Pick<DraftEntry, 'weight' | 'reps' | 'rir'>>, database: FitnessDB = db) {
  await mutateDraft(draftId, draft => {
    const entry = draft.items.find(i => i.id === itemId)?.entries.find(e => e.id === entryId)
    if (!entry || entry.done) throw new Error('已完成的組不能修改；請繼續下一組。')
    Object.assign(entry, values)
  }, database)
}
function numericInput(value: string, label: string): number {
  if (value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`請填寫有效的${label}。`)
  return Number(value)
}
export async function completeEntry(draftId: string, itemId: string, entryId: string, values: Pick<DraftEntry, 'weight' | 'reps' | 'rir'>, database: FitnessDB = db, now = Date.now()) {
  await database.transaction('rw', database.tables, async () => {
    const draft = await database.rows('workout_drafts').get(draftId)
    const item = draft?.items.find(i => i.id === itemId)
    const entry = item?.entries.find(e => e.id === entryId)
    if (!draft || !item || !entry) throw new Error('找不到這次訓練。')
    if (entry.done) return
    const row = schemas.workout_sets.parse({ id: entry.id, session_id: draft.session_id, planned_exercise_id: item.planned_exercise_id, exercise_id: item.exercise_id, set_no: entry.set_no, side: entry.side, weight_kg: numericInput(values.weight, '重量'), reps: numericInput(values.reps, '次數'), rir: values.rir })
    Object.assign(entry, values, { done: true })
    draft.timer = { ends_at: now + item.rest_sec * 1000, remaining_ms: item.rest_sec * 1000, paused: false }
    draft.updated_at = new Date(now).toISOString()
    await database.rows('workout_sets').put(row)
    await database.rows('workout_drafts').put(draft)
  })
}
export async function changeTimer(id: string, action: 'pause' | 'resume' | 'skip', database: FitnessDB = db, now = Date.now()) {
  await mutateDraft(id, draft => {
    const t = draft.timer
    if (action === 'skip') draft.timer = { ends_at: null, remaining_ms: 0, paused: false }
    if (action === 'pause' && !t.paused) draft.timer = { ends_at: null, remaining_ms: Math.max(0, (t.ends_at ?? now) - now), paused: true }
    if (action === 'resume' && t.paused) draft.timer = { ends_at: now + t.remaining_ms, remaining_ms: t.remaining_ms, paused: false }
  }, database)
}
export async function replaceExercise(draftId: string, itemId: string, alternativeId: string, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const draft = await database.rows('workout_drafts').get(draftId)
    const item = draft?.items.find(i => i.id === itemId)
    if (!draft || !item) throw new Error('找不到訓練動作。')
    const allowed = await database.rows('exercise_alternatives').where('exercise_id').equals(item.exercise_id).toArray()
    const alternative = await database.rows('exercises').get(alternativeId)
    if (!alternative || !allowed.some(a => a.alt_exercise_id === alternativeId)) throw new Error('請選擇動作庫中的替代動作。')
    const otherBack = (await database.rows('exercises').toArray()).some(ex => ex.loads_lower_back && draft.items.some(i => i.id !== item.id && i.exercise_id === ex.id))
    if (alternative.loads_lower_back && otherBack) throw new Error('同一天最多一個壓下背動作。')
    const done = item.entries.filter(e => e.done)
    const pending = item.entries.filter(e => !e.done)
    const pendingNumbers = [...new Set(pending.map(e => e.set_no))]
    const originalExercise = await database.rows('exercises').get(item.exercise_id)
    if (!pendingNumbers.length) throw new Error('這個動作已全部完成。')
    const next = { ...item, id: crypto.randomUUID(), exercise_id: alternative.id, target_weight_kg: null, entries: pendingNumbers.flatMap(set_no => (alternative.unilateral ? originalExercise?.unilateral ? pending.filter(e => e.set_no === set_no).map(e => e.side) : ['left', 'right'] as const : ['both'] as const).map(side => ({ id: crypto.randomUUID(), set_no, side, ...entryTarget({ ...item, target_weight_kg: null }, alternative), done: false }))) }
    // 已完成的原動作仍保留，替換只影響本次尚未完成的組。
    draft.updated_at = new Date().toISOString()
    draft.items = draft.items.flatMap(i => i.id !== item.id ? [i] : done.length ? [{ ...i, entries: done }, next] : [next])
    await database.rows('workout_drafts').put(draft)
    await database.rows('plan_changes').add({ id: crypto.randomUUID(), planned_exercise_id: item.planned_exercise_id, change: { scope: 'session', session_id: draft.session_id, from_exercise_id: item.exercise_id, to_exercise_id: alternative.id }, applied_at: new Date().toISOString() })
  })
}
export async function finishWorkout(id: string, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const draft = await database.rows('workout_drafts').get(id)
    const session = draft && await database.rows('workout_sessions').get(draft.session_id)
    if (!draft || !session) throw new Error('找不到進行中的訓練。')
    const sets = await database.rows('workout_sets').where('session_id').equals(session.id).toArray()
    if (!sets.length) throw new Error('請至少完成一組，或到訓練歷史刪除此紀錄。')
    const exercises = await database.rows('exercises').toArray()
    const needsBodyweight = sets.some(s => ['bodyweight', 'assisted'].includes(exercises.find(e => e.id === s.exercise_id)!.load_type))
    const bodyweight = draft.bodyweight.trim() ? numericInput(draft.bodyweight, '體重') : null
    if (needsBodyweight && !bodyweight) throw new Error('徒手或輔助動作需要本次體重才能計算容量，請填寫體重。')
    const next = schemas.workout_sessions.parse({ ...session, fatigue: numericInput(draft.fatigue, '疲勞（1–10）'), sleep_h: numericInput(draft.sleep_h, '睡眠時數'), bodyweight_kg: bodyweight, completed: draft.items.every(i => i.entries.every(e => e.done)) })
    const pains = draft.pains.map(p => schemas.pain_reports.parse({ id: p.id, session_id: session.id, body_part: p.body_part.trim(), score: numericInput(p.score, '疼痛分數'), sharp: p.sharp, exercise_id: p.exercise_id }))
    await database.rows('workout_sessions').put(next)
    if (pains.length) await database.rows('pain_reports').bulkAdd(pains)
    await database.rows('workout_drafts').delete(draft.id)
  })
}
export async function deleteWorkout(id: string, database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    const sets = await database.rows('workout_sets').where('session_id').equals(id).toArray()
    const pains = await database.rows('pain_reports').where('session_id').equals(id).toArray()
    const deleted = new Set([id, ...sets.map(s => s.id), ...pains.map(p => p.id)])
    await database.rows('import_links').filter(l => deleted.has(l.entity_id)).delete()
    await database.rows('workout_sets').where('session_id').equals(id).delete()
    await database.rows('pain_reports').where('session_id').equals(id).delete()
    await database.rows('workout_drafts').where('session_id').equals(id).delete()
    await database.rows('workout_sessions').delete(id)
  })
}
