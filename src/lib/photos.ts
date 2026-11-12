import { z } from 'zod'
export const backupPhotoSchema=z.object({exercise_code:z.string().min(1),blob:z.string().max(6*1024*1024).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),updated_at:z.iso.datetime({offset:true})}).strict()
export async function photoDataUrl(blob:Blob):Promise<string> {
  const bytes=new Uint8Array(await blob.arrayBuffer())
  let binary=''
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768))
  return 'data:image/jpeg;base64,'+btoa(binary)
}
export function photoBlob(data:string):Blob {
  const value=backupPhotoSchema.shape.blob.parse(data)
  const base64=value.slice('data:image/jpeg;base64,'.length)
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0))
  if(btoa(String.fromCharCode(...bytes.subarray(0,3)))!=='/9j/' || bytes.length>4*1024*1024)throw new Error('照片不是有效 JPEG 或超過 4 MB。')
  return new Blob([bytes],{type:'image/jpeg'})
}
/** Canvas 重新編碼移除原始 EXIF；照片不經網路。 */
export async function compressPhoto(file:File):Promise<Blob> {
  if(!file.type.startsWith('image/')||file.size>30*1024*1024)throw new Error('請選擇 30 MB 以下的圖片。')
  const url=URL.createObjectURL(file)
  try {
    const img=new Image();img.src=url;await img.decode()
    const scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight))
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale))
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('此瀏覽器無法處理照片。')
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height)
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('照片壓縮失敗。')),'image/jpeg',.82))
  } finally {URL.revokeObjectURL(url)}
}
