import type { Table, Transaction } from 'dexie'
import type { FitnessDB } from './index'
import type { Row } from './schema'
import catalog from '../seed/catalog.json'
import { aggregateWeek } from '../lib/rules/weekly'
import { looksLikeBodyweight } from '../lib/rules/loadDisplay'

export async function connectHammerAlternatives(table: Table<Row<'exercise_alternatives'>>, exercises: Row<'exercises'>[]) {
  const cable = exercises.find(e => e.code === 'hammer_curl_cable')
  if (!cable) return
  const related = exercises.filter(e => ['hammer_curl_db', 'incline_curl_db', 'curl_mc'].includes(e.code))
  if (related.length) await table.bulkPut(related.flatMap(e => [
    { exercise_id: e.id, alt_exercise_id: cable.id },
    { exercise_id: cable.id, alt_exercise_id: e.id },
  ]))
}

export async function refreshTrainingReports(tx: Transaction, weekIds: Set<string>) {
  if (!weekIds.size) return
  const weeks: Row<'program_weeks'>[] = await tx.table('program_weeks').toArray()
  const plans: Row<'planned_exercises'>[] = await tx.table('planned_exercises').toArray()
  const drafts: Row<'workout_drafts'>[] = await tx.table('workout_drafts').toArray()
  const sessions: Row<'workout_sessions'>[] = (await tx.table('workout_sessions').toArray()).filter(s => !drafts.some(d => d.session_id === s.id))
  const exercises: Row<'exercises'>[] = await tx.table('exercises').toArray()
  const alternatives: Row<'exercise_alternatives'>[] = await tx.table('exercise_alternatives').toArray()
  const sets: Row<'workout_sets'>[] = await tx.table('workout_sets').toArray()
  const pains: Row<'pain_reports'>[] = await tx.table('pain_reports').toArray()
  for (const programId of new Set(weeks.filter(w => weekIds.has(w.id)).map(w => w.program_id))) {
    const program: Row<'programs'> | undefined = await tx.table('programs').get(programId)
    if (!program) continue
    const programWeeks = weeks.filter(w => w.program_id === programId)
    const first = Math.min(...programWeeks.filter(w => weekIds.has(w.id)).map(w => w.week_no))
    const reports: Row<'weekly_analyses'>[] = await tx.table('weekly_analyses').where('program_id').equals(programId).toArray()
    for (const report of reports.filter(r => r.week_no >= first && programWeeks.some(w => w.week_no === r.week_no))) {
      const training = aggregateWeek({ program, weeks: programWeeks, plans, sessions, exercises, alternatives, sets, pains }, report.week_no)
      const old = report.metrics
      const metrics = JSON.parse(JSON.stringify({ ...(old && typeof old === 'object' && !Array.isArray(old) ? old : {}), ...training }))
      await tx.table('weekly_analyses').put({ ...report, metrics })
    }
  }
}

export async function migrateWorkoutRecords(tx: Transaction) {
  const exercises: Row<'exercises'>[] = await tx.table('exercises').toArray()
  if (!exercises.length) return
  let cable = exercises.find(e => e.code === 'hammer_curl_cable')
  if (!cable) {
    const definition = catalog.exercises.find(e => e.code === 'hammer_curl_cable')!
    cable = { ...definition, id: crypto.randomUUID() } as Row<'exercises'>
    await tx.table('exercises').add(cable)
    exercises.push(cable)
  }
  await connectHammerAlternatives(tx.table('exercise_alternatives'), exercises)
  const dumbbell = exercises.find(e => e.code === 'hammer_curl_db')
  const pullup = exercises.find(e => e.code === 'pullup')
  const weeks: Row<'program_weeks'>[] = await tx.table('program_weeks').toArray()
  const plans: Row<'planned_exercises'>[] = await tx.table('planned_exercises').toArray()
  const drafts: Row<'workout_drafts'>[] = await tx.table('workout_drafts').toArray()
  for (const plan of plans.filter(p => p.day_type === 'pull' && p.order_no === 8 && weeks.some(w => w.id === p.program_week_id && w.menu === 'B'))) {
    const old = exercises.find(e => e.id === plan.exercise_id)
    if (old?.code !== 'hammer_curl_db' && old?.code !== catalog.a.find(a => a.day_type === 'pull' && a.order_no === 8)?.code) continue
    if (drafts.some(d => d.items.some(i => i.planned_exercise_id === plan.id))) continue
    await tx.table('planned_exercises').put({ ...plan, exercise_id: cable.id })
    await tx.table('plan_changes').add({ id: crypto.randomUUID(), planned_exercise_id: plan.id, change: { scope: 'catalog_migration', from_exercise_id: plan.exercise_id, to_exercise_id: cable.id }, applied_at: new Date().toISOString() })
  }
  const affected = new Set<string>()
  const sessions: Row<'workout_sessions'>[] = await tx.table('workout_sessions').where('date').equals('2026-11-11').toArray()
  for (const session of sessions.filter(s => s.day_type === 'pull')) {
    const fallback: Row<'body_metrics'> | undefined = await tx.table('body_metrics').where('date').equals(session.date).first()
    const measurement: Row<'inbody_records'> | undefined = await tx.table('inbody_records').get(session.date)
    const body = session.bodyweight_kg ?? measurement?.weight_kg ?? fallback?.weight_kg
    const sets: Row<'workout_sets'>[] = await tx.table('workout_sets').where('session_id').equals(session.id).toArray()
    const changed = sets.flatMap(set => set.exercise_id === dumbbell?.id ? [{ ...set, exercise_id: cable.id }]
      : set.exercise_id === pullup?.id && looksLikeBodyweight(set.weight_kg, body) ? [{ ...set, weight_kg: 0 }] : [])
    if (!changed.length) continue
    await tx.table('workout_sets').bulkPut(changed)
    if (!session.bodyweight_kg && body != null) await tx.table('workout_sessions').put({ ...session, bodyweight_kg: body })
    const draft = drafts.find(d => d.session_id === session.id)
    if (draft) {
      for (const item of draft.items) {
        if (item.exercise_id === dumbbell?.id) item.exercise_id = cable.id
        if (item.exercise_id === pullup?.id) for (const entry of item.entries) if (looksLikeBodyweight(Number(entry.weight), body)) entry.weight = '0'
      }
      if (!draft.bodyweight && body != null) draft.bodyweight = String(body)
      await tx.table('workout_drafts').put(draft)
    }
    if (session.program_week_id) affected.add(session.program_week_id)
  }
  await refreshTrainingReports(tx, affected)
}

export async function correctExercise(database: FitnessDB, sessionId: string, from: string, to: string) {
  await database.transaction('rw', database.tables, async tx => {
    const session = await database.rows('workout_sessions').get(sessionId)
    if (!session || from === to || !await database.rows('exercises').get(to)) throw new Error('請選擇另一個動作。')
    if (await database.rows('workout_drafts').where('session_id').equals(sessionId).count()) throw new Error('請先結束訓練。')
    const rows = await database.rows('workout_sets').where('[session_id+exercise_id]').equals([sessionId, from]).toArray()
    if (!rows.length) throw new Error('找不到要更換的紀錄。')
    await database.rows('workout_sets').bulkPut(rows.map(row => ({ ...row, exercise_id: to })))
    await refreshTrainingReports(tx, new Set(session.program_week_id ? [session.program_week_id] : []))
  })
}
