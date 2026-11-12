import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { IconBarbell } from '@tabler/icons-react'
import { db } from '../db'
import { schemas } from '../db/schema'
import { compressPhoto } from '../lib/photos'
function PhotoPreview({blob,name}:{blob:Blob;name:string}){
  const img=useRef<HTMLImageElement>(null)
  useEffect(()=>{const url=URL.createObjectURL(blob);if(img.current)img.current.src=url;return()=>URL.revokeObjectURL(url)},[blob])
  return <img ref={img} alt={`${name}的自備動作照片`} />
}
export function ExercisePhoto({code,name}:{code:string;name:string}) {
  const photo=useLiveQuery(()=>db.rows('exercise_photos').get(code),[code])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [deleting,setDeleting]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const album=useRef<HTMLInputElement>(null)
  async function selected(file:File|undefined){
    if(!file)return;setBusy(true);setError('')
    try{const blob=await compressPhoto(file);await db.rows('exercise_photos').put(schemas.exercise_photos.parse({exercise_code:code,blob,updated_at:new Date().toISOString()}))}catch(err){setError(err instanceof Error&&err.name!=='ZodError'?err.message:'圖片格式無法處理，請改選 JPEG 或 PNG。')}finally{setBusy(false)}
  }
  return <div className="exercise-photo">{photo?<PhotoPreview blob={photo.blob} name={name} />:<div className="photo-placeholder"><IconBarbell size={48} stroke={1.4} aria-hidden="true" /><span>自己的器材／動作照片</span></div>}
    <input ref={input} type="file" accept="image/*" capture="environment" className="file-input" aria-label={`${name}拍照或選照片`} disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void selected(file)}}/><input ref={album} type="file" accept="image/*" className="file-input" aria-label={`${name}從相簿選照片`} disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void selected(file)}}/><div className="button-row"><button className="secondary" disabled={busy} onClick={()=>input.current?.click()}>{busy?'處理照片中…':photo?'更換照片':'拍照／選照片'}</button><button className="secondary" disabled={busy} onClick={()=>album.current?.click()}>從相簿選取</button>{photo&&<button className="secondary" disabled={busy} onClick={()=>setDeleting(true)}>刪除照片</button>}</div>
    {deleting&&<div role="alertdialog" aria-label="刪除動作照片"><p>確定刪除此動作照片？</p><button className="danger" disabled={busy} onClick={async()=>{setBusy(true);try{await db.rows('exercise_photos').delete(code);setDeleting(false)}catch{setError('刪除失敗，請重試。')}finally{setBusy(false)}}}>確認刪除照片</button><button className="secondary" onClick={()=>setDeleting(false)}>取消</button></div>}{error&&<p className="error" role="alert">{error}</p>}
  </div>
}
