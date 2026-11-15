import { db, type FitnessDB } from './index'
import { schemas, type Row } from './schema'
import { applyBackScore } from './flow'
import { entryTarget } from '../lib/rules/workout'

type ExtraItem = { exerciseId: string; sets: number; reps?: number; weight?: number }
const byDate = (a: Row<'workout_sessions'>, b: Row<'workout_sessions'>) =>
  b.date.localeCompare(a.date) || (b.started_at ?? '').localeCompare(a.started_at ?? '')
export async function addExtraExercises(id: string, item: ExtraItem | 'copy', score = 0, database: FitnessDB = db) {
  return database.transaction('rw', database.tables, async () => {
    const draft = await database.rows('workout_drafts').get(id)
    const session = draft && await database.rows('workout_sessions').get(draft.session_id)
    if (!draft || session?.day_type !== 'extra' || !session.program_week_id) throw new Error('請先開始補量日。')
    const weekId = session.program_week_id
    const sessions = (await database.rows('workout_sessions').toArray()).filter(s => s.id !== id && s.date <= session.date).sort(byDate)
    const sets = await database.rows('workout_sets').toArray()
    const library = await database.rows('exercises').toArray()
    const latest = (exerciseId: string, side?: Row<'workout_sets'>['side']) => {
      for (const previous of sessions) {
        const found = sets.filter(s => s.session_id === previous.id && s.exercise_id === exerciseId && (side == null || s.side === side)).sort((a,b)=>b.set_no-a.set_no)[0]
        if (found) return found
      }
    }
    const previous = sessions.find(s => s.day_type === 'extra' && sets.some(set => set.session_id === s.id))
    const previousSets = sets.filter(s => s.session_id === previous?.id)
    if (item === 'copy' && (draft.items.length || !previousSets.length)) throw new Error('只有空白補量日可複製，且至少需有一次補量日實績。')
    const previousPlans = await database.rows('planned_exercises').where('program_week_id').equals(previous?.program_week_id ?? '').toArray()
    const source = [...previousSets].sort((a,b)=>(previousPlans.find(p=>p.id===a.planned_exercise_id)?.order_no??0)-(previousPlans.find(p=>p.id===b.planned_exercise_id)?.order_no??0)||a.set_no-b.set_no)
    const choices: ExtraItem[] = item === 'copy' ? [...new Set(source.map(s => s.exercise_id))].map(exerciseId => {
      const work = source.filter(s => s.exercise_id === exerciseId)
      return { exerciseId, sets: new Set(work.map(s => s.set_no)).size }
    }) : [item]
    const plans = await database.rows('planned_exercises').where('program_week_id').equals(weekId).toArray()
    let order = Math.max(0, ...plans.filter(p => p.day_type === 'extra').map(p => p.order_no))
    let hasBack = false
    for (const choice of choices) {
      const exercise = library.find(e => e.id === choice.exerciseId)
      if (!exercise || draft.items.some(i => i.exercise_id === exercise.id || i.back_original?.exercise_id === exercise.id)) throw new Error('請選擇尚未加入的動作。')
      if (exercise.loads_lower_back) {
        if (hasBack || draft.items.some(i => library.find(e=>e.id===(i.back_original?.exercise_id??i.exercise_id))?.loads_lower_back)) throw new Error('同一天最多一個壓下背動作。')
        hasBack = true
      }
      if (!Number.isInteger(choice.sets) || choice.sets < 1 || choice.sets > 30) throw new Error('請填 1–30 組。')
      const copied = source.filter(s => s.exercise_id === exercise.id)
      const logged = item === 'copy' ? copied.at(-1) : latest(exercise.id)
      const reps = choice.reps ?? (logged?.reps || 10)
      const plan = schemas.planned_exercises.parse({ id: crypto.randomUUID(), program_week_id: weekId, day_type: 'extra', extra_session_id: id,
        order_no: ++order, exercise_id: exercise.id, sets: choice.sets, base_sets: choice.sets, base_rir: 2, rep_min: reps, rep_max: reps, target_rir: 2, rest_sec: 90, target_weight_kg: choice.weight ?? logged?.weight_kg ?? null })
      const previousNumbers = [...new Set(copied.map(s => s.set_no))]
      const entries = Array.from({ length: plan.sets }, (_, i) => (exercise.unilateral ? ['left','right'] as const : ['both'] as const).map(side => {
        const row = item === 'copy' ? copied.find(s=>s.set_no===previousNumbers[i]&&s.side===side) ?? logged : latest(exercise.id, side) ?? logged
        const values = entryTarget({ ...plan, target_weight_kg: choice.weight ?? row?.weight_kg ?? plan.target_weight_kg }, exercise)
        return { ...values, reps: String(choice.reps ?? (row?.reps || reps)), id: crypto.randomUUID(), set_no: i+1, side, done: false }
      })).flat()
      const { program_week_id: _week, day_type: _day, extra_session_id: _session, ...fields } = plan
      void [_week, _day, _session]
      draft.items.push({ ...fields, id: crypto.randomUUID(), planned_exercise_id: plan.id, entries })
      await database.rows('planned_exercises').add(plan)
      await database.rows('plan_changes').add({ id: crypto.randomUUID(), planned_exercise_id: plan.id, change: { scope: 'extra_setup', before: null, after: plan }, applied_at: new Date().toISOString() })
    }
    await database.rows('workout_drafts').put(schemas.workout_drafts.parse(draft))
    if (hasBack) await applyBackScore(id, score, database)
  })
}
