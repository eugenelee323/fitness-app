import type { Row } from '../../db/schema'

export const inbodyFields = {
  weight_kg: '體重', skeletal_muscle_kg: '骨骼肌', body_fat_kg: '體脂肪', body_fat_pct: '體脂率',
  visceral_fat_level: '內臟脂肪', bmr_kcal: '基礎代謝', note: '備註',
} as const
export const inbodyMain = ['weight_kg', 'skeletal_muscle_kg', 'body_fat_kg', 'body_fat_pct'] as const
type InBody = Row<'inbody_records'>
export const elapsedDays = (before: string, after: string) => (Date.parse(after) - Date.parse(before)) / 86400000
export const inbodyDifference = (previous: InBody, latest: InBody, key: typeof inbodyMain[number]) =>
  Math.round((latest[key] - previous[key]) * 1e6) / 1e6
export function recentInbody(rows: InBody[], end: string) {
  return rows.filter(r => r.date <= end).sort((a,b) => b.date.localeCompare(a.date))
}
export function inbodyComparison(rows: InBody[], end: string) {
  const [latest, ...previous] = recentInbody(rows, end)
  if (!latest) return null
  const baseline = previous.filter(r => {
    const days = elapsedDays(r.date, latest.date)
    return days >= 10 && days <= 21
  }).sort((a,b) => Math.abs(elapsedDays(a.date, latest.date) - 14) - Math.abs(elapsedDays(b.date, latest.date) - 14))[0]
  return baseline ? { latest, baseline } : null
}
export function inbodyText(row: InBody, maxDigits = 3) {
  const n = (value: number) => value.toLocaleString('zh-TW', {maximumFractionDigits:maxDigits})
  return `${row.date} 體重 ${n(row.weight_kg)} kg、骨骼肌 ${n(row.skeletal_muscle_kg)} kg、體脂肪 ${n(row.body_fat_kg)} kg、體脂率 ${n(row.body_fat_pct)}%`
}
