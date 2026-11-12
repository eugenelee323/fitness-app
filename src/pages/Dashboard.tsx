import { useState } from 'react'
import { StartWorkoutButton } from './StartWorkoutButton'
import { BackupButton } from './BackupButton'
import { todayTraining } from '../lib/rules/flow'
import { dayLabels,type DayType } from '../lib/rules/extra'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { QuickBody } from './Body'
import { TodayNutrition } from './NutritionProgress'
import { db } from '../db'
import { useClock } from '../hooks/useClock'
import { currentWeek, weeklyCompletion } from '../lib/rules/workout'
import { dateNumber, taipeiDate } from '../lib/time'

export function Dashboard() {
  const [override,setOverride]=useState<DayType|null>(null)
  const [changing,setChanging]=useState(false)
  const now = useClock()
  const today = taipeiDate(new Date(now))
  const data = useLiveQuery(async () => {
    const program = await db.rows('programs').where('status').equals('active').first() ?? await db.rows('programs').toCollection().first()
    if (!program) return null
    const week = await db.rows('program_weeks').where('[program_id+week_no]').equals([program.id, currentWeek(program.start_date, today)]).first()
    if (!week) return null
    const plans = await db.rows('planned_exercises').where('program_week_id').equals(week.id).toArray()
    const sessions = await db.rows('workout_sessions').where('program_week_id').equals(week.id).toArray()
    const sets = await db.rows('workout_sets').toArray()
    const draft = await db.rows('workout_drafts').toCollection().first()
    const lastBackup = await db.rows('app_meta').get('last_backup_at')
    const requested = await db.rows('app_meta').get('backup_requested_at')
    const prompt = todayTraining(program,await db.rows('program_weeks').where('program_id').equals(program.id).toArray(),await db.rows('workout_sessions').toArray(),today).day
    return { program, week, plans, sessions, draft, requested: typeof requested?.value === 'string' ? requested.value : null, lastBackup: typeof lastBackup?.value === 'string' ? lastBackup.value : null, prompt, completion: weeklyCompletion(plans, sets, sessions) }
  }, [today])
  if (!data) return <p role="status">正在讀取本週計畫…</p>
  const outdated = !data.lastBackup || now - Date.parse(data.lastBackup) > 7 * 86400000
  const planUpdated = !!data.requested && (!data.lastBackup || data.requested > data.lastBackup)
  const outside = dateNumber(today) < dateNumber(data.program.start_date) || dateNumber(today) >= dateNumber(data.program.start_date) + 84 * 86400000
  return <><div className="page-title"><span className="eyebrow">{today} · 每次訓練都算數</span><h1>今天，累積一點進步</h1><p>不綁定星期，依你的步調選擇推日或拉日。</p></div>
    <section className={outdated || planUpdated ? 'note backup-alert' : 'backup-shortcut'} aria-label="備份">
      {outdated && <p>{data.lastBackup ? '距離上次備份已超過 7 天。' : '尚未匯出備份。'}</p>}
      {planUpdated && <p>課表已更新，請備份。</p>}
      <BackupButton />
    </section>
    {outside && <div className="note">今天不在計畫的 12 週日期範圍內；仍可從訓練頁選擇週次記錄。</div>}
    <section className="card hero"><span className="eyebrow">第 {data.week.week_no} 週 · 階段 {data.week.phase}</span><h2>{data.week.menu} 菜單 · {data.week.is_deload ? '減量週' : '訓練週'}</h2><StartWorkoutButton weekId={data.week.id} day={override??data.prompt} label={data.draft?'接續訓練':'開始今日訓練'} />{!data.draft&&<p>第 {data.week.week_no} 週 · {data.week.menu} 菜單 · {dayLabels[override??data.prompt]} <button className="text-link" onClick={()=>setChanging(!changing)}>更換</button></p>}{changing&&<div className="day-picker">{(['push','pull','extra'] as const).map(day=><button key={day} aria-pressed={(override??data.prompt)===day} onClick={()=>{setOverride(day);setChanging(false)}}>{dayLabels[day]}</button>)}<Link className="text-link" to="/training">進階選擇 →</Link></div>}</section>
    <section className="card"><h2>本週完成率</h2><div className="big-number">{Math.round(data.completion.ratio * 100)}<small>%</small></div><progress max="1" value={data.completion.ratio} aria-label="本週完成率" /><p>{data.completion.done}／{data.completion.target} 組 · 單手左右各算半組，重複訓練不重複累計。</p></section>
    <QuickBody /><TodayNutrition /><div className="link-row"><Link className="secondary" to="/plan">12 週計畫</Link><Link className="secondary" to="/history">訓練歷史</Link></div></>
}
