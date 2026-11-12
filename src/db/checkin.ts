import { db,type FitnessDB } from './index'
import { saveBodyMetric,type BodyInput } from './body'
import { schemas } from './schema'
export async function saveWeeklyCheckin(input:BodyInput,photo:Blob|null|undefined,database:FitnessDB=db){
  await database.transaction('rw',database.tables,async()=>{
    if(input.weight_kg!=null||input.waist_cm!=null)await saveBodyMetric(input,database)
    if(photo===null)await database.rows('body_photos').delete(input.date)
    else if(photo)await database.rows('body_photos').put(schemas.body_photos.parse({date:input.date,blob:photo,updated_at:new Date().toISOString()}))
  })
}
