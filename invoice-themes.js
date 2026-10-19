// Invoice PDF themes for Bill Pro — pure module (no JSX, no DOM).
// Palette keys: accent, gold, dark, mid, soft, bg, bgAlt, border,
// onAccent (text drawn on accent fills), headerSub, danger.
// header: 'band' | 'split' | 'minimal'. border: 'double' | 'single' | 'none'.

const NEUTRALS = {
  dark: [25, 25, 30],
  mid: [90, 100, 110],
  soft: [130, 140, 150],
  bg: [245, 247, 250],
  bgAlt: [235, 239, 244],
  border: [190, 198, 210],
  danger: [190, 40, 40],
}

const theme = (id, name, header, border, accent, gold, headerSub, onAccent = [255, 255, 255]) => ({
  id,
  name,
  header,
  border,
  watermark: false,
  watermarkOpacity: 0.08,
  palette: { accent, gold, ...NEUTRALS, onAccent, headerSub },
})

export const INVOICE_THEMES = [
  theme('classic-navy', 'Classic Navy', 'band', 'double', [22, 54, 92], [180, 140, 60], [200, 215, 230]),
  theme('royal-blue', 'Royal Blue', 'band', 'double', [30, 64, 175], [96, 165, 250], [191, 219, 254]),
  theme('emerald', 'Emerald', 'band', 'double', [6, 95, 70], [52, 190, 150], [167, 243, 208]),
  theme('burgundy', 'Burgundy', 'band', 'double', [127, 29, 29], [200, 150, 70], [252, 211, 210]),
  theme('charcoal', 'Charcoal', 'split', 'single', [31, 41, 55], [200, 150, 50], [209, 213, 219]),
  theme('teal', 'Teal', 'split', 'single', [15, 118, 110], [45, 190, 180], [153, 246, 228]),
  theme('plum', 'Plum', 'band', 'double', [88, 28, 135], [170, 120, 220], [233, 213, 255]),
  theme('chocolate', 'Chocolate', 'minimal', 'single', [120, 53, 15], [217, 160, 90], [254, 230, 210]),
  theme('crimson', 'Crimson', 'split', 'single', [185, 28, 28], [230, 150, 150], [254, 205, 205]),
  theme('slate', 'Slate', 'minimal', 'single', [51, 65, 85], [120, 135, 155], [203, 213, 225]),
  theme('forest', 'Forest', 'band', 'double', [20, 83, 45], [110, 200, 140], [187, 247, 208]),
  theme('indigo', 'Indigo', 'split', 'single', [67, 56, 202], [140, 155, 230], [199, 210, 254]),
]

export const CUSTOM_THEME_ID = 'custom'
export const DEFAULT_INVOICE_THEME_ID = 'classic-navy'
export const INVOICE_THEME_IDS = [...INVOICE_THEMES.map((t) => t.id), CUSTOM_THEME_ID]

const clampByte = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)))

export const hexToRgb = (hex) => {
  const m = String(hex || '').trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return null
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export const rgbToHex = (rgb) => {
  if (!Array.isArray(rgb) || rgb.length < 3) return '#16365c'
  return '#' + rgb.slice(0, 3).map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')
}

const mix = (a, b, t) => a.map((v, i) => clampByte(v + (b[i] - v) * t))

const luminance = (rgb) => (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255

export const normalizeInvoiceCustom = (raw = {}) => {
  const accent = hexToRgb(raw?.accent) || [...INVOICE_THEMES[0].palette.accent]
  const opacity = Number(raw?.watermarkOpacity ?? 0.08)
  return {
    accent: rgbToHex(accent),
    watermark: raw?.watermark !== false,
    watermarkOpacity: Math.min(0.15, Math.max(0.04, Number.isFinite(opacity) ? opacity : 0.08)),
  }
}

export const buildCustomTheme = (custom = {}) => {
  const norm = normalizeInvoiceCustom(custom)
  const base = hexToRgb(norm.accent)
  const light = luminance(base) > 0.6
  return {
    id: CUSTOM_THEME_ID,
    name: 'Custom',
    header: 'band',
    border: 'double',
    watermark: norm.watermark,
    watermarkOpacity: norm.watermarkOpacity,
    palette: {
      accent: base,
      gold: mix(base, [255, 255, 255], 0.45),
      ...NEUTRALS,
      onAccent: light ? [26, 26, 32] : [255, 255, 255],
      headerSub: light ? mix(base, [255, 255, 255], 0.25) : mix(base, [255, 255, 255], 0.78),
    },
  }
}

export const resolveInvoiceTheme = (shop) => {
  const id = shop?.invoiceTheme || DEFAULT_INVOICE_THEME_ID
  const base = id === CUSTOM_THEME_ID
    ? buildCustomTheme(shop?.invoiceCustom)
    : INVOICE_THEMES.find((t) => t.id === id) || INVOICE_THEMES[0]
  // Logo watermark is a global switch: it applies to whichever theme is active.
  const norm = normalizeInvoiceCustom(shop?.invoiceCustom)
  return { ...base, watermark: norm.watermark, watermarkOpacity: norm.watermarkOpacity }
}
