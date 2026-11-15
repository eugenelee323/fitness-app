import Dexie from 'dexie'
import { expect,it } from 'vitest'
import { FitnessDB, stores } from './index'
import { seedDatabase } from '../seed'
import { prepareBackup, readSnapshot, restoreBackup } from '../lib/backup'
import { settleWeek } from '../lib/weekly'
import { clearMealRecords, saveMeasurements, saveNutritionTarget } from './inbody'
import { correctExercise } from './corrections'

it('清除飲食只移除兩張表；既有報告即使重新結算仍保留飲食快照',async()=>{
  const database = new FitnessDB('clear-'+crypto.randomUUID())
  try {
    await seedDatabase(database)
    await saveMeasurements([{ date:'2026-11-14',meal_type:'breakfast',entry_source:'paste',items:[{name:'測試優格',grams:100,kcal:70,protein_g:6,carbs_g:8,fat_g:1,is_estimate:true}] }], [{date:'2026-11-14',weight_kg:70,skeletal_muscle_kg:30,body_fat_kg:15,body_fat_pct:21.4}],database)
    await saveNutritionTarget({kcal:2500,protein_g:150,carbs_g:300,fat_g:70},database)
    expect(await database.rows('nutrition_targets').count()).toBe(1)
    const date = new Date('2026-11-15T15:00:00Z')
    const analysisId = await settleWeek(1,false,database,date)
    const before = await readSnapshot(database)
    await expect(clearMealRecords({meals:1,items:0},database)).rejects.toThrow('筆數已變動')
    await clearMealRecords({meals:1,items:1},database)
    const after = await readSnapshot(database)
    for (const [name, rows] of Object.entries(after)) {
      if (name==='meals'||name==='meal_items') expect(rows).toEqual([])
      else if (name!=='app_meta') expect(rows).toEqual(before[name as keyof typeof before])
    }
    await settleWeek(1,true,database,date)
    expect((await database.rows('weekly_analyses').get(analysisId))?.metrics).toEqual(before.weekly_analyses[0].metrics)
  } finally { await database.delete() }
})

it('版本 7 與舊備份均修正 11/11 拉日重量和器材，並更新既有報告',async()=>{
  const database = new FitnessDB('migration-'+crypto.randomUUID())
  const target = new FitnessDB('restore-'+crypto.randomUUID())
  try {
    await seedDatabase(database)
    const [week] = await database.rows('program_weeks').orderBy('week_no').toArray()
    const library = await database.rows('exercises').toArray()
    const [dbCurl, pullup, cable] = ['hammer_curl_db','pullup','hammer_curl_cable'].map(code=>library.find(e=>e.code===code)!)
    const sessionId = crypto.randomUUID()
    await database.rows('workout_sessions').add({id:sessionId,date:'2026-11-11',day_type:'pull',completed:true,program_week_id:week.id,bodyweight_kg:70})
    const curlId=crypto.randomUUID(), pullId=crypto.randomUUID(), validId=crypto.randomUUID()
    await database.rows('workout_sets').bulkAdd([
      {id:curlId,session_id:sessionId, exercise_id:dbCurl.id,set_no:1,side:'both',weight_kg:25,reps:10,rir:2},
      {id:pullId,session_id:sessionId, exercise_id:pullup.id,set_no:1,side:'both',weight_kg:72,reps:8,rir:2},
      {id:validId,session_id:sessionId, exercise_id:pullup.id,set_no:2,side:'both',weight_kg:5,reps:6,rir:2},
    ])
    const reportId=await settleWeek(1,false,database,new Date('2026-11-15T15:00:00Z'))
    const snapshot = await readSnapshot(database)
    const { inbody_records: ignored, ...legacy } = snapshot
    void ignored
    legacy.exercises = legacy.exercises.filter(e=>e.id!==cable.id)
    legacy.exercise_alternatives = legacy.exercise_alternatives.filter(e=>e.exercise_id!==cable.id&&e.alt_exercise_id!==cable.id)
    legacy.planned_exercises = legacy.planned_exercises.map(p=>p.exercise_id===cable.id?{...p,exercise_id:dbCurl.id}:p)
    await restoreBackup(prepareBackup(JSON.stringify({version:1,exportedAt:'2026-11-15T15:00:00Z',rulesVersion:'old',tables:legacy})),target)
    await database.delete()
    const old = new Dexie(database.name)
    const { inbody_records: schema, ...oldStores } = stores
    void schema
    old.version(7).stores(oldStores)
    for (const [table, rows] of Object.entries(legacy)) if(rows.length) await old.table(table).bulkAdd(rows)
    old.close()
    await database.open()
    for (const migrated of [database,target]) {
      const newCable=await migrated.rows('exercises').where('code').equals('hammer_curl_cable').first()
      expect(await migrated.rows('workout_sets').get(curlId)).toMatchObject({exercise_id:newCable?.id,weight_kg:25,reps:10})
      expect(await migrated.rows('workout_sets').get(pullId)).toMatchObject({weight_kg:0})
      expect(await migrated.rows('workout_sets').get(validId)).toMatchObject({weight_kg:5})
      const report=await migrated.rows('weekly_analyses').get(reportId)
      expect(report?.metrics).toMatchObject({volume:1260, exercises:expect.arrayContaining([expect.objectContaining({exercise:expect.objectContaining({code:'pullup'}),best:95})])})
      await correctExercise(migrated,sessionId,newCable!.id,dbCurl.id)
      expect((await migrated.rows('weekly_analyses').get(reportId))?.metrics).toMatchObject({volume:1510})
    }
  } finally { await database.delete(); await target.delete() }
})
