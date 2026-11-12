import { useRef,useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { loadWeeklyInput } from '../lib/weekly'
import { weeklyReportText } from '../lib/weekly/text'
import { taipeiDate } from '../lib/time'
import { useClock } from '../hooks/useClock'
export function CopyReport({weekNo}:{weekNo:number}){
  const date=taipeiDate(new Date(useClock())),[copied,setCopied]=useState(false),[fallback,setFallback]=useState(false),area=useRef<HTMLTextAreaElement>(null)
  const text=useLiveQuery(async()=>{const input=await loadWeeklyInput();if(!input)return '';const analysis=await db.rows('weekly_analyses').where('[program_id+week_no]').equals([input.program.id,weekNo]).first();const recs=analysis?await db.rows('recommendations').where('analysis_id').equals(analysis.id).toArray():[];return weeklyReportText(input,weekNo,recs,date)},[weekNo,date])
  return <section className="report-copy"><button className="secondary" disabled={!text} onClick={async()=>{try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text!);setCopied(true)}catch{setFallback(true)}}}>{copied?'已複製':'複製週報給 Claude'}</button>{fallback&&<><p>無法自動複製，請全選下方文字後複製。</p><textarea ref={area} rows={10} readOnly value={text??''} aria-label="可全選的週報文字"/><button className="secondary" onClick={()=>{area.current?.focus();area.current?.select()}}>全選週報文字</button></>}<p className="muted">由目前紀錄產生，不含照片；若結算後有修改，請重新結算更新建議。</p></section>
}
