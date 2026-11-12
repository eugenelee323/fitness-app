import { db, type FitnessDB } from '../db'
import { RULES_VERSION } from './rules'
import { taipeiDate } from './time'
import type { Snapshot } from './backup'
export function backupFile(snapshot:Snapshot,now=new Date()):File {
  const tables=structuredClone(snapshot)
  tables.app_meta=tables.app_meta.filter(r=>r.key!=='last_backup_at')
  tables.app_meta.push({key:'last_backup_at',value:now.toISOString()})
  return new File([JSON.stringify({version:1,exportedAt:now.toISOString(),rulesVersion:RULES_VERSION,tables},null,2)],`fitness-backup-${taipeiDate(now).replaceAll('-','')}.json`,{type:'application/json'})
}
export interface SharePort { canShare?:(data:{files:File[]})=>boolean; share?:(data:{files:File[];title:string})=>Promise<void> }
export async function deliverBackup(file:File,port:SharePort,download:(file:File)=>void,mark:()=>Promise<void>):Promise<'shared'|'downloaded'|'cancelled'> {
  let can=false
  try{can=!!port.canShare?.({files:[file]})}catch{can=false}
  if(can && port.share){
    try{await port.share({files:[file],title:'12週增肌完整備份'})}catch(error){if(error instanceof Error&&error.name==='AbortError')return 'cancelled';throw error}
    await mark();return 'shared'
  }
  download(file);await mark();return 'downloaded'
}
export async function markBackup(at:string,database:FitnessDB=db){await database.rows('app_meta').put({key:'last_backup_at',value:at})}
export function downloadFile(file:File){const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000)}
