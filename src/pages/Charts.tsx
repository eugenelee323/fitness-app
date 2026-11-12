import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts'
import { db } from '../db'
import { loadWeeklyInput } from '../lib/weekly'
import { trainingTrends, dayVolumeChanges, bodyTrends, nutritionTrends } from '../lib/rules/charts'
import { calendarDate } from '../lib/rules/nutrition'
import { MAIN_LIFTS } from '../lib/rules/weekly'
import { muscleLabels } from '../lib/rules/workout'
import { formatN } from '../lib/format'
import { useClock } from '../hooks/useClock'
import { taipeiDate } from '../lib/time'
const percent=(v:number|null)=>v==null?'無對照':`${v>=0?'+':''}${(v*100).toFixed(1)}%`
function ChartFrame({ title, children }: { title:string;children:ReactNode }) {return <div className="chart-frame" role="img" aria-label={title}><ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer></div>}
function DataTable({children}:{children:ReactNode}) {return <details className="chart-values"><summary>查看圖表數值</summary><div className="table-scroll">{children}</div></details>}
export function Charts() {
  const today=taipeiDate(new Date(useClock()))
  const [end,setEnd]=useState(today)
  const [muscle,setMuscle]=useState<keyof typeof muscleLabels>('chest')
  const [exercise,setExercise]=useState('main')
  const data=useLiveQuery(()=>db.transaction('r',db.tables,()=>loadWeeklyInput()))
  if(data===undefined)return <p role="status">讀取分析圖表中…</p>
  if(!data)return <section className="card"><p>尚無計畫，請重新開啟 App 初始化。</p></section>
  const weeks=dayVolumeChanges(trainingTrends(data))
  const body=bodyTrends(data.bodyMetrics ?? [],end)
  const diet=nutritionTrends(data,end)
  const selected=data.exercises.filter(ex=>exercise==='main'?MAIN_LIFTS.includes(ex.code):ex.id===exercise)
  const strength=weeks.map(w=>({label:w.label,...Object.fromEntries(selected.map(ex=>[ex.id,w.exercises.find(e=>e.exercise.id===ex.id)?.best ?? null]))}))
  const colors=['#245e4d','#b06730','#5c61a4']
  const muscleData=weeks.map(w=>({label:w.label,sets:w.hasData?w.muscles[muscle].sets:null}))
  const hasTraining=weeks.some(w=>w.hasData)
  return <div className="charts">
    <section className="card"><h2>各肌群每週有效組數</h2><label>肌群<select value={muscle} onChange={e=>setMuscle(e.target.value as keyof typeof muscleLabels)}>{Object.entries(muscleLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><p className="muted">陰影標出每週 10–20 組建議區間；單手左右合計一組，RIR ≤ 3 才計有效組數。</p>
      {hasTraining?<ChartFrame title={`${muscleLabels[muscle]}每週有效組數`}><BarChart data={muscleData} margin={{left:-16,right:10,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" /><YAxis domain={[0,'auto']} fontSize={11} allowDecimals={false} /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><ReferenceArea y1={10} y2={20} fill="#b7c99f" fillOpacity={.25} ifOverflow="extendDomain" /><Bar dataKey="sets" name="有效組數" fill="#397a53" isAnimationActive={false} /></BarChart></ChartFrame>:<p className="empty-chart">尚無已結束的訓練。記錄並結束訓練後就能看見組數趨勢。</p>}
      <DataTable><table><thead><tr><th>週次</th><th>有效組數</th></tr></thead><tbody>{muscleData.map(w=><tr key={w.label}><td>{w.label}</td><td>{w.sets==null?'未記錄':formatN(w.sets)}</td></tr>)}</tbody></table></DataTable>
    </section>
    <section className="card"><h2>每週容量趨勢</h2><p className="note">容量增加不等於肌肉增加</p><p className="muted">單位 kg；推日、拉日、補量日及合計分開呈現。缺紀錄或缺體重的容量留空；A／B 菜單與減量週也會影響容量。</p>
      {hasTraining?<ChartFrame title="每週推日拉日與總容量"><LineChart data={weeks} margin={{left:-14,right:10,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" /><YAxis fontSize={11} width={65} /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><Legend wrapperStyle={{fontSize:12}} /><Line dataKey="push" name="推日 kg" stroke={colors[0]} isAnimationActive={false} /><Line dataKey="pull" name="拉日 kg" stroke={colors[1]} isAnimationActive={false} /><Line dataKey="extra" name="補量日 kg" stroke="#70835b" isAnimationActive={false} /><Line dataKey="total" name="合計 kg" stroke={colors[2]} strokeWidth={2} isAnimationActive={false} /></LineChart></ChartFrame>:<p className="empty-chart">尚無容量紀錄。完成第一筆訓練後顯示。</p>}
      <DataTable><table><thead><tr><th>週次</th><th>推日 kg／週變化</th><th>拉日 kg／週變化</th><th>補量日 kg</th><th>合計 kg／週變化</th></tr></thead><tbody>{weeks.map(w=><tr key={w.weekNo}><td>{w.label}</td><td>{w.push==null?'未記錄／資料不足':formatN(w.push)}／{percent(w.pushChange)}</td><td>{w.pull==null?'未記錄／資料不足':formatN(w.pull)}／{percent(w.pullChange)}</td><td>{w.extra==null?'未記錄':formatN(w.extra)}</td><td>{w.total==null?'未記錄／資料不足':formatN(w.total)}／{percent(w.change)}</td></tr>)}</tbody></table></DataTable>
    </section>
    <section className="card"><h2>動作 e1RM 曲線</h2><label>比較動作<select value={exercise} onChange={e=>setExercise(e.target.value)}><option value="main">三個主動作</option>{data.exercises.map(ex=><option key={ex.id} value={ex.id}>{ex.name_zh}／{ex.name_en}</option>)}</select></label><p className="muted">每週取該動作最佳一組的估計最大重量（kg）；徒手動作包含當次體重。缺體重不推估。</p>
      {weeks.some(w=>w.exercises.some(e=>selected.some(ex=>ex.id===e.exercise.id)&&e.best!=null))?<ChartFrame title="動作每週 e1RM"><LineChart data={strength} margin={{left:-20,right:12,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" /><YAxis fontSize={11} /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><Legend wrapperStyle={{fontSize:11}} />{selected.map((ex,i)=><Line key={ex.id} dataKey={ex.id} name={ex.name_zh} stroke={colors[i%colors.length]} isAnimationActive={false} strokeWidth={2} />)}</LineChart></ChartFrame>:<p className="empty-chart">所選動作尚無足夠紀錄，請先記錄一次並結束訓練。</p>}
      <p className="muted">{selected.map(ex=>`${ex.name_zh}／${ex.name_en}`).join('、')}</p><DataTable><table><thead><tr><th>週次</th>{selected.map(ex=><th key={ex.id}>{ex.name_zh} kg</th>)}</tr></thead><tbody>{weeks.map(w=><tr key={w.weekNo}><td>{w.label}</td>{selected.map(ex=>{const value=w.exercises.find(e=>e.exercise.id===ex.id)?.best;return <td key={ex.id}>{value==null?'無資料':formatN(value)}</td>})}</tr>)}</tbody></table></DataTable>
    </section>
    <section className="card"><h2>身體與飲食圖表日期</h2><label>最近 4 週結束日期<input type="date" aria-label="圖表結束日期" value={end} max={today} onChange={e=>{if(e.target.value)setEnd(e.target.value)}} /></label><p>{calendarDate(end,-27)} ～ {end}</p><Link to="/body" className="text-link">輸入／編輯身體數據 →</Link></section>
    <section className="card"><h2>每週體重趨勢</h2><p className="muted">每週一點，週一至週日取最後一筆；本週與前三週。固定週日早上起床如廁後、進食前量測，缺週不補 0。</p>
      {body.some(p=>p.weight!=null)?<ChartFrame title="每週體重 kg"><LineChart data={body} margin={{left:-16,right:12,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" fontSize={11} /><YAxis domain={['auto','auto']} fontSize={11} /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><Legend wrapperStyle={{fontSize:12}} /><Line dataKey="weight" name="每週體重 kg" stroke="#9d6839" strokeWidth={2} dot={{r:3,fill:'#9d6839',stroke:'#9d6839',strokeWidth:1}} isAnimationActive={false} /></LineChart></ChartFrame>:<p className="empty-chart">這段日期沒有體重紀錄，先記一筆體重。</p>}
    </section>
    <section className="card"><h2>腰圍趨勢</h2><p className="muted">每週選填，取該週最後一筆，單位 cm；缺週不連線。</p>
      {body.some(p=>p.waist!=null)?<ChartFrame title="腰圍趨勢 cm"><LineChart data={body} margin={{left:-16,right:12,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" fontSize={11} /><YAxis domain={['auto','auto']} fontSize={11} /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><Line dataKey="waist" name="腰圍 cm" stroke="#b06730" dot={{r:4}} isAnimationActive={false} /></LineChart></ChartFrame>:<p className="empty-chart">這段日期沒有腰圍紀錄，每週可在身體數據頁選填一次。</p>}
      <DataTable><table><thead><tr><th>日期</th><th>體重 kg</th><th>採用紀錄日期</th><th>腰圍 cm</th></tr></thead><tbody>{body.map(p=><tr key={p.date}><td>{p.date}</td><td>{p.weight==null?'未記錄':formatN(p.weight)}</td><td>{p.recordedAt??'未記錄'}</td><td>{p.waist==null?'未記錄':formatN(p.waist)}</td></tr>)}</tbody></table></DataTable>
    </section>
    <section className="card"><h2>每日熱量與蛋白質（最近 4 週）</h2><p className="muted">以各日生效目標計算；100% 為目標值，熱量 90–110% 為達標區間，蛋白質 ≥100% 為達標。未記錄餐點的日期標示「未記錄」。</p>
      {diet.some(d=>d.kcalPercent!=null||d.proteinPercent!=null)?<ChartFrame title="每日熱量與蛋白質目標百分比"><LineChart data={diet} margin={{left:-14,right:12,top:12,bottom:4}} accessibilityLayer><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" interval="preserveStartEnd" fontSize={11} /><YAxis fontSize={11} unit="%" /><Tooltip formatter={value=>typeof value==='number'?formatN(value):value} /><Legend wrapperStyle={{fontSize:12}} /><ReferenceArea y1={90} y2={110} fill="#e2eacb" fillOpacity={.4} ifOverflow="extendDomain" /><ReferenceLine y={100} stroke="#718168" strokeDasharray="4 4" /><Line dataKey="kcalPercent" name="熱量 %" stroke={colors[0]} isAnimationActive={false} /><Line dataKey="proteinPercent" name="蛋白質 %" stroke={colors[1]} isAnimationActive={false} /></LineChart></ChartFrame>:<p className="empty-chart">這段日期尚無可比較的餐點與營養目標。請先記餐並匯入營養目標。</p>}
      <div className="diet-calendar" aria-label="最近四週每日達標日曆">{diet.map(d=><div className={`diet-day diet-${d.recorded?d.status:'empty'}`} key={d.date} title={`${d.date} · 熱量 ${formatN(d.total.kcal)} kcal · 蛋白質 ${formatN(d.total.protein_g)} g`}><small>{d.label}</small><strong>{!d.recorded?'未記錄':{met:'達標',partial:'部分',missed:'未達',unknown:'無目標'}[d.status]}</strong></div>)}</div>
      <DataTable><table><thead><tr><th>日期</th><th>熱量 kcal／達標</th><th>蛋白質 g／達標</th><th>當日狀態</th></tr></thead><tbody>{diet.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.recorded?formatN(d.total.kcal):'未記錄'}／{d.kcalMet==null?'無對照':d.kcalMet?'達標':'未達標'}</td><td>{d.recorded?formatN(d.total.protein_g):'未記錄'}／{d.proteinMet==null?'無對照':d.proteinMet?'達標':'未達標'}</td><td>{!d.recorded?'未記錄':{met:'達標',partial:'部分達標',missed:'未達標',unknown:'未設定目標'}[d.status]}</td></tr>)}</tbody></table></DataTable>
    </section>
  </div>
}
