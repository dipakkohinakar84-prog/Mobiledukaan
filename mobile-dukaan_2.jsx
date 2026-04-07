import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
    Smartphone, Plus, ShoppingCart, TrendingUp, BarChart3, Settings,
    Camera, X, Search, Filter, Edit2, Trash2, Package, IndianRupee,
    ArrowDownCircle, ArrowUpCircle, CheckCircle, AlertCircle, ChevronDown,
    Home, ClipboardList, ScanLine, Eye, FileText, RefreshCw, Wifi, WifiOff,
    User, Phone, Calendar, Hash, Palette, HardDrive, Tag, Layers, LogOut,
    ChevronRight, CreditCard, Banknote, QrCode, LayoutGrid, List, Bell,
    ImagePlus, Images, ChevronLeft, ZoomIn, RotateCcw, Upload, Aperture, Battery,
    Download, Share2, Lock, MapPin, Mail, Printer, Zap, Shield, Clock,
    Trash, ArchiveRestore
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { loadAppState, loadSyncState, saveAppState, saveSyncState, savePhotoBlob, loadPhotoBlob, deletePhotoBlob } from "./app-storage.js";
import { getPocketBaseUrl, pocketbaseAdminExtendUserTrial, pocketbaseAdminLoadDashboard, pocketbaseAdminLogin, pocketbaseAdminLogout, pocketbaseAdminSendPasswordReset, pocketbaseAdminSession, pocketbaseAdminUpdateSettings, pocketbaseAdminUpdateShop, pocketbaseAdminUpdateUser, pocketbaseCreateTransaction, pocketbaseDeleteInventory, pocketbaseGetTrialDays, pocketbaseIsTrialExpired, pocketbaseListShops, pocketbaseLoadShopBundle, pocketbaseRegisterShopUser, pocketbaseRequestPasswordReset, pocketbaseSaveShop, pocketbaseShopLogin, pocketbaseUpdateShopProfile, pocketbaseUploadPhoto, pocketbaseUpsertInventory, subscribeToShopData, unsubscribeFromShopData } from "./pocketbase-client.js";

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const daysInStock = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const fmtCurrency = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const CONDITIONS = ["New", "Refurbished", "Used"];
const STATUSES = ["In Stock", "Sold", "Deleted"];
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "EMI"];
const BRANDS = ["Samsung", "Apple", "OnePlus", "Xiaomi", "Vivo", "Oppo", "Realme", "Motorola", "Nothing", "Google", "iQOO", "Poco", "Other"];
const REPORT_TYPES = ["All", "Buy", "Sell", "Add"];
const REPORT_RANGE_PRESETS = ["Today", "Yesterday", "This Week", "This Month", "Custom"];
const REPORT_BILL_FILTERS = ["All Bills", "GST", "Regular"];
const REPORT_VIEWS = ["Transactions", "Customer Ledger", "Supplier Summary"];
const REPORT_DUE_FILTERS = ["All Status", "Due Only", "Paid Only"];
const PHOTO_PREVIEW_MAX = 900;

const BRAND_GRADIENTS = {
    Samsung: "linear-gradient(135deg, #1428a0, #0b79d0)", Apple: "linear-gradient(135deg, #1d1d1f, #555)",
    OnePlus: "linear-gradient(135deg, #eb0028, #ff4444)", Xiaomi: "linear-gradient(135deg, #ff6700, #ffaa00)",
    Vivo: "linear-gradient(135deg, #415fff, #7c3aed)", Oppo: "linear-gradient(135deg, #1a8a38, #4ade80)",
    Realme: "linear-gradient(135deg, #ffc600, #ffdd57)", Motorola: "linear-gradient(135deg, #5c068c, #a855f7)",
    Nothing: "linear-gradient(135deg, #d3d3d3, #f5f5f5)", Google: "linear-gradient(135deg, #4285f4 0%, #34a853 50%, #ea4335 100%)",
    iQOO: "linear-gradient(135deg, #ff4500, #ff8c00)", Poco: "linear-gradient(135deg, #ffc600, #1a1a2e)",
    Other: "linear-gradient(135deg, #374151, #6b7280)",
};

const DEMO_INVENTORY = [
    { id: "d1", imei: "353456789012345", brand: "Samsung", model: "Galaxy S24 Ultra", color: "Titanium Black", storage: "256GB", condition: "New", buyPrice: 84999, sellPrice: 94999, status: "In Stock", qty: 1, addedDate: "2026-03-15", supplier: "Galaxy Distributors", photos: [] },
    { id: "d2", imei: "350123456789012", brand: "Apple", model: "iPhone 16 Pro Max", color: "Desert Titanium", storage: "512GB", condition: "New", buyPrice: 139900, sellPrice: 149900, status: "In Stock", qty: 1, addedDate: "2026-03-14", supplier: "Apple Authorized", photos: [] },
    { id: "d3", imei: "358765432109876", brand: "OnePlus", model: "13", color: "Midnight Ocean", storage: "256GB", condition: "New", buyPrice: 52999, sellPrice: 59999, status: "In Stock", qty: 1, addedDate: "2026-03-12", supplier: "OP Direct", photos: [] },
    { id: "d4", imei: "354321098765432", brand: "Apple", model: "iPhone 15", color: "Blue", storage: "128GB", condition: "Refurbished", buyPrice: 49999, sellPrice: 57999, status: "In Stock", qty: 1, addedDate: "2026-03-10", supplier: "SecondHand Hub", photos: [] },
    { id: "d5", imei: "357654321098765", brand: "Xiaomi", model: "14 Ultra", color: "White", storage: "512GB", condition: "New", buyPrice: 69999, sellPrice: 79999, status: "Sold", qty: 0, addedDate: "2026-03-08", supplier: "Mi Store", photos: [] },
    { id: "d6", imei: "351234567890321", brand: "Samsung", model: "Galaxy Z Fold 6", color: "Navy", storage: "512GB", condition: "Used", buyPrice: 89999, sellPrice: 109999, status: "In Stock", qty: 1, addedDate: "2026-03-05", supplier: "Walk-in", photos: [] },
];

const DEMO_TX = [
    { id: "t1", type: "Buy", imei: "353456789012345", brand: "Samsung", model: "Galaxy S24 Ultra", customerName: "Galaxy Distributors", phone: "9876543210", amount: 84999, paymentMode: "Bank Transfer", date: "2026-03-15", notes: "" },
    { id: "t2", type: "Sell", imei: "357654321098765", brand: "Xiaomi", model: "14 Ultra", customerName: "Raj Patil", phone: "9123456789", amount: 79999, paymentMode: "UPI", date: "2026-03-17", notes: "" },
    { id: "t3", type: "Buy", imei: "350123456789012", brand: "Apple", model: "iPhone 16 Pro Max", customerName: "Apple Authorized", phone: "1800123456", amount: 139900, paymentMode: "Bank Transfer", date: "2026-03-14", notes: "" },
];

const STORE_KEY = "mobile-dukaan_v2";
const SYNC_KEY = "mobile-dukaan_sync_v1";
const AUTH_SESSION_KEY = "phonedukaan_shop_auth_v1";
const ADMIN_AUTH_SESSION_KEY = "phonedukaan_admin_auth_v1";
const ADMIN_PANEL_PATH = "/777admin";
const BILL_TYPES = ["GST", "NON GST"];
const APP_NAME = "PhoneDukaan";
const LEGACY_APP_NAME = "Mobile Dukaan";
const LEGACY_APP_NAME_2 = "Phone Dukaan";
const APP_WORDMARK_SRC = "/phonedukaan-wordmark.svg";
const APP_WORDMARK_FALLBACK = "/pd-icon.png";
const DEFAULT_TRIAL_DAYS = 7;

