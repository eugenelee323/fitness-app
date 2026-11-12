import { afterEach,beforeEach,expect,it } from 'vitest'
import { FitnessDB } from './index'
import { seedDatabase } from '../seed'
import { beginWorkout,applyBackScore,restoreBackItem,undoSet } from './flow'
import { completeEntry } from './workouts'
import { saveMealsBatch } from './meals'
import { saveWeeklyCheckin } from './checkin'
import { createBackup,prepareBackup,restoreBackup,readSnapshot } from '../lib/backup'
let database:FitnessDB
beforeEach(async()=>{database=new FitnessDB('flow-'+crypto.randomUUID());await seedDatabase(database)})
afterEach(async()=>{await database.delete()})
it('練前 5 分換腿彎舉、可改回；只調整未完成組，分數與睡眠持續保存',async()=>{
  const week=(await database.rows('program_weeks').orderBy('week_no').first())!
  const id=await beginWorkout(week.id,'pull',7.5,5,database,'2026-11-11')
  let draft=(await database.rows('workout_drafts').get(id))!,item=draft.items.find(i=>i.back_original)!
  expect((await database.rows('exercises').get(item.exercise_id))!.code).toBe('leg_curl_lying');expect(item.entries[0].weight).toBe('');expect(draft.sleep_h).toBe('7.5')
  expect(await database.rows('pain_reports').where('session_id').equals(id).first()).toMatchObject({score:5,body_part:'lower_back',phase:'pre'})
  await restoreBackItem(id,item.id,database);draft=(await database.rows('workout_drafts').get(id))!;item=draft.items.find(i=>i.id===item.id)!
  expect((await database.rows('exercises').get(item.exercise_id))!.code).toBe('rdl_bb')
  await completeEntry(id,item.id,item.entries[0].id,{weight:'60',reps:'10',rir:2},database,1000)
  await undoSet(id,database,3999);expect(await database.rows('workout_sets').count()).toBe(0)
  await completeEntry(id,item.id,item.entries[0].id,{weight:'60',reps:'10',rir:2},database,5000)
  await expect(undoSet(id,database,8001)).rejects.toThrow('超過')
  await applyBackScore(id,3,database);draft=(await database.rows('workout_drafts').get(id))!;expect(draft.items.some(i=>i.exercise_id===item.exercise_id&&i.entries.every(e=>e.done))).toBe(true);expect(await database.rows('workout_sets').count()).toBe(1)
  const backup=await createBackup(database);const before=await readSnapshot(database);await restoreBackup(prepareBackup(backup.content),database);expect(await readSnapshot(database)).toEqual(before)
})
it('多餐原子寫入與週日記錄可全略過，體態照保留在獨立表與備份',async()=>{
  const item={name:'合成測試餐',grams:100,kcal:100,protein_g:10,carbs_g:10,fat_g:2,is_estimate:true}
  await saveMealsBatch([{date:'2026-11-10',meal_type:'breakfast',items:[item],entry_source:'paste'},{date:'2026-11-11',meal_type:'dinner',items:[item],entry_source:'paste'}],database);expect(await database.rows('meals').count()).toBe(2)
  await expect(saveMealsBatch([{date:'2026-11-11',meal_type:'lunch',items:[{...item,grams:0}],entry_source:'paste'}],database)).rejects.toThrow();expect(await database.rows('meals').count()).toBe(2)
  await saveWeeklyCheckin({date:'2026-11-15'},undefined,database);expect(await database.rows('body_metrics').count()).toBe(0)
  const blob=new Blob([new Uint8Array([255,216,255,224,0,0,255,217])],{type:'image/jpeg'})
  await saveWeeklyCheckin({date:'2026-11-15',weight_kg:60,waist_cm:80},blob,database);expect(await database.rows('body_photos').count()).toBe(1)
  const backup=await createBackup(database);expect(prepareBackup(backup.content).tables.body_photos).toHaveLength(1)
  const small=await createBackup(database,new Date(),{includePhotos:false});expect(prepareBackup(small.content).tables.body_photos).toEqual([])
})
