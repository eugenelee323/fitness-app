import { z } from 'zod'
import { mealValueSchema, type Row } from '../../db/schema'
export const mealLabels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' } as const
export type MealType = Row<'meals'>['meal_type']
export type MealValue = z.infer<typeof mealValueSchema>
export interface ParsedLine { lineNumber: number; text: string; item: MealValue | null; error: string | null }
const quantity = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
function numericColumn(text: string, prefix: string, suffix: string): number | null {
  const match = text.match(new RegExp(`^(?:${prefix}\\s*:?\\s*)?(${quantity})(?:\\s*${suffix})?$`, 'i'))
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}
export function parseMealText(raw: string) {
  const source = raw.replace(/^\uFEFF/, '').split(/\r?\n/)
  const headerIndex = source.findIndex(line => line.trim())
  const headerText = (source[headerIndex] ?? '').normalize('NFKC').trim()
  const headerMatch = headerText.match(/^#\s*餐點\s*:?\s*(\d{4}-\d{2}-\d{2})\s*:?\s*(早餐|午餐|晚餐|點心)\s*$/)
  const type = headerMatch ? (Object.keys(mealLabels) as MealType[]).find(key => mealLabels[key] === headerMatch[2]) : undefined
  const header = headerMatch && type && z.iso.date().safeParse(headerMatch[1]).success ? { date: headerMatch[1], meal_type: type } : null
  const lines: ParsedLine[] = []
  for (let i = Math.max(0, headerIndex + 1); i < source.length; i++) {
    if (!source[i].trim()) continue
    const columns = source[i].normalize('NFKC').trim().split('|').map(value => value.trim())
    let item: MealValue | null = null
    let error: string | null = null
    if (columns.length !== 6) error = '每行需要 6 欄：名稱、份量、熱量、蛋白質、碳水、脂肪。'
    else {
      const serving = columns[1].match(new RegExp(`^(?:份量\\s*:?\\s*)?(${quantity})\\s*(g|ml|公克|毫升)$`, 'i'))
      const parsed = mealValueSchema.safeParse({ name: columns[0], grams: serving ? Number(serving[1]) : null, kcal: numericColumn(columns[2], '(?:kcal|熱量)', 'kcal'), protein_g: numericColumn(columns[3], '(?:P|蛋白質)', 'g'), carbs_g: numericColumn(columns[4], '(?:C|碳水)', 'g'), fat_g: numericColumn(columns[5], '(?:F|脂肪)', 'g'), is_estimate: true })
      if (parsed.success) item = parsed.data
      else error = '請填有效名稱與非負營養數值；份量須大於 0，單位使用 g 或 ml。'
    }
    lines.push({ lineNumber: i + 1, text: source[i], item, error })
  }
  return { header, headerError: header ? null : '第一行請使用「#餐點 YYYY-MM-DD 早餐／午餐／晚餐／點心」並填有效日期。', lines, valid: !!header && lines.length > 0 && lines.every(line => !!line.item) }
}
export function parseMealsText(raw:string){
  const rows=raw.replace(/^\uFEFF/,'').split(/\r?\n/)
  const starts=rows.flatMap((line,index)=>/^#\s*餐點/.test(line.normalize('NFKC').trim())?[index]:[])
  const first=rows.findIndex(line=>line.trim())
  if(!starts.length || first>=0&&first<starts[0])starts.unshift(Math.max(0,first))
  const blocks=starts.map((start,index)=>{
    const result=parseMealText(rows.slice(start,starts[index+1]??rows.length).join('\n'))
    return {...result,startLine:start+1,lines:result.lines.map(line=>({...line,lineNumber:line.lineNumber+start}))}
  })
  return {blocks,valid:blocks.length>0&&blocks.every(block=>block.valid)}
}
