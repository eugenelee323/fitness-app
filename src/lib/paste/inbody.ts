import { schemas, type Row } from '../../db/schema'
import { inbodyFields } from '../rules/inbody'
import { parseMealsText } from './index'

export function parseInbodyLine(raw: string): Row<'inbody_records'> | null {
  const [header, ...columns] = raw.normalize('NFKC').trim().split('|').map(s => s.trim())
  const match = header.match(/^#\s*inbody\s*:?\s*(\d{4}-\d{2}-\d{2})$/i)
  if (!match) return null
  const values: Record<string, unknown> = { date: match[1] }
  for (const column of columns) {
    const field = Object.entries(inbodyFields).find(([, label]) => column.startsWith(label))
    if (!field || field[0] in values) return null
    const value = column.slice(field[1].length).replace(/^\s*:?\s*/, '').trim()
    if (field[0] === 'note') values.note = value
    else {
      const number = value.match(/^(\d+(?:\.\d+)?)\s*(?:kg|%|kcal)?$/i)
      if (!number) return null
      values[field[0]] = Number(number[1])
    }
  }
  const parsed = schemas.inbody_records.safeParse(values)
  return parsed.success ? parsed.data : null
}

export function parseCombinedPaste(raw: string) {
  const lines = raw.split(/\r?\n/)
  const inbody = lines.flatMap((text, i) => /^\s*#\s*inbody/i.test(text.normalize('NFKC'))
    ? [{ text, lineNumber: i + 1, record: parseInbodyLine(text) }] : [])
  const counts = new Map<string, number>()
  for (const { record } of inbody) if (record) counts.set(record.date, (counts.get(record.date) ?? 0) + 1)
  const measurements = inbody.map(row => ({ ...row, error: !row.record ? 'InBody 格式或數值有誤' : counts.get(row.record.date)! > 1 ? '同一日期只能有一筆 InBody' : null }))
  const excluded = new Set(inbody.map(row => row.lineNumber))
  const mealText = lines.map((line,i) => excluded.has(i+1) ? '' : line).join('\n')
  const meals = mealText.trim() ? parseMealsText(mealText) : { blocks: [], valid: true }
  return { blocks: meals.blocks, inbody: measurements, valid: meals.valid && measurements.every(row => !row.error) && (inbody.length > 0 || meals.blocks.length > 0) }
}
