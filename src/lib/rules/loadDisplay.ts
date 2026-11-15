import type { Row } from '../../db/schema'

export type LoadType = Row<'exercises'>['load_type']
export function loadLabel(type: LoadType) {
  if (type === 'bodyweight') return '加重（kg）'
  if (type === 'dumbbell_pair' || type === 'dumbbell_single') return '單支重量（kg）'
  if (type === 'cable' || type === 'machine') return '配重（kg）'
  return type === 'assisted' ? '輔助（kg）' : '重量（kg）'
}
export function displayLoad(type: LoadType | undefined, kg: number | null | undefined, unit = true, maximumFractionDigits = 2) {
  if (kg == null) return '未填'
  const value = kg.toLocaleString('zh-TW', { maximumFractionDigits })
  if (type === 'bodyweight') return kg === 0 ? '體重' : `體重 + ${value} kg`
  return unit ? `${value} kg` : value
}
export function looksLikeBodyweight(kg: number, body: number | null | undefined) {
  return body != null && body > 0 && kg > 0 && Math.abs(kg - body) <= 3
}
