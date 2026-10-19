// Rupee subset fonts for jsPDF amounts (DejaVu Sans, OFL licensed).
// Each file holds only: ₹ U+20B9, space, + - , . and digits (~3KB each).
// Usage: await ensureRupeeFont(doc) once per document, then pdfRs(...)
// for every amount. Falls back to "Rs " in helvetica if unavailable.

const RUPEE_FILES = {
  normal: '/fonts/rupee-amount.ttf',
  bold: '/fonts/rupee-amount-bold.ttf',
}

const rupeeFontData = { normal: null, bold: null }

const bufToB64 = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

const fetchFontData = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('rupee font missing')
  return bufToB64(await res.arrayBuffer())
}

// Fire-and-forget preload at app startup so later PDFs never wait on network.
export const preloadRupeeFontData = () => {
  if (typeof fetch === 'undefined') return
  if (rupeeFontData.normal && rupeeFontData.bold) return
  void Promise.all([fetchFontData(RUPEE_FILES.normal), fetchFontData(RUPEE_FILES.bold)])
    .then(([normal, bold]) => {
      rupeeFontData.normal = normal
      rupeeFontData.bold = bold
    })
    .catch(() => { })
}

export const ensureRupeeFont = async (doc) => {
  try {
    if (!rupeeFontData.normal || !rupeeFontData.bold) {
      const [normal, bold] = await Promise.all([fetchFontData(RUPEE_FILES.normal), fetchFontData(RUPEE_FILES.bold)])
      rupeeFontData.normal = normal
      rupeeFontData.bold = bold
    }
    doc.addFileToVFS('RupeeAmount.ttf', rupeeFontData.normal)
    doc.addFont('RupeeAmount.ttf', 'RupeeAmount', 'normal')
    doc.addFileToVFS('RupeeAmount-Bold.ttf', rupeeFontData.bold)
    doc.addFont('RupeeAmount-Bold.ttf', 'RupeeAmount', 'bold')
    return true
  } catch {
    return false
  }
}

const currentStyleIsBold = (doc) => {
  try {
    const font = doc.getFont()
    return /bold/i.test(font?.fontStyle || font?.style || '')
  } catch {
    return false
  }
}

export const isRupeeFontReady = () => !!(rupeeFontData.normal && rupeeFontData.bold);

export const pdfRs = (doc, text, x, y, opts) => {
  const str = String(text)
  if (rupeeFontData.normal && rupeeFontData.bold) {
    let prev = null
    try {
      prev = doc.getFont()
    } catch {
      prev = null
    }
    try {
      doc.setFont('RupeeAmount', currentStyleIsBold(doc) ? 'bold' : 'normal')
      const out = doc.text(str, x, y, opts)
      if (prev) doc.setFont(prev.fontName, prev.fontStyle)
      else doc.setFont('helvetica', 'normal')
      return out
    } catch {
      try {
        if (prev) doc.setFont(prev.fontName, prev.fontStyle)
        else doc.setFont('helvetica', 'normal')
      } catch { }
    }
  }
  doc.setFont('helvetica', 'normal')
  return doc.text(str.replace('₹', 'Rs '), x, y, opts)
}
