import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './mobile-dukaan_2.jsx'
import { preloadRupeeFontData } from './pdf-font.js'

const isElectronShell = typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || "")
if (import.meta.env.PROD && !isElectronShell) {
  registerSW({ immediate: true })
}
preloadRupeeFontData()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
