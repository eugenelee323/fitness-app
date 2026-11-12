import { useState } from 'react'
import { applyTheme,themePreference,type ThemePreference } from '../lib/theme'
import { db } from '../db'
export function ThemeSettings(){const [value,setValue]=useState(themePreference);return <section className="card"><h2>外觀</h2><label>主題<select value={value} onChange={e=>{const next=e.target.value as ThemePreference;setValue(next);applyTheme(next);void db.rows('app_meta').put({key:'theme',value:next})}}><option value="system">跟隨系統</option><option value="dark">深色</option><option value="light">淺色</option></select></label><p className="muted">預設深色，所有資料仍保留在本機。</p></section>}
