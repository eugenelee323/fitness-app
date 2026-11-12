import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FitnessDB, stores } from './index'
import { seedDatabase } from '../seed'
import { startWorkout, completeEntry, mutateDraft, finishWorkout } from './workouts'
import { createBackup, readSnapshot, prepareBackup, restoreBackup } from '../lib/backup'
import { photoBlob, photoDataUrl } from '../lib/photos'
import { schemas } from './schema'
let database:FitnessDB
const jpeg=()=>new Blob([new Uint8Array([255,216,255,224,0,0,255,217])],{type:'image/jpeg'})
beforeEach(async()=>{database=new FitnessDB('extension-'+crypto.randomUUID());await seedDatabase(database)})
afterEach(async()=>{await database.delete()})
describe('照片備份與無損升級',()=>{
  it('Blob ⇄ base64 往返、包含與略過照片，還原後仍是 Blob',async()=>{
    const value=jpeg();const url=await photoDataUrl(value);expect([...new Uint8Array(await photoBlob(url).arrayBuffer())]).toEqual([...new Uint8Array(await value.arrayBuffer())])
    const bytes=new Uint8Array(70000);bytes.set([255,216,255]);expect((await photoBlob(await photoDataUrl(new Blob([bytes],{type:'image/jpeg'}))).arrayBuffer()).byteLength).toBe(70000)
    await database.rows('exercise_photos').put({exercise_code:'bench_bb',blob:value,updated_at:'2026-11-15T01:00:00Z'})
    const full=await createBackup(database);const preview=prepareBackup(full.content);expect(preview.tables.exercise_photos[0].blob).toBe(url)
    const before=await readSnapshot(database);await database.rows('exercise_photos').clear();await restoreBackup(preview,database);expect(await readSnapshot(database)).toEqual(before)
    expect((await database.rows('exercise_photos').get('bench_bb'))?.blob).toBeInstanceOf(Blob)
    const small=await createBackup(database,new Date(),{includePhotos:false});expect(prepareBackup(small.content).tables.exercise_photos).toEqual([]);expect(await database.rows('exercise_photos').count()).toBe(1)
    const old=JSON.parse(full.content);delete old.tables.exercise_photos;expect(prepareBackup(JSON.stringify(old)).tables.exercise_photos).toEqual([])
  })
  it('拒絕錯誤照片與重複主鍵，原資料不變',async()=>{
    const full=await createBackup(database);const data=JSON.parse(full.content)
    for(const blob of ['data:image/png;base64,/9j/','data:image/jpeg;base64,YWJj','data:image/jpeg;base64,!!!!']){data.tables.exercise_photos=[{exercise_code:'bench_bb',blob,updated_at:'2026-11-15T01:00:00Z'}];expect(()=>prepareBackup(JSON.stringify(data))).toThrow()}
    expect(()=>photoBlob('data:image/jpeg;base64,'+btoa('abc'))).toThrow()
    data.tables.exercise_photos=[{exercise_code:'unknown',blob:await photoDataUrl(jpeg()),updated_at:'2026-11-15T01:00:00Z'}];expect(()=>prepareBackup(JSON.stringify(data))).toThrow('對應動作')
    data.tables.exercise_photos[0].exercise_code='bench_bb';data.tables.exercise_photos.push(data.tables.exercise_photos[0]);expect(()=>prepareBackup(JSON.stringify(data))).toThrow('重複主鍵')
    expect(await database.rows('exercise_photos').count()).toBe(0)
  })
  it('Dexie 5 → 6 保留舊表、訓練及體重，不清空',async()=>{
    const before=await readSnapshot(database);const name=database.name;await database.delete()
    const old=new Dexie(name);const {exercise_photos:ignored,...oldStores}=stores;void ignored
    old.version(5).stores({...oldStores,program_weeks:'id, program_id, week_no, &[program_id+week_no]',nutrition_targets:'id, effective_from, created_at, source_analysis_id'})
    for(const [table,rows]of Object.entries(before))if(table!=='exercise_photos'&&rows.length)await old.table(table).bulkAdd(rows)
    await old.table('body_metrics').add({id:crypto.randomUUID(),date:'2026-11-15',weight_kg:60})
    await old.table('workout_sessions').add({id:crypto.randomUUID(),program_week_id:before.program_weeks[0].id,date:'2026-11-15',day_type:'push',completed:true});old.close()
    database=new FitnessDB(name);await database.open();expect(database.verno).toBe(7);expect(await database.rows('planned_exercises').count()).toBe(216);expect(await database.rows('body_metrics').count()).toBe(1);expect((await database.rows('workout_sessions').toArray())[0].day_type).toBe('push');expect(await database.rows('exercise_photos').count()).toBe(0)
  })
})
describe('補量日持續紀錄',()=>{
  it('沿用最近實績、首次試重，中途重開接續，同週最多一次，備份相容',async()=>{
    const week=(await database.rows('program_weeks').where('week_no').equals(1).first())!
    const exercise=(await database.rows('exercises').where('code').equals('incline_press_db').first())!
    const past=schemas.workout_sessions.parse({id:crypto.randomUUID(),date:'2026-11-08',day_type:'push',completed:true});await database.rows('workout_sessions').add(past)
    await database.rows('workout_sets').add(schemas.workout_sets.parse({id:crypto.randomUUID(),session_id:past.id,exercise_id:exercise.id,set_no:1,weight_kg:12,reps:10,rir:2}))
    const id=await startWorkout(week.id,'extra',database,'2026-11-15');let draft=(await database.rows('workout_drafts').get(id))!;expect(draft.items).toHaveLength(6);expect(draft.items[0].entries[0].weight).toBe('12');expect(draft.items[1].entries[0].weight).toBe('')
    await completeEntry(id,draft.items[0].id,draft.items[0].entries[0].id,{weight:'12',reps:'10',rir:2},database)
    database.close();await database.open();expect(await startWorkout(week.id,'extra',database,'2026-11-15')).toBe(id)
    await mutateDraft(id,d=>{d.fatigue='5';d.sleep_h='8'},database);await finishWorkout(id,database)
    await expect(startWorkout(week.id,'extra',database,'2026-11-15')).rejects.toThrow('最多一次')
    const another=(await database.rows('program_weeks').where('week_no').equals(2).first())!;await expect(startWorkout(another.id,'extra',database,'2026-11-15')).rejects.toThrow('最多一次')
    const backup=await createBackup(database);const before=await readSnapshot(database);await restoreBackup(prepareBackup(backup.content),database);expect(await readSnapshot(database)).toEqual(before)
    draft=(await database.rows('workout_drafts').get(id))!;expect(draft).toBeUndefined()
  })
})
