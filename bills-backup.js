const TX_COLUMNS = [
    'id', 'type', 'invoiceNo', 'billType', 'date', 'dateTime', 'customerName', 'phone', 'customerAddress', 'salesman',
    'itemLabel', 'category', 'serialNo', 'brand', 'model', 'color', 'ram', 'storage',
    'condition', 'imei', 'imei2', 'qty', 'amount', 'paidAmount', 'dueAmount', 'costPrice',
    'totalAmount', 'gstRate', 'taxableAmount', 'gstAmount', 'cgstAmount', 'sgstAmount',
    'paymentMode', 'notes', 'returnOfInvoiceNo', 'returnOfTxId', 'refundAmount', 'returnReason',
    'pdfFileName', 'pdfSavedAt',
]

const SHOP_COLUMNS = [
    'shopName', 'shopAddress', 'shopPhone', 'shopEmail', 'shopGstin', 'shopState',
    'shopStateCode', 'shopInvoicePrefix', 'shopDefaultBillType', 'shopDefaultGstRate',
    'shopHsnCode', 'shopFooter', 'shopTerms', 'shopOwnerName', 'shopInvoiceTheme', 'shopInvoiceCustom',
    'shopInvoiceLayout', 'shopWarrantyLangs',
]

export const BILLS_BACKUP_FILE_NAME = 'PD-bills-backup.csv'

export const BILLS_BACKUP_COLUMNS = [...SHOP_COLUMNS, ...TX_COLUMNS]

const escapeCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
}

export const parseCsv = (text) => {
    const rows = []
    let row = []
    let cell = ''
    let quoted = false
    const src = String(text || '')
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i]
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i += 1 } else quoted = false
            } else cell += ch
            continue
        }
        if (ch === '"') { quoted = true; continue }
        if (ch === ',') { row.push(cell); cell = ''; continue }
        if (ch === '\r') continue
        if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
        cell += ch
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row) }
    return rows.filter((entry) => entry.some((value) => String(value).trim() !== ''))
}

const shopCell = (shop, key) => {
    const map = {
        shopName: shop?.shopName,
        shopAddress: shop?.address,
        shopPhone: shop?.phone,
        shopEmail: shop?.email,
        shopGstin: shop?.gstin,
        shopState: shop?.state,
        shopStateCode: shop?.stateCode,
        shopInvoicePrefix: shop?.invoicePrefix,
        shopDefaultBillType: shop?.defaultBillType,
        shopDefaultGstRate: shop?.defaultGstRate,
        shopHsnCode: shop?.hsnCode,
        shopFooter: shop?.footer,
        shopTerms: shop?.terms,
        shopOwnerName: shop?.ownerName,
        shopInvoiceTheme: shop?.invoiceTheme,
        shopInvoiceCustom: shop?.invoiceCustom ? JSON.stringify(shop.invoiceCustom) : '',
        shopInvoiceLayout: shop?.invoiceLayout,
        shopWarrantyLangs: Array.isArray(shop?.warrantyLangs) ? shop.warrantyLangs.join(',') : '',
    }
    return map[key]
}

const txCell = (tx, key) => {
    if (key === 'pdfFileName') return tx?.pdfFileName
    if (key === 'pdfSavedAt') return tx?.pdfSavedAt
    return tx?.[key]
}

export const buildBillsBackupCsv = ({ sales = [], shopProfile = null } = {}) => {
    const lines = [BILLS_BACKUP_COLUMNS.join(',')]
    for (const sale of sales) {
        const cells = BILLS_BACKUP_COLUMNS.map((column) => {
            const raw = SHOP_COLUMNS.includes(column) ? shopCell(shopProfile, column) : txCell(sale, column)
            return escapeCell(raw)
        })
        lines.push(cells.join(','))
    }
    return lines.join('\r\n') + '\r\n'
}

const readShopProfile = (row) => {
    const profile = {}
    if (row.shopName) profile.shopName = row.shopName
    if (row.shopAddress) profile.address = row.shopAddress
    if (row.shopPhone) profile.phone = row.shopPhone
    if (row.shopEmail) profile.email = row.shopEmail
    if (row.shopGstin) profile.gstin = row.shopGstin
    if (row.shopState) profile.state = row.shopState
    if (row.shopStateCode) profile.stateCode = row.shopStateCode
    if (row.shopInvoicePrefix) profile.invoicePrefix = row.shopInvoicePrefix
    if (row.shopDefaultBillType) profile.defaultBillType = row.shopDefaultBillType
    if (row.shopDefaultGstRate) profile.defaultGstRate = Number(row.shopDefaultGstRate) || 0
    if (row.shopHsnCode) profile.hsnCode = row.shopHsnCode
    if (row.shopFooter) profile.footer = row.shopFooter
    if (row.shopTerms) profile.terms = row.shopTerms
    if (row.shopOwnerName) profile.ownerName = row.shopOwnerName
    if (row.shopInvoiceTheme) profile.invoiceTheme = row.shopInvoiceTheme
    if (row.shopInvoiceCustom) {
        try {
            const parsed = JSON.parse(row.shopInvoiceCustom)
            if (parsed && typeof parsed === 'object') profile.invoiceCustom = parsed
        } catch { }
    }
    if (row.shopInvoiceLayout) profile.invoiceLayout = row.shopInvoiceLayout
    if (row.shopWarrantyLangs) profile.warrantyLangs = String(row.shopWarrantyLangs).split(',').map((v) => v.trim()).filter(Boolean)
    return Object.keys(profile).length ? profile : null
}

export const parseBillsBackupCsv = (text) => {
    const rows = parseCsv(text)
    if (!rows.length) throw new Error('That file has no rows.')
    const header = rows[0].map((value) => String(value || '').trim())
    const hasId = header.includes('id')
    const hasInvoice = header.includes('invoiceNo')
    if (!hasId && !hasInvoice) throw new Error('That file does not look like a PhoneDukaan bills backup.')
    const sales = []
    let shopProfile = null
    for (const values of rows.slice(1)) {
        const record = {}
        header.forEach((key, index) => { record[key] = values[index] ?? '' })
        if (!shopProfile) shopProfile = readShopProfile(record)
        const hasTxData = TX_COLUMNS.some((key) => String(record[key] || '').trim() !== '')
        if (!hasTxData) continue
        sales.push(record)
    }
    return { sales, shopProfile, columns: header }
}
