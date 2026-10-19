import {
  INVOICE_THEMES, CUSTOM_THEME_ID, DEFAULT_INVOICE_THEME_ID, INVOICE_THEME_IDS,
  hexToRgb, rgbToHex, normalizeInvoiceCustom, buildCustomTheme, resolveInvoiceTheme,
} from './invoice-themes.js'
import { jsPDF } from 'jspdf'

let pass = 0
const check = (name, ok, detail = '') => {
  pass += ok ? 1 : 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

const KEYS = ['accent', 'gold', 'dark', 'mid', 'soft', 'bg', 'bgAlt', 'border', 'onAccent', 'headerSub', 'danger']
const validRgb = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)

check('12 built-in themes', INVOICE_THEMES.length === 12, String(INVOICE_THEMES.length))
check('unique theme ids', new Set(INVOICE_THEMES.map((t) => t.id)).size === 12)
check('ids list includes custom', INVOICE_THEME_IDS.length === 13 && INVOICE_THEME_IDS.includes(CUSTOM_THEME_ID))
let palettesOk = true
let motifsOk = true
for (const t of INVOICE_THEMES) {
  if (!KEYS.every((k) => validRgb(t.palette[k]))) { palettesOk = false; console.log('  bad palette: ' + t.id) }
  if (!['band', 'split', 'minimal'].includes(t.header) || !['double', 'single', 'none'].includes(t.border)) { motifsOk = false; console.log('  bad motif: ' + t.id) }
}
check('all palettes valid rgb', palettesOk)
check('all motifs valid', motifsOk)
check('hex round-trip', JSON.stringify(hexToRgb(rgbToHex([22, 54, 92]))) === '[22,54,92]')
check('bad hex rejected', hexToRgb('zzz') === null && hexToRgb('#12345') === null)
check('resolver default', resolveInvoiceTheme(null).id === DEFAULT_INVOICE_THEME_ID)
check('resolver fallback on unknown', resolveInvoiceTheme({ invoiceTheme: 'nope' }).id === DEFAULT_INVOICE_THEME_ID)
check('resolver picks theme', resolveInvoiceTheme({ invoiceTheme: 'emerald' }).id === 'emerald')
const custom = resolveInvoiceTheme({ invoiceTheme: 'custom', invoiceCustom: { accent: '#b91c1c', watermark: true, watermarkOpacity: 0.12 } })
check('custom resolves', custom.id === 'custom' && custom.watermark === true && custom.watermarkOpacity === 0.12)
check('custom accent applied', JSON.stringify(custom.palette.accent) === '[185,28,28]')
check('custom clamps opacity', buildCustomTheme({ accent: '#000000', watermarkOpacity: 9 }).watermarkOpacity === 0.15)
check('custom light accent gets dark text', JSON.stringify(buildCustomTheme({ accent: '#f5e6c8' }).palette.onAccent) === '[26,26,32]')
check('normalize defaults', (() => { const n = normalizeInvoiceCustom({}); return n.accent === '#16365c' && n.watermark === true && n.watermarkOpacity === 0.08 })())
check('watermark global on built-in', resolveInvoiceTheme({ invoiceTheme: 'emerald', invoiceCustom: { watermark: true, watermarkOpacity: 0.1 } }).watermark === true)
check('watermark global default on', resolveInvoiceTheme({ invoiceTheme: 'slate' }).watermark === true)
check('watermark global off', resolveInvoiceTheme({ invoiceTheme: 'slate', invoiceCustom: { watermark: false } }).watermark === false)

// jsPDF watermark primitives smoke test (Node, no DOM needed)
import { readFileSync } from 'node:fs'
try {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const hasGState = typeof doc.GState === 'function'
  check('jsPDF GState available', hasGState)
  if (hasGState) {
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity: 0.08 }))
    const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    doc.addImage(`data:image/png;base64,${px}`, 'PNG', 65, 100, 80, 80)
    doc.restoreGraphicsState()
    doc.setFontSize(20)
    doc.text('Hello', 20, 20)
    const buf = doc.output('arraybuffer')
    check('watermarked pdf generates', buf && buf.byteLength > 2000, String(buf && buf.byteLength))
    const doc2 = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc2.addFileToVFS('RupeeAmount.ttf', readFileSync('public/fonts/rupee-amount.ttf').toString('base64'))
    doc2.addFont('RupeeAmount.ttf', 'RupeeAmount', 'normal')
    doc2.addFileToVFS('RupeeAmount-Bold.ttf', readFileSync('public/fonts/rupee-amount-bold.ttf').toString('base64'))
    doc2.addFont('RupeeAmount-Bold.ttf', 'RupeeAmount', 'bold')
    doc2.setFont('RupeeAmount', 'bold')
    doc2.setFontSize(12)
    doc2.text('₹79,999.00', 20, 20)
    doc2.setFont('RupeeAmount', 'normal')
    doc2.text('₹0', 20, 30)
    const buf2 = doc2.output('arraybuffer')
    check('rupee font VFS flow prints ₹', buf2 && buf2.byteLength > 3000, String(buf2 && buf2.byteLength))
  }
} catch (e) {
  check('watermarked pdf generates', false, e.message)
}

console.log(`\n${pass} checks passed${process.exitCode ? ' (WITH FAILURES)' : ''}`)
