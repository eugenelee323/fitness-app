import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './style.css'

const updateSW = registerSW({
  onNeedRefresh() { window.dispatchEvent(new Event('app-update-ready')) },
  onOfflineReady() { window.dispatchEvent(new Event('app-offline-ready')) },
})
window.addEventListener('app-apply-update', () => { void updateSW(true) })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>,
)
