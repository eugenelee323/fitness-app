import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { formatN } from '../lib/format'

function HistoryPhoto({ blob, date }: { blob: Blob; date: string }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img ref={ref} alt={date + ' 的體態照'} loading="lazy" />
}
export function Body() {
  const data = useLiveQuery(async () => ({
    metrics: await db.rows('body_metrics').orderBy('date').reverse().toArray(),
    photos: await db.rows('body_photos').orderBy('date').reverse().toArray(),
  }))
  return <><Link to="/analysis" className="text-link">← 分析</Link><h1>體重、腰圍與體態照歷史</h1>
    {data && <><section className="card"><h2>以往量測</h2>{!data.metrics.length && <p>沒有歷史量測。</p>}
      {data.metrics.map(r=><p key={r.id}>{r.date} · 體重 {r.weight_kg == null?'未填':formatN(r.weight_kg)+' kg'} · 腰圍 {r.waist_cm == null?'未填':formatN(r.waist_cm)+' cm'}</p>)}</section>
      <section className="card"><h2>以往體態照</h2>{!data.photos.length && <p>沒有歷史照片。</p>}
      {data.photos.map(photo=><figure className="exercise-photo" key={photo.date}><figcaption>{photo.date}</figcaption><HistoryPhoto blob={photo.blob} date={photo.date} /></figure>)}</section></>}
  </>
}
