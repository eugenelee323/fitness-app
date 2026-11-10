import catalog from './catalog.json'
import { db, type FitnessDB } from '../db'
import { schemas, type Row } from '../db/schema'
import { scheduledRir, scheduledSets } from '../lib/rules/seed'

/** seed 僅含通用計畫，個人資料只能透過檔案匯入。 */
export async function seedDatabase(database: FitnessDB = db) {
  await database.transaction('rw', database.tables, async () => {
    if (await database.rows('programs').count()) return
    const exercises = catalog.exercises.map(ex => schemas.exercises.parse({ ...ex, id: crypto.randomUUID() }))
    const byCode = new Map(exercises.map(ex => [ex.code, ex.id]))
    const exerciseId = (code: string) => {
      const value = byCode.get(code)
      if (!value) throw new Error('內建動作不存在')
      return value
    }
    await database.rows('exercises').bulkAdd(exercises)
    const alternatives: Row<'exercise_alternatives'>[] = []
    catalog.a.forEach((a, index) => {
      const b = catalog.bCodes[index]
      if (a.code === b) return
      for (const [from, to] of [[a.code, b], [b, a.code]]) {
        alternatives.push({ exercise_id: exerciseId(from), alt_exercise_id: exerciseId(to), reason: a.code === 'rdl_bb' ? '腰部安全替代；腰部疼痛時改用俯臥腿彎舉。' : '同順序 A／B 菜單替代動作。' })
      }
    })
    await database.rows('exercise_alternatives').bulkAdd(alternatives)
    const program = schemas.programs.parse({ id: crypto.randomUUID(), start_date: '2026-11-09', weeks: 12, status: 'active' })
    await database.rows('programs').add(program)
    for (let weekNo = 1; weekNo <= 12; weekNo++) {
      const week = schemas.program_weeks.parse({ id: crypto.randomUUID(), program_id: program.id, week_no: weekNo, menu: [1, 2, 5, 6, 9, 10].includes(weekNo) ? 'A' : 'B', phase: Math.ceil(weekNo / 4), is_deload: [4, 8, 12].includes(weekNo) })
      if (week.is_deload) week.deload_origin_week = week.week_no
      await database.rows('program_weeks').add(week)
      const planned = catalog.a.map((a, index) => schemas.planned_exercises.parse({
        id: crypto.randomUUID(), program_week_id: week.id, day_type: a.day_type,
        order_no: a.order_no, exercise_id: exerciseId(week.menu === 'A' ? a.code : catalog.bCodes[index]),
        sets: scheduledSets(a.sets, week.is_deload), rep_min: a.rep_min, rep_max: a.rep_max,
        base_sets: a.sets, base_rir: a.target_rir,
        target_rir: scheduledRir(a.target_rir, week.is_deload), rest_sec: a.rest_sec,
        // 第 2 週以規格目標為準；後續週需依實際紀錄與已接受建議決定。
        target_weight_kg: weekNo === 2 ? a.target_weight_kg : null,
      }))
      await database.rows('planned_exercises').bulkAdd(planned)
    }
  })
}
