import { zipSync, strToU8 } from 'fflate'
import { db, type FitnessDB } from '../db'
import { schemas, tableNames, type TableName } from '../db/schema'
import { readSnapshot, type Snapshot } from './backup'
import { taipeiDate } from './time'
/** 所有欄位加引號；文字公式加前置單引號，避免 Excel 當作公式執行。 */
export function csvCell(value: unknown): string {
  let text=value == null?'':typeof value==='object'?JSON.stringify(value):String(value)
  if(typeof value==='string' && /^\s*[=+@-]/u.test(text))text="'"+text
  return `"${text.replaceAll('"','""')}"`
}
export function tableCsv(name: TableName, rows: Record<string,unknown>[]): string {
  const columns=Object.keys(schemas[name].shape)
  return '\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n'
}
export function snapshotZip(snapshot: Snapshot): Uint8Array {
  return zipSync(Object.fromEntries(tableNames.map(name=>[`${name}.csv`,strToU8(tableCsv(name,snapshot[name]))])),{level:6})
}
export async function createCsvZip(database: FitnessDB=db, now=new Date()) {
  return {filename:`fitness-csv-${taipeiDate(now).replaceAll('-','')}.zip`,bytes:snapshotZip(await readSnapshot(database))}
}
