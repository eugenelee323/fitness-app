import { IconCheck,IconMinus,IconAlertCircle } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { mealData } from '../db/meals'
import { nutritionDay, proteinReminder, type NutritionDay } from '../lib/rules/nutrition'
import { explain } from '../lib/explain'
import { useClock } from '../hooks/useClock'
import { taipeiDate } from '../lib/time'
import { formatN } from '../lib/format'
export function NutritionProgress({ day, now }: { day: NutritionDay; now: number }) {
  return <section className="card"><h2>當日飲食進度</h2><p className={`badge status-icon ${day.status==='missed'?'error':''}`}>{day.status==='met'?<IconCheck size={16}/>:day.status==='missed'?<IconAlertCircle size={16}/>:<IconMinus size={16}/>}{{ met: '達標', partial: '部分達標', missed: '未達標', unknown: '尚無目標' }[day.status]}</p>
    {(['kcal', 'protein_g'] as const).map(key => <div className="nutrition-progress" key={key}><label>{key === 'kcal' ? '熱量' : '蛋白質'}：{formatN(day.total[key])}／{day.target ? formatN(day.target[key]) : '—'} {key === 'kcal' ? 'kcal' : 'g'}<progress max={day.target?.[key] || 1} value={day.target ? day.total[key] : 0} /></label></div>)}
    <p>當日合計：{formatN(day.total.kcal)} kcal · 蛋白質 {formatN(day.total.protein_g)} g · 碳水 {formatN(day.total.carbs_g)} g · 脂肪 {formatN(day.total.fat_g)} g</p>
    {day.target ? <p className="muted">熱量達標區間 {formatN(day.kcalLow!)}–{formatN(day.kcalHigh!)} kcal；蛋白質 ≥ {day.target.protein_g} g。</p> : <p className="muted">請至設定匯入個人營養目標。</p>}
    <p className="muted">已記 {day.recorded} 個餐別／預計 {day.expected} 餐（訓練日 4、休息日 3）。</p>
    {proteinReminder(now, day.date, day.proteinRemaining) && <p className="note">{explain('P1', { remaining: day.proteinRemaining })}</p>}
  </section>
}
export function TodayNutrition() {
  const now = useClock()
  const data = useLiveQuery(() => mealData())
  return data && <><NutritionProgress day={nutritionDay(data, taipeiDate(new Date(now)))} now={now} /><Link className="secondary" to="/nutrition">記一餐 →</Link></>
}
