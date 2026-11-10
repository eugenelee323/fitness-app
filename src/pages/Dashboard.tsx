import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import { useClock } from '../hooks/useClock'
import { currentWeek, weeklyCompletion } from '../lib/rules/workout'
import { dateNumber, taipeiDate } from '../lib/time'

export function Dashboard() {
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
    const prompt = sessions.some(s => s.day_type === 'push' && s.completed) ? 'pull' : 'push'
    return { program, week, plans, sessions, draft, lastBackup: typeof lastBackup?.value === 'string' ? lastBackup.value : null, prompt, completion: weeklyCompletion(plans, sets, sessions) }
  }, [today])
  if (!data) return <p role="status">正在讀取本週計畫…</p>
  const backupDue = !data.lastBackup || now - Date.parse(data.lastBackup) > 7 * 86400000
  const outside = dateNumber(today) < dateNumber(data.program.start_date) || dateNumber(today) >= dateNumber(data.program.start_date) + 84 * 86400000
  return <><div className="page-title"><span className="eyebrow">{today} · 每次訓練都算數</span><h1>今天，累積一點進步</h1><p>不綁定星期，依你的步調選擇推日或拉日。</p></div>
    {backupDue && <div className="note">{data.lastBackup ? '距離上次備份已超過 7 天。' : '尚未匯出備份。'}<Link className="text-link" to="/settings">前往設定備份 →</Link></div>}
    {outside && <div className="note">今天不在計畫的 12 週日期範圍內；仍可從訓練頁選擇週次記錄。</div>}
    <section className="card hero"><span className="eyebrow">第 {data.week.week_no} 週 · 階段 {data.week.phase}</span><h2>{data.week.menu} 菜單 · {data.week.is_deload ? '減量週' : '訓練週'}</h2><p>今日課表：{data.draft ? '接續進行中的訓練' : data.prompt === 'push' ? '推日' : '拉日'}（開始前可改選）</p><Link className="primary" to="/training">{data.draft ? '接續訓練' : '開始訓練'} ↗</Link></section>
    <section className="card"><h2>本週完成率</h2><div className="big-number">{Math.round(data.completion.ratio * 100)}<small>%</small></div><progress max="1" value={data.completion.ratio} aria-label="本週完成率" /><p>{data.completion.done}／{data.completion.target} 組 · 單手左右各算半組，重複訓練不重複累計。</p></section>
    <div className="link-row"><Link className="secondary" to="/plan">12 週計畫</Link><Link className="secondary" to="/history">訓練歷史</Link></div></>
}