// ── LICENSE ACTIVATION ──────────────────────────────────────────────────────
const LICENSE_KEY_LS = "phonedukaan_license_v1";
const sha256hex = async (text) => {
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};
// Hashes are loaded at runtime from /license-hashes.json (generated by generate-keys.html)
let LICENSE_HASHES = new Set();
const loadLicenseHashes = async () => {
    try {
        const res = await fetch("/license-hashes.json");
        if (res.ok) { const arr = await res.json(); LICENSE_HASHES = new Set(arr); }
    } catch { /* no hashes file yet */ }
};
// ────────────────────────────────────────────────────────────────────────────
const DEFAULT_SHOP_PROFILE = {
    shopName: APP_NAME,
    legalName: APP_NAME,
    logoData: "",
    address: "Main Market, City Center",
    location: "",
    phone: "+91 98765 43210",
    email: "",
    gstin: "",
    state: "",
    stateCode: "",
    invoicePrefix: "INV",
    defaultBillType: "NON GST",
    defaultGstRate: 18,
    hsnCode: "8517",
    stickerShowPrice: true,
    footer: "Handset checked and delivered in working condition.",
    terms: "Goods once sold will be serviced as per shop policy.",
};
const STORAGE_PRESETS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];
const CUSTOM_STORAGE = "__custom__";
const cleanImei = (v = "") => String(v || "").replace(/\D/g, "").slice(0, 15);
const cleanMobileNumber = (v = "") => {
    const digits = String(v || "").replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
};
const extractScanImei = (raw = "") => {
    const text = String(raw || "");
    const match = text.match(/\d{15}/);
    return cleanImei(match ? match[0] : text);
};
const playScanBeep = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = 920;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.13);
    } catch { }
};
const photoIdFromLegacy = (value = "", index = 0) => `photo-${index}-${String(value).slice(0, 24).replace(/[^a-z0-9]/gi, "").toLowerCase() || genId()}`;
const normalizePhotoRef = (photo, index = 0) => {
    if (typeof photo === "string") {
        return {
            id: photoIdFromLegacy(photo, index),
            previewDataUrl: photo,
            fileId: "",
            fileName: `legacy-photo-${index + 1}.jpg`,
            mimeType: photo.startsWith("data:image/png") ? "image/png" : "image/jpeg",
            size: 0,
            uploadedAt: "",
            syncStatus: "local-only",
        };
    }
    return {
        id: photo?.id || `photo-${genId()}`,
        previewDataUrl: photo?.previewDataUrl || photo?.preview || photo?.dataUrl || photo?.fileUrl || "",
        fileId: photo?.fileId || "",
        fileUrl: photo?.fileUrl || "",
        openUrl: photo?.openUrl || "",
        fileName: photo?.fileName || "photo.jpg",
        mimeType: photo?.mimeType || "image/jpeg",
        size: Number(photo?.size || 0),
        uploadedAt: photo?.uploadedAt || "",
        syncStatus: photo?.syncStatus || (photo?.fileId ? "synced" : "local-only"),
    };
};
const getPhotoPreview = (photo) => normalizePhotoRef(photo).previewDataUrl || "";
const sanitizeStatus = (value = "") => {
    const text = String(value || "").trim();
    if (!text) return "Ready";
    return text
        .replace(/pocketbase/gi, "cloud")
        .replace(/database/gi, "cloud")
        .replace(/127\.0\.0\.1(:\d+)?/g, "")
        .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
};
const maskAadhaar = (value = "") => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length < 4) return value || "—";
    return `XXXX XXXX ${digits.slice(-4)}`;
};
const stripPhotoForCloud = (photo) => {
    const ref = normalizePhotoRef(photo);
    return {
        id: ref.id,
        previewDataUrl: ref.fileId ? "" : ref.previewDataUrl,
        fileId: ref.fileId,
        fileUrl: ref.fileUrl,
        openUrl: ref.openUrl,
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        size: ref.size,
        uploadedAt: ref.uploadedAt,
    };
};
const dataUrlToBlob = async (dataUrl) => {
    const response = await fetch(dataUrl);
    return response.blob();
};
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});
const extractGoogleResourceId = (value = "", kind = "") => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const patterns = kind === "sheet"
        ? [/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i]
        : kind === "folder"
            ? [/\/folders\/([a-zA-Z0-9-_]+)/i]
            : [];
    for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (match?.[1]) return match[1];
    }
    return raw;
};
const createPreviewDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            let w = img.width, h = img.height;
            if (w > h) {
                if (w > PHOTO_PREVIEW_MAX) { h = h * PHOTO_PREVIEW_MAX / w; w = PHOTO_PREVIEW_MAX; }
            } else if (h > PHOTO_PREVIEW_MAX) {
                w = w * PHOTO_PREVIEW_MAX / h; h = PHOTO_PREVIEW_MAX;
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});
const hasImei = (v = "") => cleanImei(v).length === 15;
const fmtCurrencyAscii = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN");
const fmtDateTime = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const pdfSafe = (v = "") => String(v ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const isPresetStorage = (v = "") => STORAGE_PRESETS.includes(String(v || "").trim());
const fmtSpecs = (ram = "", storage = "") => [String(ram || "").trim(), String(storage || "").trim()].filter(Boolean).join(" / ") || "-";
const roundMoney = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const formatMoney = (n) => Number(roundMoney(n)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n) => `Rs ${formatMoney(n)}`;
const amountInWords = (num) => {
    const n = Math.abs(roundMoney(num));
    if (n === 0) return "Rupees Zero Only";
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const twoDigit = (v) => {
        if (v === 0) return "";
        if (v < 20) return ones[v];
        return tens[Math.floor(v / 10)] + (v % 10 ? " " + ones[v % 10] : "");
    };
    const integer = Math.floor(n);
    const paise = Math.round((n - integer) * 100);
    let remaining = integer;
    const parts = [];
    const crore = Math.floor(remaining / 10000000);
    if (crore) { parts.push(twoDigit(crore) + " Crore"); remaining %= 10000000; }
    const lakh = Math.floor(remaining / 100000);
    if (lakh) { parts.push(twoDigit(lakh) + " Lakh"); remaining %= 100000; }
    const thousand = Math.floor(remaining / 1000);
    if (thousand) { parts.push(twoDigit(thousand) + " Thousand"); remaining %= 1000; }
    const hundred = Math.floor(remaining / 100);
    if (hundred) { parts.push(ones[hundred] + " Hundred"); remaining %= 100; }
    if (remaining) parts.push(twoDigit(remaining));
    let result = "Rupees " + parts.join(" ");
    if (paise > 0) result += " and " + twoDigit(paise) + " Paise";
    return result + " Only";
};
const pickText = (value, fallback = "") => value === undefined || value === null ? fallback : String(value);
const migrateLegacyName = (value, fallback = APP_NAME) => {
    const text = pickText(value, fallback);
    return (text === LEGACY_APP_NAME || text === LEGACY_APP_NAME_2) ? APP_NAME : text;
};
const normalizeShopProfile = (cfg = {}) => ({
    shopName: migrateLegacyName(cfg.shopName, DEFAULT_SHOP_PROFILE.shopName),
    legalName: migrateLegacyName(cfg.legalName, cfg.shopName ?? DEFAULT_SHOP_PROFILE.legalName),
    logoData: pickText(cfg.logoData, ""),
    address: pickText(cfg.address, DEFAULT_SHOP_PROFILE.address),
    location: pickText(cfg.location, ""),
    phone: pickText(cfg.phone, DEFAULT_SHOP_PROFILE.phone),
    email: pickText(cfg.email, ""),
    gstin: pickText(cfg.gstin, "").toUpperCase(),
    state: pickText(cfg.state, ""),
    stateCode: pickText(cfg.stateCode, ""),
    invoicePrefix: pickText(cfg.invoicePrefix, DEFAULT_SHOP_PROFILE.invoicePrefix).replace(/\s+/g, "").toUpperCase(),
    defaultBillType: cfg.defaultBillType === "GST" ? "GST" : "NON GST",
    defaultGstRate: cfg.defaultGstRate === "" ? "" : Number(cfg.defaultGstRate ?? DEFAULT_SHOP_PROFILE.defaultGstRate) || 18,
    hsnCode: pickText(cfg.hsnCode, DEFAULT_SHOP_PROFILE.hsnCode),
    stickerShowPrice: cfg.stickerShowPrice === undefined ? true : !!cfg.stickerShowPrice,
    footer: pickText(cfg.footer, DEFAULT_SHOP_PROFILE.footer),
    terms: pickText(cfg.terms, DEFAULT_SHOP_PROFILE.terms),
});
const createEmptyForm = (shop = DEFAULT_SHOP_PROFILE) => ({ imei: "", imei2: "", brand: "Samsung", model: "", color: "", ram: "", storage: "128GB", batteryHealth: "", condition: "New", buyPrice: "", sellPrice: "", status: "In Stock", qty: "1", supplier: "", customerName: "", phone: "", amount: "", paidAmount: "", dueAmount: "0", paymentMode: "Cash", notes: "", photos: [], sellerName: "", sellerPhone: "", sellerAadhaarNumber: "", purchaseDate: isoDate(), sellerAgreementAccepted: false, sellerIdPhotoData: "", sellerPhotoData: "", sellerSignatureData: "", warrantyType: "No Warranty", warrantyMonths: "", billType: shop.defaultBillType || "NON GST", gstRate: String(shop.defaultGstRate || 18) });
const calcInvoiceTotals = (amount, billType = "NON GST", gstRate = 18) => {
    const total = roundMoney(amount);
    const rate = Number(gstRate || 0);
    if (billType !== "GST" || !(rate > 0)) {
        return { billType: "NON GST", gstRate: 0, taxableAmount: total, gstAmount: 0, cgstAmount: 0, sgstAmount: 0, totalAmount: total };
    }

    const taxableAmount = roundMoney(total / (1 + rate / 100));
    const gstAmount = roundMoney(total - taxableAmount);
    const cgstAmount = roundMoney(gstAmount / 2);
    const sgstAmount = roundMoney(gstAmount - cgstAmount);
    return { billType: "GST", gstRate: rate, taxableAmount, gstAmount, cgstAmount, sgstAmount, totalAmount: total };
};
const getReportRange = (preset, fromDate, toDate) => {
    const now = new Date();
    const today = isoDate(now);
    if (preset === "Today") return { from: today, to: today, label: "Today" };
    if (preset === "Yesterday") {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const day = isoDate(yesterday);
        return { from: day, to: day, label: "Yesterday" };
    }
    if (preset === "This Week") {
        const start = new Date(now);
        const dayIndex = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - dayIndex);
        return { from: isoDate(start), to: today, label: `This Week (${fmtDate(start)} - ${fmtDate(now)})` };
    }
    if (preset === "This Month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: isoDate(start), to: today, label: `This Month (${now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })})` };
    }
    const from = fromDate || today;
    const to = toDate || from;
    return { from, to, label: `${fmtDate(from)} - ${fmtDate(to)}` };
};
const makeInvoiceNo = (tx, prefix = DEFAULT_SHOP_PROFILE.invoicePrefix) => {
    const now = new Date();
    return `${prefix}-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(tx.filter(t => t.type === "Sell").length + 1).padStart(4, "0")}`;
};
const WARRANTY_TYPES = ["No Warranty", "Testing Warranty", "1 Year Warranty"];
const getWarrantyStatus = (item) => {
    if (!item.warrantyType || item.warrantyType === "No Warranty") return { label: "Out of Warranty", active: false, remaining: "" };
    const months = item.warrantyType === "1 Year Warranty" ? 12 : Number(item.warrantyMonths || 0);
    if (!months || !item.purchaseDate) return { label: "Out of Warranty", active: false, remaining: "" };
    const start = new Date(item.purchaseDate);
    if (isNaN(start.getTime())) return { label: "Out of Warranty", active: false, remaining: "" };
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    const now = new Date();
    if (now >= end) return { label: "Out of Warranty", active: false, remaining: "Expired" };
    const diffMs = end - now;
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const m = Math.floor(totalDays / 30);
    const d = totalDays % 30;
    const parts = [];
    if (m > 0) parts.push(`${m} month${m > 1 ? "s" : ""}`);
    if (d > 0) parts.push(`${d} day${d > 1 ? "s" : ""}`);
    return { label: parts.join(" ") + " remaining", active: true, remaining: parts.join(" ") };
};
const normalizeInv = (it = {}) => ({
    id: it.id || genId(),
    imei: cleanImei(it.imei || it.imei1),
    imei2: cleanImei(it.imei2),
    brand: it.brand || "Samsung",
    model: it.model || "",
    color: it.color || "",
    ram: String(it.ram || "").trim(),
    storage: it.storage || "128GB",
    batteryHealth: String(it.batteryHealth || "").trim(),
    condition: it.condition || "New",
    buyPrice: Number(it.buyPrice || 0),
    sellPrice: Number(it.sellPrice || 0),
    status: it.status || "In Stock",
    deletedAt: it.deletedAt || "",
    qty: (it.status === "Sold" || it.status === "Deleted") ? 0 : 1,
    addedDate: it.addedDate || new Date().toISOString().slice(0, 10),
    supplier: it.supplier || "",
    photos: Array.isArray(it.photos) ? it.photos.map(normalizePhotoRef) : [],
    sellerName: it.sellerName || "",
    sellerPhone: it.sellerPhone || "",
    sellerAadhaarNumber: it.sellerAadhaarNumber || "",
    purchaseDate: it.purchaseDate || "",
    sellerAgreementAccepted: !!it.sellerAgreementAccepted,
    sellerIdPhotoData: it.sellerIdPhotoData || it.sellerIdPhotoUrl || "",
    sellerPhotoData: it.sellerPhotoData || it.sellerPhotoUrl || "",
    sellerSignatureData: it.sellerSignatureData || it.sellerSignatureUrl || "",
    customerName: it.customerName || "",
    customerPhone: it.customerPhone || "",
    warrantyType: it.warrantyType || "No Warranty",
    warrantyMonths: Number(it.warrantyMonths || 0),
    soldDate: it.soldDate || "",
    lastInvoiceNo: it.lastInvoiceNo || "",
});
const normalizeTx = (it = {}) => ({
    id: it.id || genId(),
    type: it.type || "Buy",
    stockItemId: it.stockItemId || "",
    imei: cleanImei(it.imei || it.imei1),
    imei2: cleanImei(it.imei2),
    brand: it.brand || "",
    model: it.model || "",
    color: it.color || "",
    ram: String(it.ram || "").trim(),
    storage: it.storage || "",
    batteryHealth: String(it.batteryHealth || "").trim(),
    condition: it.condition || "",
    customerName: it.customerName || "",
    phone: it.phone || "",
    amount: Number(it.amount || 0),
    paidAmount: Number(it.paidAmount ?? it.amount ?? 0),
    dueAmount: Number(it.dueAmount || 0),
    costPrice: Number(it.costPrice || 0),
    paymentMode: it.paymentMode || "Cash",
    invoiceNo: it.invoiceNo || "",
    billType: it.billType === "GST" ? "GST" : "NON GST",
    gstRate: Number(it.gstRate || 0),
    taxableAmount: Number(it.taxableAmount || calcInvoiceTotals(it.amount || 0, it.billType, it.gstRate).taxableAmount),
    gstAmount: Number(it.gstAmount || calcInvoiceTotals(it.amount || 0, it.billType, it.gstRate).gstAmount),
    cgstAmount: Number(it.cgstAmount || calcInvoiceTotals(it.amount || 0, it.billType, it.gstRate).cgstAmount),
    sgstAmount: Number(it.sgstAmount || calcInvoiceTotals(it.amount || 0, it.billType, it.gstRate).sgstAmount),
    totalAmount: Number(it.totalAmount || it.amount || 0),
    date: it.date || new Date().toISOString().slice(0, 10),
    dateTime: it.dateTime || `${it.date || new Date().toISOString().slice(0, 10)}T12:00:00`,
    notes: it.notes || "",
    sellerName: it.sellerName || "",
    sellerPhone: it.sellerPhone || "",
    sellerAadhaarNumber: it.sellerAadhaarNumber || "",
    purchaseDate: it.purchaseDate || "",
    whatsAppMessageAt: it.whatsAppMessageAt || "",
    whatsAppPdfAt: it.whatsAppPdfAt || "",
    shopSnapshot: it.shopSnapshot ? normalizeShopProfile(it.shopSnapshot) : null,
});
const loadStore = () => {
    if (typeof window === "undefined") return { inv: DEMO_INVENTORY.map(normalizeInv), tx: DEMO_TX.map(normalizeTx), shop: normalizeShopProfile(DEFAULT_SHOP_PROFILE) };
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
        if (raw?.inv && raw?.tx) return { inv: raw.inv.map(normalizeInv), tx: raw.tx.map(normalizeTx), shop: normalizeShopProfile(raw.shop || raw.shopProfile || DEFAULT_SHOP_PROFILE) };
    } catch { }
    return { inv: DEMO_INVENTORY.map(normalizeInv), tx: DEMO_TX.map(normalizeTx), shop: normalizeShopProfile(DEFAULT_SHOP_PROFILE) };
};
const normalizeSyncCfg = (cfg = {}) => ({
    scriptUrl: "",
    shopId: String(cfg.shopId || "main-shop").trim().replace(/[^a-zA-Z0-9_-]/g, "-") || "main-shop",
    syncKey: String(cfg.syncKey || ""),
    connected: !!cfg.connected,
    autoSync: cfg.autoSync === undefined ? true : !!cfg.autoSync,
    lastPushAt: String(cfg.lastPushAt || ""),
    lastPullAt: String(cfg.lastPullAt || ""),
    lastStatus: String(cfg.lastStatus || "Login required"),
});
const loadSyncCfg = () => {
    if (typeof window === "undefined") return normalizeSyncCfg();
    try {
        return normalizeSyncCfg(JSON.parse(window.localStorage.getItem(SYNC_KEY) || "null") || {});
    } catch { }
    return normalizeSyncCfg();
};
const normalizeSyncMeta = (meta = {}) => ({
    pendingSync: !!meta.pendingSync,
    syncState: String(meta.syncState || "saved-local"),
    lastRemoteSavedAt: String(meta.lastRemoteSavedAt || ""),
    lastLocalChangeAt: String(meta.lastLocalChangeAt || ""),
    syncError: String(meta.syncError || ""),
    lastCheckedAt: String(meta.lastCheckedAt || ""),
});
const matchImei = (item, imei) => {
    const value = cleanImei(imei);
    return value && (item.imei === value || item.imei2 === value);
};
const findDeviceByImei = (items, imei) => items.find(item => item.status !== "Deleted" && matchImei(item, imei));
const findDuplicateImei = (items, imei, skipId) => {
    const value = cleanImei(imei);
    if (!value) return null;
    return items.find(item => item.id !== skipId && item.status !== "Deleted" && (item.imei === value || item.imei2 === value));
};
const makeWhatsAppUrl = (phone, text) => {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
};
const getSaleShop = (sale, fallbackShop) => normalizeShopProfile(sale?.shopSnapshot || fallbackShop || DEFAULT_SHOP_PROFILE);
const makeWhatsAppIntroText = () => "Thanks for shopping. You will receive your invoice shortly.";
const makeInvoiceText = (sale, shop) => `${shop.shopName} ${sale.invoiceNo || "Invoice"}\n${sale.billType === "GST" ? "GST Invoice" : "Invoice"}\n${sale.brand} ${sale.model}\nSpecs: ${fmtSpecs(sale.ram, sale.storage)}\nIMEI 1: ${sale.imei}${sale.imei2 ? `\nIMEI 2: ${sale.imei2}` : ""}\nTotal: ${fmtMoney(sale.totalAmount || sale.amount)}${sale.billType === "GST" ? `\nTaxable: ${fmtMoney(sale.taxableAmount)}\nGST: ${fmtMoney(sale.gstAmount)}` : ""}${sale.dueAmount ? `\nDue: ${fmtMoney(sale.dueAmount)}` : ""}`;
const buildInvoiceDoc = async (sale, shop) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ml = 12, mr = 12, cw = pw - ml - mr;
    const accent = [22, 54, 92];
    const accent2 = [38, 90, 140];
    const gold = [180, 140, 60];
    const dark = [25, 25, 30];
    const mid = [90, 100, 110];
    const soft = [130, 140, 150];
    const bg = [245, 247, 250];
    const bgAlt = [235, 239, 244];
    const border = [190, 198, 210];
    const white = [255, 255, 255];
    const isGST = sale.billType === "GST";
    const billLabel = isGST ? "TAX INVOICE" : "INVOICE";
    const sp = getSaleShop(sale, shop);
    const hsn = sp.hsnCode || "";
    const unitRate = isGST ? sale.taxableAmount : (sale.totalAmount || sale.amount);
    const totalAmt = sale.totalAmount || sale.amount;
    const rX = pw - mr; // right edge

    // ═══════ OUTER BORDER ═══════
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.rect(ml - 2, 6, cw + 4, ph - 12);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.2);
    doc.rect(ml - 1, 7, cw + 2, ph - 14);

    // ═══════ HEADER SECTION ═══════
    doc.setFillColor(...accent);
    doc.rect(ml, 10, cw, 28, "F");

    // Decorative gold line under header
    doc.setFillColor(...gold);
    doc.rect(ml, 38, cw, 1.2, "F");

    // Logo
    let hx = ml + 6;
    if (sp.logoData) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(ml + 3, 13, 22, 22, 1.5, 1.5, "F");
            doc.addImage(sp.logoData, "PNG", ml + 4, 14, 20, 20);
        } catch {
            try { doc.addImage(sp.logoData, "JPEG", ml + 4, 14, 20, 20); } catch { }
        }
        hx = ml + 28;
    }

    // Shop name
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(sp.shopName || sp.legalName, hx, 21);

    // Shop details line 1: address
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 215, 230);
    const addrLine = [sp.address, sp.location].filter(Boolean).join(", ");
    if (addrLine) doc.text(addrLine, hx, 27);
    // Shop details line 2: phone | email
    const contactLine = [sp.phone, sp.email].filter(Boolean).join("  |  ");
    if (contactLine) doc.text(contactLine, hx, 32);

    // Invoice badge (right side)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(rX - 52, 13, 50, 10, 1.5, 1.5, "F");
    doc.setTextColor(...accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(billLabel, rX - 27, 20, { align: "center" });
    // Invoice number below badge
    doc.setTextColor(200, 215, 230);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`# ${sale.invoiceNo || "-"}`, rX - 27, 29, { align: "center" });

    let cy = 42;

    // ═══════ GSTIN BAR ═══════
    if (isGST && sp.gstin) {
        doc.setFillColor(...bgAlt);
        doc.rect(ml, cy, cw, 7, "F");
        doc.setDrawColor(...border);
        doc.setLineWidth(0.15);
        doc.line(ml, cy + 7, ml + cw, cy + 7);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...accent);
        doc.text(`GSTIN: ${sp.gstin}`, ml + 4, cy + 5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text(`State: ${sp.state || "-"}  |  Code: ${sp.stateCode || "-"}`, rX - 2, cy + 5, { align: "right" });
        cy += 9;
    } else {
        cy += 2;
    }

    // ═══════ BILL TO + INVOICE DETAILS (side by side in bordered boxes) ═══════
    const boxY = cy + 1;
    const boxH = 30;
    const halfW = cw / 2 - 1;

    // Left box: Bill To
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(ml, boxY, halfW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("BILL TO", ml + 3, boxY + 4.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(sale.customerName || "Walk-in Customer", ml + 3, boxY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...mid);
    doc.text(`Phone: ${sale.phone || "Not provided"}`, ml + 3, boxY + 18);
    if (sale.notes) {
        const nw = doc.splitTextToSize(sale.notes, halfW - 6);
        doc.setFontSize(7.5);
        doc.text(nw.slice(0, 2), ml + 3, boxY + 24);
    }

    // Right box: Invoice Details
    const rbX = ml + halfW + 2;
    doc.setDrawColor(...border);
    doc.rect(rbX, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(rbX, boxY, halfW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("INVOICE DETAILS", rbX + 3, boxY + 4.2);

    const detailPairs = [
        ["Invoice No.", sale.invoiceNo || "-"],
        ["Date", fmtDateTime(sale.dateTime || sale.date)],
        ["Payment", sale.paymentMode || "Cash"],
    ];
    if (sp.state && !isGST) detailPairs.push(["State", sp.state]);
    let dy = boxY + 12;
    detailPairs.forEach(([label, val]) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...soft);
        doc.text(label + ":", rbX + 3, dy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...dark);
        doc.text(val, rbX + 28, dy);
        dy += 5.5;
    });

    cy = boxY + boxH + 4;

    // ═══════ ITEM TABLE ═══════
    const tY = cy;

    // Column positions (right columns sized for "Rs XX,XX,XXX.XX")
    const c1 = ml;           // S.No start
    const c2 = ml + 12;      // Description start
    const c6 = rX;           // Amount right edge
    const c5r = c6 - 2;      // Amount right text edge
    const c5 = c6 - 34;      // Amount col start
    const c4r = c5 - 2;      // Rate right text edge
    const c4 = c5 - 34;      // Rate col start
    const c3r = c4;          // Qty right edge
    const c3 = c4 - 12;      // Qty col start
    const c2r = c3;          // HSN right edge (or Qty if no HSN)
    const cHsn = hsn ? c3 - 18 : c3; // HSN col start

    // Table header
    doc.setFillColor(...accent);
    doc.rect(ml, tY, cw, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("S.No", c1 + 3, tY + 5.5);
    doc.text("Description", c2 + 2, tY + 5.5);
    if (hsn) doc.text("HSN", cHsn + 2, tY + 5.5);
    doc.text("Qty", c3 + 2, tY + 5.5);
    doc.text("Rate", c4r, tY + 5.5, { align: "right" });
    doc.text("Amount", c5r, tY + 5.5, { align: "right" });

    // Vertical lines in header
    doc.setDrawColor(255, 255, 255, 80);
    doc.setLineWidth(0.15);
    const vLines = [c2, ...(hsn ? [cHsn] : []), c3, c4, c5];
    vLines.forEach(x => doc.line(x, tY + 1, x, tY + 7));

    // Table row
    const descMaxW = (hsn ? cHsn : c3) - c2 - 4;
    const descText = [
        `${sale.brand} ${sale.model}`,
        [sale.color ? `Color: ${sale.color}` : "", fmtSpecs(sale.ram, sale.storage) !== "-" ? `Specs: ${fmtSpecs(sale.ram, sale.storage)}` : "", sale.condition ? `Condition: ${sale.condition}` : ""].filter(Boolean).join("  |  "),
        `IMEI 1: ${sale.imei || "-"}`,
        sale.imei2 ? `IMEI 2: ${sale.imei2}` : "",
    ].filter(Boolean).join("\n");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const descLines = doc.splitTextToSize(descText, descMaxW);
    const rowH = Math.max(20, descLines.length * 4.2 + 8);
    const rowY = tY + 8;

    // Row background
    doc.setFillColor(...bg);
    doc.rect(ml, rowY, cw, rowH, "F");

    // Row border
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.rect(ml, rowY, cw, rowH);

    // Vertical grid lines in row
    vLines.forEach(x => doc.line(x, rowY, x, rowY + rowH));

    // Row data
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("1", (c1 + c2) / 2, rowY + 6, { align: "center" });

    // Description - first line bold
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${sale.brand} ${sale.model}`, c2 + 2, rowY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(...mid);
    const detailLines = descLines.slice(1);
    if (detailLines.length) doc.text(detailLines, c2 + 2, rowY + 11);

    if (hsn) {
        doc.setTextColor(...dark);
        doc.setFontSize(8);
        doc.text(hsn, cHsn + 3, rowY + 6);
    }
    doc.setTextColor(...dark);
    doc.setFontSize(8.5);
    doc.text("1", (c3 + c4) / 2, rowY + 6, { align: "center" });
    doc.text(fmtMoney(unitRate), c4r, rowY + 6, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(fmtMoney(totalAmt), c5r, rowY + 6, { align: "right" });

    // Bottom table border (thick)
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.4);
    doc.line(ml, rowY + rowH, ml + cw, rowY + rowH);

    cy = rowY + rowH + 2;

    // ═══════ AMOUNT IN WORDS BAR ═══════
    doc.setFillColor(...bgAlt);
    doc.rect(ml, cy, cw, 8, "F");
    doc.setDrawColor(...border);
    doc.setLineWidth(0.15);
    doc.rect(ml, cy, cw, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text("Amount in Words:", ml + 3, cy + 5.2);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...dark);
    const wordsStr = amountInWords(totalAmt);
    doc.text(wordsStr, ml + 32, cy + 5.2, { maxWidth: cw - 36 });

    cy += 10;

    // ═══════ BOTTOM SECTION: Terms (left) + Totals (right) ═══════
    const totW = 82;
    const totX = rX - totW;
    const termsW = totX - ml - 4;
    const secStartY = cy;

    // ── Totals Section (right) with border ──
    const totH = isGST ? 56 : 38;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(totX, secStartY, totW, totH);

    // Totals header
    doc.setFillColor(...accent);
    doc.rect(totX, secStartY, totW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("AMOUNT DETAILS", totX + totW / 2, secStartY + 4.2, { align: "center" });

    let tCur = secStartY + 10;
    const totLx = totX + 3;
    const totRx = rX - 2;

    // Taxable Amount
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...mid);
    doc.text(isGST ? "Taxable Amount" : "Sub Total", totLx, tCur);
    doc.setTextColor(...dark);
    doc.text(fmtMoney(sale.taxableAmount), totRx, tCur, { align: "right" });
    tCur += 6;

    if (isGST) {
        doc.setTextColor(...mid);
        doc.text(`CGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        doc.text(fmtMoney(sale.cgstAmount), totRx, tCur, { align: "right" });
        tCur += 6;
        doc.setTextColor(...mid);
        doc.text(`SGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        doc.text(fmtMoney(sale.sgstAmount), totRx, tCur, { align: "right" });
        tCur += 6;
    }

    // Divider before grand total
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.3);
    doc.line(totLx, tCur, totRx, tCur);
    tCur += 5;

    // Grand Total (highlighted row)
    doc.setFillColor(...accent);
    doc.rect(totX, tCur - 3.5, totW, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("GRAND TOTAL", totLx, tCur + 2);
    doc.text(fmtMoney(totalAmt), totRx, tCur + 2, { align: "right" });
    tCur += 10;

    // Paid / Due row
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...mid);
    doc.text("Paid:", totLx, tCur);
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "bold");
    doc.text(fmtMoney(sale.paidAmount), totLx + 12, tCur);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mid);
    doc.text("Due:", totX + totW / 2 + 2, tCur);
    const dueColor = Number(sale.dueAmount || 0) > 0 ? [190, 40, 40] : dark;
    doc.setTextColor(...dueColor);
    doc.setFont("helvetica", "bold");
    doc.text(fmtMoney(sale.dueAmount), totRx, tCur, { align: "right" });

    // ── Terms Section (left) ──
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, secStartY, termsW, totH);
    doc.setFillColor(...accent);
    doc.rect(ml, secStartY, termsW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("TERMS & CONDITIONS", ml + 3, secStartY + 4.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mid);
    const termsText = [sp.terms, sp.footer].filter(Boolean).join("\n");
    const tLines = doc.splitTextToSize(termsText || "Thank you for your purchase.", termsW - 6);
    doc.text(tLines.slice(0, 6), ml + 3, secStartY + 12);

    cy = secStartY + totH + 4;

    // ═══════ DECLARATION + SIGNATURE ═══════
    const footSecY = cy;
    const footH = 32;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, footSecY, cw, footH);
    // Vertical divider splitting left/right
    const footMidX = ml + cw / 2;
    doc.line(footMidX, footSecY, footMidX, footSecY + footH);

    // Left: Declaration
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text("Declaration:", ml + 3, footSecY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...mid);
    const declText = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    const declLines = doc.splitTextToSize(declText, cw / 2 - 8);
    doc.text(declLines, ml + 3, footSecY + 10);

    // Right: Signature
    const sigCenterX = footMidX + cw / 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...accent);
    doc.text(`For ${sp.shopName || sp.legalName}`, sigCenterX, footSecY + 5, { align: "center" });

    // Signature line
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.3);
    const sigLineY = footSecY + footH - 8;
    doc.line(sigCenterX - 28, sigLineY, sigCenterX + 28, sigLineY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mid);
    doc.text("Authorised Signatory", sigCenterX, sigLineY + 4, { align: "center" });

    // ═══════ PAGE FOOTER ═══════
    const footerY = footSecY + footH + 4;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...soft);
    doc.text("Thank you for your business!", pw / 2, footerY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(billLabel, ml, footerY);
    doc.text("Page 1 of 1", rX, footerY, { align: "right" });

    return doc;
};
const makeInvoiceFile = async (sale, shop) => {
    const doc = await buildInvoiceDoc(sale, shop);
    const blob = doc.output("blob");
    const fileName = `${(sale.invoiceNo || sale.id || "invoice").toLowerCase()}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildReportDoc = async ({ rows, summary, reportType, rangeLabel, shop }) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const shopProfile = normalizeShopProfile(shop || DEFAULT_SHOP_PROFILE);
    const accent = [20, 71, 120];
    const ink = [35, 43, 53];
    const muted = [102, 112, 122];
    const soft = [242, 246, 250];
    const title = reportType === "All" ? "Stock Activity Report" : `${reportType} Report`;
    const summaryCards = [
        { label: "Records", value: String(summary.records) },
        { label: "Buy/Add", value: fmtMoney(summary.buyAddTotal) },
        { label: "Sales", value: fmtMoney(summary.sellTotal) },
        { label: "Due", value: fmtMoney(summary.dueTotal) },
    ];
    const columns = [
        { label: "Date", width: 26 },
        { label: "Type", width: 18 },
        { label: "Party", width: 42 },
        { label: "Item", width: 70 },
        { label: "Amount", width: 28 },
    ];

    const drawHeader = (startY) => {
        doc.setFillColor(...accent);
        doc.rect(0, 0, pageWidth, 34, "F");
        if (shopProfile.logoData) {
            try {
                doc.addImage(shopProfile.logoData, "PNG", 14, 8, 16, 16);
            } catch {
                try { doc.addImage(shopProfile.logoData, "JPEG", 14, 8, 16, 16); } catch { }
            }
        }
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(shopProfile.shopName || shopProfile.legalName, shopProfile.logoData ? 34 : 14, 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text([shopProfile.address, shopProfile.location, shopProfile.phone].filter(Boolean), shopProfile.logoData ? 34 : 14, 21);
        doc.setTextColor(...ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(title, 14, startY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(...muted);
        doc.text(`Range: ${rangeLabel}`, 14, startY + 5.5);
        doc.text(`Generated: ${fmtDateTime(new Date())}`, pageWidth - 14, startY + 5.5, { align: "right" });
    };

    const drawTableHeader = (y) => {
        doc.setFillColor(...accent);
        doc.rect(14, y, pageWidth - 28, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        let x = 16;
        columns.forEach((column) => {
            const align = column.label === "Amount" ? "right" : "left";
            doc.text(column.label, align === "right" ? x + column.width - 2 : x, y + 5.3, { align });
            x += column.width;
        });
    };

    drawHeader(46);
    let cardX = 14;
    summaryCards.forEach((card) => {
        doc.setFillColor(...soft);
        doc.roundedRect(cardX, 56, 43, 18, 3, 3, "F");
        doc.setDrawColor(225, 232, 238);
        doc.roundedRect(cardX, 56, 43, 18, 3, 3);
        doc.setTextColor(...muted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(card.label, cardX + 3, 61.5);
        doc.setTextColor(...ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text(card.value, cardX + 3, 69.5);
        cardX += 45;
    });

    let y = 84;
    drawTableHeader(y);
    y += 10;
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);

    if (!rows.length) {
        doc.setTextColor(...muted);
        doc.text("No records found for the selected report range.", 14, y + 6);
        return doc;
    }

    rows.forEach((row) => {
        const dateText = fmtDate(row.date || row.dateTime || new Date());
        const typeText = row.type;
        const partyText = [row.party || "-", row.phone || "", row.paymentMode ? `Pay: ${row.paymentMode}` : ""].filter(Boolean).join("\n");
        const itemText = [row.item || "-", row.billType === "GST" ? "GST" : "", row.imei ? `IMEI ${row.imei}${row.imei2 ? ` / ${row.imei2}` : ""}` : "", row.extra || ""].filter(Boolean).join("\n");
        const partyLines = doc.splitTextToSize(partyText, columns[2].width - 3);
        const itemLines = doc.splitTextToSize(itemText, columns[3].width - 3);
        const rowHeight = Math.max(10, Math.max(partyLines.length, itemLines.length, 1) * 4.4 + 3);

        if (y + rowHeight > pageHeight - 18) {
            doc.addPage();
            drawHeader(20);
            y = 30;
            drawTableHeader(y);
            y += 10;
            doc.setTextColor(...ink);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.3);
        }

        doc.setDrawColor(230, 235, 240);
        doc.rect(14, y - 2, pageWidth - 28, rowHeight);
        let x = 16;
        doc.text(dateText, x, y + 3.5);
        x += columns[0].width;
        doc.text(typeText, x, y + 3.5);
        x += columns[1].width;
        doc.text(partyLines, x, y + 3.5);
        x += columns[2].width;
        doc.text(itemLines, x, y + 3.5);
        x += columns[3].width;
        doc.text(fmtMoney(row.amount || 0), x + columns[4].width - 2, y + 3.5, { align: "right" });
        y += rowHeight;
    });

    return doc;
};
const makeReportFile = async ({ rows, summary, reportType, rangeLabel, shop }) => {
    const doc = await buildReportDoc({ rows, summary, reportType, rangeLabel, shop });
    const blob = doc.output("blob");
    const fileName = `report-${reportType.toLowerCase()}-${rangeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildStickerDoc = async (item, shop) => {
    const { jsPDF } = await import("jspdf");
    const shopProfile = normalizeShopProfile(shop || DEFAULT_SHOP_PROFILE);
    const isUsedOrRefurb = item.condition === "Used" || item.condition === "Refurbished";
    const hasWarrantyInfo = isUsedOrRefurb && item.warrantyType && item.warrantyType !== "No Warranty";
    const stickerH = hasWarrantyInfo ? 34 : 30;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [stickerH, 50] });
    const accent = [20, 71, 120];
    const ink = [28, 36, 44];
    const muted = [95, 103, 112];
    const paper = [255, 255, 255];
    const brandLine = [item.brand, item.model].filter(Boolean).join(" ").trim();
    const specLine = [item.storage || "", item.ram || "", item.color || ""].filter(Boolean).join("  |  ") || "Specs not set";
    const brandLines = doc.splitTextToSize(brandLine || "Mobile", 45);

    doc.setFillColor(...paper);
    doc.rect(0, 0, 50, stickerH, "F");
    doc.setDrawColor(210, 217, 224);
    doc.roundedRect(0.8, 0.8, 48.4, stickerH - 1.6, 1.2, 1.2);

    doc.setFillColor(...accent);
    doc.rect(0, 0, 50, 5.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text((shopProfile.shopName || shopProfile.legalName || APP_NAME).slice(0, 28), 2.2, 3.55);

    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(brandLines, 2.2, 9.4);

    doc.setFillColor(244, 247, 249);
    doc.roundedRect(2.2, 12.8, 45.6, 4.8, 1, 1, "F");
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.8);
    doc.text(specLine.slice(0, 42), 3.2, 15.9);

    if (item.condition) {
        const badgeWidth = Math.min(18, Math.max(10, item.condition.length * 1.5 + 4));
        doc.setFillColor(246, 250, 252);
        doc.setDrawColor(...accent);
        doc.roundedRect(50 - badgeWidth - 2.2, 6.1, badgeWidth, 4.3, 1.2, 1.2, "FD");
        doc.setTextColor(...accent);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.6);
        doc.text(item.condition.toUpperCase(), 50 - badgeWidth / 2 - 2.2, 8.85, { align: "center" });
    }

    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(4.6);
    doc.text("IMEI 1", 2.2, 21.2);
    doc.setTextColor(...ink);
    doc.setFont("courier", "bold");
    doc.setFontSize(6.6);
    doc.text(item.imei || "-", 2.2, 24.3);

    if (item.imei2) {
        doc.setTextColor(...muted);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.6);
        doc.text("IMEI 2", 2.2, 27.0);
        doc.setTextColor(...ink);
        doc.setFont("courier", "bold");
        doc.setFontSize(5.8);
        doc.text(item.imei2, 12.2, 27.0);
    }

    const warranty = getWarrantyStatus(item);
    const bottomY = item.imei2 ? 24.3 : 27.0;

    if (shopProfile.stickerShowPrice && (item.sellPrice || item.buyPrice)) {
        const price = item.sellPrice || item.buyPrice;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(...accent);
        doc.text(`Rs ${formatMoney(price)}`, 48, bottomY, { align: "right" });
    }

    if (hasWarrantyInfo) {
        // Expand sticker height to fit warranty line
        const wY = 29;
        doc.setFillColor(240, 248, 240);
        doc.rect(0, wY - 2.5, 50, 3.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.2);
        if (warranty.active) {
            doc.setTextColor(30, 130, 60);
            const wLabel = `W: ${warranty.remaining}`;
            doc.text(wLabel, 2.2, wY);
        } else {
            doc.setTextColor(160, 80, 40);
            doc.text("WARRANTY EXPIRED", 2.2, wY);
        }
        if (item.purchaseDate) {
            doc.setTextColor(...muted);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(4);
            doc.text(`Purch: ${fmtDate(item.purchaseDate)}`, 48, wY, { align: "right" });
        }
    }

    return doc;
};
const makeStickerFile = async (item, shop) => {
    const doc = await buildStickerDoc(item, shop);
    const blob = doc.output("blob");
    const fileName = `sticker-${(item.brand || "phone").toLowerCase()}-${(item.model || item.id || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};

const S = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--gb:rgba(255,255,255,0.06);--gbh:rgba(255,255,255,0.1);--gbo:rgba(255,255,255,0.1);--gbl:rgba(255,255,255,0.15);--blur:24px;--a:#00d4ff;--a2:#8b5cf6;--a3:#f472b6;--ok:#34d399;--warn:#fbbf24;--err:#f87171;--t1:rgba(255,255,255,0.95);--t2:rgba(255,255,255,0.6);--t3:rgba(255,255,255,0.35);--r:16px;--rs:10px}
body,#root{font-family:'Outfit',sans-serif}
.abg{min-height:100vh;background:linear-gradient(135deg,#0a0a1a,#0d1b2a 30%,#1b1040 60%,#0a0a1a);position:relative;overflow-x:hidden}
.abg::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 20% 20%,rgba(0,212,255,.08) 0%,transparent 50%),radial-gradient(ellipse at 80% 80%,rgba(139,92,246,.08) 0%,transparent 50%);pointer-events:none;animation:bf 20s ease-in-out infinite}
@keyframes bf{0%,100%{transform:translate(0,0)}33%{transform:translate(2%,-2%)}66%{transform:translate(-1%,1%)}}
.gl{background:var(--gb);backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));border:1px solid var(--gbo);border-radius:var(--r)}
.gc{background:var(--gb);backdrop-filter:blur(var(--blur));-webkit-backdrop-filter:blur(var(--blur));border:1px solid var(--gbo);border-radius:var(--r);padding:20px;transition:all .3s}
.gc:hover{background:var(--gbh);border-color:var(--gbl);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.3)}
.gi{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);border:1px solid var(--gbo);border-radius:var(--rs);color:var(--t1);font-family:'Outfit',sans-serif;font-size:14px;outline:none;transition:all .3s}
.gi:focus{border-color:var(--a);background:rgba(0,212,255,.05);box-shadow:0 0 0 3px rgba(0,212,255,.1)}
.gi::placeholder{color:var(--t3)}
.gs{width:100%;padding:12px 16px;background:rgba(255,255,255,.05);border:1px solid var(--gbo);border-radius:var(--rs);color:var(--t1);font-family:'Outfit',sans-serif;font-size:14px;outline:none;appearance:none;cursor:pointer}
.gs option{background:#1a1a3a;color:#fff}
.bp{padding:12px 24px;background:linear-gradient(135deg,var(--a),var(--a2));border:none;border-radius:var(--rs);color:#fff;font-family:'Outfit',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;gap:8px}
.bp:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(0,212,255,.3)}
.bg{padding:10px 18px;background:transparent;border:1px solid var(--gbo);border-radius:var(--rs);color:var(--t2);font-family:'Outfit',sans-serif;font-weight:500;font-size:13px;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;gap:6px}
.bg:hover{background:var(--gbh);color:var(--t1)}
.bd{padding:10px 18px;background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.3);border-radius:var(--rs);color:var(--err);font-family:'Outfit',sans-serif;font-weight:500;font-size:13px;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;gap:6px}
.bs{padding:12px 24px;background:linear-gradient(135deg,#34d399,#059669);border:none;border-radius:var(--rs);color:#fff;font-family:'Outfit',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:all .3s;display:inline-flex;align-items:center;gap:8px}
.ba{display:inline-flex;align-items:center;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.bn{background:rgba(0,212,255,.15);color:var(--a);border:1px solid rgba(0,212,255,.3)}
.br{background:rgba(251,191,36,.15);color:var(--warn);border:1px solid rgba(251,191,36,.3)}
.bu{background:rgba(255,255,255,.08);color:var(--t2);border:1px solid var(--gbo)}
.bi{background:rgba(52,211,153,.15);color:var(--ok);border:1px solid rgba(52,211,153,.3)}
.bso{background:rgba(248,113,113,.15);color:var(--err);border:1px solid rgba(248,113,113,.3)}
.bre{background:rgba(139,92,246,.15);color:var(--a2);border:1px solid rgba(139,92,246,.3)}
.ni{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:var(--rs);color:var(--t2);cursor:pointer;transition:all .25s;font-size:14px;font-weight:500;border:1px solid transparent}
.ni:hover{background:var(--gbh);color:var(--t1)}
.ni.ac{background:rgba(0,212,255,.1);color:var(--a);border-color:rgba(0,212,255,.2)}
.fi{animation:fi .4s ease-out}@keyframes fi{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.tr{transition:background .2s}.tr:hover{background:rgba(255,255,255,.03)}
.pd{width:8px;height:8px;border-radius:50%;background:var(--ok);animation:pu 2s infinite}
.action-row{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.action-row .bp,.action-row .bg,.action-row .bs,.action-row .bd{justify-content:center}
.gi,.gs,.bp,.bg,.bd,.bs,.ni,.pa,.pt,.ptd,.cs{touch-action:manipulation}
.stock-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stock-search{flex:1 1 200px;position:relative}
.stock-view-toggle{display:flex;gap:4px}
.stock-header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.stock-hero-actions{display:flex;gap:8px;flex-wrap:wrap}
.stock-filter-card{margin-bottom:20px;padding:16px}
.stock-search .gi{padding-left:36px}
.hcard-actions{display:flex;gap:3px}
.stock-controls-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mfd{position:fixed;left:0;right:0;bottom:0;height:156px;pointer-events:none;z-index:44;display:none}
.mfd::before{content:'';position:absolute;left:0;right:0;bottom:0;height:136px;background:linear-gradient(180deg,rgba(10,10,26,0),rgba(10,10,26,.56) 48%,rgba(10,10,26,.9));opacity:.96}
.mfd::after{content:'';position:absolute;left:12px;right:12px;bottom:calc(6px + env(safe-area-inset-bottom,0px));height:96px;border-radius:28px;background:radial-gradient(circle at 20% 18%,rgba(0,212,255,.16),transparent 42%),radial-gradient(circle at 82% 24%,rgba(139,92,246,.2),transparent 44%),rgba(255,255,255,.03);backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);filter:blur(12px);opacity:.95}
@keyframes pu{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(52,211,153,.5)}50%{opacity:.8;box-shadow:0 0 0 8px rgba(52,211,153,0)}}
@media(max-width:1024px){.ds{display:none!important}.mn{display:flex!important}.mfd{display:block!important}.mth{display:flex!important}.mc{margin-left:0!important;padding:calc(86px + env(safe-area-inset-top,0px)) 16px calc(130px + env(safe-area-inset-bottom,0px))!important}}
@media(max-width:768px){.hcard{min-height:164px!important}.hcard-photo{width:108px!important;min-width:108px!important}.hcard-details{padding:11px 12px!important}.hcard-title{font-size:13px!important}.hcard-imei{font-size:10px!important}.hcard-price{padding:6px 8px!important;gap:6px!important;margin-bottom:10px!important}.action-row>*{width:100%;justify-content:center}.gi,.gs{font-size:16px!important}.stock-header{align-items:flex-start;margin-bottom:16px}.stock-hero-actions{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}.stock-hero-actions .bp{padding:11px 14px;font-size:13px;min-height:46px;justify-content:center}.stock-filter-card{margin-bottom:14px;padding:12px!important}.stock-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.stock-search{min-width:0}.stock-search .gi{padding:11px 14px 11px 34px}.stock-controls-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start}.stock-controls-row .gs{flex:1 1 132px;min-width:0;padding:10px 11px;font-size:14px!important}.stock-view-toggle{flex:0 0 auto}.stock-view-toggle .bg{padding:8px 9px;min-width:38px}.hcard-ab,.hcard-actions .bg,.hcard-actions .bd{padding:8px!important;min-width:34px!important;min-height:34px!important}}
@media(max-width:560px){.gc{padding:16px!important}.mth{padding-inline:12px!important}.mc{padding-inline:12px!important}.stock-tools{grid-template-columns:1fr}.stock-controls-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}.stock-controls-row .gs{flex:initial;min-width:0}.stock-view-toggle{justify-self:end}.stock-header h1{font-size:24px!important}.stock-header p{font-size:13px!important}.stock-hero-actions .bp{min-height:42px;padding:10px 12px;font-size:12.5px}.hcard{flex-direction:row!important;align-items:stretch!important}.hcard-photo{width:112px!important;min-width:112px!important;height:auto!important;min-height:190px!important;border-right:1px solid rgba(255,255,255,.06)!important;border-bottom:none!important}.hcard-details{padding:12px!important}.hcard-price{gap:8px!important}.mfd::after{left:8px;right:8px}.hcard-ab,.hcard-actions .bg,.hcard-actions .bd{padding:9px!important;min-width:38px!important;min-height:38px!important}}
@media(max-width:430px){.stock-controls-row{grid-template-columns:1fr 1fr auto}.stock-controls-row .gs{padding:9px 8px;font-size:13px!important}.stock-view-toggle .bg{padding:8px;min-width:34px}.hcard{flex-direction:row!important}.hcard-photo{width:96px!important;min-width:96px!important;min-height:176px!important}.hcard-details{padding:11px!important}.hcard-ab{padding:10px!important;min-width:40px!important;min-height:40px!important}}
@media(max-height:760px){.co{padding-top:calc(10px + env(safe-area-inset-top,0px));padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}.cc{gap:10px}.cv{max-height:min(48vh,48dvh)}}
@media(min-width:1025px){.mn,.mth,.mfd{display:none!important}}
.so{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center}
.sf{width:280px;height:160px;border:2px solid var(--a);border-radius:12px;position:relative;overflow:hidden;box-shadow:0 0 40px rgba(0,212,255,.2)}
.sl{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--a),transparent);animation:sla 2s ease-in-out infinite}
.sbx{position:absolute;left:10%;right:10%;top:24%;bottom:24%;border:2px solid rgba(255,255,255,.9);border-radius:10px;box-shadow:0 0 0 999px rgba(0,0,0,.18);pointer-events:none}
.sbt{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;pointer-events:none}
@keyframes sla{0%,100%{top:0}50%{top:calc(100% - 2px)}}
.pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px}
.pt{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;border:1px solid var(--gbo);transition:all .25s}
.pt:hover{border-color:var(--a);transform:scale(1.04);box-shadow:0 4px 16px rgba(0,212,255,.15)}
.pt img{width:100%;height:100%;object-fit:cover}
.ptd{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(248,113,113,.9);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .2s}
.pt:hover .ptd{opacity:1}
.pa{aspect-ratio:1;border-radius:10px;border:2px dashed var(--gbo);background:rgba(255,255,255,.02);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:all .25s;color:var(--t3);font-size:10px;font-weight:500}
.pa:hover{border-color:var(--a);color:var(--a);background:rgba(0,212,255,.04)}
.lo{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fi .2s ease}
.li{max-width:90vw;max-height:75vh;border-radius:12px;object-fit:contain;box-shadow:0 12px 60px rgba(0,0,0,.6)}
.ln{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;transition:all .2s}
.ln:hover{background:rgba(255,255,255,.15)}
.co{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;padding:calc(12px + env(safe-area-inset-top,0px)) 16px calc(20px + env(safe-area-inset-bottom,0px));min-height:100vh;min-height:100dvh;overflow:hidden}
.cc{width:min(360px,100%);height:100%;max-height:calc(100vh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 32px);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;align-items:center;justify-items:center;gap:12px}
.cv{width:min(320px,100%);max-width:100%;aspect-ratio:3/4;max-height:min(56vh,56dvh);border-radius:16px;overflow:hidden;border:2px solid rgba(255,255,255,.15);position:relative;box-shadow:0 0 60px rgba(0,212,255,.1)}
.cv video{width:100%;height:100%;object-fit:cover}
.cs{width:64px;height:64px;border-radius:50%;border:3px solid #fff;background:rgba(255,255,255,.15);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center}
.cs:hover{background:rgba(255,255,255,.3);transform:scale(1.05)}.cs:active{transform:scale(.95);background:rgba(255,255,255,.5)}
.ip{width:100%;height:140px;border-radius:10px;overflow:hidden;margin-bottom:14px;position:relative;cursor:pointer}
.ip img{width:100%;height:100%;object-fit:cover;transition:transform .4s}.ip:hover img{transform:scale(1.06)}
.ipl{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,.3);font-size:12px}
.ipc{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);padding:3px 8px;border-radius:12px;color:#fff;font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px}
.sh::-webkit-scrollbar{display:none}.sh{-ms-overflow-style:none;scrollbar-width:none}
.sgc{box-shadow:inset 0 0 30px rgba(0,212,255,.05),0 0 40px rgba(0,212,255,.03)}
.sgv{box-shadow:inset 0 0 30px rgba(139,92,246,.05),0 0 40px rgba(139,92,246,.03)}
.sgp{box-shadow:inset 0 0 30px rgba(244,114,182,.05),0 0 40px rgba(244,114,182,.03)}
.sgg{box-shadow:inset 0 0 30px rgba(52,211,153,.05),0 0 40px rgba(52,211,153,.03)}
.lic-gate{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.lic-box{max-width:420px;width:100%;padding:36px 32px;display:flex;flex-direction:column;gap:20px;box-shadow:0 0 80px rgba(0,212,255,.1),0 0 40px rgba(139,92,246,.06);border-color:rgba(0,212,255,.18)!important}
.lic-logo{display:flex;align-items:center;gap:14px;justify-content:center;padding-bottom:4px}
.lic-input{font-family:'Outfit',sans-serif!important;font-size:16px!important;letter-spacing:normal;text-align:center;text-transform:none}
.lic-input::placeholder{letter-spacing:normal;font-size:13px}
@media(max-width:480px){.lic-box{padding:24px 16px}.lic-input{font-size:14px!important}}
`;

// ═══ Camera Capture ═══
function CamCap({ onCapture, onClose }) {
    const vr = useRef(null), cr = useRef(null), sr = useRef(null);
    const [rdy, setRdy] = useState(false);
    const [fl, setFl] = useState(false);
    const [fm, setFm] = useState("environment");
    const start = async (f) => {
        try {
            if (sr.current) sr.current.getTracks().forEach(t => t.stop());
            const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1920 }, height: { ideal: 1440 } } });
            sr.current = s; if (vr.current) { vr.current.srcObject = s; vr.current.play(); setRdy(true); }
        } catch { onClose(); }
    };
    useEffect(() => { start(fm); return () => { if (sr.current) sr.current.getTracks().forEach(t => t.stop()) }; }, []);
    const flip = () => { const n = fm === "environment" ? "user" : "environment"; setFm(n); start(n); };
    const snap = () => {
        if (!vr.current || !cr.current) return; setFl(true); setTimeout(() => setFl(false), 150);
        const v = vr.current, c = cr.current; c.width = v.videoWidth; c.height = v.videoHeight; const x = c.getContext("2d");
        if (fm === "user") { x.translate(c.width, 0); x.scale(-1, 1); } x.drawImage(v, 0, 0); onCapture(c.toDataURL("image/jpeg", .85));
    };
    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="co">
            <div className="cc">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontFamily: "'Outfit'" }}><X size={20} /> Close</button>
                    <span style={{ color: "var(--t2)", fontSize: 14, fontWeight: 600 }}>Take Photo</span>
                    <button onClick={flip} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff" }}><RotateCcw size={20} /></button>
                </div>
                <div className="cv"><video ref={vr} playsInline muted style={{ transform: fm === "user" ? "scaleX(-1)" : "none" }} />{fl && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: .7 }} />}</div>
                <canvas ref={cr} style={{ display: "none" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}><div className="cs" onClick={snap}><Aperture size={28} color="#fff" /></div></div>
                <p style={{ color: "var(--t3)", fontSize: 12, textAlign: "center" }}>Tap to capture device photo</p>
            </div>
        </div>,
        document.body
    );
}

// ═══ Photo Uploader ═══
function PhotoUp({ photos = [], onChange, max = 6, onCameraNeeded }) {
    const fr = useRef(null);
    const [cam, setCam] = useState(false);
    const addFile = async (e) => {
        let nextPhotos = [...photos];
        for (const file of Array.from(e.target.files || [])) {
            if (nextPhotos.length >= max) break;
            const photoId = `photo-${genId()}`;
            const previewDataUrl = await createPreviewDataUrl(file);
            await savePhotoBlob(photoId, file);
            nextPhotos = [...nextPhotos, normalizePhotoRef({ id: photoId, previewDataUrl, fileName: file.name || `${photoId}.jpg`, mimeType: file.type || "image/jpeg", size: file.size || 0, uploadedAt: "", syncStatus: "local-only" })].slice(0, max);
        }
        onChange(nextPhotos);
        e.target.value = "";
    };
    const cap = async (d) => {
        setCam(false);
        if (photos.length >= max) return;
        const photoId = `photo-${genId()}`;
        const blob = await dataUrlToBlob(d);
        await savePhotoBlob(photoId, blob);
        onChange([...photos, normalizePhotoRef({ id: photoId, previewDataUrl: d, fileName: `${photoId}.jpg`, mimeType: blob.type || "image/jpeg", size: blob.size || 0, uploadedAt: "", syncStatus: "local-only" })].slice(0, max));
    };
    const rm = async (i) => {
        const target = normalizePhotoRef(photos[i], i);
        await deletePhotoBlob(target.id);
        onChange(photos.filter((_, j) => j !== i));
    };
    return (
        <div>
            <div className="pg">
                {photos.map((src, i) => (<div key={normalizePhotoRef(src, i).id} className="pt"><img src={getPhotoPreview(src)} alt="" /><div className="ptd" onClick={e => { e.stopPropagation(); void rm(i); }}><X size={12} color="#fff" /></div></div>))}
                {photos.length < max && <><div className="pa" onClick={() => { if (onCameraNeeded) onCameraNeeded(); setCam(true); }}><Camera size={20} /><span>Camera</span></div><div className="pa" onClick={() => fr.current?.click()}><Upload size={20} /><span>Gallery</span></div></>}
            </div>
            <input ref={fr} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addFile} />
            {cam && <CamCap onCapture={cap} onClose={() => setCam(false)} />}
            {photos.length > 0 && <div style={{ color: "var(--t3)", fontSize: 11, marginTop: 6 }}>{photos.length}/{max} photos</div>}
        </div>
    );
}

function SingleImageInput({ label, value, onChange, accept = "image/*" }) {
    const inputRef = useRef(null);
    const pickFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const previewDataUrl = await createPreviewDataUrl(file);
        onChange(previewDataUrl);
        e.target.value = "";
    };
    return (
        <div style={{ display: "grid", gap: 8 }}>
            <div style={{ width: "100%", maxWidth: 180, aspectRatio: "4/3", borderRadius: 12, overflow: "hidden", border: "1px solid var(--gbo)", background: "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {value
                    ? <img src={value} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--t3)", fontSize: 12 }}><ImagePlus size={20} /><span>{label}</span></div>}
            </div>
            <div className="action-row">
                <button className="bg" type="button" onClick={() => inputRef.current?.click()}><Upload size={16} /> Upload</button>
                {value ? <button className="bg" type="button" onClick={() => onChange("")}><Trash2 size={16} /> Remove</button> : null}
            </div>
            <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={pickFile} />
        </div>
    );
}

function SignaturePad({ value, onChange }) {
    const canvasRef = useRef(null);
    const drawingRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!value) return;
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = value;
    }, [value]);

    const getPos = (event) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches?.[0];
        const clientX = touch ? touch.clientX : event.clientX;
        const clientY = touch ? touch.clientY : event.clientY;
        return {
            x: ((clientX - rect.left) / rect.width) * canvas.width,
            y: ((clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    const start = (event) => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const pos = getPos(event);
        drawingRef.current = true;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        event.preventDefault?.();
    };

    const move = (event) => {
        if (!drawingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const pos = getPos(event);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        event.preventDefault?.();
    };

    const end = () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        onChange(canvasRef.current.toDataURL("image/png"));
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onChange("");
    };

    return (
        <div style={{ display: "grid", gap: 8 }}>
            <canvas
                ref={canvasRef}
                width={560}
                height={220}
                style={{ width: "100%", borderRadius: 12, border: "1px solid var(--gbo)", background: "rgba(255,255,255,.03)", touchAction: "none" }}
                onMouseDown={start}
                onMouseMove={move}
                onMouseUp={end}
                onMouseLeave={end}
                onTouchStart={start}
                onTouchMove={move}
                onTouchEnd={end}
            />
            <div className="action-row"><button className="bg" type="button" onClick={clear}><RotateCcw size={16} /> Clear Signature</button></div>
        </div>
    );
}

// ═══ Lightbox ═══
function LB({ photos, si = 0, onClose }) {
    const [i, sI] = useState(si);
    const p = () => sI(j => (j - 1 + photos.length) % photos.length);
    const n = () => sI(j => (j + 1) % photos.length);
    useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") p(); if (e.key === "ArrowRight") n(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
    if (!photos?.length) return null;
    return (
        <div className="lo" onClick={onClose}>
            <div style={{ position: "absolute", top: 20, right: 20, zIndex: 210 }}><button onClick={onClose} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={20} color="#fff" /></button></div>
            <img src={getPhotoPreview(photos[i])} className="li" alt="" onClick={e => e.stopPropagation()} />
            {photos.length > 1 && <><div className="ln" style={{ left: 16 }} onClick={e => { e.stopPropagation(); p(); }}><ChevronLeft size={22} /></div><div className="ln" style={{ right: 16 }} onClick={e => { e.stopPropagation(); n(); }}><ChevronRight size={22} /></div></>}
            <div style={{ marginTop: 16, display: "flex", gap: 6 }}>
                {photos.map((src, j) => (<div key={normalizePhotoRef(src, j).id} onClick={e => { e.stopPropagation(); sI(j); }} style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: j === i ? "2px solid var(--a)" : "2px solid transparent", opacity: j === i ? 1 : .5, transition: "all .2s" }}><img src={getPhotoPreview(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div>))}
            </div>
            <div style={{ color: "var(--t3)", fontSize: 12, marginTop: 8 }}>{i + 1}/{photos.length}</div>
        </div>
    );
}

// ═══ IMEI Scanner ═══
function IMEIS({ onScan, onClose, getCameraStream, releaseCameraLater }) {
    const vr = useRef(null), sr = useRef(null), rr = useRef(null), xr = useRef(null), cr = useRef(null), ar = useRef(null), br = useRef(false), busy = useRef(false), fr = useRef(null);
    const [sc, setSc] = useState(false);
    const [er, setEr] = useState("");
    const [mi, setMi] = useState("");
    const [eng, setEng] = useState("");
    const [scanTick, setScanTick] = useState(0);
    const [ht, setHt] = useState("Point the back camera at the IMEI barcode on the box or *#06# screen and hold it inside the scan band.");
    const secureOk = typeof window !== "undefined" && (window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname));

    const clearTimers = useCallback(() => {
        if (rr.current) { window.cancelAnimationFrame(rr.current); rr.current = null; }
        if (xr.current) { window.clearTimeout(xr.current); xr.current = null; }
        if (fr.current) { clearInterval(fr.current); fr.current = null; }
        busy.current = false;
    }, []);

    const playBeep = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            if (!ar.current) ar.current = new AudioCtx();
            const ctx = ar.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = 920;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.13);
        } catch { }
        try { navigator.vibrate?.(35); } catch { }
    }, []);

    const stop = useCallback(() => {
        br.current = false;
        clearTimers();
        if (cr.current?.stop) {
            try { cr.current.stop(); } catch { }
            cr.current = null;
        }
        if (vr.current?.srcObject) vr.current.srcObject = null;
        sr.current = null;
        if (releaseCameraLater) releaseCameraLater();
        setSc(false);
    }, [clearTimers, releaseCameraLater]);

    const startPreviewStream = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support live camera scanning. Use manual entry.");
        const stream = getCameraStream ? await getCameraStream() : await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
        });
        sr.current = stream;
        vr.current.srcObject = stream;
        await vr.current.play();
        setSc(true);
        return stream;
    }, [getCameraStream]);

    const focusCamera = useCallback(() => {
        const stream = sr.current || vr.current?.srcObject;
        const track = stream?.getVideoTracks?.()?.[0];
        if (!track?.applyConstraints || !navigator.mediaDevices?.getSupportedConstraints) return;
        const supported = navigator.mediaDevices.getSupportedConstraints();
        const advanced = [];
        if (supported.focusMode) advanced.push({ focusMode: "continuous" });
        if (supported.exposureMode) advanced.push({ exposureMode: "continuous" });
        if (!advanced.length) return;
        track.applyConstraints({ advanced }).catch(() => { });
    }, []);

    const toggleTorch = useCallback(() => {
        const stream = sr.current || vr.current?.srcObject;
        const track = stream?.getVideoTracks?.()?.[0];
        if (!track) return;
        const caps = track.getCapabilities?.();
        if (!caps?.torch) return;
        const current = track.getSettings?.()?.torch || false;
        track.applyConstraints({ advanced: [{ torch: !current }] }).catch(() => { });
    }, []);

    const handleDetected = useCallback((raw, source) => {
        const text = String(raw || "");
        const matches = text.match(/\d{15}/g) || [];
        const code = extractScanImei(matches[0] || text);
        if (!hasImei(code)) {
            if (text) setHt(`${source} detected a code, but it is not a valid 15-digit IMEI. Align only the IMEI barcode.`);
            return false;
        }
        playBeep();
        stop();
        onScan(code);
        return true;
    }, [onScan, playBeep, stop]);

    const handleMultiDetected = useCallback((items, source) => {
        const valid = items
            .map(it => ({ imei: extractScanImei(it.rawValue || ""), y: it.cornerPoints?.[0]?.y ?? it.boundingBox?.y ?? 0 }))
            .filter(it => hasImei(it.imei));
        if (!valid.length) return false;
        valid.sort((a, b) => a.y - b.y);
        const unique = [...new Set(valid.map(v => v.imei))];
        playBeep();
        stop();
        if (unique.length >= 2) {
            onScan(unique[0], unique[1]);
        } else {
            onScan(unique[0]);
        }
        return true;
    }, [onScan, playBeep, stop]);

    const startZXing = useCallback(async () => {
        if (!vr.current) throw new Error("Camera preview is not ready.");
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        await startPreviewStream();
        setEng("Compatibility scanner");
        setHt("Searching IMEI barcode. Align only the IMEI barcode inside the scan band.");
        setSc(true);
        focusCamera();
        fr.current = setInterval(() => focusCamera(), 2000);
        const cropCanvas = document.createElement("canvas");
        const cropCtx = cropCanvas.getContext("2d");
        let lastScan = 0, lastCW = 0, lastCH = 0;
        const loop = (ts) => {
            if (!vr.current || !sr.current) return;
            if (ts - lastScan < 100 || busy.current) { rr.current = requestAnimationFrame(loop); return; }
            lastScan = ts;
            busy.current = true;
            try {
                const v = vr.current;
                const vw = v.videoWidth || 1280;
                const vh = v.videoHeight || 720;
                const sx = Math.floor(vw * 0.06);
                const sy = Math.floor(vh * 0.33);
                const sw = Math.floor(vw * 0.88);
                const sh = Math.floor(vh * 0.34);
                if (lastCW !== sw || lastCH !== sh) { cropCanvas.width = sw; cropCanvas.height = sh; lastCW = sw; lastCH = sh; }
                cropCtx.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
                const result = reader.decodeFromCanvas(cropCanvas);
                busy.current = false;
                if (result && handleDetected(result.getText(), "Scanner")) return;
            } catch { busy.current = false; }
            if (vr.current && sr.current) rr.current = requestAnimationFrame(loop);
        };
        rr.current = requestAnimationFrame(loop);
    }, [focusCamera, handleDetected, startPreviewStream]);

    const startNative = useCallback(async () => {
        if (!vr.current || typeof window === "undefined" || !("BarcodeDetector" in window)) return false;
        const preferred = ["code_128", "code_39", "ean_13", "ean_8", "upc_a"];
        let supported = preferred;
        try {
            const fmts = await window.BarcodeDetector.getSupportedFormats?.();
            if (Array.isArray(fmts) && fmts.length) supported = preferred.filter(f => fmts.includes(f));
        } catch { }
        if (!supported.length) return false;
        await startPreviewStream();
        setSc(true);
        setEng("Fast scanner");
        setHt("Searching IMEI barcode. Hold the box or *#06# barcode steady inside the scan band.");
        focusCamera();
        fr.current = setInterval(() => focusCamera(), 2000);
        const detector = new window.BarcodeDetector({ formats: supported });
        let lastScan = 0;
        const loop = (ts) => {
            if (!vr.current || !sr.current) return;
            if (ts - lastScan < 80 || busy.current) { rr.current = requestAnimationFrame(loop); return; }
            lastScan = ts;
            busy.current = true;
            detector.detect(vr.current).then(found => {
                busy.current = false;
                if (found && found.length >= 2) {
                    if (handleMultiDetected(found, "Fast scanner")) return;
                }
                for (const item of found || []) {
                    if (handleDetected(item?.rawValue || "", "Fast scanner")) return;
                }
                if (vr.current && sr.current) rr.current = requestAnimationFrame(loop);
            }).catch(() => {
                busy.current = false;
                if (vr.current && sr.current) rr.current = requestAnimationFrame(loop);
            });
        };
        rr.current = requestAnimationFrame(loop);
        xr.current = window.setTimeout(async () => {
            if (!sr.current || cr.current) return;
            setHt("Switching to compatibility scanner for a stronger barcode read...");
            stop();
            try {
                await startZXing();
            } catch (error) {
                setEr(error instanceof Error ? error.message : "Scanner fallback failed. Type the IMEI manually.");
            }
        }, 8000);
        return true;
    }, [focusCamera, handleDetected, handleMultiDetected, startPreviewStream, startZXing, stop]);

    useEffect(() => {
        let cancelled = false;
        const begin = async () => {
            setEr("");
            clearTimers();
            stop();
            if (!navigator.mediaDevices?.getUserMedia) {
                setEr("This browser does not support live camera scanning. Use manual entry.");
                return;
            }
            if (!secureOk) setHt("For best scan speed use HTTPS or the installed app. Then scan the box or *#06# barcode.");
            try {
                const started = await startNative();
                if (!started && !cancelled) await startZXing();
            } catch (error) {
                if (cancelled) return;
                try {
                    await startZXing();
                } catch {
                    setEr(error instanceof Error ? error.message : "Camera denied. Use manual entry.");
                }
            }
        };
        void begin();
        return () => { cancelled = true; stop(); };
    }, [clearTimers, scanTick, secureOk, startNative, startZXing, stop]);

    const sub = () => {
        const c = extractScanImei(mi);
        if (hasImei(c)) onScan(c);
        else setEr("IMEI must be 15 digits.");
    };
    return (
        <div className="so fi"><div style={{ width: "100%", maxWidth: 400, padding: 24, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ color: "var(--t1)", fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><ScanLine size={20} style={{ color: "var(--a)" }} /> Scan IMEI Barcode</h3>
                <button onClick={() => { stop(); onClose(); }} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={24} color="rgba(255,255,255,.6)" /></button>
            </div>
            <div className="sf" style={{ margin: "0 auto 20px" }}><video ref={vr} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted autoPlay />{sc && <><div className="sl" /><div className="sbx" style={{ left: "8%", right: "8%", top: "38%", bottom: "38%" }} /><div className="sbt">IMEI barcode zone</div></>}</div>
            {er && <div style={{ color: "var(--warn)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {er}</div>}
            <div style={{ marginBottom: 14 }}><div style={{ color: "var(--t2)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{eng || "Preparing scanner"}</div><p style={{ color: "var(--t3)", fontSize: 13 }}>{ht}</p></div>
            <div style={{ display: "flex", gap: 8 }}>
                <input className="gi" type="tel" maxLength={15} placeholder="15-digit IMEI" value={mi} onChange={e => setMi(e.target.value.replace(/\D/g, "").slice(0, 15))} onKeyDown={e => e.key === "Enter" && sub()} style={{ fontFamily: "'Space Mono',monospace", letterSpacing: 1 }} />
                <button className="bp" onClick={sub} style={{ whiteSpace: "nowrap" }}><CheckCircle size={16} /> Add</button>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
                <button className="bg" onClick={() => { setEr(""); setMi(""); setHt("Point the back camera at the IMEI barcode on the box or *#06# screen and hold it inside the scan band."); setScanTick(v => v + 1); }}><RefreshCw size={15} /> Scan Again</button>
                {sc && <button className="bg" onClick={toggleTorch} title="Toggle flashlight"><Zap size={15} /> Light</button>}
            </div>
        </div></div>
    );
}

function F({ l, ic: I, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t2)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                {I && <I size={13} />} {l}
            </label>
            {children}
        </div>
    );
}

function StorageInput({ value, onChange }) {
    const usingCustom = !isPresetStorage(value);
    return (
        <div style={{ display: "grid", gap: 8 }}>
            <select className="gs" value={usingCustom ? CUSTOM_STORAGE : value} onChange={e => onChange(e.target.value === CUSTOM_STORAGE ? (usingCustom ? value : "") : e.target.value)}>
                {STORAGE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value={CUSTOM_STORAGE}>Custom</option>
            </select>
            {usingCustom && <input className="gi" value={value} onChange={e => onChange(e.target.value)} placeholder="Custom storage e.g. 2TB" />}
        </div>
    );
}

// ═══ MAIN ═══
export default function App() {
    const AUTO_SYNC_RETRY_MS = 60000;
    const seed = useRef(loadStore());
    const syncSeed = useRef(loadSyncCfg());
    const autoSyncSkip = useRef(true);
    const skipNextAutoSync = useRef(false);
    const skipNextDirtyMark = useRef(false);
    const syncBusyRef = useRef(false);
    const logoInputRef = useRef(null);
    const [authReady, setAuthReady] = useState(false);
    const [shopSession, setShopSession] = useState(null);
    const [loginId, setLoginId] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginBusy, setLoginBusy] = useState(false);
    const [authMode, setAuthMode] = useState("sign-in");
    const [signupForm, setSignupForm] = useState({ shopName: "", mobileNumber: "", email: "", password: "", confirmPassword: "" });
    const [signupError, setSignupError] = useState("");
    const [signupBusy, setSignupBusy] = useState(false);
    const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);
    const [resetEmail, setResetEmail] = useState("");
    const [resetError, setResetError] = useState("");
    const [resetBusy, setResetBusy] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(typeof window !== "undefined" && window.location.pathname === ADMIN_PANEL_PATH);
    const [adminLoginId, setAdminLoginId] = useState("");
    const [adminPassword, setAdminPassword] = useState("");
    const [adminToken, setAdminToken] = useState("");
    const [adminError, setAdminError] = useState("");
    const [adminBusy, setAdminBusy] = useState(false);
    const [adminTab, setAdminTab] = useState("overview");
    const [adminUsers, setAdminUsers] = useState([]);
    const [adminShops, setAdminShops] = useState([]);
    const [adminSearch, setAdminSearch] = useState("");
    const [adminStatusFilter, setAdminStatusFilter] = useState("all");
    const [adminSettings, setAdminSettings] = useState({ id: "", trialDays: DEFAULT_TRIAL_DAYS });
    const [adminActionId, setAdminActionId] = useState("");
    const [adminForm, setAdminForm] = useState({ shopId: "", shopName: "", loginId: "", password: "", syncKey: "" });
    const [pg, sPg] = useState("dashboard");
    const [inv, sInv] = useState(seed.current.inv);
    const [tx, sTx] = useState(seed.current.tx);
    const [shopCfg, sShopCfg] = useState(seed.current.shop);
    const [scs, setScs] = useState(false);
    const [st, sSt] = useState(null);
    const [sq, sSq] = useState("");
    const [iq, sIq] = useState("");
    const [reportType, setReportType] = useState("All");
    const [reportView, setReportView] = useState("Transactions");
    const [reportPreset, setReportPreset] = useState("Today");
    const [reportFrom, setReportFrom] = useState(isoDate());
    const [reportTo, setReportTo] = useState(isoDate());
    const [reportBillFilter, setReportBillFilter] = useState("All Bills");
    const [reportPaymentFilter, setReportPaymentFilter] = useState("All Payments");
    const [reportPartyQuery, setReportPartyQuery] = useState("");
    const [reportBrandFilter, setReportBrandFilter] = useState("All Brands");
    const [reportItemQuery, setReportItemQuery] = useState("");
    const [reportDueFilter, setReportDueFilter] = useState("All Status");
    const [fc, sFc] = useState("All");
    const [fs, sFs] = useState("All");
    const [ei, sEi] = useState(null);
    const [sf, sSf] = useState(false);
    const [nt, sNt] = useState(null);
    const [vm, sVm] = useState("grid");
    const [lb, sLb] = useState(null);
    const [di, sDi] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [canPersist] = useState(typeof window !== "undefined" && !!window.localStorage);
    const [ol, setOl] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
    const [syncCfg, setSyncCfg] = useState(syncSeed.current);
    const [syncBusy, setSyncBusy] = useState(false);
    const [profileSaveBusy, setProfileSaveBusy] = useState(false);
    const [shopProfileDirty, setShopProfileDirty] = useState(false);
    const [syncEditMode, setSyncEditMode] = useState(false);
    const [storageReady, setStorageReady] = useState(false);
    const [syncMeta, setSyncMeta] = useState(() => normalizeSyncMeta());
    const [installEvt, setInstallEvt] = useState(null);
    const [installed, setInstalled] = useState(typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone));
    const [swReady, setSwReady] = useState(false);
    const [swUpdate, setSwUpdate] = useState(false);
    const lastRemoteCheckAtRef = useRef(0);
    const loadPocketBaseDataRef = useRef(null);
    const lastSavedShopProfileSignatureRef = useRef('');
    const notifyTimeoutRef = useRef(null);
    const shopProfileDirtyRef = useRef(false);
    const scannerBufRef = useRef("");
    const scannerLastKeyRef = useRef(0);
    const scannerTimeoutRef = useRef(null);
    const pgRef = useRef(null);
    const fmRef = useRef(null);
    const invRef = useRef(null);
    const scsRef = useRef(false);
    const camStream = useRef(null);
    const camIdleTimer = useRef(null);
    const getCameraStream = useCallback(async () => {
        if (camIdleTimer.current) { clearTimeout(camIdleTimer.current); camIdleTimer.current = null; }
        if (camStream.current) {
            const tracks = camStream.current.getVideoTracks();
            if (tracks.length && tracks[0].readyState === "live") return camStream.current;
            camStream.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
        });
        camStream.current = stream;
        return stream;
    }, []);
    const releaseCameraLater = useCallback(() => {
        if (camIdleTimer.current) clearTimeout(camIdleTimer.current);
        camIdleTimer.current = setTimeout(() => {
            if (camStream.current) {
                camStream.current.getTracks().forEach(t => t.stop());
                camStream.current = null;
            }
            camIdleTimer.current = null;
        }, 30000);
    }, []);
    const releaseCameraNow = useCallback(() => {
        if (camIdleTimer.current) { clearTimeout(camIdleTimer.current); camIdleTimer.current = null; }
        if (camStream.current) { camStream.current.getTracks().forEach(t => t.stop()); camStream.current = null; }
    }, []);

    const ef = useMemo(() => createEmptyForm(shopCfg), [shopCfg]);
    const [fm, sFm] = useState(ef);
    const liveDeviceByImei = (imei) => inv.find(i => matchImei(i, imei) && i.status === "In Stock" && i.qty > 0);
    const activeSyncUrl = getPocketBaseUrl();
    const syncReady = !!(shopSession?.pbAuth?.token && (syncCfg.shopId || shopSession?.shopId));
    const syncSetupMessage = shopSession ? "Cloud data is not configured yet." : "Login required before saving data.";
    const syncStateLabel = syncMeta.syncState === "syncing"
        ? "Syncing"
        : syncMeta.syncState === "uploading-photos"
            ? "Uploading photos"
        : syncMeta.syncState === "synced"
            ? "Synced"
            : syncMeta.syncState === "remote-newer"
                ? "Remote newer"
                : syncMeta.syncState === "offline"
                    ? "Offline"
                    : syncMeta.syncState === "error"
                        ? "Sync failed"
                        : "Saved locally";
    const showSyncAdvanced = !shopSession && (syncEditMode || !syncCfg.connected);
    const syncTargetLabel = "PocketBase";
    const syncHostLabel = (() => {
        try { return activeSyncUrl ? new URL(activeSyncUrl).hostname : "Not set"; } catch { return activeSyncUrl || "Not set"; }
    })();
    const isIosInstall = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const notify = useCallback((m, t = "success") => {
        sNt({ m, t });
        if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
        notifyTimeoutRef.current = setTimeout(() => sNt(null), 3000);
    }, []);
    const switchAuthMode = useCallback((mode) => {
        setAuthMode(mode);
        setLoginError("");
        setSignupError("");
        setResetError("");
    }, []);
    const adminAuth = useMemo(() => {
        try { return adminToken ? JSON.parse(adminToken) : null; } catch { return null; }
    }, [adminToken]);
    const applyShopSession = useCallback((session) => {
        if (!session) return;
        if (session?.pbAuth?.record?.active === false) {
            window.localStorage.removeItem(AUTH_SESSION_KEY);
            setShopSession(null);
            setLoginError("Your account is inactive. Contact support to continue.");
            setAuthMode("sign-in");
            setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: activeSyncUrl, lastStatus: "Account inactive" }));
            return;
        }
        if (pocketbaseIsTrialExpired(session?.trialEndsAt || session?.pbAuth?.record?.trialEndsAt)) {
            window.localStorage.removeItem(AUTH_SESSION_KEY);
            setShopSession(null);
            setLoginError("Your trial has expired. Contact support to extend access.");
            setAuthMode("sign-in");
            setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: activeSyncUrl, lastStatus: "Trial expired" }));
            return;
        }
        const hasManagedSync = Boolean(String(session.shopId || "").trim() && session.pbAuth?.token && session.pbAuth?.record);
        if (!hasManagedSync) {
            setShopSession(null);
            setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: activeSyncUrl, lastStatus: "Cloud session is not configured" }));
            return;
        }
        setShopSession(session);
        setSyncCfg(current => normalizeSyncCfg({
            ...current,
            shopId: session.shopId || current.shopId,
            scriptUrl: activeSyncUrl,
            syncKey: session.syncKey || current.syncKey,
            connected: Boolean(session.shopId && session.pbAuth?.token),
            lastStatus: session.shopId ? `Connected to ${syncTargetLabel}` : current.lastStatus,
        }));
    }, [activeSyncUrl, syncTargetLabel]);
    const fetchAdminShops = useCallback(async (token) => {
        const data = await pocketbaseAdminLoadDashboard(token);
        setAdminUsers((data?.users || []).map((user) => ({
            ...user,
            trialDraft: String(user.trialEndsAt || "").slice(0, 10),
            emailDraft: user.email || "",
            mobileDraft: user.mobileNumber || "",
        })));
        setAdminShops((data?.shops || []).map((shop) => ({
            ...shop,
            shopNameDraft: shop.shopName || "",
            emailDraft: shop.email || "",
            phoneDraft: shop.phone || "",
        })));
        const resolvedTrialDays = Number(data?.settings?.trialDays || DEFAULT_TRIAL_DAYS) || DEFAULT_TRIAL_DAYS;
        setAdminSettings({ id: data?.settings?.id || "", trialDays: resolvedTrialDays });
        setTrialDays(resolvedTrialDays);
    }, []);
    const handleShopLogin = async () => {
        if (!loginId.trim() || !loginPassword.trim()) { setLoginError("Enter mobile number and password."); return; }
        setLoginBusy(true); setLoginError("");
        try {
            const data = await pocketbaseShopLogin(loginId, loginPassword);
            const session = { loginId: data.record?.username || cleanMobileNumber(loginId), shopId: data.shop.shopId, shopName: data.shop.shopName, scriptUrl: activeSyncUrl, syncKey: '', trialEndsAt: data.trialEndsAt || '', pbAuth: { token: data.token, record: data.record } };
            window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
            applyShopSession(session);
            setAuthReady(true);
            setLoginId(data.record?.username || cleanMobileNumber(loginId));
            setLoginPassword("");
            notify(`Welcome ${data.shop?.shopName || data.shop?.shopId || ''}`.trim(), "success");
        } catch (e) {
            setLoginError(e?.message || "Login failed.");
        } finally {
            setLoginBusy(false);
        }
    };
    const handleShopSignup = async () => {
        const mobileNumber = cleanMobileNumber(signupForm.mobileNumber);
        if (!signupForm.shopName.trim()) { setSignupError("Enter your shop name."); return; }
        if (mobileNumber.length !== 10) { setSignupError("Enter a valid 10-digit mobile number."); return; }
        if (!String(signupForm.email || "").trim()) { setSignupError("Enter your email address."); return; }
        if (!signupForm.password) { setSignupError("Enter a password."); return; }
        if (signupForm.password !== signupForm.confirmPassword) { setSignupError("Passwords do not match."); return; }
        setSignupBusy(true); setSignupError("");
        try {
            const data = await pocketbaseRegisterShopUser({ ...signupForm, mobileNumber, trialDays });
            const session = { loginId: data.record?.username || mobileNumber, shopId: data.shop.shopId, shopName: data.shop.shopName, scriptUrl: activeSyncUrl, syncKey: '', trialEndsAt: data.trialEndsAt || '', pbAuth: { token: data.token, record: data.record } };
            window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
            applyShopSession(session);
            setAuthReady(true);
            setLoginId(data.record?.username || mobileNumber);
            setLoginPassword("");
            setSignupForm({ shopName: "", mobileNumber: "", email: "", password: "", confirmPassword: "" });
            notify(`Account created. Trial active for ${trialDays} days.`, "success");
        } catch (e) {
            setSignupError(e?.message || "Unable to create account.");
        } finally {
            setSignupBusy(false);
        }
    };
    const handlePasswordReset = async () => {
        if (!String(resetEmail || "").trim()) { setResetError("Enter your email address."); return; }
        setResetBusy(true); setResetError("");
        try {
            await pocketbaseRequestPasswordReset(resetEmail);
            notify("Password reset email sent. Check your inbox.", "success");
            setResetEmail("");
            setAuthMode("sign-in");
        } catch (e) {
            setResetError(e?.message || "Unable to send reset email.");
        } finally {
            setResetBusy(false);
        }
    };
    const handleAdminLogin = async () => {
        if (!adminLoginId.trim() || !adminPassword.trim()) { setAdminError("Enter admin ID and password."); return; }
        setAdminBusy(true); setAdminError("");
        try {
            const data = await pocketbaseAdminLogin(adminLoginId, adminPassword);
            setAdminToken(JSON.stringify(data));
            if (typeof window !== "undefined" && window.sessionStorage) window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify(data));
            await fetchAdminShops(data);
            setAdminTab("overview");
        } catch (e) {
            setAdminError(e?.message || "Admin login failed.");
        } finally {
            setAdminBusy(false);
        }
    };
    const saveAdminShop = async () => {
        if (!adminToken) { setAdminError("Admin login required."); return; }
        if (!adminForm.shopId.trim() || !adminForm.loginId.trim() || !adminForm.password.trim()) {
            setAdminError("Shop ID, shop login ID, and password are required.");
            return;
        }
        setAdminBusy(true); setAdminError("");
        try {
            const adminAuth = JSON.parse(adminToken);
            await pocketbaseSaveShop(adminAuth, adminForm);
            await fetchAdminShops(adminAuth);
            setAdminForm({ shopId: "", shopName: "", loginId: "", password: "", syncKey: "" });
            notify("Shop login saved in PhoneDukaan admin panel.", "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to save shop.");
        } finally {
            setAdminBusy(false);
        }
    };
    const saveAdminUser = async (userId) => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        const target = adminUsers.find(user => user.id === userId);
        if (!target) return;
        setAdminActionId(userId); setAdminError("");
        try {
            await pocketbaseAdminUpdateUser(adminAuth, userId, { mobileNumber: target.mobileDraft, email: target.emailDraft, trialEndsAt: target.trialDraft ? `${target.trialDraft}T23:59:59.000Z` : null, active: target.active });
            await fetchAdminShops(adminAuth);
            notify(`Saved ${target.shopName || target.mobileNumber}`, "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to save user.");
        } finally {
            setAdminActionId("");
        }
    };
    const extendAdminUserTrial = async (userId, days) => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        setAdminActionId(userId); setAdminError("");
        try {
            await pocketbaseAdminExtendUserTrial(adminAuth, userId, days);
            await fetchAdminShops(adminAuth);
            notify(`Trial extended by ${days} days`, "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to extend trial.");
        } finally {
            setAdminActionId("");
        }
    };
    const toggleAdminUserActive = async (userId, active) => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        setAdminActionId(userId); setAdminError("");
        try {
            await pocketbaseAdminUpdateUser(adminAuth, userId, { active });
            await fetchAdminShops(adminAuth);
            notify(active ? "User activated" : "User deactivated", "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to update user.");
        } finally {
            setAdminActionId("");
        }
    };
    const sendAdminPasswordReset = async (user) => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        setAdminActionId(user.id); setAdminError("");
        try {
            await pocketbaseAdminSendPasswordReset(adminAuth, user.emailDraft || user.email);
            notify(`Reset email sent to ${user.emailDraft || user.email}`, "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to send reset email.");
        } finally {
            setAdminActionId("");
        }
    };
    const saveAdminShopDetails = async (shopId) => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        const target = adminShops.find(shop => shop.id === shopId);
        if (!target) return;
        setAdminActionId(shopId); setAdminError("");
        try {
            await pocketbaseAdminUpdateShop(adminAuth, shopId, { shopName: target.shopNameDraft, email: target.emailDraft, phone: target.phoneDraft });
            await fetchAdminShops(adminAuth);
            notify(`Saved ${target.shopNameDraft || target.shopName}`, "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to save shop.");
        } finally {
            setAdminActionId("");
        }
    };
    const saveAdminSettings = async () => {
        if (!adminAuth) { setAdminError("Admin login required."); return; }
        setAdminActionId("settings"); setAdminError("");
        try {
            await pocketbaseAdminUpdateSettings(adminAuth, { trialDays: adminSettings.trialDays });
            await fetchAdminShops(adminAuth);
            notify("Default trial days updated", "success");
        } catch (e) {
            setAdminError(e?.message || "Unable to update settings.");
        } finally {
            setAdminActionId("");
        }
    };
    const handleAdminLogout = async () => {
        try { if (adminAuth?.sessionToken) await pocketbaseAdminLogout(adminAuth); } catch { }
        if (typeof window !== "undefined" && window.sessionStorage) window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
        setAdminToken("");
        setAdminUsers([]);
        setAdminShops([]);
        setAdminError("");
        setAdminActionId("");
        closeAdminPanel();
    };
    const logoutShop = () => {
        unsubscribeFromShopData();
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        setShopSession(null);
        setAuthReady(true);
        setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: activeSyncUrl, syncKey: "", lastStatus: "Login required" }));
        notify("Logged out.", "success");
    };
    const openSc = (t) => { sSt(t); setScs(true); };
    const resetForm = () => { sEi(null); sFm(createEmptyForm(shopCfg)); };
    const goPage = (page, { skipHistory = false } = {}) => {
        sDi(null); sSf(false);
        if (page === "add") resetForm();
        sPg(prev => {
            if (!skipHistory && typeof window !== "undefined" && prev !== page) {
                window.history.pushState({ page }, "", window.location.pathname);
            }
            return page;
        });
    };
    const editFromStock = (item) => { sEi(item); sFm(toForm(item)); sSf(false); sDi(null); sPg(prev => { if (typeof window !== "undefined" && prev !== "add") window.history.pushState({ page: prev }, "", window.location.pathname); return "add"; }); };
    const setSyncField = (k, v) => setSyncCfg(p => normalizeSyncCfg({ ...p, [k]: v, ...(k === "scriptUrl" || k === "shopId" || k === "syncKey" ? { connected: false } : {}) }));
    const setShopField = (k, v) => {
        setShopProfileDirty(true);
        shopProfileDirtyRef.current = true;
        sShopCfg(p => normalizeShopProfile({ ...p, [k]: v }));
    };
    const markSyncConnected = useCallback((extra = {}) => {
        setSyncCfg(p => normalizeSyncCfg({ ...p, connected: true, ...extra }));
    }, []);
    const updateSyncMeta = useCallback((patch) => {
        setSyncMeta(current => normalizeSyncMeta(typeof patch === "function" ? patch(current) : { ...current, ...patch }));
    }, []);
    const promptInstall = async () => {
        if (installEvt) {
            await installEvt.prompt();
            const choice = await installEvt.userChoice;
            if (choice?.outcome !== "accepted") notify("Install cancelled", "warning");
            setInstallEvt(null);
            return;
        }
        if (isIosInstall && !installed) {
            notify("On iPhone: open in Safari, tap Share, then Add to Home Screen.", "warning");
            return;
        }
        notify("Install prompt is not available yet. Use HTTPS or keep using the app a bit longer.", "warning");
    };
    const openAdminPanel = useCallback(() => {
        setShowAdminPanel(true);
        if (typeof window !== "undefined" && window.location.pathname !== ADMIN_PANEL_PATH) {
            window.history.pushState({}, "", ADMIN_PANEL_PATH);
        }
    }, []);
    const closeAdminPanel = useCallback(() => {
        setShowAdminPanel(false);
        if (typeof window !== "undefined" && window.location.pathname === ADMIN_PANEL_PATH) {
            window.history.pushState({}, "", "/");
        }
    }, []);
    const handleLogoPick = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setShopField("logoData", ev.target?.result || "");
        reader.readAsDataURL(file);
        event.target.value = "";
    };
    const uf = (k, v) => sFm(p => {
        const next = { ...p, [k]: v };
        if (k === "imei" || k === "imei2") next[k] = cleanImei(v);
        if (k === "amount" || k === "paidAmount") {
            const total = Number(k === "amount" ? v : next.amount) || 0;
            let paid = Number(k === "paidAmount" ? v : next.paidAmount) || 0;
            if (paid > total && total > 0) { paid = total; next.paidAmount = String(total); }
            next.dueAmount = String(Math.max(total - paid, 0));
        }
        if (k === "gstRate") next.gstRate = String(v).replace(/[^\d.]/g, "");
        return next;
    });
    const toForm = (item, extras = {}) => ({ ...ef, ...item, ...extras, buyPrice: String(item.buyPrice ?? extras.buyPrice ?? ""), sellPrice: String(item.sellPrice ?? extras.sellPrice ?? ""), qty: String(item.qty ?? extras.qty ?? 1), amount: String(item.amount ?? extras.amount ?? ""), paidAmount: String(item.paidAmount ?? extras.paidAmount ?? item.sellPrice ?? item.amount ?? ""), dueAmount: String(item.dueAmount ?? extras.dueAmount ?? 0) });
    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(AUTH_SESSION_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!parsed?.shopId || !parsed?.pbAuth?.token || parsed?.pbAuth?.record?.active === false || pocketbaseIsTrialExpired(parsed?.trialEndsAt || parsed?.pbAuth?.record?.trialEndsAt)) {
                    window.localStorage.removeItem(AUTH_SESSION_KEY);
                    if (parsed?.pbAuth?.record?.active === false) {
                        setLoginError("Your account is inactive. Contact support to continue.");
                    }
                    if (parsed?.shopId && pocketbaseIsTrialExpired(parsed?.trialEndsAt || parsed?.pbAuth?.record?.trialEndsAt)) {
                        setLoginError("Your trial has expired. Contact support to extend access.");
                    }
                    setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: activeSyncUrl, lastStatus: "Login required" }));
                } else {
                    applyShopSession(parsed);
                }
            }
        } catch { }
        setAuthReady(true);
    }, [activeSyncUrl, applyShopSession]);
    useEffect(() => {
        if (showAdminPanel) return;
        let cancelled = false;
        (async () => {
            try {
                const configuredTrialDays = await pocketbaseGetTrialDays();
                if (!cancelled && Number(configuredTrialDays) > 0) setTrialDays(Number(configuredTrialDays));
            } catch { }
        })();
        return () => { cancelled = true; };
    }, [showAdminPanel]);
    useEffect(() => {
        if (!showAdminPanel || adminToken) return;
        let cancelled = false;
        (async () => {
            try {
                const stored = typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage.getItem(ADMIN_AUTH_SESSION_KEY) : "";
                if (!stored) return;
                const parsed = JSON.parse(stored);
                const session = await pocketbaseAdminSession(parsed);
                if (cancelled) return;
                setAdminToken(JSON.stringify(session));
                if (typeof window !== "undefined" && window.sessionStorage) window.sessionStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify(session));
                await fetchAdminShops(session);
                setAdminTab("overview");
            } catch {
                if (typeof window !== "undefined" && window.sessionStorage) window.sessionStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
            }
        })();
        return () => { cancelled = true; };
    }, [adminToken, fetchAdminShops, showAdminPanel]);
    const adminUsersFiltered = useMemo(() => {
        const query = adminSearch.trim().toLowerCase();
        return adminUsers.filter((user) => {
            const expiresAt = Date.parse(String(user.trialEndsAt || ""));
            const daysLeft = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
            const matchesQuery = !query || [user.shopName, user.shopId, user.mobileNumber, user.email].some(value => String(value || "").toLowerCase().includes(query));
            const matchesStatus = adminStatusFilter === "all"
                || (adminStatusFilter === "active" && user.active)
                || (adminStatusFilter === "inactive" && !user.active)
                || (adminStatusFilter === "expired" && pocketbaseIsTrialExpired(user.trialEndsAt))
                || (adminStatusFilter === "endingSoon" && !pocketbaseIsTrialExpired(user.trialEndsAt) && daysLeft != null && daysLeft <= 7);
            return matchesQuery && matchesStatus;
        });
    }, [adminSearch, adminStatusFilter, adminUsers]);
    const adminTrialUsers = useMemo(() => adminUsers.filter((user) => {
        const expiresAt = Date.parse(String(user.trialEndsAt || ""));
        const daysLeft = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
        return pocketbaseIsTrialExpired(user.trialEndsAt) || (daysLeft != null && daysLeft <= 7);
    }).sort((a, b) => String(a.trialEndsAt || "").localeCompare(String(b.trialEndsAt || ""))), [adminUsers]);
    const adminStats = useMemo(() => ({
        totalUsers: adminUsers.length,
        activeUsers: adminUsers.filter(user => user.active).length,
        expiredUsers: adminUsers.filter(user => pocketbaseIsTrialExpired(user.trialEndsAt)).length,
        endingSoonUsers: adminUsers.filter((user) => {
            const expiresAt = Date.parse(String(user.trialEndsAt || ""));
            const daysLeft = Number.isFinite(expiresAt) ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
            return !pocketbaseIsTrialExpired(user.trialEndsAt) && daysLeft != null && daysLeft <= 7;
        }).length,
    }), [adminUsers]);
    useEffect(() => {
        if (syncCfg.scriptUrl === activeSyncUrl) return;
        setSyncCfg(current => normalizeSyncCfg({ ...current, scriptUrl: activeSyncUrl }));
    }, [activeSyncUrl, syncCfg.scriptUrl]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.history.replaceState({ page: "dashboard" }, "", window.location.pathname);
        const handlePopState = (event) => {
            // Handle admin panel route
            if (window.location.pathname === ADMIN_PANEL_PATH) {
                setShowAdminPanel(true);
                return;
            }
            setShowAdminPanel(false);
            // Handle in-app page navigation back
            const prevPage = event.state?.page;
            if (prevPage) {
                sDi(null); sSf(false);
                sPg(prevPage);
            } else {
                // No more history states — push a dummy state to prevent app close
                sPg("dashboard");
                window.history.pushState({ page: "dashboard" }, "", window.location.pathname);
            }
        };
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);
    // ── sync refs for hardware barcode scanner ──
    useEffect(() => { pgRef.current = pg; }, [pg]);
    useEffect(() => { fmRef.current = fm; }, [fm]);
    useEffect(() => { invRef.current = inv; }, [inv]);
    useEffect(() => { scsRef.current = scs; }, [scs]);
    // ── hardware barcode scanner (USB / Bluetooth) ──
    useEffect(() => {
        const CHAR_GAP_MS = 50;
        const MIN_LENGTH = 10;
        const IDLE_RESET_MS = 200;
        const handleKeyDown = (e) => {
            const now = Date.now();
            const gap = now - scannerLastKeyRef.current;
            scannerLastKeyRef.current = now;
            if (scsRef.current) return;
            if (e.key === "Enter") {
                const buf = scannerBufRef.current;
                if (buf.length >= MIN_LENGTH) {
                    const imei = extractScanImei(buf);
                    if (hasImei(imei)) {
                        e.preventDefault();
                        e.stopPropagation();
                        const ae = document.activeElement;
                        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) ae.blur();
                        processScannerImei(imei);
                    }
                }
                scannerBufRef.current = "";
                clearTimeout(scannerTimeoutRef.current);
                return;
            }
            if (e.key.length !== 1) return;
            if (gap > CHAR_GAP_MS) scannerBufRef.current = "";
            scannerBufRef.current += e.key;
            clearTimeout(scannerTimeoutRef.current);
            scannerTimeoutRef.current = setTimeout(() => { scannerBufRef.current = ""; }, IDLE_RESET_MS);
        };
        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            clearTimeout(scannerTimeoutRef.current);
        };
    }, []);
    // ────────────────────────────────────────
    useEffect(() => {
        let active = true;
        const hydrateLocalState = async () => {
            try {
                const [appState, storedSyncMeta] = await Promise.all([loadAppState(), loadSyncState()]);
                if (!active) return;
                if (appState?.inv && appState?.tx) {
                    skipNextAutoSync.current = true;
                    skipNextDirtyMark.current = true;
                    sInv(appState.inv.map(normalizeInv));
                    sTx(appState.tx.map(normalizeTx));
                    sShopCfg(normalizeShopProfile(appState.shop || appState.shopProfile || DEFAULT_SHOP_PROFILE));
                }
                if (storedSyncMeta) setSyncMeta(normalizeSyncMeta(storedSyncMeta));
            } catch { }
            finally {
                if (active) setStorageReady(true);
            }
        };
        void hydrateLocalState();
        return () => { active = false; };
    }, []);
    useEffect(() => {
        if (!storageReady) return;
        void saveAppState({ inv, tx, shop: normalizeShopProfile(shopCfg) });
    }, [storageReady, inv, tx, shopCfg]);
    useEffect(() => {
        if (!storageReady) return;
        void saveSyncState(syncMeta);
    }, [storageReady, syncMeta]);
    useEffect(() => {
        if (!canPersist) return;
        window.localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg));
    }, [canPersist, syncCfg]);
    useEffect(() => { syncBusyRef.current = syncBusy; }, [syncBusy]);
    useEffect(() => {
        if (!storageReady) return;
        if (skipNextDirtyMark.current) {
            skipNextDirtyMark.current = false;
            return;
        }
        updateSyncMeta(current => ({
            ...current,
            pendingSync: true,
            syncState: ol ? "saved-local" : "offline",
            lastLocalChangeAt: new Date().toISOString(),
            syncError: "",
        }));
    }, [storageReady, inv, tx, shopCfg, ol, updateSyncMeta]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onOn = () => setOl(true), onOff = () => setOl(false);
        window.addEventListener("online", onOn);
        window.addEventListener("offline", onOff);
        return () => {
            window.removeEventListener("online", onOn);
            window.removeEventListener("offline", onOff);
        };
    }, []);
    useEffect(() => () => {
        if (notifyTimeoutRef.current) clearTimeout(notifyTimeoutRef.current);
    }, []);
    useEffect(() => {
        if (!storageReady) return;
        updateSyncMeta(current => ({
            ...current,
            syncState: !ol ? "offline" : current.pendingSync ? "saved-local" : current.syncState === "error" ? "error" : "synced",
        }));
    }, [storageReady, ol, updateSyncMeta]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
        const refreshInstalled = () => setInstalled(Boolean(mq?.matches || window.navigator.standalone));
        const onBeforeInstall = (event) => {
            event.preventDefault();
            setInstallEvt(event);
        };
        const onInstalled = () => {
            setInstalled(true);
            setInstallEvt(null);
            notify("App installed. You can now use it like a mobile app.", "success");
        };
        refreshInstalled();
        if (mq?.addEventListener) mq.addEventListener("change", refreshInstalled);
        else if (mq?.addListener) mq.addListener(refreshInstalled);
        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                setSwReady(true);
                if (reg.waiting) setSwUpdate(true);
                reg.addEventListener("updatefound", () => {
                    const nw = reg.installing;
                    nw.addEventListener("statechange", () => {
                        if (nw.state === "installed" && navigator.serviceWorker.controller) setSwUpdate(true);
                    });
                });
            }).catch(() => { });
            navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
        }
        return () => {
            if (mq?.removeEventListener) mq.removeEventListener("change", refreshInstalled);
            else if (mq?.removeListener) mq.removeListener(refreshInstalled);
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const loadPocketBaseData = useCallback(async (silent = false) => {
        if (showAdminPanel || !shopSession?.pbAuth?.token) return;
        if (!silent) setSyncBusy(true);
        try {
            const bundle = await pocketbaseLoadShopBundle(shopSession.pbAuth);
            skipNextAutoSync.current = true;
            skipNextDirtyMark.current = true;
            sInv(Array.isArray(bundle.inv) ? bundle.inv.map(normalizeInv) : []);
            sTx(Array.isArray(bundle.tx) ? bundle.tx.map(normalizeTx) : []);
            const nextShopProfile = normalizeShopProfile(bundle.shop || DEFAULT_SHOP_PROFILE);
            if (!shopProfileDirtyRef.current) {
                lastSavedShopProfileSignatureRef.current = JSON.stringify(nextShopProfile);
                sShopCfg(nextShopProfile);
            }
            markSyncConnected({ lastPullAt: bundle.savedAt || new Date().toISOString(), lastStatus: `Realtime synced · ${bundle.savedAt ? fmtDateTime(bundle.savedAt) : 'Just now'}` });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? "synced" : "offline", lastRemoteSavedAt: bundle.savedAt || current.lastRemoteSavedAt, lastCheckedAt: new Date().toISOString(), syncError: "" }));
        } catch (e) {
            console.error('[PhoneDukaan] sync failed:', e);
            const msg = e?.message || "Unable to load data.";
            updateSyncMeta(current => ({ ...current, syncState: ol ? "error" : "offline", syncError: msg, lastCheckedAt: new Date().toISOString() }));
            if (!silent) notify(msg, "error");
        } finally {
            if (!silent) setSyncBusy(false);
        }
    }, [markSyncConnected, notify, ol, shopSession?.pbAuth, showAdminPanel, updateSyncMeta]);
    useEffect(() => { loadPocketBaseDataRef.current = loadPocketBaseData; }, [loadPocketBaseData]);
    const uploadPendingPhotosForItem = useCallback(async (itemId, photos) => {
        const nextPhotos = [];
        const failures = [];
        for (const photo of (photos || []).map(normalizePhotoRef)) {
            if (photo.fileId) {
                nextPhotos.push(photo);
                continue;
            }
            const blob = await loadPhotoBlob(photo.id);
            if (!blob) {
                nextPhotos.push(photo);
                continue;
            }
            try {
                const dataUrl = await blobToDataUrl(blob);
                const uploaded = await pocketbaseUploadPhoto(shopSession?.pbAuth, itemId, { ...photo, dataUrl });
                nextPhotos.push(normalizePhotoRef({ ...photo, ...uploaded }));
            } catch (error) {
                failures.push(error?.message || 'Photo upload failed.');
                nextPhotos.push(normalizePhotoRef({ ...photo, syncStatus: 'local-only' }));
            }
        }
        return { photos: nextPhotos, failures };
    }, [shopSession?.pbAuth]);
    useEffect(() => {
        if (showAdminPanel || !storageReady || !shopSession?.pbAuth?.token) return;
        void loadPocketBaseDataRef.current?.(true);
    }, [shopSession?.pbAuth?.token, shopSession?.pbAuth?.record?.shop, showAdminPanel, storageReady]);
    useEffect(() => {
        if (showAdminPanel || !storageReady || !shopSession?.pbAuth?.token || !shopSession?.pbAuth?.record?.shop || !syncCfg.autoSync) return;
        let cancelled = false;
        let cleanup = () => {};
        const auth = shopSession.pbAuth;
        const handleRealtimeRefresh = () => {
            if (cancelled || syncBusyRef.current) return;
            void loadPocketBaseDataRef.current?.(true);
        };
        (async () => {
            try {
                cleanup = await subscribeToShopData(auth, handleRealtimeRefresh);
            } catch (err) {
                if (!cancelled) console.warn('Realtime subscribe failed:', err?.message || err);
            }
        })();
        return () => {
            cancelled = true;
            try { cleanup(); } catch {}
            unsubscribeFromShopData();
        };
    }, [storageReady, syncCfg.autoSync, shopSession?.pbAuth?.token, shopSession?.pbAuth?.record?.shop, showAdminPanel]);
    const saveShopProfile = async () => {
        if (!shopSession?.pbAuth?.token || !shopSession?.pbAuth?.record?.shop) {
            notify('Login required before saving shop profile.', 'error');
            return;
        }
        const profile = normalizeShopProfile(shopCfg);
        const signature = JSON.stringify(profile);
        if (signature === lastSavedShopProfileSignatureRef.current) {
            notify('No shop profile changes to save.', 'warning');
            return;
        }
        setProfileSaveBusy(true);
        try {
            await pocketbaseUpdateShopProfile(shopSession.pbAuth, profile);
            lastSavedShopProfileSignatureRef.current = signature;
            setShopProfileDirty(false);
            shopProfileDirtyRef.current = false;
            markSyncConnected({ lastStatus: 'Shop profile saved' });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            notify('Shop profile saved.', 'success');
        } catch (err) {
            const msg = err?.message || 'Unable to save shop profile.';
            updateSyncMeta(current => ({ ...current, syncState: 'error', syncError: msg }));
            notify(msg, 'error');
        } finally {
            setProfileSaveBusy(false);
        }
    };

    const handleScan = (imei, imei2) => {
        setScs(false); const ex = findDeviceByImei(inv, imei);
        if (st === "sell") {
            const live = liveDeviceByImei(imei);
            if (live) { sFm(toForm(live, { amount: live.sellPrice, paidAmount: live.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" })); sPg("sell"); }
            else { notify("No matching handset found. Type IMEI manually.", "error"); sPg("sell"); sFm(toForm({}, { imei })); }
            return;
        }
        if (st === "add2" || st === "buy2") {
            uf("imei2", imei);
            if (ex) notify("This IMEI already exists in stock history.", "warning");
            return;
        }
        if (ex) { sEi(ex); sFm(toForm(ex)); notify("IMEI found — editing", "warning"); }
        else { uf("imei", imei); if (imei2) uf("imei2", imei2); }
        if (imei2) notify("Both IMEIs scanned", "success");
        sSf(false); sPg(st === "buy" || st === "buy2" ? "buy" : "add");
    };

    const processScannerImei = (imei) => {
        playScanBeep();
        const curPg = pgRef.current;
        const curFm = fmRef.current;
        const curInv = invRef.current;
        if (curPg === "sell") {
            const live = curInv.find(i => matchImei(i, imei) && i.status === "In Stock" && i.qty > 0);
            if (live) {
                sFm(toForm(live, { amount: live.sellPrice, paidAmount: live.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" }));
                notify("Device found — ready to sell", "success");
            } else {
                sFm(toForm({}, { imei }));
                notify("No matching device. IMEI filled.", "warning");
            }
            return;
        }
        if (curPg === "add" || curPg === "buy") {
            if (hasImei(cleanImei(curFm.imei)) && cleanImei(curFm.imei) !== imei) {
                uf("imei2", imei);
                const ex = findDeviceByImei(curInv, imei);
                notify(ex ? "IMEI 2 set — already exists in history" : "IMEI 2 scanned", ex ? "warning" : "success");
            } else {
                const ex = findDeviceByImei(curInv, imei);
                if (ex) { sEi(ex); sFm(toForm(ex)); notify("IMEI found — editing existing", "warning"); }
                else { uf("imei", imei); notify("IMEI scanned", "success"); }
            }
            return;
        }
        const ex = findDeviceByImei(curInv, imei);
        if (ex && ex.status === "In Stock") {
            sFm(toForm(ex, { amount: ex.sellPrice, paidAmount: ex.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" }));
            goPage("sell");
            notify("Device found in stock — sell form ready", "success");
        } else if (ex) {
            sEi(ex); sFm(toForm(ex));
            goPage("add");
            notify("IMEI found — editing existing record", "warning");
        } else {
            resetForm();
            setTimeout(() => uf("imei", imei), 0);
            goPage("add");
            notify("New IMEI scanned — add to stock", "success");
        }
    };

    const validateFormImeis = (skipId) => {
        const i1 = cleanImei(fm.imei), i2 = cleanImei(fm.imei2);
        if (!hasImei(i1)) return "IMEI 1 must be 15 digits.";
        if (i2 && !hasImei(i2)) return "IMEI 2 must be 15 digits or empty.";
        if (i2 && i1 === i2) return "IMEI 1 and IMEI 2 cannot be the same.";
        const dup1 = findDuplicateImei(inv, i1, skipId); if (dup1) return `IMEI 1 already exists on ${dup1.brand} ${dup1.model}.`;
        const dup2 = i2 && findDuplicateImei(inv, i2, skipId); if (dup2) return `IMEI 2 already exists on ${dup2.brand} ${dup2.model}.`;
        return "";
    };

    const saveInv = async () => {
        const imeiError = validateFormImeis(ei?.id);
        if (imeiError) { notify(imeiError, "error"); return; }
        if (!fm.model || !fm.brand) { notify("Brand and model are required!", "error"); return; }
        if (!(+fm.sellPrice > 0)) { notify("Sell price is required.", "error"); return; }
        const nextItem = normalizeInv({ ...ei, ...fm, imei: fm.imei, imei2: fm.imei2, buyPrice: +fm.buyPrice, sellPrice: +fm.sellPrice, qty: ei?.status === "Sold" ? 0 : 1, photos: fm.photos || [], addedDate: ei?.addedDate || new Date().toISOString().slice(0, 10) });
        try {
            const savedRecord = await pocketbaseUpsertInventory(shopSession?.pbAuth, nextItem);
            const savedItemBase = normalizeInv({ ...nextItem, id: savedRecord.id });
            const uploadedPhotos = await uploadPendingPhotosForItem(savedRecord.id, savedItemBase.photos || []);
            const savedItem = { ...savedItemBase, photos: uploadedPhotos.photos };
            if (ei && ei.id) {
                sInv(p => p.map(i => i.id === ei.id ? savedItem : i));
                notify(uploadedPhotos.failures.length ? "Stock updated. Some photos are still local." : "Stock updated");
                resetForm();
                sPg("inventory");
            } else {
                sInv(p => [savedItem, ...p]);
                const addTx = normalizeTx({ id: genId(), type: "Add", stockItemId: savedItem.id, imei: savedItem.imei, imei2: savedItem.imei2, brand: savedItem.brand, model: savedItem.model, color: savedItem.color, ram: savedItem.ram, storage: savedItem.storage, batteryHealth: savedItem.batteryHealth, condition: savedItem.condition, customerName: fm.supplier, phone: fm.phone, amount: +fm.buyPrice, paidAmount: 0, dueAmount: 0, paymentMode: "", date: savedItem.addedDate, dateTime: `${savedItem.addedDate}T12:00:00`, notes: fm.notes });
                const savedTx = await pocketbaseCreateTransaction(shopSession?.pbAuth, addTx);
                sTx(p => [normalizeTx({ ...addTx, id: savedTx.id, stockItemId: savedItem.id }), ...p]);
                notify(uploadedPhotos.failures.length ? "Added to stock. Some photos are still local." : "Added to stock");
                resetForm();
            }
            markSyncConnected({ lastStatus: uploadedPhotos.failures.length ? "Saved with pending photos" : "Saved" });
            updateSyncMeta(current => ({ ...current, pendingSync: uploadedPhotos.failures.length, syncState: uploadedPhotos.failures.length ? 'saved-local' : 'synced', syncError: uploadedPhotos.failures[0] || '' }));
        } catch (e) {
            notify(e?.message || "Unable to save stock.", "error");
            updateSyncMeta(current => ({ ...current, syncState: ol ? 'error' : 'offline', syncError: e?.message || 'Unable to save stock.' }));
        }
    };
    const delInv = async (id) => {
        try {
            const item = inv.find(i => i.id === id);
            if (!item) return;
            const updated = { ...item, status: "Deleted", deletedAt: new Date().toISOString() };
            await pocketbaseUpsertInventory(shopSession?.pbAuth, updated);
            sInv(p => p.map(i => i.id === id ? updated : i));
            markSyncConnected({ lastStatus: "Moved to Bin", lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            notify("Moved to Bin");
        } catch (e) {
            notify(e?.message || "Unable to remove item.", "error");
        }
    };
    const restoreInv = async (id) => {
        try {
            const item = inv.find(i => i.id === id);
            if (!item) return;
            const updated = { ...item, status: "In Stock", qty: 1, deletedAt: "" };
            await pocketbaseUpsertInventory(shopSession?.pbAuth, updated);
            sInv(p => p.map(i => i.id === id ? updated : i));
            markSyncConnected({ lastStatus: "Restored", lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            notify("Restored to Stock", "success");
        } catch (e) {
            notify(e?.message || "Unable to restore item.", "error");
        }
    };
    const permDelInv = async (id) => {
        try {
            await pocketbaseDeleteInventory(shopSession?.pbAuth, id);
            sInv(p => p.filter(i => i.id !== id));
            markSyncConnected({ lastStatus: "Permanently deleted", lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            notify("Permanently deleted");
        } catch (e) {
            notify(e?.message || "Unable to delete item.", "error");
        }
    };
    const doBuy = async () => {
        const imeiError = validateFormImeis();
        if (imeiError) { notify(imeiError, "error"); return; }
        if (!fm.model || !fm.supplier) { notify("Fill required!", "error"); return; }
        if (!(+fm.sellPrice > 0)) { notify("Sell price is required.", "error"); return; }
        const requiresSellerVerification = fm.condition === "Used" || fm.condition === "Refurbished";
        if (requiresSellerVerification) {
            if (!fm.sellerName.trim() || !fm.sellerPhone.trim() || !fm.sellerAadhaarNumber.trim() || !fm.purchaseDate) {
                notify("Seller name, phone, Aadhaar number, and purchase date are required for used/refurbished purchases.", "error");
                return;
            }
            if (String(fm.sellerAadhaarNumber).replace(/\D/g, "").length !== 12) {
                notify("Seller Aadhaar number must be 12 digits.", "error");
                return;
            }
            if (!fm.sellerIdPhotoData || !fm.sellerPhotoData || !fm.sellerSignatureData || !fm.sellerAgreementAccepted) {
                notify("Seller ID photo, seller photo, signature, and agreement confirmation are required for used/refurbished purchases.", "error");
                return;
            }
        }
        const item = normalizeInv({ id: genId(), imei: fm.imei, imei2: fm.imei2, brand: fm.brand, model: fm.model, color: fm.color, ram: fm.ram, storage: fm.storage, batteryHealth: fm.batteryHealth, condition: fm.condition, buyPrice: +fm.buyPrice, sellPrice: +fm.sellPrice, status: "In Stock", qty: 1, addedDate: new Date().toISOString().slice(0, 10), supplier: fm.supplier, photos: fm.photos || [], sellerName: fm.sellerName, sellerPhone: fm.sellerPhone, sellerAadhaarNumber: fm.sellerAadhaarNumber, purchaseDate: fm.purchaseDate, sellerAgreementAccepted: fm.sellerAgreementAccepted, sellerIdPhotoData: fm.sellerIdPhotoData, sellerPhotoData: fm.sellerPhotoData, sellerSignatureData: fm.sellerSignatureData });
        try {
            const savedRecord = await pocketbaseUpsertInventory(shopSession?.pbAuth, item);
            const savedItemBase = normalizeInv({ ...item, id: savedRecord.id });
            const uploadedPhotos = await uploadPendingPhotosForItem(savedRecord.id, savedItemBase.photos || []);
            const savedItem = { ...savedItemBase, photos: uploadedPhotos.photos };
            const txItem = normalizeTx({ id: genId(), type: "Buy", stockItemId: savedItem.id, imei: savedItem.imei, imei2: savedItem.imei2, brand: savedItem.brand, model: savedItem.model, color: savedItem.color, ram: savedItem.ram, storage: savedItem.storage, batteryHealth: savedItem.batteryHealth, condition: savedItem.condition, customerName: fm.supplier, phone: fm.phone, amount: +fm.buyPrice, paidAmount: +fm.buyPrice, dueAmount: 0, paymentMode: fm.paymentMode, date: new Date().toISOString().slice(0, 10), dateTime: new Date().toISOString(), notes: fm.notes, sellerName: fm.sellerName, sellerPhone: fm.sellerPhone, sellerAadhaarNumber: fm.sellerAadhaarNumber, purchaseDate: fm.purchaseDate });
            const savedTx = await pocketbaseCreateTransaction(shopSession?.pbAuth, txItem);
            sInv(p => [savedItem, ...p]);
            sTx(p => [normalizeTx({ ...txItem, id: savedTx.id, stockItemId: savedItem.id }), ...p]);
            markSyncConnected({ lastStatus: uploadedPhotos.failures.length ? 'Purchase saved with pending photos' : 'Purchase saved', lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: uploadedPhotos.failures.length, syncState: uploadedPhotos.failures.length ? 'saved-local' : (ol ? 'synced' : 'offline'), syncError: uploadedPhotos.failures[0] || '' }));
            sFm(ef); notify(uploadedPhotos.failures.length ? "Purchase recorded. Some photos are still local." : "Purchase recorded!");
        } catch (e) {
            notify(e?.message || "Unable to record purchase.", "error");
        }
    };
    const doSell = async () => {
        const item = liveDeviceByImei(fm.imei);
        if (!item || !fm.customerName) { notify("IMEI & Customer required!", "error"); return; }
        if (!(+fm.amount > 0)) { notify("Enter the selling amount.", "error"); return; }
        if (+fm.paidAmount > +fm.amount) { notify("Paid amount cannot be higher than sale amount.", "error"); return; }
        if (fm.billType === "GST" && !shopCfg.gstin.trim()) { notify("Add your GSTIN in Settings before creating a GST invoice.", "error"); return; }
        const amount = +fm.amount || 0, paidAmount = +fm.paidAmount || amount, dueAmount = Math.max(amount - paidAmount, 0), nextQty = Math.max(0, (item.qty || 1) - 1), now = new Date();
        const tax = calcInvoiceTotals(amount, fm.billType, fm.gstRate);
        const sale = normalizeTx({ id: genId(), type: "Sell", invoiceNo: makeInvoiceNo(tx, shopCfg.invoicePrefix), imei: item.imei, imei2: item.imei2, brand: item.brand, model: item.model, color: item.color, ram: item.ram, storage: item.storage, batteryHealth: item.batteryHealth, condition: item.condition, customerName: fm.customerName, phone: fm.phone, amount, paidAmount, dueAmount, costPrice: item.buyPrice, paymentMode: fm.paymentMode, date: now.toISOString().slice(0, 10), dateTime: now.toISOString(), notes: fm.notes, billType: fm.billType, gstRate: tax.gstRate, taxableAmount: tax.taxableAmount, gstAmount: tax.gstAmount, cgstAmount: tax.cgstAmount, sgstAmount: tax.sgstAmount, totalAmount: tax.totalAmount, shopSnapshot: shopCfg });
        try {
            const updatedItem = { ...item, status: nextQty > 0 ? "In Stock" : "Sold", qty: nextQty, customerName: fm.customerName, customerPhone: fm.phone, soldDate: sale.dateTime, lastInvoiceNo: sale.invoiceNo };
            await pocketbaseUpsertInventory(shopSession?.pbAuth, updatedItem);
            const savedTx = await pocketbaseCreateTransaction(shopSession?.pbAuth, { ...sale, stockItemId: item.id });
            sInv(p => p.map(i => i.id === item.id ? normalizeInv(updatedItem) : i));
            sTx(p => [normalizeTx({ ...sale, id: savedTx.id, stockItemId: item.id }), ...p]);
            markSyncConnected({ lastStatus: 'Sale saved', lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            sFm(ef); notify("Sale recorded!");
        } catch (e) {
            notify(e?.message || "Unable to record sale.", "error");
        }
    };

    const stats = useMemo(() => {
        const is = inv.filter(i => i.status === "In Stock"); const ts = is.reduce((s, i) => s + (i.qty || 0), 0); const sv = is.reduce((s, i) => s + i.sellPrice * (i.qty || 0), 0);
        const tb = tx.filter(t => t.type === "Buy").reduce((s, t) => s + t.amount, 0); const tsl = tx.filter(t => t.type === "Sell").reduce((s, t) => s + t.amount, 0);
        const pr = tx.filter(t => t.type === "Sell").reduce((s, t) => s + (((t.billType === "GST" ? t.taxableAmount : t.amount) || 0) - (t.costPrice || 0)), 0);
        const bc = {}; is.forEach(i => { bc[i.brand] = (bc[i.brand] || 0) + (i.qty || 0); }); const cc = { New: 0, Refurbished: 0, Used: 0 }; is.forEach(i => { cc[i.condition] = (cc[i.condition] || 0) + (i.qty || 0); });
        return { ts, sv, tb, tsl, pr, bc, cc };
    }, [inv, tx]);

    const fi = useMemo(() => inv.filter(i => {
        if (i.status === "Deleted") return false;
        const ms = !sq || [i.imei, i.imei2, i.brand, i.model, i.color, i.ram, i.storage, i.supplier].some(f => (f || "").toLowerCase().includes(sq.toLowerCase()));
        return ms && (fc === "All" || i.condition === fc) && (fs === "All" || i.status === fs);
    }), [inv, sq, fc, fs]);
    const recycleBinItems = useMemo(() => inv.filter(i => i.status === "Deleted"), [inv]);
    const latestSell = useMemo(() => tx.find(t => t.type === "Sell") || null, [tx]);
    const latestInvoices = useMemo(() => tx.filter(t => t.type === "Sell").slice(0, 3), [tx]);
    const invoiceRecords = useMemo(() => {
        const q = iq.trim().toLowerCase();
        return tx.filter(t => t.type === "Sell").filter(t => {
            if (!q) return true;
            return [t.invoiceNo, t.customerName, t.phone, t.brand, t.model, t.imei, t.imei2].some(v => String(v || "").toLowerCase().includes(q));
        });
    }, [iq, tx]);
    const salePreview = useMemo(() => calcInvoiceTotals(fm.amount || 0, fm.billType, fm.gstRate), [fm.amount, fm.billType, fm.gstRate]);
    const reportRange = useMemo(() => getReportRange(reportPreset, reportFrom, reportTo), [reportPreset, reportFrom, reportTo]);
    const reportEntries = useMemo(() => {
        const trackedAddIds = new Set(tx.filter(t => t.type === "Add" && t.stockItemId).map(t => t.stockItemId));
        const trackedAddImeis = new Set(tx.filter(t => t.type === "Add" || t.type === "Buy").flatMap(t => [t.imei, t.imei2]).filter(Boolean));
        const txEntries = tx.map(t => ({
            id: t.id,
            type: t.type,
            date: t.date || (t.dateTime ? t.dateTime.slice(0, 10) : isoDate()),
            dateTime: t.dateTime || `${t.date || isoDate()}T12:00:00`,
            party: t.customerName || (t.type === "Add" ? "Manual stock entry" : "-"),
            phone: t.phone || "",
            item: `${t.brand} ${t.model}`.trim(),
            extra: fmtSpecs(t.ram, t.storage),
            imei: t.imei,
            imei2: t.imei2,
            amount: t.type === "Sell" ? (t.totalAmount || t.amount || 0) : (t.amount || 0),
            dueAmount: t.dueAmount || 0,
            profit: t.type === "Sell" ? ((t.amount || 0) - (t.costPrice || 0)) : 0,
            invoiceNo: t.invoiceNo || "",
            billType: t.billType || "",
            paymentMode: t.paymentMode || "",
        }));
        const legacyAdds = inv.filter(item => !trackedAddIds.has(item.id) && !trackedAddImeis.has(item.imei) && (!item.imei2 || !trackedAddImeis.has(item.imei2))).map(item => ({
            id: `legacy-add-${item.id}`,
            type: "Add",
            date: item.addedDate || isoDate(),
            dateTime: `${item.addedDate || isoDate()}T12:00:00`,
            party: item.supplier || "Manual stock entry",
            phone: item.customerPhone || "",
            item: `${item.brand} ${item.model}`.trim(),
            extra: fmtSpecs(item.ram, item.storage),
            imei: item.imei,
            imei2: item.imei2,
            amount: item.buyPrice || 0,
            dueAmount: 0,
            profit: 0,
            invoiceNo: item.lastInvoiceNo || "",
            billType: "",
            paymentMode: "",
        }));
        return [...txEntries, ...legacyAdds].sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)));
    }, [inv, tx]);
    const reportBrands = useMemo(() => ["All Brands", ...Array.from(new Set(reportEntries.map(row => row.item.split(" ")[0]).filter(Boolean)))], [reportEntries]);
    const reportRows = useMemo(() => reportEntries.filter(row => {
        if (reportType !== "All" && row.type !== reportType) return false;
        const rowDate = row.date || (row.dateTime ? row.dateTime.slice(0, 10) : "");
        if (!(rowDate >= reportRange.from && rowDate <= reportRange.to)) return false;
        const effectiveBillFilter = reportType === "Buy" || reportType === "Add" ? "All Bills" : reportBillFilter;
        if (effectiveBillFilter !== "All Bills") {
            if (row.type !== "Sell") return false;
            if (effectiveBillFilter === "GST" && row.billType !== "GST") return false;
            if (effectiveBillFilter === "Regular" && row.billType === "GST") return false;
        }
        if (reportPaymentFilter !== "All Payments" && row.paymentMode !== reportPaymentFilter) return false;
        if (reportBrandFilter !== "All Brands" && !String(row.item || "").toLowerCase().startsWith(reportBrandFilter.toLowerCase())) return false;
        const effectiveDueFilter = reportView === "Supplier Summary" ? "All Status" : reportDueFilter;
        if (effectiveDueFilter !== "All Status") {
            if (row.type !== "Sell") return false;
            if (effectiveDueFilter === "Due Only" && !(row.dueAmount > 0)) return false;
            if (effectiveDueFilter === "Paid Only" && row.dueAmount > 0) return false;
        }
        const partyQuery = reportPartyQuery.trim().toLowerCase();
        const itemQuery = reportItemQuery.trim().toLowerCase();
        if (partyQuery && ![row.party, row.phone].some(v => String(v || "").toLowerCase().includes(partyQuery))) return false;
        if (itemQuery && ![row.item, row.invoiceNo, row.imei, row.imei2, row.extra].some(v => String(v || "").toLowerCase().includes(itemQuery))) return false;
        return true;
    }), [reportEntries, reportRange.from, reportRange.to, reportType, reportView, reportBillFilter, reportPaymentFilter, reportBrandFilter, reportDueFilter, reportPartyQuery, reportItemQuery]);
    const reportSummary = useMemo(() => {
        const buyAddRows = reportRows.filter(row => row.type === "Buy" || row.type === "Add");
        const sellRows = reportRows.filter(row => row.type === "Sell");
        return {
            records: reportRows.length,
            buyAddTotal: buyAddRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            sellTotal: sellRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            dueTotal: sellRows.reduce((sum, row) => sum + (row.dueAmount || 0), 0),
            profit: sellRows.reduce((sum, row) => sum + (row.profit || 0), 0),
        };
    }, [reportRows]);
    const customerLedgerRows = useMemo(() => {
        const groups = new Map();
        reportRows.filter(row => row.type === "Sell").forEach((row) => {
            const key = (row.phone || row.party || `walkin-${row.id}`).toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    type: "Sell",
                    item: row.party || row.phone || "Walk-in customer",
                    label: row.phone || row.party || "Walk-in customer",
                    party: row.party || "Walk-in customer",
                    phone: row.phone || "",
                    records: 0,
                    amount: 0,
                    dueAmount: 0,
                    profit: 0,
                    lastDateTime: row.dateTime,
                });
            }
            const current = groups.get(key);
            current.records += 1;
            current.amount += row.amount || 0;
            current.dueAmount += row.dueAmount || 0;
            current.profit += row.profit || 0;
            if (String(row.dateTime).localeCompare(String(current.lastDateTime)) > 0) current.lastDateTime = row.dateTime;
        });
        return Array.from(groups.values()).sort((a, b) => String(b.lastDateTime).localeCompare(String(a.lastDateTime)));
    }, [reportRows]);
    const supplierSummaryRows = useMemo(() => {
        const groups = new Map();
        reportRows.filter(row => row.type === "Buy").forEach((row) => {
            const key = (row.party || "Unknown supplier").toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    type: "Buy",
                    item: row.party || "Unknown supplier",
                    label: row.party || "Unknown supplier",
                    party: row.party || "Unknown supplier",
                    phone: row.phone || "",
                    records: 0,
                    amount: 0,
                    dueAmount: 0,
                    profit: 0,
                    lastDateTime: row.dateTime,
                });
            }
            const current = groups.get(key);
            current.records += 1;
            current.amount += row.amount || 0;
            if (String(row.dateTime).localeCompare(String(current.lastDateTime)) > 0) current.lastDateTime = row.dateTime;
        });
        return Array.from(groups.values()).sort((a, b) => String(b.lastDateTime).localeCompare(String(a.lastDateTime)));
    }, [reportRows]);
    const activeReportRows = reportView === "Customer Ledger" ? customerLedgerRows : reportView === "Supplier Summary" ? supplierSummaryRows : reportRows;
    const activeReportSummary = reportView === "Transactions" ? reportSummary : {
        records: activeReportRows.length,
        buyAddTotal: reportView === "Supplier Summary" ? activeReportRows.reduce((s, row) => s + (row.amount || 0), 0) : 0,
        sellTotal: reportView === "Customer Ledger" ? activeReportRows.reduce((s, row) => s + (row.amount || 0), 0) : 0,
        dueTotal: reportView === "Customer Ledger" ? activeReportRows.reduce((s, row) => s + (row.dueAmount || 0), 0) : 0,
        profit: reportView === "Customer Ledger" ? activeReportRows.reduce((s, row) => s + (row.profit || 0), 0) : 0,
    };

    const bcd = Object.entries(stats.bc).map(([name, value]) => ({ name, value }));
    const ccd = Object.entries(stats.cc).map(([name, value]) => ({ name, value }));
    const CL = ["#00d4ff", "#8b5cf6", "#f472b6", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa"];
    const r7 = useMemo(() => {
        const d = []; for (let i = 6; i >= 0; i--) {
            const dt = new Date(); dt.setDate(dt.getDate() - i); const ds = dt.toISOString().slice(0, 10);
            d.push({ day: dt.toLocaleDateString("en-IN", { weekday: "short" }), Buy: tx.filter(t => t.type === "Buy" && t.date === ds).reduce((s, t) => s + t.amount, 0), Sell: tx.filter(t => t.type === "Sell" && t.date === ds).reduce((s, t) => s + t.amount, 0) });
        } return d;
    }, [tx]);
    const updateSaleMeta = (saleId, patch) => {
        sTx(current => current.map(item => item.id === saleId ? normalizeTx({ ...item, ...patch }) : item));
    };
    const dlBlob = (blob, name) => {
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const downloadInvoice = async (sale) => {
        if (!sale) return;
        const { blob, fileName } = await makeInvoiceFile(sale, shopCfg);
        dlBlob(blob, fileName);
        notify("Invoice PDF downloaded");
    };
    const shareInvoice = async (sale) => {
        if (!sale) return;
        const shop = getSaleShop(sale, shopCfg);
        const { blob, file, fileName } = await makeInvoiceFile(sale, shop);
        const text = makeInvoiceText(sale, shop);
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `${shop.shopName} Invoice`, text });
                updateSaleMeta(sale.id, { whatsAppPdfAt: new Date().toISOString() });
                notify("Share sheet opened — choose WhatsApp", "success");
            } else {
                dlBlob(blob, fileName); window.open(makeWhatsAppUrl(sale.phone, text), "_blank");
                notify("PDF downloaded and WhatsApp text opened", "warning");
            }
        } catch {
            notify("Sharing cancelled", "warning");
        }
    };
    const whatsappMessage = (sale) => {
        if (!sale) return;
        if (!sale.phone) { notify("Add customer phone number before opening WhatsApp message.", "error"); return; }
        window.open(makeWhatsAppUrl(sale.phone, makeWhatsAppIntroText(sale, getSaleShop(sale, shopCfg))), "_blank");
        updateSaleMeta(sale.id, { whatsAppMessageAt: new Date().toISOString() });
        notify("WhatsApp message opened. Send it so the customer appears in recent chats, then share the PDF.", "success");
    };
    const downloadReport = async () => {
        const { blob, fileName } = await makeReportFile({ rows: activeReportRows, summary: activeReportSummary, reportType: reportView === "Transactions" ? reportType : reportView, rangeLabel: reportRange.label, shop: shopCfg });
        dlBlob(blob, fileName);
        notify("Report PDF downloaded");
    };
    const openBlobInTab = (blob, autoPrint = false, targetWindow = null) => {
        const url = URL.createObjectURL(blob);
        const preview = targetWindow || window.open(url, "_blank");
        if (!preview) {
            notify("Popup blocked. Allow popups to preview or print the PDF.", "warning");
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            return;
        }
        if (targetWindow) preview.location.href = url;
        if (autoPrint) {
            const triggerPrint = () => {
                try { preview.print(); } catch { }
            };
            preview.addEventListener?.("load", triggerPrint, { once: true });
            setTimeout(triggerPrint, 1200);
        }
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    const previewReportPdf = async (autoPrint = false) => {
        const targetWindow = window.open("", "_blank");
        const { blob } = await makeReportFile({ rows: activeReportRows, summary: activeReportSummary, reportType: reportView === "Transactions" ? reportType : reportView, rangeLabel: reportRange.label, shop: shopCfg });
        openBlobInTab(blob, autoPrint, targetWindow);
        notify(autoPrint ? "Report PDF opened for printing." : "Report PDF preview opened.", "success");
    };
    const printSticker = async (item) => {
        if (!item) return;
        const targetWindow = window.open("", "_blank");
        const { blob } = await makeStickerFile(item, shopCfg);
        openBlobInTab(blob, true, targetWindow);
        notify("Sticker PDF opened for printing.", "success");
    };

    const nav = [{ id: "dashboard", ic: Home, l: "Dashboard" }, { id: "add", ic: Plus, l: "Add" }, { id: "buy", ic: ArrowDownCircle, l: "Buy" }, { id: "sell", ic: ArrowUpCircle, l: "Sell" }, { id: "transactions", ic: FileText, l: "Invoices" }, { id: "reports", ic: BarChart3, l: "Reports" }, { id: "inventory", ic: Package, l: "Stock" }, { id: "recycle", ic: Trash, l: "Bin" }, { id: "settings", ic: Settings, l: "Settings" }];
    const adminTabs = [{ id: "overview", label: "Overview" }, { id: "users", label: "Users" }, { id: "trials", label: "Trials" }, { id: "shops", label: "Shops" }, { id: "settings", label: "Settings" }];
    const getTrialMeta = (trialEndsAt) => {
        const expiresAt = Date.parse(String(trialEndsAt || ""));
        if (!Number.isFinite(expiresAt)) return { label: "No trial date", tone: "var(--warn)" };
        const daysLeft = Math.ceil((expiresAt - Date.now()) / 86400000);
        if (daysLeft < 0) return { label: `Expired ${Math.abs(daysLeft)}d ago`, tone: "var(--err)" };
        if (daysLeft === 0) return { label: "Expires today", tone: "var(--warn)" };
        if (daysLeft <= 7) return { label: `${daysLeft} days left`, tone: "var(--warn)" };
        return { label: `${daysLeft} days left`, tone: "var(--ok)" };
    };

    const condBadge = (c) => c === "New" ? "bn" : c === "Refurbished" ? "br" : "bu";
    const statBadge = (s) => s === "In Stock" ? "bi" : s === "Sold" ? "bso" : "bre";

    // ── LOGIN GATES ──────────────────────────────────────────────────────
    if (!authReady) return (
        <><style>{S}</style><div className="abg" style={{ minHeight: "100vh" }} /></>
    );
    if (!shopSession || showAdminPanel) return (
        <><style>{S}</style>
            <div className="abg lic-gate">
                <div className="lic-box gl gc">
                    <div className="lic-logo">
                        <img src="/pd-icon.png" alt="PhoneDukaan" style={{ width: 52, height: 52, borderRadius: 12 }} />
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.2 }}>
                                <span style={{ color: "#fff" }}>Phone</span>
                                <span style={{ background: "linear-gradient(90deg,#00D4FF,#8B5CF6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Dukaan</span>
                            </div>
                            <div style={{ color: "var(--t3)", fontSize: 11, marginTop: 3 }}>{showAdminPanel ? "Admin Panel" : authMode === "sign-up" ? "Create Account" : authMode === "reset" ? "Reset Password" : "Shop Login"}</div>
                        </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <Lock size={24} style={{ color: "var(--a)", marginBottom: 10 }} />
                        <h2 style={{ color: "var(--t1)", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{showAdminPanel ? "PhoneDukaan Admin" : authMode === "sign-up" ? "Create your account" : authMode === "reset" ? "Reset your password" : "Login to PhoneDukaan"}</h2>
                        <p style={{ color: "var(--t3)", fontSize: 13, lineHeight: 1.7 }}>
                            {showAdminPanel
                                ? "Create shop logins once. Shop users only need their ID and password."
                                : authMode === "sign-up"
                                    ? `New accounts get ${trialDays} days of access. Use your mobile number to sign in later.`
                                    : authMode === "reset"
                                        ? "Enter the email used for signup and we will send a PocketBase reset link."
                                        : "Login with your registered mobile number and password."}
                        </p>
                    </div>
                    {!showAdminPanel ? <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, width: "100%" }}>
                            <button className={authMode === "sign-in" ? "bp" : "bg"} onClick={() => switchAuthMode("sign-in")} style={{ justifyContent: "center" }}>Sign in</button>
                            <button className={authMode === "sign-up" ? "bp" : "bg"} onClick={() => switchAuthMode("sign-up")} style={{ justifyContent: "center" }}>Sign up</button>
                            <button className={authMode === "reset" ? "bp" : "bg"} onClick={() => switchAuthMode("reset")} style={{ justifyContent: "center" }}>Reset</button>
                        </div>
                        {authMode === "sign-in" ? <>
                            <input className="gi lic-input" placeholder="Mobile Number" value={loginId} autoComplete="tel" inputMode="numeric" spellCheck={false} onChange={e => { setLoginId(cleanMobileNumber(e.target.value)); setLoginError(""); }} />
                            <input className="gi lic-input" type="password" placeholder="Password" value={loginPassword} autoComplete="current-password" onChange={e => { setLoginPassword(e.target.value); setLoginError(""); }} onKeyDown={e => e.key === "Enter" && !loginBusy && handleShopLogin()} />
                            {loginError && <div style={{ color: "var(--err)", fontSize: 13, textAlign: "center", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: "var(--rs)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {loginError}</div>}
                            <button className="bp" onClick={handleShopLogin} disabled={loginBusy} style={{ justifyContent: "center", opacity: loginBusy ? 0.7 : 1 }}>
                                {loginBusy ? "Signing in…" : "Login"}
                            </button>
                        </> : authMode === "sign-up" ? <>
                            <input className="gi lic-input" placeholder="Shop Name" value={signupForm.shopName} autoComplete="organization" onChange={e => { setSignupForm(f => ({ ...f, shopName: e.target.value })); setSignupError(""); }} />
                            <input className="gi lic-input" placeholder="Mobile Number" value={signupForm.mobileNumber} autoComplete="tel" inputMode="numeric" onChange={e => { const mobileNumber = cleanMobileNumber(e.target.value); setSignupForm(f => ({ ...f, mobileNumber })); setSignupError(""); }} />
                            <input className="gi lic-input" type="email" placeholder="Email" value={signupForm.email} autoComplete="email" onChange={e => { setSignupForm(f => ({ ...f, email: e.target.value })); setSignupError(""); }} />
                            <input className="gi lic-input" type="password" placeholder="Password" value={signupForm.password} autoComplete="new-password" onChange={e => { setSignupForm(f => ({ ...f, password: e.target.value })); setSignupError(""); }} />
                            <input className="gi lic-input" type="password" placeholder="Confirm Password" value={signupForm.confirmPassword} autoComplete="new-password" onChange={e => { setSignupForm(f => ({ ...f, confirmPassword: e.target.value })); setSignupError(""); }} onKeyDown={e => e.key === "Enter" && !signupBusy && handleShopSignup()} />
                            {signupError && <div style={{ color: "var(--err)", fontSize: 13, textAlign: "center", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: "var(--rs)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {signupError}</div>}
                            <button className="bp" onClick={handleShopSignup} disabled={signupBusy} style={{ justifyContent: "center", opacity: signupBusy ? 0.7 : 1 }}>
                                {signupBusy ? "Creating account…" : "Create account"}
                            </button>
                        </> : <>
                            <input className="gi lic-input" type="email" placeholder="Registered Email" value={resetEmail} autoComplete="email" onChange={e => { setResetEmail(e.target.value); setResetError(""); }} onKeyDown={e => e.key === "Enter" && !resetBusy && handlePasswordReset()} />
                            {resetError && <div style={{ color: "var(--err)", fontSize: 13, textAlign: "center", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: "var(--rs)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {resetError}</div>}
                            <button className="bp" onClick={handlePasswordReset} disabled={resetBusy} style={{ justifyContent: "center", opacity: resetBusy ? 0.7 : 1 }}>
                                {resetBusy ? "Sending reset email…" : "Send reset email"}
                            </button>
                        </>}
                    </> : !adminToken ? <>
                        <input className="gi lic-input" placeholder="Admin ID" value={adminLoginId} autoComplete="off" onChange={e => { setAdminLoginId(e.target.value); setAdminError(""); }} />
                        <input className="gi lic-input" type="password" placeholder="Admin Password" value={adminPassword} autoComplete="current-password" onChange={e => { setAdminPassword(e.target.value); setAdminError(""); }} onKeyDown={e => e.key === "Enter" && !adminBusy && handleAdminLogin()} />
                        {adminError && <div style={{ color: "var(--err)", fontSize: 13, textAlign: "center", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: "var(--rs)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {adminError}</div>}
                        <button className="bp" onClick={handleAdminLogin} disabled={adminBusy} style={{ justifyContent: "center", opacity: adminBusy ? 0.7 : 1 }}>
                            {adminBusy ? "Checking…" : "Login as Admin"}
                        </button>
                        <button className="bg" onClick={closeAdminPanel} style={{ justifyContent: "center" }}>Back to Shop Login</button>
                    </> : <>
                        <div style={{ display: "grid", gap: 12, width: "100%", maxHeight: "75vh", overflowY: "auto", paddingRight: 4 }}>
                            <div className="gc" style={{ padding: 12, display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ color: "var(--t1)", fontWeight: 700, fontSize: 16 }}>Admin Dashboard</div>
                                        <div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>Manage users, trials, shops, and default signup settings.</div>
                                    </div>
                                    <button className="bg" onClick={handleAdminLogout} style={{ justifyContent: "center" }}>Close Admin</button>
                                </div>
                                {adminError && <div style={{ color: "var(--err)", fontSize: 13, textAlign: "center", background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: "var(--rs)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertCircle size={14} /> {adminError}</div>}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
                                    {adminTabs.map(tab => <button key={tab.id} className={adminTab === tab.id ? "bp" : "bg"} onClick={() => setAdminTab(tab.id)} style={{ justifyContent: "center", padding: "10px 8px", fontSize: 12 }}>{tab.label}</button>)}
                                </div>
                            </div>

                            {adminTab === "overview" && <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                                    {[{ label: "Total Users", value: adminStats.totalUsers }, { label: "Active", value: adminStats.activeUsers }, { label: "Expired", value: adminStats.expiredUsers }, { label: "Ending Soon", value: adminStats.endingSoonUsers }].map(card => <div key={card.label} className="gc" style={{ padding: 14 }}><div style={{ color: "var(--t3)", fontSize: 12 }}>{card.label}</div><div style={{ color: "var(--t1)", fontSize: 24, fontWeight: 800, marginTop: 6 }}>{card.value}</div></div>)}
                                </div>
                                <div className="gc" style={{ padding: 14, display: "grid", gap: 10 }}>
                                    <div style={{ color: "var(--t1)", fontWeight: 700 }}>Create Shop Login</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                                        <input className="gi" value={adminForm.shopName} onChange={e => setAdminForm(f => ({ ...f, shopName: e.target.value }))} placeholder="Shop Name" />
                                        <input className="gi" value={adminForm.shopId} onChange={e => setAdminForm(f => ({ ...f, shopId: e.target.value }))} placeholder="Shop ID" />
                                        <input className="gi" value={adminForm.loginId} onChange={e => setAdminForm(f => ({ ...f, loginId: cleanMobileNumber(e.target.value) }))} placeholder="Mobile Number" />
                                        <input className="gi" type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" />
                                    </div>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                        <button className="bp" onClick={saveAdminShop} disabled={adminBusy} style={{ justifyContent: "center" }}>{adminBusy ? "Saving…" : "Save Shop Login"}</button>
                                        <button className="bg" onClick={() => setAdminForm({ shopId: "", shopName: "", loginId: "", password: "", syncKey: "" })} style={{ justifyContent: "center" }}>Clear</button>
                                    </div>
                                </div>
                                <div className="gc" style={{ padding: 14, display: "grid", gap: 8 }}>
                                    <div style={{ color: "var(--t1)", fontWeight: 700 }}>Recently created shops</div>
                                    {adminShops.slice(0, 5).map(shop => <div key={shop.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}><div><div style={{ color: "var(--t1)", fontWeight: 600 }}>{shop.shopName}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{shop.loginId || "No mobile"} · {shop.email || "No email"}</div></div><div style={{ color: getTrialMeta(shop.trialEndsAt).tone, fontSize: 12, fontWeight: 700 }}>{getTrialMeta(shop.trialEndsAt).label}</div></div>)}
                                </div>
                            </div>}

                            {adminTab === "users" && <>
                                <div className="gc" style={{ padding: 12, display: "grid", gap: 10 }}>
                                    <input className="gi" value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search shop, mobile, email" />
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                                        {[{ id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "endingSoon", label: "Soon" }, { id: "expired", label: "Expired" }].map(filter => <button key={filter.id} className={adminStatusFilter === filter.id ? "bp" : "bg"} onClick={() => setAdminStatusFilter(filter.id)} style={{ justifyContent: "center", padding: "10px 8px", fontSize: 12 }}>{filter.label}</button>)}
                                    </div>
                                </div>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {adminUsersFiltered.map(user => <div key={user.id} className="gc" style={{ padding: 14, display: "grid", gap: 10 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                                            <div>
                                                <div style={{ color: "var(--t1)", fontWeight: 700 }}>{user.shopName || user.shopId || user.mobileNumber}</div>
                                                <div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{user.shopId || "No shop ID"} · {user.createdAt ? fmtDate(user.createdAt) : "New user"}</div>
                                            </div>
                                            <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.05)", color: getTrialMeta(user.trialEndsAt).tone, fontSize: 12, fontWeight: 700 }}>{getTrialMeta(user.trialEndsAt).label}</div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                                            <input className="gi" value={user.mobileDraft} onChange={e => setAdminUsers(list => list.map(entry => entry.id === user.id ? { ...entry, mobileDraft: cleanMobileNumber(e.target.value) } : entry))} placeholder="Mobile" />
                                            <input className="gi" type="email" value={user.emailDraft} onChange={e => setAdminUsers(list => list.map(entry => entry.id === user.id ? { ...entry, emailDraft: e.target.value } : entry))} placeholder="Email" />
                                            <input className="gi" type="date" value={user.trialDraft} onChange={e => setAdminUsers(list => list.map(entry => entry.id === user.id ? { ...entry, trialDraft: e.target.value } : entry))} />
                                        </div>
                                        <label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={user.active} onChange={e => setAdminUsers(list => list.map(entry => entry.id === user.id ? { ...entry, active: e.target.checked } : entry))} /><span>{user.active ? "User is active" : "User is inactive"}</span></label>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {[7, 15, 30].map(days => <button key={days} className="bg" onClick={() => void extendAdminUserTrial(user.id, days)} disabled={adminActionId === user.id} style={{ justifyContent: "center" }}>+{days}d</button>)}
                                            <button className="bp" onClick={() => void saveAdminUser(user.id)} disabled={adminActionId === user.id} style={{ justifyContent: "center" }}>{adminActionId === user.id ? "Saving…" : "Save user"}</button>
                                            <button className="bg" onClick={() => void sendAdminPasswordReset(user)} disabled={adminActionId === user.id} style={{ justifyContent: "center" }}>Reset email</button>
                                            <button className="bg" onClick={() => void toggleAdminUserActive(user.id, !user.active)} disabled={adminActionId === user.id} style={{ justifyContent: "center" }}>{user.active ? "Deactivate" : "Activate"}</button>
                                        </div>
                                    </div>)}
                                    {!adminUsersFiltered.length && <div className="gc" style={{ padding: 14, color: "var(--t3)", textAlign: "center" }}>No users match this filter.</div>}
                                </div>
                            </>}

                            {adminTab === "trials" && <div style={{ display: "grid", gap: 10 }}>
                                {adminTrialUsers.map(user => <div key={user.id} className="gc" style={{ padding: 14, display: "grid", gap: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                        <div><div style={{ color: "var(--t1)", fontWeight: 700 }}>{user.shopName || user.mobileNumber}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{user.mobileNumber} · {user.email}</div></div>
                                        <div style={{ color: getTrialMeta(user.trialEndsAt).tone, fontWeight: 700 }}>{getTrialMeta(user.trialEndsAt).label}</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {[7, 15, 30].map(days => <button key={days} className="bp" onClick={() => void extendAdminUserTrial(user.id, days)} disabled={adminActionId === user.id} style={{ justifyContent: "center" }}>Extend {days}d</button>)}
                                        <button className="bg" onClick={() => { setAdminTab("users"); setAdminSearch(user.mobileNumber || user.email || user.shopName || ""); }} style={{ justifyContent: "center" }}>Open user</button>
                                    </div>
                                </div>)}
                                {!adminTrialUsers.length && <div className="gc" style={{ padding: 14, color: "var(--t3)", textAlign: "center" }}>No expired or ending-soon users.</div>}
                            </div>}

                            {adminTab === "shops" && <div style={{ display: "grid", gap: 10 }}>
                                {adminShops.map(shop => <div key={shop.id} className="gc" style={{ padding: 14, display: "grid", gap: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                                        <div><div style={{ color: "var(--t1)", fontWeight: 700 }}>{shop.shopName}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{shop.shopId} · {shop.loginId || "No mobile"}</div></div>
                                        <div style={{ color: getTrialMeta(shop.trialEndsAt).tone, fontWeight: 700, fontSize: 12 }}>{getTrialMeta(shop.trialEndsAt).label}</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                                        <input className="gi" value={shop.shopNameDraft} onChange={e => setAdminShops(list => list.map(entry => entry.id === shop.id ? { ...entry, shopNameDraft: e.target.value } : entry))} placeholder="Shop name" />
                                        <input className="gi" value={shop.phoneDraft} onChange={e => setAdminShops(list => list.map(entry => entry.id === shop.id ? { ...entry, phoneDraft: e.target.value } : entry))} placeholder="Phone" />
                                        <input className="gi" type="email" value={shop.emailDraft} onChange={e => setAdminShops(list => list.map(entry => entry.id === shop.id ? { ...entry, emailDraft: e.target.value } : entry))} placeholder="Email" />
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button className="bp" onClick={() => void saveAdminShopDetails(shop.id)} disabled={adminActionId === shop.id} style={{ justifyContent: "center" }}>{adminActionId === shop.id ? "Saving…" : "Save shop"}</button>
                                        {shop.userId ? <button className="bg" onClick={() => { setAdminTab("users"); setAdminSearch(shop.loginId || shop.email || shop.shopName || ""); }} style={{ justifyContent: "center" }}>Open user</button> : null}
                                    </div>
                                </div>)}
                            </div>}

                            {adminTab === "settings" && <div className="gc" style={{ padding: 14, display: "grid", gap: 12 }}>
                                <div>
                                    <div style={{ color: "var(--t1)", fontWeight: 700 }}>Default trial days</div>
                                    <div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>Used for new user signups. Existing users keep their own trial end date until you change them.</div>
                                </div>
                                <input className="gi" type="number" min="1" value={adminSettings.trialDays} onChange={e => setAdminSettings(current => ({ ...current, trialDays: e.target.value }))} placeholder="7" />
                                <button className="bp" onClick={() => void saveAdminSettings()} disabled={adminActionId === "settings"} style={{ justifyContent: "center" }}>{adminActionId === "settings" ? "Saving…" : "Save settings"}</button>
                            </div>}
                        </div>
                    </>}
                </div>
            </div>
        </>
    );
    // ──────────────────────────────────────────────────────────────────────

    return (
        <><style>{S}</style>
            <div className="abg" style={{ display: "flex", minHeight: "100vh" }}>
                {/* Sidebar */}
                <div className="ds gl" style={{ width: 256, position: "fixed", top: 0, left: 0, bottom: 0, padding: "24px 16px", display: "flex", flexDirection: "column", zIndex: 50, borderRadius: 0, borderLeft: "none", borderTop: "none", borderBottom: "none" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, marginBottom: 32, padding: "0 8px" }}>
                        <img src={APP_WORDMARK_SRC} alt={APP_NAME} style={{ height: 34, width: "auto", maxWidth: 184, display: "block" }} onError={event => { if (event.currentTarget.src.endsWith(APP_WORDMARK_FALLBACK)) return; event.currentTarget.src = APP_WORDMARK_FALLBACK; }} />
                        <div style={{ color: "var(--t3)", fontSize: 11, marginLeft: 4, letterSpacing: ".04em", textTransform: "uppercase" }}>Mobile Shop Manager</div>
                    </div>
                    <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        {nav.map(n => <div key={n.id} className={`ni ${pg === n.id ? "ac" : ""}`} onClick={() => goPage(n.id)}><n.ic size={18} /> {n.l}{n.id === "recycle" && recycleBinItems.length > 0 && <span style={{ marginLeft: "auto", background: "var(--err)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 99, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{recycleBinItems.length}</span>}</div>)}
                    </nav>
                    <div style={{ padding: "16px 8px", borderTop: "1px solid var(--gbo)", display: "grid", gap: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}>{ol ? <Wifi size={14} color="var(--ok)" /> : <WifiOff size={14} color="var(--warn)" />}<span style={{ color: "var(--t3)", fontSize: 12 }}>{shopSession?.shopName || shopSession?.shopId || "No shop"} · {syncStateLabel}</span></div><button className="bg" onClick={logoutShop} style={{ justifyContent: "center", width: "100%" }}><LogOut size={15} /> Logout</button></div>
                </div>

                {/* Mobile Top Header */}
                <div className="mth gl" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 49, display: "none", alignItems: "center", justifyContent: "space-between", padding: "calc(10px + env(safe-area-inset-top,0px)) 16px 10px", borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none", borderBottom: "1px solid var(--gbo)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img src={APP_WORDMARK_SRC} alt={APP_NAME} style={{ height: 28, width: "auto", maxWidth: 156, display: "block" }} onError={event => { if (event.currentTarget.src.endsWith(APP_WORDMARK_FALLBACK)) return; event.currentTarget.src = APP_WORDMARK_FALLBACK; }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{ol ? <Wifi size={14} color="var(--ok)" /> : <WifiOff size={14} color="var(--warn)" />}<span style={{ color: "var(--t3)", fontSize: 11 }}>{ol ? "Online" : "Offline"}</span></div>
                </div>

                {/* Mobile Nav */}
                <div className="mfd" aria-hidden="true" />
                <div className="mn gl sh" style={{ position: "fixed", bottom: "calc(10px + env(safe-area-inset-bottom,0px))", left: 8, right: 8, zIndex: 50, display: "none", justifyContent: "flex-start", gap: 2, padding: "8px 6px", borderRadius: 20, overflowX: "auto", boxShadow: "0 10px 30px rgba(0,0,0,.28)" }}>
                    {nav.map(n => <div key={n.id} onClick={() => goPage(n.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 12px", minWidth: 64, cursor: "pointer", color: pg === n.id ? "var(--a)" : "var(--t3)", transition: "color .2s" }}><n.ic size={20} /><span style={{ fontSize: 10, fontWeight: 500 }}>{n.l}</span></div>)}
                </div>

                {/* Main */}
                <div className="mc" style={{ marginLeft: 256, flex: 1, padding: 24, position: "relative" }}>

                    {swUpdate && <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: "linear-gradient(90deg,#00D4FF,#8B5CF6)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", fontSize: 13, fontWeight: 600, gap: 12 }}><span style={{ display: "flex", alignItems: "center", gap: 8 }}><RefreshCw size={14} /> Update available — refresh to get the latest version</span><button onClick={() => navigator.serviceWorker.ready.then(r => r.waiting?.postMessage({ type: "SKIP_WAITING" }))} style={{ background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 12, padding: "4px 14px", cursor: "pointer" }}>Refresh</button></div>}

                    {nt && <div className="fi" style={{ position: "fixed", top: 24, right: 24, zIndex: 200, padding: "14px 20px", borderRadius: "var(--rs)", background: nt.t === "success" ? "rgba(52,211,153,.2)" : nt.t === "error" ? "rgba(248,113,113,.2)" : "rgba(251,191,36,.2)", border: `1px solid ${nt.t === "success" ? "rgba(52,211,153,.4)" : nt.t === "error" ? "rgba(248,113,113,.4)" : "rgba(251,191,36,.4)"}`, color: "var(--t1)", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(20px)" }}>{nt.t === "success" ? <CheckCircle size={16} color="var(--ok)" /> : <AlertCircle size={16} color={nt.t === "error" ? "var(--err)" : "var(--warn)"} />} {nt.m}</div>}

                    {/* ═══ DASHBOARD ═══ */}
                    {pg === "dashboard" && <div className="fi">
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700 }}>Dashboard</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>Simple overview of stock, sales, dues, and latest invoices.</p></div>
                        {stats.ts === 0 && <div className="gl" style={{ padding: "12px 16px", borderColor: "rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", display: "flex", alignItems: "center", gap: 10, borderRadius: "var(--rs)", marginBottom: 16 }}><AlertCircle size={16} color="var(--err)" /><span style={{ color: "var(--err)", fontWeight: 600, fontSize: 13 }}>Out of stock — add new inventory to continue selling.</span></div>}
                        {stats.ts > 0 && stats.ts < 5 && <div className="gl" style={{ padding: "12px 16px", borderColor: "rgba(251,191,36,.3)", background: "rgba(251,191,36,.06)", display: "flex", alignItems: "center", gap: 10, borderRadius: "var(--rs)", marginBottom: 16 }}><AlertCircle size={16} color="var(--warn)" /><span style={{ color: "var(--warn)", fontWeight: 600, fontSize: 13 }}>Low stock — only {stats.ts} item{stats.ts !== 1 ? "s" : ""} left.</span></div>}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 28 }}>
                            {[{ l: "In Stock", v: stats.ts, s: "ready to sell", ic: Package, c: "var(--a)", g: "sgc" }, { l: "Stock Value", v: fmtCurrency(stats.sv), s: "estimated value", ic: IndianRupee, c: "var(--a2)", g: "sgv" }, { l: "Sales", v: fmtCurrency(stats.tsl), s: `${tx.filter(t => t.type === "Sell").length} invoices`, ic: TrendingUp, c: "var(--a3)", g: "sgp" }, { l: "Due To Collect", v: fmtCurrency(tx.filter(t => t.type === "Sell").reduce((s, t) => s + (t.dueAmount || 0), 0)), s: "customer balance", ic: BarChart3, c: "var(--ok)", g: "sgg" }].map((s, i) =>
                                <div key={i} className={`gc ${s.g}`}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}><span style={{ color: "var(--t3)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{s.l}</span><s.ic size={18} style={{ color: s.c, opacity: .7 }} /></div><div style={{ color: "var(--t1)", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{s.v}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{s.s}</div></div>
                            )}
                        </div>
                        <div className="gc"><h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Latest Invoices</h3>
                            {latestInvoices.length === 0 && <div style={{ color: "var(--t2)", fontSize: 14 }}>No invoices yet. Start with Add, Buy, or Sell.</div>}
                            {latestInvoices.map(t => <div key={t.id} className="tr" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 8px", borderBottom: "1px solid rgba(255,255,255,.04)", flexWrap: "wrap" }}>
                                <div style={{ minWidth: 0 }}><div style={{ color: "var(--t1)", fontSize: 14, fontWeight: 600 }}>{t.invoiceNo || "Invoice"}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 3 }}>{t.brand} {t.model} · {t.customerName || "Walk-in customer"}{t.phone ? ` · ${t.phone}` : ""}</div><div style={{ color: "var(--t3)", fontSize: 11, marginTop: 3 }}>{fmtDate(t.date)}{t.billType === "GST" ? " · GST" : ""}{t.whatsAppPdfAt ? " · Share PDF sent" : t.whatsAppMessageAt ? " · WhatsApp msg ready" : ""}</div></div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}><div><div style={{ color: "var(--ok)", fontWeight: 600, fontSize: 14 }}>{fmtCurrency(t.totalAmount || t.amount)}</div>{t.type === "Sell" && t.costPrice > 0 && (() => { const p = (t.totalAmount || t.amount) - t.costPrice; return <div style={{ fontSize: 11, color: p >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 600 }}>{p >= 0 ? "+" : ""}{fmtCurrency(p)} profit</div>; })()}</div><button className="bg" onClick={() => void downloadInvoice(t)}><Download size={14} /> PDF</button></div>
                            </div>)}
                        </div>
                    </div>}

                    {/* ═══ ADD ═══ */}
                    {pg === "add" && <div className="fi" style={{ maxWidth: 760 }}>
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Plus size={28} style={{ color: "var(--a)" }} /> {ei ? "Edit Mobile" : "Add Mobile"}</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>{ei ? "Update the selected stock item and save it back to stock." : "Fast stock entry for new phones before selling."}</p></div>
                        <div className="gc" style={{ border: "1px solid rgba(0,212,255,.2)" }}>
                            <F l="Device Photos" ic={Images}><PhotoUp photos={fm.photos || []} onChange={p => uf("photos", p)} onCameraNeeded={releaseCameraNow} /></F>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                <F l="IMEI 1" ic={Hash}><div style={{ display: "flex", gap: 8 }}><input className="gi" value={fm.imei} onChange={e => uf("imei", e.target.value)} placeholder="15-digit IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /><button className="bg" onClick={() => openSc("add")} style={{ padding: 10 }}><Camera size={16} /></button></div></F>
                                <F l="IMEI 2 (Optional)" ic={Hash}><div style={{ display: "flex", gap: 8 }}><input className="gi" value={fm.imei2} onChange={e => uf("imei2", e.target.value)} placeholder="Optional second IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /><button className="bg" onClick={() => openSc("add2")} style={{ padding: 10 }}><Camera size={16} /></button></div></F>
                                <F l="Brand" ic={Tag}><select className="gs" value={fm.brand} onChange={e => uf("brand", e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></F>
                                <F l="Model" ic={Smartphone}><input className="gi" value={fm.model} onChange={e => uf("model", e.target.value)} placeholder="e.g. Galaxy S24 Ultra" /></F>
                                <F l="Color" ic={Palette}><input className="gi" value={fm.color} onChange={e => uf("color", e.target.value)} placeholder="e.g. Black" /></F>
                                <F l="RAM (Optional)" ic={Layers}><input className="gi" value={fm.ram} onChange={e => uf("ram", e.target.value)} placeholder="e.g. 8GB" /></F>
                                <F l="Storage" ic={HardDrive}><StorageInput value={fm.storage} onChange={v => uf("storage", v)} /></F>
                                <F l="Battery Health (Optional)" ic={Battery}><input className="gi" value={fm.batteryHealth} onChange={e => uf("batteryHealth", e.target.value)} placeholder="e.g. 92%" /></F>
                                <F l="Condition" ic={Layers}><select className="gs" value={fm.condition} onChange={e => uf("condition", e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></F>
                                <F l="Warranty" ic={Shield}><select className="gs" value={fm.warrantyType || "No Warranty"} onChange={e => uf("warrantyType", e.target.value)}>{WARRANTY_TYPES.map(w => <option key={w}>{w}</option>)}</select></F>
                                {fm.warrantyType === "Testing Warranty" && <F l="Warranty Period (Months)" ic={Clock}><input className="gi" type="number" min="1" max="36" value={fm.warrantyMonths} onChange={e => uf("warrantyMonths", e.target.value)} placeholder="e.g. 3" /></F>}
                                <F l="Buy Price (Optional)" ic={IndianRupee}><input className="gi" type="number" value={fm.buyPrice} onChange={e => uf("buyPrice", e.target.value)} placeholder="₹0" /></F>
                                <F l="Sell Price" ic={IndianRupee}><input className="gi" type="number" value={fm.sellPrice} onChange={e => uf("sellPrice", e.target.value)} placeholder="₹0" /></F>
                                <F l="Serialized Stock" ic={Package}><div className="gi" style={{ display: "flex", alignItems: "center", minHeight: 48 }}>Each mobile saves as qty 1. Use Buy when you want to record supplier purchase details too.</div></F>
                                <F l="Supplier (Optional)" ic={User}><input className="gi" value={fm.supplier} onChange={e => uf("supplier", e.target.value)} placeholder="Supplier" /></F>
                            </div>
                            <div className="action-row"><button className="bp" onClick={saveInv}><CheckCircle size={16} /> {ei ? "Save Changes" : "Add to Stock"}</button><button className="bg" onClick={() => ei ? goPage("inventory") : resetForm()}>{ei ? "Back to Stock" : "Clear Form"}</button></div>
                        </div>
                    </div>}

                    {/* ═══ INVENTORY ═══ */}
                    {pg === "inventory" && !di && <div className="fi">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                            <div><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700 }}>Stock</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>{fi.length} devices</p></div>
                            <div style={{ display: "flex", gap: 8 }}><button className="bp" onClick={() => openSc("add")}><Camera size={16} /> Scan</button><button className="bp" onClick={() => goPage("add")}><Plus size={16} /> Add Mobile</button></div>
                        </div>
                        <div className="gc stock-filter-card">
                            <div className="stock-tools">
                                <div className="stock-search"><Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} /><input className="gi" placeholder="Search IMEI / model" value={sq} onChange={e => sSq(e.target.value)} /></div>
                                <div className="stock-controls-row">
                                    <select className="gs" value={fc} onChange={e => sFc(e.target.value)} style={{ width: "auto", minWidth: 120 }}><option value="All">Condition</option>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                    <select className="gs" value={fs} onChange={e => sFs(e.target.value)} style={{ width: "auto", minWidth: 120 }}><option value="All">Status</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                                    <div className="stock-view-toggle"><button className="bg" style={{ padding: 10, color: vm === "grid" ? "var(--a)" : undefined }} onClick={() => sVm("grid")}><LayoutGrid size={16} /></button><button className="bg" style={{ padding: 10, color: vm === "list" ? "var(--a)" : undefined }} onClick={() => sVm("list")}><List size={16} /></button></div>
                                </div>
                            </div>
                        </div>

                        {/* Grid — Horizontal Cards */}
                        {vm === "grid" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(420px,100%),1fr))", gap: 14 }}>
                            {fi.map(it => <div key={it.id} className="gc hcard" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "row", minHeight: 210, borderLeft: `3px solid ${it.status === "In Stock" ? "var(--a)" : "rgba(255,255,255,.12)"}` }}>
                                {/* LEFT — Portrait Photo */}
                                <div className="hcard-photo" style={{ width: 160, minWidth: 160, flexShrink: 0, position: "relative", cursor: "pointer", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,.06)" }}
                                    onClick={() => { if (it.photos?.length) sLb({ photos: it.photos, si: 0 }); else sDi(it); }}>
                                    {it.photos?.length > 0 ? <>
                                        <img src={getPhotoPreview(it.photos[0])} alt={it.model} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform .4s" }}
                                            onMouseOver={e => e.currentTarget.style.transform = "scale(1.06)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"} />
                                        {it.photos.length > 1 && <div className="ipc"><Images size={12} /> {it.photos.length}</div>}
                                    </> : <div style={{ width: "100%", height: "100%", background: BRAND_GRADIENTS[it.brand] || BRAND_GRADIENTS.Other, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, position: "relative", overflow: "hidden" }}>
                                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.18)" }} />
                                        <Smartphone size={38} style={{ opacity: .5, color: "#fff", position: "relative" }} />
                                        <span style={{ color: "rgba(255,255,255,.75)", fontSize: 12, fontWeight: 700, letterSpacing: .5, position: "relative" }}>{it.brand}</span>
                                    </div>}
                                </div>

                                {/* RIGHT — Details */}
                                <div className="hcard-details" style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                                    {/* Top — Name + Badge */}
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="hcard-title" style={{ color: "var(--t1)", fontSize: 16, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.brand} {it.model}</div>
                                                <div className="hcard-imei" style={{ color: "var(--t3)", fontSize: 11, fontFamily: "'Space Mono',monospace", marginTop: 3, letterSpacing: .5 }}>IMEI 1: {it.imei}</div>
                                                {it.imei2 && <div className="hcard-imei" style={{ color: "var(--t3)", fontSize: 10, fontFamily: "'Space Mono',monospace", marginTop: 2, letterSpacing: .4 }}>IMEI 2: {it.imei2}</div>}
                                            </div>
                                            <span className={`ba ${condBadge(it.condition)}`} style={{ flexShrink: 0 }}>{it.condition}</span>
                                        </div>
                                        {/* Tags */}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                                            {it.color && <span style={{ color: "var(--t2)", fontSize: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", padding: "2px 8px", borderRadius: 20 }}>{it.color}</span>}
                                            <span style={{ color: "var(--t2)", fontSize: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", padding: "2px 8px", borderRadius: 20 }}>{fmtSpecs(it.ram, it.storage)}</span>
                                            {it.batteryHealth && <span style={{ color: "var(--t2)", fontSize: 10, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", padding: "2px 8px", borderRadius: 20 }}>Battery {it.batteryHealth}</span>}
                                            {(() => { const w = getWarrantyStatus(it); return w.active ? <span style={{ color: "var(--ok)", fontSize: 10, background: "rgba(0,200,100,.08)", border: "1px solid rgba(0,200,100,.2)", padding: "2px 8px", borderRadius: 20 }}>{w.label}</span> : it.warrantyType && it.warrantyType !== "No Warranty" ? <span style={{ color: "var(--t3)", fontSize: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", padding: "2px 8px", borderRadius: 20 }}>Out of Warranty</span> : null; })()}
                                            <span className={`ba ${statBadge(it.status)}`} style={{ fontSize: 10, padding: "2px 8px" }}>{it.status}</span>
                                        </div>
                                    </div>

                                    {/* Middle — Pricing */}
                                    <div className="hcard-price" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", background: "rgba(255,255,255,.03)", borderRadius: 8, flexWrap: "wrap" }}>
                                        <div style={{ flex: "1 1 auto", minWidth: 50 }}>
                                            <div style={{ color: "var(--t3)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: .8, marginBottom: 1 }}>Buy</div>
                                            <div style={{ color: "var(--t2)", fontSize: 13, fontWeight: 600 }}>{fmtCurrency(it.buyPrice)}</div>
                                        </div>
                                        <ChevronRight size={12} style={{ color: "var(--t3)", flexShrink: 0 }} />
                                        <div style={{ flex: "1 1 auto", textAlign: "right", minWidth: 50 }}>
                                            <div style={{ color: "var(--t3)", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: .8, marginBottom: 1 }}>Sell</div>
                                            <div style={{ color: "var(--ok)", fontSize: 13, fontWeight: 700 }}>{fmtCurrency(it.sellPrice)}</div>
                                        </div>
                                        {it.buyPrice > 0 && it.sellPrice > it.buyPrice && <div style={{ background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 6, padding: "3px 7px", flexShrink: 0 }}>
                                            <div style={{ color: "var(--ok)", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>+{fmtCurrency(it.sellPrice - it.buyPrice)}</div>
                                        </div>}
                                    </div>

                                    {/* Bottom — Meta + Actions */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.05)" }}>
                                        <span style={{ color: "var(--t3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "50%" }}>{(() => { const d = daysInStock(it.addedDate); const c = d < 30 ? "var(--ok)" : d < 60 ? "var(--warn)" : "var(--err)"; return <span style={{ color: c, fontWeight: 600 }}>{d}d in stock</span>; })()}{it.lastInvoiceNo ? ` · ${it.lastInvoiceNo}` : ""}</span>
                                        <div className="hcard-actions">
                                            <button className="bg hcard-ab" style={{ padding: 8 }} onClick={e => { e.stopPropagation(); void printSticker(it); }}><Printer size={15} /></button>
                                            <button className="bg hcard-ab" style={{ padding: 8 }} onClick={e => { e.stopPropagation(); sDi(it); }}><Eye size={15} /></button>
                                            <button className="bg hcard-ab" style={{ padding: 8 }} onClick={e => { e.stopPropagation(); editFromStock(it); }}><Edit2 size={15} /></button>
                                            <button className="bd hcard-ab" style={{ padding: 8 }} onClick={e => { e.stopPropagation(); setConfirmDel(it); }}><Trash2 size={15} /></button>
                                        </div>
                                    </div>
                                </div>
                            </div>)}
                        </div>
                            : <div className="gc" style={{ padding: 0, overflow: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                                    <thead><tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                                        {["Photo", "IMEIs", "Device", "Cond.", "Specs", "Buy", "Sell", "Status", ""].map(h => <th key={h} style={{ padding: "12px 14px", color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, textAlign: "left" }}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>{fi.map(it => <tr key={it.id} className="tr" style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                                        <td style={{ padding: "8px 14px" }}><div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid var(--gbo)" }} onClick={() => it.photos?.length ? sLb({ photos: it.photos, si: 0 }) : null}>
                                            {it.photos?.length > 0 ? <img src={getPhotoPreview(it.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <div style={{ width: "100%", height: "100%", background: BRAND_GRADIENTS[it.brand] || BRAND_GRADIENTS.Other, display: "flex", alignItems: "center", justifyContent: "center" }}><Smartphone size={18} style={{ opacity: .4, color: "#fff" }} /></div>}
                                        </div></td>
                                        <td style={{ padding: "12px 14px", fontFamily: "'Space Mono',monospace", fontSize: 11, color: "var(--t2)" }}><div>{it.imei}</div>{it.imei2 && <div style={{ color: "var(--t3)", fontSize: 10, marginTop: 3 }}>{it.imei2}</div>}</td>
                                        <td style={{ padding: "12px 14px" }}><div style={{ color: "var(--t1)", fontSize: 13, fontWeight: 500 }}>{it.brand} {it.model}</div><div style={{ color: "var(--t3)", fontSize: 11 }}>{it.color}</div></td>
                                        <td style={{ padding: "12px 14px" }}><span className={`ba ${condBadge(it.condition)}`}>{it.condition}</span></td>
                                        <td style={{ padding: "12px 14px", color: "var(--t2)", fontSize: 13 }}>{fmtSpecs(it.ram, it.storage)}{it.batteryHealth ? ` · Battery ${it.batteryHealth}` : ""}</td>
                                        <td style={{ padding: "12px 14px", color: "var(--t2)", fontSize: 13 }}>{fmtCurrency(it.buyPrice)}</td>
                                        <td style={{ padding: "12px 14px", color: "var(--ok)", fontSize: 13, fontWeight: 500 }}>{fmtCurrency(it.sellPrice)}</td>
                                        <td style={{ padding: "12px 14px" }}><span className={`ba ${statBadge(it.status)}`}>{it.status}</span></td>
                                        <td style={{ padding: "12px 14px" }}><div style={{ display: "flex", gap: 4 }}><button className="bg" style={{ padding: 6 }} onClick={() => void printSticker(it)}><Printer size={14} /></button><button className="bg" style={{ padding: 6 }} onClick={() => sDi(it)}><Eye size={14} /></button><button className="bg" style={{ padding: 6 }} onClick={() => editFromStock(it)}><Edit2 size={14} /></button><button className="bd" style={{ padding: 6 }} onClick={() => setConfirmDel(it)}><Trash2 size={14} /></button></div></td>
                                    </tr>)}</tbody>
                                </table>
                            </div>}
                        {fi.length === 0 && <div className="gc" style={{ textAlign: "center", padding: 48 }}><Package size={40} style={{ color: "var(--t3)", marginBottom: 12 }} /><p style={{ color: "var(--t2)", fontSize: 15 }}>No devices found</p></div>}
                    </div>}

                    {/* ═══ DEVICE DETAIL ═══ */}
                    {pg === "inventory" && di && <div className="fi">
                        <button className="bg" onClick={() => sDi(null)} style={{ marginBottom: 20 }}><ChevronLeft size={16} /> Back</button>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20 }}>
                            <div className="gc">
                                <h3 style={{ color: "var(--t1)", fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}><Images size={18} style={{ color: "var(--a)" }} /> Device Photos</h3>
                                {di.photos?.length > 0 ? <>
                                    <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden", marginBottom: 12, cursor: "pointer", border: "1px solid var(--gbo)" }} onClick={() => sLb({ photos: di.photos, si: 0 })}><img src={getPhotoPreview(di.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div>
                                    {di.photos.length > 1 && <div style={{ display: "flex", gap: 8, overflowX: "auto" }} className="sh">{di.photos.map((p, i) => <div key={normalizePhotoRef(p, i).id} style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: "1px solid var(--gbo)" }} onClick={() => sLb({ photos: di.photos, si: i })}><img src={getPhotoPreview(p)} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div>)}</div>}
                                </> : <div style={{ width: "100%", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden", background: BRAND_GRADIENTS[di.brand] || BRAND_GRADIENTS.Other, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                    <Smartphone size={48} style={{ color: "rgba(255,255,255,.3)" }} /><span style={{ color: "rgba(255,255,255,.4)", fontSize: 14 }}>No photos</span>
                                    <button className="bg" style={{ marginTop: 8, borderColor: "rgba(255,255,255,.2)", color: "rgba(255,255,255,.6)" }} onClick={() => editFromStock(di)}><ImagePlus size={14} /> Add Photos</button>
                                </div>}
                            </div>
                            <div className="gc">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                                    <div><h2 style={{ color: "var(--t1)", fontSize: 22, fontWeight: 700 }}>{di.brand} {di.model}</h2><div style={{ color: "var(--t3)", fontSize: 13, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>IMEI 1: {di.imei}</div>{di.imei2 && <div style={{ color: "var(--t3)", fontSize: 12, fontFamily: "'Space Mono',monospace", marginTop: 2 }}>IMEI 2: {di.imei2}</div>}</div>
                                    <span className={`ba ${condBadge(di.condition)}`} style={{ fontSize: 12 }}>{di.condition}</span>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                                    {[{ l: "Color", v: di.color || "—", ic: Palette }, { l: "RAM", v: di.ram || "—", ic: Layers }, { l: "Storage", v: di.storage, ic: HardDrive }, { l: "Battery", v: di.batteryHealth || "—", ic: Battery }, { l: "Warranty", v: (() => { const w = getWarrantyStatus(di); return w.active ? w.label : w.label; })(), ic: Shield, color: getWarrantyStatus(di).active ? "var(--ok)" : "var(--t3)" }, { l: "Status", v: di.status, ic: Tag }, { l: "Supplier", v: di.supplier || "—", ic: User }, { l: "Added", v: fmtDate(di.addedDate), ic: Calendar }, { l: "Invoice", v: di.lastInvoiceNo || "—", ic: FileText }, { l: "Sold To", v: di.customerName || "—", ic: Phone }].map((d, i) =>
                                        <div key={i}><div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}><d.ic size={12} /> {d.l}</div><div style={{ color: d.color || "var(--t1)", fontSize: 14, fontWeight: 500 }}>{d.v}</div></div>
                                    )}
                                </div>
                                {(di.condition === "Used" || di.condition === "Refurbished") && <div className="gc" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", marginBottom: 16 }}>
                                    <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Lock size={16} style={{ color: "var(--warn)" }} /> Seller Verification</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 }}>
                                        {[{ l: "Seller Name", v: di.sellerName || "—", ic: User }, { l: "Seller Phone", v: di.sellerPhone || "—", ic: Phone }, { l: "Aadhaar", v: maskAadhaar(di.sellerAadhaarNumber), ic: Hash }, { l: "Purchase Date", v: di.purchaseDate ? fmtDate(di.purchaseDate) : "—", ic: Calendar }].map((d, i) =>
                                            <div key={`seller-${i}`}><div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}><d.ic size={12} /> {d.l}</div><div style={{ color: "var(--t1)", fontSize: 14, fontWeight: 500 }}>{d.v}</div></div>
                                        )}
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                                        <div><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Seller ID Photo</div>{di.sellerIdPhotoData ? <img src={di.sellerIdPhotoData} alt="Seller ID" style={{ width: "100%", maxWidth: 220, aspectRatio: "4/3", objectFit: "cover", borderRadius: 12, border: "1px solid var(--gbo)" }} /> : <div style={{ color: "var(--t3)", fontSize: 13 }}>Not uploaded</div>}</div>
                                        <div><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Seller Photo</div>{di.sellerPhotoData ? <img src={di.sellerPhotoData} alt="Seller" style={{ width: "100%", maxWidth: 220, aspectRatio: "4/3", objectFit: "cover", borderRadius: 12, border: "1px solid var(--gbo)" }} /> : <div style={{ color: "var(--t3)", fontSize: 13 }}>Not uploaded</div>}</div>
                                        <div><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Seller Signature</div>{di.sellerSignatureData ? <img src={di.sellerSignatureData} alt="Seller signature" style={{ width: "100%", maxWidth: 220, aspectRatio: "4/3", objectFit: "contain", borderRadius: 12, border: "1px solid var(--gbo)", background: "rgba(255,255,255,.02)" }} /> : <div style={{ color: "var(--t3)", fontSize: 13 }}>Not uploaded</div>}</div>
                                    </div>
                                    <div style={{ color: di.sellerAgreementAccepted ? "var(--ok)" : "var(--warn)", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{di.sellerAgreementAccepted ? "Seller ownership declaration recorded" : "Seller ownership declaration not recorded"}</div>
                                </div>}
                                <div style={{ display: "flex", gap: 16, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: 16 }}>
                                    {di.buyPrice > 0 && <div style={{ flex: 1 }}><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Buy</div><div style={{ color: "var(--a2)", fontSize: 22, fontWeight: 700 }}>{fmtCurrency(di.buyPrice)}</div></div>}
                                    <div style={{ flex: 1 }}><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Sell</div><div style={{ color: "var(--ok)", fontSize: 22, fontWeight: 700 }}>{fmtCurrency(di.sellPrice)}</div></div>
                                    {di.buyPrice > 0 && <div style={{ flex: 1 }}><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Margin</div><div style={{ color: "var(--warn)", fontSize: 22, fontWeight: 700 }}>{fmtCurrency(di.sellPrice - di.buyPrice)}</div></div>}
                                </div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <button className="bg" onClick={() => void printSticker(di)}><Printer size={16} /> Print Sticker</button>
                                    <button className="bp" onClick={() => editFromStock(di)}><Edit2 size={16} /> Edit</button>
                                    {di.status === "In Stock" && di.qty > 0 && <button className="bs" onClick={() => { sFm(toForm(di, { amount: di.sellPrice, paidAmount: di.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" })); sPg("sell"); sDi(null); }}><ArrowUpCircle size={16} /> Sell This</button>}
                                    <button className="bd" onClick={() => setConfirmDel(di)}><Trash2 size={16} /> Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>}

                    {/* ═══ RECYCLE BIN ═══ */}
                    {pg === "recycle" && <div className="fi">
                        <div style={{ marginBottom: 28 }}>
                            <h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Trash size={28} style={{ color: "var(--err)" }} /> Bin</h1>
                            <p style={{ color: "var(--t3)", fontSize: 13, marginTop: 6 }}>Deleted items stay here until you permanently delete them. You can restore items back to stock.</p>
                        </div>
                        {recycleBinItems.length > 0 && <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                            <button className="bd" onClick={() => setConfirmDel({ _emptyAll: true })}><Trash2 size={16} /> Empty Bin</button>
                        </div>}
                        {recycleBinItems.length > 0 ? <div style={{ display: "grid", gap: 12 }}>
                            {recycleBinItems.map(it => <div key={it.id} className="gc" style={{ padding: 14, display: "flex", gap: 14, alignItems: "flex-start" }}>
                                <div style={{ width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "1px solid var(--gbo)", cursor: it.photos?.length ? "pointer" : "default" }} onClick={() => it.photos?.length ? sLb({ photos: it.photos, si: 0 }) : null}>
                                    {it.photos?.length > 0 ? <img src={getPhotoPreview(it.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <div style={{ width: "100%", height: "100%", background: BRAND_GRADIENTS[it.brand] || BRAND_GRADIENTS.Other, display: "flex", alignItems: "center", justifyContent: "center" }}><Smartphone size={20} style={{ opacity: .4, color: "#fff" }} /></div>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                                        <div>
                                            <div style={{ color: "var(--t1)", fontSize: 14, fontWeight: 600 }}>{it.brand} {it.model}</div>
                                            <div style={{ color: "var(--t3)", fontSize: 11 }}>{it.color}{it.storage ? ` · ${it.storage}` : ""}</div>
                                        </div>
                                        <span className={`ba ${condBadge(it.condition)}`} style={{ flexShrink: 0 }}>{it.condition}</span>
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, marginBottom: 10 }}>
                                        {it.imei && <span style={{ color: "var(--t2)", fontFamily: "'Space Mono',monospace", fontSize: 11 }}>{it.imei}</span>}
                                        <span style={{ color: "var(--ok)", fontWeight: 600 }}>{fmtCurrency(it.sellPrice)}</span>
                                        {it.buyPrice > 0 && <span style={{ color: "var(--t3)" }}>Buy {fmtCurrency(it.buyPrice)}</span>}
                                        <span style={{ color: "var(--t3)" }}>{it.deletedAt ? fmtDate(it.deletedAt) : ""}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button className="bp" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => restoreInv(it.id)}><ArchiveRestore size={14} /> Restore</button>
                                        <button className="bd" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setConfirmDel({ ...it, _permanent: true })}><Trash2 size={14} /> Delete Forever</button>
                                    </div>
                                </div>
                            </div>)}
                        </div> : <div className="gc" style={{ textAlign: "center", padding: 48 }}><Trash size={40} style={{ color: "var(--t3)", marginBottom: 12 }} /><p style={{ color: "var(--t2)", fontSize: 15 }}>Bin is empty</p><p style={{ color: "var(--t3)", fontSize: 13, marginTop: 4 }}>Deleted items will appear here</p></div>}
                    </div>}

                    {/* ═══ BUY ═══ */}
                    {pg === "buy" && <div className="fi" style={{ maxWidth: 700 }}>
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><ArrowDownCircle size={28} style={{ color: "var(--a2)" }} /> Purchase Entry</h1></div>
                        <div className="gc" style={{ border: "1px solid rgba(139,92,246,.2)" }}>
                            <F l="Device Photos" ic={Images}><PhotoUp photos={fm.photos || []} onChange={p => uf("photos", p)} onCameraNeeded={releaseCameraNow} /></F>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                <F l="IMEI 1" ic={Hash}><div style={{ display: "flex", gap: 8 }}><input className="gi" value={fm.imei} onChange={e => uf("imei", e.target.value)} placeholder="IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /><button className="bg" onClick={() => openSc("buy")}><Camera size={16} /></button></div></F>
                                <F l="IMEI 2 (Optional)" ic={Hash}><div style={{ display: "flex", gap: 8 }}><input className="gi" value={fm.imei2} onChange={e => uf("imei2", e.target.value)} placeholder="Optional second IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /><button className="bg" onClick={() => openSc("buy2")}><Camera size={16} /></button></div></F>
                                <F l="Brand" ic={Tag}><select className="gs" value={fm.brand} onChange={e => uf("brand", e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></F>
                                <F l="Model" ic={Smartphone}><input className="gi" value={fm.model} onChange={e => uf("model", e.target.value)} placeholder="Model" /></F>
                                <F l="Color" ic={Palette}><input className="gi" value={fm.color} onChange={e => uf("color", e.target.value)} placeholder="Color" /></F>
                                <F l="RAM (Optional)" ic={Layers}><input className="gi" value={fm.ram} onChange={e => uf("ram", e.target.value)} placeholder="e.g. 8GB" /></F>
                                <F l="Storage" ic={HardDrive}><StorageInput value={fm.storage} onChange={v => uf("storage", v)} /></F>
                                <F l="Battery Health (Optional)" ic={Battery}><input className="gi" value={fm.batteryHealth} onChange={e => uf("batteryHealth", e.target.value)} placeholder="e.g. 92%" /></F>
                                <F l="Condition" ic={Layers}><select className="gs" value={fm.condition} onChange={e => uf("condition", e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></F>
                                <F l="Buy Price" ic={IndianRupee}><input className="gi" type="number" value={fm.buyPrice} onChange={e => uf("buyPrice", e.target.value)} placeholder="₹" /></F>
                                <F l="Sell Price" ic={IndianRupee}><input className="gi" type="number" value={fm.sellPrice} onChange={e => uf("sellPrice", e.target.value)} placeholder="₹" /></F>
                                <F l="Serialized Stock" ic={Package}><div className="gi" style={{ display: "flex", alignItems: "center", minHeight: 48 }}>Mobile IMEI stock saves one handset per entry.</div></F>
                                <F l="Supplier *" ic={User}><input className="gi" value={fm.supplier} onChange={e => uf("supplier", e.target.value)} placeholder="Supplier" /></F>
                                <F l="Phone" ic={Phone}><input className="gi" type="tel" value={fm.phone} onChange={e => uf("phone", e.target.value)} placeholder="Phone" /></F>
                                <F l="Payment" ic={CreditCard}><select className="gs" value={fm.paymentMode} onChange={e => uf("paymentMode", e.target.value)}>{PAYMENT_MODES.map(p => <option key={p}>{p}</option>)}</select></F>
                            </div>
                            {(fm.condition === "Used" || fm.condition === "Refurbished") && <div className="gc" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", marginTop: 12 }}>
                                <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Lock size={16} style={{ color: "var(--warn)" }} /> Seller Verification</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                    <F l="Seller Name *" ic={User}><input className="gi" value={fm.sellerName} onChange={e => uf("sellerName", e.target.value)} placeholder="Seller full name" /></F>
                                    <F l="Seller Phone *" ic={Phone}><input className="gi" type="tel" value={fm.sellerPhone} onChange={e => uf("sellerPhone", e.target.value)} placeholder="Seller phone" /></F>
                                    <F l="Aadhaar Number *" ic={Hash}><input className="gi" value={fm.sellerAadhaarNumber} onChange={e => uf("sellerAadhaarNumber", e.target.value.replace(/[^\d]/g, "").slice(0, 12))} placeholder="12 digit Aadhaar" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                    <F l="Purchase Date *" ic={Calendar}><input className="gi" type="date" value={fm.purchaseDate} onChange={e => uf("purchaseDate", e.target.value)} /></F>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 14 }}>
                                    <F l="Seller ID Photo *" ic={FileText}><SingleImageInput label="Seller ID" value={fm.sellerIdPhotoData} onChange={v => uf("sellerIdPhotoData", v)} /></F>
                                    <F l="Seller Photo *" ic={Camera}><SingleImageInput label="Seller Photo" value={fm.sellerPhotoData} onChange={v => uf("sellerPhotoData", v)} /></F>
                                </div>
                                <div style={{ marginTop: 14 }}>
                                    <F l="Seller Signature *" ic={Edit2}><SignaturePad value={fm.sellerSignatureData} onChange={v => uf("sellerSignatureData", v)} /></F>
                                </div>
                                <label className="gi" style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 14 }}>
                                    <input type="checkbox" checked={!!fm.sellerAgreementAccepted} onChange={e => uf("sellerAgreementAccepted", e.target.checked)} style={{ marginTop: 3 }} />
                                    <span>I confirm the seller has declared lawful ownership of this device and agrees to transfer it to the shop.</span>
                                </label>
                            </div>}
                            <F l="Notes" ic={FileText}><input className="gi" value={fm.notes} onChange={e => uf("notes", e.target.value)} placeholder="Notes" /></F>
                            <div className="action-row"><button className="bp" style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }} onClick={doBuy}><ArrowDownCircle size={16} /> Record Purchase</button><button className="bg" onClick={() => sFm(ef)}>Clear</button></div>
                        </div>
                    </div>}

                    {/* ═══ SELL ═══ */}
                    {pg === "sell" && <div className="fi" style={{ maxWidth: 700 }}>
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><ArrowUpCircle size={28} style={{ color: "var(--ok)" }} /> Sell Device</h1></div>
                        <div className="gc" style={{ border: "1px solid rgba(52,211,153,.2)" }}>
                            <F l="IMEI 1 or IMEI 2 (Scan to auto-fill)" ic={Hash}><div style={{ display: "flex", gap: 8 }}>
                                <input className="gi" value={fm.imei} onChange={e => { const v = cleanImei(e.target.value); uf("imei", v); if (v.length === 15) { const f = liveDeviceByImei(v); if (f) sFm(toForm(f, { amount: f.sellPrice, paidAmount: f.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" })); } }} placeholder="IMEI" style={{ fontFamily: "'Space Mono',monospace" }} />
                                <button className="bg" onClick={() => openSc("sell")}><Camera size={16} /></button>
                            </div></F>
                            {fm.model && <div className="gc" style={{ background: "rgba(52,211,153,.05)", border: "1px solid rgba(52,211,153,.15)", marginBottom: 16, padding: 14, display: "flex", gap: 14, alignItems: "center" }}>
                                {fm.photos?.length > 0 && <div style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden", flexShrink: 0, cursor: "pointer" }} onClick={() => sLb({ photos: fm.photos, si: 0 })}><img src={getPhotoPreview(fm.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div>}
                                <div><div style={{ color: "var(--ok)", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>DEVICE FOUND</div><div style={{ color: "var(--t1)", fontSize: 16, fontWeight: 600 }}>{fm.brand} {fm.model}</div><div style={{ color: "var(--t3)", fontSize: 13 }}>{fm.color || "-"} · {fmtSpecs(fm.ram, fm.storage)}{fm.batteryHealth ? ` · Battery ${fm.batteryHealth}` : ""} · {fm.condition}</div><div style={{ color: "var(--t3)", fontSize: 12, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>IMEI 1: {fm.imei}{fm.imei2 ? ` | IMEI 2: ${fm.imei2}` : ""}</div><div style={{ color: "var(--t2)", fontSize: 13, marginTop: 2 }}>Buy: {fmtCurrency(fm.buyPrice)} → Sell: {fmtCurrency(fm.sellPrice)}</div></div>
                            </div>}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                <F l="Customer *" ic={User}><input className="gi" value={fm.customerName} onChange={e => uf("customerName", e.target.value)} placeholder="Buyer" /></F>
                                <F l="Phone" ic={Phone}><input className="gi" type="tel" value={fm.phone} onChange={e => uf("phone", e.target.value)} placeholder="Phone" /></F>
                                <F l="Bill Type" ic={FileText}><select className="gs" value={fm.billType} onChange={e => uf("billType", e.target.value)}>{BILL_TYPES.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="GST Rate %" ic={Hash}><input className="gi" type="number" step="0.01" value={fm.gstRate} onChange={e => uf("gstRate", e.target.value)} placeholder="18" disabled={fm.billType !== "GST"} /></F>
                                <F l="Amount" ic={IndianRupee}><input className="gi" type="number" value={fm.amount} onChange={e => uf("amount", e.target.value)} placeholder="₹" /></F>
                                <F l="Paid Now" ic={Banknote}><input className="gi" type="number" value={fm.paidAmount} onChange={e => uf("paidAmount", e.target.value)} placeholder="₹" /></F>
                                <F l="Payment" ic={CreditCard}><select className="gs" value={fm.paymentMode} onChange={e => uf("paymentMode", e.target.value)}>{PAYMENT_MODES.map(p => <option key={p}>{p}</option>)}</select></F>
                                <F l="Due Amount" ic={FileText}><div className="gi" style={{ display: "flex", alignItems: "center", minHeight: 48, color: +fm.dueAmount > 0 ? "var(--warn)" : "var(--ok)" }}>{fmtCurrency(fm.dueAmount || 0)}</div></F>
                            </div>
                            <F l="Notes" ic={FileText}><input className="gi" value={fm.notes} onChange={e => uf("notes", e.target.value)} placeholder="Notes" /></F>
                            {fm.amount && <div className="gc" style={{ background: "rgba(255,255,255,.03)", padding: 14, borderRadius: "var(--rs)", marginTop: 8, marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}><span style={{ color: "var(--t1)", fontWeight: 600 }}>{fm.billType === "GST" ? "GST Invoice Preview" : "Invoice Preview"}</span>{fm.billType === "GST" && <span className="ba br">GST</span>}</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, color: "var(--t2)", fontSize: 13 }}>
                                    <div><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 3 }}>Taxable</div><div>{fmtMoney(salePreview.taxableAmount)}</div></div>
                                    {fm.billType === "GST" && <>
                                        <div><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 3 }}>CGST</div><div>{fmtMoney(salePreview.cgstAmount)}</div></div>
                                        <div><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 3 }}>SGST</div><div>{fmtMoney(salePreview.sgstAmount)}</div></div>
                                    </>}
                                    <div><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 3 }}>Grand Total</div><div style={{ color: "var(--t1)", fontWeight: 700 }}>{fmtMoney(salePreview.totalAmount)}</div></div>
                                </div>
                            </div>}
                            {fm.amount && fm.buyPrice && <div style={{ background: "rgba(255,255,255,.03)", padding: 14, borderRadius: "var(--rs)", marginTop: 8, marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between", color: "var(--t2)", fontSize: 14 }}><span>Profit</span><span style={{ color: +fm.amount - +fm.buyPrice >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 700 }}>{fmtCurrency(+fm.amount - +fm.buyPrice)}</span></div></div>}
                            <div className="action-row"><button className="bs" onClick={doSell}><ArrowUpCircle size={16} /> Complete Sale</button><button className="bg" onClick={() => sFm(ef)}>Clear</button></div>
                        </div>
                        {latestSell && <div className="gc" style={{ marginTop: 16, border: "1px solid rgba(0,212,255,.18)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                                <div><h3 style={{ color: "var(--t1)", fontSize: 16, fontWeight: 600 }}>Latest Invoice</h3><div style={{ color: "var(--t3)", fontSize: 13, marginTop: 4 }}>{latestSell.invoiceNo} · {fmtDateTime(latestSell.dateTime || latestSell.date)}</div></div>
                                <span className={`ba ${latestSell.dueAmount > 0 ? "br" : "bi"}`}>{latestSell.dueAmount > 0 ? `Due ${fmtCurrency(latestSell.dueAmount)}` : "Paid"}</span>
                            </div>
                            <div style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600 }}>{latestSell.brand} {latestSell.model}</div>
                            <div style={{ color: "var(--t3)", fontSize: 12, fontFamily: "'Space Mono',monospace", marginTop: 6 }}>IMEI 1: {latestSell.imei}{latestSell.imei2 ? ` | IMEI 2: ${latestSell.imei2}` : ""}</div>
                            <div style={{ color: "var(--t2)", fontSize: 13, marginTop: 6 }}>{latestSell.customerName || "Walk-in customer"}{latestSell.phone ? ` · ${latestSell.phone}` : ""} · {fmtSpecs(latestSell.ram, latestSell.storage)} · {fmtCurrency(latestSell.totalAmount || latestSell.amount)}</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>{latestSell.billType === "GST" && <><span className="ba br">GST</span><span style={{ color: "var(--t3)", fontSize: 12 }}>Taxable {fmtMoney(latestSell.taxableAmount)} · GST {fmtMoney(latestSell.gstAmount)}</span></>}{latestSell.whatsAppMessageAt && <span className="ba bi">Msg Sent</span>}{latestSell.whatsAppPdfAt && <span className="ba bi">PDF Sent</span>}</div>
                            <div style={{ color: "var(--t3)", fontSize: 12, marginTop: 8 }}>Tip: send WhatsApp message first so the customer number shows in your recent chats, then share the PDF.</div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                                <button className="bp" onClick={() => void shareInvoice(latestSell)}><Share2 size={16} /> Share PDF</button>
                                <button className="bg" onClick={() => void downloadInvoice(latestSell)}><Download size={16} /> Download PDF</button>
                                <button className="bg" onClick={() => whatsappMessage(latestSell)}><Phone size={16} /> WhatsApp Msg</button>
                            </div>
                        </div>}
                        <div className="gc" style={{ marginTop: 16 }}><h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Quick Pick</h3>
                            {inv.filter(i => i.status === "In Stock" && i.qty > 0).slice(0, 6).map(it => <div key={it.id} className="tr" onClick={() => sFm(toForm(it, { amount: it.sellPrice, paidAmount: it.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" }))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                                        {it.photos?.length > 0 ? <img src={getPhotoPreview(it.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /> : <div style={{ width: "100%", height: "100%", background: BRAND_GRADIENTS[it.brand] || BRAND_GRADIENTS.Other, display: "flex", alignItems: "center", justifyContent: "center" }}><Smartphone size={16} style={{ opacity: .4, color: "#fff" }} /></div>}
                                    </div>
                                    <div><div style={{ color: "var(--t1)", fontSize: 14 }}>{it.brand} {it.model}</div><div style={{ color: "var(--t3)", fontSize: 12 }}>{fmtSpecs(it.ram, it.storage)} · IMEI 1: {it.imei}{it.imei2 ? ` · IMEI 2: ${it.imei2}` : ""}</div></div>
                                </div>
                                <div style={{ color: "var(--ok)", fontWeight: 600, fontSize: 14 }}>{fmtCurrency(it.sellPrice)}</div>
                            </div>)}
                        </div>
                    </div>}

                    {/* ═══ INVOICES ═══ */}
                    {pg === "transactions" && <div className="fi">
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700 }}>Invoices</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>{invoiceRecords.length} sales invoices</p></div>
                        <div className="gc" style={{ marginBottom: 16, padding: 16 }}>
                            <div style={{ position: "relative" }}><Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} /><input className="gi" placeholder="Search invoice no, customer, IMEI, brand, model..." value={iq} onChange={e => sIq(e.target.value)} style={{ paddingLeft: 36 }} /></div>
                        </div>
                        <div style={{ display: "grid", gap: 14 }}>
                            {invoiceRecords.length === 0 && <div className="gc" style={{ textAlign: "center", padding: 40 }}><FileText size={40} style={{ color: "var(--t3)", marginBottom: 12 }} /><p style={{ color: "var(--t2)", fontSize: 15 }}>No invoices found</p></div>}
                            {invoiceRecords.map(t => <div key={t.id} className="gc" style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                    <div><div style={{ color: "var(--t1)", fontSize: 16, fontWeight: 700 }}>{t.invoiceNo || "Invoice"}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{fmtDateTime(t.dateTime || t.date)}</div></div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{t.billType === "GST" && <span className="ba br">GST</span>}<span className={`ba ${t.dueAmount > 0 ? "br" : "bi"}`}>{t.dueAmount > 0 ? `Due ${fmtCurrency(t.dueAmount)}` : "Paid"}</span>{t.whatsAppMessageAt && <span className="ba bi">Msg Sent</span>}{t.whatsAppPdfAt && <span className="ba bi">PDF Sent</span>}</div>
                                </div>
                                <div style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600 }}>{t.brand} {t.model}</div>
                                <div style={{ color: "var(--t2)", fontSize: 13 }}>{t.customerName || "Walk-in customer"}{t.phone ? ` · ${t.phone}` : ""}</div>
                                <div style={{ color: "var(--t3)", fontSize: 12, fontFamily: "'Space Mono',monospace" }}>IMEI 1: {t.imei}{t.imei2 ? ` · IMEI 2: ${t.imei2}` : ""}</div>
                                <div style={{ color: "var(--t3)", fontSize: 12 }}>Tip: send WhatsApp message first so this customer appears in your recent chats.</div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><div style={{ color: "var(--ok)", fontWeight: 700, fontSize: 16 }}>{fmtCurrency(t.totalAmount || t.amount)}</div>{t.type === "Sell" && t.costPrice > 0 && (() => { const p = (t.totalAmount || t.amount) - t.costPrice; return <div style={{ fontSize: 12, color: p >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 600, marginTop: 2 }}>{p >= 0 ? "+" : ""}{fmtCurrency(p)} profit</div>; })()}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="bp" onClick={() => void shareInvoice(t)}><Share2 size={14} /> Share PDF</button><button className="bg" onClick={() => whatsappMessage(t)}><Phone size={14} /> WhatsApp Msg</button><button className="bg" onClick={() => void downloadInvoice(t)}><Download size={14} /> PDF</button></div></div>
                            </div>)}
                        </div>
                    </div>}

                    {/* ═══ REPORTS ═══ */}
                    {pg === "reports" && <div className="fi">
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700 }}>Reports</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>Filter Buy, Sell, and Add records by date, GST, payment mode, brand, and party. View transaction reports, customer ledgers, or supplier purchase summaries and export them as PDF.</p></div>
                        <div className="gc" style={{ marginBottom: 16 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                                <F l="Report View" ic={BarChart3}><select className="gs" value={reportView} onChange={e => setReportView(e.target.value)}>{REPORT_VIEWS.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Report Type" ic={FileText}><select className="gs" value={reportType} onChange={e => setReportType(e.target.value)}>{REPORT_TYPES.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Date Range" ic={Calendar}><select className="gs" value={reportPreset} onChange={e => setReportPreset(e.target.value)}>{REPORT_RANGE_PRESETS.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="GST Filter" ic={Hash}><select className="gs" value={reportBillFilter} onChange={e => setReportBillFilter(e.target.value)} disabled={reportType === "Buy" || reportType === "Add" || reportView !== "Transactions"}>{REPORT_BILL_FILTERS.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Payment Mode" ic={CreditCard}><select className="gs" value={reportPaymentFilter} onChange={e => setReportPaymentFilter(e.target.value)}>{["All Payments", ...PAYMENT_MODES].map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Brand" ic={Tag}><select className="gs" value={reportBrandFilter} onChange={e => setReportBrandFilter(e.target.value)}>{reportBrands.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Due Status" ic={Banknote}><select className="gs" value={reportDueFilter} onChange={e => setReportDueFilter(e.target.value)} disabled={reportView === "Supplier Summary" || (reportType !== "All" && reportType !== "Sell")}>{REPORT_DUE_FILTERS.map(type => <option key={type}>{type}</option>)}</select></F>
                                <F l="Customer / Supplier" ic={Search}><input className="gi" value={reportPartyQuery} onChange={e => setReportPartyQuery(e.target.value)} placeholder="Search party, phone, invoice, IMEI" /></F>
                                <F l="Brand / Model / IMEI" ic={Package}><input className="gi" value={reportItemQuery} onChange={e => setReportItemQuery(e.target.value)} placeholder="Search brand, model, invoice, IMEI" /></F>
                                {reportPreset === "Custom" && <><F l="From" ic={Calendar}><input className="gi" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></F><F l="To" ic={Calendar}><input className="gi" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} /></F></>}
                            </div>
                            <div className="action-row" style={{ marginTop: 8 }}>
                                <button className="bp" onClick={() => void downloadReport()}><Download size={16} /> Download PDF</button>
                                <button className="bg" onClick={() => void previewReportPdf(false)}><Eye size={16} /> Open PDF</button>
                                <button className="bg" onClick={() => void previewReportPdf(true)}><Printer size={16} /> Print Report</button>
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
                            {[{ l: "Records", v: activeReportSummary.records, c: "var(--t1)" }, { l: reportView === "Supplier Summary" ? "Purchases" : "Buy + Add", v: fmtCurrency(activeReportSummary.buyAddTotal), c: "var(--a2)" }, { l: reportView === "Customer Ledger" ? "Sales" : "Sales", v: fmtCurrency(activeReportSummary.sellTotal), c: "var(--a)" }, { l: "Due", v: fmtCurrency(activeReportSummary.dueTotal), c: "var(--warn)" }, { l: "Profit", v: fmtCurrency(activeReportSummary.profit), c: "var(--ok)" }].map((s, i) =>
                                <div key={i} className="gc" style={{ textAlign: "center" }}><div style={{ color: "var(--t3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{s.l}</div><div style={{ color: s.c, fontSize: 22, fontWeight: 700 }}>{s.v}</div></div>
                            )}
                        </div>
                        <div className="gc">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}><h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600 }}>Report Preview</h3><div style={{ color: "var(--t3)", fontSize: 13 }}>{reportView} · {reportType} · {reportRange.label}{reportType !== "Buy" && reportType !== "Add" && reportBillFilter !== "All Bills" && reportView === "Transactions" ? ` · ${reportBillFilter}` : ""}{reportDueFilter !== "All Status" ? ` · ${reportDueFilter}` : ""}{reportPaymentFilter !== "All Payments" ? ` · ${reportPaymentFilter}` : ""}{reportBrandFilter !== "All Brands" ? ` · ${reportBrandFilter}` : ""}{reportPartyQuery.trim() ? ` · ${reportPartyQuery.trim()}` : ""}{reportItemQuery.trim() ? ` · ${reportItemQuery.trim()}` : ""}</div></div>
                            <div style={{ display: "grid", gap: 12 }}>
                                {activeReportRows.length === 0 && <div style={{ color: "var(--t2)", fontSize: 14 }}>No records found for this range.</div>}
                                {activeReportRows.map(row => <div key={row.id} className="tr" style={{ display: "grid", gap: 6, padding: "12px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,.05)", background: "rgba(255,255,255,.03)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className={`ba ${row.type === "Sell" ? "bi" : row.type === "Buy" ? "br" : "bu"}`}>{row.type}</span>{row.billType === "GST" && <span className="ba br">GST</span>}{row.invoiceNo && <span style={{ color: "var(--t3)", fontSize: 12 }}>{row.invoiceNo}</span>}</div><div style={{ color: "var(--ok)", fontWeight: 700 }}>{fmtCurrency(row.amount || 0)}</div></div>
                                    <div style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600 }}>{row.item || row.label}</div>
                                    <div style={{ color: "var(--t2)", fontSize: 13 }}>{row.party || "-"}{row.phone ? ` · ${row.phone}` : ""}{row.paymentMode ? ` · ${row.paymentMode}` : ""}</div>
                                    <div style={{ color: "var(--t3)", fontSize: 12 }}>{fmtDateTime(row.lastDateTime || row.dateTime)}{row.extra ? ` · ${row.extra}` : ""}{reportView !== "Transactions" ? ` · ${row.records} records` : ""}</div>
                                    <div style={{ color: "var(--t3)", fontSize: 12, fontFamily: "'Space Mono',monospace" }}>{reportView === "Transactions" ? (row.imei ? `IMEI 1: ${row.imei}${row.imei2 ? ` · IMEI 2: ${row.imei2}` : ""}` : "No IMEI") : `Due ${fmtCurrency(row.dueAmount || 0)}${reportView === "Customer Ledger" ? ` · Profit ${fmtCurrency(row.profit || 0)}` : ""}`}</div>
                                </div>)}
                            </div>
                        </div>
                    </div>}

                    {/* ═══ SETTINGS ═══ */}
                    {pg === "settings" && <div className="fi" style={{ maxWidth: 980 }}>
                        <div style={{ marginBottom: 28 }}><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Settings size={28} style={{ color: "var(--a)" }} /> Shop Profile & Invoice</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>Configure your shop details for professional A4 portrait invoices and keep everything updated automatically across logged-in devices.</p></div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginBottom: 16 }}>
                            <div className="gc">
                                <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Shop Profile & Invoice Logo</h3>
                                <div style={{ display: "grid", gap: 12 }}>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                        <div style={{ width: 78, height: 78, borderRadius: 16, overflow: "hidden", border: "1px solid var(--gbo)", background: "rgba(255,255,255,.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {shopCfg.logoData ? <img src={shopCfg.logoData} alt="Shop invoice logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Smartphone size={30} style={{ color: "var(--t3)" }} />}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <button className="bg" onClick={() => logoInputRef.current?.click()}><Upload size={16} /> Upload Shop Logo</button>
                                            {shopCfg.logoData && <button className="bg" onClick={() => setShopField("logoData", "")}><Trash2 size={16} /> Remove Shop Logo</button>}
                                        </div>
                                        <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoPick} />
                                    </div>
                                    <div style={{ color: "var(--t3)", fontSize: 12, lineHeight: 1.6 }}>This uploaded shop logo is used on invoice PDFs only. The app itself uses the separate {APP_NAME} brand logo.</div>
                                    <div className="action-row"><button className="bp" onClick={() => void saveShopProfile()} disabled={profileSaveBusy}>{profileSaveBusy ? "Saving..." : "Save Shop Profile"}</button><button className="bg" onClick={logoutShop}><LogOut size={16} /> Sign out</button>{shopProfileDirty ? <span style={{ color: "var(--warn)", fontSize: 12, alignSelf: "center" }}>Unsaved changes</span> : null}</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                        <F l="Shop Name" ic={Smartphone}><input className="gi" value={shopCfg.shopName} onChange={e => setShopField("shopName", e.target.value)} placeholder="PhoneDukaan" /></F>
                                        <F l="Legal Name" ic={FileText}><input className="gi" value={shopCfg.legalName} onChange={e => setShopField("legalName", e.target.value)} placeholder="Business legal name" /></F>
                                        <F l="Address" ic={Home}><input className="gi" value={shopCfg.address} onChange={e => setShopField("address", e.target.value)} placeholder="Street / market / building" /></F>
                                        <F l="Location" ic={MapPin}><input className="gi" value={shopCfg.location} onChange={e => setShopField("location", e.target.value)} placeholder="City, district, landmark" /></F>
                                        <F l="Phone" ic={Phone}><input className="gi" value={shopCfg.phone} onChange={e => setShopField("phone", e.target.value)} placeholder="Shop phone" /></F>
                                        <F l="Email" ic={Mail}><input className="gi" value={shopCfg.email} onChange={e => setShopField("email", e.target.value)} placeholder="shop@email.com" /></F>
                                        <F l="GSTIN" ic={Hash}><input className="gi" value={shopCfg.gstin} onChange={e => setShopField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                        <F l="State / Code" ic={MapPin}><div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 8 }}><input className="gi" value={shopCfg.state} onChange={e => setShopField("state", e.target.value)} placeholder="State" /><input className="gi" value={shopCfg.stateCode} onChange={e => setShopField("stateCode", e.target.value)} placeholder="Code" /></div></F>
                                    </div>
                                </div>
                            </div>
                            <div className="gc">
                                <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Invoice Preferences</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                    <F l="Invoice Prefix" ic={Hash}><input className="gi" value={shopCfg.invoicePrefix} onChange={e => setShopField("invoicePrefix", e.target.value)} placeholder="INV" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                    <F l="Default Bill Type" ic={FileText}><select className="gs" value={shopCfg.defaultBillType} onChange={e => setShopField("defaultBillType", e.target.value)}>{BILL_TYPES.map(type => <option key={type}>{type}</option>)}</select></F>
                                    <F l="Default GST Rate %" ic={IndianRupee}><input className="gi" type="number" step="0.01" value={shopCfg.defaultGstRate} onChange={e => setShopField("defaultGstRate", e.target.value)} placeholder="18" /></F>
                                    <F l="HSN/SAC Code" ic={Hash}><input className="gi" value={shopCfg.hsnCode} onChange={e => setShopField("hsnCode", e.target.value)} placeholder="8517" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                    <F l="Show Price on Sticker" ic={Printer}><label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={shopCfg.stickerShowPrice} onChange={e => setShopField("stickerShowPrice", e.target.checked)} /><span>{shopCfg.stickerShowPrice ? "Yes — sell price shown on sticker" : "No — price hidden on sticker"}</span></label></F>
                                    <F l="Footer Note" ic={FileText}><textarea className="gi" style={{ minHeight: 84 }} value={shopCfg.footer} onChange={e => setShopField("footer", e.target.value)} placeholder="Thank you note / declaration" /></F>
                                    <F l="Terms & Warranty" ic={FileText}><textarea className="gi" style={{ minHeight: 84 }} value={shopCfg.terms} onChange={e => setShopField("terms", e.target.value)} placeholder="Service / warranty / return terms" /></F>
                                </div>
                                <div className="gc" style={{ marginTop: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                                    <div style={{ color: "var(--t1)", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Invoice Output</div>
                                    <div style={{ color: "var(--t2)", fontSize: 13, lineHeight: 1.7 }}>PDFs are generated in professional A4 portrait format with your uploaded shop logo, shop address, customer details, handset specs, IMEIs, payment summary, and GST or regular invoice totals. On supported phones, the PDF can be shared directly to WhatsApp from the native share sheet.</div>
                                </div>
                            </div>
                        </div>
                        <div className="gc" style={{ marginBottom: 16 }}>
                            <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Data Status</h3>
                            {shopSession && <div className="gc" style={{ marginBottom: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}><div style={{ color: "var(--t1)", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Automatic updates active</div><div style={{ color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>Changes on one logged-in device appear automatically on the others.</div></div>}
                            {showSyncAdvanced ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
                                <F l="Shop ID" ic={Hash}><input className="gi" value={syncCfg.shopId} onChange={e => setSyncField("shopId", e.target.value)} placeholder="main-shop" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                <F l="Automatic Updates" ic={ol ? Wifi : WifiOff}><label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={syncCfg.autoSync} onChange={e => setSyncField("autoSync", e.target.checked)} /><span>{syncCfg.autoSync ? "Enabled" : "Disabled"}</span></label></F>
                            </div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Connection</div><div style={{ color: syncReady ? "var(--ok)" : "var(--warn)", fontWeight: 700, marginBottom: 4 }}>{syncReady ? "Connected" : "Not configured"}</div><div style={{ color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>{syncReady ? "Securely connected" : "Waiting for login"}</div></div>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Shop ID</div><div style={{ color: "var(--t1)", fontWeight: 700, marginBottom: 4 }}>{syncCfg.shopId}</div><div style={{ color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>Saved on this device</div></div>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Automatic Updates</div><div style={{ color: syncCfg.autoSync ? "var(--ok)" : "var(--t1)", fontWeight: 700, marginBottom: 4 }}>{syncCfg.autoSync ? "Enabled" : "Disabled"}</div><div style={{ color: "var(--t2)", fontSize: 13, lineHeight: 1.6 }}>{syncCfg.autoSync ? "Changes update across devices automatically." : "Automatic updates paused on this device."}</div></div>
                            </div>}
                            <div style={{ marginTop: 10, color: "var(--t3)", fontSize: 13 }}>Changes are saved automatically and appear on other logged-in devices.</div>
                        </div>
                        <div className="gc" style={{ marginBottom: 16 }}>
                            <h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>App Install & Offline</h3>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Install Status</div><div style={{ color: installed ? "var(--ok)" : "var(--t1)", fontWeight: 600 }}>{installed ? "Installed" : installEvt ? "Ready to install" : isIosInstall ? "Use Add to Home Screen" : "Install prompt not ready"}</div></div>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Offline Cache</div><div style={{ color: swReady ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{swReady ? "Offline cache active" : "Preparing offline cache"}</div></div>
                                <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Local Data</div><div style={{ color: "var(--t1)", fontWeight: 600 }}>Stored securely on this device for offline use.</div></div>
                            </div>
                            <div className="action-row" style={{ marginTop: 8 }}>
                                {!installed && <button className="bp" onClick={() => void promptInstall()}><Download size={16} /> Install App</button>}
                                <button className="bg" onClick={() => notify(isIosInstall ? "iPhone: Safari -> Share -> Add to Home Screen." : "For best install and file-sharing support, open the app from an HTTPS deployment.", "warning")}><Smartphone size={16} /> Install Help</button>
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
                            <div className="gc"><h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Sync Status</h3>
                                <div style={{ display: "grid", gap: 10 }}>
                                    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Connection</div><div style={{ color: ol ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{ol ? "Online" : "Offline"} · {syncReady ? "Connected" : "Waiting for setup"}</div></div>
                                    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Sync State</div><div style={{ color: syncMeta.syncState === "error" ? "var(--err)" : syncMeta.syncState === "offline" ? "var(--warn)" : "var(--t2)", fontWeight: 600 }}>{syncStateLabel}{syncMeta.pendingSync ? " · pending changes" : ""}</div></div>
                                    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Last Status</div><div style={{ color: "var(--t2)", fontWeight: 600 }}>{sanitizeStatus(syncCfg.lastStatus)}</div></div>
                                    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Last Remote Update</div><div style={{ color: "var(--t2)", fontWeight: 600 }}>{syncMeta.lastRemoteSavedAt ? fmtDateTime(syncMeta.lastRemoteSavedAt) : "Never"}</div></div>
                                    <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.03)" }}><div style={{ color: "var(--t3)", fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Live Updates</div><div style={{ color: "var(--t2)", fontWeight: 600 }}>{syncCfg.autoSync ? "Watching for new changes" : "Paused on this device"}</div></div>
                                </div>
                            </div>

                        </div>
                    </div>}

                </div>

                {confirmDel && <div className="so fi" style={{ zIndex: 999 }}><div style={{ background: "var(--c)", borderRadius: 16, padding: 28, maxWidth: 380, width: "90vw", textAlign: "center", border: "1px solid var(--gbo)" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><AlertCircle size={24} color="var(--err)" /></div>
                    <h3 style={{ color: "var(--t1)", fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{confirmDel._emptyAll ? "Empty Bin?" : confirmDel._permanent ? "Delete Forever?" : "Move to Bin?"}</h3>
                    <p style={{ color: "var(--t3)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                        {confirmDel._emptyAll
                            ? `Permanently delete all ${recycleBinItems.length} item${recycleBinItems.length !== 1 ? "s" : ""} in the bin? This cannot be undone.`
                            : confirmDel._permanent
                                ? <><strong style={{ color: "var(--t1)" }}>{confirmDel.brand} {confirmDel.model}</strong><br />This will permanently delete this device. This cannot be undone.</>
                                : <><strong style={{ color: "var(--t1)" }}>{confirmDel.brand} {confirmDel.model}</strong>{confirmDel.imei ? <><br /><span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11 }}>IMEI: {confirmDel.imei}</span></> : ""}<br />You can restore it later from the Bin.</>}
                    </p>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                        <button className="bg" style={{ padding: "10px 20px" }} onClick={() => setConfirmDel(null)}>Cancel</button>
                        <button className="bd" style={{ padding: "10px 20px" }} onClick={async () => {
                            if (confirmDel._emptyAll) { for (const it of recycleBinItems) await permDelInv(it.id); }
                            else if (confirmDel._permanent) { await permDelInv(confirmDel.id); }
                            else { await delInv(confirmDel.id); sDi(null); }
                            setConfirmDel(null);
                        }}>{confirmDel._emptyAll ? "Empty All" : confirmDel._permanent ? "Delete Forever" : "Delete"}</button>
                    </div>
                </div></div>}

                {scs && <IMEIS onScan={handleScan} onClose={() => setScs(false)} getCameraStream={getCameraStream} releaseCameraLater={releaseCameraLater} />}
                {lb && <LB photos={lb.photos} si={lb.si} onClose={() => sLb(null)} />}
            </div></>
    );
}
