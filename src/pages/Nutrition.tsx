import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Row } from '../db/schema'
import { mealData, saveMealsBatch, saveMeal, deleteMeal, saveFavorite, addFavorite, mealInputSchema, type MealInput } from '../db/meals'
import { parseMealsText, mealLabels, type MealValue, type MealType } from '../lib/paste'
import { nutritionDay, sumNutrients, scaleNutrients, NUTRIENT_KEYS, nutrientLabels } from '../lib/rules/nutrition'
import { useClock } from '../hooks/useClock'
import { taipeiDate } from '../lib/time'
import { NutritionProgress } from './NutritionProgress'
import { formatN } from '../lib/format'

type Entry = { name: string; grams: string; kcal: string; protein_g: string; carbs_g: string; fat_g: string; is_estimate: boolean; basis: MealValue | null }
type Run = (fn: () => Promise<unknown>) => Promise<boolean>
const blank = (): Entry => ({ name: '', grams: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '', is_estimate: false, basis: null })
const toEntry = (item: MealValue): Entry => ({ ...item, grams: String(item.grams), kcal: String(item.kcal), protein_g: String(item.protein_g), carbs_g: String(item.carbs_g), fat_g: String(item.fat_g), basis: item })
const toValue = (entry: Entry): MealValue => ({ name: entry.name.trim(), grams: Number(entry.grams), kcal: Number(entry.kcal), protein_g: Number(entry.protein_g), carbs_g: Number(entry.carbs_g), fat_g: Number(entry.fat_g), is_estimate: entry.is_estimate })

