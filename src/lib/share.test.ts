import { expect,it } from 'vitest'
import { deliverBackup } from './share'
it('分享完成、下載觸發後才記錄，取消與失敗不更新',async()=>{
  const events:string[]=[],file=new File(['{}'],'fitness-backup-20261112.json',{type:'application/json'})
  const mark=async()=>{events.push('mark')},download=()=>{events.push('download')}
  expect(await deliverBackup(file,{canShare:()=>true,share:async()=>{events.push('share')}},download,mark)).toBe('shared');expect(events).toEqual(['share','mark']);events.length=0
  expect(await deliverBackup(file,{},download,mark)).toBe('downloaded');expect(events).toEqual(['download','mark']);events.length=0
  expect(await deliverBackup(file,{canShare:()=>true,share:async()=>{throw new DOMException('cancel','AbortError')}},download,mark)).toBe('cancelled');expect(events).toEqual([])
  await expect(deliverBackup(file,{canShare:()=>true,share:async()=>{throw new Error('no share')}},download,mark)).rejects.toThrow();expect(events).toEqual([])
})
