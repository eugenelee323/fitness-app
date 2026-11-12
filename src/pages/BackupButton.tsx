import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { readSnapshot } from '../lib/backup'
import { backupFile, deliverBackup, downloadFile, markBackup } from '../lib/share'
export function BackupButton({includePhotos=true,label='一鍵備份',onDone,primary=false}:{includePhotos?:boolean;label?:string;onDone?:()=>void;primary?:boolean}){
  const prepared=useLiveQuery(()=>readSnapshot(undefined,includePhotos),[includePhotos])
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  return <><button className={primary?'primary':'secondary'} data-primary-priority={primary?20:undefined} disabled={!prepared||busy} onClick={async()=>{
    if(!prepared)return;setBusy(true);setMessage('');const now=new Date()
    try{const file=backupFile(prepared,now);const result=await deliverBackup(file,{canShare:navigator.canShare?.bind(navigator),share:navigator.share?.bind(navigator)},downloadFile,()=>markBackup(now.toISOString()));setMessage(result==='cancelled'?'已取消，備份時間未更新。':result==='shared'?'分享已完成。請確認已儲存到「檔案」。':'已觸發下載，請確認檔案已儲存。');if(result!=='cancelled')onDone?.()}
    catch{setMessage('分享未完成，備份時間未更新。請重試，或選擇下方下載。')}finally{setBusy(false)}
  }}>{busy?'處理中…':prepared?label:'準備備份中…'}</button>{message&&<p role="status">{message}</p>}{message.startsWith('分享未完成')&&prepared&&<button className="secondary" onClick={async()=>{const now=new Date();downloadFile(backupFile(prepared,now));await markBackup(now.toISOString());setMessage('已觸發下載。');onDone?.()}}>改用下載備份</button>}</>
}
export function BackupPrompt({onClose}:{onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="card backup-prompt" aria-label="現在備份" onCancel={event=>{event.preventDefault();onClose()}}>
    <h2>下週課表已產生</h2><p>現在備份，保留課表與本次調整。</p>
    <BackupButton label="現在備份" onDone={onClose} primary />
    <button className="secondary" onClick={onClose}>略過</button>
  </dialog>
}
