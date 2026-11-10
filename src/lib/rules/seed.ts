import type { Row } from '../../db/schema'

/** 預定減量週：組數減半（奇數向上取整），RIR 3–4 以 3 為目標。 */
export function scheduledSets(sets: number, deload: boolean): number {
  return deload ? Math.ceil(sets * 0.5) : sets
}
export function scheduledRir(rir: number, deload: boolean): number {
  return deload ? 3 : rir
}



/** 舊資料／舊備份沒有正常週基準時，從同菜單最近正常週補回，不反推奇數組數。 */
export function withPlanBaselines(weeks: Row<'program_weeks'>[], plans: Row<'planned_exercises'>[]) {
  return {
    weeks: weeks.map(week => week.is_deload && week.deload_origin_week == null ? { ...week, deload_origin_week: week.week_no } : { ...week }),
    plans: plans.map(plan => {
      const week = weeks.find(w => w.id === plan.program_week_id)
      const previous = weeks.filter(w => w.program_id === week?.program_id && w.menu === week?.menu && w.week_no < (week?.week_no ?? 0) && !w.is_deload).sort((a, b) => b.week_no - a.week_no)[0]
      const regular = week?.is_deload ? plans.find(p => p.program_week_id === previous?.id && p.day_type === plan.day_type && p.order_no === plan.order_no) : plan
      return { ...plan, base_sets: plan.base_sets ?? regular?.sets ?? plan.sets, base_rir: plan.base_rir ?? regular?.target_rir ?? plan.target_rir }
    }),
  }
}
