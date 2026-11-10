import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { FitnessDB } from '../db'
import { schemas, tableNames } from '../db/schema'
import { fixtureId } from '../test/weeklyFixture'
import { csvCell, tableCsv, snapshotZip, createCsvZip } from './csv'
import { readSnapshot } from './backup'
let database:FitnessDB
beforeEach(()=>{database=new FitnessDB('csv-'+fixtureId())})
afterEach(async()=>{await database.delete()})
describe('Excel CSV ZIP',()=>{
  it('UTF-8 BOM、CRLF、完整欄位及中文引號換行均正確',()=>{
    expect(csvCell('中文, "食物"\n第二行')).toBe('"中文, ""食物""\n第二行"')
    expect(csvCell(null)).toBe('""');expect(csvCell(12.5)).toBe('"12.5"');expect(csvCell(false)).toBe('"false"')
    expect(csvCell(['胸','背'])).toBe('"[""胸"",""背""]"')
    const csv=tableCsv('body_metrics',[{id:fixtureId(),date:'2026-11-10',weight_kg:60,waist_cm:null}])
    expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"id","date","weight_kg","waist_cm","bodyfat_pct"\r\n');expect(csv).toContain('"60","",""\r\n')
  })
  it('文字公式會作為文字開啟，真正數值不被改寫',()=>{
    for(const text of ['=1+1','+1','-1','@SUM(A1)',' \t=1+1'])expect(csvCell(text)).toBe('"\''+text+'"')
    expect(csvCell(-1)).toBe('"-1"')
  })
  it('每張表都在 ZIP 中，空表仍有全部標頭；匯出不改備份時間',async()=>{
    await database.rows('foods').add(schemas.foods.parse({id:fixtureId(),name:'測試中文, "豆漿"\n備註',kcal_100g:50,protein_100g:5,carbs_100g:5,fat_100g:1,source:'custom'}))
    await database.rows('app_meta').put({key:'last_backup_at',value:'2026-11-01T00:00:00Z'})
    const before=await readSnapshot(database)
    const result=await createCsvZip(database,new Date('2026-11-10T16:00:00Z'))
    expect(result.filename).toBe('fitness-csv-20261111.zip')
    const files=unzipSync(result.bytes)
    expect(Object.keys(files).sort()).toEqual(tableNames.map(n=>n+'.csv').sort())
    for(const name of tableNames){const bytes=files[name+'.csv'];expect([...bytes.slice(0,3)]).toEqual([239,187,191]);const csv=new TextDecoder("utf-8",{ignoreBOM:true}).decode(bytes);expect(csv).toBe(tableCsv(name,before[name]));expect(csv).toContain(Object.keys(schemas[name].shape).map(csvCell).join(','))}
    expect(strFromU8(files['foods.csv'])).toContain('測試中文, ""豆漿""\n備註')
    expect(await readSnapshot(database)).toEqual(before)
    expect(unzipSync(snapshotZip(before))['foods.csv']).toEqual(files['foods.csv'])
  })
})