function MealForm({ initial, existing, onClose, run }: { initial: MealInput; existing?: Row<'meals'>; onClose: (date?: string) => void; run: Run }) {
  useEffect(() => { document.getElementById('meal-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  const [date, setDate] = useState(initial.date)
  const [type, setType] = useState(initial.meal_type)
  const [entries, setEntries] = useState<Entry[]>(initial.items.length ? initial.items.map(toEntry) : [blank()])
  const [busy, setBusy] = useState(false)
  function update(index: number, field: keyof Omit<Entry, 'basis'>, value: string | boolean) {
    setEntries(old => old.map((entry, i) => {
      if (i !== index) return entry
      const next = { ...entry, [field]: value }
      if (field === 'grams' && entry.basis) {
        if (Number.isFinite(Number(value)) && Number(value) > 0) {
          const scaled = scaleNutrients(entry.basis, Number(value))
          for (const key of NUTRIENT_KEYS) next[key] = String(scaled[key])
        }
      } else if (field !== 'is_estimate') {
        next.basis = next.grams.trim() && Number(next.grams) > 0 && NUTRIENT_KEYS.every(key => next[key].trim() && Number.isFinite(Number(next[key]))) ? toValue(next) : null
      }
      return next
    }))
  }
  return <section className="card" id="meal-form"><h2>{existing ? '編輯餐點' : '輸入一餐'}</h2>
    <form onSubmit={event => {
      event.preventDefault(); setBusy(true)
      void run(async () => {
        if (entries.some(e => !e.grams.trim() || NUTRIENT_KEYS.some(key => !e[key].trim()))) throw new Error('請填寫所有營養數值；沒有的營養素請填 0。')
        await saveMeal(mealInputSchema.parse({ date, meal_type: type, entry_source: initial.entry_source, items: entries.map(toValue) }), existing)
        onClose(date)
      }).finally(() => setBusy(false))
    }}><fieldset disabled={busy}>
      <label>餐點日期<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>餐別<select value={type} onChange={e => setType(e.target.value as MealType)}>{Object.entries(mealLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {entries.map((entry, i) => <div className="meal-entry" key={i}><h3>食物 {i + 1}</h3>
        <label>食物名稱<input required value={entry.name} onChange={e => update(i, 'name', e.target.value)} /></label>
        <div className="meal-fields"><label>份量（g）<input required type="number" inputMode="decimal" min="0.01" step="any" value={entry.grams} onChange={e => update(i, 'grams', e.target.value)} /></label>
          {NUTRIENT_KEYS.map(key => <label key={key}>{nutrientLabels[key]}（{key === 'kcal' ? 'kcal' : 'g'}）<input required type="number" inputMode="decimal" min="0" step="any" value={entry[key]} onChange={e => update(i, key, e.target.value)} /></label>)}
        </div>
        <label className="estimate-check"><input type="checkbox" checked={initial.entry_source === 'paste' || entry.is_estimate} disabled={initial.entry_source === 'paste'} onChange={e => update(i, 'is_estimate', e.target.checked)} />估算值{initial.entry_source === 'paste' && '（貼上內容固定標估）'}</label>
        <button className="secondary" type="button" disabled={entries.length <= 1} onClick={() => setEntries(entries.filter((_, index) => index !== i))}>移除此食物</button>
      </div>)}
      <p className="muted">改份量會按比例重算；直接改營養素後會以新數值作為比例基準。</p>
      <div className="button-row"><button className="secondary" type="button" onClick={() => setEntries([...entries, blank()])}>新增食物</button><button className="primary" type="submit">{busy ? '儲存中…' : '儲存餐點'}</button><button className="secondary" type="button" onClick={() => onClose()}>取消</button></div>
    </fieldset></form>
  </section>
}

function PastePanel({raw,setRaw,onClose,onSaved,run,manual}:{raw:string;setRaw:(text:string)=>void;onClose:()=>void;onSaved:(date:string)=>void;run:Run;manual:boolean}){
  const [editing,setEditing]=useState(manual),[busy,setBusy]=useState(false)
  const parsed=parseMealsText(raw)
  function fix(lineNumber:number,value:string){const rows=raw.split(/\r?\n/);rows[lineNumber-1]=value;setRaw(rows.join('\n'))}
  return <section className="card"><h2>一次貼上多餐</h2><p className="muted">每餐以「#餐點 日期 餐別」開頭，可含多日資料。</p>{(editing||!raw||!parsed.valid)&&<label>餐點文字<textarea aria-label="多餐估算文字" disabled={busy} rows={8} value={raw} onChange={e=>setRaw(e.target.value)}/></label>}<button className="secondary" onClick={()=>setEditing(!editing)}>編輯貼上文字</button>
    {raw&&parsed.blocks.map(block=><article className="paste-block" key={block.startLine}>{block.header?<h3>{block.header.date} · {mealLabels[block.header.meal_type]}</h3>:<p className="error">第 {block.startLine} 行：{block.headerError}</p>}{block.lines.map(line=><div key={line.lineNumber} className={line.error?'paste-line invalid-line':'paste-line'}>{line.error?<label>第 {line.lineNumber} 行：{line.error}<input disabled={busy} aria-invalid="true" value={line.text} onChange={e=>fix(line.lineNumber,e.target.value)}/></label>:<p>{line.item?.name} · {line.item?.grams} g · {line.item?.kcal} kcal <span className="badge">估</span></p>}</div>)}<p>合計 {formatN(sumNutrients(block.lines.flatMap(line=>line.item?[line.item]:[])).kcal)} kcal</p></article>)}
    <button className="primary" data-primary-priority="10" disabled={!parsed.valid||busy} onClick={()=>{setBusy(true);void run(async()=>{await saveMealsBatch(parsed.blocks.map(block=>({...block.header!,items:block.lines.map(line=>line.item!),entry_source:'paste'})));onSaved(parsed.blocks[0].header!.date)}).finally(()=>setBusy(false))}}>{busy?'儲存中…':'一鍵全部確認'}</button><button className="secondary" disabled={busy} onClick={onClose}>取消</button>
  </section>
}

export function Nutrition() {
  const now = useClock()
  const [date, setDate] = useState(() => taipeiDate(new Date(now)))
  const [form, setForm] = useState<{ input: MealInput; existing?: Row<'meals'> } | null>(null)
  const [paste, setPaste] = useState(false)
  const [pasteText,setPasteText]=useState('')
  const [pasteManual,setPasteManual]=useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [favoriteFor, setFavoriteFor] = useState<string | null>(null)
  const [favoriteName, setFavoriteName] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const data = useLiveQuery(() => mealData())
  async function run(fn: () => Promise<unknown>) {
    setError(''); setMessage(''); setBusy(true)
    try { await fn(); setMessage('已儲存。'); return true } catch (err) { setError(err instanceof Error && err.name !== 'ZodError' ? err.message : '格式或數值不正確，請檢查各欄位。'); return false } finally { setBusy(false) }
  }
  if (!data) return <p role="status">讀取飲食紀錄中…</p>
  return <><div className="page-title"><span className="eyebrow">每餐累積，吃得有方向</span><h1>飲食紀錄</h1>
    <label>查看日期<input aria-label="查看日期" type="date" value={date} onChange={e => { if (e.target.value) setDate(e.target.value) }} /></label><button className="secondary" onClick={() => setDate(taipeiDate(new Date(now)))}>回到今天</button></div>
    <NutritionProgress day={nutritionDay(data, date)} now={now} />
    <div className="button-row"><button className="secondary" onClick={() => { setPaste(false); setForm({ input: { date, meal_type: 'lunch', items: [], entry_source: 'manual' } }) }}>手動輸入一餐</button><button className="primary" onClick={async()=>{setForm(null);setPaste(true);try{if(!navigator.clipboard?.readText)throw new Error();setPasteText(await navigator.clipboard.readText());setPasteManual(false)}catch{setPasteManual(true)}}}>貼上 Claude 估算</button></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {paste && <PastePanel raw={pasteText} setRaw={setPasteText} manual={pasteManual} onClose={()=>setPaste(false)} run={run} onSaved={savedDate=>{setDate(savedDate);setPaste(false);setPasteText('')}} />}
    {form && <MealForm key={form.existing?.id ?? `${form.input.entry_source}-${form.input.date}`} initial={form.input} existing={form.existing} onClose={savedDate => { setForm(null); if (savedDate) setDate(savedDate) }} run={run} />}
    <fieldset disabled={busy}>
      <section className="card"><h2>常用餐點</h2><p className="muted">一鍵加入 {date}，餐別沿用儲存時設定；加入後可編輯。</p>
        {!data.favorites.length && <p>先記一餐，再按「存成常用」。</p>}{data.favorites.map(f => <div className="favorite-row" key={f.id}><button className="secondary" onClick={() => void run(() => addFavorite(f.id, date))}>＋ {f.name} · {mealLabels[f.meal_type]}</button><button className="text-link" onClick={() => setDeleting(`favorite:${f.id}`)}>刪除常用</button></div>)}
      </section>
      {(Object.entries(mealLabels) as [MealType, string][]).map(([type, label]) => {
        const meals = data.meals.filter(m => m.date === date && m.meal_type === type)
        const total = sumNutrients(data.mealItems.filter(i => meals.some(m => m.id === i.meal_id)))
        return <section className="card" key={type}><h2>{label}</h2>{!meals.length && <p className="muted">尚未記錄。</p>}{meals.map(meal => {
          const items = data.mealItems.filter(i => i.meal_id === meal.id)
          const sum = sumNutrients(items)
          return <article className="meal-record" key={meal.id}>
            {items.map(item => <div className="food-line" key={item.id}><strong>{item.name} {item.is_estimate && <span className="badge estimate">估</span>}</strong><p>{formatN(item.grams)} g · {formatN(item.kcal)} kcal</p><p className="muted">蛋白質 {formatN(item.protein_g)} g · 碳水 {formatN(item.carbs_g)} g · 脂肪 {formatN(item.fat_g)} g</p></div>)}
            <p>這餐合計：{formatN(sum.kcal)} kcal · 蛋白質 {formatN(sum.protein_g)} g · 碳水 {formatN(sum.carbs_g)} g · 脂肪 {formatN(sum.fat_g)} g</p>
            <div className="button-row"><button className="secondary" onClick={() => { setPaste(false); setForm({ existing: meal, input: { date: meal.date, meal_type: meal.meal_type, items, entry_source: meal.entry_source ?? 'manual' } }) }}>編輯</button><button className="secondary" onClick={() => { setFavoriteFor(meal.id); setFavoriteName(items[0]?.name ?? '') }}>存成常用</button><button className="secondary" onClick={() => setDeleting(meal.id)}>刪除</button></div>
            {favoriteFor === meal.id && <div><label>常用餐點名稱<input value={favoriteName} onChange={e => setFavoriteName(e.target.value)} /></label><button className="primary" disabled={!favoriteName.trim()} onClick={() => void run(async () => { await saveFavorite(meal.id, favoriteName); setFavoriteFor(null) })}>儲存常用餐點</button><button className="secondary" onClick={() => setFavoriteFor(null)}>取消</button></div>}
          </article>
        })}{meals.length > 0 && <p className="meal-total">{label}合計：{formatN(total.kcal)} kcal · 蛋白質 {formatN(total.protein_g)} g · 碳水 {formatN(total.carbs_g)} g · 脂肪 {formatN(total.fat_g)} g</p>}</section>
      })}
    </fieldset>
    {deleting && <section role="alertdialog" aria-label="確認刪除餐點" className="card delete-confirm"><h2>確定刪除{deleting.startsWith('favorite:') ? '常用餐點' : '這餐紀錄'}？</h2><p>此操作無法復原。</p><button className="danger" disabled={busy} onClick={() => void run(async () => { if (deleting.startsWith('favorite:')) await db.rows('favorite_meals').delete(deleting.slice(9)); else await deleteMeal(deleting); setDeleting(null) })}>確認刪除</button><button className="secondary" onClick={() => setDeleting(null)}>取消</button></section>}
  </>
}
