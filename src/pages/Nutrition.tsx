import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Row } from '../db/schema'
import { mealData, saveMeal, deleteMeal, saveFavorite, addFavorite, mealInputSchema, type MealInput } from '../db/meals'
import { parseMealText, mealLabels, type MealValue, type MealType } from '../lib/paste'
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

function PastePanel({ onImport, onClose }: { onImport: (input: MealInput) => void; onClose: () => void }) {
  const [raw, setRaw] = useState('')
  const parsed = parseMealText(raw)
  function fix(lineNumber: number, value: string) { const lines = raw.split(/\r?\n/); lines[lineNumber - 1] = value; setRaw(lines.join('\n')) }
  return <section className="card"><h2>貼上 Claude 估算</h2><p className="muted">把 Claude 的固定格式回覆整段貼入。飲料 1 ml 以 1 g 記錄。</p>
    <label>餐點文字<textarea rows={7} value={raw} onChange={e => setRaw(e.target.value)} placeholder={'#餐點 2026-11-11 午餐\n雞腿便當 | 550 g | 820 kcal | P 38 | C 95 | F 30\n無糖豆漿 | 450 ml | 150 kcal | P 15 | C 8 | F 7'} /></label>
    {raw && parsed.headerError && <p className="error" role="alert">{parsed.headerError}請在上方修正。</p>}
    {parsed.header && <p>{parsed.header.date} · {mealLabels[parsed.header.meal_type]} · {parsed.lines.filter(line => line.item).length} 項可解析</p>}
    {parsed.lines.map(line => <div key={line.lineNumber} className={line.error ? 'paste-line invalid-line' : 'paste-line'}>{line.error
      ? <label>第 {line.lineNumber} 行：{line.error}<input aria-invalid="true" value={line.text} onChange={e => fix(line.lineNumber, e.target.value)} /></label>
      : <p>✓ {line.item?.name} · {line.item?.grams} g · {line.item?.kcal} kcal <span className="badge">估</span></p>}</div>)}
    <div className="button-row"><button className="primary" disabled={!parsed.valid} onClick={() => parsed.header && onImport({ ...parsed.header, items: parsed.lines.flatMap(line => line.item ? [line.item] : []), entry_source: 'paste' })}>核對各項目</button><button className="secondary" onClick={onClose}>取消</button></div>
  </section>
}

export function Nutrition() {
  const now = useClock()
  const [date, setDate] = useState(() => taipeiDate(new Date(now)))
  const [form, setForm] = useState<{ input: MealInput; existing?: Row<'meals'> } | null>(null)
  const [paste, setPaste] = useState(false)
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
    <div className="button-row"><button className="primary" onClick={() => { setPaste(false); setForm({ input: { date, meal_type: 'lunch', items: [], entry_source: 'manual' } }) }}>手動輸入一餐</button><button className="secondary" onClick={() => { setForm(null); setPaste(!paste) }}>貼上 Claude 估算</button></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status" className="success">{message}</p>}
    {paste && <PastePanel onClose={() => setPaste(false)} onImport={input => { setDate(input.date); setForm({ input }); setPaste(false) }} />}
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
