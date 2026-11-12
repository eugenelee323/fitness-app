import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createCsvZip } from '../lib/csv'
import { db } from '../db'
import { createBackup, prepareBackup, restoreBackup, tableLabels, type BackupPreview } from '../lib/backup'

export function BackupPanel() {
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [includePhotos,setIncludePhotos]=useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const last = useLiveQuery(() => db.rows('app_meta').get('last_backup_at'))
  return <section className="card"><h2>完整備份與還原</h2><p>包含所有紀錄、課表、進行中訓練與匯入對應，可在另一個裝置還原。</p><p className="muted">最近匯出：{typeof last?.value === 'string' ? new Date(last.value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '尚未備份'}</p>
    <label className="confirm-label"><input type="checkbox" checked={includePhotos} disabled={busy} onChange={e=>setIncludePhotos(e.target.checked)} />包含動作照片（預設包含；以 base64 儲存）</label><p className="muted">未含照片的備份仍可還原；整庫取代時，本機原照片會依備份內容取代或清除。</p><div className="button-row"><button className="primary" disabled={busy} onClick={async () => {
      setBusy(true); setError(''); setMessage('')
      try {
        const backup = await createBackup(db,new Date(),{includePhotos})
        const url = URL.createObjectURL(new Blob([backup.content], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = backup.filename; document.body.append(link); link.click(); link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60000)
        setMessage('已產生完整備份，請確認檔案已儲存到「檔案」或下載項目。')
      } catch { setError('匯出失敗，請重試。') } finally { setBusy(false) }
    }}>匯出完整備份</button><button className="secondary" disabled={busy} onClick={() => input.current?.click()}>匯入完整備份</button><button className="secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError(''); setMessage('')
      try {
        const csv = await createCsvZip()
        const url = URL.createObjectURL(new Blob([new Uint8Array(csv.bytes).buffer], { type: 'application/zip' }))
        const link = document.createElement('a'); link.href = url; link.download = csv.filename; document.body.append(link); link.click(); link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 60000)
        setMessage('CSV ZIP 已產生，每張表一個 CSV，支援 Excel 中文。CSV 用於檢視分析，完整還原仍請使用 JSON 備份。')
      } catch { setError('CSV 匯出失敗，請重試。') } finally { setBusy(false) }
    }}>匯出 CSV ZIP</button></div>
    <input className="file-input" ref={input} type="file" accept=".json,application/json" aria-label="選擇完整備份 JSON" disabled={busy} onChange={async event => {
      const file = event.target.files?.[0]; setPreview(null); setConfirmed(false); setError(''); setMessage('')
      if (!file) return
      setBusy(true)
      try { if (file.size > 150 * 1024 * 1024) throw new Error('備份檔超過 150 MB。'); setPreview(prepareBackup(await file.text())) } catch { setError('備份檔無效：請檢查版本、資料表、數值與關聯。原資料沒有變更。') } finally { setBusy(false); event.target.value = '' }
    }} />
    {preview && <div className="import-preview"><h3>還原預覽</h3><p>備份時間：{new Date(preview.exportedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p><dl>{preview.counts.map(row => <div key={row.name}><dt>{tableLabels[row.name]}</dt><dd>{row.count} 筆</dd></div>)}</dl><label className="confirm-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我了解還原將整庫取代目前資料，包含進行中訓練。</label><button className="danger" disabled={busy || !confirmed} onClick={async () => {
      setBusy(true); setError('')
      try { await restoreBackup(preview); setPreview(null); setMessage('完整備份已還原。') } catch { setError('還原失敗，原資料已完整保留。') } finally { setBusy(false) }
    }}>確認整庫取代</button><button className="secondary" disabled={busy} onClick={() => setPreview(null)}>取消還原</button></div>}
    {message && <p role="status" className="success">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>
}
