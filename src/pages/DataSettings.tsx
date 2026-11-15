import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { clearMealRecords, saveNutritionTarget } from '../db/inbody'
import { NUTRIENT_KEYS, nutrientLabels, targetForDate } from '../lib/rules/nutrition'
import { taipeiDate } from '../lib/time'
import { BackupButton } from './BackupButton'

export function NutritionSettings() {
  const current = useLiveQuery(async () => targetForDate(await db.rows('nutrition_targets').toArray(), taipeiDate()))
  const [status,setStatus] = useState('')
  const [busy,setBusy] = useState(false)
  return <section className="card"><h2>營養目標</h2><p>儲存後新增一筆從今天生效的目標。</p>
    {current !== undefined && <form key={current?.id} onSubmit={async event=>{
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const values = { kcal: Number(fields.get('kcal')), protein_g: Number(fields.get('protein_g')), carbs_g: Number(fields.get('carbs_g')), fat_g: Number(fields.get('fat_g')) }
      setBusy(true)
      try { await saveNutritionTarget(values); setStatus('已儲存今日營養目標。') }
      catch { setStatus('儲存失敗，請檢查輸入。') }
      finally { setBusy(false) }
    }}><div className="form-grid">{NUTRIENT_KEYS.map(key=><label key={key}>{nutrientLabels[key]}（{key==='kcal'?'kcal':'g'}）<input name={key} type="number" min={key==='kcal'?1:0} required step={1} defaultValue={current?.[key]} inputMode="numeric" /></label>)}</div>
      <button className="primary" disabled={busy}>儲存營養目標</button>
    </form>}{status && <p role="status">{status}</p>}
  </section>
}

export function ClearMealsSettings() {
  const [phase,setPhase] = useState<'backup'|'confirm'|null>(null)
  const [counts,setCounts] = useState({meals:0,items:0})
  const [word,setWord] = useState('')
  const [status,setStatus] = useState('')
  const [busy,setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const element=dialog.current
    if (phase && element && !element.open) element.showModal()
    if (!phase) element?.close()
  },[phase])
  async function review() {
    const meals = db.rows('meals'), items = db.rows('meal_items')
    setCounts(await db.transaction('r',meals,items,async()=>({meals:await meals.count(),items:await items.count()})))
    setWord(''); setStatus(''); setPhase('confirm')
  }
  return <section className="card"><h2>清除飲食紀錄</h2><p>只清除餐點與餐點項目。已結算週報的飲食統計會保留。</p>
    <button className="secondary" onClick={()=>{setStatus('');setPhase('backup')}}>清除飲食紀錄</button>
    <dialog ref={dialog} className="card backup-prompt" aria-label={phase === 'backup' ? '先備份' : '確認清除飲食紀錄'} onCancel={e=>{e.preventDefault();if(!busy)setPhase(null)}}>
    {phase === 'backup' && <div><h3>先備份</h3><p>建議先儲存完整備份，再確認要刪除的筆數。</p><BackupButton /><button className="secondary" onClick={()=>void review().catch(()=>setStatus('無法讀取筆數，請重試。'))}>繼續確認</button><button className="secondary" onClick={()=>setPhase(null)}>取消</button></div>}
    {phase === 'confirm' && <div><p>即將刪除 {counts.meals} 餐，共 {counts.items} 筆餐點項目。</p><label>輸入「清除」確認<input value={word} onChange={e=>setWord(e.target.value)} /></label>
      <button className="danger" disabled={busy || word !== '清除' || counts.meals+counts.items===0} onClick={async()=>{
        setBusy(true)
        try { await clearMealRecords(counts); setPhase(null); setStatus('飲食紀錄已清除。') }
        catch (error) { setPhase('backup'); setStatus(error instanceof Error ? error.message : '清除失敗。') }
        finally { setBusy(false) }
      }}>確認清除</button><button className="secondary" disabled={busy} onClick={()=>setPhase(null)}>取消</button>
    </div>}
    {phase && status && <p role="status">{status}</p>}</dialog>
    {!phase && status && <p role="status">{status}</p>}
  </section>
}
