import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { writeFile as writeStorageFile, pickBillsDirectory, clearBillsDirectory, getBillsDirectory, isDirectoryPickerSupported, requestPersistentStorage, storageUsage } from "./pdf-storage.js";
import { BILLS_BACKUP_FILE_NAME, buildBillsBackupCsv, parseBillsBackupCsv } from "./bills-backup.js";
import { resolveInvoiceTheme, normalizeInvoiceCustom, DEFAULT_INVOICE_THEME_ID, INVOICE_THEMES, CUSTOM_THEME_ID, rgbToHex } from "./invoice-themes.js";
import { ensureRupeeFont, isRupeeFontReady, pdfRs } from "./pdf-font.js";
import { BILL_PRO_KEY_HASHES } from "./license-keys.js";
import { b32decode, b32encode, groupsOf, normalizeDeviceId, V2_BODY_LEN, V2_SIG_LEN } from "./license-codec.js";
import {
    Smartphone, Plus, ShoppingCart, TrendingUp, BarChart3, Settings,
    Camera, X, Search, Filter, Edit2, Trash2, Package, IndianRupee,
    ArrowDownCircle, ArrowUpCircle, CheckCircle, AlertCircle, ChevronDown,
    Home, ClipboardList, ScanLine, Eye, FileText, RefreshCw, Wifi, WifiOff,
    User, Phone, Calendar, Hash, Palette, HardDrive, Tag, Layers, LogOut,
    ChevronRight, CreditCard, Banknote, QrCode, Bell,
    ImagePlus, Images, ChevronLeft, ZoomIn, RotateCcw, Upload, Aperture, Battery,
    Download, Share2, Lock, MapPin, Mail, Printer, Zap, Shield, Clock, Wrench, MessageCircle,
    Trash, ArchiveRestore
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, AreaChart, Area } from "recharts";
import { loadAppState, loadSyncState, saveAppState, saveSyncState, savePhotoBlob, loadPhotoBlob, deletePhotoBlob } from "./app-storage.js";
import {
    DRIVE_FOLDER_NAME,
    DriveBackupError, buildBackupPayload, readBackupPayload, mergeBackupPayloads,
    backupFileNameFor, ensureBackupFolder, findBackupFile, listBackupFiles,
    uploadBackup, downloadBackupFile, revokeDriveToken, fetchDriveEmail,
    nextSeriesInvoiceNumber, yymmFor, requestDriveToken,
} from "./drive-backup.js";
import { DRIVE_OAUTH_CLIENT_ID } from "./drive-config.js";

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const localRecord = (record = {}) => Promise.resolve({ ...record, id: record.id || genId() });
const localTransaction = (tx = {}) => Promise.resolve({ ...tx, id: tx.id || genId() });
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const daysInStock = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const fmtCurrency = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtCompactCurrency = (n) => "₹" + new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(Number(n || 0));
const fmtRelativeTime = (value) => {
    const time = new Date(value).getTime();
    if (!time) return "Recently";
    const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};
const fmtDashboardTime = (value) => {
    const date = new Date(value || new Date());
    if (!Number.isFinite(date.getTime())) return "--";
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.round((todayStart - targetStart) / 86400000);
    const dayLabel = dayDiff === 0
        ? "Today"
        : dayDiff === 1
            ? "Yesterday"
            : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const timeLabel = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return `${dayLabel}, ${timeLabel}`;
};
const CONDITIONS = ["New", "Refurbished", "Used"];
const STATUSES = ["In Stock", "Sold", "Deleted"];
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "EMI"];
const BRANDS = ["Samsung", "Apple", "OnePlus", "Xiaomi", "Vivo", "Oppo", "Realme", "Motorola", "Nothing", "Google", "iQOO", "Poco", "Other"];
const REPORT_TYPES = ["All", "Buy", "Sell", "Return", "Add", "Repair"];
const REPORT_RANGE_PRESETS = ["Today", "Yesterday", "This Week", "This Month", "Custom"];
const REPORT_BILL_FILTERS = ["All Bills", "GST", "Regular"];
const REPORT_VIEWS = ["Transactions", "Customer Ledger", "Supplier Summary"];
const REPORT_DUE_FILTERS = ["All Status", "Due Only", "Paid Only"];
const PHOTO_PREVIEW_MAX = 900;
const STOCK_PAGE_SIZE = 18;
const STOCK_PRICE_FILTERS = ["Price Range", "Under 20k", "20k-50k", "50k-100k", "100k+"];
const REPORT_PAGE_SIZE = 24;
const CUSTOM_RAM = "__custom_ram__";
const RAM_PRESETS = ["2GB", "4GB", "6GB", "8GB", "12GB", "16GB", "20GB", "24GB"];
const BUSINESS_MODES = ["general", "repair-pro", "bill-pro"];
const GENERAL_MODULES = ["buy", "sell", "repair"];
const BILL_PRO_MODULES = ["sell"];
const APP_THEME_MODES = ["light", "dark"];
const BILL_PRO_CATEGORIES = ["Mobile Device", "Accessories"];
const BILL_PRO_MOBILE_CATEGORY = "Mobile Device";
const BILL_PRO_ACCESSORY_CATEGORY = "Accessories";
const REPAIR_STATUSES = ["Received", "Ready", "Delivered", "Cancelled"];
const REPAIR_PAYMENT_STATUSES = ["Unpaid", "Advance", "Paid"];
const SHOP_PARTS_SUPPLIERS_META_RE = /\n?\[\[partsSuppliers:([^\]]*)\]\]/i;
const LEGACY_REPAIR_PAYMENT_META_RE = /\n?\[\[paymentStatus:(Paid|Unpaid)\]\]/gi;
const REPAIR_META_RE = /\n?\[\[repairMeta:([^\]]*)\]\]/i;
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
const BILL_TYPES = ["GST", "NON GST"];
const APP_NAME = "PhoneDukaan";
const LEGACY_APP_NAME = "Mobile Dukaan";
const LEGACY_APP_NAME_2 = "Phone Dukaan";
const APP_WORDMARK_SRC = "/phonedukaan-wordmark.svg";
const APP_WORDMARK_FALLBACK = "/pd-icon.png";
const BILL_PRO_DEVICE_LS = "phonedukaan_billpro_device_v1";
const BILL_PRO_ACTIVATION_LS = "phonedukaan_billpro_activation_v1";
// Public half of the seller's licence root. Verifies device-bound BP- keys.
// Safe to publish: it can check signatures but never create them.
const BILL_PRO_PUBLIC_JWK = {
    "kty": "EC",
    "x": "H1tXo23mh0rijU4sEwP-4ot342mr95x4I4jGvTBrSqc",
    "y": "O2Nh9S_BNkqqwcx9Eu5vT2vhUKf1TUyKjyXVftaJta4",
    "crv": "P-256"
};
const BILL_PRO_ONBOARDED_LS = "phonedukaan_billpro_onboarded_v1";
const isDefaultShopValue = (value, def) => { const v = String(value || "").trim(); return !v || v === def; };

// ── LICENSE ACTIVATION ──────────────────────────────────────────────────────
// The device ID must be reproducible after the customer deletes and reinstalls
// the app, otherwise their lifetime activation code stops verifying. It is
// derived from stable hardware signals instead of Math.random(). Authenticity
// still comes from the ECDSA signature, so this only has to be unique.
const DEVICE_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const billProFingerprintSource = () => {
    const rawUA = typeof navigator === "undefined" ? "" : String(navigator.userAgent || "");
    // Everything that changes when Chrome auto-updates or an OTA lands has to
    // go, otherwise the device ID moves while the customer keeps the same phone.
    const ua = rawUA
        .replace(/\b(Chrome|CriOS|Version|Edg|OPR|Firefox|FxiOS|SamsungBrowser|GSA)\/[\d.]+/g, "$1")
        .replace(/\b(AppleWebKit|Safari)\/[\d.]+/g, "$1")
        .replace(/\bAndroid\s+\d+(?:\.\d+)?\b/g, "Android")
        .replace(/\bVersion\s+[\d.]+/g, "Version")
        .replace(/\bBuild\/[^\s;)]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
    let timezone = "";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { }
    const screenPart = typeof screen === "undefined"
        ? ""
        : [screen.width, screen.height, screen.colorDepth].filter(Boolean).join("x");
    const dpr = typeof window === "undefined" ? "" : String(window.devicePixelRatio || "");
    const touch = typeof navigator === "undefined" ? "" : String(navigator.maxTouchPoints || 0);
    const lang = typeof navigator === "undefined" ? "" : String(navigator.language || "");
    return ["v1", screenPart, dpr, touch, ua, timezone, lang].join("|");
};
// cyrb53-style 53-bit string hash. Bit operations stay correct here because
// bytes are peeled off with division rather than shifts.
const hash53 = (text, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
const billProDeviceIdFromFingerprint = (source) => {
    const bytes = [];
    for (let i = 0; i < 3; i++) {
        let value = Math.floor(hash53(source, i * 0x9e3779b9));
        for (let b = 0; b < 5; b++) {
            bytes.push(value & 0xff);
            value = Math.floor(value / 256);
        }
    }
    let out = "";
    let bitBuffer = 0;
    let bitCount = 0;
    for (const byte of bytes) {
        bitBuffer = (bitBuffer << 8) | byte;
        bitCount += 8;
        while (bitCount >= 5) {
            out += DEVICE_ID_ALPHABET[(bitBuffer >>> (bitCount - 5)) & 31];
            bitCount -= 5;
        }
        if (out.length >= 12) break;
    }
    return `BP-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
};
const DEVICE_FINGERPRINT_SEED_LS = "pd_device_fp_seed_v1";
const ensureFingerprintSeed = () => {
    try {
        let seed = String(window.localStorage.getItem(DEVICE_FINGERPRINT_SEED_LS) || "").trim();
        if (!seed) {
            seed = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
            window.localStorage.setItem(DEVICE_FINGERPRINT_SEED_LS, seed);
        }
        return seed;
    } catch { return ""; }
};
const deriveBillProDeviceId = () => {
    try {
        let source = billProFingerprintSource();
        const seed = ensureFingerprintSeed();
        if (seed) source = `${source}|${seed}`;
        return billProDeviceIdFromFingerprint(source);
    } catch {
        const chunk = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
        return `BP-${chunk()}-${chunk()}-${chunk()}`;
    }
};
const ensureBillProDeviceId = () => {
    if (typeof window === "undefined" || !window.localStorage) return deriveBillProDeviceId();
    const stored = String(window.localStorage.getItem(BILL_PRO_DEVICE_LS) || "").trim().toUpperCase();
    const activation = loadBillProActivationRecord();
    const storedIsActive = Boolean(stored && activation?.payload?.deviceId
        && String(activation.payload.deviceId).trim().toUpperCase() === stored);
    // Keep an old random ID only when a licence is already bound to it, so
    // existing buyers keep working. Everyone else moves to the derived ID.
    const next = storedIsActive ? stored : deriveBillProDeviceId();
    if (next !== stored) window.localStorage.setItem(BILL_PRO_DEVICE_LS, next);
    return next;
};
const loadBillProActivationRecord = () => {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(BILL_PRO_ACTIVATION_LS) || "null");
        if (!parsed?.payload?.deviceId || parsed?.payload?.edition !== "bill-pro") return null;
        return parsed;
    } catch {
        return null;
    }
};
// Licence keys are checked offline against a bundled set of SHA-256 hashes.
// The hashes are safe to ship: they cannot be reversed into the keys, so a
// copied bundle never hands out working keys.
const normalizeBillProKey = (value = "") => {
    const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (compact.startsWith("BP") && compact.length > 14) {
        const body = compact.slice(2).replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0");
        if (body.length !== V2_BODY_LEN || !/^[0-9A-Z]+$/.test(body)) return "";
        return `BP-${groupsOf(body, 5)}`;
    }
    let body = "";
    if (compact.length === 14 && compact.startsWith("PD")) body = compact.slice(2);
    else if (compact.length === 12) body = compact;
    if (!/^[A-Z0-9]{12}$/.test(body)) return "";
    return `PD-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
};
const formatBillProKeyInput = (value = "") => {
    const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (compact.startsWith("BP")) {
        const body = compact.slice(2).slice(0, V2_BODY_LEN);
        if (!body) return "BP-";
        const groups = body.match(/.{1,5}/g) || [];
        return ["BP", ...groups].join("-");
    }
    const body = compact.replace(/^PD/, "").slice(0, 12);
    if (!body) return "";
    const groups = body.match(/.{1,4}/g) || [];
    return ["PD", ...groups].join("-");
};
const hashBillProKey = async (key) => {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(key || "")));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
};
const verifyBillProKeyV2 = async (rawKey, overrides = {}) => {
    const key = normalizeBillProKey(rawKey);
    if (!key || !key.startsWith("BP-")) throw new Error("Device keys look like BP-… (long). Paste the full key from your seller.");
    const body = key.slice(3).replace(/-/g, "");
    const deviceId = body.slice(0, 12);
    const sigChars = body.slice(12);
    if (sigChars.length !== V2_SIG_LEN) throw new Error("That licence key is incomplete. Paste the full key from your seller.");
    const sigBytes = b32decode(sigChars);
    if (!sigBytes || sigBytes.length !== 64) throw new Error("That licence key is not valid. Check it against your key slip and try again.");
    // Compare against the freshly derived hardware ID, never the stored one,
    // so editing local storage cannot move a key to another phone.
    const thisDevice = normalizeDeviceId(overrides.deviceId || deriveBillProDeviceId());
    if (!thisDevice) throw new Error("Could not read this phone's Device ID. Restart the app and try again.");
    if (deviceId !== thisDevice) throw new Error(`This key belongs to device BP-${groupsOf(deviceId, 4)}. Your device is BP-${groupsOf(thisDevice, 4)}. Ask your seller for a key issued to this device.`);
    let ok = false;
    try {
        const pub = await window.crypto.subtle.importKey("jwk", overrides.publicJwk || BILL_PRO_PUBLIC_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        ok = await window.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sigBytes, new TextEncoder().encode(deviceId));
    } catch {
        ok = false;
    }
    if (!ok) throw new Error("That licence key is not valid. Check it against your key slip and try again.");
    return key;
};
const verifyBillProKey = async (rawKey) => {
    const key = normalizeBillProKey(rawKey);
    if (!key) throw new Error("Licence keys look like PD-XXXX-XXXX-XXXX.");
    if (key.startsWith("BP-")) return verifyBillProKeyV2(rawKey);
    const digest = await hashBillProKey(key);
    if (!BILL_PRO_KEY_HASHES.has(digest)) throw new Error("That licence key is not valid. Check it against your key slip and try again.");
    return key;
};
const STORAGE_PRESETS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];
const CUSTOM_STORAGE = "__custom__";
const cleanImei = (v = "") => String(v || "").replace(/\D/g, "").slice(0, 15);
const fmtBytes = (bytes = 0) => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
const cleanMobileNumber = (v = "") => {
    const digits = String(v || "").replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
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

const fmtDateTime = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const normalizeDateInput = (value, fallback = "") => {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? fallback : isoDate(parsed);
};
const decodeMetaPayload = (value = "") => {
    try {
        return JSON.parse(decodeURIComponent(String(value || "")));
    } catch {
        return null;
    }
};
const normalizePartSupplier = (item = {}) => ({
    id: String(item.id || genId()),
    name: String(item.name || item.label || "").trim(),
    phone: cleanMobileNumber(item.phone || ""),
    address: String(item.address || "").trim(),
    notes: String(item.notes || "").trim(),
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: String(item.updatedAt || new Date().toISOString()),
});
const parsePartsSuppliersMeta = (text = "") => {
    const match = String(text || "").match(SHOP_PARTS_SUPPLIERS_META_RE);
    const parsed = decodeMetaPayload(match?.[1] || "");
    return Array.isArray(parsed) ? parsed.map(normalizePartSupplier).filter(item => item.name) : [];
};
const stripPartsSuppliersMeta = (text = "") => String(text || "").replace(SHOP_PARTS_SUPPLIERS_META_RE, "").trim();
const parseRepairMeta = (notes = "") => {
    const metaMatch = String(notes || "").match(REPAIR_META_RE);
    const parsed = decodeMetaPayload(metaMatch?.[1] || "") || {};
    const legacyPaymentMatch = String(notes || "").match(/\[\[paymentStatus:(Paid|Unpaid)\]\]/i);
    if (!parsed.paymentStatus && legacyPaymentMatch?.[1]) parsed.paymentStatus = legacyPaymentMatch[1];
    return parsed;
};
const stripRepairMeta = (notes = "") => String(notes || "").replace(REPAIR_META_RE, "").replace(LEGACY_REPAIR_PAYMENT_META_RE, "").trim();
const pdfSafe = (v = "") => String(v ?? "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const isPresetStorage = (v = "") => STORAGE_PRESETS.includes(String(v || "").trim());
const fmtSpecs = (ram = "", storage = "") => [String(ram || "").trim(), String(storage || "").trim()].filter(Boolean).join(" / ") || "-";
const roundMoney = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const formatMoney = (n) => Number(roundMoney(n)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtRs = (n) => `₹${formatMoney(n)}`;
const stripRepairPaymentMeta = (value = "") => stripRepairMeta(value);
const getRepairPaymentStatus = (paymentStatus = "", notes = "") => {
    const normalized = String(paymentStatus || "").trim();
    if (REPAIR_PAYMENT_STATUSES.includes(normalized)) return normalized;
    return parseRepairMeta(notes).paymentStatus || "Unpaid";
};
const getRepairPartCost = (partCost = 0, notes = "") => {
    const direct = Number(partCost || 0);
    if (direct > 0) return direct;
    return Number(parseRepairMeta(notes).partCost || 0);
};
const getRepairPartSupplierId = (partSupplierId = "", notes = "") => String(partSupplierId || parseRepairMeta(notes).partSupplierId || "").trim();
const getRepairPartSupplierName = (partSupplierName = "", notes = "") => String(partSupplierName || parseRepairMeta(notes).partSupplierName || "").trim();
const resolveRepairPaymentStatus = (paymentStatus, advance = 0, amount = 0) => {
    const normalized = REPAIR_PAYMENT_STATUSES.includes(String(paymentStatus || "").trim()) ? String(paymentStatus).trim() : "Unpaid";
    const advanceAmount = Number(advance || 0);
    const totalAmount = Number(amount || 0);
    if (totalAmount > 0 && advanceAmount >= totalAmount) return "Paid";
    if (advanceAmount > 0) return normalized === "Paid" ? "Paid" : "Advance";
    return normalized === "Advance" || normalized === "Paid" ? "Unpaid" : normalized;
};
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
const getTxQty = (item = {}) => Math.max(1, Number(item.qty || 1) || 1);
const isBillProMobileCategory = (value = "") => String(value || "").trim() === BILL_PRO_MOBILE_CATEGORY;
const getTxItemLabel = (item = {}) => {
    const explicit = String(item.itemLabel || "").trim();
    if (explicit) return explicit;
    const deviceLabel = [item.brand, item.model].filter(Boolean).join(" ").trim();
    if (deviceLabel) return deviceLabel;
    const category = String(item.category || "").trim();
    return category || "Item";
};
const getTxItemContext = (item = {}) => {
    if (String(item.itemLabel || "").trim() && !isBillProMobileCategory(item.category)) {
        return [
            item.category ? `Category: ${item.category}` : "",
            getTxQty(item) > 1 ? `Qty ${getTxQty(item)}` : "",
            item.serialNo ? `Code ${item.serialNo}` : "",
        ].filter(Boolean).join(" · ") || "Manual invoice item";
    }
    const deviceDetails = [
        item.color || "",
        fmtSpecs(item.ram, item.storage) !== "-" ? fmtSpecs(item.ram, item.storage) : "",
        item.condition ? `Condition: ${item.condition}` : "",
    ].filter(Boolean).join(" · ");
    return deviceDetails || (item.customerName || "Walk-in Customer");
};
const getTxReportExtra = (item = {}) => {
    if (String(item.itemLabel || "").trim() && !isBillProMobileCategory(item.category)) {
        return [
            item.category ? `Category: ${item.category}` : "",
            getTxQty(item) > 1 ? `Qty ${getTxQty(item)}` : "",
            item.serialNo ? `Code ${item.serialNo}` : "",
        ].filter(Boolean).join(" · ");
    }
    return [
        item.color ? `Color: ${item.color}` : "",
        fmtSpecs(item.ram, item.storage) !== "-" ? `Specs: ${fmtSpecs(item.ram, item.storage)}` : "",
        item.condition ? `Condition: ${item.condition}` : "",
    ].filter(Boolean).join(" · ");
};
const getTxIdentityLines = (item = {}) => {
    const lines = [];
    if (item.imei) lines.push(`IMEI 1: ${item.imei}`);
    if (item.imei2) lines.push(`IMEI 2: ${item.imei2}`);
    if (!item.imei && item.serialNo) lines.push(`Code: ${item.serialNo}`);
    if (getTxQty(item) > 1) lines.push(`Quantity: ${getTxQty(item)}`);
    return lines;
};
const getSaleProfitAmount = (sale = {}) => Number((sale.billType === "GST" ? sale.taxableAmount : sale.amount) || sale.amount || 0) - Number(sale.costPrice || 0);
const pickText = (value, fallback = "") => value === undefined || value === null ? fallback : String(value);
const migrateLegacyName = (value, fallback = APP_NAME) => {
    const text = pickText(value, fallback);
    return (text === LEGACY_APP_NAME || text === LEGACY_APP_NAME_2) ? APP_NAME : text;
};
// Warranty-service note shown on sale invoices in English plus the shop's
// chosen Indian languages. All strings are fixed (not shop-editable).
const WARRANTY_NOTE_EN = "For mobile warranty service, customers must visit the authorized service centre themselves.";
const WARRANTY_NOTE_LANGS = [
    { id: "hi", label: "Hindi", text: "मोबाईल की वारंटी सर्विस के लिए ग्राहक को स्वयं अधिकृत सर्विस सेंटर जाना होगा।" },
    { id: "mr", label: "Marathi", text: "मोबाईलच्या वॉरंटी सेवेसाठी ग्राहकाने स्वतः अधिकृत सर्व्हिस सेंटरला जाणे आवश्यक आहे." },
    { id: "bn", label: "Bengali", text: "মোবাইলের ওয়ারেন্টি সার্ভিসের জন্য গ্রাহককে নিজে অনুমোদিত সার্ভিস সেন্টারে যেতে হবে।" },
    { id: "gu", label: "Gujarati", text: "મોબાઈલની વોરંટી સર્વિસ માટે ગ્રાહકે પોતે અધિકૃત સર્વિસ સેન્ટર જવું જરૂરી છે." },
    { id: "pa", label: "Punjabi", text: "ਮੋਬਾਈਲ ਵਾਰੰਟੀ ਸਰਵਿਸ ਲਈ ਗਾਹਕ ਨੂੰ ਖੁਦ ਪ੍ਰਮਾਣਿਤ ਸਰਵਿਸ ਸੈਂਟਰ ਜਾਣਾ ਜ਼ਰੂਰੀ ਹੈ।" },
    { id: "ta", label: "Tamil", text: "மொபைல் வாரண்டி சேவைக்கு வாடிக்கையாளர் நேரடியாக அங்கீகரிக்கப்பட்ட சேவை மையத்திற்கு வர வேண்டும்." },
    { id: "te", label: "Telugu", text: "మొబైల్ వారంటీ సేవ కోసం కస్టమర్ తానే అధీకృత సర్వీస్ సెంటర్‌కు వెళ్లాలి." },
    { id: "kn", label: "Kannada", text: "ಮೊಬೈಲ್ ವಾರಂಟಿ ಸೇವೆಗಾಗಿ ಗ್ರಾಹಕರು ಸ್ವತಃ ಅಧಿಕೃತ ಸೇವಾ ಕೇಂದ್ರಕ್ಕೆ ಭೇಟಿ ನೀಡಬೇಕಾಗುತ್ತದೆ." },
    { id: "ml", label: "Malayalam", text: "മൊബൈൽ വാറന്റി സർവീസിനായി ഉപഭോക്താവ് സ്വയം അംഗീകൃത സർവീസ് സെന്ററിൽ എത്തണം." },
    { id: "or", label: "Odia", text: "ମୋବାଇଲ୍ ୱାରେଣ୍ଟି ସେବା ପାଇଁ ଗ୍ରାହକ ନିଜେ ଅନୁମୋଦିତ ସର୍ଭିସ୍ ସେଣ୍ଟରକୁ ଯିବା ଆବଶ୍ୟକ।" },
    { id: "as", label: "Assamese", text: "মোবাইলৰ ৱাৰেণ্টি চাৰ্ভিচৰ বাবে গ্ৰাহকে নিজে প্ৰমাণিত চাৰ্ভিচ কেন্দ্ৰলৈ যাব লাগিব।" },
    { id: "ur", label: "Urdu", text: "موبائل کی وارنٹی سروس کے لیے گاہک کو خود سروس سینٹر جانا ہوگا۔" },
];
const WARRANTY_NOTE_LANG_IDS = WARRANTY_NOTE_LANGS.map(l => l.id);
const DEFAULT_WARRANTY_LANGS = ["hi", "mr"];
const normalizeWarrantyLangs = (value) => Array.isArray(value)
    ? Array.from(new Set(value.map(v => String(v || "").trim()).filter(v => WARRANTY_NOTE_LANG_IDS.includes(v))))
    : [...DEFAULT_WARRANTY_LANGS];
const DEFAULT_SHOP_PROFILE = {
    warrantyLangs: [...DEFAULT_WARRANTY_LANGS],
    invoiceLayout: "vertical",
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
    businessMode: "general",
    enabledModules: GENERAL_MODULES,
    appTheme: "light",
    partsSuppliers: [],
};

const normalizeShopProfile = (cfg = {}) => ({
    shopName: migrateLegacyName(cfg.shopName, DEFAULT_SHOP_PROFILE.shopName),
    legalName: migrateLegacyName(cfg.legalName, cfg.shopName ?? DEFAULT_SHOP_PROFILE.legalName),
    ownerName: pickText(cfg.ownerName, ""),
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
    invoiceTheme: pickText(cfg.invoiceTheme, DEFAULT_INVOICE_THEME_ID),
    invoiceCustom: normalizeInvoiceCustom(cfg.invoiceCustom),
    invoiceLayout: cfg.invoiceLayout === "horizontal" || cfg.invoiceLayout === "landscape" ? "horizontal" : "vertical",
    warrantyLangs: normalizeWarrantyLangs(cfg.warrantyLangs),
    stickerShowPrice: cfg.stickerShowPrice === undefined ? true : !!cfg.stickerShowPrice,
    footer: pickText(cfg.footer, DEFAULT_SHOP_PROFILE.footer),
    terms: stripPartsSuppliersMeta(pickText(cfg.terms, DEFAULT_SHOP_PROFILE.terms)),
    businessMode: BUSINESS_MODES.includes(String(cfg.businessMode || "").trim()) ? String(cfg.businessMode).trim() : DEFAULT_SHOP_PROFILE.businessMode,
    enabledModules: Array.from(new Set((Array.isArray(cfg.enabledModules) ? cfg.enabledModules : GENERAL_MODULES).map(v => String(v || "").trim()).filter(v => GENERAL_MODULES.includes(v)))).length
        ? Array.from(new Set((Array.isArray(cfg.enabledModules) ? cfg.enabledModules : GENERAL_MODULES).map(v => String(v || "").trim()).filter(v => GENERAL_MODULES.includes(v))))
        : GENERAL_MODULES,
    appTheme: (() => {
        const value = String(cfg.appTheme || "").trim();
        if (value === "dark" || value === "midnight") return "dark";
        return APP_THEME_MODES.includes(value) ? value : DEFAULT_SHOP_PROFILE.appTheme;
    })(),
    partsSuppliers: (Array.isArray(cfg.partsSuppliers) ? cfg.partsSuppliers : parsePartsSuppliersMeta(cfg.terms)).map(normalizePartSupplier).filter(item => item.name),
});
const resolveSignupProfile = (value = "general") => {
    if (value === "buy") return { businessMode: "general", enabledModules: ["buy"] };
    if (value === "sell") return { businessMode: "general", enabledModules: ["sell"] };
    if (value === "repair") return { businessMode: "general", enabledModules: ["repair"] };
    if (value === "repair-pro") return { businessMode: "repair-pro", enabledModules: ["repair"] };
    if (value === "bill-pro") return { businessMode: "bill-pro", enabledModules: BILL_PRO_MODULES };
    return { businessMode: "general", enabledModules: GENERAL_MODULES };
};
const getEnabledModules = (shop = DEFAULT_SHOP_PROFILE) => {
    const normalized = normalizeShopProfile(shop);
    if (normalized.businessMode === "repair-pro") return ["repair"];
    if (normalized.businessMode === "bill-pro") return BILL_PRO_MODULES;
    return normalized.enabledModules;
};
const FINANCE_SETTLEMENT_STATES = ["Pending", "Settled"];
const createEmptyForm = (shop = DEFAULT_SHOP_PROFILE) => ({ imei: "", imei2: "", brand: "Samsung", model: "", color: "", ram: "", storage: "128GB", batteryHealth: "", condition: "New", buyPrice: "", sellPrice: "", status: "In Stock", qty: "1", supplier: "", customerName: "", phone: "", customerAddress: "", salesman: "", amount: "", paidAmount: "", dueAmount: "0", paymentMode: "Cash", financeProvider: "", loanReference: "", financeTenureMonths: "", financeSettlement: "Pending", notes: "", photos: [], sellerName: "", sellerPhone: "", sellerAadhaarNumber: "", purchaseDate: isoDate(), sellerAgreementAccepted: false, sellerIdPhotoData: "", sellerPhotoData: "", sellerSignatureData: "", warrantyType: "1 Year Warranty", warrantyMonths: "", billType: shop.defaultBillType || "NON GST", gstRate: String(shop.defaultGstRate || 18) });
const createEmptyBillProForm = (shop = DEFAULT_SHOP_PROFILE) => ({
    customerName: "",
    phone: "",
    customerAddress: "",
    salesman: "",
    itemLabel: "",
    category: BILL_PRO_MOBILE_CATEGORY,
    brand: "",
    model: "",
    color: "",
    ram: "",
    storage: "",
    condition: "New",
    imei: "",
    imei2: "",
    serialNo: "",
    qty: "1",
    amount: "",
    paidAmount: "",
    dueAmount: "0",
    paymentMode: "Cash",
    financeProvider: "",
    loanReference: "",
    financeTenureMonths: "",
    financeSettlement: "Pending",
    billType: shop.defaultBillType || "NON GST",
    gstRate: String(shop.defaultGstRate || 18),
    notes: "",
});
const createEmptyBillProStickerForm = () => ({
    itemLabel: "",
    category: BILL_PRO_MOBILE_CATEGORY,
    brand: "",
    model: "",
    color: "",
    ram: "",
    storage: "",
    condition: "New",
    imei: "",
    imei2: "",
    code: "",
    price: "",
    copies: "1",
});
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
const DEVICE_SERIES_KEY = "pd_device_series_v1";
const normalizeDeviceSeries = (value) => String(value || "").trim().toUpperCase().match(/^[A-Z]$/)?.[0] || "";
const readDeviceSeries = () => {
    if (typeof window === "undefined") return "";
    try { return normalizeDeviceSeries(window.localStorage.getItem(DEVICE_SERIES_KEY)); } catch { return ""; }
};
const makeInvoiceNo = (tx, prefix = DEFAULT_SHOP_PROFILE.invoicePrefix) => {
    const series = readDeviceSeries();
    if (series) return nextSeriesInvoiceNumber(tx, prefix, series, yymmFor());
    const now = new Date();
    return `${prefix}-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(tx.filter(t => t.type === "Sell").length + 1).padStart(4, "0")}`;
};
const WARRANTY_TYPES = ["No Warranty", "Testing Warranty", "1 Year Warranty"];
const ADD_DRAFT_KEY = "pd_add_draft_v1";
const ADD_FLOW_STEPS = [
    { id: "photos", label: "Photos", title: "Product Photos", subtitle: "Add clear photos of the handset, box, and accessories.", cta: "Continue to Device Info" },
    { id: "device", label: "Device Info", title: "Device Details", subtitle: "Enter technical specifications and identifiers.", cta: "Continue to Pricing" },
    { id: "pricing", label: "Pricing", title: "Pricing & Warranty", subtitle: "Set the sell price, warranty setup, and stock context.", cta: "Save Stock" },
];
const ADD_CONDITION_CHIPS = [
    { value: "New", label: "Brand New" },
    { value: "Refurbished", label: "Refurbished" },
    { value: "Used", label: "Pre-owned" },
];
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
    addedDate: normalizeDateInput(it.addedDate, new Date().toISOString().slice(0, 10)),
    supplier: it.supplier || "",
    photos: Array.isArray(it.photos) ? it.photos.map(normalizePhotoRef) : [],
    sellerName: it.sellerName || "",
    sellerPhone: it.sellerPhone || "",
    sellerAadhaarNumber: it.sellerAadhaarNumber || "",
    purchaseDate: normalizeDateInput(it.purchaseDate, ""),
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
    customerAddress: String(it.customerAddress || "").trim(),
    salesman: String(it.salesman || "").trim(),
    itemLabel: String(it.itemLabel || "").trim(),
    category: String(it.category || "").trim(),
    serialNo: String(it.serialNo || "").trim(),
    qty: getTxQty(it),
    amount: Number(it.amount || 0),
    paidAmount: Number(it.paidAmount ?? it.amount ?? 0),
    dueAmount: Number(it.dueAmount || 0),
    costPrice: Number(it.costPrice || 0),
    paymentMode: it.paymentMode || "Cash",
    financeProvider: String(it.financeProvider || "").trim(),
    loanReference: String(it.loanReference || "").trim(),
    financeTenureMonths: Number(it.financeTenureMonths || 0),
    financeSettlement: String(it.financeSettlement || "").trim() === "Settled" ? "Settled" : "Pending",
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
    returnOfTxId: String(it.returnOfTxId || "").trim(),
    returnOfInvoiceNo: String(it.returnOfInvoiceNo || "").trim(),
    refundAmount: Number(it.refundAmount || 0),
    refundMode: it.refundMode || it.paymentMode || "Cash",
    returnReason: String(it.returnReason || "").trim(),
    returnedAt: it.returnedAt || "",
    invoiceNoOriginal: String(it.invoiceNoOriginal || "").trim(),
    whatsAppMessageAt: it.whatsAppMessageAt || "",
    whatsAppPdfAt: it.whatsAppPdfAt || "",
    pdfSavedAt: it.pdfSavedAt || "",
    pdfFileName: it.pdfFileName || "",
    shopSnapshot: it.shopSnapshot ? normalizeShopProfile(it.shopSnapshot) : null,
});
const normalizeRepair = (it = {}) => ({
    id: it.id || genId(),
    repairNo: String(it.repairNo || `RPR-${String(it.id || genId()).slice(-6).toUpperCase()}`),
    customerName: String(it.customerName || "").trim(),
    phone: cleanMobileNumber(it.phone || ""),
    brand: String(it.brand || "").trim(),
    model: String(it.model || "").trim(),
    color: String(it.color || "").trim(),
    imei: cleanImei(it.imei || it.imei1),
    problem: String(it.problem || "").trim(),
    estimatedCost: Number(it.estimatedCost || 0),
    advance: Number(it.advance || 0),
    finalCost: Number(it.finalCost || 0),
    partCost: Number(getRepairPartCost(it.partCost, it.notes) || 0),
    partSupplierId: getRepairPartSupplierId(it.partSupplierId, it.notes),
    partSupplierName: getRepairPartSupplierName(it.partSupplierName, it.notes),
    status: REPAIR_STATUSES.includes(String(it.status || "").trim()) ? String(it.status).trim() : "Received",
    paymentStatus: getRepairPaymentStatus(it.paymentStatus, it.notes),
    receivedDate: normalizeDateInput(it.receivedDate, isoDate()),
    deliveredDate: normalizeDateInput(it.deliveredDate, ""),
    notes: stripRepairPaymentMeta(it.notes),
    photos: Array.isArray(it.photos) ? it.photos.map(normalizePhotoRef) : [],
    createdAt: it.createdAt || new Date().toISOString(),
    updatedAt: it.updatedAt || new Date().toISOString(),
});
const createEmptyRepairForm = () => ({
    id: "",
    repairNo: "",
    customerName: "",
    phone: "",
    brand: "Samsung",
    model: "",
    color: "",
    imei: "",
    problem: "",
    estimatedCost: "",
    advance: "",
    finalCost: "",
    partCost: "",
    partSupplierId: "",
    partSupplierName: "",
    status: "Received",
    paymentStatus: "Unpaid",
    receivedDate: isoDate(),
    deliveredDate: "",
    notes: "",
    photos: [],
});
const createEmptyPartSupplier = () => ({ id: "", name: "", phone: "", address: "", notes: "" });
const loadStore = () => {
    if (typeof window === "undefined") return { inv: DEMO_INVENTORY.map(normalizeInv), tx: DEMO_TX.map(normalizeTx), repairs: [], shop: normalizeShopProfile(DEFAULT_SHOP_PROFILE) };
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
        if (raw?.inv && raw?.tx) return { inv: raw.inv.map(normalizeInv), tx: raw.tx.map(normalizeTx), repairs: Array.isArray(raw.repairs) ? raw.repairs.map(normalizeRepair) : [], shop: normalizeShopProfile(raw.shop || raw.shopProfile || DEFAULT_SHOP_PROFILE) };
    } catch { }
    return { inv: DEMO_INVENTORY.map(normalizeInv), tx: DEMO_TX.map(normalizeTx), repairs: [], shop: normalizeShopProfile(DEFAULT_SHOP_PROFILE) };
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
const DRIVE_CFG_KEY = "pd_drive_cfg_v1";
const normalizeDriveCfg = (cfg = {}) => ({
    connected: !!cfg.connected,
    accountEmail: String(cfg.accountEmail || ""),
    folderId: String(cfg.folderId || ""),
    fileId: String(cfg.fileId || ""),
    autoBackup: cfg.autoBackup === undefined ? true : !!cfg.autoBackup,
    lastPushAt: String(cfg.lastPushAt || ""),
    lastPullAt: String(cfg.lastPullAt || ""),
    lastStatus: String(cfg.lastStatus || "Not connected"),
    lastError: String(cfg.lastError || ""),
});
const loadDriveCfg = () => {
    if (typeof window === "undefined") return normalizeDriveCfg();
    try { return normalizeDriveCfg(JSON.parse(window.localStorage.getItem(DRIVE_CFG_KEY) || "null") || {}); } catch { return normalizeDriveCfg(); }
};
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
const makeRepairWhatsAppText = (repair, shop) => {
    const amount = repair.finalCost || repair.estimatedCost || 0;
    const due = repair.paymentStatus === "Paid" ? 0 : Math.max(amount - (repair.advance || 0), 0);
    const statusLine = repair.status === "Received"
        ? "Your device has been received for repair."
        : repair.status === "Ready"
            ? "Your device repair is complete and ready for pickup."
            : repair.status === "Delivered"
                ? "Your repaired device has been delivered successfully."
                : "Your repair request has been cancelled. Please contact us for help.";
    return `${shop.shopName}\nRepair ID: ${repair.repairNo || "Repair Job"}\n${statusLine}\nDevice: ${[repair.brand, repair.model].filter(Boolean).join(" ") || "Device"}${repair.problem ? `\nIssue: ${repair.problem}` : ""}${repair.imei ? `\nIMEI: ${repair.imei}` : ""}${repair.receivedDate ? `\nReceived: ${fmtDate(repair.receivedDate)}` : ""}${amount ? `\nAmount: ${fmtRs(amount)}` : ""}${repair.advance ? `\nAdvance: ${fmtRs(repair.advance)}` : ""}${due ? `\nDue: ${fmtRs(due)}` : ""}`;
};
const makeInvoiceText = (sale, shop) => {
    const itemLabel = getTxItemLabel(sale);
    const itemContext = getTxReportExtra(sale);
    const identityLines = getTxIdentityLines(sale);
    const isReturn = sale.type === "Return";
    const total = isReturn ? Number(sale.refundAmount || sale.totalAmount || sale.amount || 0) : Number(sale.totalAmount || sale.amount || 0);
    const originalLine = isReturn && (sale.returnOfInvoiceNo || sale.invoiceNoOriginal) ? `\nOriginal Invoice: ${sale.returnOfInvoiceNo || sale.invoiceNoOriginal}` : "";
    const reasonLine = isReturn && sale.returnReason ? `\nReason: ${sale.returnReason}` : "";
    return `${shop.shopName} ${sale.invoiceNo || "Invoice"}\n${isReturn ? "Return Invoice" : sale.billType === "GST" ? "GST Invoice" : "Invoice"}${originalLine}\n${itemLabel}${itemContext ? `\n${itemContext}` : ""}${identityLines.length ? `\n${identityLines.join("\n")}` : ""}\n${isReturn ? "Refund" : "Total"}: ${fmtRs(total)}${sale.billType === "GST" ? `\nTaxable: ${fmtRs(sale.taxableAmount)}\nGST: ${fmtRs(sale.gstAmount)}` : ""}${!isReturn && sale.paymentMode === "EMI" ? `\nFinance Provider: ${sale.financeProvider || "-"}\nLoan Reference: ${sale.loanReference || "-"}\nTenure: ${sale.financeTenureMonths || "-"} Months\nDown Payment: ${fmtRs(Number(sale.paidAmount || 0))}\nFinanced Amount: ${fmtRs(Number(sale.dueAmount || 0))}` : ""}${sale.dueAmount && !isReturn ? `\nDue: ${fmtRs(sale.dueAmount)}` : ""}${reasonLine}`;
};

// ─── Invoice warranty note (bilingual / multilingual) ────────────────────────
// Indic scripts cannot be shaped by jsPDF's built-in fonts, so each language
// line is drawn on an HTML canvas (the browser shapes Devanagari/Urdu/etc.
// correctly with system fonts) and embedded as a PNG image.
const WARRANTY_NOTE_FONT_MM = 2.6;     // ~7.4pt, close to the 8pt body text
const WARRANTY_NOTE_LINE_MM = 3.6;
const invoiceNoteImageCache = new Map();
const NOTE_FONT_STACK = '"Noto Sans Devanagari","Noto Sans","Nirmala UI","Segoe UI",sans-serif';
const renderWarrantyNoteImage = (label, text, maxMmWidth, colorCss) => {
    if (typeof document === "undefined") return null;
    const key = `${label || ""}\u0000${text}\u0000${Math.round(maxMmWidth * 4) / 4}\u0000${colorCss}`;
    if (invoiceNoteImageCache.has(key)) return invoiceNoteImageCache.get(key);
    let out = null;
    try {
        const PX_PER_MM = 12;
        const fontPx = Math.max(24, Math.round(WARRANTY_NOTE_FONT_MM * PX_PER_MM));
        const linePx = Math.round(WARRANTY_NOTE_LINE_MM * PX_PER_MM);
        const canvas = document.createElement("canvas");
        const measureCtx = canvas.getContext("2d");
        const fontSpec = `${fontPx}px ${NOTE_FONT_STACK}`;
        const boldSpec = `700 ${fontPx}px ${NOTE_FONT_STACK}`;
        measureCtx.font = fontSpec;
        const maxWidthPx = Math.max(maxMmWidth, 20) * PX_PER_MM;
        measureCtx.font = boldSpec;
        const labelPart = label ? `${label}: ` : "";
        const labelW = labelPart ? Math.ceil(measureCtx.measureText(labelPart).width) : 0;
        measureCtx.font = fontSpec;
        const words = String(text || "").split(/\s+/).filter(Boolean);
        const lines = [];
        let current = "";
        let currentW = 0;
        let budget = maxWidthPx - labelW;
        for (const word of words) {
            const testW = measureCtx.measureText(current ? `${current} ${word}` : word).width;
            if (current && testW > budget) {
                lines.push({ text: current, w: currentW });
                current = word;
                currentW = measureCtx.measureText(word).width;
                budget = maxWidthPx;
            } else {
                current = current ? `${current} ${word}` : word;
                currentW = testW;
            }
        }
        if (current) lines.push({ text: current, w: currentW });
        if (!lines.length) return null;
        const widest = Math.max(labelW + lines[0].w, ...lines.slice(1).map(l => l.w));
        const isRtl = label === "Urdu";
        const padPx = Math.round(fontPx * 0.3);
        const canvas2 = document.createElement("canvas");
        canvas2.width = Math.min(Math.ceil(widest + padPx * 2), maxWidthPx + padPx * 2);
        canvas2.height = linePx * (lines.length - 1) + Math.ceil(fontPx * 1.62);
        const ctx = canvas2.getContext("2d");
        ctx.fillStyle = colorCss;
        ctx.textBaseline = "middle";
        if (isRtl) ctx.direction = "rtl";
        const bodyStartX = isRtl ? canvas2.width - padPx : padPx;
        let baselineY = Math.round(fontPx * 0.85);
        ctx.font = boldSpec;
        ctx.textAlign = "left";
        if (labelPart) ctx.fillText(labelPart, bodyStartX, baselineY);
        ctx.font = fontSpec;
        ctx.fillText(lines[0].text, isRtl ? bodyStartX - labelW : bodyStartX + labelW, baselineY);
        for (let i = 1; i < lines.length; i++) {
            baselineY += linePx;
            ctx.fillText(lines[i].text, bodyStartX, baselineY);
        }
        out = {
            dataUrl: canvas2.toDataURL("image/png"),
            wMm: canvas2.width / PX_PER_MM,
            hMm: canvas2.height / PX_PER_MM,
            lines: lines.length,
        };
    } catch {
        out = null;
    }
    if (out) invoiceNoteImageCache.set(key, out);
    return out;
};
const collectWarrantyBlocks = (sp) => {
    const langs = Array.isArray(sp?.warrantyLangs) ? sp.warrantyLangs.filter(id => WARRANTY_NOTE_LANG_IDS.includes(id)).slice(0, 5) : [];
    if (!langs.length) return [{ id: "en", kind: "helv", label: "English", text: WARRANTY_NOTE_EN }];
    const blocks = [{ id: "en", kind: "helv", label: "English", text: WARRANTY_NOTE_EN }];
    langs.forEach(id => {
        const found = WARRANTY_NOTE_LANGS.find(l => l.id === id);
        if (found) blocks.push({ id, kind: "img", label: found.label, text: found.text });
    });
    return blocks;
};
const buildInvoiceDoc = async (sale, shop) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ml = 12, mr = 12, cw = pw - ml - mr;
    await ensureRupeeFont(doc);
    const T = resolveInvoiceTheme(shop);
    const accent = T.palette.accent;
    const gold = T.palette.gold;
    const dark = T.palette.dark;
    const mid = T.palette.mid;
    const soft = T.palette.soft;
    const bg = T.palette.bg;
    const bgAlt = T.palette.bgAlt;
    const border = T.palette.border;
    const onAccent = T.palette.onAccent;
    const headerSub = T.palette.headerSub;
    const danger = T.palette.danger;
    const isGST = sale.billType === "GST";
    const isReturn = sale.type === "Return";
    const billLabel = isReturn ? "RETURN INVOICE" : isGST ? "TAX INVOICE" : "INVOICE";
    const sp = getSaleShop(sale, shop);
    const hsn = sp.hsnCode || "";
    const totalAmt = isReturn ? Number(sale.refundAmount || sale.totalAmount || sale.amount || 0) : Number(sale.totalAmount || sale.amount || 0);
    const taxableAmt = Number(sale.taxableAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).taxableAmount);
    const gstAmt = Number(sale.gstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).gstAmount);
    const cgstAmt = Number(sale.cgstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).cgstAmount);
    const sgstAmt = Number(sale.sgstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).sgstAmount);
    const paidAmt = isReturn ? totalAmt : Number(sale.paidAmount || 0);
    const dueAmt = isReturn ? 0 : Number(sale.dueAmount || 0);
    const isEMI = !isReturn && sale.paymentMode === "EMI";
    const emiProvider = pdfSafe(String(sale.financeProvider || "").trim());
    const emiRef = pdfSafe(String(sale.loanReference || "").trim());
    const emiTenure = Number(sale.financeTenureMonths || 0);
    const emiSettlement = String(sale.financeSettlement || "").trim() === "Settled" ? "Settled" : "Pending";
    const emiPaymentLabel = isEMI ? "External EMI" : sale.paymentMode || "Cash";
    const qty = getTxQty(sale);
    const itemLabel = getTxItemLabel(sale);
    const itemContext = getTxReportExtra(sale);
    const identityLines = getTxIdentityLines(sale);
    const unitRate = isGST ? roundMoney((taxableAmt || totalAmt) / qty) : roundMoney(totalAmt / qty);
    const rX = pw - mr; // right edge

    // ═══════ OUTER BORDER ═══════
    if (T.border !== "none") {
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.6);
        doc.rect(ml - 2, 6, cw + 4, ph - 12);
        if (T.border === "double") {
            doc.setDrawColor(...gold);
            doc.setLineWidth(0.2);
            doc.rect(ml - 1, 7, cw + 2, ph - 14);
        }
    }

    // ═══════ HEADER SECTION ═══════
    const minimalHead = T.header === "minimal";
    const splitHead = T.header === "split";
    if (!minimalHead) {
        doc.setFillColor(...accent);
        doc.rect(ml, 10, cw, 28, "F");
    }
    if (splitHead) {
        doc.setFillColor(...bgAlt);
        doc.rect(ml + cw - 62, 10, 62, 28, "F");
        doc.setDrawColor(...border);
        doc.setLineWidth(0.2);
        doc.line(ml + cw - 62, 10, ml + cw - 62, 38);
    }

    // Decorative line under header (band motif) or thin accent rule (minimal)
    if (T.header === "band") {
        doc.setFillColor(...gold);
        doc.rect(ml, 38, cw, 1.2, "F");
    } else if (minimalHead) {
        doc.setFillColor(...accent);
        doc.rect(ml, 38, cw, 0.8, "F");
    }

    // Logo
    let hx = ml + 6;
    if (sp.logoData) {
        try {
            doc.setFillColor(...(minimalHead ? bgAlt : [255, 255, 255]));
            doc.roundedRect(ml + 3, 13, 22, 22, 1.5, 1.5, "F");
            if (minimalHead) { doc.setDrawColor(...border); doc.setLineWidth(0.2); doc.roundedRect(ml + 3, 13, 22, 22, 1.5, 1.5); }
            doc.addImage(sp.logoData, "PNG", ml + 4, 14, 20, 20);
        } catch {
            try { doc.addImage(sp.logoData, "JPEG", ml + 4, 14, 20, 20); } catch { }
        }
        hx = ml + 28;
    }

    // Shop name
    doc.setTextColor(...(minimalHead ? dark : onAccent));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(sp.shopName || sp.legalName, hx, 21);

    // Shop details line 1: address
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...(minimalHead ? mid : headerSub));
    const addrLine = [sp.address, sp.location].filter(Boolean).join(", ");
    if (addrLine) doc.text(addrLine, hx, 27);
    // Shop details line 2: phone | email
    const contactLine = [sp.phone, sp.email].filter(Boolean).join("  |  ");
    if (contactLine) doc.text(contactLine, hx, 32);

    // Invoice badge (right side)
    if (minimalHead) {
        doc.setTextColor(...accent);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(billLabel, rX - 2, 20, { align: "right" });
        doc.setTextColor(...mid);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(`# ${sale.invoiceNo || "-"}`, rX - 2, 29, { align: "right" });
    } else {
        const pillFill = splitHead ? accent : [255, 255, 255];
        const pillText = splitHead ? onAccent : accent;
        doc.setFillColor(...pillFill);
        doc.roundedRect(rX - 52, 13, 50, 10, 1.5, 1.5, "F");
        doc.setTextColor(...pillText);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(billLabel, rX - 27, 20, { align: "center" });
        // Invoice number below badge
        doc.setTextColor(...(splitHead ? mid : headerSub));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(`# ${sale.invoiceNo || "-"}`, rX - 27, 29, { align: "center" });
    }

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
    const detailRowH = isEMI ? 5.2 : 5.5;
    const halfW = cw / 2 - 1;

    const detailPairs = [
        ["Invoice No.", sale.invoiceNo || "-"],
        ["Date", fmtDateTime(sale.dateTime || sale.date)],
        [isReturn ? "Refund Mode" : "Payment", isReturn ? (sale.refundMode || sale.paymentMode || "Cash") : emiPaymentLabel],
    ];
    if (isReturn && (sale.returnOfInvoiceNo || sale.invoiceNoOriginal)) detailPairs.push(["Original Inv.", sale.returnOfInvoiceNo || sale.invoiceNoOriginal]);
    if (sp.state && !isGST) detailPairs.push(["State", sp.state]);
    const salesmanText = String(sale.salesman || "").trim();
    if (salesmanText) detailPairs.push(["Salesman", salesmanText]);
    if (isEMI) {
        detailPairs.push(
            ["Finance Provider", emiProvider || "-"],
            ["Loan Reference", emiRef || "-"],
            ["Tenure", `${emiTenure || "-"} Months`],
            ["Down Payment", paidAmt],
            ["Finance Amount", dueAmt],
            ["Settlement Status", emiSettlement],
        );
    }

    // Left box content wrap: name, phone, optional address, optional notes.
    const addressText = String(sale.customerAddress || "").trim();
    const addressLines = addressText ? doc.splitTextToSize(`Address: ${addressText}`, halfW - 6).slice(0, 2) : [];
    const notesWrap = sale.notes ? doc.splitTextToSize(sale.notes, halfW - 6).slice(0, 2) : [];
    const leftNeed = 24 + (addressLines.length ? addressLines.length * 3.9 + 1.5 : 0) + (notesWrap.length ? notesWrap.length * 3.9 + 1.5 : 0);
    const rightNeed = 12 + detailPairs.length * detailRowH + 2;
    const boxH = Math.max(30, leftNeed, rightNeed);

    // Left box: Bill To
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(ml, boxY, halfW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...onAccent);
    doc.text("BILL TO", ml + 3, boxY + 4.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(sale.customerName || "Walk-in Customer", ml + 3, boxY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...mid);
    doc.text(`Phone: ${sale.phone || "Not provided"}`, ml + 3, boxY + 18);
    let byCur = boxY + 24;
    if (addressLines.length) {
        doc.text(addressLines, ml + 3, byCur);
        byCur += addressLines.length * 3.9 + 1.5;
    }
    if (notesWrap.length) {
        doc.setFontSize(7.5);
        doc.text(notesWrap, ml + 3, byCur);
    }

    // Right box: Invoice Details
    const rbX = ml + halfW + 2;
    doc.setDrawColor(...border);
    doc.rect(rbX, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(rbX, boxY, halfW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...onAccent);
    doc.text("INVOICE DETAILS", rbX + 3, boxY + 4.2);

    let dy = boxY + 12;
    detailPairs.forEach(([label, val]) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...soft);
        doc.text(label + ":", rbX + 3, dy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...dark);
        if (label === "Down Payment" || label === "Finance Amount") pdfRs(doc, fmtRs(Number(val) || 0), rbX + 30, dy);
        else doc.text(String(val), rbX + 30, dy);
        dy += detailRowH;
    });

    cy = boxY + boxH + 4;

    // ═══════ ITEM TABLE ═══════
    const tY = cy;

    // Column positions (right columns sized for "₹XX,XX,XXX.XX")
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
    doc.setTextColor(...onAccent);
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
    const descText = [itemLabel, itemContext, ...identityLines].filter(Boolean).join("\n");
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
    doc.text(itemLabel, c2 + 2, rowY + 6);
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
    doc.text(String(qty), (c3 + c4) / 2, rowY + 6, { align: "center" });
    pdfRs(doc, fmtRs(unitRate), c4r, rowY + 6, { align: "right" });
    doc.setFont("helvetica", "bold");
    pdfRs(doc, fmtRs(totalAmt), c5r, rowY + 6, { align: "right" });

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

    // ── Terms content pre-calc (the terms box must size to its own content) ──
    const termsText = isReturn
        ? [sale.returnReason ? `Return reason: ${sale.returnReason}` : "Returned item has been added back to stock.", sp.footer].filter(Boolean).join("\n")
        : [isEMI ? "- Product bought on finance cannot be resold before EMI closure." : "", sp.terms, sp.footer].filter(Boolean).join("\n");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const tLines = doc.splitTextToSize(termsText || (isReturn ? "Return invoice generated for stock return." : "Thank you for your purchase."), termsW - 6);
    const tVisLines = tLines.slice(0, isEMI ? 8 : 6);

    // ── Warranty note panel (English + shop's chosen Indian languages) ──
    // Pre-calculated BEFORE the box rects: the panel lives only inside the
    // terms box, so it must never inflate the totals box height.
    const noteBlocks = collectWarrantyBlocks(sp).filter(Boolean);
    const panelPadX = 4;
    const panelBoxX = ml + 3;
    const panelBoxW = termsW - 6;
    const enLabelW = doc.getTextWidth("English: ");
    const enWrapLines = noteBlocks.length ? doc.splitTextToSize(noteBlocks[0].text, panelBoxW - panelPadX * 2 - enLabelW) : [];
    const noteColorCss = `rgb(${Math.round(mid[0])},${Math.round(mid[1])},${Math.round(mid[2])})`;
    const noteImages = noteBlocks.map(b => b.kind === "img" ? renderWarrantyNoteImage(b.label, b.text, panelBoxW - panelPadX * 2, noteColorCss) : null);
    let notePanelH = 0;
    noteBlocks.forEach((b, i) => {
        if (i === 0) notePanelH += enWrapLines.length * 4.1 + 2.2;
        else if (noteImages[i] && noteImages[i].lines <= 4) notePanelH += noteImages[i].hMm + 2.2;
    });
    if (noteBlocks.length && notePanelH > 0) notePanelH += 4.6 + 3.2; // matches drawn top offset + bottom air

    // ── Totals Section (right) with border ──
    const ndetRows = 1 + (isGST ? 2 : 0);
    const totBoxH = 10 + ndetRows * 6 + 15 + (isEMI ? 14 : 5);
    const termBoxH = 12 + tVisLines.length * 4.1 + (notePanelH > 0 ? 1 + notePanelH : 0) + 2.5;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(totX, secStartY, totW, totBoxH);

    // Totals header
    doc.setFillColor(...accent);
    doc.rect(totX, secStartY, totW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...onAccent);
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
    pdfRs(doc, fmtRs(taxableAmt), totRx, tCur, { align: "right" });
    tCur += 6;

    if (isGST) {
        doc.setTextColor(...mid);
        doc.text(`CGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        pdfRs(doc, fmtRs(cgstAmt), totRx, tCur, { align: "right" });
        tCur += 6;
        doc.setTextColor(...mid);
        doc.text(`SGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        pdfRs(doc, fmtRs(sgstAmt), totRx, tCur, { align: "right" });
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
    doc.setTextColor(...onAccent);
    doc.text(isReturn ? "REFUND TOTAL" : "GRAND TOTAL", totLx, tCur + 2);
    pdfRs(doc, fmtRs(totalAmt), totRx, tCur + 2, { align: "right" });
    tCur += 10;

    if (isEMI) {
        // EMI settlement rows: one per line
        const emiTotRows = [
            ["Customer Paid (Down Payment):", paidAmt],
            ["Financed Amount:", dueAmt],
        ];
        doc.setFillColor(...bgAlt);
        doc.rect(totX, tCur - 4, totW, 17, "F");
        doc.setFontSize(8);
        emiTotRows.forEach(([label, value]) => {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(...mid);
            doc.text(label, totLx, tCur);
            doc.setTextColor(...dark);
            doc.setFont("helvetica", "bold");
            pdfRs(doc, fmtRs(value), totRx, tCur, { align: "right" });
            tCur += 5;
        });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text("Finance Settlement:", totLx, tCur);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(emiSettlement === "Settled" ? dark : danger));
        doc.text(emiSettlement, totRx, tCur, { align: "right" });
        tCur += 5;
    } else {
        // Paid / Due row
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...mid);
        doc.text(isReturn ? "Refunded:" : "Paid:", totLx, tCur);
        doc.setTextColor(...dark);
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(paidAmt), totLx + 18, tCur);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text("Due:", totX + totW / 2 + 2, tCur);
        const dueColor = dueAmt > 0 ? danger : dark;
        doc.setTextColor(...dueColor);
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(dueAmt), totRx, tCur, { align: "right" });
    }

    // ── Terms Section (left) ──
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, secStartY, termsW, termBoxH);
    doc.setFillColor(...accent);
    doc.rect(ml, secStartY, termsW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...onAccent);
    doc.text("TERMS & CONDITIONS", ml + 3, secStartY + 4.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mid);
    let tCurY = secStartY + 12;
    tVisLines.forEach(l => { doc.text(l, ml + 3, tCurY); tCurY += 4.1; });

    // ── Bilingual warranty note panel inside the terms box ──
    if (noteBlocks.length && notePanelH > 0) {
        const panelTop = tCurY + 1;
        const panelFitH = Math.min(notePanelH, secStartY + termBoxH - panelTop - 2);
        if (panelFitH > 8) {
            const tint = accent.map(v => Math.round(255 - (255 - v) * 0.07));
            let ny = panelTop + 4.6;
            try {
                doc.setFillColor(...tint);
                doc.roundedRect(panelBoxX, panelTop, panelBoxW, panelFitH, 1.6, 1.6, "F");
            } catch {
                doc.rect(panelBoxX, panelTop, panelBoxW, panelFitH, "F");
            }
            noteBlocks.forEach((b, i) => {
                if (i === 0) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7.5);
                    doc.setTextColor(...dark);
                    doc.text("English:", panelBoxX + panelPadX, ny);
                    const enLabelBoldW = doc.getTextWidth("English:");
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(...mid);
                    const enFirst = enWrapLines[0] != null ? enWrapLines[0] : "";
                    doc.text(enFirst, panelBoxX + panelPadX + enLabelBoldW + 1.4, ny);
                    for (let li = 1; li < enWrapLines.length; li++) {
                        ny += 4.1;
                        doc.text(enWrapLines[li], panelBoxX + panelPadX, ny);
                    }
                    ny += 4.1 + 2.2;
                } else {
                    const img = noteImages[i];
                    if (img && img.lines <= 4 && ny + img.hMm < panelTop + panelFitH + 1) {
                        try { doc.addImage(img.dataUrl, "PNG", panelBoxX + panelPadX, ny - 2.7, img.wMm, img.hMm); } catch { }
                        ny += img.hMm + 2.2;
                    }
                }
            });
        }
    }

    cy = secStartY + Math.max(totBoxH, termBoxH) + 4;

    // ═══════ DECLARATION + SIGNATURE (adaptive to the page bottom) ═══════
    let bannerLines = [];
    let bannerH = 0;
    if (isEMI) {
        const bannerText = pdfSafe("This purchase is financed through an external finance provider. EMI repayments, interest, charges, and loan terms are governed by the agreement between the customer and the finance provider.");
        bannerLines = doc.splitTextToSize(bannerText, cw - 10);
        bannerH = bannerLines.length * 4.2 + 5;
    }
    const declText = isReturn ? "We declare that this return invoice records the refund against the original sale and the returned stock entry." : "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const declLines = doc.splitTextToSize(declText, cw / 2 - 8);

    const footSecY = cy;
    const spaceLeft = ph - 8 - footSecY;
    const footMinH = Math.max(10 + Math.max(2, declLines.length) * 4.2 + 2, 18);
    let showBanner = bannerH > 0 && spaceLeft >= footMinH + 3 + bannerH + 4 + 6;
    let footH = Math.min(32, Math.max(footMinH, spaceLeft - (showBanner ? 3 + bannerH + 4 + 6 : 8)));
    if (footH < footMinH) {
        showBanner = false;
        footH = Math.min(32, Math.max(footMinH, spaceLeft - 8));
        if (footH < footMinH) footH = Math.max(10, Math.min(footMinH, spaceLeft));
    }
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

    // ═══════ FINANCE DISCLAIMER BANNER (EMI) ═══════
    if (showBanner) {
        const bannerY = footSecY + footH + 3;
        doc.setFillColor(...bgAlt);
        doc.setDrawColor(...border);
        doc.setLineWidth(0.2);
        doc.rect(ml, bannerY, cw, bannerH, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...mid);
        doc.text(bannerLines, ml + 5, bannerY + 6);
    }

    // ═══════ PAGE FOOTER ═══════
    const footerY = footSecY + footH + 4 + (showBanner ? bannerH + 4 : 0);
    if (footerY <= ph - 7) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(...soft);
        doc.text("Thank you for your business!", pw / 2, footerY, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.text(billLabel, ml, footerY);
        doc.text("Page 1 of 1", rX, footerY, { align: "right" });
    }

    // ═══════ WATERMARK (custom theme with shop logo) ═══════
    if (T.watermark && sp.logoData) {
        const totalPages = doc.getNumberOfPages();
        for (let wp = 1; wp <= totalPages; wp++) {
            doc.setPage(wp);
            doc.saveGraphicsState();
            try {
                doc.setGState(new doc.GState({ opacity: T.watermarkOpacity }));
                let imgW = 120, imgH = 120;
                try {
                    const props = doc.getImageProperties(sp.logoData);
                    if (props && props.width && props.height) {
                        const scale = Math.min(120 / props.width, 120 / props.height);
                        imgW = props.width * scale;
                        imgH = props.height * scale;
                    }
                } catch { }
                try {
                    doc.addImage(sp.logoData, "PNG", (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH);
                } catch {
                    doc.addImage(sp.logoData, "JPEG", (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH);
                }
            } catch { }
            doc.restoreGraphicsState();
        }
        doc.setPage(totalPages);
    }

    return doc;
};
// Horizontal (A4 landscape) invoice: same data as the vertical bill, laid out
// as a wide top band that covers roughly the top half of the page. The lower
// half stays blank so the sheet can be trimmed or fed to slip printers.
const buildInvoiceLandscapeDoc = async (sale, shop) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const ml = 12, mr = 12, cw = pw - ml - mr;
    const bandBottom = Math.round(ph / 1.5); // ~140mm wide top band, rest blank
    await ensureRupeeFont(doc);
    const T = resolveInvoiceTheme(shop);
    const accent = T.palette.accent;
    const gold = T.palette.gold;
    const dark = T.palette.dark;
    const mid = T.palette.mid;
    const soft = T.palette.soft;
    const bg = T.palette.bg;
    const bgAlt = T.palette.bgAlt;
    const border = T.palette.border;
    const onAccent = T.palette.onAccent;
    const headerSub = T.palette.headerSub;
    const danger = T.palette.danger;
    const splitHead = T.header === "split";
    const isGST = sale.billType === "GST";
    const isReturn = sale.type === "Return";
    const billLabel = isReturn ? "RETURN INVOICE" : isGST ? "TAX INVOICE" : "INVOICE";
    const sp = getSaleShop(sale, shop);
    const hsn = sp.hsnCode || "";
    const totalAmt = isReturn ? Number(sale.refundAmount || sale.totalAmount || sale.amount || 0) : Number(sale.totalAmount || sale.amount || 0);
    const taxableAmt = Number(sale.taxableAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).taxableAmount);
    const gstAmt = Number(sale.gstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).gstAmount);
    const cgstAmt = Number(sale.cgstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).cgstAmount);
    const sgstAmt = Number(sale.sgstAmount || calcInvoiceTotals(totalAmt, sale.billType, sale.gstRate).sgstAmount);
    const paidAmt = isReturn ? totalAmt : Number(sale.paidAmount || 0);
    const dueAmt = isReturn ? 0 : Number(sale.dueAmount || 0);
    const isEMI = !isReturn && sale.paymentMode === "EMI";
    const emiProvider = pdfSafe(String(sale.financeProvider || "").trim());
    const emiRef = pdfSafe(String(sale.loanReference || "").trim());
    const emiTenure = Number(sale.financeTenureMonths || 0);
    const emiSettlement = String(sale.financeSettlement || "").trim() === "Settled" ? "Settled" : "Pending";
    const emiPaymentLabel = isEMI ? "External EMI" : sale.paymentMode || "Cash";
    const qty = getTxQty(sale);
    const itemLabel = getTxItemLabel(sale);
    const itemContext = getTxReportExtra(sale);
    const identityLines = getTxIdentityLines(sale);
    const unitRate = isGST ? roundMoney((taxableAmt || totalAmt) / qty) : roundMoney(totalAmt / qty);
    const rX = pw - mr;

    // Outer double border wraps the full content band. It is drawn LAST
    // (after the declaration, banner and footer) so it expands to the real
    // content height instead of cutting off at the Terms & Conditions area.

    // ═══════ HEADER ═══════
    doc.setFillColor(...accent);
    doc.rect(ml, 7, cw, 20, "F");
    if (splitHead) {
        doc.setFillColor(...bgAlt);
        doc.rect(ml + cw - 56, 7, 56, 20, "F");
        doc.setDrawColor(...border);
        doc.setLineWidth(0.2);
        doc.line(ml + cw - 56, 7, ml + cw - 56, 27);
    }
    doc.setFillColor(...gold);
    doc.rect(ml, 27.2, cw, 1, "F");

    let hx = ml + 3;
    if (sp.logoData) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(ml + 2, 9.5, 15, 15, 1.2, 1.2, "F");
            doc.addImage(sp.logoData, "PNG", ml + 2.8, 10.2, 13.4, 13.4);
        } catch {
            try { doc.addImage(sp.logoData, "JPEG", ml + 2.8, 10.2, 13.4, 13.4); } catch { }
        }
        hx = ml + 19;
    }
    doc.setTextColor(...onAccent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(sp.shopName || sp.legalName, hx, 14.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...headerSub);
    const addrLine = [sp.address, sp.location].filter(Boolean).join(", ");
    if (addrLine) doc.text(addrLine, hx, 19.6);
    const contactLine = [sp.phone, sp.email].filter(Boolean).join("  |  ");
    if (contactLine) doc.text(contactLine, hx, 23.6);

    const pillFill = splitHead ? accent : [255, 255, 255];
    const pillText = splitHead ? onAccent : accent;
    doc.setFillColor(...pillFill);
    doc.roundedRect(rX - 44, 10, 42, 8, 1.2, 1.2, "F");
    doc.setTextColor(...pillText);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(billLabel, rX - 23, 14.6, { align: "center" });
    doc.setTextColor(...(splitHead ? mid : headerSub));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`# ${sale.invoiceNo || "-"}`, rX - 23, 22, { align: "center" });

    let cy = 30.5;
    // ═══════ GSTIN BAR ═══════
    if (isGST && sp.gstin) {
        doc.setFillColor(...bgAlt);
        doc.rect(ml, cy, cw, 6, "F");
        doc.setDrawColor(...border);
        doc.setLineWidth(0.15);
        doc.line(ml, cy + 6, ml + cw, cy + 6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...accent);
        doc.text(`GSTIN: ${sp.gstin}`, ml + 4, cy + 4.4);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text(`State: ${sp.state || "-"}  |  Code: ${sp.stateCode || "-"}`, rX - 2, cy + 4.4, { align: "right" });
        cy += 8;
    } else cy += 1;

    // ═══════ BILL TO + INVOICE DETAILS ═══════
    const boxY = cy;
    const halfW = cw / 2 - 1;
    const detailRowH = isEMI ? 4.5 : 5.2;

    // Left box content (computed first so both boxes share one height)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const notesWrapL = sale.notes ? doc.splitTextToSize(sale.notes, halfW - 6).slice(0, 2) : [];
    const leftNeed = 30 + (notesWrapL.length ? 7 + notesWrapL.length * 3.4 : 0);

    const baseRows = [
        ["Invoice No.", sale.invoiceNo || "-"],
        ["Date", fmtDateTime(sale.dateTime || sale.date)],
        [isReturn ? "Refund Mode" : "Payment", isReturn ? (sale.refundMode || sale.paymentMode || "Cash") : emiPaymentLabel],
    ];
    if (isReturn && (sale.returnOfInvoiceNo || sale.invoiceNoOriginal)) baseRows.push(["Original Inv.", sale.returnOfInvoiceNo || sale.invoiceNoOriginal]);
    if (sp.state && !isGST) baseRows.push(["State", sp.state]);
    const salesmanTextL = String(sale.salesman || "").trim();
    if (salesmanTextL) baseRows.push(["Salesman", salesmanTextL]);
    const emiRows = isEMI ? [
        ["Finance Provider", emiProvider || "-"],
        ["Loan Reference", emiRef || "-"],
        ["Tenure", `${emiTenure || "-"} Months`],
        ["Down Payment", Number(paidAmt)],
        ["Finance Amount", Number(dueAmt)],
        ["Settlement Status", emiSettlement],
    ] : [];
    const rightRowsColA = baseRows;
    const rightRowsColB = emiRows;
    const rightRows = Math.max(baseRows.length, emiRows.length);
    const rightNeed = 8.5 + rightRows * detailRowH + 2;
    const boxH = Math.max(30, leftNeed, rightNeed);

    // Left box: Bill To
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(ml, boxY, halfW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...onAccent);
    doc.text("BILL TO", ml + 3, boxY + 3.6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(sale.customerName || "Walk-in Customer", ml + 3, boxY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mid);
    let byCur = boxY + 14.5;
    if (String(sale.customerAddress || "").trim()) {
        doc.text(`Phone: ${sale.phone || "Not provided"}`, ml + 3, byCur);
        doc.text(`Address: ${String(sale.customerAddress).trim()}`, ml + 3, byCur + 4);
        byCur += 8;
    } else {
        doc.text(`Phone: ${sale.phone || "Not provided"}`, ml + 3, byCur);
        byCur += 4.5;
    }
    if (notesWrapL.length) {
        doc.setFontSize(6.5);
        doc.text(notesWrapL, ml + 3, byCur + 2);
    }

    // Right box: Invoice Details
    const rbX = ml + halfW + 2;
    doc.rect(rbX, boxY, halfW, boxH);
    doc.setFillColor(...accent);
    doc.rect(rbX, boxY, halfW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...onAccent);
    doc.text("INVOICE DETAILS", rbX + 3, boxY + 3.6);

    const drawDetailCol = (pairs, x0) => {
        let my = boxY + 8.5;
        pairs.forEach(([label, val]) => {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(...soft);
            doc.text(String(label) + ":", x0, my);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...dark);
            const valX = x0 + 27;
            if (label === "Down Payment" || label === "Finance Amount") pdfRs(doc, fmtRs(Number(val) || 0), valX, my);
            else doc.text(String(val), valX, my);
            my += detailRowH;
        });
        return my;
    };
    if (isEMI) {
        const colW = (halfW - 6) / 2;
        drawDetailCol(baseRows, rbX + 3);
        drawDetailCol(emiRows, rbX + colW + 3);
    } else {
        drawDetailCol(baseRows, rbX + 3);
    }

    cy = boxY + boxH + 3;

    // ═══════ ITEM TABLE ═══════
    const c1 = ml;
    const c2 = ml + 14;
    const c6 = rX;
    const c5r = c6 - 2;
    const c5 = c6 - 36;
    const c4r = c5 - 2;
    const c4 = c5 - 36;
    const c3r = c4;
    const c3 = c4 - 14;
    const cHsn = hsn ? c3 - 20 : c3;

    doc.setFillColor(...accent);
    doc.rect(ml, cy, cw, 6.5, "F");
    doc.setTextColor(...onAccent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("S.No", c1 + 3, cy + 4.6);
    doc.text("Description", c2 + 2, cy + 4.6);
    if (hsn) doc.text("HSN", cHsn + 2, cy + 4.6);
    doc.text("Qty", c3 + 2, cy + 4.6);
    doc.text("Rate", c4r, cy + 4.6, { align: "right" });
    doc.text("Amount", c5r, cy + 4.6, { align: "right" });
    doc.setDrawColor(255, 255, 255, 80);
    doc.setLineWidth(0.15);
    const vLines = [c2, ...(hsn ? [cHsn] : []), c3, c4, c5];
    vLines.forEach(x => doc.line(x, cy + 1, x, cy + 5.5));

    const descMaxW = (hsn ? cHsn : c3) - c2 - 4;
    const descText = [itemLabel, itemContext, ...identityLines].filter(Boolean).join("\n");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const descLines = doc.splitTextToSize(descText, descMaxW);
    const rowH = Math.max(15, descLines.length * 3.6 + 7);
    const rowY = cy + 6.5;

    doc.setFillColor(...bg);
    doc.rect(ml, rowY, cw, rowH, "F");
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.rect(ml, rowY, cw, rowH);
    vLines.forEach(x => doc.line(x, rowY, x, rowY + rowH));

    doc.setTextColor(...dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("1", (c1 + c2) / 2, rowY + 5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(itemLabel, c2 + 2, rowY + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(...mid);
    const detailLines = descLines.slice(1);
    if (detailLines.length) doc.text(detailLines, c2 + 2, rowY + 9.5);
    if (hsn) {
        doc.setTextColor(...dark);
        doc.setFontSize(8);
        doc.text(hsn, cHsn + 3, rowY + 5);
    }
    doc.setTextColor(...dark);
    doc.setFontSize(8.5);
    doc.text(String(qty), (c3 + c4) / 2, rowY + 5, { align: "center" });
    pdfRs(doc, fmtRs(unitRate), c4r, rowY + 5, { align: "right" });
    doc.setFont("helvetica", "bold");
    pdfRs(doc, fmtRs(totalAmt), c5r, rowY + 5, { align: "right" });
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.4);
    doc.line(ml, rowY + rowH, ml + cw, rowY + rowH);

    cy = rowY + rowH + 1.5;

    // ═══════ AMOUNT IN WORDS ═══════
    doc.setFillColor(...bgAlt);
    doc.rect(ml, cy, cw, 7, "F");
    doc.setDrawColor(...border);
    doc.setLineWidth(0.15);
    doc.rect(ml, cy, cw, 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...accent);
    doc.text("Amount in Words:", ml + 3, cy + 4.7);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...dark);
    doc.text(amountInWords(totalAmt), ml + 30, cy + 4.7, { maxWidth: cw - 34 });

    cy += 9;

    // ═══════ BOTTOM ROW: Terms (+ note panel) left · Amount Details right ═══════
    const totW = 112;
    const totX = rX - totW;
    const termsW = totX - ml - 3;
    const secStartY = cy;

    const termsTextL = isReturn
        ? [sale.returnReason ? `Return reason: ${sale.returnReason}` : "Returned item has been added back to stock.", sp.footer].filter(Boolean).join("\n")
        : [isEMI ? "- Product bought on finance cannot be resold before EMI closure." : "", sp.terms, sp.footer].filter(Boolean).join("\n");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const tLinesL = doc.splitTextToSize(termsTextL || (isReturn ? "Return invoice generated for stock return." : "Thank you for your purchase."), termsW - 6).slice(0, 5);

    // Note panel pre-calc (English + shop's chosen languages)
    const noteBlocksL = collectWarrantyBlocks(sp).filter(Boolean);
    const panelPadL = 3.5;
    const panelX = ml + 3;
    const panelW = termsW - 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const enLabelWL = doc.getTextWidth("English: ");
    const enWrapL = noteBlocksL.length ? doc.splitTextToSize(noteBlocksL[0].text, panelW - panelPadL * 2 - enLabelWL) : [];
    const noteColorCssL = `rgb(${Math.round(mid[0])},${Math.round(mid[1])},${Math.round(mid[2])})`;
    const noteImgsL = noteBlocksL.map(b => b.kind === "img" ? renderWarrantyNoteImage(b.label, b.text, panelW - panelPadL * 2, noteColorCssL) : null);
    let notePanelHL = 0;
    noteBlocksL.forEach((b, i) => {
        if (i === 0) notePanelHL += enWrapL.length * 4 + 2;
        else if (noteImgsL[i] && noteImgsL[i].lines <= 2) notePanelHL += noteImgsL[i].hMm + 1.8;
    });
    if (noteBlocksL.length && notePanelHL > 0) notePanelHL += 4.2 + 3.2; // matches drawn top offset + bottom air

    // Deterministic heights: each bottom box sizes to its own content. The
    // note panel lives only in the terms box and must never stretch the
    // totals box (shared heights left a big dead band + page overflow).
    const totRows = 1 + (isGST ? 2 : 0);
    const totStackH = 9 + totRows * 5.2 + 4.5 + 10.6 + (isEMI ? 12.6 : 4.2) + 3;
    const termsBoxHL = 10 + tLinesL.length * 3.8 + (notePanelHL > 0 ? 1 + notePanelHL : 0) + 2.5;

    // ── Totals (right) ──
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(totX, secStartY, totW, totStackH);
    doc.setFillColor(...accent);
    doc.rect(totX, secStartY, totW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...onAccent);
    doc.text("AMOUNT DETAILS", totX + totW / 2, secStartY + 3.6, { align: "center" });

    let tCur = secStartY + 9;
    const totLx = totX + 3;
    const totRx = rX - 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mid);
    doc.text(isGST ? "Taxable Amount" : "Sub Total", totLx, tCur);
    doc.setTextColor(...dark);
    pdfRs(doc, fmtRs(taxableAmt), totRx, tCur, { align: "right" });
    tCur += 5.2;
    if (isGST) {
        doc.setTextColor(...mid);
        doc.text(`CGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        pdfRs(doc, fmtRs(cgstAmt), totRx, tCur, { align: "right" });
        tCur += 5.2;
        doc.setTextColor(...mid);
        doc.text(`SGST @ ${formatMoney(sale.gstRate / 2)}%`, totLx, tCur);
        doc.setTextColor(...dark);
        pdfRs(doc, fmtRs(sgstAmt), totRx, tCur, { align: "right" });
        tCur += 5.2;
    }
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.3);
    doc.line(totLx, tCur, totRx, tCur);
    tCur += 4.5;
    doc.setFillColor(...accent);
    doc.rect(totX, tCur - 3.2, totW, 8.4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...onAccent);
    doc.text(isReturn ? "REFUND TOTAL" : "GRAND TOTAL", totLx, tCur + 1.8);
    pdfRs(doc, fmtRs(totalAmt), totRx, tCur + 1.8, { align: "right" });
    tCur += 10.6;
    if (isEMI) {
        doc.setFillColor(...bgAlt);
        doc.rect(totX, tCur - 3.2, totW, 12.8, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...mid);
        doc.text("Customer Paid (Down Payment):", totLx, tCur);
        doc.setTextColor(...dark);
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(paidAmt), totRx, tCur, { align: "right" });
        tCur += 4.2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text("Financed Amount:", totLx, tCur);
        doc.setTextColor(...dark);
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(dueAmt), totRx, tCur, { align: "right" });
        tCur += 4.2;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text("Finance Settlement:", totLx, tCur);
        doc.setTextColor(...(emiSettlement === "Settled" ? dark : danger));
        doc.setFont("helvetica", "bold");
        doc.text(emiSettlement, totRx, tCur, { align: "right" });
        tCur += 4.2;
    } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...mid);
        doc.text(isReturn ? "Refunded:" : "Paid:", totLx, tCur);
        doc.setTextColor(...dark);
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(paidAmt), totLx + 16, tCur);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text("Due:", totX + totW / 2 + 2, tCur);
        doc.setTextColor(...(dueAmt > 0 ? danger : dark));
        doc.setFont("helvetica", "bold");
        pdfRs(doc, fmtRs(dueAmt), totRx, tCur, { align: "right" });
    }

    // ── Terms (left) + warranty note panel ──
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, secStartY, termsW, termsBoxHL);
    doc.setFillColor(...accent);
    doc.rect(ml, secStartY, termsW, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...onAccent);
    doc.text("TERMS & CONDITIONS", ml + 3, secStartY + 3.6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    let tYcur = secStartY + 10;
    tLinesL.forEach(l => { doc.setTextColor(...mid); doc.text(l, ml + 3, tYcur); tYcur += 3.8; });

    if (noteBlocksL.length && notePanelHL > 0) {
        const panelTop = tYcur + 1;
        const panelFitH = Math.min(notePanelHL, secStartY + termsBoxHL - panelTop - 2);
        if (panelFitH > 7) {
            const tint = accent.map(v => Math.round(255 - (255 - v) * 0.07));
            let py = panelTop + 4.2;
            try {
                doc.setFillColor(...tint);
                doc.roundedRect(panelX, panelTop, panelW, panelFitH, 1.4, 1.4, "F");
            } catch {
                doc.rect(panelX, panelTop, panelW, panelFitH, "F");
            }
            noteBlocksL.forEach((b, i) => {
                if (i === 0) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7.2);
                    doc.setTextColor(...dark);
                    doc.text("English:", panelX + panelPadL, py);
                    const enLabelBoldWL = doc.getTextWidth("English:");
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(...mid);
                    doc.text(enWrapL.length ? enWrapL[0] : "", panelX + panelPadL + enLabelBoldWL + 1.4, py);
                    for (let li = 1; li < enWrapL.length; li++) {
                        py += 4;
                        doc.text(enWrapL[li], panelX + panelPadL, py);
                    }
                    py += 4 + 2;
                } else {
                    const img = noteImgsL[i];
                    if (img && img.lines <= 2 && py + img.hMm < panelTop + panelFitH + 1) {
                        try { doc.addImage(img.dataUrl, "PNG", panelX + panelPadL, py - 2.4, img.wMm, img.hMm); } catch { }
                        py += img.hMm + 1.8;
                    }
                }
            });
        }
    }

    cy = secStartY + Math.max(totStackH, termsBoxHL) + 3.5;

    // ═══════ DECLARATION + SIGNATURE ═══════
    const footH = Math.min(14, Math.max(9, bandBottom - cy - (isEMI ? 10 : 6) - 3));
    const footY = cy;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.25);
    doc.rect(ml, footY, cw, footH);
    const footMidX = ml + cw / 2;
    doc.line(footMidX, footY, footMidX, footY + footH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...accent);
    doc.text("Declaration:", ml + 3, footY + 4.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(...mid);
    const declText = isReturn ? "We declare that this return invoice records the refund against the original sale and the returned stock entry." : "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    const declL = doc.splitTextToSize(declText, cw / 2 - 9).slice(0, 2);
    doc.text(declL, ml + 3, footY + 8.2);
    const sigCenterX = footMidX + cw / 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...accent);
    doc.text(`For ${sp.shopName || sp.legalName}`, sigCenterX, footY + 4.4, { align: "center" });
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.3);
    doc.line(sigCenterX - 24, footY + footH - 4.6, sigCenterX + 24, footY + footH - 4.6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...mid);
    doc.text("Authorised Signatory", sigCenterX, footY + footH - 1.6, { align: "center" });

    cy = footY + footH + 2.5;

    // ═══════ FINANCE DISCLAIMER (single-line when it fits) ═══════
    let frameContentBottom = footY + footH;
    if (isEMI) {
        const bannerText = pdfSafe("This purchase is financed through an external finance provider. EMI repayments, interest, charges, and loan terms are governed by the agreement between the customer and the finance provider.");
        const bannerL = doc.splitTextToSize(bannerText, cw - 8);
        if (cy + bannerL.length * 3.4 + 2.4 <= ph - 10) {
            const bh = bannerL.length * 3.4 + 2.4;
            doc.setFillColor(...bgAlt);
            doc.setDrawColor(...border);
            doc.setLineWidth(0.2);
            doc.rect(ml, cy, cw, bh, "FD");
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.6);
            doc.setTextColor(...mid);
            doc.text(bannerL.slice(0, 2), ml + 4, cy + 3.2);
            cy += bh + 2;
            frameContentBottom = cy - 2;
        }
    }

    // ═══════ FOOTER LINE ═══════
    if (cy + 4 <= ph - 7) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.5);
        doc.setTextColor(...soft);
        doc.text("Thank you for your business!", pw / 2, cy + 2.6, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...mid);
        doc.text(billLabel, ml, cy + 2.6);
        doc.text("Page 1 of 1", rX, cy + 2.6, { align: "right" });
    }

    // ═══════ OUTER DOUBLE BORDER — last, so it spans every content row ═══════
    if (T.border !== "none") {
        const frameBottom = Math.max(bandBottom, frameContentBottom + 3);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.6);
        doc.rect(ml - 2, 5, cw + 4, frameBottom - 5);
        if (T.border === "double") {
            doc.setDrawColor(...gold);
            doc.setLineWidth(0.2);
            doc.rect(ml - 1, 6, cw + 2, frameBottom - 6);
        }
    }

    // ═══════ WATERMARK ═══════
    if (T.watermark && sp.logoData) {
        const totalPages = doc.getNumberOfPages();
        for (let wp = 1; wp <= totalPages; wp++) {
            doc.setPage(wp);
            doc.saveGraphicsState();
            try {
                doc.setGState(new doc.GState({ opacity: T.watermarkOpacity }));
                let imgW = 90, imgH = 90;
                try {
                    const props = doc.getImageProperties(sp.logoData);
                    if (props && props.width && props.height) {
                        const scale = Math.min(90 / props.width, 90 / props.height);
                        imgW = props.width * scale;
                        imgH = props.height * scale;
                    }
                } catch { }
                try { doc.addImage(sp.logoData, "PNG", (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH); }
                catch { doc.addImage(sp.logoData, "JPEG", (pw - imgW) / 2, (ph - imgH) / 2, imgW, imgH); }
            } catch { }
            doc.restoreGraphicsState();
        }
        doc.setPage(totalPages);
    }

    return doc;
};
const makeInvoiceFile = async (sale, shop, opts = {}) => {
    const layout = opts.layout === "horizontal" || opts.layout === "landscape"
        ? "horizontal"
        : opts.layout === "vertical"
            ? "vertical"
            : (getSaleShop(sale, shop).invoiceLayout || "vertical");
    const doc = layout === "horizontal" ? await buildInvoiceLandscapeDoc(sale, shop) : await buildInvoiceDoc(sale, shop);
    const blob = doc.output("blob");
    const fileName = `${(sale.invoiceNo || sale.id || "invoice").toLowerCase()}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildReportDoc = async ({ rows, summary, reportType, rangeLabel, shop, filtersLabel = "" }) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    await ensureRupeeFont(doc);
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
        { label: reportType === "Repair" ? "Repairs" : "Buy/Add", value: fmtRs(reportType === "Repair" ? summary.repairTotal : summary.buyAddTotal) },
        { label: "Sales", value: fmtRs(summary.sellTotal) },
        { label: "Due", value: fmtRs(summary.dueTotal) },
    ];
    const columns = [
        { label: "Date", width: 26 },
        { label: "Type", width: 18 },
        { label: "Party", width: 42 },
        { label: "Item", width: 68 },
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
        if (filtersLabel) {
            const filterLines = doc.splitTextToSize(`Filters: ${filtersLabel}`, pageWidth - 28);
            doc.text(filterLines, 14, startY + 11);
        }
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

    let y = filtersLabel ? 90 : 84;
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
        pdfRs(doc, fmtRs(row.amount || 0), x + columns[4].width - 2, y + 3.5, { align: "right" });
        y += rowHeight;
    });

    return doc;
};
const makeReportFile = async ({ rows, summary, reportType, rangeLabel, shop, filtersLabel = "" }) => {
    const doc = await buildReportDoc({ rows, summary, reportType, rangeLabel, shop, filtersLabel });
    const blob = doc.output("blob");
    const fileName = `report-${reportType.toLowerCase()}-${rangeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildStickerBarcodeDataUrl = async (value) => {
    if (!value || typeof document === "undefined") return null;
    const { default: JsBarcode } = await import("jsbarcode");
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
        format: "CODE128",
        width: 1.8,
        height: 42,
        margin: 0,
        displayValue: false,
        background: "#ffffff",
        lineColor: "#111827",
    });
    return canvas.toDataURL("image/png");
};

const loadStickerLogoDataUrl = async () => {
    if (typeof window === "undefined") return null;
    try {
        const res = await fetch(APP_WORDMARK_FALLBACK, { cache: "force-cache" });
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

const buildStickerDoc = async (item, shop) => {
    const { jsPDF } = await import("jspdf");
    const shopProfile = normalizeShopProfile(shop || DEFAULT_SHOP_PROFILE);
    const hasWarrantyInfo = item.warrantyType && item.warrantyType !== "No Warranty";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [30, 50] });
    await ensureRupeeFont(doc);
    const ink = [28, 36, 44];
    const border = [26, 32, 39];
    const brandText = String(item.brand || "Mobile").trim() || "Mobile";
    const modelTextRaw = String(item.model || "").trim();
    const modelText = modelTextRaw || (item.brand ? "" : "Model");
    const deviceName = [brandText, modelText].filter(Boolean).join(" ") || "Stock Device";
    const specText = [item.ram || "", item.storage || "", item.color || ""].filter(Boolean).join(" / ") || "Specs not set";
    const warranty = getWarrantyStatus(item);
    const imei1Barcode = await buildStickerBarcodeDataUrl(item.imei);
    const conditionText = (item.condition || "").trim() || "In Stock";
    const fitText = (text, maxWidth, preferredSize, minSize = preferredSize) => {
        const original = doc.getFontSize();
        let size = preferredSize;
        while (size >= minSize) {
            doc.setFontSize(size);
            if (doc.getTextWidth(text) <= maxWidth) {
                doc.setFontSize(original);
                return { text, size };
            }
            size = Math.round((size - 0.2) * 10) / 10;
        }
        doc.setFontSize(minSize);
        let next = text;
        while (next.length > 4 && doc.getTextWidth(`${next}...`) > maxWidth) next = next.slice(0, -1);
        doc.setFontSize(original);
        return { text: `${next.trimEnd()}...`, size: minSize };
    };
    const shopText = fitText((shopProfile.shopName || APP_NAME).slice(0, 28), 39, 5.7, 5.0);
    const deviceText = fitText(deviceName, 39, 7.4, 5.9);
    const specLine = fitText(specText, 39, 4.7, 3.9);
    const conditionLine = fitText(conditionText.slice(0, 16), 16, 5.2, 4.4);
    const price = item.sellPrice || item.buyPrice;
    if (isRupeeFontReady()) doc.setFont("RupeeAmount", "bold");
    const priceText = shopProfile.stickerShowPrice && price ? fitText(isRupeeFontReady() ? `₹${formatMoney(price)}` : `${formatMoney(price)} RS`, 18, 5.4, 4.5) : null;
    doc.setFont("helvetica", "bold");
    const warrantyText = hasWarrantyInfo ? fitText(warranty.active ? warranty.remaining.slice(0, 12) : "Warranty Expired", 18, 4.1, 3.5) : null;

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 50, 30, "F");
    doc.setDrawColor(...border);
    doc.roundedRect(0.7, 0.7, 48.6, 28.6, 2.2, 2.2);
    doc.roundedRect(2.1, 2.1, 45.8, 25.8, 1.8, 1.8);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(shopText.size);
    doc.text(shopText.text, 3.8, 5.7);
    doc.setFontSize(deviceText.size);
    doc.text(deviceText.text, 3.8, 10.2);
    doc.setFontSize(specLine.size);
    doc.text(specLine.text, 3.8, 13.2);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.15);
    doc.line(3.5, 14.7, 46.2, 14.7);

    if (imei1Barcode && item.imei) {
        doc.addImage(imei1Barcode, "PNG", 4.0, 15.3, 42.0, 5.9);
    } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(3.8);
        doc.text("No IMEI barcode", 25, 18.9, { align: "center" });
    }
    doc.setFont("courier", "bold");
    doc.setFontSize(3.1);
    doc.text(item.imei || "IMEI not set", 25, 22.4, { align: "center", maxWidth: 39 });
    doc.line(3.5, 23.8, 46.2, 23.8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(conditionLine.size);
    doc.text(conditionLine.text, 3.8, 27.0);
    if (warrantyText) {
        doc.setFontSize(warrantyText.size);
        doc.text(warrantyText.text, 25, 27.0, { align: "center", maxWidth: 18 });
    } else if (item.imei2) {
        const imei2Line = fitText(`IMEI2 ${item.imei2}`, 18, 3.3, 2.8);
        doc.setFont("courier", "bold");
        doc.setFontSize(imei2Line.size);
        doc.text(imei2Line.text, 25, 27.0, { align: "center", maxWidth: 18 });
    }
    if (priceText) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(priceText.size);
        pdfRs(doc, priceText.text, 45.8, 27.0, { align: "right", maxWidth: 18 });
    }

    return doc;
};
const makeStickerFile = async (item, shop) => {
    const doc = await buildStickerDoc(item, shop);
    const blob = doc.output("blob");
    const fileName = `sticker-${(item.brand || "phone").toLowerCase()}-${(item.model || item.id || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildRepairStickerDoc = async (repair, shop) => {
    const { jsPDF } = await import("jspdf");
    const shopProfile = normalizeShopProfile(shop || DEFAULT_SHOP_PROFILE);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [30, 50] });
    await ensureRupeeFont(doc);
    const ink = [28, 36, 44];
    const border = [26, 32, 39];
    const fitText = (text, maxWidth, preferredSize, minSize = preferredSize) => {
        const original = doc.getFontSize();
        let size = preferredSize;
        while (size >= minSize) {
            doc.setFontSize(size);
            if (doc.getTextWidth(text) <= maxWidth) {
                doc.setFontSize(original);
                return { text, size };
            }
            size = Math.round((size - 0.2) * 10) / 10;
        }
        doc.setFontSize(minSize);
        let next = text;
        while (next.length > 4 && doc.getTextWidth(`${next}...`) > maxWidth) next = next.slice(0, -1);
        doc.setFontSize(original);
        return { text: `${next.trimEnd()}...`, size: minSize };
    };
    const shopText = fitText((shopProfile.shopName || APP_NAME).slice(0, 28), 39, 5.7, 5.0);
    const deviceText = fitText(([repair.brand, repair.model].filter(Boolean).join(" ") || "Repair Job"), 39, 7.8, 6.4);
    const customerText = fitText((repair.customerName || "Walk-in Customer"), 39, 4.9, 4.2);
    const problemText = fitText((repair.problem || "Issue not set"), 39, 4.9, 4.1);
    const ticketText = fitText(`Ticket  ${repair.repairNo || repair.id}`, 24, 4.1, 3.8);
    if (isRupeeFontReady()) doc.setFont("RupeeAmount", "normal");
    const estimateText = fitText(isRupeeFontReady() ? `Est ₹${formatMoney(repair.estimatedCost || 0)}` : `Est ${formatMoney(repair.estimatedCost || 0)}`, 17, 5.4, 4.7);
    doc.setFont("helvetica", "normal");
    const statusText = fitText((repair.status || "Received").slice(0, 16), 16, 5.5, 4.8);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 50, 30, "F");
    doc.setDrawColor(...border);
    doc.roundedRect(0.7, 0.7, 48.6, 28.6, 2.2, 2.2);
    doc.roundedRect(2.1, 2.1, 45.8, 25.8, 1.8, 1.8);
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(shopText.size);
    doc.text(shopText.text, 3.8, 6.0);
    doc.setFontSize(deviceText.size);
    doc.text(deviceText.text, 3.8, 10.7);
    doc.setFontSize(customerText.size);
    doc.text(customerText.text, 3.8, 14.0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(problemText.size);
    doc.text(problemText.text, 3.8, 17.2);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.15);
    doc.line(3.5, 19.8, 46.2, 19.8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(ticketText.size);
    doc.text(ticketText.text, 3.8, 22.4);
    doc.line(3.5, 23.8, 46.2, 23.8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ink);
    doc.setFontSize(statusText.size);
    doc.text(statusText.text, 3.8, 27.0);
    doc.setFontSize(estimateText.size);
    pdfRs(doc, estimateText.text, 45.8, 27.0, { align: "right" });
    return doc;
};
const makeRepairStickerFile = async (repair, shop) => {
    const doc = await buildRepairStickerDoc(repair, shop);
    const blob = doc.output("blob");
    const fileName = `repair-${(repair.repairNo || repair.id || "ticket").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};
const buildBillProStickerDoc = async (item, shop) => {
    const { jsPDF } = await import("jspdf");
    const copies = Math.max(1, Number(item.copies || 1) || 1);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [30, 50] });
    await ensureRupeeFont(doc);
    const shopProfile = normalizeShopProfile(shop || DEFAULT_SHOP_PROFILE);
    const stickerName = String(item.itemLabel || "Item").trim() || "Item";
    const stickerCategory = String(item.category || "Accessory").trim();
    const stickerCode = String(item.code || "").trim();
    const stickerPrice = Number(item.price || 0);
    const barcodeDataUrl = stickerCode ? await buildStickerBarcodeDataUrl(stickerCode) : null;
    const logoDataUrl = await loadStickerLogoDataUrl();
    const drawStickerPage = () => {
        const ink = [28, 36, 44];
        const muted = [95, 103, 112];
        const line = [210, 217, 224];
        const fitText = (text, maxWidth, preferredSize, minSize = preferredSize) => {
            const originalSize = doc.getFontSize();
            let size = preferredSize;
            while (size >= minSize) {
                doc.setFontSize(size);
                if (doc.getTextWidth(text) <= maxWidth) {
                    doc.setFontSize(originalSize);
                    return { text, size };
                }
                size = Math.round((size - 0.2) * 10) / 10;
            }
            doc.setFontSize(minSize);
            let next = text;
            while (next.length > 4 && doc.getTextWidth(`${next}...`) > maxWidth) next = next.slice(0, -1);
            doc.setFontSize(originalSize);
            return { text: `${next.trimEnd()}...`, size: minSize };
        };
        const titleLine = fitText(stickerName, 46, 7.8, 5.4);
        const categoryLine = fitText(stickerCategory || "Bill Pro", 28, 4.8, 4.1);
        if (isRupeeFontReady()) doc.setFont("RupeeAmount", "bold");
        const priceLine = fitText(stickerPrice > 0 ? (isRupeeFontReady() ? `₹${formatMoney(stickerPrice)}` : `${formatMoney(stickerPrice)} RS`) : "PRICE ON ASK", 26, 6.4, 4.6);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 50, 30, "F");
        doc.setDrawColor(...line);
        doc.roundedRect(0.8, 0.8, 48.4, 28.4, 1.4, 1.4);
        doc.setTextColor(...ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(titleLine.size);
        doc.text(titleLine.text, 1.6, 4.9, { maxWidth: 46 });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...muted);
        doc.setFontSize(categoryLine.size);
        doc.text(categoryLine.text, 1.6, 8.2);
        if (barcodeDataUrl) {
            doc.addImage(barcodeDataUrl, "PNG", 1.4, 10.1, 47.2, 9.5);
        } else {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(4);
            doc.text("No barcode / code", 25, 15.6, { align: "center" });
        }
        doc.setTextColor(...ink);
        doc.setFont("courier", "bold");
        doc.setFontSize(3.2);
        doc.text(stickerCode || "MANUAL ITEM", 25, 21.5, { align: "center", maxWidth: 42 });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(priceLine.size);
        pdfRs(doc, priceLine.text, 25, 27.2, { align: "center", maxWidth: 26 });
        if (logoDataUrl) {
            doc.setDrawColor(...line);
            doc.roundedRect(43.2, 1.5, 5.2, 5.2, 0.6, 0.6);
            doc.addImage(logoDataUrl, "PNG", 43.7, 2.0, 4.2, 4.2);
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(3.3);
        doc.setTextColor(...muted);
        doc.text((shopProfile.shopName || APP_NAME).slice(0, 24), 1.8, 28.6);
    };
    drawStickerPage();
    for (let copyIndex = 1; copyIndex < copies; copyIndex += 1) {
        doc.addPage([30, 50], "landscape");
        drawStickerPage();
    }
    return doc;
};
const makeBillProStickerFile = async (item, shop) => {
    const doc = await buildBillProStickerDoc(item, shop);
    const blob = doc.output("blob");
    const fileName = `bill-pro-sticker-${String(item.itemLabel || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item"}.pdf`;
    return { blob, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
};

const S = `
@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/Inter-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/Inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Inter';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/Inter-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Inter';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/Inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/Inter-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/Inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/Inter-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/Inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Inter';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/Inter-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Inter';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/Inter-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/PlusJakartaSans-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:500;font-display:swap;src:url(/fonts/PlusJakartaSans-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/PlusJakartaSans-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:600;font-display:swap;src:url(/fonts/PlusJakartaSans-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/PlusJakartaSans-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/PlusJakartaSans-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/PlusJakartaSans-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/PlusJakartaSans-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/SpaceMono-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/SpaceMono-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/SpaceMono-latin-ext.woff2) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF;}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/SpaceMono-latin.woff2) format('woff2');unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;}
*{box-sizing:border-box;margin:0;padding:0}
:root{--surface:#f7f9fc;--surface-strong:#ffffff;--surface-low:#f2f4f7;--surface-mid:#eceef1;--surface-high:#e3e7ee;--surface-dim:#d8dadd;--outline:#c6c5d4;--outline-2:#e4e7ee;--primary:#000666;--primary-2:#1a237e;--secondary:#0048d8;--secondary-2:#2761fe;--success:#5aa958;--success-bg:#a3f69c;--warning:#d97706;--warning-bg:#fff1c2;--danger:#ba1a1a;--danger-bg:#ffdad6;--text:#191c1e;--text-2:#454652;--text-3:#767683;--r:24px;--rs:14px;--blur:18px;--gb:rgba(255,255,255,.78);--gbh:#ffffff;--gbo:rgba(25,28,30,.08);--gbl:rgba(0,6,102,.14);--a:var(--secondary);--a2:var(--primary);--a3:var(--secondary-2);--ok:var(--success);--warn:var(--warning);--err:var(--danger);--t1:var(--text);--t2:var(--text-2);--t3:var(--text-3)}
.theme-dark{--surface:#020617;--surface-strong:#0f172a;--surface-low:#111827;--surface-mid:#1e293b;--surface-high:#334155;--surface-dim:#475569;--outline:#334155;--outline-2:#1e293b;--primary:#e0f2fe;--primary-2:#7dd3fc;--secondary:#38bdf8;--secondary-2:#0ea5e9;--success:#22c55e;--success-bg:#064e3b;--warning:#f59e0b;--warning-bg:#451a03;--danger:#fb7185;--danger-bg:#4c0519;--text:#f8fafc;--text-2:#cbd5e1;--text-3:#94a3b8;--gb:rgba(15,23,42,.78);--gbh:#111827;--gbo:rgba(148,163,184,.18);--gbl:rgba(56,189,248,.24)}
html,body,#root{min-height:100%}
body,#root{font-family:'Inter',sans-serif;background:var(--surface);color:var(--text)}
body{background:var(--surface)}
img{max-width:100%}
.abg{min-height:100vh;background:radial-gradient(circle at top left,rgba(39,97,254,.08),transparent 22%),radial-gradient(circle at bottom right,rgba(26,35,126,.08),transparent 24%),linear-gradient(180deg,#fbfcfe 0%,var(--surface) 30%,#eef2f8 100%);color:var(--text);position:relative;overflow-x:hidden}
.abg::before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 18% 12%,rgba(39,97,254,.08),transparent 18%),radial-gradient(circle at 85% 0%,rgba(26,35,126,.06),transparent 20%);opacity:.9}
.theme-dark.abg,.theme-dark.auth-shell{background:radial-gradient(circle at top left,rgba(56,189,248,.12),transparent 24%),radial-gradient(circle at bottom right,rgba(14,165,233,.1),transparent 24%),linear-gradient(180deg,#020617 0%,#0f172a 52%,#020617 100%);color:var(--text)}
.theme-dark.abg::before{background:radial-gradient(circle at 18% 12%,rgba(56,189,248,.1),transparent 18%),radial-gradient(circle at 85% 0%,rgba(125,211,252,.08),transparent 20%)}
.theme-dark .gc,.theme-dark .gl,.theme-dark .stock-modern-card,.theme-dark .stock-modern-table,.theme-dark .transactions-desktop-table,.theme-dark .transactions-summary-card,.theme-dark .invoices-ledger,.theme-dark .invoice-row,.theme-dark .settings-terminal-card,.theme-dark .settings-mini-card,.theme-dark .settings-desktop-nav button,.theme-dark .theme-choice-card,.theme-dark .hcard,.theme-dark .auth-card,.theme-dark .auth-form-wrap,.theme-dark .auth-panel{background:var(--surface-strong)!important;border-color:var(--gbo)!important;color:var(--text)!important;box-shadow:0 18px 36px rgba(0,0,0,.24)!important}
.theme-dark .stock-modern-table-head,.theme-dark .transactions-table-head,.theme-dark .stock-modern-table-row,.theme-dark .transactions-table-row,.theme-dark .invoices-searchbar,.theme-dark .invoices-filter-btn,.theme-dark .stock-modern-search,.theme-dark .stock-modern-filters,.theme-dark .stock-modern-pill,.theme-dark .table-action-btn,.theme-dark .invoice-row-icon,.theme-dark .bg{background:var(--surface-low)!important;border-color:var(--gbo)!important;color:var(--text)!important}
.theme-dark .stock-device-copy strong,.theme-dark .transactions-table-cell strong,.theme-dark .invoice-row-main strong,.theme-dark .settings-terminal-card h3,.theme-dark .settings-detail-copy h2,.theme-dark .stock-modern-card-body h3,.theme-dark .auth-header h2{color:var(--text)!important}
.theme-dark .stock-device-copy span,.theme-dark .transactions-table-cell span,.theme-dark .invoice-row-item,.theme-dark .settings-terminal-card p,.theme-dark .settings-detail-copy p,.theme-dark .auth-header p{color:var(--text-2)!important}
.gl{background:rgba(255,255,255,.72);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(198,197,212,.18);border-radius:24px;box-shadow:0 18px 45px rgba(25,28,30,.06)}
.gc{background:var(--surface-strong);border:1px solid rgba(198,197,212,.22);border-radius:22px;padding:22px;box-shadow:0 12px 28px rgba(25,28,30,.05);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
.gc:hover{transform:translateY(-1px);box-shadow:0 16px 34px rgba(25,28,30,.08)}
.gi,.gs,textarea.gi,select.gs{width:100%;padding:13px 15px;background:var(--surface-low);border:1px solid transparent;border-radius:14px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:background .2s ease,border-color .2s ease,box-shadow .2s ease}
.gi:focus,.gs:focus,textarea.gi:focus,select.gs:focus{background:#eef3ff;border-color:rgba(0,72,216,.14);box-shadow:inset 0 -2px 0 var(--secondary),0 0 0 3px rgba(0,72,216,.08)}
.gi::placeholder{color:#8b90a0}
.gs{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--text-3) 50%),linear-gradient(135deg,var(--text-3) 50%,transparent 50%);background-position:calc(100% - 18px) calc(50% - 3px),calc(100% - 12px) calc(50% - 3px);background-size:6px 6px,6px 6px;background-repeat:no-repeat;padding-right:34px}
.gs option{background:#fff;color:var(--text)}
.bp,.bs,.bg,.bd{min-height:44px;border-radius:14px;font-family:'Inter',sans-serif;font-weight:700;font-size:13px;letter-spacing:.01em;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease,background .2s ease,color .2s ease,border-color .2s ease;display:inline-flex;align-items:center;gap:8px;padding:12px 18px}
.bp{border:none;color:#fff;background:linear-gradient(135deg,var(--secondary),var(--secondary-2));box-shadow:0 10px 20px rgba(0,72,216,.18)}
.bp:hover{transform:translateY(-1px);box-shadow:0 14px 24px rgba(0,72,216,.24)}
.bs{border:none;color:#fff;background:linear-gradient(135deg,#0f7b3b,#5aa958);box-shadow:0 10px 20px rgba(90,169,88,.2)}
.bg{background:var(--surface-low);border:1px solid rgba(198,197,212,.55);color:var(--text)}
.bg:hover{background:var(--surface-mid);color:var(--primary)}
.bd{background:var(--danger-bg);border:1px solid rgba(186,26,26,.14);color:var(--danger)}
.ba{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.bn{background:#dce1ff;color:#001550}
.br{background:var(--warning-bg);color:#7c4a03}
.bu{background:var(--surface-mid);color:var(--text-2)}
.bi{background:rgba(163,246,156,.3);color:#005312}
.bso{background:rgba(255,218,214,.95);color:#93000a}
.bre{background:#e0e0ff;color:#343d96}
.ni{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;color:var(--text-2);cursor:pointer;transition:all .2s ease;font-size:14px;font-weight:600;border:1px solid transparent}
.ni:hover{background:rgba(255,255,255,.7);color:var(--primary);transform:translateX(2px)}
.ni.ac{background:#fff;color:var(--primary);box-shadow:0 8px 18px rgba(25,28,30,.06);border-color:rgba(198,197,212,.22)}
.fi{animation:fi .32s ease-out}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.tr{transition:background .2s ease,transform .2s ease}.tr:hover{background:rgba(236,238,241,.75)}
.action-row{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}.action-row .bp,.action-row .bg,.action-row .bs,.action-row .bd{justify-content:center}
.gi,.gs,.bp,.bg,.bd,.bs,.ni,.pa,.pt,.ptd,.cs{touch-action:manipulation}
.stock-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stock-search{flex:1 1 240px;position:relative}
.stock-view-toggle{display:flex;gap:4px}
.stock-header{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;margin-bottom:22px}.stock-header>div:first-child{min-width:0}
.stock-hero-actions{display:flex;gap:8px;flex-wrap:wrap}.stock-hero-actions .btn-label{display:inline}
.stock-filter-card{margin-bottom:18px;padding:16px;border-radius:20px;background:rgba(255,255,255,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.stock-search .gi{padding-left:38px}
.hcard-actions{display:flex;gap:6px}
.repair-status-select{width:auto;min-width:0;max-width:108px;font-size:10px!important;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:4px 22px;border-radius:999px;line-height:1.05;min-height:30px;text-align:center;text-align-last:center;background-position:calc(100% - 14px) calc(50% - 2px),calc(100% - 9px) calc(50% - 2px);background-size:5px 5px,5px 5px}
.repair-status-select.status-received{background:#e8f0ff;border-color:#cad9ff;color:#1842b4}
.repair-status-select.status-ready,.repair-status-select.status-delivered{background:#e7f8ed;border-color:#bde8cb;color:#0d8a55}
.repair-status-select.status-cancelled{background:#ffebeb;border-color:#f4c4c4;color:#b42323}
.repair-status-select.payment-unpaid{background:#f3efd7;border-color:#e7dab1;color:#a26a00}
.repair-status-select.payment-advance{background:#fff1dd;border-color:#f2ddb3;color:#a46400}
.repair-status-select.payment-paid{background:#e7f8ed;border-color:#bde8cb;color:#0d8a55}
.stock-controls-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.parts-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.parts-stat-card{padding:16px}
.parts-sheet-wrap{z-index:930;background:rgba(25,28,30,.24);padding:20px}
.parts-sheet{width:min(520px,92vw);max-height:min(88vh,88dvh);overflow:auto}
.mfd{display:none!important}
.pd{width:8px;height:8px;border-radius:50%;background:var(--ok);animation:pu 2s infinite}@keyframes pu{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(90,169,88,.35)}50%{opacity:.72;box-shadow:0 0 0 8px rgba(90,169,88,0)}}
.so{position:fixed;inset:0;z-index:100;background:rgba(9,16,32,.55);backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;justify-content:center}
.sf{width:280px;height:160px;border:2px solid var(--secondary);border-radius:18px;position:relative;overflow:hidden;box-shadow:0 24px 48px rgba(0,72,216,.18);background:#081528}
.sl{position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--secondary),transparent);animation:sla 2s ease-in-out infinite}
.sbx{position:absolute;left:10%;right:10%;top:24%;bottom:24%;border:2px solid rgba(255,255,255,.9);border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.18);pointer-events:none}
.sbt{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;pointer-events:none}@keyframes sla{0%,100%{top:0}50%{top:calc(100% - 2px)}}
.pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px}
.pt{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;cursor:pointer;border:1px solid rgba(198,197,212,.42);transition:all .2s ease;background:var(--surface-low)}
.pt:hover{border-color:rgba(0,72,216,.4);transform:translateY(-1px);box-shadow:0 10px 16px rgba(25,28,30,.08)}
.pt img{width:100%;height:100%;object-fit:cover}
.ptd{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:rgba(186,26,26,.9);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .2s}
.pt:hover .ptd{opacity:1}
.pa{aspect-ratio:1;border-radius:14px;border:1.5px dashed rgba(0,72,216,.25);background:#f3f6ff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:all .2s;color:var(--secondary);font-size:11px;font-weight:700}
.pa:hover{border-color:var(--secondary);background:#ebf1ff}
.lo{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;animation:fi .2s ease}
.li{max-width:90vw;max-height:75vh;border-radius:16px;object-fit:contain;box-shadow:0 12px 60px rgba(0,0,0,.35)}
.ln{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;transition:all .2s}.ln:hover{background:rgba(255,255,255,.2)}
.co{position:fixed;inset:0;z-index:150;background:rgba(4,10,24,.86);display:flex;align-items:center;justify-content:center;padding:calc(12px + env(safe-area-inset-top,0px)) 16px calc(20px + env(safe-area-inset-bottom,0px));min-height:100vh;min-height:100dvh;overflow:hidden}
.cc{width:min(360px,100%);height:100%;max-height:calc(100vh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 32px);max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;align-items:center;justify-items:center;gap:12px}
.cv{width:min(320px,100%);max-width:100%;aspect-ratio:3/4;max-height:min(56vh,56dvh);border-radius:20px;overflow:hidden;border:2px solid rgba(255,255,255,.18);position:relative;box-shadow:0 0 60px rgba(0,72,216,.18)}
.cv video{width:100%;height:100%;object-fit:cover}
.cs{width:64px;height:64px;border-radius:50%;border:3px solid #fff;background:rgba(255,255,255,.15);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center}.cs:hover{background:rgba(255,255,255,.3);transform:scale(1.05)}.cs:active{transform:scale(.95);background:rgba(255,255,255,.5)}
.ip{width:100%;height:140px;border-radius:14px;overflow:hidden;margin-bottom:14px;position:relative;cursor:pointer;background:var(--surface-low)}
.ip img{width:100%;height:100%;object-fit:cover;transition:transform .4s}.ip:hover img{transform:scale(1.04)}
.ipl{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--text-3);font-size:12px}
.ipc{position:absolute;bottom:8px;right:8px;background:rgba(25,28,30,.72);backdrop-filter:blur(8px);padding:4px 8px;border-radius:12px;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px}
.sh::-webkit-scrollbar{display:none}.sh{-ms-overflow-style:none;scrollbar-width:none}
.sgc,.sgv,.sgp,.sgg{position:relative;overflow:hidden}.sgc::after,.sgv::after,.sgp::after,.sgg::after{content:'';position:absolute;top:-24px;right:-24px;width:128px;height:128px;border-radius:50%;opacity:.08}.sgc::after{background:var(--secondary)}.sgv::after{background:var(--primary)}.sgp::after{background:#7c3aed}.sgg::after{background:var(--success)}
.auth-shell{display:flex;min-height:100vh;background:var(--surface)}
.auth-hero{display:flex;flex:1 1 50%;min-height:100vh;position:relative;background:linear-gradient(180deg,rgba(0,6,102,.86),rgba(0,6,102,.72)),radial-gradient(circle at top,rgba(255,255,255,.18),transparent 32%),linear-gradient(160deg,#1a237e 0%,#000666 60%,#0c205f 100%);color:#fff;padding:56px 56px 48px;overflow:hidden}
.auth-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 70% 15%,rgba(224,224,255,.22),transparent 24%),radial-gradient(circle at 25% 78%,rgba(39,97,254,.2),transparent 28%)}
.auth-hero::after{content:'';position:absolute;right:-14%;bottom:-12%;width:44vw;height:44vw;max-width:480px;max-height:480px;border-radius:50%;background:rgba(255,255,255,.05);filter:blur(1px)}
.auth-hero-content{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:space-between;gap:32px;width:100%}
.auth-badge{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.14);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;width:max-content}
.auth-hero h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:clamp(2.6rem,4vw,4.2rem);line-height:1.04;font-weight:800;letter-spacing:-.04em;max-width:540px}
.auth-hero p{max-width:520px;font-size:17px;line-height:1.75;color:rgba(255,255,255,.82);font-weight:500}
.auth-hero-points{display:flex;gap:18px;flex-wrap:wrap;color:rgba(255,255,255,.76);font-size:13px;font-weight:600}
.auth-panel{display:flex;flex:1 1 50%;min-height:100vh;background:var(--surface-strong);padding:40px 48px;position:relative}
.auth-form-wrap{width:min(460px,100%);margin:auto;display:grid;gap:20px}
.auth-mobile-brand{display:none;align-items:center;gap:10px;color:var(--primary);font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:28px;letter-spacing:-.03em}
.auth-header h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:36px;line-height:1.1;letter-spacing:-.03em;color:var(--text);margin-bottom:8px}
.auth-header p{color:var(--text-2);font-size:15px;line-height:1.7}
.auth-segment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:6px;background:var(--surface-low);border-radius:18px}
.auth-segment button{min-height:42px;border-radius:14px;border:none;background:transparent;color:var(--text-2);font-weight:700;font-size:13px;cursor:pointer;transition:all .2s}
.auth-segment button.active{background:#fff;color:var(--primary);box-shadow:0 8px 18px rgba(25,28,30,.06)}
.auth-card{display:grid;gap:16px}
.auth-field{display:grid;gap:8px}
.auth-field label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-2)}
.auth-key-input{font-family:'Space Mono',monospace;letter-spacing:.08em;text-transform:uppercase;font-size:16px}.billpro-qa{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.billpro-qa-card{border:none;border-radius:20px;padding:24px 16px;min-height:122px;color:#fff;display:grid;justify-items:center;align-content:center;gap:12px;cursor:pointer}.billpro-qa-card.qa-bill{background:#1253d8}.billpro-qa-card.qa-stickers{background:#24349f}.billpro-qa-card.qa-invoices{background:#4f46e5}.billpro-qa-card.qa-reports{background:#5a47ea}.billpro-qa-icon{width:54px;height:54px;border-radius:16px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center}.billpro-qa-card strong{font-size:15px;font-weight:800;letter-spacing:-.01em}@media(max-width:560px){.billpro-qa{gap:10px}.billpro-qa-card{min-height:106px;padding:18px 12px;border-radius:18px}.billpro-qa-icon{width:46px;height:46px;border-radius:14px}.billpro-qa-card strong{font-size:13px}}.billing-page .add-compact-actions.add-desktop-only{position:sticky;bottom:16px;z-index:40;background:#fff;border:1px solid rgba(198,197,212,.25);border-radius:16px;padding:12px 14px;margin-top:12px}.billing-page .desktop-workspace-side .add-desktop-actions{display:none}.stickers-page .sticker-head-actions{display:none}.sticker-bottom-bar{display:flex;gap:10px;position:sticky;bottom:16px;z-index:40;background:#fff;border:1px solid rgba(198,197,212,.25);border-radius:16px;padding:12px 14px;margin-top:12px}.sticker-bottom-bar .bg,.sticker-bottom-bar .bp{flex:1;min-height:50px;justify-content:center;font-size:14px}.billing-page .add-mobile-actions.add-mobile-only,.stickers-page .add-mobile-actions.add-mobile-only{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:60;width:min(820px,calc(100% - 20px));margin:0;padding:10px 12px;border:1px solid rgba(198,197,212,.35);border-radius:18px;box-shadow:0 12px 28px rgba(25,28,30,.14)}.billing-page .add-compact-actions.billing-bottom-bar,.stickers-page .sticker-bottom-bar{display:flex;gap:10px;position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:60;width:min(820px,calc(100% - 32px));background:#fff;border:1px solid rgba(198,197,212,.25);border-radius:16px;padding:12px 14px;margin-top:12px}.billing-page .billing-bottom-bar .bg,.billing-page .billing-bottom-bar .bs{flex:1;min-height:50px;justify-content:center;font-size:14px}.billing-page,.stickers-page{padding-bottom:96px}@media(min-width:1025px){.billing-page .add-compact-actions.billing-bottom-bar,.stickers-page .sticker-bottom-bar{left:calc(50% + 158px);width:min(820px,calc(100% - 348px))}}.invoice-flash{animation:invoice-flash-glow 4s ease-out 1}@keyframes invoice-flash-glow{0%{box-shadow:0 0 0 3px rgba(47,86,215,.55);background:#eef3ff}70%{box-shadow:0 0 0 3px rgba(47,86,215,.55);background:#eef3ff}100%{box-shadow:none}}.invoice-preview-sheet{width:min(560px,94vw);height:min(86dvh,720px);background:var(--c);border:1px solid var(--gbo);border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-lg)}.invoice-preview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--gbo)}.invoice-preview-head strong{display:block;font-size:16px;color:var(--t1)}.invoice-preview-head span{font-size:12px;color:var(--t3)}.invoice-preview-body{flex:1;min-height:0;background:#fff}.invoice-preview-body iframe{width:100%;height:100%;border:none;display:block}.invoice-preview-actions{display:flex;gap:10px;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--gbo);flex-wrap:wrap}.invoice-preview-actions .bp,.invoice-preview-actions .bg{flex:1;min-height:50px;justify-content:center;white-space:nowrap}.invoice-row-icon.icon-view{background:#e9efff;border-color:#cad8ff;color:#3555d7}.transactions-mobile-stack .invoices-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:10px;align-items:stretch}.transactions-mobile-stack .invoices-searchbar{min-height:48px;padding:0 14px;border-radius:14px;gap:10px}.transactions-mobile-stack .invoices-searchbar .gi{font-size:14px}.transactions-mobile-stack .invoices-filter-btn{border-radius:14px;min-height:48px}.transactions-mobile-stack .invoices-ledger{border-radius:18px}.invoices-ledger .invoice-row{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:14px}.invoices-ledger .invoice-row-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.invoices-ledger .invoice-row-id{display:flex;align-items:baseline;gap:8px;min-width:0}.invoices-ledger .invoice-row-id strong{font-size:15px;font-weight:800;color:#111827;letter-spacing:.02em}.invoices-ledger .invoice-row-id span{font-size:12px;color:#8490a7;margin-top:0}.invoices-ledger .invoice-row-customer{font-size:16px;font-weight:700;color:#101828;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.invoices-ledger .invoice-row-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:5px}.invoices-ledger .invoice-row-amount{font-family:'Plus Jakarta Sans',sans-serif;font-size:19px;font-weight:800;color:#0d2b87;white-space:nowrap}.invoices-ledger .invoice-row-actions{margin-top:0}@media(max-width:560px){.invoices-ledger .invoice-row{padding:12px}.invoices-ledger .invoice-row-customer{font-size:15px}.invoices-ledger .invoice-row-amount{font-size:17px}}
.auth-error{display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:16px;background:rgba(255,218,214,.64);border:1px solid rgba(186,26,26,.12);color:var(--danger);font-size:13px;font-weight:600}
.auth-submit{width:100%;justify-content:center;min-height:50px;border-radius:18px;font-size:14px}
.auth-meta{display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:13px;color:var(--text-2);flex-wrap:wrap}
.auth-link{color:var(--secondary);font-weight:700;cursor:pointer;background:none;border:none;padding:0}
.shell{display:flex;min-height:100vh;width:100%;background:#f7f9fc}
.shell-sidebar{width:316px;position:fixed;top:0;left:0;bottom:0;padding:18px 18px 14px;display:flex;flex-direction:column;z-index:60;background:linear-gradient(180deg,#f8fafc 0%,#f1f4f8 100%);border-right:1px solid rgba(198,197,212,.3);box-shadow:18px 0 38px rgba(25,28,30,.04)}
.shell-brand{display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center;gap:14px;padding:10px 12px 28px}
.shell-brand-mark{width:54px;height:54px;border-radius:16px;background:linear-gradient(160deg,#0f46d8 0%,#162b95 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 20px rgba(15,70,216,.22)}
.shell-brand-mark img{width:28px;height:28px;border-radius:10px}
.shell-brand-copy{min-width:0}
.shell-brand-copy strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:800;letter-spacing:-.03em;color:#1f2d8d;line-height:1.15}
.shell-brand small{display:block;margin-top:4px;color:#6f7890;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800}
.shell-footer{display:grid;gap:8px;padding:0 12px;margin-top:8px}
.shell-footer-bottom{display:grid;gap:8px;margin-top:auto;padding-top:8px}
.shell-footer-link{display:flex;align-items:center;gap:12px;padding:12px 14px;border:none;border-radius:16px;background:transparent;color:#465368;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s ease;text-align:left}
.shell-footer-link:hover{background:rgba(255,255,255,.72);color:#23358f}
.shell-status{display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:16px;background:#fff;color:#5b6579;font-size:12px;font-weight:700;border:1px solid rgba(198,197,212,.2)}
.shell-main{margin-left:316px;flex:1;min-width:0;padding:18px 28px 36px;position:relative}
.shell-main.shell-main-add{padding-top:18px}
.shell-main.shell-main-inventory{padding-top:18px}
.shell-main.shell-main-no-mth{padding-top:18px}
.shell-title{min-width:0}.shell-title h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:32px;letter-spacing:-.05em;font-weight:800;color:#171f3f;line-height:1.04}.shell-title p{margin-top:8px;color:#697386;font-size:14px;line-height:1.6;max-width:760px}
.shell-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:rgba(163,246,156,.34);color:#005312;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.mth{position:fixed;top:0;left:0;right:0;z-index:55;display:none;align-items:center;justify-content:space-between;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;background:rgba(247,249,252,.88);backdrop-filter:blur(18px);border-bottom:1px solid rgba(198,197,212,.18)}
.mth-brand{display:flex;align-items:center;gap:10px;min-width:0}.mth-title{min-width:0}.mth-title strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800;color:var(--primary);letter-spacing:-.02em}.mth-title span{display:block;font-size:11px;color:var(--text-3);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.mn{position:fixed;bottom:calc(8px + env(safe-area-inset-bottom,0px));left:8px;right:8px;z-index:60;display:none;gap:4px;padding:6px;border-radius:22px;background:rgba(255,255,255,.96);backdrop-filter:blur(18px);border:1px solid rgba(198,197,212,.2);box-shadow:0 10px 24px rgba(25,28,30,.1);overflow-x:auto}
.mn-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 12px;min-width:64px;flex:1 0 auto;border-radius:18px;color:var(--text-3);cursor:pointer;transition:all .2s ease;font-size:10px;font-weight:700}
.mn-item.active{background:#eef3ff;color:var(--primary)}
.dashboard-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:22px}
.metric-card{position:relative;overflow:hidden}.metric-card .metric-label{color:var(--text-2);font-size:12px;font-weight:700;letter-spacing:.02em}.metric-card .metric-value{font-family:'Plus Jakarta Sans',sans-serif;font-size:30px;font-weight:800;letter-spacing:-.04em;color:var(--text);line-height:1.1;margin-top:10px}.metric-card .metric-sub{color:var(--text-3);font-size:12px;margin-top:8px}
.metric-card.featured{background:linear-gradient(140deg,var(--primary-2),var(--primary));color:#fff;border-color:rgba(0,6,102,.08)}
.metric-card.featured .metric-label,.metric-card.featured .metric-sub,.metric-card.featured .metric-value{color:#fff}
.metric-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;background:rgba(163,246,156,.34);color:#005312;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.dashboard-retail{width:min(880px,100%);margin:0 auto;display:grid;gap:14px}
.dashboard-retail-hero{display:grid;gap:14px;padding:16px 18px;border-radius:24px;background:linear-gradient(180deg,#ffffff 0%,#f2f5fb 100%);border:1px solid rgba(198,197,212,.22);box-shadow:0 12px 24px rgba(25,28,30,.05)}
.dashboard-retail-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.dashboard-retail-brand{display:flex;align-items:center;gap:14px;min-width:0}.dashboard-retail-brand-mark{width:52px;height:52px;border-radius:18px;background:#e8eefb;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.9)}.dashboard-retail-brand-mark img{width:28px;height:28px;border-radius:10px}.dashboard-retail-brand h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:34px;line-height:1;font-weight:800;letter-spacing:-.05em;color:#183a90}.dashboard-retail-brand p{margin-top:6px;color:var(--text-2);font-size:13px;line-height:1.6}
.dashboard-retail-top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dashboard-retail-status{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;background:#98f09b;color:#063f16;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;box-shadow:inset 0 -1px 0 rgba(0,0,0,.06)}.dashboard-retail-status.offline{background:#ffe8b3;color:#7c4a03}.dashboard-retail-icon-btn{width:46px;height:46px;border:none;border-radius:16px;background:#edf1f8;color:#6a778f;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s ease}.dashboard-retail-icon-btn:hover{background:#e1e8f6;color:var(--primary)}
.dashboard-retail-search{display:flex;align-items:center;gap:12px;width:100%;padding:15px 18px;border:none;border-radius:20px;background:#fff;color:#707789;font-size:15px;text-align:left;box-shadow:0 8px 18px rgba(25,28,30,.04);border:1px solid rgba(198,197,212,.18);cursor:pointer}.dashboard-retail-search span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dashboard-retail-alert{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:16px;font-size:12px;font-weight:700}.dashboard-retail-alert.danger{background:rgba(255,218,214,.82);color:var(--err);border:1px solid rgba(186,26,26,.12)}.dashboard-retail-alert.warn{background:rgba(255,241,194,.92);color:var(--warn);border:1px solid rgba(217,119,6,.14)}
.dashboard-retail-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.dashboard-retail-metric{padding:14px 15px;border-radius:20px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 8px 20px rgba(25,28,30,.05);display:grid;gap:10px;min-width:0}.dashboard-retail-metric-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.dashboard-retail-metric-icon{width:42px;height:42px;border-radius:12px;background:#eaf0fd;color:#243f9f;display:flex;align-items:center;justify-content:center}.dashboard-retail-metric-tag{padding:5px 8px;border-radius:9px;background:#a8f1a7;color:#1b7c2e;font-size:10px;font-weight:800}.dashboard-retail-metric-label{color:#697386;font-size:12px;font-weight:700}.dashboard-retail-metric-value{font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.04em;color:#111827}.dashboard-retail-metric-sub{color:var(--text-2);font-size:11px;line-height:1.45}
.dashboard-retail-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.dashboard-retail-action{border:none;border-radius:18px;padding:14px 12px;background:linear-gradient(135deg,#1253d8,#0c4ad0);color:#fff;display:grid;justify-items:center;gap:9px;cursor:pointer;box-shadow:0 10px 20px rgba(18,83,216,.18)}.dashboard-retail-action:nth-child(2){background:linear-gradient(135deg,#24349f,#1a2f93)}.dashboard-retail-action:nth-child(3){background:linear-gradient(135deg,#4f46e5,#4338ca)}.dashboard-retail-action:nth-child(4){background:linear-gradient(135deg,#5a47ea,#4d39d7)}.dashboard-retail-action strong{font-size:14px;font-weight:800;letter-spacing:-.02em}.dashboard-retail-action span{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
.dashboard-retail-panels{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.2fr);gap:12px;align-items:start}.dashboard-retail-panel{padding:13px;border-radius:18px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 10px 20px rgba(25,28,30,.05)}.dashboard-retail-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dashboard-retail-panel-head h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800;letter-spacing:-.03em;color:#111827}.dashboard-retail-panel-head button{border:none;background:none;color:#0d4cff;font-size:12px;font-weight:800;cursor:pointer;padding:0}.dashboard-retail-fill{display:inline-flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:9px;background:#eef3ff;color:#21399a;font-size:10px;font-weight:800}
.dashboard-retail-mix{display:grid;gap:8px}.dashboard-retail-mix-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center}.dashboard-retail-mix-tone{width:4px;height:22px;border-radius:999px}.dashboard-retail-mix-copy{display:grid;gap:4px}.dashboard-retail-mix-title{display:flex;justify-content:space-between;gap:8px;color:#111827;font-size:12px;font-weight:700}.dashboard-retail-mix-bar{width:100%;height:4px;border-radius:999px;background:#edf2f8;overflow:hidden}.dashboard-retail-mix-bar div{height:100%;border-radius:999px}.dashboard-retail-mix-row strong{font-size:12px;color:#111827}
.dashboard-retail-activity{display:grid;gap:10px}.dashboard-retail-activity-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 14px 12px 16px;border-radius:14px;background:#f5f7fb;border-left:4px solid #0d4cff}.dashboard-retail-activity-item.nongst{border-left-color:#7f8598}.dashboard-retail-activity-main{display:flex;align-items:center;gap:10px;min-width:0}.dashboard-retail-activity-icon{width:36px;height:36px;border-radius:10px;background:#e8eefc;color:#0d4cff;display:flex;align-items:center;justify-content:center;flex-shrink:0}.dashboard-retail-activity-copy{min-width:0}.dashboard-retail-activity-title{font-size:14px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dashboard-retail-activity-meta{margin-top:2px;color:#717b8f;font-size:12px}.dashboard-retail-activity-side{text-align:right;display:grid;gap:6px;justify-items:end}.dashboard-retail-activity-amount{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:800;color:#111827}.dashboard-retail-bill{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border-radius:7px;font-size:10px;font-weight:800}.dashboard-retail-bill.gst{background:#a8f1a7;color:#135b25}.dashboard-retail-bill.nongst{background:#e2e7f0;color:#66738b}
.mth.dashboard-retail-mobile{padding:calc(18px + env(safe-area-inset-top,0px)) 18px 16px;background:#f7f9fc;border-bottom:1px solid rgba(198,197,212,.18)}.mth.dashboard-retail-mobile .mth-brand{gap:12px}.mth.dashboard-retail-mobile .mth-brand-mark{width:44px;height:44px;border-radius:16px;background:#e8eefb;display:flex;align-items:center;justify-content:center}.mth.dashboard-retail-mobile .mth-brand-mark img{width:24px;height:24px;border-radius:8px}.mth.dashboard-retail-mobile .mth-title strong{font-size:16px;color:#183a90}.mth.dashboard-retail-mobile .mth-title span{display:none}.mth.dashboard-retail-mobile .dashboard-retail-status{padding:8px 12px;font-size:10px}.mth.dashboard-retail-mobile .dashboard-retail-icon-btn{width:40px;height:40px;border-radius:14px}
.dashboard-retail-desktop,.stock-modern-desktop-head,.stock-modern-table,.transactions-desktop-head,.transactions-summary-grid,.transactions-desktop-table,.reports-desktop-hero{display:none}
.dashboard-retail-mobile-stack,.transactions-mobile-stack,.stock-modern-mobile-grid{display:grid}
.dashboard-executive-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px}
.dashboard-executive-copy h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:34px;font-weight:800;letter-spacing:-.05em;color:#202c8e;line-height:1.04}
.dashboard-executive-copy p{margin-top:8px;color:#374151;font-size:15px;line-height:1.65}
.dashboard-executive-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end}
.dashboard-action-ghost,.dashboard-action-primary{display:inline-flex;align-items:center;gap:10px;min-height:54px;padding:0 22px;border-radius:16px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid rgba(198,197,212,.18);box-shadow:0 10px 22px rgba(25,28,30,.04)}
.dashboard-action-ghost{background:#fff;color:#24359a}.dashboard-action-primary{background:#163cae;color:#fff;border-color:#163cae}
.dashboard-kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.dashboard-kpi-card{position:relative;padding:24px 26px;border-radius:26px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 16px 26px rgba(25,28,30,.04);overflow:hidden;display:grid;gap:14px;min-height:136px;align-content:start}
.dashboard-kpi-label{font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#1f2937;position:relative;z-index:1;max-width:calc(100% - 60px)}
.dashboard-kpi-value{display:flex;align-items:center;gap:10px;font-family:'Plus Jakarta Sans',sans-serif;font-size:40px;font-weight:800;letter-spacing:-.05em;color:#26319d;line-height:1.05;position:relative;z-index:1;flex-wrap:wrap}
.dashboard-main-grid{display:grid;grid-template-columns:minmax(300px,.58fr) minmax(0,1.42fr);gap:20px;align-items:start}
.dashboard-card{background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 20px 30px rgba(25,28,30,.04);border-radius:30px;overflow:hidden}
.dashboard-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:32px 40px 18px}
.dashboard-card-head h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.04em;color:#202c8e}
.dashboard-card-head button{border:none;background:none;color:#3845ff;font-size:14px;font-weight:700;cursor:pointer}
.dashboard-stock-body{padding:6px 40px 36px;display:grid;gap:20px}
.dashboard-mix-track{display:grid;gap:18px}
.dashboard-mix-item{display:grid;gap:10px}
.dashboard-mix-item-top{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;font-weight:700;color:#111827}
.dashboard-mix-item-top strong{font-size:14px;color:#3845ff}
.dashboard-mix-bar{height:14px;border-radius:999px;background:#eef2f7;overflow:hidden}
.dashboard-mix-bar div{height:100%;border-radius:999px}
.dashboard-transactions-head{display:grid;grid-template-columns:minmax(0,1.52fr) 190px 130px 170px;gap:16px;padding:0 40px 18px;color:#94a3b8;font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;border-top:1px solid rgba(198,197,212,.12)}
.dashboard-transactions-head span{white-space:nowrap}
.dashboard-transactions-list{display:grid}
.dashboard-transactions-row{display:grid;grid-template-columns:minmax(0,1.52fr) 190px 130px 170px;gap:16px;align-items:center;padding:22px 40px;border-top:1px solid #edf0f6}
.dashboard-transactions-row > *{min-width:0}
.dashboard-transactions-item{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;align-items:center;min-width:0}
.dashboard-transactions-item > div{min-width:0}
.dashboard-transactions-icon{width:44px;height:44px;border-radius:14px;background:#eef2f7;color:#95a2b7;display:flex;align-items:center;justify-content:center}
.dashboard-transactions-item strong{display:-webkit-box;font-size:16px;font-weight:800;color:#111827;line-height:1.25;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:normal}
.dashboard-transactions-item span{display:-webkit-box;margin-top:6px;font-size:13px;color:#94a3b8;line-height:1.5;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:normal}
.dashboard-transactions-amount{min-width:0}
.dashboard-transactions-amount strong{display:block;font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;color:#1d2b92;line-height:1.2;white-space:nowrap}
.dashboard-transactions-amount span{display:block;margin-top:6px;color:#0b6a2f;font-size:12px;font-weight:800;line-height:1.3;white-space:nowrap}
.dashboard-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:999px;background:#dff7df;color:#2b7f3b;font-size:12px;font-weight:800}
.dashboard-status-pill.pending{background:#eceff3;color:#5f6778}
.dashboard-transactions-time{color:#334155;font-size:14px;line-height:1.55;white-space:nowrap}
.stock-modern-desktop-head{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px;padding:6px 4px 4px}
.stock-modern-desktop-copy h1,.transactions-desktop-copy h1,.reports-desktop-copy h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:34px;font-weight:800;letter-spacing:-.05em;color:#202c8e;line-height:1.04}
.stock-modern-desktop-copy p,.transactions-desktop-copy p,.reports-desktop-copy p{margin-top:8px;color:#475467;font-size:14px;line-height:1.7}
.stock-modern-desktop-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#64748b;font-size:13px;font-weight:700}
.stock-modern-desktop-meta strong{color:#111827}
.stock-modern-desktop-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.stock-modern-desktop-actions .bp{min-height:52px;padding:0 22px;border-radius:16px}
.stock-modern-table{border-radius:28px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 18px 30px rgba(25,28,30,.04);overflow:hidden}
.stock-modern-table-head,.stock-modern-table-row{display:grid;grid-template-columns:minmax(0,1.4fr) 160px 170px 130px 110px 140px 160px;gap:14px;align-items:center}
.stock-modern-table-head{padding:18px 24px;background:#f8fafc;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.stock-modern-table-row{padding:18px 24px;border-top:1px solid #edf0f6}
.stock-device-cell{display:grid;grid-template-columns:52px minmax(0,1fr);gap:14px;align-items:center}
.stock-device-thumb{width:52px;height:52px;border-radius:16px;overflow:hidden;background:#eef2f7;display:flex;align-items:center;justify-content:center;color:#667085}
.stock-device-thumb img{width:100%;height:100%;object-fit:cover}
.stock-device-copy strong{display:block;font-size:15px;font-weight:800;color:#111827}.stock-device-copy span{display:block;margin-top:5px;font-size:13px;color:#94a3b8}
.stock-status-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:800;background:#eef2ff;color:#3241b7}
.stock-status-pill.good{background:#ddf8e5;color:#17603a}.stock-status-pill.warn{background:#fff1e6;color:#9a5600}
.table-action-row{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.table-action-btn{width:36px;height:36px;border-radius:12px;border:1px solid rgba(198,197,212,.22);background:#f8fafc;color:#55627a;display:flex;align-items:center;justify-content:center;cursor:pointer}
.table-action-btn.primary{background:#163cae;border-color:#163cae;color:#fff}
.table-action-btn.danger{background:#ffe7e3;border-color:#ffd0ca;color:#b42323}
.transactions-desktop-head,.reports-desktop-hero{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px}
.transactions-desktop-actions,.reports-desktop-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
.transactions-desktop-search{width:min(360px,34vw);min-width:260px;border-radius:16px;min-height:50px;padding:0 14px;box-shadow:0 12px 24px rgba(25,28,30,.04)}
.transactions-desktop-search .gi{font-size:14px}
.transactions-summary-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.transactions-summary-card{padding:24px 26px;border-radius:24px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 18px 28px rgba(25,28,30,.04);display:grid;gap:10px}
.transactions-summary-card span{font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
.transactions-summary-card strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:30px;font-weight:800;letter-spacing:-.05em;color:#202c8e}
.transactions-summary-card em{font-style:normal;color:#64748b;font-size:13px}
.transactions-desktop-table{border-radius:28px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 18px 28px rgba(25,28,30,.04);overflow:hidden}
.transactions-table-head,.transactions-table-row{display:grid;grid-template-columns:130px minmax(0,1.25fr) 170px 120px 130px 150px;gap:16px;align-items:center}
.transactions-table-head{padding:18px 26px;background:#f8fafc;color:#94a3b8;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
.transactions-table-row{padding:20px 26px;border-top:1px solid #edf0f6}
.transactions-table-row > *{min-width:0}
.transactions-table-cell strong{display:block;font-size:16px;font-weight:800;color:#111827;word-break:break-word}.transactions-table-cell span{display:block;margin-top:5px;font-size:13px;color:#94a3b8;line-height:1.55;word-break:break-word}
.transactions-table-amount{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;font-weight:800;color:#1d2b92}
.transactions-table-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.reports-desktop-actions .bp,.reports-desktop-actions .bg{min-height:50px;padding:0 18px;border-radius:16px}
.reports-modern-feed.mobile-preview{display:grid}
.section-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.section-grid>.span-7{grid-column:span 7}.section-grid>.span-5{grid-column:span 5}.section-grid>.span-12{grid-column:span 12}
.list-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:14px 0;border-top:1px solid rgba(198,197,212,.16)}.list-row:first-child{border-top:none;padding-top:0}.list-row:last-child{padding-bottom:0}
.list-row-title{color:var(--text);font-size:14px;font-weight:700}.list-row-meta{color:var(--text-2);font-size:12px;line-height:1.6;margin-top:4px}.list-row-value{font-size:14px;font-weight:800;color:var(--text)}
.inventory-list{display:flex;flex-direction:column;gap:10px}
.hcard{border-radius:20px!important;border:1px solid rgba(198,197,212,.18)!important;background:#fff!important;box-shadow:0 10px 26px rgba(25,28,30,.05)!important}
.hcard-photo{background:var(--surface-low)}.hcard-details{gap:12px}.hcard-title{font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:-.02em}.hcard-imei{font-variant-numeric:tabular-nums;color:var(--text-3)!important}.hcard-actions .bg,.hcard-actions .bd,.hcard-ab{min-width:36px;min-height:36px;padding:8px!important;border-radius:12px!important}
.stock-modern{width:min(1120px,100%);margin:0 auto;display:grid;gap:14px}
.stock-modern-controls{position:relative;z-index:32;display:grid;gap:10px;padding-bottom:8px;background:linear-gradient(180deg,#f7f9fc 0%,rgba(247,249,252,.96) 78%,rgba(247,249,252,0) 100%)}
.stock-modern-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 2px}
.stock-modern-brand{display:flex;align-items:center;gap:12px;font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;color:#15358f;letter-spacing:-.03em}
.stock-modern-brand span{width:34px;height:34px;border-radius:12px;background:#e8eefb;display:flex;align-items:center;justify-content:center;color:#1b4dd8}
.stock-modern-icon-btn{width:42px;height:42px;border-radius:14px;border:1px solid rgba(198,197,212,.2);background:#fff;color:#1b3e98;display:flex;align-items:center;justify-content:center}
.stock-modern-search{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:16px;background:#f2f4f9;border:1px solid rgba(198,197,212,.22)}
.stock-modern-search svg{color:#737e95;flex-shrink:0}
.stock-modern-search .gi{border:none!important;background:transparent!important;padding:0!important;min-height:0!important;font-size:16px;color:#3f4a5e}
.stock-modern-search .gi:focus{box-shadow:none}
.stock-modern-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:#fff;padding:6px;border:1px solid rgba(198,197,212,.26);border-radius:14px}
.stock-modern-pill{background:#f3f4f8!important;border:1px solid rgba(198,197,212,.28)!important;border-radius:14px!important;padding:11px 33px 11px 14px!important;font-size:14px!important;color:#1f2430;min-height:48px;background-position:calc(100% - 16px) calc(50% - 2px),calc(100% - 10px) calc(50% - 2px)}
.stock-modern-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.stock-modern-card{display:grid;grid-template-rows:auto 1fr;border-radius:16px;border:1px solid rgba(198,197,212,.22);background:#fff;overflow:hidden;box-shadow:0 8px 20px rgba(25,28,30,.05);cursor:pointer}
.stock-modern-card-media{position:relative;aspect-ratio:4/4;cursor:pointer;background:#dfe5ef;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stock-modern-card-media img{width:100%;height:100%;object-fit:cover}
.stock-modern-condition{position:absolute;top:10px;right:10px;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:900;letter-spacing:.04em;z-index:2}
.stock-modern-condition.mint{background:#95f1b1;color:#004f26}
.stock-modern-condition.good{background:#e8edff;color:#132768}
.stock-modern-condition.fair{background:#ffe0de;color:#9b1d1d}
.stock-modern-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff}
.stock-modern-placeholder span{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
.stock-modern-placeholder svg{opacity:.55}
.stock-modern-card-body{padding:12px 12px 13px;display:grid;gap:8px}
.stock-modern-brand-name{font-size:13px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#0e4ce1}
.stock-modern-card-body h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.03em;color:#171a26;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.stock-modern-imei{font-size:12px;color:#838b9e}
.stock-modern-specs{display:flex;gap:6px;flex-wrap:wrap}
.stock-modern-specs span{font-size:11px;font-weight:800;color:#5f6678;background:#eef1f7;border-radius:6px;padding:4px 7px}
.stock-modern-price-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-top:8px;border-top:1px solid rgba(198,197,212,.3)}
.stock-modern-price-row small{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:#7f8798}
.stock-modern-price-row strong{display:block;margin-top:2px;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800;color:#0b1e70;line-height:1.2}
.stock-modern-price-row strong.up{color:#1f9f58}
.stock-modern-price-row strong.down{color:#b42323}
.stock-modern-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.stock-modern-action{height:42px;border-radius:10px;border:1px solid rgba(198,197,212,.25);background:#e8ebf2;color:#3e4658;display:flex;align-items:center;justify-content:center}
.stock-modern-action.primary{background:#0c4fde;border-color:#0c4fde;color:#fff}
.stock-modern-action.danger{background:#ffe3e1;border-color:#ffc8c2;color:#9d1111}
.stock-modern-footer-note{display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#dbe1ec;padding:2px 4px 0}
.stock-modern-footer-note span{color:#d0d8e7}
.invoices-modern{width:min(760px,100%);margin:0 auto;display:grid;gap:10px}
.invoices-toolbar{display:grid;grid-template-columns:minmax(0,1fr) 42px;gap:8px}
.invoices-searchbar{display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid rgba(198,197,212,.26);border-radius:3px;min-height:40px}
.invoices-searchbar svg{color:#96a0b6;flex-shrink:0}
.invoices-searchbar .gi{border:none!important;background:transparent!important;padding:0!important;min-height:0!important;font-size:13px;color:#46516a}
.invoices-searchbar .gi:focus{box-shadow:none}
.invoices-filter-btn{border:1px solid rgba(198,197,212,.26);background:#fff;border-radius:3px;color:#5f6f8f;display:flex;align-items:center;justify-content:center;min-height:40px}
.invoices-ledger{background:#fff;border:1px solid rgba(198,197,212,.24);border-radius:0;overflow:hidden}
.invoice-row{display:grid;grid-template-columns:68px minmax(0,1fr) auto;gap:10px;align-items:start;padding:12px 8px 12px 10px;border-bottom:1px solid #edf0f6}
.invoice-row:last-child{border-bottom:none}
.invoice-row-id strong{display:block;font-size:18px;line-height:1.1;font-weight:800;color:#8da0bf;letter-spacing:.02em}
.invoice-row-id span{display:block;margin-top:2px;font-size:11px;color:#8490a7}
.invoice-row-main{min-width:0;display:grid;gap:2px}
.invoice-row-main strong{display:block;font-size:17px;font-weight:700;color:#101828;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.invoice-row-item{margin-top:3px;display:inline-flex;align-items:center;gap:4px;font-size:15px;color:#8b97ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.invoice-row-item svg{width:13px;height:13px;flex-shrink:0}
.invoice-row-finance{display:grid;justify-items:end;gap:4px}
.invoice-row-finance strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;line-height:1;font-weight:800;color:#0d2b87;white-space:nowrap}
.invoice-row-status{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border-radius:4px;font-size:13px;font-weight:800;letter-spacing:.04em}
.invoice-row-status.paid{background:#d9f2e4;color:#1f8e57}
.invoice-row-status.due{background:#ffe2dd;color:#d14343}
.invoice-row-actions{display:flex;align-items:center;gap:7px;margin-top:4px}
.invoice-row-icon{width:28px;height:28px;border:1px solid transparent;border-radius:7px;background:#eef2ff;color:#4c5ec7;display:flex;align-items:center;justify-content:center}
.invoice-row-icon.icon-share{background:#e9efff;border-color:#cad8ff;color:#3555d7}
.invoice-row-icon.icon-msg{background:#e8f8ef;border-color:#bde8cc;color:#1e9f5a}
.invoice-row-icon.icon-download{background:#fff2dd;border-color:#f3ddb1;color:#aa6a00}
.invoice-row-icon svg{width:14px;height:14px}
.invoices-end{padding:12px 0 2px;text-align:center;font-size:14px;font-weight:800;letter-spacing:.14em;color:#9aabc8}
.reports-modern{width:min(940px,100%);margin:0 auto;display:grid;gap:8px}
.reports-modern-top{display:grid;gap:6px;padding:0 2px}
.reports-modern-head h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:23px;font-weight:800;letter-spacing:-.03em;color:#1b2234;line-height:1.05}
.reports-modern-head p{margin-top:2px;color:#6f778a;font-size:11px;font-weight:700;line-height:1.4}
.reports-modern-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.reports-modern-actions .bp,.reports-modern-actions .bg{min-height:34px;padding:7px 8px;border-radius:10px;font-size:11px;justify-content:center;gap:5px}
.reports-modern-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:8px;border-radius:14px;background:#fff;border:1px solid rgba(198,197,212,.24)}
.reports-modern-control{display:flex;align-items:center;gap:6px;padding:0 8px;min-height:36px;border-radius:10px;background:#f4f6fa;border:1px solid rgba(198,197,212,.2)}
.reports-modern-control svg{width:13px;height:13px;color:#7f8aa3;flex-shrink:0}
.reports-modern-control .gs,.reports-modern-control .gi{border:none!important;background:transparent!important;padding:0!important;min-height:0!important;font-size:12px;color:#364152}
.reports-modern-control .gs:focus,.reports-modern-control .gi:focus{box-shadow:none}
.reports-modern-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:0 2px}
.reports-modern-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.reports-modern-kpi{padding:8px 7px;border-radius:12px;background:#fff;border:1px solid rgba(198,197,212,.22);display:grid;gap:4px}
.reports-modern-kpi-label{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#788298}
.reports-modern-kpi-value{font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:800;color:#1f2937;line-height:1.1}
.reports-modern-kpi-value.sales{color:#1d4ed8}
.reports-modern-kpi-value.warn{color:#b45309}
.reports-modern-kpi-value.ok{color:#1f9f58}
.reports-modern-feed{padding:8px;border-radius:14px;background:#fff;border:1px solid rgba(198,197,212,.24);display:grid;gap:6px}
.reports-modern-feed-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 2px}
.reports-modern-feed-head strong{font-size:12px;color:#1f2937}
.reports-modern-feed-head span{font-size:10px;color:#7b8498;font-weight:700}
.reports-modern-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:#f4f7fb}
.reports-modern-type{display:inline-flex;align-items:center;justify-content:center;padding:3px 6px;border-radius:7px;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;background:#e8eefc;color:#3555d7}
.reports-modern-type.buy{background:#fff2dd;color:#a46400}
.reports-modern-type.add{background:#ece8ff;color:#5c43c7}
.reports-modern-type.repair{background:#e8f8ef;color:#1e9f5a}
.reports-modern-row-main{min-width:0}
.reports-modern-row-main strong{display:block;font-size:12px;font-weight:700;color:#111827;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reports-modern-row-main span{display:block;margin-top:1px;font-size:10px;color:#7f8798;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reports-modern-amt{font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap}
.reports-modern-empty{padding:16px 10px;text-align:center;font-size:12px;color:#6f778a}
.reports-modern-more{padding:2px 2px 0;text-align:center;font-size:10px;font-weight:700;color:#7d879c}
.reports-modern-morefilters{border:1px solid rgba(198,197,212,.24);background:#fff;border-radius:12px;padding:6px 8px}
.reports-modern-morefilters summary{cursor:pointer;list-style:none;font-size:11px;font-weight:800;color:#3659d8;letter-spacing:.04em;text-transform:uppercase}
.reports-modern-morefilters[open] summary{margin-bottom:6px}
.reports-modern-filter-note{padding:0 2px;font-size:10px;color:#7b8498;line-height:1.35}
@media(min-width:1080px){.stock-modern-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1500px){.stock-modern-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:1024px){.stock-modern{padding-top:146px}.stock-modern-controls{position:fixed;left:0;right:0;top:0;transform:none;width:100%;max-width:none;z-index:70;padding:calc(8px + env(safe-area-inset-top,0px)) 16px 10px}}
@media(max-width:768px){.stock-modern{gap:11px;padding-top:140px}.stock-modern-controls{padding-bottom:7px}.stock-modern-brand{font-size:18px}.stock-modern-brand span{width:30px;height:30px;border-radius:10px}.stock-modern-search{padding:12px 13px}.stock-modern-filters{gap:8px}.stock-modern-pill{min-height:44px;padding:10px 29px 10px 11px!important;font-size:13px!important}.stock-modern-grid{gap:10px}.stock-modern-card-body{padding:10px}.stock-modern-card-body h3{font-size:16px}.stock-modern-imei{font-size:11px}.stock-modern-price-row small{font-size:10px}.stock-modern-price-row strong{font-size:15px}.stock-modern-action{height:38px;border-radius:9px}.stock-modern-footer-note{font-size:22px}}
@media(max-width:560px){.stock-modern{padding-top:128px}.stock-modern-brand{font-size:17px}.stock-modern-icon-btn{width:38px;height:38px;border-radius:12px}.stock-modern-search{padding:11px 12px;border-radius:14px}.stock-modern-search .gi{font-size:14px}.stock-modern-pill{min-height:40px;padding:8px 26px 8px 10px!important;font-size:12px!important}.stock-modern-grid{gap:9px}.stock-modern-condition{top:8px;right:8px;padding:4px 10px;font-size:10px}.stock-modern-card-body{gap:7px;padding:9px 9px 10px}.stock-modern-brand-name{font-size:10px}.stock-modern-card-body h3{font-size:15px}.stock-modern-specs span{font-size:10px;padding:3px 6px}.stock-modern-price-row{gap:7px;padding-top:7px}.stock-modern-price-row strong{font-size:14px}.stock-modern-action{height:36px}.stock-modern-footer-note{font-size:18px}.invoices-modern{gap:8px}.invoices-toolbar{grid-template-columns:minmax(0,1fr) 40px;gap:6px}.invoices-searchbar{min-height:38px;padding:0 9px}.invoices-ledger{border-radius:0}.invoice-row{grid-template-columns:58px minmax(0,1fr) auto;gap:8px;padding:10px 6px 10px 8px}.invoice-row-id strong{font-size:13px}.invoice-row-id span{font-size:10px}.invoice-row-main strong{font-size:14px}.invoice-row-item{font-size:12px}.invoice-row-finance strong{font-size:17px}.invoice-row-status{font-size:10px;padding:2px 6px}.invoice-row-actions{gap:6px;margin-top:3px}.invoice-row-icon{width:24px;height:24px;border-radius:6px}.invoice-row-icon svg{width:12px;height:12px}.invoices-end{font-size:12px;letter-spacing:.12em}.reports-modern{gap:7px}.reports-modern-top{gap:5px}.reports-modern-head h1{font-size:20px}.reports-modern-head p{font-size:10px}.reports-modern-actions .bp,.reports-modern-actions .bg{min-height:32px;font-size:10px;padding:6px 6px}.reports-modern-controls{grid-template-columns:repeat(2,minmax(0,1fr));padding:7px;gap:5px}.reports-modern-control{min-height:34px;padding:0 7px}.reports-modern-control .gs,.reports-modern-control .gi{font-size:11px}.reports-modern-dates{gap:5px}.reports-modern-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.reports-modern-kpi{padding:7px 6px;border-radius:11px}.reports-modern-kpi-label{font-size:8px}.reports-modern-kpi-value{font-size:14px}.reports-modern-feed{padding:7px;gap:5px}.reports-modern-row{padding:7px;gap:6px}.reports-modern-type{font-size:8px;padding:2px 5px}.reports-modern-row-main strong{font-size:11px}.reports-modern-row-main span{font-size:9px}.reports-modern-amt{font-size:11px}.reports-modern-morefilters{padding:5px 7px}.reports-modern-morefilters summary{font-size:10px}}
.empty-state{display:grid;justify-items:center;gap:10px;text-align:center}
.add-desktop-only{display:block}.add-mobile-only{display:none}
.add-pos{width:min(980px,100%);margin:0 auto;display:grid;gap:14px}.add-pos-hero{display:grid;gap:12px;padding:16px 18px;border-radius:24px;background:linear-gradient(180deg,#ffffff 0%,#f2f5fb 100%);border:1px solid rgba(198,197,212,.22);box-shadow:0 12px 24px rgba(25,28,30,.05)}.add-pos-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}.add-pos-title{display:flex;align-items:flex-start;gap:12px;min-width:0}.add-pos-mark{width:46px;height:46px;border-radius:16px;background:#e8eefb;display:flex;align-items:center;justify-content:center;color:#1f46aa;flex-shrink:0}.add-pos-title h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:30px;line-height:1.02;font-weight:800;letter-spacing:-.05em;color:#183a90}.add-pos-title p{margin-top:6px;color:var(--text-2);font-size:13px;line-height:1.6;max-width:620px}.add-pos-chip{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;background:#eef3ff;color:#2141a3;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.add-mobile-hero{display:none}.add-mobile-top{display:flex;align-items:center;gap:12px}.add-mobile-back{width:44px;height:44px;border:none;border-radius:14px;background:transparent;color:#1b2230;display:flex;align-items:center;justify-content:center;cursor:pointer}.add-mobile-header-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:24px;font-weight:800;letter-spacing:-.04em;color:#111827}
.add-stock-layout{gap:14px}.add-step-header{display:grid;gap:12px;padding:0}
.add-step-track{display:flex;justify-content:center;gap:16px}.add-step-dot{width:12px;height:12px;border-radius:999px;background:#d5d9e5;transition:all .2s ease}.add-step-dot.active{width:48px;background:var(--primary)}
.add-step-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.add-step-tab{appearance:none;background:#edf1f8;border:1px solid transparent;border-radius:16px;padding:12px 8px;color:#6b7488;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:all .2s ease}
.add-step-tab.active{color:var(--primary);border-bottom-color:var(--primary)}
.add-step-tab.active{background:#fff;color:var(--primary);border-color:rgba(0,72,216,.14);box-shadow:0 8px 18px rgba(25,28,30,.05)}
.add-step-copy h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.03em;color:var(--text)}
.add-step-copy p{margin-top:6px;color:var(--text-2);font-size:13px;line-height:1.6}.add-step-frame{padding:14px;border-radius:20px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 10px 20px rgba(25,28,30,.05)}.add-mobile-divider{height:1px;background:rgba(198,197,212,.55);margin:2px -16px 0}
.add-step-sections{display:grid;gap:12px}.add-section-group{display:grid;gap:12px}
.add-ref-card{background:#f3f6fb;border:1px solid rgba(198,197,212,.16);border-radius:20px;box-shadow:none}
.add-ref-title{color:#3d4051;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
.add-brand-grid{display:grid;grid-template-columns:minmax(110px,.5fr) minmax(0,1fr);gap:10px}.add-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.add-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.add-input-shell{display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid rgba(198,197,212,.22);border-radius:14px;box-shadow:none}
.add-input-shell .gi,.add-input-shell .gs{background:transparent;border:none;box-shadow:none;padding:12px 2px;font-size:15px}.add-input-shell .gi:focus,.add-input-shell .gs:focus{background:transparent;box-shadow:none}
.add-scan-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;background:transparent;color:#6f7282;cursor:pointer;border-radius:12px;transition:background .2s ease,color .2s ease}.add-scan-btn:hover{background:#eef1f7;color:var(--primary)}
.add-inline-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.add-link-btn{appearance:none;background:transparent;border:none;color:#1141da;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:0}
.add-condition-pills{display:flex;gap:8px;flex-wrap:wrap}.add-condition-pill{appearance:none;border:none;border-radius:999px;padding:12px 16px;background:#dfe3ec;color:#3e4252;font-size:12px;font-weight:800;cursor:pointer;transition:all .2s ease}.add-condition-pill.active{background:var(--primary);color:#fff;box-shadow:0 8px 16px rgba(0,6,102,.18)}
.add-helper-copy{color:var(--text-2);font-size:13px;line-height:1.6}
.add-mobile-actions{display:none;width:100%}.add-desktop-actions{display:flex}.add-save-draft{background:#e1e5ee;color:#1f2231;border:1px solid rgba(198,197,212,.45);box-shadow:none}.add-note-card{background:#fff;border:1px solid rgba(198,197,212,.18);border-radius:16px;padding:14px;display:grid;gap:8px}.add-note-card strong{color:var(--text);font-size:13px;font-weight:800}.add-note-card span{color:var(--text-2);font-size:12px;line-height:1.6}.add-side-note{position:sticky;top:16px}.add-mobile-actions .bg,.add-mobile-actions .bp,.add-mobile-actions .bs{width:100%;min-width:0;min-height:54px;border-radius:18px;justify-content:center;font-size:14px}.add-mobile-actions .bg{background:#e4e8f0;color:#293041;border:1px solid rgba(198,197,212,.18);box-shadow:none}.add-mobile-actions .bp{box-shadow:0 12px 22px rgba(0,72,216,.18)}.add-mobile-actions .bs{box-shadow:0 12px 22px rgba(26,127,55,.18)}
.add-compact{width:min(820px,100%);margin:0 auto;display:grid;gap:10px}.add-compact-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.add-compact-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.add-compact-card{display:grid;gap:10px;padding:14px;border-radius:22px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 10px 20px rgba(25,28,30,.05)}.add-compact-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.add-compact-head h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.03em;color:#111827}.add-compact-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.add-compact-field{display:grid;gap:7px;padding:10px;border-radius:16px;background:#f3f6fb;border:1px solid rgba(198,197,212,.16)}.add-compact-field.span-2{grid-column:1 / -1}.add-compact-field.mini{padding:8px;border-radius:14px;gap:6px}.add-compact-field.photos{padding:6px 6px 5px}.add-compact-label{color:#3d4051;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.add-compact-brand-row{display:grid;grid-template-columns:minmax(110px,.55fr) minmax(0,1fr);gap:8px}.add-compact-mini-grid{grid-column:1 / -1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.add-compact .add-input-shell{background:#fff}.add-compact .add-input-shell .gi,.add-compact .add-input-shell .gs{padding:9px 2px;font-size:14px}.add-compact-field.mini .add-input-shell .gi,.add-compact-field.mini .add-input-shell .gs{padding:6px 2px;font-size:13px}.add-compact-collapses{display:grid;gap:8px}.add-compact-collapse{border-radius:18px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 6px 14px rgba(25,28,30,.04)}.add-compact-collapse summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;cursor:pointer;color:#111827;font-size:12px;font-weight:800}.add-compact-collapse summary::-webkit-details-marker{display:none}.add-compact-collapse summary span{color:var(--text-2);font-size:11px;font-weight:700}.add-compact-collapse-body{padding:0 12px 12px}.add-compact-check{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:14px;background:#f3f6fb;border:1px solid rgba(198,197,212,.16);color:var(--text-2);font-size:12px;line-height:1.5;cursor:pointer}.add-compact-check input{margin-top:2px}.add-compact .pg{grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px}.add-compact .pt{border-radius:12px}.add-compact .pa{border-radius:12px;gap:4px;font-size:10px;min-height:70px}.add-compact .pa svg{width:18px;height:18px}.add-compact-field.photos .pg{grid-template-columns:repeat(auto-fill,minmax(48px,60px));gap:5px}.add-compact-field.photos .pt{border-radius:9px}.add-compact-field.photos .pa{border-radius:9px;gap:2px;font-size:8px;min-height:48px}.add-compact-field.photos .pa svg{width:13px;height:13px}.add-compact-field.photos .pg + input + div{margin-top:2px}.add-compact-queue-list{display:grid;gap:8px;max-height:188px;overflow:auto}.add-compact-queue-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#f7f9fc;border:1px solid rgba(198,197,212,.16)}.add-compact-queue-item strong{display:block;color:var(--text);font-size:13px;font-family:'Space Mono',monospace}.add-compact-queue-item span{display:block;color:var(--text-3);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}.add-compact-actions{display:flex;gap:10px;flex-wrap:wrap}.add-compact-actions .bg,.add-compact-actions .bp{min-height:46px;border-radius:16px;justify-content:center}
.page-shell{display:grid;gap:18px}
.page-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.page-hero h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:32px;line-height:1.04;font-weight:800;letter-spacing:-.04em;color:var(--text)}
.page-hero p{margin-top:8px;color:var(--text-2);font-size:14px;line-height:1.65;max-width:760px}
.page-chip{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:#eef3ff;color:var(--primary);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.workflow-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:18px;align-items:start}
.workflow-main,.workflow-side{display:grid;gap:16px}
.editor-card{padding:20px;border-radius:24px}
.editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.editor-head h2,.editor-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.editor-copy,.editor-subcopy{color:var(--text-2);font-size:13px;line-height:1.65}
.editor-block{display:grid;gap:14px}
.editor-note{padding:18px;border-radius:22px;background:linear-gradient(160deg,#ffffff 0%,#eef3ff 100%);border:1px solid rgba(198,197,212,.2);box-shadow:0 12px 26px rgba(25,28,30,.05)}
.editor-note.dark{background:linear-gradient(160deg,#1f2328 0%,#13161b 100%);border-color:rgba(255,255,255,.06);color:#e0e3e6}
.editor-note.dark .editor-title,.editor-note.dark .editor-copy,.editor-note.dark .editor-subcopy{color:inherit}
.editor-stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.editor-stat{padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.72);border:1px solid rgba(198,197,212,.18)}
.editor-note.dark .editor-stat{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.06)}
.editor-stat-label{color:var(--text-3);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
.editor-note.dark .editor-stat-label{color:#aab1be}
.editor-stat-value{color:var(--text);font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.03em}
.editor-note.dark .editor-stat-value{color:#f4f7ff}
.editor-list{display:grid;gap:10px}
.editor-list-row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px 0;border-top:1px solid rgba(198,197,212,.18)}
.editor-note.dark .editor-list-row{border-top-color:rgba(255,255,255,.06)}
.editor-list-row:first-child{border-top:none;padding-top:0}
.editor-list-row:last-child{padding-bottom:0}
.editor-list-row strong{color:var(--text);font-size:13px;font-weight:700}
.editor-note.dark .editor-list-row strong{color:#f4f7ff}
.editor-list-row span{color:var(--text-2);font-size:12px;line-height:1.6;text-align:right}
.editor-note.dark .editor-list-row span{color:#aab1be}
.editor-inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.editor-pane{display:grid;gap:14px;padding:18px;border-radius:20px;background:var(--surface-low);border:1px solid rgba(198,197,212,.16)}
.editor-pane.dark{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.06)}
.repair-shell{display:grid;gap:16px;padding:20px;border-radius:28px;background:linear-gradient(180deg,#191c1e 0%,#17191e 100%);color:#e0e3e6;box-shadow:0 24px 44px rgba(8,12,20,.28)}
.repair-shell h1,.repair-shell h2,.repair-shell h3{font-family:'Plus Jakarta Sans',sans-serif;color:#f4f7ff}
.repair-shell p{color:#aab1be}
.repair-bento{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}
.repair-bento-primary{grid-column:span 12;padding:18px;border-radius:22px;background:linear-gradient(135deg,#1a237e,#000666);position:relative;overflow:hidden}
.repair-bento-primary::after{content:'';position:absolute;right:-18px;bottom:-18px;width:124px;height:124px;border-radius:50%;background:rgba(255,255,255,.08)}
.repair-bento-half{grid-column:span 6;padding:16px;border-radius:20px;background:#23272d;border:1px solid rgba(255,255,255,.04)}
.repair-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:14px;border-radius:20px;background:#1c1f24;border:1px solid rgba(255,255,255,.05)}
.repair-queue{display:grid;gap:14px}
.repair-card{display:grid;gap:12px;padding:16px;border-radius:22px;background:#1c1f24;border-left:4px solid #2761fe;border-top:1px solid rgba(255,255,255,.04);border-right:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04)}
.repair-card.ready{border-left-color:#88d982}
.repair-form-actions{display:flex;gap:10px;flex-wrap:wrap}.repair-form-actions>*{min-width:0}
.repair-form-shell{display:grid;gap:16px;padding:18px;border-radius:28px;background:linear-gradient(180deg,#fbfcfe 0%,#f2f5fb 100%);color:var(--text);box-shadow:0 20px 38px rgba(25,28,30,.08);border:1px solid rgba(198,197,212,.18)}.repair-form-shell h1,.repair-form-shell h2,.repair-form-shell h3{font-family:'Plus Jakarta Sans',sans-serif;color:var(--text)}.repair-form-shell p{color:var(--text-2)}.repair-form-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:18px;align-items:start}.repair-form-panel{background:#fff!important;border:1px solid rgba(198,197,212,.18)!important}.repair-form-panel .editor-title,.repair-form-panel .editor-subcopy{color:var(--text)!important}.repair-form-side{background:linear-gradient(160deg,#ffffff 0%,#eef3ff 100%)!important;border:1px solid rgba(198,197,212,.2)!important;color:var(--text)!important}.repair-form-side .editor-title,.repair-form-side .editor-copy,.repair-form-side .editor-subcopy,.repair-form-side .editor-stat-value,.repair-form-side .editor-list-row strong{color:var(--text)!important}.repair-form-side .editor-stat-label,.repair-form-side .editor-list-row span{color:var(--text-2)!important}.repair-form-side .editor-stat{background:#fff;border:1px solid rgba(198,197,212,.18)}
.repair-card.cancelled{border-left-color:#ba1a1a}
.repair-card-title{color:#f4f7ff;font-size:16px;font-weight:800}
.repair-card-meta{color:#aab1be;font-size:12px;line-height:1.6}
.repair-card-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%}
.repair-card-media{width:78px;height:78px;border-radius:14px;overflow:hidden;flex-shrink:0;background:#2d3133}
.repair-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.repair-detail-tile{padding:14px;border-radius:18px;background:#23272d;border:1px solid rgba(255,255,255,.05)}
.repair-detail-label{color:#aab1be;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
.repair-detail-value{color:#f4f7ff;font-size:14px;font-weight:700;line-height:1.5}
.repair-lab{width:min(940px,100%);margin:0 auto;display:grid;gap:12px;padding:0 2px}.repair-lab-hero{display:grid;gap:12px;padding:14px 16px 12px;border-radius:0;background:linear-gradient(180deg,#ffffff 0%,#f8faff 100%);border-top:3px solid #3659d8;border-left:1px solid rgba(54,89,216,.22);border-right:1px solid rgba(54,89,216,.22);border-bottom:1px solid rgba(198,197,212,.18);box-shadow:none}.repair-lab-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.repair-lab-title{display:flex;align-items:center;gap:10px}.repair-lab-mark{width:28px;height:28px;border-radius:10px;background:#edf1ff;display:flex;align-items:center;justify-content:center;color:#3659d8;flex-shrink:0}.repair-lab-title h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;line-height:1;font-weight:800;letter-spacing:-.04em;color:#2750d7}.repair-lab-title p{margin-top:0;color:#6f778a;font-size:11px;line-height:1.5;letter-spacing:.08em;text-transform:uppercase}.repair-lab-cta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.repair-lab-cta .bp{padding:10px 14px;border-radius:12px;min-height:40px;background:linear-gradient(135deg,#4b67dd,#3859d7)}.repair-lab-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.repair-lab-stat{padding:14px 10px 12px;border-radius:16px;background:#fff;border:1px solid rgba(198,197,212,.16);box-shadow:0 6px 14px rgba(25,28,30,.04);display:grid;justify-items:center;gap:4px;text-align:center}.repair-lab-stat.primary{background:#fff;color:#111827;border-color:rgba(198,197,212,.16)}.repair-lab-stat.primary::after{display:none}.repair-lab-stat.queue{background:#ffffff}.repair-lab-stat.open{background:#fdeeee}.repair-lab-stat.ready{background:#e5fbf0}.repair-lab-stat-label{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6f778a}.repair-lab-stat-value{font-family:'Plus Jakarta Sans',sans-serif;font-size:30px;font-weight:800;letter-spacing:-.05em;color:#2750d7;line-height:1}.repair-lab-stat.open .repair-lab-stat-value{color:#e63535}.repair-lab-stat.ready .repair-lab-stat-value{color:#0c8b55}.repair-lab-stat-meta{font-size:9px;color:#6f778a;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.repair-lab-search{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:10px;padding:10px;border-radius:14px;background:transparent;border:none;box-shadow:none}.repair-lab-searchbox{position:relative}.repair-lab-searchbox .gi{padding-left:36px;background:#eef2f7;border-radius:12px;min-height:44px;border-color:rgba(198,197,212,.16)}.repair-lab-searchbox svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#98a1b3}.repair-lab-filter{width:44px;height:44px;border:none;border-radius:12px;background:#edf1f7;color:#66738b;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(198,197,212,.16)}.repair-lab-list{display:grid;gap:10px}.repair-lab-card{display:grid;gap:10px;padding:14px;border-radius:18px;background:#fff;border:1px solid rgba(198,197,212,.16);box-shadow:0 6px 16px rgba(25,28,30,.04)}.repair-lab-card.ready,.repair-lab-card.cancelled{border-left:1px solid rgba(198,197,212,.16)}.repair-lab-card-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.repair-lab-card-title{color:#111827;font-size:15px;font-weight:800}.repair-lab-card-ref{color:#6b7488;font-size:11px;font-weight:700;white-space:nowrap}.repair-lab-card-body{display:grid;grid-template-columns:minmax(0,1fr) 52px;gap:10px;align-items:start}.repair-lab-card-media{width:52px;height:64px;border-radius:12px;overflow:hidden;flex-shrink:0;background:#eef3ff;display:flex;align-items:center;justify-content:center;justify-self:end}.repair-lab-card-copy{min-width:0;flex:1}.repair-lab-card-device{display:block;color:#1e3a8a;font-size:14px;font-weight:800}.repair-lab-card-copy span{display:block;color:#8c95a8;font-size:11px;line-height:1.45;margin-top:2px}.repair-lab-card-copy .problem{color:#6f778a}.repair-lab-card-finance{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.repair-lab-card-finance strong{color:#244ed6;font-size:14px;font-weight:800}.repair-lab-card-finance span{color:#6f778a;font-size:12px}.repair-lab-card-statuses{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.repair-chip{display:inline-flex;align-items:center;justify-content:center;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.repair-chip.open{background:#ffefef;color:#e63535}.repair-chip.ready{background:#e5fbf0;color:#0c8b55}.repair-chip.pending{background:#eef3ff;color:#3659d8}.repair-chip.cancelled{background:#f2f4f7;color:#6f778a}.repair-chip.unpaid{background:#fff7dd;color:#c38700}.repair-chip.partial{background:#eef3ff;color:#3659d8}.repair-chip.paid{background:#e5fbf0;color:#0c8b55}.repair-lab-card-footer{display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:10px;align-items:center}.repair-lab-card-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;width:auto}.repair-lab-icon-btn{border:none;background:transparent;color:#b1b8c7;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}.repair-lab-icon-btn:hover{color:#3659d8}.repair-lab-msg-btn{width:48px;height:48px;border:none;border-radius:14px;background:#e6faf0;color:#20a663;display:flex;align-items:center;justify-content:center;cursor:pointer;justify-self:end}.repair-lab-empty{padding:28px 18px;text-align:center;border-radius:22px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 10px 22px rgba(25,28,30,.04)}
.settings-shell{display:grid;gap:12px}
.settings-shell-home{min-height:calc(100dvh - 152px);align-content:stretch}
.settings-terminal{display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px}
.settings-home-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.03em;color:#102a7a;padding:0 2px}
.settings-home-content{display:grid;gap:10px;align-content:center}
.settings-terminal-head h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:34px;font-weight:800;letter-spacing:-.04em;color:#0f2a77;line-height:1.05}
.settings-terminal-head p{margin-top:4px;color:#4f5a72;font-size:14px;font-weight:600;line-height:1.35}
.settings-terminal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.settings-terminal-card{appearance:none;border:1px solid rgba(198,197,212,.24);background:#eef2fa;border-radius:16px;padding:16px 14px;display:grid;gap:11px;text-align:left;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
.settings-shell-home .settings-terminal-card{min-height:126px;align-content:space-between}
.settings-terminal-card.active{border-color:#2f56d7;box-shadow:0 10px 20px rgba(47,86,215,.18)}
.settings-terminal-card.profile{background:#eaf0ff}.settings-terminal-card.invoice{background:#ebf1ff}.settings-terminal-card.status{background:#dff4e8}.settings-terminal-card.mode{background:#eceff4}
.settings-terminal-icon{width:52px;height:52px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;color:#1840bf}
.settings-terminal-card.status .settings-terminal-icon{color:#0c7a46}
.settings-terminal-card.mode .settings-terminal-icon{color:#3b3f4d}
.settings-terminal-card h3{font-family:'Plus Jakarta Sans',sans-serif;font-size:17px;font-weight:800;letter-spacing:-.02em;color:#0e2f97;line-height:1.1}
.settings-terminal-card.status h3{color:#0f5b37}
.settings-terminal-card.mode h3{color:#282f3f}
.settings-terminal-card p{font-size:13px;font-weight:600;color:#3d5db4;line-height:1.35}
.settings-terminal-card.status p{color:#2d7d4f}
.settings-terminal-card.mode p{color:#5c6579}
.theme-picker-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.theme-choice-card{appearance:none;border:1px solid rgba(198,197,212,.28);background:var(--surface-strong);border-radius:18px;padding:14px;text-align:left;display:grid;gap:12px;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.theme-choice-card:hover,.theme-choice-card.active{transform:translateY(-1px);border-color:var(--secondary);box-shadow:0 14px 28px rgba(25,28,30,.08)}
.theme-choice-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.theme-choice-swatches{display:flex;gap:6px}.theme-choice-swatch{width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,.65);box-shadow:0 0 0 1px rgba(25,28,30,.08)}
.theme-choice-card strong{display:block;color:var(--t1);font-size:14px;font-weight:800}.theme-choice-card span{display:block;margin-top:3px;color:var(--t3);font-size:12px;line-height:1.45}.theme-choice-check{width:24px;height:24px;border-radius:999px;background:var(--surface-low);color:var(--secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.settings-terminal-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
.settings-terminal-cta{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.settings-terminal-btn{min-height:48px;padding:0 24px;border-radius:15px;font-family:'Plus Jakarta Sans',sans-serif;font-size:16px;font-weight:700;letter-spacing:-.01em;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
.settings-terminal-btn.save{background:linear-gradient(135deg,#2f65f6,#1f4fd8)!important;border:1px solid #2a58df!important;color:#fff!important;box-shadow:0 10px 20px rgba(47,101,246,.28)}
.settings-terminal-btn.save:disabled{opacity:.72;box-shadow:none}
.settings-terminal-btn.signout{background:#fff!important;border:1px solid rgba(166,175,195,.45)!important;color:#1f2937!important}
.settings-terminal-btn.signout svg{color:#5c6478}
.settings-terminal-btn:hover{transform:translateY(-1px)}
.shop-profile-sticky-save{display:grid;position:sticky;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:35;padding:10px 0;background:linear-gradient(180deg,rgba(247,249,252,0),rgba(247,249,252,.94) 32%,rgba(247,249,252,.98))}.shop-profile-sticky-save .bp{width:100%;min-height:54px;border-radius:18px;justify-content:center;font-size:15px}
.settings-detail-screen{display:grid;gap:10px}
.settings-detail-head{display:flex;align-items:center;gap:10px;padding:2px 2px 0}
.settings-detail-back{min-height:36px;padding:8px 12px;border-radius:10px}
.settings-detail-copy h2{font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.03em;color:#0f2a77;line-height:1.08}
.settings-detail-copy p{margin-top:2px;font-size:12px;font-weight:600;color:#5b6478;line-height:1.35}
.settings-grid{display:grid;grid-template-columns:1fr;gap:12px}
.settings-mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.settings-mini-card{padding:14px;border-radius:18px;background:var(--surface-low);border:1px solid rgba(198,197,212,.16)}
.settings-mini-card strong{display:block;color:var(--text);font-size:13px;font-weight:700;margin-bottom:6px}
.settings-mini-card span{display:block;color:var(--text-2);font-size:12px;line-height:1.6}
.desktop-enhanced-only{display:none}
@media(min-width:1025px){
.ni{padding:15px 18px;border-radius:18px;font-size:15px;font-weight:600;color:#465368}
.ni svg{color:#5f6b80}
.ni.ac{position:relative;background:#fff;color:#26319d;box-shadow:0 10px 22px rgba(25,28,30,.04);border-color:rgba(198,197,212,.2)}
.ni.ac svg{color:#26319d}
.ni.ac::before{content:'';position:absolute;left:-18px;top:10px;bottom:10px;width:4px;border-radius:999px;background:#4f46e5}
.shell-main{padding:18px 34px 44px}
.shell-main.shell-main-inventory{padding-top:18px}
.dashboard-retail{width:100%;max-width:none;margin:0;gap:22px}
.dashboard-retail-desktop{display:grid;gap:22px}
.dashboard-retail-mobile-stack{display:none}
.desktop-workspace{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.48fr);gap:22px;align-items:start}
.desktop-workspace-main{display:grid;gap:14px;min-width:0}
.desktop-workspace-side{display:grid;gap:16px;position:sticky;top:94px}
.desktop-workspace-side .add-desktop-actions,.desktop-workspace-side .repair-form-actions{display:grid;grid-template-columns:1fr;gap:10px}
.desktop-workspace-side .bg,.desktop-workspace-side .bp,.desktop-workspace-side .bs{width:100%;justify-content:center;min-height:48px;border-radius:16px}
.desktop-side-card{display:grid;gap:14px;padding:18px;border-radius:24px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 16px 28px rgba(25,28,30,.04)}
.desktop-side-card.dark{background:linear-gradient(180deg,#3e3794 0%,#322c8a 100%);border-color:rgba(62,55,148,.12);color:#fff}
.desktop-side-card.dark .desktop-side-eyebrow,.desktop-side-card.dark .desktop-side-title,.desktop-side-card.dark .desktop-side-copy,.desktop-side-card.dark .desktop-side-list strong,.desktop-side-card.dark .desktop-side-list span{color:inherit}
.desktop-side-eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#6b7bf2}
.desktop-side-title{font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.04em;color:#202c8e;line-height:1.15}
.desktop-side-copy{color:#64748b;font-size:13px;line-height:1.7}
.desktop-side-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.desktop-side-stat{padding:12px;border-radius:18px;background:#f8fafc;border:1px solid rgba(198,197,212,.16);display:grid;gap:4px}
.desktop-side-stat strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:18px;font-weight:800;color:#202c8e}
.desktop-side-stat span{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#74829b}
.desktop-side-list{display:grid;gap:10px}
.desktop-side-list li{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid rgba(198,197,212,.18);list-style:none}
.desktop-side-list li:last-child{padding-bottom:0;border-bottom:none}
.desktop-side-list strong{color:#1f2937;font-size:12px;font-weight:800}
.desktop-side-list span{color:#56657f;font-size:13px;text-align:right;line-height:1.5}
.desktop-inline-actions{display:none!important}
.add-compact{width:min(1320px,100%);gap:16px}
.add-compact-card,.add-compact-collapse,.repair-form-shell{border-radius:24px;box-shadow:0 16px 28px rgba(25,28,30,.04)}
.stock-modern{width:100%;max-width:none;margin:0;gap:18px}
.stock-modern-desktop-head{display:grid}
.stock-modern-desktop-hero{display:none}
.stock-modern-controls{gap:12px}
.stock-modern-search{padding:16px 18px;border-radius:18px}
.stock-modern-filters{padding:8px;border-radius:18px}
.stock-modern-pill{border-radius:14px!important;min-height:48px}
.stock-modern-mobile-grid{display:grid}
.stock-modern-table{display:none}
.invoices-modern{width:100%;max-width:none;margin:0;gap:18px}
.transactions-desktop-head{display:grid}
.transactions-summary-grid{display:grid}
.transactions-desktop-table{display:grid}
.transactions-mobile-stack{display:none}
.reports-modern{width:100%;max-width:none;margin:0;gap:16px}
.reports-desktop-hero{display:grid}
.reports-modern-top{grid-template-columns:minmax(0,1fr) 360px;align-items:end;gap:16px}
.reports-modern-head h1{font-size:34px}
.reports-modern-head p{font-size:13px}
.reports-modern-actions{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.reports-modern-actions .bp,.reports-modern-actions .bg{min-height:48px;border-radius:16px;font-size:13px}
.reports-modern-controls{grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:12px;border-radius:20px}
.reports-modern-control{min-height:46px;border-radius:16px;padding:0 12px}
.reports-modern-control .gs,.reports-modern-control .gi{font-size:13px}
.reports-modern-dates{gap:10px;padding:0}
.reports-modern-kpis{gap:12px}.reports-modern-kpi{padding:16px;border-radius:22px;box-shadow:0 16px 28px rgba(25,28,30,.04)}.reports-modern-kpi-value{font-size:24px}
.reports-modern-feed.mobile-preview{display:none}
.reports-modern-desktop-table{display:grid;gap:0;padding:0;border-radius:28px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 18px 28px rgba(25,28,30,.04)}
.reports-modern-desktop-head,.reports-modern-desktop-row{display:grid;grid-template-columns:110px minmax(0,1.4fr) minmax(180px,.8fr) 170px 130px;gap:16px;align-items:center}
.reports-modern-desktop-head{padding:18px 24px;background:#f8fafc;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
.reports-modern-desktop-row{padding:18px 24px;border-top:1px solid #edf0f6}
.reports-modern-desktop-row strong{font-size:14px;color:#111827}.reports-modern-desktop-row span{font-size:13px;color:#64748b;line-height:1.6}
.repair-lab{width:100%;max-width:none;margin:0;gap:18px}
.repair-lab-hero,.repair-lab-controls{border-radius:24px;box-shadow:0 16px 28px rgba(25,28,30,.04)}
.repair-lab-desktop-grid{display:grid;grid-template-columns:minmax(0,1.12fr) 320px;gap:18px;align-items:start}
.repair-lab-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}.repair-lab-card{padding:18px;border-radius:24px;box-shadow:0 12px 24px rgba(25,28,30,.04);height:100%}
.repair-desktop-side{display:grid;gap:16px;position:sticky;top:94px}
.repair-desktop-side .desktop-side-card.dark{background:linear-gradient(180deg,#3e3794 0%,#322c8a 100%)}
.repair-shell{background:#fff;color:#111827;border:1px solid rgba(198,197,212,.18);box-shadow:0 18px 30px rgba(25,28,30,.04)}
.repair-shell h1,.repair-shell h2,.repair-shell h3{color:#111827}
.repair-shell p{color:#64748b}
.repair-detail-tile{background:#f8fafc;border:1px solid rgba(198,197,212,.18)}
.repair-detail-label{color:#94a3b8}
.repair-detail-value{color:#111827}
.settings-shell{width:min(1240px,100%)}
.settings-shell-home{min-height:calc(100dvh - 176px)}
.settings-terminal{gap:16px}.settings-home-title{font-size:30px}.settings-terminal-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.settings-terminal-card{padding:20px;border-radius:22px;min-height:172px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 14px 24px rgba(25,28,30,.04)}
.settings-terminal-card.profile,.settings-terminal-card.invoice,.settings-terminal-card.status,.settings-terminal-card.mode{background:#fff}
.settings-terminal-icon{width:58px;height:58px;border-radius:18px;background:#eef2ff}
.settings-terminal-card h3{font-size:18px}.settings-terminal-card p{font-size:13px;color:#64748b}
.settings-detail-screen{gap:16px}
.settings-desktop-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:22px;align-items:start}
.settings-desktop-nav{display:grid;gap:10px;position:sticky;top:94px;padding:16px;border-radius:24px;background:#fff;border:1px solid rgba(198,197,212,.18);box-shadow:0 16px 26px rgba(25,28,30,.04)}
.settings-desktop-nav button{appearance:none;text-align:left;padding:14px 16px;border-radius:18px;border:1px solid transparent;background:#fff;display:grid;gap:4px;cursor:pointer}
.settings-desktop-nav button.active{background:#eef2ff;border-color:rgba(79,70,229,.16);box-shadow:none}
.settings-desktop-nav strong{font-size:14px;font-weight:800;color:#202c8e}.settings-desktop-nav span{font-size:12px;color:#6c7890;line-height:1.5}
.settings-detail-head{padding:2px 4px 0}.settings-detail-copy h2{font-size:30px}.settings-detail-copy p{font-size:13px}
.desktop-enhanced-only{display:grid}
}
@media(max-width:768px){.settings-shell-home{min-height:calc(100dvh - 164px)}.settings-home-title{font-size:20px}.settings-terminal-head h1{font-size:30px}.settings-terminal-head p{font-size:13px}.settings-terminal-grid{gap:10px}.settings-terminal-card{padding:14px 12px;border-radius:14px}.settings-shell-home .settings-terminal-card{min-height:132px}.settings-terminal-icon{width:46px;height:46px;border-radius:12px}.settings-terminal-card h3{font-size:16px}.settings-terminal-card p{font-size:12px}.settings-terminal-actions{grid-template-columns:1fr}.settings-terminal-cta{justify-content:center}.settings-terminal-btn{min-height:44px;min-width:112px;padding:0 18px;font-size:15px;border-radius:14px}.settings-detail-copy h2{font-size:20px}.settings-detail-copy p{font-size:11px}}
@media(max-width:560px){.settings-shell-home{min-height:calc(100dvh - 170px)}.settings-terminal{gap:8px}.settings-home-title{font-size:18px}.settings-home-content{gap:8px}.settings-terminal-head h1{font-size:28px}.settings-terminal-head p{font-size:12px}.settings-terminal-grid{gap:8px}.settings-terminal-card{padding:12px 10px;gap:9px}.settings-shell-home .settings-terminal-card{min-height:124px}.settings-terminal-icon{width:40px;height:40px;border-radius:10px}.settings-terminal-card h3{font-size:15px}.settings-terminal-card p{font-size:11px;line-height:1.25}.settings-terminal-btn{min-height:42px;min-width:106px;padding:0 16px;font-size:14px;border-radius:13px}.settings-detail-head{gap:8px}.settings-detail-back{min-height:34px;padding:7px 10px}.settings-detail-copy h2{font-size:18px}.settings-detail-copy p{font-size:10px}}
@media(max-width:1200px){.section-grid{grid-template-columns:1fr}.section-grid>.span-7,.section-grid>.span-5,.section-grid>.span-12{grid-column:span 1}}
@media(max-width:1024px){.shell-sidebar{display:none}.mth{display:flex}.mn{display:flex}.shell-main{margin-left:0;padding:calc(82px + env(safe-area-inset-top,0px)) 16px calc(104px + env(safe-area-inset-bottom,0px))}.shell-main.shell-main-no-mth{padding:calc(12px + env(safe-area-inset-top,0px)) 16px calc(104px + env(safe-area-inset-bottom,0px))}.shell-main.shell-main-inventory{padding:calc(14px + env(safe-area-inset-top,0px)) 16px calc(104px + env(safe-area-inset-bottom,0px))}.auth-hero{display:none}.auth-panel{padding:32px 18px 24px}.auth-mobile-brand{display:flex}.workflow-grid,.settings-grid{grid-template-columns:1fr}.repair-bento-half{grid-column:span 12}}
@media(max-width:768px){.action-row>*{width:100%;justify-content:center}.gi,.gs{font-size:16px!important}.stock-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:start!important;margin-bottom:16px}.stock-hero-actions{width:auto;display:flex;gap:8px;justify-self:end}.stock-hero-actions .bp{padding:11px 14px;font-size:13px;min-height:46px;justify-content:center}.stock-filter-card{margin-bottom:14px;padding:12px!important}.stock-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start}.stock-search{min-width:0}.stock-search .gi{padding:11px 14px 11px 34px}.stock-controls-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start}.stock-controls-row .gs{flex:1 1 132px;min-width:0;padding:10px 11px;font-size:14px!important}.parts-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-grid{display:flex;gap:12px;overflow:auto;padding-bottom:4px;scrollbar-width:none}.dashboard-grid::-webkit-scrollbar{display:none}.metric-card{min-width:220px}.auth-header h2{font-size:28px}.repair-search{grid-template-columns:1fr}.repair-card-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.page-hero,.settings-topbar{align-items:flex-start}.add-desktop-only{display:none!important}.add-mobile-only{display:block!important}.add-stock-layout .workflow-side{display:none}.add-mobile-actions{display:grid;grid-template-columns:160px minmax(0,1fr);gap:14px;position:sticky;bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:35;padding:14px 0;background:linear-gradient(180deg,rgba(247,249,252,0),rgba(247,249,252,.94) 32%,rgba(247,249,252,.98))}.add-desktop-actions{display:none}.add-step-sections[data-step="0"] .add-step-section[data-step="1"],.add-step-sections[data-step="0"] .add-step-section[data-step="2"],.add-step-sections[data-step="1"] .add-step-section[data-step="0"],.add-step-sections[data-step="1"] .add-step-section[data-step="2"],.add-step-sections[data-step="2"] .add-step-section[data-step="0"],.add-step-sections[data-step="2"] .add-step-section[data-step="1"]{display:none}.add-brand-grid,.add-grid-2,.add-grid-3{grid-template-columns:1fr}.add-ref-card{padding:22px 18px!important}.add-step-header{padding-top:0}}
@media(max-width:560px){.gc{padding:12px!important;border-radius:16px!important}.stock-tools{grid-template-columns:1fr}.stock-controls-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.stock-view-toggle{justify-self:end}.stock-header h1{font-size:24px!important}.stock-header p{font-size:13px!important}.stock-hero-actions .btn-label{display:none}.stock-hero-actions .bp{width:42px;min-width:42px;height:42px;min-height:42px;padding:0}.parts-stat-card{padding:12px!important}.parts-sheet-wrap{align-items:stretch!important;justify-content:flex-end!important;padding:0!important}.parts-sheet{width:100vw!important;max-width:none!important;max-height:min(86vh,86dvh)!important;border-bottom-left-radius:0!important;border-bottom-right-radius:0!important;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))!important}.auth-panel{padding-inline:14px}.auth-segment{grid-template-columns:1fr}.editor-stat-grid,.settings-mini-grid{grid-template-columns:1fr}.repair-shell{padding:16px}.repair-card-actions{grid-template-columns:1fr}.page-chip{width:100%;justify-content:center}.add-mobile-actions{grid-template-columns:1fr 1.65fr;bottom:calc(84px + env(safe-area-inset-bottom,0px));padding-top:10px}.add-step-tab{font-size:10px;letter-spacing:.1em;padding-inline:4px}.add-condition-pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.add-condition-pill{padding:14px 8px;text-align:center}.add-ref-title{font-size:11px}}
@media(max-width:560px){.repair-form-actions{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:10px}.repair-form-actions .bg,.repair-form-actions .bp{width:100%;justify-content:center}}
@media(max-width:1024px){.repair-form-grid{grid-template-columns:1fr}.repair-form-shell{padding:16px}.repair-form-side{order:2}}
@media(max-width:560px){.repair-form-shell{padding:14px;border-radius:22px}.repair-form-grid{gap:12px}}
.repair-lab{width:100%;max-width:none;margin:0;display:grid;gap:10px;padding:0}
.repair-lab-hero{display:grid;gap:10px;padding:12px;border-radius:20px;background:#fff;border:1px solid rgba(198,197,212,.22);box-shadow:0 10px 24px rgba(25,28,30,.05)}
.repair-lab-top{display:flex;align-items:center;justify-content:flex-end;gap:10px}
.repair-lab-title{display:flex;align-items:center;gap:10px}
.repair-lab-mark{width:30px;height:30px;border-radius:10px;background:#e8efff;color:#2d55d7;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.repair-lab-title h1{font-family:'Plus Jakarta Sans',sans-serif;font-size:20px;line-height:1.05;font-weight:800;letter-spacing:-.04em;color:#1f2937}
.repair-lab-title p{margin-top:2px;color:#6b7280;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.repair-lab-top .bp{padding:10px 14px;min-height:40px;border-radius:12px;gap:6px;box-shadow:none}
.repair-lab-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.repair-lab-stat{padding:10px 8px 9px;border-radius:14px;background:#f8f9ff;border:1px solid rgba(198,197,212,.16);display:grid;gap:2px;justify-items:center;text-align:center}
.repair-lab-stat.open{background:#fff1f1}
.repair-lab-stat.ready{background:#ebfbf1}
.repair-lab-stat-label{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
.repair-lab-stat-value{font-family:'Plus Jakarta Sans',sans-serif;font-size:26px;font-weight:800;line-height:1;color:#1f2937}
.repair-lab-stat-meta{font-size:10px;color:#6b7280}
.repair-lab-controls{display:grid;gap:8px;padding:10px 12px;border-radius:18px;background:#fff;border:1px solid rgba(198,197,212,.18)}
.repair-lab-searchbox{display:grid;grid-template-columns:16px minmax(0,1fr);align-items:center;column-gap:8px;background:#f4f6fa;border:1px solid rgba(198,197,212,.2);border-radius:12px;padding:0 10px}
.repair-lab-searchbox svg{position:static!important;left:auto!important;top:auto!important;transform:none!important;color:#7f8aa3;flex-shrink:0}
.repair-lab-searchbox .gi{border:none!important;background:transparent!important;min-height:40px;padding:9px 0!important;font-size:14px;text-indent:0!important}
.repair-lab-searchbox .gi:focus{box-shadow:none}
.repair-lab-filters{display:flex;flex-wrap:wrap;gap:6px}
.repair-lab-filter-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border-radius:999px;border:1px solid rgba(198,197,212,.24);background:#fff;color:#5f6778;font-size:10px;font-weight:700;letter-spacing:.01em;line-height:1}
.repair-lab-filter-pill.active{background:#3659d8;color:#fff;border-color:#3659d8}
.repair-lab-filter-pill svg{width:11px;height:11px;stroke-width:2}
.repair-lab-list{display:grid;gap:8px}
.repair-lab-card{display:grid;gap:9px;padding:11px 12px;border-radius:18px;background:#fff;border:1px solid rgba(198,197,212,.2);border-left:4px solid #4363da;box-shadow:0 8px 16px rgba(25,28,30,.04)}
.repair-lab-card.ready{border-left-color:#1ea465}
.repair-lab-card.cancelled{border-left-color:#c93838}
.repair-lab-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.repair-lab-card-title{font-size:15px;font-weight:800;color:#111827;line-height:1.25}
.repair-lab-card-customer{margin-top:2px;font-size:12px;font-weight:600;color:#6b7280}
.repair-lab-card-ref{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#667085;white-space:nowrap}
.repair-lab-card-body{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:10px;align-items:start}
.repair-lab-card-copy{display:grid;gap:2px;min-width:0}
.repair-lab-card-copy span{font-size:12px;color:#5f6778;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.repair-lab-card-copy span.problem{display:inline-flex;align-items:center;gap:5px;white-space:normal;color:#4b5565;background:#fff4dd;border:1px solid #f2ddb3;border-radius:999px;padding:2px 8px;justify-self:start;max-width:100%}
.repair-lab-card-copy span.problem strong{font-size:11px;font-weight:800;color:#7a4700;letter-spacing:.01em;white-space:nowrap}
.repair-lab-card-copy span.problem em{font-style:normal;font-weight:700;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.repair-lab-card-media{width:78px;height:78px;border-radius:12px;overflow:hidden;background:#eef2f9;display:flex;align-items:center;justify-content:center}
.repair-lab-card-footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.repair-lab-card-finance{display:inline-grid;grid-template-columns:auto auto auto auto;align-items:center;column-gap:8px;row-gap:2px}
.repair-lab-card-finance strong{font-size:13px;color:#111827;line-height:1}
.repair-lab-card-finance span{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7a8294}
.repair-lab-card-statuses{display:flex;gap:6px;flex-wrap:wrap}
.repair-lab-card-actions{display:flex;align-items:center;gap:8px}
.repair-lab-icon-btn{width:34px;height:34px;border-radius:10px;border:1px solid rgba(198,197,212,.22);background:#fff;color:#4f5f7c;display:flex;align-items:center;justify-content:center}
.repair-lab-icon-btn svg{stroke-width:1.9}
.repair-lab-msg-btn{width:36px;height:36px;border-radius:11px;border:1px solid #1f8f53;background:#1db463;color:#fff;display:flex;align-items:center;justify-content:center}
.repair-lab-empty{padding:28px 14px;border-radius:18px;background:#fff;border:1px dashed rgba(198,197,212,.55);text-align:center}
@media(max-width:768px){.repair-lab{gap:9px}.repair-lab-top{align-items:flex-start;flex-wrap:wrap}.repair-lab-top .bp{width:100%;justify-content:center}.repair-lab-stats{gap:6px}.repair-lab-controls{padding:9px 10px}.repair-lab-card-footer{grid-template-columns:1fr}.repair-lab-card-actions{justify-content:space-between;width:100%}}
@media(max-width:560px){.repair-lab{gap:8px}.repair-lab-hero{padding:10px;border-radius:16px}.repair-lab-mark{width:26px;height:26px;border-radius:8px}.repair-lab-title h1{font-size:18px}.repair-lab-title p{font-size:10px}.repair-lab-top .bp{min-height:38px;padding:8px 10px;font-size:12px}.repair-lab-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.repair-lab-stat{padding:8px 6px}.repair-lab-stat-value{font-size:22px}.repair-lab-stat-meta{font-size:9px}.repair-lab-controls{gap:6px;padding:7px}.repair-lab-searchbox .gi{min-height:38px;font-size:13px}.repair-lab-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.repair-lab-filter-pill{justify-content:center;padding:5px 3px;font-size:8.5px;line-height:1;gap:3px;white-space:nowrap}.repair-lab-filter-pill svg{width:9px;height:9px}.repair-lab-card{padding:10px 10px 9px;border-radius:14px}.repair-lab-card-title{font-size:14px}.repair-lab-card-customer{font-size:11px}.repair-lab-card-ref{font-size:9px}.repair-lab-card-body{grid-template-columns:minmax(0,1fr) 72px;gap:8px}.repair-lab-card-copy span{font-size:11px}.repair-lab-card-copy span.problem{gap:4px;padding:2px 7px}.repair-lab-card-copy span.problem strong{font-size:10px}.repair-lab-card-copy span.problem em{font-size:11px}.repair-lab-card-media{width:72px;height:72px;border-radius:10px}.repair-lab-card-finance{column-gap:6px}.repair-lab-card-finance strong{font-size:12px}.repair-lab-card-finance span{font-size:9px}.repair-lab-card-statuses .repair-status-select{max-width:96px;min-height:28px;padding:3px 20px;font-size:9px!important;text-align:center;text-align-last:center}.repair-lab-card-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;width:100%}.repair-lab-icon-btn{width:100%;height:34px;border-radius:9px}.repair-lab-msg-btn{width:100%;height:34px;border-radius:10px}}
@media(max-width:768px){.dashboard-retail{gap:10px}.dashboard-retail-hero{display:none}.dashboard-retail-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dashboard-retail-metric{min-width:0;padding:12px 11px;border-radius:18px}.dashboard-retail-metric:last-child{grid-column:1 / -1}.dashboard-retail-metric-icon{width:38px;height:38px}.dashboard-retail-metric-tag{padding:4px 7px;font-size:9px}.dashboard-retail-metric-value{font-size:20px}.dashboard-retail-actions{gap:8px}.dashboard-retail-action{padding:10px 8px;border-radius:14px}.dashboard-retail-action span{width:32px;height:32px}.dashboard-retail-panels{grid-template-columns:1fr;gap:10px}.dashboard-retail-panel{padding:12px}.dashboard-retail-panel-head{margin-bottom:9px}.dashboard-retail-activity-item{padding:11px 12px 11px 14px}}
@media(max-width:560px){.dashboard-retail{gap:8px}.dashboard-retail-search{padding:12px 14px;font-size:13px;border-radius:14px}.dashboard-retail-metrics{gap:6px}.dashboard-retail-metric{padding:10px 9px;border-radius:16px;gap:8px}.dashboard-retail-metric-icon{width:32px;height:32px}.dashboard-retail-metric-label{font-size:11px}.dashboard-retail-metric-value{font-size:17px}.dashboard-retail-metric-sub{font-size:9px;line-height:1.35}.dashboard-retail-actions{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.dashboard-retail-action{padding:9px 5px;gap:6px;border-radius:13px}.dashboard-retail-action strong{font-size:9px;line-height:1.15}.dashboard-retail-action span{width:26px;height:26px}.dashboard-retail-action svg,.dashboard-retail-metric-icon svg{transform:scale(.85)}.dashboard-retail-panel{padding:9px;border-radius:15px}.dashboard-retail-panel-head{margin-bottom:7px}.dashboard-retail-panel-head h3{font-size:15px}.dashboard-retail-fill{padding:4px 7px;font-size:9px}.dashboard-retail-mix{gap:7px}.dashboard-retail-mix-row{grid-template-columns:auto minmax(0,1fr);gap:7px}.dashboard-retail-mix-tone{height:18px}.dashboard-retail-mix-title{font-size:11px}.dashboard-retail-mix-row strong{grid-column:2;justify-self:end;font-size:11px}.dashboard-retail-mix-bar{height:3px}.dashboard-retail-activity{gap:7px}.dashboard-retail-activity-item{grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px 10px 10px 12px;border-radius:12px}.dashboard-retail-activity-main{gap:8px}.dashboard-retail-activity-icon{width:30px;height:30px;border-radius:9px}.dashboard-retail-activity-title{font-size:13px}.dashboard-retail-activity-meta{font-size:11px}.dashboard-retail-activity-side{justify-items:end;text-align:right;gap:4px}.dashboard-retail-activity-amount{font-size:14px}}
@media(max-width:768px){.shell-main.shell-main-add{padding:calc(12px + env(safe-area-inset-top,0px)) 14px calc(86px + env(safe-area-inset-bottom,0px))}.add-mobile-hero{display:block}.add-compact{gap:10px}.add-compact-card{padding:14px;border-radius:20px}.add-compact-form{gap:8px}.add-compact-field{padding:10px;border-radius:16px}.add-compact-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.add-compact-head h2{font-size:17px}.add-compact-actions{display:none}.add-mobile-actions{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:10px;position:sticky;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:35;padding:10px 0;background:linear-gradient(180deg,rgba(247,249,252,0),rgba(247,249,252,.94) 32%,rgba(247,249,252,.98))}}
@media(max-width:560px){.shell-main.shell-main-add{padding:calc(10px + env(safe-area-inset-top,0px)) 12px calc(84px + env(safe-area-inset-bottom,0px))}.add-compact{gap:8px}.add-mobile-header-title{font-size:22px}.add-mobile-back{width:40px;height:40px}.add-compact-toolbar{gap:8px}.add-compact-card{padding:12px;border-radius:18px}.add-compact-head p{font-size:11px}.add-compact-form{gap:8px}.add-compact-field{padding:9px}.add-compact-field.mini{padding:8px}.add-compact-brand-row{grid-template-columns:100px minmax(0,1fr);gap:8px}.add-compact-mini-grid{gap:6px}.add-compact .add-input-shell .gi,.add-compact .add-input-shell .gs{padding:9px 2px;font-size:13px}.add-compact-field.mini .add-input-shell .gi,.add-compact-field.mini .add-input-shell .gs{padding:7px 2px;font-size:12px}.add-compact-collapse summary{padding:12px 14px}.add-compact-collapse-body{padding:0 12px 12px}.add-compact .pg{grid-template-columns:repeat(2,minmax(0,88px));justify-content:start}.add-compact .pa{min-height:64px;font-size:9px}.add-compact .pa svg{width:16px;height:16px}.add-compact-field.photos{padding:5px 5px 4px}.add-compact-field.photos .pg{grid-template-columns:repeat(2,minmax(0,56px));gap:5px}.add-compact-field.photos .pa{min-height:42px;font-size:7px}.add-compact-field.photos .pa svg{width:12px;height:12px}.add-condition-pills{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.add-condition-pill{padding:12px 6px;text-align:center}.add-mobile-actions{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);bottom:calc(6px + env(safe-area-inset-bottom,0px));padding-top:8px}}
.add-compact-mini-grid > .add-compact-field.mini{padding:5px 6px;gap:4px;border-radius:13px}
.add-compact-mini-grid > .add-compact-field.mini .add-input-shell .gi,.add-compact-mini-grid > .add-compact-field.mini .add-input-shell .gs{padding:3px 2px;font-size:12px;min-height:34px}
.add-compact .add-input-shell{overflow:hidden}
.add-compact .add-input-shell .gi[type="date"]{padding-right:12px;min-width:0}
.add-compact-mini-grid > .add-compact-field.mini .add-input-shell .gi[type="date"]{padding-right:14px;min-height:34px}
.sell-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.sell-found-card{background:rgba(163,246,156,.18);border-color:rgba(90,169,88,.2)}
@media(max-width:768px){.sell-form-grid{grid-template-columns:1fr 1fr;gap:10px}.sell-found-card{padding:14px!important}.sell-found-card>div{gap:12px!important}.sell-found-card img{width:64px!important;height:64px!important}}
@media(max-width:560px){.sell-form-grid{grid-template-columns:1fr;gap:8px}.sell-found-card{padding:12px!important}.sell-found-card>div{display:grid!important;grid-template-columns:52px minmax(0,1fr);align-items:start!important;gap:10px!important}.sell-found-card img{width:52px!important;height:52px!important}.sell-found-card div[style*="IMEI 1"]{word-break:break-all}.sell-quick-actions{display:grid!important;grid-template-columns:1fr;gap:8px!important}.sell-side-notes .editor-head,.sell-side-notes .editor-list-row{align-items:flex-start}.sell-side-notes .ba{align-self:flex-start}}
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



function F({ l, ic: I, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t2)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 8 }}>
                {I && <I size={13} />} {l}
            </label>
            {children}
        </div>
    );
}

function SettingsSection({ title, summary, open, onToggle, children, style = {} }) {
    return <div className="gc" style={style}>
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--t1)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</div>
                {summary ? <div style={{ color: "var(--t2)", fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>{summary}</div> : null}
            </div>
            <ChevronDown size={18} style={{ color: "var(--t3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease" }} />
        </button>
        {open ? <div style={{ marginTop: 16 }}>{children}</div> : null}
    </div>;
}

function StorageInput({ value, onChange }) {
    const usingCustom = !isPresetStorage(value);
    return (
        <div style={{ display: "grid", gap: 6 }}>
            <select className="gs" value={usingCustom ? CUSTOM_STORAGE : value} onChange={e => onChange(e.target.value === CUSTOM_STORAGE ? (usingCustom ? value : "") : e.target.value)}>
                {STORAGE_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value={CUSTOM_STORAGE}>Custom</option>
            </select>
            {usingCustom && <input className="gi" value={value} onChange={e => onChange(e.target.value)} placeholder="Custom storage e.g. 2TB" style={{ paddingTop: 10, paddingBottom: 10 }} />}
        </div>
    );
}

function RamInput({ value, onChange }) {
    const usingCustom = value && !RAM_PRESETS.includes(value);
    return (
        <div style={{ display: "grid", gap: 6 }}>
            <select className="gs" value={usingCustom ? CUSTOM_RAM : value} onChange={e => onChange(e.target.value === CUSTOM_RAM ? (usingCustom ? value : "") : e.target.value)}>
                <option value="">Select RAM</option>
                {RAM_PRESETS.map(ram => <option key={ram} value={ram}>{ram}</option>)}
                <option value={CUSTOM_RAM}>Custom</option>
            </select>
            {usingCustom && <input className="gi" value={value} onChange={e => onChange(e.target.value)} placeholder="Custom RAM e.g. 18GB" style={{ paddingTop: 10, paddingBottom: 10 }} />}
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
    const [billProDeviceId] = useState(() => ensureBillProDeviceId());
    const [billProActivationCode, setBillProActivationCode] = useState("");
    const billsBackupInputRef = useRef(null);
    const driveSeed = useRef(loadDriveCfg());
    const [driveCfg, sDriveCfg] = useState(driveSeed.current);
    const [driveBusy, setDriveBusy] = useState("");
    const driveTokenRef = useRef({ token: "", expiresAt: 0, email: driveSeed.current.accountEmail });
    const driveFileIdRef = useRef(driveSeed.current.fileId);
    const driveSkipPushRef = useRef(false);
    const driveBusyRef = useRef("");
    const drivePushTimerRef = useRef(null);
    const appDataVersionRef = useRef(0);
    const drivePushedVersionRef = useRef(-1);
    const driveCfgRef = useRef(driveSeed.current);
    const [deviceSeriesDraft, setDeviceSeriesDraft] = useState(readDeviceSeries());
    const [billsStorage, setBillsStorage] = useState(null);
    const [billProError, setBillProError] = useState("");
    const [billProBusy, setBillProBusy] = useState(false);
    const [billProClosedThisSession, setBillProClosedThisSession] = useState(false);
    const [billProOnboarded, setBillProOnboarded] = useState(() => {
        try { return typeof window !== "undefined" && window.localStorage.getItem(BILL_PRO_ONBOARDED_LS) === "1"; } catch { return false; }
    });
    const [billProOnboardError, setBillProOnboardError] = useState("");
    const onboardLogoInputRef = useRef(null);
    const [onboardDraft, setOnboardDraft] = useState(null);
const buildBillProSession = (activation = {}, shop = DEFAULT_SHOP_PROFILE) => ({
    loginId: "bill-pro",
    shopId: "bill-pro-local",
    shopName: activation?.payload?.shopName || shop.shopName || APP_NAME,
    scriptUrl: "",
    syncKey: "",
    trialEndsAt: "",
    pbAuth: null,
    isBillPro: true,
    activation: {
        deviceId: String(activation?.deviceId || activation?.payload?.deviceId || "").trim().toUpperCase(),
        issuedAt: String(activation?.payload?.issuedAt || "").trim(),
        shopName: String(activation?.payload?.shopName || "").trim(),
    },
});
// ────────────────────────────────────────────────────────────────────────────
    const [pg, sPg] = useState("dashboard");
    const [lastSavedInvoiceId, setLastSavedInvoiceId] = useState(null);
    useEffect(() => {
        if (!lastSavedInvoiceId) return;
        const t = setTimeout(() => setLastSavedInvoiceId(null), 4000);
        return () => clearTimeout(t);
    }, [lastSavedInvoiceId]);
    useEffect(() => {
        if (pg !== "transactions" || !lastSavedInvoiceId) return;
        const el = document.querySelector(`[data-invoice-id="${lastSavedInvoiceId}"]`);
        if (el && el.scrollIntoView) {
            try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { el.scrollIntoView(); }
        }
    }, [pg, lastSavedInvoiceId]);
    const [inv, sInv] = useState(seed.current.inv);
    const [tx, sTx] = useState(seed.current.tx);
    const [repairs, setRepairs] = useState(seed.current.repairs || []);
    const [shopCfg, sShopCfg] = useState(seed.current.shop);
    const [sq, sSq] = useState("");
    const [iq, sIq] = useState("");
    const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("All");
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
    const [reportRepairStatusFilter, setReportRepairStatusFilter] = useState("All Repair Statuses");
    const [reportVisibleCount, setReportVisibleCount] = useState(REPORT_PAGE_SIZE);
    const [stockBrandFilter, setStockBrandFilter] = useState("All Brands");
    const [stockConditionFilter, setStockConditionFilter] = useState("Any Condition");
    const [stockPriceFilter, setStockPriceFilter] = useState("Price Range");
    const [ei, sEi] = useState(null);
    const [addFlowStep, setAddFlowStep] = useState(0);
    const [bulkAdd, setBulkAdd] = useState(false);
    const [bulkImeis, setBulkImeis] = useState([]);
    const [bulkManualImei, setBulkManualImei] = useState("");
    const [bulkSaveBusy, setBulkSaveBusy] = useState(false);
    const [stockVisibleCount, setStockVisibleCount] = useState(STOCK_PAGE_SIZE);
    const [repairQuery, setRepairQuery] = useState("");
    const [repairStatusFilter, setRepairStatusFilter] = useState("All Statuses");
    const [partsQuery, setPartsQuery] = useState("");
    const [partSupplierForm, setPartSupplierForm] = useState(createEmptyPartSupplier());
    const [showPartSupplierSheet, setShowPartSupplierSheet] = useState(false);
    const [partsSaveBusy, setPartsSaveBusy] = useState(false);
    const [sf, sSf] = useState(false);
    const [nt, sNt] = useState(null);
    const [lb, sLb] = useState(null);
    const [di, sDi] = useState(null);
    const [repairDetail, setRepairDetail] = useState(null);
    const [repairForm, setRepairForm] = useState(createEmptyRepairForm());
    const [billProForm, setBillProForm] = useState(() => createEmptyBillProForm(seed.current.shop || DEFAULT_SHOP_PROFILE));
    const [billProStickerForm, setBillProStickerForm] = useState(() => createEmptyBillProStickerForm());
    const [returnTarget, setReturnTarget] = useState(null);
    const [returnForm, setReturnForm] = useState({ refundAmount: "", refundMode: "Cash", reason: "" });
    const [returnBusy, setReturnBusy] = useState(false);
    const [confirmDel, setConfirmDel] = useState(null);
    const [canPersist] = useState(typeof window !== "undefined" && !!window.localStorage);
    const [ol, setOl] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
    const [syncCfg, setSyncCfg] = useState(syncSeed.current);
    const [syncBusy, setSyncBusy] = useState(false);
    const [profileSaveBusy, setProfileSaveBusy] = useState(false);
    const [shopProfileDirty, setShopProfileDirty] = useState(false);
    const [settingsOpenSection, setSettingsOpenSection] = useState("");
    const [syncEditMode, setSyncEditMode] = useState(false);
    const [storageReady, setStorageReady] = useState(false);
    const [syncMeta, setSyncMeta] = useState(() => normalizeSyncMeta());
    const [installEvt, setInstallEvt] = useState(null);
    const [installed, setInstalled] = useState(typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone));
    const [swReady, setSwReady] = useState(false);
    const [swUpdate, setSwUpdate] = useState(false);
    const stockLoadMoreRef = useRef(null);
    const reportLoadMoreRef = useRef(null);
    const lastRemoteCheckAtRef = useRef(0);
    const lastSavedShopProfileSignatureRef = useRef(JSON.stringify(normalizeShopProfile(seed.current.shop || DEFAULT_SHOP_PROFILE)));
    const billProSessionAppliedForRef = useRef("");
    const notifyTimeoutRef = useRef(null);
    const shopProfileDirtyRef = useRef(false);
    const camStream = useRef(null);
    const camIdleTimer = useRef(null);
    const releaseCameraNow = useCallback(() => {
        if (camIdleTimer.current) { clearTimeout(camIdleTimer.current); camIdleTimer.current = null; }
        if (camStream.current) { camStream.current.getTracks().forEach(t => t.stop()); camStream.current = null; }
    }, []);

    const ef = useMemo(() => createEmptyForm(shopCfg), [shopCfg]);
    const [fm, sFm] = useState(ef);
    const appMode = shopSession?.isBillPro ? "bill-pro" : shopCfg.businessMode;
    const effectiveShopCfg = useMemo(() => appMode === "bill-pro" ? normalizeShopProfile({ ...shopCfg, businessMode: "bill-pro", enabledModules: BILL_PRO_MODULES }) : normalizeShopProfile(shopCfg), [appMode, shopCfg]);
    const appThemeClass = effectiveShopCfg.appTheme === "dark" ? "theme-dark" : "theme-light";
    const enabledModules = useMemo(() => appMode === "bill-pro" ? BILL_PRO_MODULES : getEnabledModules(shopCfg), [appMode, shopCfg]);
    const billProFormTemplate = useMemo(() => createEmptyBillProForm(effectiveShopCfg), [effectiveShopCfg]);
    const billProSalePreview = useMemo(() => calcInvoiceTotals(billProForm.amount || 0, billProForm.billType, billProForm.gstRate), [billProForm.amount, billProForm.billType, billProForm.gstRate]);
    const liveDeviceByImei = (imei) => inv.find(i => matchImei(i, imei) && i.status === "In Stock" && i.qty > 0);
    const activeSyncUrl = "";
    const syncReady = !!(shopSession?.pbAuth?.token && (syncCfg.shopId || shopSession?.shopId));
    const syncSetupMessage = appMode === "bill-pro" ? "Bill Pro keeps data only on this device." : (shopSession ? "Cloud data is not configured yet." : "Login required before saving data.");
    const syncStateLabel = appMode === "bill-pro"
        ? (ol ? "Saved locally" : "Offline")
        : syncMeta.syncState === "syncing"
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
    const applyBillProSession = useCallback((activation) => {
        setBillProClosedThisSession(false);
        // Merge the activation snapshot's shop name at most once per activation.
        // This callback re-fires on every shopCfg change via the boot effect, so
        // merging on re-fires wiped keystrokes and repopulated deliberately
        // cleared fields. After the first apply the live profile always wins —
        // even when it is an intentional empty string.
        const activationKey = String(activation?.token || activation?.activatedAt || "");
        const firstApply = billProSessionAppliedForRef.current !== activationKey;
        if (firstApply) billProSessionAppliedForRef.current = activationKey;
        const liveName = String(shopCfg.shopName || "").trim();
        const sessionName = String(activation?.payload?.shopName || "").trim();
        const nextProfile = normalizeShopProfile({
            ...shopCfg,
            shopName: firstApply && isDefaultShopValue(liveName, APP_NAME) ? (sessionName || shopCfg.shopName) : shopCfg.shopName,
            businessMode: "bill-pro",
            enabledModules: BILL_PRO_MODULES,
        });
        // Only write the profile when it actually changed. An unconditional
        // sShopCfg here gave this callback a new identity on every call, which
        // re-ran the boot effect below and re-applied the session forever.
        const nextSignature = JSON.stringify(nextProfile);
        if (nextSignature !== lastSavedShopProfileSignatureRef.current) {
            lastSavedShopProfileSignatureRef.current = nextSignature;
            setShopProfileDirty(false);
            shopProfileDirtyRef.current = false;
            sShopCfg(nextProfile);
        }
        setShopSession(buildBillProSession(activation, nextProfile));
        setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: "", syncKey: "", lastStatus: "Bill Pro active on this device" }));
    }, [shopCfg]);
    const activateBillProCode = async (rawCode) => {
        setBillProBusy(true);
        setBillProError("");
        try {
            const key = await verifyBillProKey(rawCode);
            const deviceId = ensureBillProDeviceId();
            const activation = {
                token: key,
                payload: {
                    edition: "bill-pro",
                    deviceId,
                    shopName: String(effectiveShopCfg.shopName || "").trim(),
                    issuedAt: new Date().toISOString(),
                },
                deviceId,
                activatedAt: new Date().toISOString(),
            };
            window.localStorage.setItem(BILL_PRO_ACTIVATION_LS, JSON.stringify(activation));
            applyBillProSession(activation);
            setAuthReady(true);
            setBillProActivationCode("");
            notify("Bill Pro activated on this device.", "success");
        } catch (error) {
            setBillProError(error?.message || "Unable to activate Bill Pro.");
        } finally {
            setBillProBusy(false);
        }
    };
    const handleBillProActivation = () => activateBillProCode(billProActivationCode);
    const syncActivationShopName = (shopName) => {
        try {
            const raw = window.localStorage.getItem(BILL_PRO_ACTIVATION_LS);
            const record = raw ? JSON.parse(raw) : null;
            if (record && record.payload) {
                record.payload.shopName = shopName;
                window.localStorage.setItem(BILL_PRO_ACTIVATION_LS, JSON.stringify(record));
            }
        } catch { }
    };
    if (!shopSession && onboardDraft !== null) setOnboardDraft(null);
    if (shopSession?.isBillPro && !billProOnboarded && onboardDraft === null) {
        const p = shopCfg;
        const fresh = isDefaultShopValue(p.shopName, APP_NAME) && isDefaultShopValue(p.address, DEFAULT_SHOP_PROFILE.address);
        setOnboardDraft(fresh
            ? { shopName: "", ownerName: String(p.ownerName || ""), address: "", phone: "", logoData: p.logoData || "" }
            : { shopName: String(p.shopName || ""), ownerName: String(p.ownerName || ""), address: String(p.address || ""), phone: String(p.phone || ""), logoData: p.logoData || "" });
    }
    const setOnboardDraftField = (key, value) => {
        setOnboardDraft(current => ({ ...((current || {} )), [key]: value }));
    };
    const handleOnboardLogoPick = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setOnboardDraftField("logoData", ev.target?.result || "");
        reader.readAsDataURL(file);
        event.target.value = "";
    };
    const completeBillProOnboarding = () => {
        const d = onboardDraft || {};
        const name = String(d.shopName || "").trim();
        const addr = String(d.address || "").trim();
        if (!name || !addr) { setBillProOnboardError("Please enter your shop name and address to continue."); return; }
        setBillProOnboardError("");
        const next = normalizeShopProfile({
            ...shopCfg,
            shopName: name,
            ownerName: String(d.ownerName || "").trim(),
            address: addr,
            phone: String(d.phone || "").trim(),
            logoData: d.logoData || "",
        });
        lastSavedShopProfileSignatureRef.current = JSON.stringify(next);
        setShopProfileDirty(false);
        shopProfileDirtyRef.current = false;
        sShopCfg(next);
        syncActivationShopName(name);
        try { window.localStorage.setItem(BILL_PRO_ONBOARDED_LS, "1"); } catch { }
        setOnboardDraft(null);
        setBillProOnboarded(true);
        sPg("dashboard");
        notify("Shop profile saved on this device.", "success");
    };
    const openStoredBillPro = () => {
        const activation = loadBillProActivationRecord();
        const deviceId = ensureBillProDeviceId();
        if (!activation?.payload?.deviceId || String(activation.payload.deviceId).trim().toUpperCase() !== deviceId) {
            setBillProError("No valid Bill Pro activation is stored for this device.");
            return;
        }
        applyBillProSession(activation);
        setAuthReady(true);
        notify("Bill Pro opened on this device.", "success");
    };
    const logoutShop = () => {
        setBillProClosedThisSession(true);
        setShopSession(null);
        setAuthReady(true);
        setShopProfileDirty(false);
        shopProfileDirtyRef.current = false;
        setSyncCfg(current => normalizeSyncCfg({ ...current, connected: false, scriptUrl: "", syncKey: "", lastStatus: "Bill Pro closed" }));
        notify("Bill Pro closed on this device.", "success");
    };
    const resetForm = () => {
        sEi(null);
        setAddFlowStep(0);
        setBulkAdd(false);
        setBulkImeis([]);
        setBulkManualImei("");
        sFm(createEmptyForm(shopCfg));
    };
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
    const editFromStock = (item) => { setBulkAdd(false); setBulkImeis([]); setBulkManualImei(""); setAddFlowStep(1); sEi(item); sFm(toForm(item)); sSf(false); sDi(null); sPg(prev => { if (typeof window !== "undefined" && prev !== "add") window.history.pushState({ page: prev }, "", window.location.pathname); return "add"; }); };
    const setSyncField = (k, v) => setSyncCfg(p => normalizeSyncCfg({ ...p, [k]: v, ...(k === "scriptUrl" || k === "shopId" || k === "syncKey" ? { connected: false } : {}) }));
    const setShopField = (k, v) => {
        setShopProfileDirty(true);
        shopProfileDirtyRef.current = true;
        sShopCfg(p => {
            const next = { ...p, [k]: v };
            if (k === "businessMode" && v === "repair-pro") next.enabledModules = ["repair"];
            if (k === "businessMode" && v === "bill-pro") next.enabledModules = BILL_PRO_MODULES;
            if (k === "enabledModules" && !Array.isArray(v)) next.enabledModules = p.enabledModules;
            return normalizeShopProfile(next);
        });
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
        if (k === "condition" && v === "New" && (!next.warrantyType || next.warrantyType === "No Warranty")) {
            next.warrantyType = "1 Year Warranty";
            if (!next.purchaseDate) next.purchaseDate = isoDate();
        }
        if (k === "warrantyType") {
            if (v !== "Testing Warranty") next.warrantyMonths = "";
            if (v !== "No Warranty" && !next.purchaseDate) next.purchaseDate = isoDate();
        }
        if (k === "amount" || k === "paidAmount") {
            const total = Number(k === "amount" ? v : next.amount) || 0;
            let paid = Number(k === "paidAmount" ? v : next.paidAmount) || 0;
            if (paid > total && total > 0) { paid = total; next.paidAmount = String(total); }
            next.dueAmount = String(Math.max(total - paid, 0));
        }
        if (k === "financeTenureMonths") next.financeTenureMonths = String(v).replace(/\D/g, "").slice(0, 3);
        if (k === "paymentMode") {
            if (v === "EMI") {
                const total = Number(next.amount) || 0;
                next.paidAmount = "0";
                next.dueAmount = String(total);
            } else if ((p.paymentMode || "") === "EMI") {
                const total = Number(next.amount) || 0;
                next.paidAmount = String(total);
                next.dueAmount = "0";
            }
        }
        if (k === "gstRate") next.gstRate = String(v).replace(/[^\d.]/g, "");
        return next;
    });
    const resetBillProForm = useCallback(() => {
        setBillProForm(billProFormTemplate);
    }, [billProFormTemplate]);
    const setBillProField = useCallback((key, value) => {
        setBillProForm(current => {
            const next = { ...current, [key]: value };
            if (key === "phone") next.phone = cleanMobileNumber(value);
            if (key === "imei" || key === "imei2") next[key] = cleanImei(value);
            if (key === "qty") next.qty = String(value).replace(/\D/g, "") || "1";
            if (key === "gstRate") next.gstRate = String(value).replace(/[^\d.]/g, "");
            if (key === "category") {
                if (isBillProMobileCategory(value)) {
                    next.itemLabel = "";
                    next.serialNo = "";
                    next.qty = "1";
                } else {
                    next.brand = "";
                    next.model = "";
                    next.color = "";
                    next.ram = "";
                    next.storage = "";
                    next.condition = "New";
                    next.imei = "";
                    next.imei2 = "";
                }
            }
            if (key === "financeTenureMonths") next.financeTenureMonths = String(value).replace(/\D/g, "").slice(0, 3);
            if (key === "paidAmount" && (current.paymentMode || "") === "EMI") {
                const total = Number(current.amount) || 0;
                const down = Math.max(0, Math.min(Number(value) || 0, total));
                next.paidAmount = String(down);
                next.dueAmount = String(Math.max(total - down, 0));
            }
            if (key === "paymentMode") {
                if (value === "EMI") {
                    const total = Number(next.amount) || 0;
                    next.paidAmount = "0";
                    next.dueAmount = String(total);
                } else if ((current.paymentMode || "") === "EMI") {
                    const total = Number(next.amount) || 0;
                    next.paidAmount = String(total);
                    next.dueAmount = "0";
                }
            }
            if (key === "amount") {
                const total = Number(value) || 0;
                if ((current.paymentMode || "") === "EMI") {
                    const down = Math.min(Number(current.paidAmount) || 0, total);
                    next.paidAmount = String(down);
                    next.dueAmount = String(Math.max(total - down, 0));
                } else {
                    next.paidAmount = String(total);
                    next.dueAmount = "0";
                }
            }
            return next;
        });
    }, []);
    const resetBillProStickerForm = useCallback(() => {
        setBillProStickerForm(createEmptyBillProStickerForm());
    }, []);
    const setBillProStickerField = useCallback((key, value) => {
        setBillProStickerForm(current => {
            const next = {
                ...current,
                [key]: key === "copies" ? (String(value).replace(/\D/g, "") || "1") : value,
            };
            if (key === "imei" || key === "imei2") next[key] = cleanImei(value);
            if (key === "category") {
                if (isBillProMobileCategory(value)) {
                    next.itemLabel = "";
                    next.code = "";
                } else {
                    next.brand = "";
                    next.model = "";
                    next.color = "";
                    next.ram = "";
                    next.storage = "";
                    next.condition = "New";
                    next.imei = "";
                    next.imei2 = "";
                }
            }
            return next;
        });
    }, []);
    const addBulkImei = useCallback((rawImei) => {
        const imei = cleanImei(rawImei);
        if (!hasImei(imei)) {
            notify("IMEI must be 15 digits.", "error");
            return false;
        }
        const existing = findDeviceByImei(inv, imei);
        if (existing) {
            notify(`Skipped duplicate IMEI on ${existing.brand} ${existing.model}.`, "warning");
            return false;
        }
        let added = false;
        setBulkImeis(current => {
            if (current.includes(imei)) return current;
            added = true;
            return [imei, ...current];
        });
        if (!added) {
            notify("This IMEI is already in the current bulk list.", "warning");
            return false;
        }
        notify("IMEI added to bulk list", "success");
        return true;
    }, [inv, notify]);
    const removeBulkImei = useCallback((imei) => {
        setBulkImeis(current => current.filter(value => value !== imei));
    }, []);
    const submitBulkManualImei = useCallback(() => {
        if (addBulkImei(bulkManualImei)) setBulkManualImei("");
    }, [addBulkImei, bulkManualImei]);
    const setRepairField = useCallback((key, value) => {
        setRepairForm(current => ({
            ...current,
            [key]: key === "imei" ? cleanImei(value) : key === "receivedDate" || key === "deliveredDate" ? normalizeDateInput(value, "") : value,
        }));
    }, []);
    const openRepairForm = useCallback((repair = null) => {
        if (repair) {
            setRepairForm({
                ...createEmptyRepairForm(),
                ...repair,
                estimatedCost: repair.estimatedCost ? String(repair.estimatedCost) : "",
                advance: repair.advance ? String(repair.advance) : "",
                finalCost: repair.finalCost ? String(repair.finalCost) : "",
                partCost: repair.partCost ? String(repair.partCost) : "",
                receivedDate: normalizeDateInput(repair.receivedDate, isoDate()),
                deliveredDate: normalizeDateInput(repair.deliveredDate, ""),
            });
        } else {
            setRepairForm(createEmptyRepairForm());
        }
        setRepairDetail(null);
        goPage("repair-form");
    }, []);
    const setPartSupplierField = useCallback((key, value) => {
        setPartSupplierForm(current => ({ ...current, [key]: key === "phone" ? cleanMobileNumber(value) : value }));
    }, []);
    const resetPartSupplierForm = useCallback(() => setPartSupplierForm(createEmptyPartSupplier()), []);
    const closePartSupplierSheet = () => {
        resetPartSupplierForm();
        setShowPartSupplierSheet(false);
    };
    const openPartSupplierSheet = (supplier = null) => {
        if (supplier) {
            setPartSupplierForm({
                id: supplier.id,
                name: supplier.name || "",
                phone: supplier.phone || "",
                address: supplier.address || "",
                notes: supplier.notes || "",
            });
        } else {
            resetPartSupplierForm();
        }
        setShowPartSupplierSheet(true);
    };
    const toForm = (item, extras = {}) => ({ ...ef, ...item, ...extras, buyPrice: String(item.buyPrice ?? extras.buyPrice ?? ""), sellPrice: String(item.sellPrice ?? extras.sellPrice ?? ""), qty: String(item.qty ?? extras.qty ?? 1), amount: String(item.amount ?? extras.amount ?? ""), paidAmount: String(item.paidAmount ?? extras.paidAmount ?? item.sellPrice ?? item.amount ?? ""), dueAmount: String(item.dueAmount ?? extras.dueAmount ?? 0) });
    useEffect(() => {
        try {
            window.localStorage.removeItem(AUTH_SESSION_KEY);
            const activation = loadBillProActivationRecord();
            const deviceId = ensureBillProDeviceId();
            if (!billProClosedThisSession && activation?.payload?.deviceId && String(activation.payload.deviceId).trim().toUpperCase() === deviceId) {
                applyBillProSession(activation);
            }
        } catch { }
        setAuthReady(true);
    }, [applyBillProSession, billProClosedThisSession]);
    useEffect(() => {
        if (syncCfg.scriptUrl === activeSyncUrl) return;
        setSyncCfg(current => normalizeSyncCfg({ ...current, scriptUrl: activeSyncUrl }));
    }, [activeSyncUrl, syncCfg.scriptUrl]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.history.replaceState({ page: "dashboard" }, "", window.location.pathname);
        const handlePopState = (event) => {
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
    useEffect(() => {
        const billProAllowedPages = ["dashboard", "billing", "transactions", "bill-stickers", "reports", "settings"];
        if ((pg === "add" && !enabledModules.some(module => module === "buy" || module === "sell")) || (pg === "buy" && !enabledModules.includes("buy")) || (pg === "sell" && !enabledModules.includes("sell")) || (pg === "repair" && !enabledModules.includes("repair")) || (pg === "repair-form" && !enabledModules.includes("repair")) || (appMode === "repair-pro" && pg === "inventory") || (appMode !== "repair-pro" && pg === "parts") || (appMode === "bill-pro" && !billProAllowedPages.includes(pg))) {
            sPg("dashboard");
        }
    }, [appMode, enabledModules, pg]);
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
                    setRepairs(Array.isArray(appState.repairs) ? appState.repairs.map(normalizeRepair) : []);
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
        void saveAppState({ inv, tx, repairs, shop: effectiveShopCfg });
    }, [effectiveShopCfg, storageReady, inv, tx, repairs]);
    useEffect(() => {
        if (!storageReady) return;
        void saveSyncState(syncMeta);
    }, [storageReady, syncMeta]);
    useEffect(() => {
        if (!canPersist) return;
        window.localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg));
    }, [canPersist, syncCfg]);
    useEffect(() => {
        driveCfgRef.current = driveCfg;
    }, [driveCfg]);
    useEffect(() => {
        if (!canPersist) return;
        window.localStorage.setItem(DRIVE_CFG_KEY, JSON.stringify(driveCfg));
    }, [canPersist, driveCfg]);
    useEffect(() => {
        appDataVersionRef.current += 1;
    }, [inv, tx, repairs, effectiveShopCfg]);
    useEffect(() => {
        if (!storageReady || !driveCfgRef.current.connected || !driveCfgRef.current.autoBackup) return;
        if (driveSkipPushRef.current) { driveSkipPushRef.current = false; return; }
        if (appDataVersionRef.current === drivePushedVersionRef.current) return;
        if (drivePushTimerRef.current) clearTimeout(drivePushTimerRef.current);
        drivePushTimerRef.current = setTimeout(() => { void pushDriveBackup("auto"); }, 15000);
        return () => { if (drivePushTimerRef.current) clearTimeout(drivePushTimerRef.current); };
    }, [storageReady, driveCfg.autoBackup, driveCfg.connected, inv, tx, repairs, effectiveShopCfg]);
    useEffect(() => {
        const onLeave = () => {
            if (driveCfgRef.current.connected && driveCfgRef.current.autoBackup) void pushDriveBackup("leave");
        };
        window.addEventListener("pagehide", onLeave);
        return () => window.removeEventListener("pagehide", onLeave);
    }, []);
    useEffect(() => {
        if (!storageReady || !driveCfgRef.current.connected) return;
        void pullDriveBackup("startup");
        const interval = setInterval(() => {
            if (driveCfgRef.current.connected) void pullDriveBackup("auto");
        }, 600000);
        return () => clearInterval(interval);
    }, [storageReady]);
    useEffect(() => { syncBusyRef.current = syncBusy; }, [syncBusy]);
    useEffect(() => {
        const signature = JSON.stringify(effectiveShopCfg);
        const dirty = signature !== lastSavedShopProfileSignatureRef.current;
        if (shopProfileDirty !== dirty) setShopProfileDirty(dirty);
        shopProfileDirtyRef.current = dirty;
    }, [effectiveShopCfg, shopProfileDirty]);
    useEffect(() => {
        if (!storageReady) return;
        if (skipNextDirtyMark.current) {
            skipNextDirtyMark.current = false;
            return;
        }
        updateSyncMeta(current => ({
            ...current,
            pendingSync: appMode === "bill-pro" ? false : true,
            syncState: ol ? "saved-local" : "offline",
            lastLocalChangeAt: new Date().toISOString(),
            syncError: "",
        }));
    }, [appMode, storageReady, inv, tx, repairs, shopCfg, ol, updateSyncMeta]);
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
            syncState: appMode === "bill-pro" ? (!ol ? "offline" : "saved-local") : (!ol ? "offline" : current.pendingSync ? "saved-local" : current.syncState === "error" ? "error" : "synced"),
        }));
    }, [appMode, storageReady, ol, updateSyncMeta]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
        const refreshInstalled = () => setInstalled(Boolean(mq?.matches || window.navigator.standalone));
        const onInstalled = () => {
            setInstalled(true);
            setInstallEvt(null);
            notify("App installed. You can now use it like a mobile app.", "success");
        };
        refreshInstalled();
        if (mq?.addEventListener) mq.addEventListener("change", refreshInstalled);
        else if (mq?.addListener) mq.addListener(refreshInstalled);
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
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const saveShopProfile = async () => {
        const profile = effectiveShopCfg;
        const signature = JSON.stringify(profile);
        syncActivationShopName(String(profile.shopName || "").trim());
        const unchanged = signature === lastSavedShopProfileSignatureRef.current;
        lastSavedShopProfileSignatureRef.current = signature;
        setShopProfileDirty(false);
        shopProfileDirtyRef.current = false;
        notify(unchanged ? "No shop profile changes to save." : "Shop profile saved on this device.", unchanged ? "warning" : "success");
    };

    const setDriveStatus = (patch = {}) => sDriveCfg(current => normalizeDriveCfg({ ...current, ...patch }));

    const driveExpiryMessage = (e) => e?.status === 401
        ? "Google session expired. Reconnect Drive backup from Settings."
        : (e?.message || "Drive backup failed.");

    const collectRemoteBackups = async (api, token, folderId) => {
        const files = await api.listFiles(token, folderId);
        const remotes = [];
        for (const file of files) {
            if (file?.id && file.id === driveFileIdRef.current) continue;
            try { remotes.push(readBackupPayload(await api.download(token, file.id))); } catch { continue; }
        }
        return remotes;
    };

    const applyMergedDriveState = (merged) => {
        driveSkipPushRef.current = true;
        skipNextAutoSync.current = true;
        skipNextDirtyMark.current = true;
        sInv(merged.inv.map(normalizeInv));
        sTx(merged.tx.map(normalizeTx));
        setRepairs(merged.repairs.map(normalizeRepair));
        if (merged.shop) sShopCfg(normalizeShopProfile(merged.shop));
    };

    const driveApi = () => (window.phoneDukaanDesktop?.isElectron ? {
        ensureFolder: () => window.phoneDukaanDesktop.driveEnsureFolder(),
        findFile: (_token, folderId, fileName) => window.phoneDukaanDesktop.driveFindFile({ folderId, fileName }),
        listFiles: (_token, folderId) => window.phoneDukaanDesktop.driveList({ folderId }),
        upload: (_token, folderId, fileName, text, existingFileId) => window.phoneDukaanDesktop.driveUpload({ folderId, fileName, text, existingFileId }),
        download: (_token, fileId) => window.phoneDukaanDesktop.driveDownload({ fileId }),
    } : {
        ensureFolder: (token) => ensureBackupFolder(token),
        findFile: (token, folderId, fileName) => findBackupFile(token, folderId, fileName),
        listFiles: (token, folderId) => listBackupFiles(token, folderId),
        upload: (token, folderId, fileName, text, existingFileId) => uploadBackup(token, folderId, fileName, text, existingFileId),
        download: (token, fileId) => downloadBackupFile(token, fileId),
    });

    const getDriveToken = async () => {
        const cached = driveTokenRef.current;
        if (cached.token && cached.expiresAt - 120000 > Date.now()) return cached.token;
        if (window.phoneDukaanDesktop?.isElectron) {
            const result = await window.phoneDukaanDesktop.driveToken();
            if (!result?.accessToken) throw new DriveBackupError(result?.error || "Desktop Google sign-in required. Connect again from Settings.");
            driveTokenRef.current = { token: result.accessToken, expiresAt: Date.now() + Number(result.expiresIn || 3600) * 1000, email: result.email || cached.email || "" };
            return result.accessToken;
        }
        if (!DRIVE_OAUTH_CLIENT_ID) throw new DriveBackupError("Add your Google OAuth client ID in drive-config.js to enable Drive backup.");
        const tokenResult = await requestDriveToken(DRIVE_OAUTH_CLIENT_ID, { prompt: "" });
        driveTokenRef.current = { token: tokenResult.accessToken, expiresAt: Date.now() + Number(tokenResult.expiresIn || 3600) * 1000, email: cached.email || "" };
        return tokenResult.accessToken;
    };

    const activateDriveBackup = async (email) => {
        const token = await getDriveToken();
        const api = driveApi();
        const folder = await api.ensureFolder(token);
        const remotes = await collectRemoteBackups(api, token, folder.id);
        const stored = await loadAppState();
        const localPayload = buildBackupPayload(stored || { inv: [], tx: [], repairs: [], shop: null }, billProDeviceId, readDeviceSeries());
        const merged = mergeBackupPayloads(localPayload, remotes);
        applyMergedDriveState(merged);
        const mergedPayload = buildBackupPayload(merged, billProDeviceId, readDeviceSeries());
        const own = await api.findFile(token, folder.id, backupFileNameFor(billProDeviceId));
        const up = await api.upload(token, folder.id, backupFileNameFor(billProDeviceId), JSON.stringify(mergedPayload), own?.id || "");
        driveFileIdRef.current = up.id;
        const nowIso = new Date().toISOString();
        const counts = `${merged.inv.length} stock items · ${merged.tx.length} bills`;
        setDriveStatus({
            connected: true, accountEmail: email, folderId: folder.id, fileId: up.id,
            lastPushAt: nowIso, lastPullAt: nowIso,
            lastStatus: `Connected${email ? ` as ${email}` : ""} · ${counts} safe in Drive`, lastError: "",
        });
        notify(`Google Drive backup connected. ${counts} are safe.`, "success");
    };

    const connectDrive = async () => {
        if (driveBusyRef.current) return;
        driveBusyRef.current = "connect";
        setDriveBusy("connect");
        try {
            let email = "";
            if (window.phoneDukaanDesktop?.isElectron) {
                const started = await window.phoneDukaanDesktop.driveAuthStart();
                if (!started?.ok) throw new DriveBackupError(started?.error || "Desktop Google sign-in failed.");
                email = String(started.email || "");
            } else {
                if (!DRIVE_OAUTH_CLIENT_ID) throw new DriveBackupError("Add your Google OAuth client ID in drive-config.js to enable Drive backup.");
                const tokenResult = await requestDriveToken(DRIVE_OAUTH_CLIENT_ID, { prompt: "consent select_account" });
                driveTokenRef.current = { token: tokenResult.accessToken, expiresAt: Date.now() + Number(tokenResult.expiresIn || 3600) * 1000, email: "" };
                email = await fetchDriveEmail(tokenResult.accessToken);
            }
            driveTokenRef.current = { ...driveTokenRef.current, email };
            await activateDriveBackup(email);
        } catch (e) {
            const message = e?.message || "Google sign-in failed.";
            setDriveStatus({ lastStatus: message, lastError: message });
            notify(message, "error");
        } finally {
            driveBusyRef.current = "";
            setDriveBusy("");
        }
    };

    const pushDriveBackup = async (mode = "manual") => {
        if (!driveCfgRef.current.connected || driveBusyRef.current === "push" || driveBusyRef.current === "pull") return;
        driveBusyRef.current = "push";
        if (mode === "manual") setDriveBusy("backup");
        try {
            const token = await getDriveToken();
            const api = driveApi();
            const folderId = driveCfgRef.current.folderId || (await api.ensureFolder(token)).id;
            const stored = await loadAppState();
            const payload = buildBackupPayload(stored || { inv: [], tx: [], repairs: [], shop: null }, billProDeviceId, readDeviceSeries());
            let ownId = driveFileIdRef.current;
            if (!ownId) {
                const own = await api.findFile(token, folderId, backupFileNameFor(billProDeviceId));
                ownId = own?.id || "";
            }
            const up = await api.upload(token, folderId, backupFileNameFor(billProDeviceId), JSON.stringify(payload), ownId);
            driveFileIdRef.current = up.id;
            drivePushedVersionRef.current = appDataVersionRef.current;
            setDriveStatus({
                folderId, fileId: up.id, lastPushAt: payload.savedAt,
                lastStatus: mode === "auto" ? "Auto backup sent" : "Backup sent to Google Drive", lastError: "",
            });
            if (mode === "manual") notify("Backup saved to Google Drive.", "success");
        } catch (e) {
            const message = driveExpiryMessage(e);
            setDriveStatus({ lastStatus: message, lastError: message });
            if (mode === "manual") notify(message, "error");
        } finally {
            driveBusyRef.current = "";
            if (mode === "manual") setDriveBusy("");
        }
    };

    const pullDriveBackup = async (mode = "manual") => {
        if (!driveCfgRef.current.connected || driveBusyRef.current) return;
        driveBusyRef.current = "pull";
        if (mode === "manual") setDriveBusy("pull");
        try {
            const token = await getDriveToken();
            const api = driveApi();
            const folderId = driveCfgRef.current.folderId || (await api.ensureFolder(token)).id;
            const remotes = await collectRemoteBackups(api, token, folderId);
            const stored = await loadAppState();
            const localPayload = buildBackupPayload(stored || { inv: [], tx: [], repairs: [], shop: null }, billProDeviceId, readDeviceSeries());
            const merged = mergeBackupPayloads(localPayload, remotes);
            const beforeCount = (stored?.inv?.length || 0) + (stored?.tx?.length || 0) + (stored?.repairs?.length || 0);
            const afterCount = merged.inv.length + merged.tx.length + merged.repairs.length;
            const nowIso = new Date().toISOString();
            const gained = afterCount - beforeCount;
            setDriveStatus({
                folderId, lastPullAt: nowIso,
                lastStatus: gained > 0 ? `Restored ${gained} record${gained === 1 ? "" : "s"} from Drive` : "Already up to date with Drive", lastError: "",
            });
            if (gained > 0) {
                applyMergedDriveState(merged);
                notify(`Restored ${gained} record${gained === 1 ? "" : "s"} from Google Drive.`, "success");
            } else if (mode === "manual") {
                notify("Everything is already up to date with Google Drive.", "success");
            }
        } catch (e) {
            const message = driveExpiryMessage(e);
            setDriveStatus({ lastStatus: message, lastError: message });
            if (mode === "manual") notify(message, "error");
        } finally {
            driveBusyRef.current = "";
            if (mode === "manual") setDriveBusy("");
        }
    };

    const toggleDriveAutoBackup = () => {
        sDriveCfg(current => normalizeDriveCfg({
            ...current, autoBackup: !current.autoBackup,
            lastStatus: !current.autoBackup ? "Auto backup resumed" : "Auto backup paused", lastError: "",
        }));
    };

    const disconnectDrive = async () => {
        if (driveBusyRef.current) return;
        driveBusyRef.current = "disconnect";
        try {
            if (window.phoneDukaanDesktop?.isElectron) {
                try { await window.phoneDukaanDesktop.driveRevoke(); } catch { }
            } else if (driveTokenRef.current.token) {
                await revokeDriveToken(driveTokenRef.current.token);
            }
        } catch { }
        driveTokenRef.current = { token: "", expiresAt: 0, email: "" };
        driveFileIdRef.current = "";
        drivePushedVersionRef.current = -1;
        if (drivePushTimerRef.current) { clearTimeout(drivePushTimerRef.current); drivePushTimerRef.current = null; }
        sDriveCfg(current => normalizeDriveCfg({
            connected: false, accountEmail: "", folderId: "", fileId: "",
            autoBackup: current.autoBackup, lastStatus: "Not connected", lastError: "",
        }));
        driveBusyRef.current = "";
        notify("Google Drive backup disconnected. Local data stays on this device.", "success");
    };

    const saveDeviceSeries = () => {
        const series = normalizeDeviceSeries(deviceSeriesDraft);
        try {
            if (series) window.localStorage.setItem(DEVICE_SERIES_KEY, series);
            else window.localStorage.removeItem(DEVICE_SERIES_KEY);
        } catch { }
        setDeviceSeriesDraft(series);
        notify(series
            ? `This device bills with series ${series} (invoices: ${effectiveShopCfg.invoicePrefix}-${series}-${yymmFor()}-####).`
            : "Series letter removed. Invoices return to shared numbering.", series ? "success" : "warning");
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
        if (fm.warrantyType && fm.warrantyType !== "No Warranty" && !fm.purchaseDate) { notify("Purchase date is required when warranty is enabled.", "error"); return; }
        const nextItem = normalizeInv({ ...ei, ...fm, imei: fm.imei, imei2: fm.imei2, buyPrice: +fm.buyPrice, sellPrice: +fm.sellPrice, qty: ei?.status === "Sold" ? 0 : 1, photos: fm.photos || [], addedDate: ei?.addedDate || new Date().toISOString().slice(0, 10) });
        try {
            const savedRecord = await localRecord(nextItem);
            const savedItemBase = normalizeInv({ ...nextItem, id: savedRecord.id });
            const uploadedPhotos = { photos: savedItemBase.photos || [], failures: [] };
            const savedItem = { ...savedItemBase, photos: uploadedPhotos.photos };
            if (ei && ei.id) {
                sInv(p => p.map(i => i.id === ei.id ? savedItem : i));
                notify(uploadedPhotos.failures.length ? "Stock updated. Some photos are still local." : "Stock updated");
                resetForm();
                sPg("inventory");
            } else {
                sInv(p => [savedItem, ...p]);
                const addTx = normalizeTx({ id: genId(), type: "Add", stockItemId: savedItem.id, imei: savedItem.imei, imei2: savedItem.imei2, brand: savedItem.brand, model: savedItem.model, color: savedItem.color, ram: savedItem.ram, storage: savedItem.storage, batteryHealth: savedItem.batteryHealth, condition: savedItem.condition, customerName: fm.supplier, phone: fm.phone, amount: +fm.buyPrice, costPrice: +fm.buyPrice, paidAmount: 0, dueAmount: 0, paymentMode: "", date: savedItem.addedDate, dateTime: `${savedItem.addedDate}T12:00:00.000Z`, notes: fm.notes });
                const savedTx = await localTransaction(addTx);
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
    const saveBulkInv = async () => {
        if (ei) { notify("Bulk add is only for new stock entries.", "error"); return; }
        if (!fm.model || !fm.brand) { notify("Brand and model are required!", "error"); return; }
        if (!(+fm.sellPrice > 0)) { notify("Sell price is required.", "error"); return; }
        if (fm.warrantyType && fm.warrantyType !== "No Warranty" && !fm.purchaseDate) { notify("Purchase date is required when warranty is enabled.", "error"); return; }
        if (!bulkImeis.length) { notify("Scan at least one IMEI first.", "error"); return; }
        setBulkSaveBusy(true);
        try {
            const addedDate = new Date().toISOString().slice(0, 10);
            const sharedPhotos = (fm.photos || []).map(normalizePhotoRef);
            const savedItems = [];
            const savedTxs = [];
            let pendingPhotoFailures = 0;
            for (const imei of bulkImeis) {
                const item = normalizeInv({ id: genId(), imei, imei2: "", brand: fm.brand, model: fm.model, color: fm.color, ram: fm.ram, storage: fm.storage, batteryHealth: fm.batteryHealth, condition: fm.condition, buyPrice: +fm.buyPrice, sellPrice: +fm.sellPrice, status: "In Stock", qty: 1, addedDate, supplier: fm.supplier, photos: sharedPhotos, sellerName: "", sellerPhone: "", sellerAadhaarNumber: "", purchaseDate: fm.purchaseDate, sellerAgreementAccepted: false, sellerIdPhotoData: "", sellerPhotoData: "", sellerSignatureData: "", warrantyType: fm.warrantyType, warrantyMonths: fm.warrantyMonths });
                const savedRecord = await localRecord(item);
                const savedItemBase = normalizeInv({ ...item, id: savedRecord.id });
                const uploadedPhotos = { photos: savedItemBase.photos || [], failures: [] };
                pendingPhotoFailures += uploadedPhotos.failures.length;
                const savedItem = { ...savedItemBase, photos: uploadedPhotos.photos };
                savedItems.push(savedItem);
                const addTx = normalizeTx({ id: genId(), type: "Add", stockItemId: savedItem.id, imei: savedItem.imei, imei2: "", brand: savedItem.brand, model: savedItem.model, color: savedItem.color, ram: savedItem.ram, storage: savedItem.storage, batteryHealth: savedItem.batteryHealth, condition: savedItem.condition, customerName: fm.supplier, phone: fm.phone, amount: +fm.buyPrice, costPrice: +fm.buyPrice, paidAmount: 0, dueAmount: 0, paymentMode: "", date: savedItem.addedDate, dateTime: `${savedItem.addedDate}T12:00:00.000Z`, notes: fm.notes });
                const savedTx = await localTransaction(addTx);
                savedTxs.push(normalizeTx({ ...addTx, id: savedTx.id, stockItemId: savedItem.id }));
            }
            sInv(current => [...savedItems, ...current]);
            sTx(current => [...savedTxs, ...current]);
            notify(`Added ${savedItems.length} devices to stock${pendingPhotoFailures ? ". Some photos are still local." : ""}`);
            markSyncConnected({ lastStatus: "Saved" });
            updateSyncMeta(current => ({ ...current, pendingSync: !!pendingPhotoFailures, syncState: pendingPhotoFailures ? 'saved-local' : 'synced', syncError: '' }));
            resetForm();
        } catch (e) {
            notify(e?.message || "Unable to save bulk stock.", "error");
            updateSyncMeta(current => ({ ...current, syncState: ol ? 'error' : 'offline', syncError: e?.message || 'Unable to save bulk stock.' }));
        } finally {
            setBulkSaveBusy(false);
        }
    };
    const handleAddPrimaryAction = () => {
        if (addFlowStep < ADD_FLOW_STEPS.length - 1) {
            setAddFlowStep(current => Math.min(current + 1, ADD_FLOW_STEPS.length - 1));
            return;
        }
        void (bulkAdd && !ei ? saveBulkInv() : saveInv());
    };
    const saveRepair = async () => {
        if (!repairForm.customerName.trim()) { notify("Customer name is required.", "error"); return; }
        if (!repairForm.model.trim()) { notify("Device model is required.", "error"); return; }
        if (!repairForm.problem.trim()) { notify("Problem details are required.", "error"); return; }
        const linkedPartSupplier = partSuppliersById.get(repairForm.partSupplierId);
        const amount = Number(repairForm.finalCost || repairForm.estimatedCost || 0);
        const nextPaymentStatus = resolveRepairPaymentStatus(repairForm.paymentStatus, repairForm.advance, amount);
        const collectedAmount = nextPaymentStatus === "Paid" ? amount : Number(repairForm.advance || 0);
        const base = normalizeRepair({
            ...repairForm,
            repairNo: repairForm.repairNo || `RPR-${String(Date.now()).slice(-6)}`,
            estimatedCost: Number(repairForm.estimatedCost || 0),
            advance: collectedAmount,
            finalCost: Number(repairForm.finalCost || 0),
            partCost: Number(repairForm.partCost || 0),
            partSupplierName: linkedPartSupplier?.name || repairForm.partSupplierName || "",
            paymentStatus: nextPaymentStatus,
            updatedAt: new Date().toISOString(),
        });
        try {
            let savedRepair = base;
            setRepairs(current => {
                const exists = current.some(item => item.id === savedRepair.id);
                return exists
                    ? current.map(item => item.id === savedRepair.id ? savedRepair : item)
                    : [savedRepair, ...current];
            });
            notify(repairForm.id ? "Repair updated" : "Repair added", "success");
            setRepairForm(createEmptyRepairForm());
            goPage("repair");
        } catch (error) {
            notify(error?.message || "Unable to save repair.", "error");
        }
    };
    const updateRepairStatus = useCallback(async (repair, nextStatus) => {
        if (!repair || !nextStatus || repair.status === nextStatus) return;
        const nextRepair = normalizeRepair({
            ...repair,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
            deliveredDate: nextStatus === "Delivered" ? isoDate() : "",
        });
        try {
            let savedRepair = nextRepair;
            if (shopSession?.pbAuth?.token && shopSession?.pbAuth?.record?.shop) {
                const saved = await localRecord(nextRepair);
                savedRepair = normalizeRepair({
                    ...nextRepair,
                    id: saved.id,
                    createdAt: saved.created || nextRepair.createdAt,
                    updatedAt: saved.updated || nextRepair.updatedAt,
                });
            }
            setRepairs(current => current.map(item => item.id === savedRepair.id ? savedRepair : item));
            setRepairDetail(current => current?.id === savedRepair.id ? savedRepair : current);
            setRepairForm(current => current?.id === savedRepair.id ? { ...current, status: savedRepair.status, updatedAt: savedRepair.updatedAt, receivedDate: normalizeDateInput(savedRepair.receivedDate, isoDate()), deliveredDate: normalizeDateInput(savedRepair.deliveredDate, "") } : current);
            notify(`Repair marked ${savedRepair.status}`, "success");
        } catch (error) {
            notify(error?.message || "Unable to update repair status.", "error");
        }
    }, [notify, shopSession?.pbAuth]);
    const updateRepairPaymentStatus = async (repair, nextPaymentStatus) => {
        if (!repair || !nextPaymentStatus || repair.paymentStatus === nextPaymentStatus) return;
        const amount = repairAmount(repair);
        if (nextPaymentStatus === "Advance" && !(Number(repair.advance || 0) > 0)) {
            notify("Enter an advance amount in Edit before marking this repair as Advance.", "warning");
            return;
        }
        const nextAdvance = nextPaymentStatus === "Paid" ? amount : nextPaymentStatus === "Unpaid" ? 0 : Number(repair.advance || 0);
        const nextRepair = normalizeRepair({
            ...repair,
            advance: nextAdvance,
            paymentStatus: resolveRepairPaymentStatus(nextPaymentStatus, nextAdvance, amount),
            updatedAt: new Date().toISOString(),
        });
        try {
            let savedRepair = nextRepair;
            if (shopSession?.pbAuth?.token && shopSession?.pbAuth?.record?.shop) {
                const saved = await localRecord(nextRepair);
                savedRepair = normalizeRepair({
                    ...nextRepair,
                    id: saved.id,
                    createdAt: saved.created || nextRepair.createdAt,
                    updatedAt: saved.updated || nextRepair.updatedAt,
                });
            }
            setRepairs(current => current.map(item => item.id === savedRepair.id ? savedRepair : item));
            setRepairDetail(current => current?.id === savedRepair.id ? savedRepair : current);
            setRepairForm(current => current?.id === savedRepair.id ? { ...current, advance: savedRepair.advance ? String(savedRepair.advance) : "", paymentStatus: savedRepair.paymentStatus, updatedAt: savedRepair.updatedAt } : current);
            notify(`Repair marked ${savedRepair.paymentStatus.toLowerCase()}`, "success");
        } catch (error) {
            notify(error?.message || "Unable to update repair payment status.", "error");
        }
    };
    const deleteRepair = useCallback((repairId) => {
        const removeLocal = () => {
            setRepairs(current => current.filter(item => item.id !== repairId));
            setRepairDetail(current => current?.id === repairId ? null : current);
            notify("Repair deleted", "success");
        };
        removeLocal();
    }, [notify, shopSession?.pbAuth]);
    const persistLocalProfile = (nextProfile, message) => {
        lastSavedShopProfileSignatureRef.current = JSON.stringify(nextProfile);
        setShopProfileDirty(false);
        shopProfileDirtyRef.current = false;
        notify(message, "success");
    };
    const savePartSupplier = async () => {
        const normalizedSupplier = normalizePartSupplier({ ...partSupplierForm, updatedAt: new Date().toISOString() });
        if (!normalizedSupplier.name) {
            notify("Supplier name is required.", "error");
            return;
        }
        const nextSuppliers = normalizedSupplier.id && partSuppliers.some(item => item.id === normalizedSupplier.id)
            ? partSuppliers.map(item => item.id === normalizedSupplier.id ? { ...normalizedSupplier, createdAt: item.createdAt || normalizedSupplier.createdAt } : item)
            : [{ ...normalizedSupplier, createdAt: new Date().toISOString() }, ...partSuppliers];
        const nextProfile = normalizeShopProfile({ ...shopCfg, partsSuppliers: nextSuppliers });
        setPartsSaveBusy(true);
        sShopCfg(nextProfile);
        try {
            persistLocalProfile(nextProfile, normalizedSupplier.id && partSuppliers.some(item => item.id === normalizedSupplier.id) ? "Supplier updated." : "Supplier added.");
            closePartSupplierSheet();
        } catch (error) {
            notify(error?.message || "Unable to save supplier.", "error");
        } finally {
            setPartsSaveBusy(false);
        }
    };
    const editPartSupplier = (supplier) => openPartSupplierSheet(supplier);
    const deletePartSupplier = async (supplier) => {
        const linkedRepairs = repairs.filter(repair => repair.partSupplierId === supplier.id || (!repair.partSupplierId && repair.partSupplierName === supplier.name)).length;
        if (linkedRepairs > 0) {
            notify("This supplier is linked to existing repairs and cannot be deleted.", "warning");
            return;
        }
        const nextProfile = normalizeShopProfile({ ...shopCfg, partsSuppliers: partSuppliers.filter(item => item.id !== supplier.id) });
        setPartsSaveBusy(true);
        sShopCfg(nextProfile);
        try {
            persistLocalProfile(nextProfile, "Supplier deleted.");
            if (partSupplierForm.id === supplier.id) closePartSupplierSheet();
        } catch (error) {
            notify(error?.message || "Unable to delete supplier.", "error");
        } finally {
            setPartsSaveBusy(false);
        }
    };
    const delInv = async (id) => {
        try {
            const item = inv.find(i => i.id === id);
            if (!item) return;
            const updated = { ...item, status: "Deleted", deletedAt: new Date().toISOString() };
            await localRecord(updated);
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
            await localRecord(updated);
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
        if (fm.warrantyType && fm.warrantyType !== "No Warranty" && !fm.purchaseDate) {
            notify("Purchase date is required when warranty is enabled.", "error");
            return;
        }
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
        const item = normalizeInv({ id: genId(), imei: fm.imei, imei2: fm.imei2, brand: fm.brand, model: fm.model, color: fm.color, ram: fm.ram, storage: fm.storage, batteryHealth: fm.batteryHealth, condition: fm.condition, buyPrice: +fm.buyPrice, sellPrice: +fm.sellPrice, status: "In Stock", qty: 1, addedDate: new Date().toISOString().slice(0, 10), supplier: fm.supplier, photos: fm.photos || [], sellerName: fm.sellerName, sellerPhone: fm.sellerPhone, sellerAadhaarNumber: fm.sellerAadhaarNumber, purchaseDate: fm.purchaseDate, sellerAgreementAccepted: fm.sellerAgreementAccepted, sellerIdPhotoData: fm.sellerIdPhotoData, sellerPhotoData: fm.sellerPhotoData, sellerSignatureData: fm.sellerSignatureData, warrantyType: fm.warrantyType, warrantyMonths: fm.warrantyMonths });
        try {
            const savedRecord = await localRecord(item);
            const savedItemBase = normalizeInv({ ...item, id: savedRecord.id });
            const uploadedPhotos = { photos: savedItemBase.photos || [], failures: [] };
            const savedItem = { ...savedItemBase, photos: uploadedPhotos.photos };
            const txItem = normalizeTx({ id: genId(), type: "Buy", stockItemId: savedItem.id, imei: savedItem.imei, imei2: savedItem.imei2, brand: savedItem.brand, model: savedItem.model, color: savedItem.color, ram: savedItem.ram, storage: savedItem.storage, batteryHealth: savedItem.batteryHealth, condition: savedItem.condition, customerName: fm.supplier, phone: fm.phone, amount: +fm.buyPrice, paidAmount: +fm.buyPrice, dueAmount: 0, paymentMode: fm.paymentMode, date: new Date().toISOString().slice(0, 10), dateTime: new Date().toISOString(), notes: fm.notes, sellerName: fm.sellerName, sellerPhone: fm.sellerPhone, sellerAadhaarNumber: fm.sellerAadhaarNumber, purchaseDate: fm.purchaseDate });
            const savedTx = await localTransaction(txItem);
            sInv(p => [savedItem, ...p]);
            sTx(p => [normalizeTx({ ...txItem, id: savedTx.id, stockItemId: savedItem.id }), ...p]);
            markSyncConnected({ lastStatus: uploadedPhotos.failures.length ? 'Purchase saved with pending photos' : 'Purchase saved', lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: uploadedPhotos.failures.length, syncState: uploadedPhotos.failures.length ? 'saved-local' : (ol ? 'synced' : 'offline'), syncError: uploadedPhotos.failures[0] || '' }));
            sFm(ef); notify(uploadedPhotos.failures.length ? "Purchase recorded. Some photos are still local." : "Purchase recorded!");
        } catch (e) {
            notify(e?.message || "Unable to record purchase.", "error");
        }
    };
    const validateEmiDetails = (source, amount) => {
        const provider = String(source.financeProvider || "").trim();
        const ref = String(source.loanReference || "").trim();
        const tenure = Number(source.financeTenureMonths) || 0;
        const down = Number(source.paidAmount) || 0;
        if (!provider) return "Finance provider is required for EMI sales.";
        if (!ref) return "Loan reference is required for EMI sales.";
        if (!(tenure >= 1)) return "Tenure in months is required for EMI sales.";
        if (down < 0) return "Down payment cannot be negative.";
        if (!(amount > 0) || down >= amount) return "Financed amount must be greater than zero — down payment must be below the invoice total.";
        return "";
    };
    const doSell = async () => {
        const item = liveDeviceByImei(fm.imei);
        if (!item || !fm.customerName) { notify("IMEI & Customer required!", "error"); return; }
        if (!(+fm.amount > 0)) { notify("Enter the selling amount.", "error"); return; }
        if (fm.billType === "GST" && !shopCfg.gstin.trim()) { notify("Add your GSTIN in Settings before creating a GST invoice.", "error"); return; }
        if (fm.paymentMode === "EMI") {
            const emiError = validateEmiDetails(fm, +fm.amount || 0);
            if (emiError) { notify(emiError, "error"); return; }
        }
        const emiSale = fm.paymentMode === "EMI";
        const amount = +fm.amount || 0, paidAmount = emiSale ? Math.min(+fm.paidAmount || 0, amount) : (+fm.paidAmount || amount), dueAmount = Math.max(amount - paidAmount, 0), nextQty = Math.max(0, (item.qty || 1) - 1), now = new Date();
        const tax = calcInvoiceTotals(amount, fm.billType, fm.gstRate);
        const sale = normalizeTx({ id: genId(), type: "Sell", invoiceNo: makeInvoiceNo(tx, shopCfg.invoicePrefix), imei: item.imei, imei2: item.imei2, brand: item.brand, model: item.model, color: item.color, ram: item.ram, storage: item.storage, batteryHealth: item.batteryHealth, condition: item.condition, customerName: fm.customerName, phone: fm.phone, customerAddress: String(fm.customerAddress || "").trim(), salesman: String(fm.salesman || "").trim(), amount, paidAmount, dueAmount, costPrice: item.buyPrice, paymentMode: fm.paymentMode, financeProvider: emiSale ? String(fm.financeProvider || "").trim() : "", loanReference: emiSale ? String(fm.loanReference || "").trim() : "", financeTenureMonths: emiSale ? Number(fm.financeTenureMonths) || 0 : 0, financeSettlement: emiSale ? "Pending" : "", date: now.toISOString().slice(0, 10), dateTime: now.toISOString(), notes: fm.notes, billType: fm.billType, gstRate: tax.gstRate, taxableAmount: tax.taxableAmount, gstAmount: tax.gstAmount, cgstAmount: tax.cgstAmount, sgstAmount: tax.sgstAmount, totalAmount: tax.totalAmount, shopSnapshot: shopCfg });
        try {
            const updatedItem = { ...item, status: nextQty > 0 ? "In Stock" : "Sold", qty: nextQty, customerName: fm.customerName, customerPhone: fm.phone, soldDate: sale.dateTime, lastInvoiceNo: sale.invoiceNo };
            await localRecord(updatedItem);
            const savedTx = await localTransaction({ ...sale, stockItemId: item.id });
            sInv(p => p.map(i => i.id === item.id ? normalizeInv(updatedItem) : i));
            sTx(p => [normalizeTx({ ...sale, id: savedTx.id, stockItemId: item.id }), ...p]);
            markSyncConnected({ lastStatus: 'Sale saved', lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? 'synced' : 'offline', syncError: '' }));
            sFm(ef); notify("Sale recorded!");
        } catch (e) {
            notify(e?.message || "Unable to record sale.", "error");
        }
    };
    const doBillProSale = () => {
        const isMobileDevice = isBillProMobileCategory(billProForm.category);
        if (isMobileDevice) {
            if (!billProForm.brand.trim() || !billProForm.model.trim()) { notify("Brand and model are required for mobile device billing.", "error"); return; }
            if (!hasImei(billProForm.imei)) { notify("IMEI 1 must be 15 digits for mobile device billing.", "error"); return; }
            if (billProForm.imei2 && !hasImei(billProForm.imei2)) { notify("IMEI 2 must be 15 digits or empty.", "error"); return; }
            if (billProForm.imei2 && billProForm.imei === billProForm.imei2) { notify("IMEI 1 and IMEI 2 cannot be the same.", "error"); return; }
        } else if (!billProForm.itemLabel.trim()) { notify("Item name is required.", "error"); return; }
        if (!(+billProForm.amount > 0)) { notify("Enter the invoice amount.", "error"); return; }
        if (billProForm.billType === "GST" && !effectiveShopCfg.gstin.trim()) { notify("Add your GSTIN in Settings before creating a GST invoice.", "error"); return; }
        const emiSale = billProForm.paymentMode === "EMI";
        if (emiSale) {
            const emiError = validateEmiDetails(billProForm, +billProForm.amount || 0);
            if (emiError) { notify(emiError, "error"); return; }
        }
        const amount = +billProForm.amount || 0;
        const paidAmount = emiSale ? Math.min(+billProForm.paidAmount || 0, amount) : amount;
        const dueAmount = Math.max(amount - paidAmount, 0);
        const now = new Date();
        const tax = calcInvoiceTotals(amount, billProForm.billType, billProForm.gstRate);
        const sale = normalizeTx({
            id: genId(),
            type: "Sell",
            invoiceNo: makeInvoiceNo(tx, effectiveShopCfg.invoicePrefix),
            customerName: billProForm.customerName,
            phone: billProForm.phone,
            customerAddress: String(billProForm.customerAddress || "").trim(),
            salesman: String(billProForm.salesman || "").trim(),
            itemLabel: isMobileDevice ? "" : billProForm.itemLabel,
            category: billProForm.category,
            brand: isMobileDevice ? billProForm.brand : "",
            model: isMobileDevice ? billProForm.model : "",
            color: isMobileDevice ? billProForm.color : "",
            ram: isMobileDevice ? billProForm.ram : "",
            storage: isMobileDevice ? billProForm.storage : "",
            condition: isMobileDevice ? billProForm.condition : "",
            imei: isMobileDevice ? billProForm.imei : "",
            imei2: isMobileDevice ? billProForm.imei2 : "",
            serialNo: isMobileDevice ? "" : billProForm.serialNo,
            qty: isMobileDevice ? 1 : billProForm.qty,
            amount,
            paidAmount,
            dueAmount,
            paymentMode: billProForm.paymentMode,
            financeProvider: emiSale ? String(billProForm.financeProvider || "").trim() : "",
            loanReference: emiSale ? String(billProForm.loanReference || "").trim() : "",
            financeTenureMonths: emiSale ? Number(billProForm.financeTenureMonths) || 0 : 0,
            financeSettlement: emiSale ? "Pending" : "",
            date: now.toISOString().slice(0, 10),
            dateTime: now.toISOString(),
            notes: billProForm.notes,
            billType: billProForm.billType,
            gstRate: tax.gstRate,
            taxableAmount: tax.taxableAmount,
            gstAmount: tax.gstAmount,
            cgstAmount: tax.cgstAmount,
            sgstAmount: tax.sgstAmount,
            totalAmount: tax.totalAmount,
            shopSnapshot: effectiveShopCfg,
        });
        sTx(current => [sale, ...current]);
        updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: "saved-local", lastLocalChangeAt: new Date().toISOString(), syncError: "" }));
        resetBillProForm();
        setLastSavedInvoiceId(sale.id);
        goPage("transactions");
        notify("Bill Pro invoice saved on this device.", "success");
        void persistInvoicePdf(sale).then(result => {
            if (!result?.ok) notify("Invoice saved, but the PDF did not reach phone storage. Tap Download on the invoice to save it.", "warning");
        });
    };

    const returnTransactions = useMemo(() => tx.filter(item => item.type === "Return"), [tx]);
    const isSaleReturned = useCallback((sale) => {
        if (!sale) return false;
        return returnTransactions.some(item =>
            (sale.id && item.returnOfTxId === sale.id) ||
            (sale.invoiceNo && item.returnOfInvoiceNo === sale.invoiceNo) ||
            (sale.invoiceNo && item.invoiceNo === `RET-${sale.invoiceNo}`) ||
            (sale.stockItemId && item.stockItemId === sale.stockItemId && item.type === "Return")
        );
    }, [returnTransactions]);
    const getReturnForSale = useCallback((sale) => {
        if (!sale) return null;
        return returnTransactions.find(item =>
            (sale.id && item.returnOfTxId === sale.id) ||
            (sale.invoiceNo && item.returnOfInvoiceNo === sale.invoiceNo) ||
            (sale.invoiceNo && item.invoiceNo === `RET-${sale.invoiceNo}`) ||
            (sale.stockItemId && item.stockItemId === sale.stockItemId && item.type === "Return")
        ) || null;
    }, [returnTransactions]);
    const openReturnModal = (sale) => {
        if (appMode !== "general") { notify("Returns are available in Business Pro only.", "warning"); return; }
        if (!sale || sale.type !== "Sell") return;
        if (isSaleReturned(sale)) { notify("This invoice is already returned.", "warning"); return; }
        setReturnTarget(sale);
        setReturnForm({ refundAmount: String(Number(sale.paidAmount || sale.totalAmount || sale.amount || 0)), refundMode: sale.paymentMode || "Cash", reason: "" });
    };
    const closeReturnModal = () => {
        if (returnBusy) return;
        setReturnTarget(null);
        setReturnForm({ refundAmount: "", refundMode: "Cash", reason: "" });
    };
    const confirmReturn = async () => {
        const sale = returnTarget;
        if (!sale) return;
        if (isSaleReturned(sale)) { notify("This invoice is already returned.", "warning"); closeReturnModal(); return; }
        const refundAmount = Number(returnForm.refundAmount || 0);
        if (refundAmount < 0) { notify("Refund amount cannot be negative.", "error"); return; }
        const stockItem = inv.find(item => item.id === sale.stockItemId) || inv.find(item => matchImei(item, sale.imei));
        const restoredItem = normalizeInv({
            ...(stockItem || {}),
            id: stockItem?.id || sale.stockItemId || genId(),
            imei: sale.imei,
            imei2: sale.imei2,
            brand: sale.brand,
            model: sale.model,
            color: sale.color,
            ram: sale.ram,
            storage: sale.storage,
            batteryHealth: sale.batteryHealth,
            condition: sale.condition || stockItem?.condition || "Used",
            buyPrice: sale.costPrice || stockItem?.buyPrice || 0,
            sellPrice: sale.amount || stockItem?.sellPrice || 0,
            status: "In Stock",
            qty: 1,
            addedDate: stockItem?.addedDate || sale.date || isoDate(),
            supplier: stockItem?.supplier || "Returned item",
            customerName: "",
            customerPhone: "",
            soldDate: "",
            lastInvoiceNo: sale.invoiceNo || stockItem?.lastInvoiceNo || "",
            photos: stockItem?.photos || [],
            warrantyType: stockItem?.warrantyType || "No Warranty",
            warrantyMonths: stockItem?.warrantyMonths || 0,
            purchaseDate: stockItem?.purchaseDate || "",
        });
        const now = new Date();
        const returnTax = calcInvoiceTotals(refundAmount, sale.billType, sale.gstRate);
        const returnTx = normalizeTx({
            id: genId(),
            type: "Return",
            stockItemId: restoredItem.id,
            invoiceNo: sale.invoiceNo ? `RET-${sale.invoiceNo}` : `RET-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(returnTransactions.length + 1).padStart(4, "0")}`,
            imei: sale.imei,
            imei2: sale.imei2,
            brand: sale.brand,
            model: sale.model,
            color: sale.color,
            ram: sale.ram,
            storage: sale.storage,
            batteryHealth: sale.batteryHealth,
            condition: sale.condition,
            customerName: sale.customerName,
            phone: sale.phone,
            amount: refundAmount,
            paidAmount: refundAmount,
            dueAmount: 0,
            costPrice: sale.costPrice,
            paymentMode: returnForm.refundMode || sale.paymentMode || "Cash",
            invoiceNoOriginal: sale.invoiceNo,
            returnOfTxId: sale.id,
            returnOfInvoiceNo: sale.invoiceNo,
            refundAmount,
            refundMode: returnForm.refundMode || sale.paymentMode || "Cash",
            returnReason: returnForm.reason,
            returnedAt: now.toISOString(),
            date: now.toISOString().slice(0, 10),
            dateTime: now.toISOString(),
            notes: [`Return of ${sale.invoiceNo || sale.id}`, returnForm.reason ? `Reason: ${returnForm.reason}` : ""].filter(Boolean).join("\n"),
            billType: sale.billType,
            gstRate: returnTax.gstRate,
            taxableAmount: returnTax.taxableAmount,
            gstAmount: returnTax.gstAmount,
            cgstAmount: returnTax.cgstAmount,
            sgstAmount: returnTax.sgstAmount,
            totalAmount: returnTax.totalAmount,
            shopSnapshot: sale.shopSnapshot || shopCfg,
        });
        setReturnBusy(true);
        try {
            const savedInventory = await localRecord(restoredItem);
            const cloudInventory = normalizeInv({ ...restoredItem, id: savedInventory?.id || restoredItem.id });
            const txForCloud = { ...returnTx, stockItemId: cloudInventory.id };
            const savedTx = await localTransaction(txForCloud);
            sInv(current => {
                const exists = current.some(item => item.id === cloudInventory.id || item.id === restoredItem.id);
                return exists
                    ? current.map(item => (item.id === restoredItem.id || item.id === cloudInventory.id) ? cloudInventory : item)
                    : [cloudInventory, ...current];
            });
            const savedReturn = normalizeTx({ ...txForCloud, id: savedTx?.id || returnTx.id });
            sTx(current => [savedReturn, ...current]);
            markSyncConnected({ lastStatus: "Return saved", lastPushAt: new Date().toISOString() });
            updateSyncMeta(current => ({ ...current, pendingSync: false, syncState: ol ? "synced" : "offline", syncError: "" }));
            closeReturnModal();
            notify("Item returned and added back to stock.", "success");
            void persistInvoicePdf(savedReturn).then(result => {
                if (!result?.ok) notify("Return saved, but the PDF did not reach phone storage. Tap Download on the invoice to save it.", "warning");
            });
        } catch (error) {
            notify(error?.message || "Unable to record return.", "error");
        } finally {
            setReturnBusy(false);
        }
    };

    const stats = useMemo(() => {
        const is = inv.filter(i => i.status === "In Stock"); const ts = is.reduce((s, i) => s + (i.qty || 0), 0); const sv = is.reduce((s, i) => s + i.sellPrice * (i.qty || 0), 0);
        const saleRows = tx.filter(t => t.type === "Sell");
        const returnRows = tx.filter(t => t.type === "Return");
        const tb = tx.filter(t => t.type === "Buy").reduce((s, t) => s + t.amount, 0); const tsl = saleRows.reduce((s, t) => s + t.amount, 0) - returnRows.reduce((s, t) => s + Number(t.refundAmount || t.amount || 0), 0);
        const pr = saleRows.reduce((s, t) => s + (t.stockItemId ? getSaleProfitAmount(t) : 0), 0) - returnRows.reduce((s, t) => {
            const originalSale = saleRows.find(sale => (t.returnOfTxId && sale.id === t.returnOfTxId) || (t.returnOfInvoiceNo && sale.invoiceNo === t.returnOfInvoiceNo));
            return s + Math.abs(getSaleProfitAmount(originalSale || t));
        }, 0);
        const bc = {}; is.forEach(i => { bc[i.brand] = (bc[i.brand] || 0) + (i.qty || 0); }); const cc = { New: 0, Refurbished: 0, Used: 0 }; is.forEach(i => { cc[i.condition] = (cc[i.condition] || 0) + (i.qty || 0); });
        return { ts, sv, tb, tsl, pr, bc, cc };
    }, [inv, isSaleReturned, tx]);
    const partSuppliers = useMemo(() => (shopCfg.partsSuppliers || []).map(normalizePartSupplier).filter(item => item.name), [shopCfg.partsSuppliers]);
    const partSuppliersById = useMemo(() => new Map(partSuppliers.map(item => [item.id, item])), [partSuppliers]);
    const getRepairPartSupplierLabel = useCallback((repair) => {
        if (!repair) return "";
        return partSuppliersById.get(repair.partSupplierId)?.name || repair.partSupplierName || "";
    }, [partSuppliersById]);
    const repairAmount = useCallback((repair) => Number(repair?.finalCost || repair?.estimatedCost || 0), []);
    const repairDueAmount = useCallback((repair) => repair?.paymentStatus === "Paid" ? 0 : Math.max(repairAmount(repair) - Number(repair?.advance || 0), 0), [repairAmount]);
    const repairProfitAmount = useCallback((repair) => repairAmount(repair) - Number(repair?.partCost || 0), [repairAmount]);

    const fi = useMemo(() => inv.filter(i => {
        if (i.status === "Deleted") return false;
        const ms = !sq || [i.imei, i.imei2, i.brand, i.model, i.color, i.ram, i.storage, i.supplier].some(f => (f || "").toLowerCase().includes(sq.toLowerCase()));
        const brandMatch = stockBrandFilter === "All Brands" || i.brand === stockBrandFilter;
        const conditionMatch = stockConditionFilter === "Any Condition" || i.condition === stockConditionFilter;
        const sellPrice = Number(i.sellPrice || 0);
        const priceMatch = stockPriceFilter === "Price Range"
            || (stockPriceFilter === "Under 20k" && sellPrice < 20000)
            || (stockPriceFilter === "20k-50k" && sellPrice >= 20000 && sellPrice <= 50000)
            || (stockPriceFilter === "50k-100k" && sellPrice > 50000 && sellPrice <= 100000)
            || (stockPriceFilter === "100k+" && sellPrice > 100000);
        return ms && brandMatch && conditionMatch && priceMatch;
    }), [inv, sq, stockBrandFilter, stockConditionFilter, stockPriceFilter]);
    const visibleFi = useMemo(() => fi.slice(0, stockVisibleCount), [fi, stockVisibleCount]);
    const hasMoreStock = visibleFi.length < fi.length;
    useEffect(() => {
        setStockVisibleCount(STOCK_PAGE_SIZE);
    }, [pg, sq, stockBrandFilter, stockConditionFilter, stockPriceFilter]);
    useEffect(() => {
        if (typeof window === "undefined" || pg !== "inventory" || !hasMoreStock) return;
        const target = stockLoadMoreRef.current;
        if (!target) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                setStockVisibleCount(count => Math.min(count + STOCK_PAGE_SIZE, fi.length));
            }
        }, { rootMargin: "320px 0px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [fi.length, hasMoreStock, pg, visibleFi.length]);
    const recycleBinItems = useMemo(() => inv.filter(i => i.status === "Deleted"), [inv]);
    const latestSell = useMemo(() => tx.find(t => t.type === "Sell") || null, [tx]);
    const latestInvoices = useMemo(() => tx.filter(t => t.type === "Sell").slice(0, 4), [tx]);
    const retailDashboardInvoices = useMemo(() => latestInvoices.slice(0, 4), [latestInvoices]);
    const retailMonthlySales = useMemo(() => {
        const now = new Date();
        return tx.filter(item => {
            if (item.type !== "Sell" && item.type !== "Return") return false;
            const saleDate = new Date(item.date);
            return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
        }).reduce((sum, item) => sum + (item.type === "Return" ? -Number(item.refundAmount || item.amount || 0) : Number(item.totalAmount || item.amount || 0)), 0);
    }, [isSaleReturned, tx]);
    const retailDueTotal = useMemo(() => tx.filter(item => item.type === "Sell" && !isSaleReturned(item)).reduce((sum, item) => sum + Number(item.dueAmount || 0), 0), [isSaleReturned, tx]);
    const trackedStockUnits = useMemo(() => inv.filter(item => item.status !== "Deleted").reduce((sum, item) => sum + Number(item.qty || 0), 0), [inv]);
    const retailStockFill = useMemo(() => Math.max(0, Math.min(100, Math.round((stats.ts / Math.max(trackedStockUnits, 1)) * 100))), [stats.ts, trackedStockUnits]);
    const repairRecords = useMemo(() => [...repairs].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))), [repairs]);
    const filteredRepairRecords = useMemo(() => {
        const q = repairQuery.trim().toLowerCase();
        return repairRecords.filter(repair => {
            if (repairStatusFilter !== "All Statuses" && repair.status !== repairStatusFilter) return false;
            if (!q) return true;
            return [repair.repairNo, repair.customerName, repair.phone, repair.brand, repair.model, repair.color, repair.imei, repair.problem, repair.status, repair.paymentStatus, getRepairPartSupplierLabel(repair)].some(v => String(v || "").toLowerCase().includes(q));
        });
    }, [getRepairPartSupplierLabel, repairQuery, repairRecords, repairStatusFilter]);
    const repairOpenCount = useMemo(() => repairs.filter(item => !["Delivered", "Cancelled"].includes(item.status)).length, [repairs]);
    const repairReadyCount = useMemo(() => repairs.filter(item => item.status === "Ready").length, [repairs]);
    const repairDeliveredCount = useMemo(() => repairs.filter(item => item.status === "Delivered").length, [repairs]);
    const repairCancelledCount = useMemo(() => repairs.filter(item => item.status === "Cancelled").length, [repairs]);
    const repairDueTotal = useMemo(() => repairs.reduce((sum, repair) => sum + repairDueAmount(repair), 0), [repairDueAmount, repairs]);
    const repairAdvanceTotal = useMemo(() => repairs.reduce((sum, repair) => sum + (repair.advance || 0), 0), [repairs]);
    const repairValueTotal = useMemo(() => repairs.reduce((sum, repair) => sum + repairAmount(repair), 0), [repairAmount, repairs]);
    const repairPartsTotal = useMemo(() => repairs.reduce((sum, repair) => sum + Number(repair.partCost || 0), 0), [repairs]);
    const repairProfitTotal = useMemo(() => repairs.reduce((sum, repair) => sum + repairProfitAmount(repair), 0), [repairProfitAmount, repairs]);
    const repairNetProfit = useMemo(() => repairs.filter(repair => repair.paymentStatus === "Paid").reduce((sum, repair) => sum + repairProfitAmount(repair), 0), [repairProfitAmount, repairs]);
    const repairPaidIncome = useMemo(() => repairs.filter(repair => repair.paymentStatus === "Paid").reduce((sum, repair) => sum + repairAmount(repair), 0), [repairAmount, repairs]);
    const repairRecentJobs = useMemo(() => repairRecords.slice(0, 5), [repairRecords]);
    const repairTodayStats = useMemo(() => {
        const today = isoDate();
        const received = repairs.filter(item => (item.receivedDate || "") === today).length;
        const delivered = repairs.filter(item => (item.deliveredDate || "") === today).length;
        return { received, delivered };
    }, [repairs]);
    const repairStatusCards = useMemo(() => ([
        { l: "Received", v: repairs.filter(item => item.status === "Received").length, c: "var(--warn)" },
        { l: "Ready", v: repairReadyCount, c: "var(--ok)" },
        { l: "Delivered", v: repairDeliveredCount, c: "var(--a)" },
        { l: "Cancelled", v: repairCancelledCount, c: "var(--err)" },
    ]), [repairCancelledCount, repairDeliveredCount, repairReadyCount, repairs]);
    const partsSupplierRows = useMemo(() => {
        const q = partsQuery.trim().toLowerCase();
        return partSuppliers.map(supplier => {
            const supplierRepairs = repairs.filter(repair => repair.partSupplierId === supplier.id || (!repair.partSupplierId && repair.partSupplierName && repair.partSupplierName === supplier.name));
            return {
                ...supplier,
                repairsCount: supplierRepairs.length,
                totalValue: supplierRepairs.reduce((sum, repair) => sum + Number(repair.partCost || 0), 0),
                lastDateTime: supplierRepairs.reduce((latest, repair) => String(repair.updatedAt || repair.createdAt || "").localeCompare(String(latest)) > 0 ? (repair.updatedAt || repair.createdAt || "") : latest, ""),
            };
        }).filter(supplier => !q || [supplier.name, supplier.phone, supplier.address, supplier.notes].some(value => String(value || "").toLowerCase().includes(q))).sort((a, b) => String(b.lastDateTime || "").localeCompare(String(a.lastDateTime || "")));
    }, [partSuppliers, partsQuery, repairs]);
    const invoiceRecords = useMemo(() => {
        const q = iq.trim().toLowerCase();
        return tx.filter(t => t.type === "Sell").filter(t => {
            if (!q) return true;
            return [t.invoiceNo, t.customerName, t.phone, t.itemLabel, t.category, t.serialNo, t.brand, t.model, t.imei, t.imei2].some(v => String(v || "").toLowerCase().includes(q));
        }).filter(t => {
            if (invoiceStatusFilter === "Returned") return isSaleReturned(t);
            if (isSaleReturned(t) && invoiceStatusFilter !== "All") return false;
            if (invoiceStatusFilter === "Paid") return Number(t.dueAmount || 0) <= 0;
            if (invoiceStatusFilter === "Due") return Number(t.dueAmount || 0) > 0;
            return true;
        }).sort((a, b) => String(b.dateTime || b.date || "").localeCompare(String(a.dateTime || a.date || "")));
    }, [invoiceStatusFilter, iq, isSaleReturned, tx]);
    const invoiceSummary = useMemo(() => ({
        totalAmount: invoiceRecords.reduce((sum, record) => sum + Number(record.totalAmount || record.amount || 0), 0) - returnTransactions.reduce((sum, record) => sum + Number(record.refundAmount || record.amount || 0), 0),
        dueAmount: invoiceRecords.reduce((sum, record) => sum + (isSaleReturned(record) ? 0 : Number(record.dueAmount || 0)), 0),
        gstAmount: invoiceRecords.reduce((sum, record) => sum + (isSaleReturned(record) ? 0 : Number(record.gstAmount || 0)), 0),
        returnedCount: invoiceRecords.filter(record => isSaleReturned(record)).length,
        refundAmount: returnTransactions.reduce((sum, record) => sum + Number(record.refundAmount || record.amount || 0), 0),
    }), [invoiceRecords, isSaleReturned, returnTransactions]);
    const salePreview = useMemo(() => calcInvoiceTotals(fm.amount || 0, fm.billType, fm.gstRate), [fm.amount, fm.billType, fm.gstRate]);
    const reportRange = useMemo(() => getReportRange(reportPreset, reportFrom, reportTo), [reportPreset, reportFrom, reportTo]);
    const reportPartyQueryLower = reportPartyQuery.trim().toLowerCase();
    const reportItemQueryLower = reportItemQuery.trim().toLowerCase();
    const reportEntries = useMemo(() => {
        const trackedAddIds = new Set(tx.filter(t => t.type === "Add" && t.stockItemId).map(t => t.stockItemId));
        const trackedAddImeis = new Set(tx.filter(t => t.type === "Add" || t.type === "Buy").flatMap(t => [t.imei, t.imei2]).filter(Boolean));
        const salesByReturnKey = new Map(tx.filter(t => t.type === "Sell").flatMap(sale => [[sale.id, sale], [sale.invoiceNo, sale]].filter(([key]) => key)));
        const txEntries = tx.map(t => ({
            id: t.id,
            type: t.type,
            date: t.date || (t.dateTime ? t.dateTime.slice(0, 10) : isoDate()),
            dateTime: t.dateTime || `${t.date || isoDate()}T12:00:00`,
            party: t.customerName || (t.type === "Add" ? "Manual stock entry" : "-"),
            phone: t.phone || "",
            item: getTxItemLabel(t),
            extra: getTxReportExtra(t),
            imei: t.imei,
            imei2: t.imei2,
            amount: t.type === "Return" ? -Number(t.refundAmount || t.amount || 0) : t.type === "Sell" ? (t.totalAmount || t.amount || 0) : (t.amount || 0),
            dueAmount: t.type === "Return" ? 0 : (t.dueAmount || 0),
            profit: t.type === "Return" ? 0 : t.type === "Sell" && t.stockItemId && !isSaleReturned(t) ? getSaleProfitAmount(t) : 0,
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
        const repairEntries = repairs.map(repair => {
            const amount = repairAmount(repair);
            const dueAmount = repairDueAmount(repair);
            const issue = repair.problem ? `Issue: ${repair.problem}` : "";
            const partSupplierLabel = getRepairPartSupplierLabel(repair);
            return {
                id: `repair-${repair.id}`,
                type: "Repair",
                status: repair.status,
                date: (repair.updatedAt || repair.receivedDate || isoDate()).slice(0, 10),
                dateTime: repair.updatedAt || `${repair.receivedDate || isoDate()}T12:00:00`,
                party: repair.customerName || "Walk-in customer",
                phone: repair.phone || "",
                item: `${repair.brand} ${repair.model}`.trim() || "Repair Job",
                extra: [repair.status, repair.paymentStatus, repair.partCost ? `Part ${fmtCurrency(repair.partCost)}` : "", partSupplierLabel ? `Supplier: ${partSupplierLabel}` : "", issue].filter(Boolean).join(" · "),
                imei: repair.imei,
                imei2: "",
                amount,
                dueAmount,
                profit: repairProfitAmount(repair),
                invoiceNo: repair.repairNo || "",
                billType: "",
                paymentMode: repair.paymentStatus,
            };
        });
        return [...txEntries, ...legacyAdds, ...repairEntries].sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)));
    }, [getRepairPartSupplierLabel, inv, isSaleReturned, repairAmount, repairDueAmount, repairProfitAmount, repairs, tx]);
    const reportBrands = useMemo(() => ["All Brands", ...Array.from(new Set(reportEntries.map(row => row.item.split(" ")[0]).filter(Boolean)))], [reportEntries]);
    const reportRows = useMemo(() => reportEntries.filter(row => {
        if (reportType !== "All" && row.type !== reportType) return false;
        const rowDate = row.date || (row.dateTime ? row.dateTime.slice(0, 10) : "");
        if (!(rowDate >= reportRange.from && rowDate <= reportRange.to)) return false;
        const effectiveBillFilter = reportType === "Buy" || reportType === "Add" || reportType === "Repair" ? "All Bills" : reportBillFilter;
        if (effectiveBillFilter !== "All Bills") {
            if (row.type !== "Sell" && row.type !== "Return") return false;
            if (effectiveBillFilter === "GST" && row.billType !== "GST") return false;
            if (effectiveBillFilter === "Regular" && row.billType === "GST") return false;
        }
        if (reportPaymentFilter !== "All Payments" && row.paymentMode !== reportPaymentFilter) return false;
        if (reportBrandFilter !== "All Brands" && !String(row.item || "").toLowerCase().startsWith(reportBrandFilter.toLowerCase())) return false;
        if (reportRepairStatusFilter !== "All Repair Statuses" && row.type === "Repair" && row.status !== reportRepairStatusFilter) return false;
        const effectiveDueFilter = reportView === "Supplier Summary" ? "All Status" : reportDueFilter;
        if (effectiveDueFilter !== "All Status") {
            if (row.type !== "Sell" && row.type !== "Repair") return false;
            if (effectiveDueFilter === "Due Only" && !(row.dueAmount > 0)) return false;
            if (effectiveDueFilter === "Paid Only" && row.dueAmount > 0) return false;
        }
        if (reportPartyQueryLower && ![row.party, row.phone].some(v => String(v || "").toLowerCase().includes(reportPartyQueryLower))) return false;
        if (reportItemQueryLower && ![row.item, row.invoiceNo, row.imei, row.imei2, row.extra].some(v => String(v || "").toLowerCase().includes(reportItemQueryLower))) return false;
        return true;
    }), [reportEntries, reportRange.from, reportRange.to, reportType, reportView, reportBillFilter, reportPaymentFilter, reportBrandFilter, reportRepairStatusFilter, reportDueFilter, reportPartyQueryLower, reportItemQueryLower]);
    const reportSummary = useMemo(() => {
        const buyAddRows = reportRows.filter(row => row.type === "Buy" || row.type === "Add");
        const sellRows = reportRows.filter(row => row.type === "Sell" || row.type === "Return");
        const repairRows = reportRows.filter(row => row.type === "Repair");
        return {
            records: reportRows.length,
            buyAddTotal: buyAddRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            sellTotal: sellRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            repairTotal: repairRows.reduce((sum, row) => sum + (row.amount || 0), 0),
            dueTotal: [...sellRows, ...repairRows].reduce((sum, row) => sum + (row.dueAmount || 0), 0),
            profit: [...sellRows, ...repairRows].reduce((sum, row) => sum + (row.profit || 0), 0),
        };
    }, [reportRows]);
    const customerLedgerRows = useMemo(() => {
        const groups = new Map();
        reportRows.filter(row => row.type === "Sell" || row.type === "Return" || row.type === "Repair").forEach((row) => {
            const key = (row.phone || row.party || `walkin-${row.id}`).toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    id: key,
                    type: row.type === "Repair" ? "Repair" : "Sell",
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
    const visibleReportRows = useMemo(() => activeReportRows.slice(0, reportVisibleCount), [activeReportRows, reportVisibleCount]);
    const hasMoreReportRows = visibleReportRows.length < activeReportRows.length;
    const activeReportSummary = reportView === "Transactions" ? reportSummary : {
        records: activeReportRows.length,
        buyAddTotal: reportView === "Supplier Summary" ? activeReportRows.reduce((s, row) => s + (row.amount || 0), 0) : 0,
        sellTotal: reportView === "Customer Ledger" ? activeReportRows.filter(row => row.type === "Sell").reduce((s, row) => s + (row.amount || 0), 0) : 0,
        repairTotal: reportView === "Customer Ledger" ? activeReportRows.filter(row => row.type === "Repair").reduce((s, row) => s + (row.amount || 0), 0) : 0,
        dueTotal: reportView === "Customer Ledger" ? activeReportRows.reduce((s, row) => s + (row.dueAmount || 0), 0) : 0,
        profit: reportView === "Customer Ledger" ? activeReportRows.reduce((s, row) => s + (row.profit || 0), 0) : 0,
    };
    const reportSummaryCards = [
        { l: "Records", v: activeReportSummary.records, c: "var(--t1)" },
        { l: reportView === "Supplier Summary" ? "Purchases" : "Buy + Add", v: fmtCurrency(activeReportSummary.buyAddTotal), c: "var(--a2)" },
        { l: "Repairs", v: fmtCurrency(activeReportSummary.repairTotal || 0), c: "var(--warn)" },
        { l: "Sales", v: fmtCurrency(activeReportSummary.sellTotal), c: "var(--a)" },
        { l: "Due", v: fmtCurrency(activeReportSummary.dueTotal), c: "var(--warn)" },
        { l: "Profit", v: fmtCurrency(activeReportSummary.profit), c: "var(--ok)" },
    ].filter(card => card.l !== "Repairs" || reportView !== "Supplier Summary" || (activeReportSummary.repairTotal || 0) > 0 || reportType === "Repair" || reportType === "All");
    const reportFiltersLabel = [
        reportType !== "Buy" && reportType !== "Add" && reportType !== "Repair" && reportBillFilter !== "All Bills" && reportView === "Transactions" ? reportBillFilter : "",
        reportRepairStatusFilter !== "All Repair Statuses" ? `Repair Status: ${reportRepairStatusFilter}` : "",
        reportDueFilter !== "All Status" ? reportDueFilter : "",
        reportPaymentFilter !== "All Payments" ? reportPaymentFilter : "",
        reportBrandFilter !== "All Brands" ? reportBrandFilter : "",
        reportPartyQuery.trim(),
        reportItemQuery.trim(),
    ].filter(Boolean).join(" · ");
    useEffect(() => {
        setReportVisibleCount(REPORT_PAGE_SIZE);
    }, [pg, reportView, reportType, reportPreset, reportFrom, reportTo, reportBillFilter, reportPaymentFilter, reportBrandFilter, reportRepairStatusFilter, reportDueFilter, reportPartyQueryLower, reportItemQueryLower]);
    useEffect(() => {
        if (typeof window === "undefined" || pg !== "reports" || !hasMoreReportRows) return;
        const target = reportLoadMoreRef.current;
        if (!target) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                setReportVisibleCount(count => Math.min(count + REPORT_PAGE_SIZE, activeReportRows.length));
            }
        }, { rootMargin: "320px 0px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [activeReportRows.length, hasMoreReportRows, pg, visibleReportRows.length]);

    const bcd = Object.entries(stats.bc).map(([name, value]) => ({ name, value }));
    const ccd = Object.entries(stats.cc).map(([name, value]) => ({ name, value }));
    const CL = ["#00d4ff", "#8b5cf6", "#f472b6", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#a78bfa"];
    const r7 = useMemo(() => {
        const d = []; for (let i = 6; i >= 0; i--) {
            const dt = new Date(); dt.setDate(dt.getDate() - i); const ds = dt.toISOString().slice(0, 10);
            d.push({ day: dt.toLocaleDateString("en-IN", { weekday: "short" }), Buy: tx.filter(t => t.type === "Buy" && t.date === ds).reduce((s, t) => s + t.amount, 0), Sell: tx.filter(t => (t.type === "Sell" || t.type === "Return") && t.date === ds).reduce((s, t) => s + (t.type === "Return" ? -Number(t.refundAmount || t.amount || 0) : t.amount), 0) });
        } return d;
    }, [tx]);
    const updateSaleMeta = (saleId, patch) => {
        sTx(current => current.map(item => item.id === saleId ? normalizeTx({ ...item, ...patch }) : item));
    };
    const markInvoiceSettled = (sale) => {
        if (!sale || sale.paymentMode !== "EMI") return;
        if ((sale.financeSettlement || "Pending") === "Settled") return;
        updateSaleMeta(sale.id, { financeSettlement: "Settled" });
        notify("Finance marked settled. Future invoices for this sale will show Settled.", "success");
    };
    // Writes the invoice PDF straight to phone storage. The directory handle is
    // used when one was granted, otherwise the file lands in Downloads, which
    // Android never deletes when the app is removed.
    const persistInvoicePdf = async (sale, { manual = false, layout = "" } = {}) => {
        if (!sale) return null;
        let result = null;
        try {
            const { blob, fileName } = await makeInvoiceFile(sale, effectiveShopCfg, layout ? { layout } : {});
            result = await writeStorageFile(fileName, blob);
        } catch (error) {
            result = { ok: false, mode: "none", error: error?.message || "Unable to build the invoice PDF." };
        }
        if (result?.ok) {
            updateSaleMeta(sale.id, { pdfSavedAt: new Date().toISOString(), pdfFileName: result.fileName });
            if (manual) notify(`PDF saved to ${result.path}`, "success");
        } else {
            updateSaleMeta(sale.id, { pdfSavedAt: "", pdfFileName: "" });
            if (manual) notify(result?.error || "Unable to save the invoice PDF.", "error");
        }
        return result;
    };
    const refreshBillsStorage = useCallback(async () => {
        try {
            const directory = await getBillsDirectory();
            const usage = await storageUsage();
            setBillsStorage({ folderName: directory?.name || "", usage: usage.usage, quota: usage.quota, persisted: usage.persisted, supported: usage.supported });
        } catch { }
    }, []);
    useEffect(() => {
        if (settingsOpenSection === "app-status") void refreshBillsStorage();
    }, [refreshBillsStorage, settingsOpenSection]);
    const handleChooseBillsFolder = async () => {
        try {
            const directory = await pickBillsDirectory();
            notify(`Bills will be saved to ${directory.name}.`, "success");
            await refreshBillsStorage();
        } catch (error) {
            notify(error?.message || "Unable to choose a bill folder.", "warning");
        }
    };
    const handleUseDownloadsFolder = async () => {
        await clearBillsDirectory();
        notify("Bills will be saved to your Downloads folder.", "success");
        await refreshBillsStorage();
    };
    const exportBillsBackup = async () => {
        try {
            const csv = buildBillsBackupCsv({ sales: tx, shopProfile: effectiveShopCfg });
            const result = await writeStorageFile(BILLS_BACKUP_FILE_NAME, new Blob([csv], { type: "text/csv;charset=utf-8" }));
            if (!result.ok) { notify(result.error || "Unable to export the bills backup.", "error"); return; }
            notify(`Backup saved to ${result.path}`, "success");
        } catch (error) {
            notify(error?.message || "Unable to export the bills backup.", "error");
        }
    };
    const handleBillsBackupFile = async (event) => {
        const input = event?.target;
        const file = input?.files?.[0];
        if (input) input.value = "";
        if (!file) return;
        try {
            const parsed = parseBillsBackupCsv(await file.text());
            if (!parsed.sales.length) { notify("No bills were found in that file.", "warning"); return; }
            const knownIds = new Set(tx.map(item => item.id));
            const knownInvoices = new Set(tx.map(item => String(item.invoiceNo || "").trim()).filter(Boolean));
            const restored = parsed.sales
                .filter(row => !knownIds.has(row.id) && !(String(row.invoiceNo || "").trim() && knownInvoices.has(String(row.invoiceNo).trim())))
                .map(row => normalizeTx(row));
            if (restored.length) sTx(current => [...restored, ...current]);
            let profileRestored = false;
            if (parsed.shopProfile) {
                const nextProfile = normalizeShopProfile({ ...shopCfg, ...parsed.shopProfile, businessMode: "bill-pro", enabledModules: BILL_PRO_MODULES });
                lastSavedShopProfileSignatureRef.current = JSON.stringify(nextProfile);
                setShopProfileDirty(false);
                shopProfileDirtyRef.current = false;
                sShopCfg(nextProfile);
                profileRestored = true;
            }
            if (!restored.length && !profileRestored) { notify("Every bill in that file is already saved.", "warning"); return; }
            notify(`Restored ${restored.length} bill${restored.length === 1 ? "" : "s"}${profileRestored ? " and the shop profile" : ""}.`, "success");
        } catch (error) {
            notify(error?.message || "Unable to read that backup file.", "error");
        }
    };
    const dlBlob = (blob, name) => {
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const downloadCsv = (fileName, headers, rows) => {
        const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = [headers.map(escape).join(","), ...rows.map(row => row.map(escape).join(","))].join("\n");
        dlBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
        notify("CSV exported", "success");
    };
    const exportDashboardCsv = () => {
        downloadCsv(
            `dashboard-${isoDate()}.csv`,
            ["Invoice", "Customer", "Item", "Bill Type", "Total", "Due", "Updated"],
            retailDashboardInvoices.map(invoice => [
                invoice.invoiceNo || "INV",
                invoice.customerName || "Walk-in Customer",
                getTxItemLabel(invoice),
                invoice.billType || "Regular",
                Number(invoice.totalAmount || invoice.amount || 0),
                Number(invoice.dueAmount || 0),
                fmtDateTime(invoice.updatedAt || invoice.createdAt || invoice.dateTime || invoice.date || new Date()),
            ])
        );
    };
    const exportTransactionsCsv = () => {
        downloadCsv(
            `sales-history-${isoDate()}.csv`,
            ["Invoice", "Date", "Customer", "Phone", "Item", "Category", "Total", "Due", "Payment Mode", "Bill Type", "Status", "Refund", "Finance Provider", "Loan Reference", "Settlement"],
            invoiceRecords.map(invoice => [
                invoice.invoiceNo || "INV",
                fmtDateTime(invoice.dateTime || `${invoice.date || isoDate()}T12:00:00`),
                invoice.customerName || "Walk-in Customer",
                invoice.phone || "",
                getTxItemLabel(invoice),
                invoice.category || "",
                Number(invoice.totalAmount || invoice.amount || 0),
                Number(invoice.dueAmount || 0),
                invoice.paymentMode || "Cash",
                invoice.billType || "Regular",
                isSaleReturned(invoice) ? "Returned" : Number(invoice.dueAmount || 0) > 0 ? "Due" : "Paid",
                Number(getReturnForSale(invoice)?.refundAmount || getReturnForSale(invoice)?.amount || 0),
                invoice.paymentMode === "EMI" ? invoice.financeProvider || "" : "",
                invoice.paymentMode === "EMI" ? invoice.loanReference || "" : "",
                invoice.paymentMode === "EMI" ? invoice.financeSettlement || "Pending" : "",
            ])
        );
    };
    const [previewInvoice, setPreviewInvoice] = useState(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [previewLayout, setPreviewLayout] = useState("");
    const closeInvoicePreview = () => {
        try { if (previewInvoice?.url) URL.revokeObjectURL(previewInvoice.url); } catch { }
        setPreviewInvoice(null);
        setPreviewLayout("");
    };
    const openInvoicePreview = async (sale) => {
        if (!sale || previewBusy) return;
        setPreviewBusy(true);
        try {
            setPreviewLayout("");
            const shop = getSaleShop(sale, effectiveShopCfg);
            const { blob, fileName } = await makeInvoiceFile(sale, shop);
            try { if (previewInvoice?.url) URL.revokeObjectURL(previewInvoice.url); } catch { }
            setPreviewInvoice({ sale, fileName, url: URL.createObjectURL(blob) });
        } catch (error) {
            notify(error?.message || "Unable to preview this invoice.", "error");
        } finally {
            setPreviewBusy(false);
        }
    };
    const flipPreviewLayout = async (next) => {
        const sale = previewInvoice?.sale;
        if (!sale || previewBusy || !next) return;
        setPreviewBusy(true);
        try {
            const shop = getSaleShop(sale, effectiveShopCfg);
            const { blob, fileName } = await makeInvoiceFile(sale, shop, { layout: next });
            try { if (previewInvoice?.url) URL.revokeObjectURL(previewInvoice.url); } catch { }
            setPreviewInvoice(current => ({ ...(current || { sale, fileName }), sale, fileName, url: URL.createObjectURL(blob) }));
        } catch (error) {
            notify(error?.message || "Unable to switch the bill layout.", "error");
        } finally {
            setPreviewBusy(false);
        }
    };
    const previewEffectiveLayout = previewLayout || (getSaleShop(previewInvoice?.sale, effectiveShopCfg).invoiceLayout || "vertical");
    const printPreviewInvoice = () => {
        const entry = previewInvoice;
        if (!entry?.url || typeof document === "undefined") return;
        try {
            const frame = document.createElement("iframe");
            frame.style.display = "none";
            frame.src = entry.url;
            frame.onload = () => {
                try { frame.contentWindow?.print(); } catch { }
                setTimeout(() => { try { frame.remove(); } catch { } }, 2000);
            };
            document.body.appendChild(frame);
            setTimeout(() => { try { if (frame.isConnected) frame.remove(); } catch { } }, 30000);
        } catch {
            notify("Unable to print right now.", "error");
        }
    };
    const downloadInvoice = async (sale, layout = "") => {
        if (!sale) return;
        const result = await persistInvoicePdf(sale, { manual: true, layout });
        if (!result?.ok) notify(result?.error || "Unable to save the invoice PDF.", "error");
    };
    const shareInvoice = async (sale, layout = "") => {
        if (!sale) return;
        const shop = getSaleShop(sale, effectiveShopCfg);
        const { blob, file, fileName } = await makeInvoiceFile(sale, shop, layout ? { layout } : {});
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
        window.open(makeWhatsAppUrl(sale.phone, makeWhatsAppIntroText(sale, getSaleShop(sale, effectiveShopCfg))), "_blank");
        updateSaleMeta(sale.id, { whatsAppMessageAt: new Date().toISOString() });
        notify("WhatsApp message opened. Send it so the customer appears in recent chats, then share the PDF.", "success");
    };
    const whatsappRepairMessage = (repair) => {
        if (!repair) return;
        if (!repair.phone) { notify("Add customer phone number before opening WhatsApp message.", "error"); return; }
        window.open(makeWhatsAppUrl(repair.phone, makeRepairWhatsAppText(repair, effectiveShopCfg)), "_blank");
        notify(`WhatsApp message opened for ${repair.status.toLowerCase()} update.`, "success");
    };
    const downloadReport = async () => {
        const { blob, fileName } = await makeReportFile({ rows: activeReportRows, summary: activeReportSummary, reportType: reportView === "Transactions" ? reportType : reportView, rangeLabel: reportRange.label, shop: effectiveShopCfg, filtersLabel: reportFiltersLabel });
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
        const { blob } = await makeReportFile({ rows: activeReportRows, summary: activeReportSummary, reportType: reportView === "Transactions" ? reportType : reportView, rangeLabel: reportRange.label, shop: effectiveShopCfg, filtersLabel: reportFiltersLabel });
        openBlobInTab(blob, autoPrint, targetWindow);
        notify(autoPrint ? "Report PDF opened for printing." : "Report PDF preview opened.", "success");
    };
    const printSticker = async (item) => {
        if (!item) return;
        const targetWindow = window.open("", "_blank");
        const { blob } = await makeStickerFile(item, effectiveShopCfg);
        openBlobInTab(blob, true, targetWindow);
        notify("Sticker PDF opened for printing.", "success");
    };
    const printRepairSticker = async (repair) => {
        if (!repair) return;
        const targetWindow = window.open("", "_blank");
        const { blob } = await makeRepairStickerFile(repair, effectiveShopCfg);
        openBlobInTab(blob, true, targetWindow);
        notify("Repair sticker opened for printing.", "success");
    };
    const printBillProSticker = async () => {
        const isMobileDevice = isBillProMobileCategory(billProStickerForm.category);
        let blob;
        if (isMobileDevice) {
            if (!billProStickerForm.brand.trim() || !billProStickerForm.model.trim()) {
                notify("Brand and model are required for the mobile device sticker.", "error");
                return;
            }
            if (!hasImei(billProStickerForm.imei)) {
                notify("IMEI 1 must be 15 digits for the mobile device sticker.", "error");
                return;
            }
            if (billProStickerForm.imei2 && !hasImei(billProStickerForm.imei2)) {
                notify("IMEI 2 must be 15 digits or empty.", "error");
                return;
            }
            const { blob: deviceStickerBlob } = await makeStickerFile({
                brand: billProStickerForm.brand,
                model: billProStickerForm.model,
                color: billProStickerForm.color,
                ram: billProStickerForm.ram,
                storage: billProStickerForm.storage,
                imei: billProStickerForm.imei,
                imei2: billProStickerForm.imei2,
                condition: billProStickerForm.condition,
                sellPrice: Number(billProStickerForm.price || 0),
                buyPrice: 0,
                warrantyType: "No Warranty",
            }, effectiveShopCfg);
            blob = deviceStickerBlob;
        } else {
            if (!billProStickerForm.itemLabel.trim()) {
                notify("Enter an accessory item name before printing a sticker.", "error");
                return;
            }
            const { blob: accessoryStickerBlob } = await makeBillProStickerFile(billProStickerForm, effectiveShopCfg);
            blob = accessoryStickerBlob;
        }
        const targetWindow = window.open("", "_blank");
        openBlobInTab(blob, true, targetWindow);
        notify("Bill Pro sticker opened for printing.", "success");
    };

    const nav = useMemo(() => {
        const generalNav = [
            { id: "dashboard", ic: Home, l: "Dashboard" },
            ...(enabledModules.includes("repair") ? [{ id: "repair", ic: Wrench, l: "Repair" }] : []),
            { id: "transactions", ic: FileText, l: "Invoices" },
            { id: "reports", ic: BarChart3, l: "Reports" },
            { id: "inventory", ic: Package, l: "Stock" },
            { id: "recycle", ic: Trash, l: "Bin" },
            { id: "settings", ic: Settings, l: "Settings" },
        ];
        if (appMode === "bill-pro") {
            return [
                { id: "dashboard", ic: Home, l: "Dashboard" },
                { id: "billing", ic: FileText, l: "Billing" },
                { id: "transactions", ic: ClipboardList, l: "Invoices" },
                { id: "bill-stickers", ic: Printer, l: "Stickers" },
                { id: "reports", ic: BarChart3, l: "Reports" },
                { id: "settings", ic: Settings, l: "Settings" },
            ];
        }
        if (appMode !== "repair-pro") return generalNav;
        return [
            { id: "dashboard", ic: Home, l: "Dashboard" },
            { id: "repair", ic: Wrench, l: "Repair" },
            { id: "parts", ic: Package, l: "Parts" },
            { id: "reports", ic: BarChart3, l: "Reports" },
            { id: "settings", ic: Settings, l: "Settings" },
        ];
    }, [appMode, enabledModules, effectiveShopCfg]);
    const desktopSidebarNav = useMemo(() => nav.filter(item => item.id !== "settings"), [nav]);
    const mobileNavOrder = ["dashboard", "transactions", "reports", "bill-stickers"];
    const mobileNav = useMemo(() => {
        if (appMode !== "bill-pro") return nav;
        const byId = new Map(nav.map(item => [item.id, item]));
        return mobileNavOrder.map(id => byId.get(id)).filter(Boolean);
    }, [nav, appMode]);
    const currentPageKey = pg === "repair-form" ? "repair" : pg;
    const currentNav = nav.find(item => item.id === currentPageKey) || nav[0];
    const currentPageLabel = {
        dashboard: appMode === "repair-pro" ? "Repair Dashboard" : appMode === "bill-pro" ? "Bill Pro Dashboard" : "Retail Dashboard",
        add: ei ? "Edit Stock" : bulkAdd ? "Bulk Add Stock" : "Add Stock",
        inventory: "Inventory",
        recycle: "Recycle Bin",
        buy: "Purchase Entry",
        sell: "New Sale",
        billing: "New Bill",
        "bill-stickers": "Sticker Printing",
        repair: repairDetail ? "Repair Detail" : "Repair Queue",
        "repair-form": repairForm.id ? "Edit Repair" : "New Repair",
        parts: "Parts Hub",
        transactions: appMode === "bill-pro" ? "Invoices" : "Sales History",
        reports: "Reports",
        settings: "Settings Hub",
    }[pg] || currentNav?.l || "Dashboard";
    const workspaceLabel = appMode === "repair-pro" ? "Repair Pro terminal" : appMode === "bill-pro" ? "Bill Pro offline terminal" : "Retail editorial workspace";
    const isDesktopViewport = typeof window !== "undefined" && window.innerWidth >= 1025;
    const activeSettingsSection = settingsOpenSection || (isDesktopViewport ? "shop-profile" : "");
    const showSettingsHub = !isDesktopViewport && settingsOpenSection === "";
    const isRetailDashboard = pg === "dashboard" && (appMode === "general" || appMode === "bill-pro");
    const isInventoryShowcase = pg === "inventory" && !di;
    const hideMobileTopHeader = isInventoryShowcase || pg === "repair" || pg === "transactions" || pg === "reports" || pg === "settings" || pg === "billing" || pg === "bill-stickers";
    const isAddPage = pg === "add";
    const isBuyPage = pg === "buy";
    const isSellPage = pg === "sell";
    const isBillingPage = pg === "billing";
    const isRepairFormPage = pg === "repair-form";
    const isCompactEntryPage = isAddPage || isBuyPage || isSellPage || isBillingPage || isRepairFormPage;
    const buyRequiresSellerVerification = fm.condition === "Used" || fm.condition === "Refurbished";
    const isNavActive = (id) => id === currentPageKey || (id === "repair" && pg === "repair-form");
    const repairPanelStyle = { background: "#23272d", border: "1px solid rgba(255,255,255,.05)" };
    const repairButtonStyle = { background: "#2d3133", borderColor: "rgba(255,255,255,.08)", color: "#d6e3ff" };
    const settingsSoftPanelStyle = { background: "var(--surface-low)", border: "1px solid rgba(198,197,212,.16)" };
    const settingsScreenMeta = {
        "shop-profile": { title: "Shop Profile", subtitle: "Name, GST, address, logo" },
        "invoice-preferences": { title: "Invoicing", subtitle: "Prefix, footer, invoice rules" },
        "app-status": { title: "App Status", subtitle: appMode === "bill-pro" ? "Offline activation and device status" : (syncReady ? "Connected and healthy" : "Connection and install diagnostics") },
    }[activeSettingsSection] || { title: "Settings", subtitle: "Quick access to all configurations" };
    const selectedAppThemeLabel = effectiveShopCfg.appTheme === "dark" ? "Dark Mode" : "Light Mode";
    const currentAddStep = ADD_FLOW_STEPS[Math.min(addFlowStep, ADD_FLOW_STEPS.length - 1)] || ADD_FLOW_STEPS[0];
    const nextAddStep = addFlowStep < ADD_FLOW_STEPS.length - 1 ? ADD_FLOW_STEPS[addFlowStep + 1] : null;
    const finalAddActionLabel = bulkAdd && !ei ? (bulkSaveBusy ? "Saving Bulk Stock..." : `Add ${bulkImeis.length || ""} to Stock`) : ei ? "Save Changes" : "Add to Stock";
    const addDesktopSummary = [
        { label: bulkAdd && !ei ? "Queued Units" : "Mode", value: bulkAdd && !ei ? String(bulkImeis.length) : (ei ? "Edit Existing" : "Single Intake") },
        { label: "Device", value: [fm.brand, fm.model].filter(Boolean).join(" ") || "Awaiting handset details" },
        { label: "Expected Margin", value: fmtCurrency(Number(fm.sellPrice || 0) - Number(fm.buyPrice || 0)) },
        { label: "Supplier", value: fm.supplier || "Not added" },
    ];
    const buyDesktopSummary = [
        { label: "Purchase", value: fmtCurrency(fm.buyPrice || 0) },
        { label: "Target Sell", value: fmtCurrency(fm.sellPrice || 0) },
        { label: "Margin Plan", value: fmtCurrency(Number(fm.sellPrice || 0) - Number(fm.buyPrice || 0)) },
        { label: "Supplier", value: fm.supplier || "Required" },
    ];
    const sellDesktopSummary = [
        { label: "Selected Device", value: [fm.brand, fm.model].filter(Boolean).join(" ") || "Scan IMEI to load device" },
        { label: "Invoice Total", value: fmtCurrency(fm.amount || 0) },
        { label: "Paid Now", value: fmtCurrency(fm.paidAmount || 0) },
        { label: "Due", value: fmtCurrency(fm.dueAmount || 0) },
    ];
    const repairDesktopSummary = [
        { label: "Ticket", value: repairForm.repairNo || "Will be assigned on save" },
        { label: "Device", value: [repairForm.brand, repairForm.model].filter(Boolean).join(" ") || "Device details pending" },
        { label: "Estimate", value: fmtCurrency(repairForm.estimatedCost || 0) },
        { label: "Advance", value: fmtCurrency(repairForm.advance || 0) },
    ];
    const desktopSettingsSections = [
        { id: "shop-profile", title: "Shop Profile", subtitle: "Branding, GST, contacts" },
        { id: "invoice-preferences", title: "Invoicing", subtitle: "Prefix, footer, invoice defaults" },
        { id: "app-status", title: "App Status", subtitle: "Sync, install, offline health" },
    ];
    const currentMonthLabel = new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    const brandShopName = String(effectiveShopCfg.shopName || shopSession?.shopName || APP_NAME).replace(/([a-z])([A-Z])/g, "$1 $2");
    const retailMixRows = [
        { label: "New Devices", value: stats.cc.New || 0, tone: "#4f46e5" },
        { label: "Refurbished", value: stats.cc.Refurbished || 0, tone: "#7c8cf8" },
        { label: "Used / Exchange", value: stats.cc.Used || 0, tone: "#b7c4f4" },
    ];
    const dashboardStockPill = `${Math.max(0, Math.min(100, retailStockFill))}%`;
    const dashboardSalesPill = tx.filter(item => item.type === "Sell").length ? "0%" : "--";
    const dashboardDuePill = retailDueTotal > 0 ? "Due" : "Clear";
    const saveAddDraft = useCallback(() => {
        if (typeof window === "undefined" || !canPersist) {
            notify("Drafts are only available in the browser on this device.", "warning");
            return;
        }
        window.localStorage.setItem(ADD_DRAFT_KEY, JSON.stringify({
            form: fm,
            bulkAdd,
            bulkImeis,
            savedAt: new Date().toISOString(),
        }));
        notify("Draft saved on this device.", "success");
    }, [bulkAdd, bulkImeis, canPersist, fm, notify]);
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
    const repairStatusTone = (status) => status === "Ready" || status === "Delivered" ? "bi" : status === "Cancelled" ? "bre" : "br";
    const repairPaymentTone = (status) => status === "Paid" ? "bi" : status === "Advance" ? "bu" : "br";
    const BillProQuickActions = () => {
        const actions = [
            { label: "New Bill", icon: <FileText size={28} />, go: "billing", cls: "qa-bill" },
            { label: "Stickers", icon: <Printer size={28} />, go: "bill-stickers", cls: "qa-stickers" },
            { label: "Invoices", icon: <ClipboardList size={28} />, go: "transactions", cls: "qa-invoices" },
            { label: "Reports", icon: <BarChart3 size={28} />, go: "reports", cls: "qa-reports" },
        ];
        return <div className="billpro-qa">
            {actions.map(a => <button key={a.label} className={`billpro-qa-card ${a.cls}`} onClick={() => goPage(a.go)}><span className="billpro-qa-icon">{a.icon}</span><strong>{a.label}</strong></button>)}
        </div>;
    };

    // Prefetch jsPDF at idle so the first invoice save does not pay the chunk
    // load inside the click that must trigger the download, and ask the browser
    // not to evict local bill data while the shop is busy.
    useEffect(() => {
        void requestPersistentStorage();
        const warmJsPdf = () => { void import("jspdf").catch(() => { }); };
        if (typeof window === "undefined") return undefined;
        if (typeof window.requestIdleCallback === "function") {
            const idleId = window.requestIdleCallback(warmJsPdf, { timeout: 4000 });
            return () => { try { window.cancelIdleCallback?.(idleId); } catch { } };
        }
        const timer = setTimeout(warmJsPdf, 1500);
        return () => clearTimeout(timer);
    }, []);

    // ── LOGIN GATES ──────────────────────────────────────────────────────
    if (!authReady) return (
        <><style>{S}</style><div className="abg theme-light" style={{ minHeight: "100vh" }} /></>
    );
    if (!shopSession) return (
        <><style>{S}</style>
            <div className={`auth-shell ${appThemeClass}`}>
                <aside className="auth-hero">
                    <div className="auth-hero-content">
                        <div>
                            <div className="auth-badge"><Smartphone size={14} /> PhoneDukaan Bill Pro</div>
                            <div style={{ marginTop: 28 }}>
                                <h1>Offline billing that stays on this phone.</h1>
                                <p>GST and non-GST invoices, PDFs saved straight to your phone storage, and sticker printing. No cloud login, no account, no internet needed after install.</p>
                            </div>
                        </div>
                        <div className="auth-hero-points">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><FileText size={16} /> Invoice PDFs auto-saved</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><ScanLine size={16} /> Sticker printing</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Shield size={16} /> Lifetime licence key</span>
                        </div>
                    </div>
                </aside>
                <main className="auth-panel">
                    <div className="auth-form-wrap">
                        <div className="auth-mobile-brand">
                            <img src="/pd-icon.png" alt="PhoneDukaan" style={{ width: 34, height: 34, borderRadius: 10 }} />
                            <span>PhoneDukaan</span>
                        </div>
                        <div className="auth-header">
                            <h2>Activate Bill Pro</h2>
                        </div>
                        <div className="auth-card">
                            {loadBillProActivationRecord()?.payload?.deviceId === billProDeviceId ? <button className="bp auth-submit" onClick={openStoredBillPro}>
                                <ArrowUpCircle size={16} /> Open Bill Pro
                            </button> : <>
                                <div className="auth-field">
                                    <label>Licence Key</label>
                                    <input className="gi auth-key-input" placeholder="PD-XXXX-XXXX-XXXX" value={billProActivationCode} onChange={e => { setBillProActivationCode(formatBillProKeyInput(e.target.value)); setBillProError(""); }} onKeyDown={e => { if (e.key === "Enter") void handleBillProActivation(); }} />
                                </div>
                                {billProError ? <div className="auth-error"><AlertCircle size={14} /> {billProError}</div> : null}
                                <div style={{ color: "var(--t2)", fontSize: 12, marginBottom: 12 }}>This device: <span style={{ fontFamily: "'Space Mono',monospace", color: "var(--t1)", fontWeight: 700 }}>{billProDeviceId}</span> — send it to your seller for your key.</div>
                                <button className="bp auth-submit" onClick={() => void handleBillProActivation()} disabled={billProBusy} style={{ opacity: billProBusy ? 0.72 : 1 }}>
                                    <Shield size={16} /> {billProBusy ? "Verifying..." : "Activate Bill Pro"}
                                </button>
                            </>}
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
    if (shopSession?.isBillPro && !billProOnboarded) {
        const draft = onboardDraft || { shopName: "", ownerName: "", address: "", phone: "", logoData: "" };
        return (
        <><style>{S}</style>
            <div className={`auth-shell ${appThemeClass}`}>
                <aside className="auth-hero">
                    <div className="auth-hero-content">
                        <div>
                            <div className="auth-badge"><Smartphone size={14} /> PhoneDukaan Bill Pro</div>
                            <div style={{ marginTop: 28 }}>
                                <h1>Tell us about your shop.</h1>
                                <p>Your shop name, address and logo print on every invoice. This takes less than a minute.</p>
                            </div>
                        </div>
                        <div className="auth-hero-points">
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><FileText size={16} /> Printed on every invoice</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Shield size={16} /> Stored only on this phone</span>
                        </div>
                    </div>
                </aside>
                <main className="auth-panel">
                    <div className="auth-form-wrap">
                        <div className="auth-mobile-brand">
                            <img src="/pd-icon.png" alt="PhoneDukaan" style={{ width: 34, height: 34, borderRadius: 10 }} />
                            <span>PhoneDukaan</span>
                        </div>
                        <div className="auth-header">
                            <h2>Set up your shop</h2>
                        </div>
                        <div className="auth-card">
                            <div className="auth-field">
                                <label>Shop Logo</label>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", border: "1px solid var(--gbo)", background: "var(--surface-low)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        {draft.logoData ? <img src={draft.logoData} alt="Shop logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Smartphone size={24} style={{ color: "var(--t3)" }} />}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <button className="bg" onClick={() => onboardLogoInputRef.current?.click()}><Upload size={16} /> Upload Logo</button>
                                        {draft.logoData ? <button className="bg" onClick={() => setOnboardDraftField("logoData", "")}>Remove</button> : null}
                                    </div>
                                </div>
                                <input ref={onboardLogoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleOnboardLogoPick} />
                            </div>
                            <div className="auth-field">
                                <label>Shop Name *</label>
                                <input className="gi" value={draft.shopName} onChange={e => { setOnboardDraftField("shopName", e.target.value); setBillProOnboardError(""); }} placeholder="e.g. Sharma Mobile Store" />
                            </div>
                            <div className="auth-field">
                                <label>Owner Name</label>
                                <input className="gi" value={draft.ownerName} onChange={e => setOnboardDraftField("ownerName", e.target.value)} placeholder="Your name" />
                            </div>
                            <div className="auth-field">
                                <label>Shop Address *</label>
                                <textarea className="gi" value={draft.address} onChange={e => { setOnboardDraftField("address", e.target.value); setBillProOnboardError(""); }} placeholder="Shop no, street, market, city" rows={2} />
                            </div>
                            <div className="auth-field">
                                <label>Phone</label>
                                <input className="gi" type="tel" value={draft.phone} onChange={e => setOnboardDraftField("phone", e.target.value)} placeholder="Shop phone number" />
                            </div>
                            {billProOnboardError ? <div className="auth-error"><AlertCircle size={14} /> {billProOnboardError}</div> : null}
                            <button className="bp auth-submit" onClick={() => void completeBillProOnboarding()}>
                                <ArrowUpCircle size={16} /> Start Billing
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </>
        );
    }
    // ──────────────────────────────────────────────────────────────────────

    return (
        <><style>{S}</style>
            <div className={`abg ${appThemeClass}`}>
                <div className="shell">
                    <aside className="shell-sidebar">
                        <div className="shell-brand">
                            <div className="shell-brand-mark"><img src="/pd-icon.png" alt={APP_NAME} /></div>
                            <div className="shell-brand-copy">
                                <strong>{brandShopName}</strong>
                            </div>
                        </div>
                        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {desktopSidebarNav.map(n => <div key={n.id} className={`ni ${isNavActive(n.id) ? "ac" : ""}`} onClick={() => goPage(n.id)}><n.ic size={18} /> {n.l}{n.id === "recycle" && recycleBinItems.length > 0 && <span style={{ marginLeft: "auto", background: "var(--err)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 99, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{recycleBinItems.length}</span>}</div>)}
                        </nav>
                        <div className="shell-footer">
                            <button className="shell-footer-link" onClick={() => goPage("settings")}><Settings size={18} /> Settings</button>
                            <div className="shell-footer-bottom">
                                <button className="shell-footer-link" onClick={logoutShop}><LogOut size={18} /> {shopSession?.isBillPro ? "Close Bill Pro" : "Sign out"}</button>
                                <div className="shell-status">{ol ? <Wifi size={14} color="var(--ok)" /> : <WifiOff size={14} color="var(--warn)" />}<span>{shopSession?.isBillPro ? `${brandShopName} · ${syncStateLabel}` : `${shopSession?.shopName || shopSession?.shopId || "No shop"} · ${syncStateLabel}`}</span></div>
                            </div>
                        </div>
                    </aside>

                    {!isCompactEntryPage && !hideMobileTopHeader && <div className={`mth ${isRetailDashboard ? "dashboard-retail-mobile" : ""}`}>
                        {isRetailDashboard ? <>
                            <div className="mth-brand">
                                <div className="mth-brand-mark"><img src="/pd-icon.png" alt={APP_NAME} /></div>
                                <div className="mth-title">
                                    <strong>{brandShopName}</strong>
                                    <span>{workspaceLabel}</span>
                                </div>
                            </div>
                            <button className="dashboard-retail-icon-btn" onClick={() => goPage("settings")} aria-label="Open settings"><Settings size={20} /></button>
                        </> : <>
                            <div className="mth-brand">
                                <img src={APP_WORDMARK_SRC} alt={APP_NAME} style={{ height: 28, width: "auto", maxWidth: 156, display: "block" }} onError={event => { if (event.currentTarget.src.endsWith(APP_WORDMARK_FALLBACK)) return; event.currentTarget.src = APP_WORDMARK_FALLBACK; }} />
                                <div className="mth-title">
                                    <strong>{currentPageLabel}</strong>
                                    <span>{workspaceLabel}</span>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{ol ? <Wifi size={14} color="var(--ok)" /> : <WifiOff size={14} color="var(--warn)" />}<span style={{ color: "var(--t3)", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>{ol ? "Online" : "Offline"}</span><button onClick={() => goPage("settings")} aria-label="Open settings" style={{ width: 38, height: 38, borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}><Settings size={18} /></button></div>
                        </>}
                    </div>}

                    <div className="mfd" aria-hidden="true" />
                    {!isCompactEntryPage && <div className="mn sh">
                        {mobileNav.map(n => <div key={n.id} className={`mn-item ${isNavActive(n.id) ? "active" : ""}`} onClick={() => goPage(n.id)}><n.ic size={20} /><span>{n.l}</span></div>)}
                    </div>}

                    <div className={`shell-main ${isCompactEntryPage ? "shell-main-add" : ""} ${isInventoryShowcase ? "shell-main-inventory" : ""} ${hideMobileTopHeader ? "shell-main-no-mth" : ""}`}>
                    {swUpdate && <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: "linear-gradient(90deg,#0048d8,#2761fe)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", fontSize: 13, fontWeight: 700, gap: 12 }}><span style={{ display: "flex", alignItems: "center", gap: 8 }}><RefreshCw size={14} /> Update available — refresh to get the latest version</span><button onClick={() => navigator.serviceWorker.ready.then(r => r.waiting?.postMessage({ type: "SKIP_WAITING" }))} style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.34)", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>Refresh</button></div>}

                    {nt && <div className="fi" style={{ position: "fixed", top: 24, right: 24, zIndex: 200, padding: "14px 20px", borderRadius: "var(--rs)", background: nt.t === "success" ? "rgba(163,246,156,.65)" : nt.t === "error" ? "rgba(255,218,214,.9)" : "rgba(255,241,194,.92)", border: `1px solid ${nt.t === "success" ? "rgba(90,169,88,.24)" : nt.t === "error" ? "rgba(186,26,26,.18)" : "rgba(217,119,6,.18)"}`, color: "var(--t1)", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 12px 30px rgba(25,28,30,.08)" }}>{nt.t === "success" ? <CheckCircle size={16} color="var(--ok)" /> : <AlertCircle size={16} color={nt.t === "error" ? "var(--err)" : "var(--warn)"} />} {nt.m}</div>}

                    {/* ═══ DASHBOARD ═══ */}
                    {pg === "dashboard" && <div className="fi">
                        {appMode === "repair-pro" ? <>
                            {repairOpenCount === 0 ? <div className="gl" style={{ padding: "12px 16px", borderColor: "rgba(0,72,216,.18)", background: "rgba(0,72,216,.06)", display: "flex", alignItems: "center", gap: 10, borderRadius: "var(--rs)", marginBottom: 16 }}><AlertCircle size={16} color="var(--a)" /><span style={{ color: "var(--a)", fontWeight: 700, fontSize: 13 }}>No active repair jobs right now. Add a new repair to start tracking devices.</span></div> : null}
                            <div className="dashboard-actions">
                                <button className="bg" onClick={() => openRepairForm()}><Plus size={16} /> New Repair</button>
                                <button className="bg" onClick={() => goPage("repair")}><Wrench size={16} /> Repair Queue</button>
                                <button className="bg" onClick={() => goPage("parts")}><Package size={16} /> Parts</button>
                                <button className="bg" onClick={() => goPage("reports")}><BarChart3 size={16} /> Reports</button>
                            </div>
                            <div className="dashboard-grid">
                                <div className="gc metric-card featured">
                                    <div className="metric-label">Total Queue</div>
                                    <div className="metric-value">{repairs.length}</div>
                                    <div className="metric-sub">{repairOpenCount} open · {repairReadyCount} ready</div>
                                </div>
                                <div className="gc metric-card">
                                    <div className="metric-label">Total Income</div>
                                    <div className="metric-value">{fmtCurrency(repairValueTotal)}</div>
                                    <div className="metric-sub">Collected across repair jobs</div>
                                </div>
                                <div className="gc metric-card">
                                    <div className="metric-label">Net Profit</div>
                                    <div className="metric-value">{fmtCurrency(repairNetProfit)}</div>
                                    <div className="metric-sub">Profit after part cost and payouts</div>
                                </div>
                                <div className="gc metric-card">
                                    <div className="metric-label">Pending Due</div>
                                    <div className="metric-value">{fmtCurrency(repairDueTotal)}</div>
                                    <div className="metric-sub">Advance and pending collections</div>
                                </div>
                            </div>
                            <div className="section-grid">
                                <div className="gc span-7">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                                        <div>
                                            <h3 style={{ color: "var(--t1)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>Latest Repair Jobs</h3>
                                            <div style={{ color: "var(--t2)", fontSize: 12, marginTop: 4 }}>Recent intake, progress, and payment state.</div>
                                        </div>
                                        <button className="bp" onClick={() => openRepairForm()}><Plus size={15} /> Add Repair</button>
                                    </div>
                                    {repairRecentJobs.length === 0 ? <div style={{ color: "var(--t2)", fontSize: 14 }}>No repair jobs yet. Add your first device to start the workflow.</div> : null}
                                    {repairRecentJobs.map(repair => {
                                        const amount = repairAmount(repair);
                                        const due = repairDueAmount(repair);
                                        return <div key={repair.id} className="list-row">
                                            <div style={{ minWidth: 0 }}>
                                                <div className="list-row-title">{repair.repairNo}</div>
                                                <div className="list-row-meta">{repair.brand} {repair.model} · {repair.customerName || "Walk-in customer"}{repair.phone ? ` · ${repair.phone}` : ""}</div>
                                                <div className="list-row-meta">{fmtDate(repair.updatedAt || repair.receivedDate)} · {repair.problem}{repair.imei ? ` · IMEI ${repair.imei}` : ""}{repair.partCost ? ` · Part ${fmtCurrency(repair.partCost)}` : ""}{getRepairPartSupplierLabel(repair) ? ` · ${getRepairPartSupplierLabel(repair)}` : ""}</div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                <span className={`ba ${repairStatusTone(repair.status)}`}>{repair.status}</span>
                                                <span className={`ba ${repairPaymentTone(repair.paymentStatus)}`}>{repair.paymentStatus}</span>
                                                <div style={{ textAlign: "right" }}>
                                                    <div className="list-row-value">{fmtCurrency(amount)}</div>
                                                    <div style={{ fontSize: 11, color: due > 0 ? "var(--warn)" : "var(--t2)", fontWeight: 700 }}>Due {fmtCurrency(due)}</div>
                                                </div>
                                                <button className="bg" onClick={() => setRepairDetail(repair)}><Eye size={14} /> View</button>
                                            </div>
                                        </div>;
                                    })}
                                </div>
                                <div className="gc span-5">
                                    <div style={{ marginBottom: 14 }}>
                                        <h3 style={{ color: "var(--t1)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>Status Breakdown</h3>
                                        <div style={{ color: "var(--t2)", fontSize: 12, marginTop: 4 }}>Queue distribution and financial snapshot.</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
                                        {repairStatusCards.map(card => <div key={card.l} className="gc" style={{ padding: 14, background: "var(--surface-low)", border: "1px solid rgba(198,197,212,.16)" }}><div style={{ color: "var(--t2)", fontSize: 11, textTransform: "uppercase", letterSpacing: .08 + "em", marginBottom: 6 }}>{card.l}</div><div style={{ color: card.c, fontSize: 24, fontWeight: 800 }}>{card.v}</div></div>)}
                                    </div>
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {[
                                            { l: "Total Income", v: fmtCurrency(repairValueTotal), c: "var(--a2)" },
                                            { l: "Profit", v: fmtCurrency(repairProfitTotal), c: "var(--ok)" },
                                            { l: "Pending Due", v: fmtCurrency(repairDueTotal), c: "var(--err)" },
                                        ].map(card => <div key={card.l} className="list-row" style={{ padding: "12px 0" }}><div className="list-row-title">{card.l}</div><div className="list-row-value" style={{ color: card.c }}>{card.v}</div></div>)}
                                    </div>
                                </div>
                            </div>
                        </> : appMode === "bill-pro" ? <div className="dashboard-retail">
                            <div className="dashboard-retail-desktop desktop-enhanced-only">
                                <div className="dashboard-executive-head">
                                    <div className="dashboard-executive-copy"><h1>Bill Pro Dashboard</h1><p>Offline billing, GST invoices, accessory bills, and sticker printing.</p></div>
                                    <div className="dashboard-executive-actions"><button className="dashboard-action-ghost" onClick={() => goPage("bill-stickers")}><Printer size={16} /> Stickers</button><button className="dashboard-action-primary" onClick={() => goPage("billing")}><FileText size={16} /> New Bill</button></div>
                                </div>
                                <BillProQuickActions />
                            </div>
                            <div className="dashboard-retail-mobile-stack">
                                <div className="dashboard-retail-hero">
                                    <div className="dashboard-retail-top">
                                        <div className="dashboard-retail-brand">
                                            <div className="dashboard-retail-brand-mark"><img src="/pd-icon.png" alt={APP_NAME} /></div>
                                            <div>
                                                <h1>Bill Pro</h1>
                                                <p>Offline billing · stickers · {syncStateLabel}</p>
                                            </div>
                                        </div>
                                        <div className="dashboard-retail-top-actions">

                                            <button className="dashboard-retail-icon-btn" onClick={() => goPage("settings")} aria-label="Open settings"><Settings size={20} /></button>
                                        </div>
                                    </div>
                                </div>

                                <BillProQuickActions />

                                    <div className="dashboard-retail-panel">
                                        <div className="dashboard-retail-panel-head"><h3>Recent Activity</h3><button onClick={() => goPage("transactions")}>View All</button></div>
                                        <div className="dashboard-retail-activity">
                                            {invoiceRecords.length === 0 ? <div style={{ color: "var(--t2)", fontSize: 14 }}>No invoices yet. Create your first bill.</div> : null}
                                            {invoiceRecords.slice(0, 5).map(invoice => {
                                                const due = Number(invoice.dueAmount || 0);
                                                return <div key={invoice.id} className={`dashboard-retail-activity-item ${invoice.billType === "GST" ? "" : "nongst"}`}>
                                                    <div className="dashboard-retail-activity-main"><div className="dashboard-retail-activity-icon"><FileText size={18} /></div><div className="dashboard-retail-activity-copy"><div className="dashboard-retail-activity-title">{getTxItemLabel(invoice)}</div><div className="dashboard-retail-activity-meta">{invoice.invoiceNo || "INV"} · {fmtRelativeTime(invoice.dateTime || invoice.date)}</div></div></div>
                                                    <div className="dashboard-retail-activity-side"><div className="dashboard-retail-activity-amount">{fmtCurrency(invoice.totalAmount || invoice.amount)}</div><div className={`dashboard-retail-bill ${due > 0 ? "nongst" : "gst"}`}>{due > 0 ? "DUE" : invoice.billType === "GST" ? "GST" : "NO-GST"}</div></div>
                                                </div>;
                                            })}
                                        </div>
                                    </div>
                            </div>
                        </div> : <div className="dashboard-retail">
                            <div className="dashboard-retail-desktop desktop-enhanced-only">
                                <div className="dashboard-executive-head">
                                    <div className="dashboard-executive-copy">
                                        <h1>Executive Dashboard</h1>
                                        <p>Welcome back. Here is your inventory authority overview.</p>
                                    </div>
                                    <div className="dashboard-executive-actions">
                                        <button className="dashboard-action-ghost" onClick={exportDashboardCsv}><Download size={16} /> Export CSV</button>
                                        <button className="dashboard-action-primary" onClick={() => goPage("reports")}><Calendar size={16} /> {currentMonthLabel}</button>
                                    </div>
                                </div>

                                {stats.ts === 0 ? <div className="dashboard-retail-alert danger"><AlertCircle size={16} /> Out of stock. Add new inventory to continue selling.</div> : null}
                                {stats.ts > 0 && stats.ts < 5 ? <div className="dashboard-retail-alert warn"><AlertCircle size={16} /> Low stock. Only {stats.ts} item{stats.ts !== 1 ? "s" : ""} left.</div> : null}

                                <div className="dashboard-retail-actions">
                                    <button className="dashboard-retail-action" onClick={() => goPage("buy")}><span><ArrowDownCircle size={24} /></span><strong>Purchase</strong></button>
                                    <button className="dashboard-retail-action" onClick={() => enabledModules.includes("sell") ? goPage("sell") : goPage("reports")}><span>{enabledModules.includes("sell") ? <ShoppingCart size={24} /> : <BarChart3 size={24} />}</span><strong>{enabledModules.includes("sell") ? "Sell" : "Reports"}</strong></button>
                                    <button className="dashboard-retail-action" onClick={() => goPage("add")}><span><Plus size={24} /></span><strong>Add Stock</strong></button>
                                </div>

                                <div className="dashboard-kpi-grid">
                                    <div className="dashboard-kpi-card">
                                        <div className="dashboard-kpi-label">Total Stock Value</div>
                                        <div className="dashboard-kpi-value">{fmtCompactCurrency(stats.sv)}</div>
                                    </div>
                                    <div className="dashboard-kpi-card">
                                        <div className="dashboard-kpi-label">Monthly Sales</div>
                                        <div className="dashboard-kpi-value">{fmtCompactCurrency(retailMonthlySales)}</div>
                                    </div>
                                    <div className="dashboard-kpi-card">
                                        <div className="dashboard-kpi-label">Dues To Collect</div>
                                        <div className="dashboard-kpi-value">{fmtCompactCurrency(retailDueTotal)}</div>
                                    </div>
                                </div>

                                <div className="dashboard-main-grid">
                                    <section className="dashboard-card">
                                        <div className="dashboard-card-head">
                                            <h2>Stock Mix Strategy</h2>
                                        </div>
                                        <div className="dashboard-stock-body">
                                            <div className="dashboard-mix-track">
                                                {retailMixRows.map(item => {
                                                    const percent = Math.round((item.value / Math.max(stats.ts, 1)) * 100);
                                                    return <div key={item.label} className="dashboard-mix-item">
                                                        <div className="dashboard-mix-item-top"><span>{item.label}</span><strong>{percent}%</strong></div>
                                                        <div className="dashboard-mix-bar"><div style={{ width: `${Math.max(item.value > 0 ? 12 : 0, percent)}%`, background: item.tone }} /></div>
                                                    </div>;
                                                })}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="dashboard-card">
                                        <div className="dashboard-card-head">
                                            <h2>Recent Transactions</h2>
                                            <button onClick={() => goPage("transactions")}>View All Activity</button>
                                        </div>
                                        <div className="dashboard-transactions-head"><span>Item Details</span><span>Amount</span><span>Status</span><span>Timestamp</span></div>
                                        <div className="dashboard-transactions-list">
                                            {retailDashboardInvoices.length === 0 ? <div className="reports-modern-empty">No invoices yet. Start with Add, Buy, or Sell.</div> : null}
                                            {retailDashboardInvoices.map(t => {
                                                const dueOpen = Number(t.dueAmount || 0) > 0;
                                                return <div key={t.id} className="dashboard-transactions-row">
                                                    <div className="dashboard-transactions-item">
                                                        <div className="dashboard-transactions-icon"><Smartphone size={18} /></div>
                                                        <div>
                                                            <strong>{getTxItemLabel(t)}</strong>
                                                            <span>{(t.invoiceNo || "INV") + " · " + (getTxItemContext(t) || (t.customerName || "Walk-in Customer"))}</span>
                                                        </div>
                                                    </div>
                                                    <div className="dashboard-transactions-amount">
                                                        <strong>{fmtCurrency(t.totalAmount || t.amount)}</strong>
                                                        <span>{t.billType === "GST" ? "+ GST Included" : "Regular Bill"}</span>
                                                    </div>
                                                    <div><span className={`dashboard-status-pill ${dueOpen ? "pending" : ""}`}>{dueOpen ? "Pending" : "Paid"}</span></div>
                                                    <div className="dashboard-transactions-time">{fmtDashboardTime(t.updatedAt || t.createdAt || t.dateTime || t.date)}</div>
                                                </div>;
                                            })}
                                        </div>
                                    </section>
                                </div>

                            </div>

                            <div className="dashboard-retail-mobile-stack">
                                <div className="dashboard-retail-hero">
                                    <div className="dashboard-retail-top">
                                        <div className="dashboard-retail-brand">
                                            <div className="dashboard-retail-brand-mark"><img src="/pd-icon.png" alt={APP_NAME} /></div>
                                            <div>
                                                <h1>{brandShopName}</h1>
                                                <p>{stats.ts} live unit{stats.ts === 1 ? "" : "s"} in stock · {syncStateLabel}</p>
                                            </div>
                                        </div>
                                        <div className="dashboard-retail-top-actions">
                                            <div className={`dashboard-retail-status ${ol ? "" : "offline"}`}>{ol ? <Wifi size={14} /> : <WifiOff size={14} />}{ol ? "Online" : "Offline"}</div>
                                            <button className="dashboard-retail-icon-btn" onClick={() => goPage("inventory")} aria-label="Search inventory"><Search size={20} /></button>
                                            <button className="dashboard-retail-icon-btn" onClick={() => goPage("settings")} aria-label="Open settings"><Bell size={20} /></button>
                                        </div>
                                    </div>
                                </div>

                                <button className="dashboard-retail-search" onClick={() => goPage("inventory")}>
                                    <Search size={22} />
                                    <span>Search inventory, IMEI or invoices...</span>
                                </button>

                                {stats.ts === 0 ? <div className="dashboard-retail-alert danger"><AlertCircle size={16} /> Out of stock. Add new inventory to continue selling.</div> : null}
                                {stats.ts > 0 && stats.ts < 5 ? <div className="dashboard-retail-alert warn"><AlertCircle size={16} /> Low stock. Only {stats.ts} item{stats.ts !== 1 ? "s" : ""} left.</div> : null}

                                <div className="dashboard-retail-metrics sh">
                                    <div className="dashboard-retail-metric">
                                        <div className="dashboard-retail-metric-head">
                                            <div className="dashboard-retail-metric-icon"><Package size={24} /></div>
                                            <span className="dashboard-retail-metric-tag">Live</span>
                                        </div>
                                        <div>
                                            <div className="dashboard-retail-metric-label">Stock Value</div>
                                            <div className="dashboard-retail-metric-value">{fmtCompactCurrency(stats.sv)}</div>
                                            <div className="dashboard-retail-metric-sub">{stats.ts} live unit{stats.ts === 1 ? "" : "s"}</div>
                                        </div>
                                    </div>
                                    <div className="dashboard-retail-metric">
                                        <div className="dashboard-retail-metric-head">
                                            <div className="dashboard-retail-metric-icon"><Banknote size={24} /></div>
                                            <span className="dashboard-retail-metric-tag">This Month</span>
                                        </div>
                                        <div>
                                            <div className="dashboard-retail-metric-label">Monthly Sales</div>
                                            <div className="dashboard-retail-metric-value">{fmtCompactCurrency(retailMonthlySales)}</div>
                                            <div className="dashboard-retail-metric-sub">{tx.filter(t => t.type === "Sell").length} invoice{tx.filter(t => t.type === "Sell").length === 1 ? "" : "s"} total</div>
                                        </div>
                                    </div>
                                    <div className="dashboard-retail-metric">
                                        <div className="dashboard-retail-metric-head">
                                            <div className="dashboard-retail-metric-icon"><IndianRupee size={24} /></div>
                                            <span className="dashboard-retail-metric-tag">Pending</span>
                                        </div>
                                        <div>
                                            <div className="dashboard-retail-metric-label">Dues To Collect</div>
                                            <div className="dashboard-retail-metric-value">{fmtCompactCurrency(retailDueTotal)}</div>
                                            <div className="dashboard-retail-metric-sub">Outstanding customer balance</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="dashboard-retail-actions">
                                    <button className="dashboard-retail-action" onClick={() => goPage("add")}><span><Plus size={24} /></span><strong>Add Stock</strong></button>
                                    <button className="dashboard-retail-action" onClick={() => goPage("buy")}><span><ArrowDownCircle size={24} /></span><strong>Purchase Entry</strong></button>
                                    <button className="dashboard-retail-action" onClick={() => enabledModules.includes("sell") ? goPage("sell") : goPage("reports")}><span>{enabledModules.includes("sell") ? <ShoppingCart size={24} /> : <BarChart3 size={24} />}</span><strong>{enabledModules.includes("sell") ? "New Sale" : "Reports"}</strong></button>
                                </div>

                                <div className="dashboard-retail-panels">
                                    <div className="dashboard-retail-panel">
                                        <div className="dashboard-retail-panel-head">
                                            <h3>Stock Mix</h3>
                                            <div className="dashboard-retail-fill">{retailStockFill}% Full</div>
                                        </div>
                                        <div className="dashboard-retail-mix">
                                            {retailMixRows.map(item => <div key={item.label} className="dashboard-retail-mix-row">
                                                <div className="dashboard-retail-mix-tone" style={{ background: item.tone }} />
                                                <div className="dashboard-retail-mix-copy">
                                                    <div className="dashboard-retail-mix-title"><span>{item.label}</span></div>
                                                    <div className="dashboard-retail-mix-bar"><div style={{ width: `${Math.max(item.value > 0 ? 8 : 0, Math.round((item.value / Math.max(stats.ts, 1)) * 100))}%`, background: item.tone }} /></div>
                                                </div>
                                                <strong>{item.value}</strong>
                                            </div>)}
                                        </div>
                                    </div>

                                    <div className="dashboard-retail-panel">
                                        <div className="dashboard-retail-panel-head">
                                            <h3>Recent Activity</h3>
                                            <button onClick={() => goPage("transactions")}>View All</button>
                                        </div>
                                        <div className="dashboard-retail-activity">
                                            {retailDashboardInvoices.length === 0 ? <div style={{ color: "var(--t2)", fontSize: 14 }}>No invoices yet. Start with Add, Buy, or Sell.</div> : null}
                                            {retailDashboardInvoices.map(t => <div key={t.id} className={`dashboard-retail-activity-item ${t.billType === "GST" ? "" : "nongst"}`}>
                                                <div className="dashboard-retail-activity-main">
                                                    <div className="dashboard-retail-activity-icon"><FileText size={18} /></div>
                                                    <div className="dashboard-retail-activity-copy">
                                                        <div className="dashboard-retail-activity-title">{getTxItemLabel(t)}</div>
                                                        <div className="dashboard-retail-activity-meta">{fmtRelativeTime(t.updatedAt || t.createdAt || t.date)}</div>
                                                    </div>
                                                </div>
                                                <div className="dashboard-retail-activity-side">
                                                    <div className="dashboard-retail-activity-amount">{fmtCurrency(t.totalAmount || t.amount)}</div>
                                                    <div className={`dashboard-retail-bill ${t.billType === "GST" ? "gst" : "nongst"}`}>{t.billType === "GST" ? "GST" : "NO-GST"}</div>
                                                </div>
                                            </div>)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>}
                    </div>}

                    {/* ═══ ADD ═══ */}
                    {pg === "add" && <div className="fi add-compact">
                        <div className="desktop-workspace">
                            <div className="desktop-workspace-main">
                        <div className="add-compact-top add-desktop-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage(ei ? "inventory" : "dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">{ei ? "Edit Stock" : "Add Stock"}</div>
                                </div>
                            </div>
                            <div className="add-pos-chip"><Package size={14} /> {ei ? "Editing existing unit" : bulkAdd ? "Bulk intake" : "Single handset"}</div>
                        </div>

                        <div className="add-mobile-hero add-mobile-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage(ei ? "inventory" : "dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">{ei ? "Edit Stock" : "Add Stock"}</div>
                                </div>
                            </div>
                        </div>

                        {!ei && <div className="add-compact-toolbar">
                            <button className={bulkAdd ? "bp" : "bg"} onClick={() => { setBulkAdd(v => !v); setBulkImeis([]); setBulkManualImei(""); uf("imei", ""); uf("imei2", ""); }}><Layers size={16} /> {bulkAdd ? "Switch to Single Add" : "Enable Bulk Add"}</button>
                        </div>}

                        {bulkAdd && !ei ? <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2>Bulk IMEI Queue</h2>
                                </div>
                                <div className="editor-inline">
                                    <button className="bg" onClick={() => setBulkImeis([])} disabled={!bulkImeis.length}><Trash2 size={15} /> Clear</button>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <input className="gi" value={bulkManualImei} onChange={e => setBulkManualImei(cleanImei(e.target.value))} onKeyDown={e => e.key === "Enter" && submitBulkManualImei()} placeholder="Type or paste 15-digit IMEI" style={{ fontFamily: "'Space Mono',monospace", flex: 1 }} />
                                <button className="bp" onClick={submitBulkManualImei} style={{ whiteSpace: "nowrap" }}><CheckCircle size={16} /> Add IMEI</button>
                            </div>
                            <div className="add-compact-queue-list">
                                {bulkImeis.length === 0 && <div style={{ color: "var(--t3)", fontSize: 13, padding: "6px 2px" }}>Scan each handset IMEI to build the queue.</div>}
                                {bulkImeis.map((imei, index) => <div key={imei} className="add-compact-queue-item">
                                    <div style={{ minWidth: 0 }}>
                                        <span>Device {bulkImeis.length - index}</span>
                                        <strong>{imei}</strong>
                                    </div>
                                    <button className="bg" onClick={() => removeBulkImei(imei)} style={{ padding: "8px 10px" }}><Trash2 size={14} /> Remove</button>
                                </div>)}
                            </div>
                        </div> : null}

                        <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2>{bulkAdd && !ei ? "Shared Device Details" : "Device Details"}</h2>
                                </div>
                            </div>

                            <div className="add-compact-form">
                                <div className="add-compact-field span-2 photos">
                                    <div className="add-compact-label">Photos</div>
                                    <PhotoUp photos={fm.photos || []} onChange={p => uf("photos", p)} onCameraNeeded={releaseCameraNow} />
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Brand &amp; Model</div>
                                    <div className="add-compact-brand-row">
                                        <div className="add-input-shell"><select className="gs" value={fm.brand} onChange={e => uf("brand", e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></div>
                                        <div className="add-input-shell"><input className="gi" value={fm.model} onChange={e => uf("model", e.target.value)} placeholder="e.g. iPhone 15 Pro" /></div>
                                    </div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Storage</div>
                                        <StorageInput value={fm.storage} onChange={v => uf("storage", v)} />
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">RAM</div>
                                        <RamInput value={fm.ram} onChange={v => uf("ram", v)} />
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Warranty</div>
                                        <div className="add-input-shell"><select className="gs" value={fm.warrantyType || "No Warranty"} onChange={e => uf("warrantyType", e.target.value)}>{WARRANTY_TYPES.map(w => <option key={w}>{w}</option>)}</select></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Purchase Date</div>
                                        <div className="add-input-shell"><input className="gi" type="date" value={fm.purchaseDate} onChange={e => uf("purchaseDate", e.target.value)} /></div>
                                    </div>
                                </div>

                                {!bulkAdd && <>
                                    <div className="add-compact-field">
                                        <div className="add-compact-label">IMEI 1</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.imei} onChange={e => uf("imei", e.target.value)} placeholder="00000..." style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                    </div>

                                    <div className="add-compact-field">
                                        <div className="add-compact-label">IMEI 2</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.imei2} onChange={e => uf("imei2", e.target.value)} placeholder="Optional" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                    </div>
                                </>}

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Color</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.color} onChange={e => uf("color", e.target.value)} placeholder="Titanium" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Battery Health</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.batteryHealth} onChange={e => uf("batteryHealth", e.target.value)} placeholder="e.g. 92%" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Buy Price</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={fm.buyPrice} onChange={e => uf("buyPrice", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Sell Price</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={fm.sellPrice} onChange={e => uf("sellPrice", e.target.value)} placeholder="₹0" /></div>
                                    </div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Device Condition</div>
                                    <div className="add-input-shell"><select className="gs" value={fm.condition} onChange={e => uf("condition", e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Supplier</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.supplier} onChange={e => uf("supplier", e.target.value)} placeholder="Optional supplier" /></div>
                                </div>

                                {fm.warrantyType === "Testing Warranty" ? <div className="add-compact-field">
                                    <div className="add-compact-label">Warranty Months</div>
                                    <div className="add-input-shell"><input className="gi" type="number" min="1" max="36" value={fm.warrantyMonths} onChange={e => uf("warrantyMonths", e.target.value)} placeholder="Months" /></div>
                                </div> : null}

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Notes</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.notes} onChange={e => uf("notes", e.target.value)} placeholder="Optional stock notes" /></div>
                                </div>

                            </div>
                        </div>

                        <div className="add-compact-actions add-desktop-only desktop-inline-actions">
                            {ei ? <button className="bg" onClick={() => goPage("inventory")}>Back to Stock</button> : <button className="bg add-save-draft" onClick={saveAddDraft}>Save Draft</button>}
                            <button className="bp" onClick={() => void (bulkAdd && !ei ? saveBulkInv() : saveInv())} disabled={bulkAdd && !ei && bulkSaveBusy}><CheckCircle size={16} /> {finalAddActionLabel}</button>
                        </div>

                        <div className="add-mobile-actions add-mobile-only">
                            {ei ? <button className="bg" onClick={() => goPage("inventory")}>Back</button> : <button className="bg add-save-draft" onClick={saveAddDraft}>Save Draft</button>}
                            <button className="bp" onClick={() => void (bulkAdd && !ei ? saveBulkInv() : saveInv())} disabled={bulkAdd && !ei && bulkSaveBusy}>{finalAddActionLabel}</button>
                        </div>
                            </div>
                            <aside className="desktop-workspace-side desktop-enhanced-only">
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Desktop Intake</div>
                                    <div className="desktop-side-title">Intake Summary</div>
                                    <div className="desktop-side-grid">
                                        {addDesktopSummary.map(item => <div key={item.label} className="desktop-side-stat"><span>{item.label}</span><strong>{item.value}</strong></div>)}
                                    </div>
                                </div>
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Action Rail</div>
                                    <ul className="desktop-side-list">
                                        <li><strong>Current step</strong><span>{currentAddStep?.title || "Device details"}</span></li>
                                        <li><strong>Next focus</strong><span>{nextAddStep?.title || "Ready to save"}</span></li>
                                        <li><strong>Photos</strong><span>{fm.photos?.length || 0} attached</span></li>
                                        <li><strong>IMEI check</strong><span>{bulkAdd && !ei ? `${bulkImeis.length} queued` : (fm.imei ? "Primary IMEI added" : "Awaiting primary IMEI")}</span></li>
                                    </ul>
                                    <div className="add-desktop-actions">
                                        {ei ? <button className="bg" onClick={() => goPage("inventory")}>Back to Stock</button> : <button className="bg add-save-draft" onClick={saveAddDraft}>Save Draft</button>}
                                        <button className="bp" onClick={() => void (bulkAdd && !ei ? saveBulkInv() : saveInv())} disabled={bulkAdd && !ei && bulkSaveBusy}><CheckCircle size={16} /> {finalAddActionLabel}</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>}

                    {/* ═══ INVENTORY ═══ */}
                    {pg === "inventory" && !di && <div className="fi stock-modern">
                        <div className="stock-modern-desktop-head desktop-enhanced-only">
                            <div className="stock-modern-desktop-copy">
                                <h1>Stock</h1>
                                <p>Manage live devices, compare margins, and move from browsing to action without changing the mobile stock workflow.</p>
                                <div className="stock-modern-desktop-meta">
                                    <strong>{stats.ts.toLocaleString("en-IN")}</strong> Items Total
                                    <span>•</span>
                                    <strong>{fmtCompactCurrency(stats.sv)}</strong> Value
                                    <span>•</span>
                                    <strong>{fmtCompactCurrency(retailDueTotal)}</strong> Due Balance
                                </div>
                            </div>
                            <div className="stock-modern-desktop-actions">
                                <button className="dashboard-action-ghost" onClick={() => goPage("reports")}><BarChart3 size={16} /> Quick Reports</button>
                                <button className="bp" onClick={() => goPage("add")}><Plus size={16} /> Add New Stock</button>
                            </div>
                        </div>
                        <div className="stock-modern-controls">
                            <div className="stock-modern-search">
                                <Search size={22} />
                                <input id="stock-search-input" className="gi" placeholder="Search by Model or IMEI..." value={sq} onChange={e => sSq(e.target.value)} />
                            </div>

                            <div className="stock-modern-filters">
                                <select className="gs stock-modern-pill" value={stockBrandFilter} onChange={e => setStockBrandFilter(e.target.value)}>
                                    <option value="All Brands">All Brands</option>
                                    {[...new Set(inv.filter(item => item.status !== "Deleted").map(item => item.brand).filter(Boolean))].sort().map(brand => <option key={brand} value={brand}>{brand}</option>)}
                                </select>
                                <select className="gs stock-modern-pill" value={stockConditionFilter} onChange={e => setStockConditionFilter(e.target.value)}>
                                    <option value="Any Condition">Any Condition</option>
                                    {CONDITIONS.map(condition => <option key={condition} value={condition}>{condition}</option>)}
                                </select>
                                <select className="gs stock-modern-pill" value={stockPriceFilter} onChange={e => setStockPriceFilter(e.target.value)}>
                                    {STOCK_PRICE_FILTERS.map(price => <option key={price} value={price}>{price}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="stock-modern-grid stock-modern-mobile-grid">
                            {visibleFi.map(it => {
                                const conditionLabel = it.condition === "New" ? "MINT" : it.condition === "Refurbished" ? "GOOD" : "FAIR";
                                const conditionClass = it.condition === "New" ? "mint" : it.condition === "Refurbished" ? "good" : "fair";
                                const margin = Number(it.sellPrice || 0) - Number(it.buyPrice || 0);
                                return <article key={it.id} className="stock-modern-card" role="button" tabIndex={0} onClick={() => sDi(it)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sDi(it); } }}>
                                    <div className="stock-modern-card-media">
                                        <span className={`stock-modern-condition ${conditionClass}`}>{conditionLabel}</span>
                                        {it.photos?.length > 0
                                            ? <img src={getPhotoPreview(it.photos[0])} alt={it.model} loading="lazy" decoding="async" />
                                            : <div className="stock-modern-placeholder" style={{ background: BRAND_GRADIENTS[it.brand] || BRAND_GRADIENTS.Other }}><Smartphone size={52} /><span>{it.brand}</span></div>}
                                    </div>

                                    <div className="stock-modern-card-body">
                                        <p className="stock-modern-brand-name">{it.brand || "Other"}</p>
                                        <h3>{it.model || "Unknown Model"}</h3>
                                        <p className="stock-modern-imei">IMEI: ...{String(it.imei || "").slice(-3) || "---"}</p>

                                        <div className="stock-modern-specs">
                                            {it.storage ? <span>{it.storage}</span> : null}
                                            {it.ram ? <span>{it.ram} RAM</span> : null}
                                        </div>

                                        <div className="stock-modern-price-row">
                                            <div><small>Price</small><strong>{fmtCurrency(it.sellPrice)}</strong></div>
                                            <div><small>Margin</small><strong className={margin >= 0 ? "up" : "down"}>{margin >= 0 ? "+" : ""}{fmtCompactCurrency(margin)}</strong></div>
                                        </div>

                                        <div className="stock-modern-actions">
                                            {it.status === "In Stock" && it.qty > 0
                                                ? <button className="stock-modern-action primary" onClick={e => { e.stopPropagation(); sFm(toForm(it, { amount: it.sellPrice, paidAmount: it.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" })); sPg("sell"); sDi(null); }} aria-label="Sell"><Banknote size={17} /></button>
                                                : <button className="stock-modern-action" onClick={e => { e.stopPropagation(); sDi(it); }} aria-label="View"><Eye size={16} /></button>}
                                            <button className="stock-modern-action" onClick={e => { e.stopPropagation(); editFromStock(it); }} aria-label="Edit"><Edit2 size={16} /></button>
                                            <button className="stock-modern-action" onClick={e => { e.stopPropagation(); void printSticker(it); }} aria-label="Print"><Printer size={16} /></button>
                                            <button className="stock-modern-action danger" onClick={e => { e.stopPropagation(); setConfirmDel(it); }} aria-label="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                </article>;
                            })}
                        </div>

                        <div className="stock-modern-footer-note stock-modern-mobile-grid">INVENTORY STATUS <span>Showing {visibleFi.length} of {fi.length}</span></div>

                        {hasMoreStock && <div ref={stockLoadMoreRef} style={{ height: 1, marginTop: 16 }} />}
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
                    {pg === "buy" && <div className="fi add-compact">
                        <div className="desktop-workspace">
                            <div className="desktop-workspace-main">
                        <div className="add-compact-top add-desktop-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">Buy Stock</div>
                                </div>
                            </div>
                            <div className="add-pos-chip"><ArrowDownCircle size={14} /> Supplier intake</div>
                        </div>

                        <div className="add-mobile-hero add-mobile-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">Buy Stock</div>
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2>Purchase Details</h2>
                                </div>
                            </div>

                            <div className="add-compact-form">
                                <div className="add-compact-field span-2 photos">
                                    <div className="add-compact-label">Photos</div>
                                    <PhotoUp photos={fm.photos || []} onChange={p => uf("photos", p)} onCameraNeeded={releaseCameraNow} />
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Brand &amp; Model</div>
                                    <div className="add-compact-brand-row">
                                        <div className="add-input-shell"><select className="gs" value={fm.brand} onChange={e => uf("brand", e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></div>
                                        <div className="add-input-shell"><input className="gi" value={fm.model} onChange={e => uf("model", e.target.value)} placeholder="e.g. iPhone 15 Pro" /></div>
                                    </div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Storage</div>
                                        <StorageInput value={fm.storage} onChange={v => uf("storage", v)} />
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">RAM</div>
                                        <RamInput value={fm.ram} onChange={v => uf("ram", v)} />
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Warranty</div>
                                        <div className="add-input-shell"><select className="gs" value={fm.warrantyType || "No Warranty"} onChange={e => uf("warrantyType", e.target.value)}>{WARRANTY_TYPES.map(w => <option key={w}>{w}</option>)}</select></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Purchase Date</div>
                                        <div className="add-input-shell"><input className="gi" type="date" value={fm.purchaseDate} onChange={e => uf("purchaseDate", e.target.value)} /></div>
                                    </div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">IMEI 1</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.imei} onChange={e => uf("imei", e.target.value)} placeholder="IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">IMEI 2</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.imei2} onChange={e => uf("imei2", e.target.value)} placeholder="Optional" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Color</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.color} onChange={e => uf("color", e.target.value)} placeholder="Color" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Battery Health</div>
                                        <div className="add-input-shell"><input className="gi" value={fm.batteryHealth} onChange={e => uf("batteryHealth", e.target.value)} placeholder="e.g. 92%" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Buy Price</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={fm.buyPrice} onChange={e => uf("buyPrice", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Sell Price</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={fm.sellPrice} onChange={e => uf("sellPrice", e.target.value)} placeholder="₹0" /></div>
                                    </div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Device Condition</div>
                                    <div className="add-input-shell"><select className="gs" value={fm.condition} onChange={e => uf("condition", e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Supplier *</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.supplier} onChange={e => uf("supplier", e.target.value)} placeholder="Supplier" /></div>
                                </div>

                                {fm.warrantyType === "Testing Warranty" ? <div className="add-compact-field">
                                    <div className="add-compact-label">Warranty Months</div>
                                    <div className="add-input-shell"><input className="gi" type="number" min="1" max="36" value={fm.warrantyMonths} onChange={e => uf("warrantyMonths", e.target.value)} placeholder="Months" /></div>
                                </div> : null}

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Phone</div>
                                    <div className="add-input-shell"><input className="gi" type="tel" value={fm.phone} onChange={e => uf("phone", e.target.value)} placeholder="Phone" /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Payment</div>
                                    <div className="add-input-shell"><select className="gs" value={fm.paymentMode === "EMI" ? "Cash" : fm.paymentMode} onChange={e => uf("paymentMode", e.target.value)}>{PAYMENT_MODES.filter(p => p !== "EMI").map(p => <option key={p}>{p}</option>)}</select></div>
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Notes</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.notes} onChange={e => uf("notes", e.target.value)} placeholder="Purchase notes" /></div>
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-collapses">
                            {buyRequiresSellerVerification && <details className="add-compact-collapse" open>
                                <summary>
                                    <strong>Seller Verification</strong>
                                    <span>{fm.sellerAgreementAccepted ? "Ready" : "Required"}</span>
                                </summary>
                                <div className="add-compact-collapse-body">
                                    <div className="add-compact-form">
                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Seller Name *</div>
                                            <div className="add-input-shell"><input className="gi" value={fm.sellerName} onChange={e => uf("sellerName", e.target.value)} placeholder="Seller full name" /></div>
                                        </div>

                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Seller Phone *</div>
                                            <div className="add-input-shell"><input className="gi" type="tel" value={fm.sellerPhone} onChange={e => uf("sellerPhone", e.target.value)} placeholder="Seller phone" /></div>
                                        </div>

                                        <div className="add-compact-field span-2">
                                            <div className="add-compact-label">Aadhaar Number *</div>
                                            <div className="add-input-shell"><input className="gi" value={fm.sellerAadhaarNumber} onChange={e => uf("sellerAadhaarNumber", e.target.value.replace(/[^\d]/g, "").slice(0, 12))} placeholder="12 digit Aadhaar" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
                                        <SingleImageInput label="Seller ID" value={fm.sellerIdPhotoData} onChange={v => uf("sellerIdPhotoData", v)} />
                                        <SingleImageInput label="Seller Photo" value={fm.sellerPhotoData} onChange={v => uf("sellerPhotoData", v)} />
                                    </div>

                                    <div style={{ marginTop: 12 }}>
                                        <div className="add-compact-label" style={{ marginBottom: 8 }}>Seller Signature *</div>
                                        <SignaturePad value={fm.sellerSignatureData} onChange={v => uf("sellerSignatureData", v)} />
                                    </div>

                                    <label className="add-compact-check" style={{ marginTop: 12 }}>
                                        <input type="checkbox" checked={!!fm.sellerAgreementAccepted} onChange={e => uf("sellerAgreementAccepted", e.target.checked)} />
                                        <span>I confirm the seller has declared lawful ownership of this device and agrees to transfer it to the shop.</span>
                                    </label>
                                </div>
                            </details>}
                        </div>

                        <div className="add-compact-actions add-desktop-only desktop-inline-actions">
                            <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                            <button className="bp" style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }} onClick={doBuy}><ArrowDownCircle size={16} /> Record Purchase</button>
                        </div>

                        <div className="add-mobile-actions add-mobile-only">
                            <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                            <button className="bp" style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }} onClick={doBuy}>Record Purchase</button>
                        </div>
                            </div>
                            <aside className="desktop-workspace-side desktop-enhanced-only">
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Supplier Intake</div>
                                    <div className="desktop-side-title">Purchase Summary</div>
                                    <div className="desktop-side-grid">
                                        {buyDesktopSummary.map(item => <div key={item.label} className="desktop-side-stat"><span>{item.label}</span><strong>{item.value}</strong></div>)}
                                    </div>
                                </div>
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Readiness</div>
                                    <ul className="desktop-side-list">
                                        <li><strong>Seller verification</strong><span>{buyRequiresSellerVerification ? (fm.sellerAgreementAccepted ? "Captured" : "Required") : "Not required"}</span></li>
                                        <li><strong>Photos</strong><span>{fm.photos?.length || 0} handset photos</span></li>
                                        <li><strong>IMEI</strong><span>{fm.imei ? "Primary IMEI added" : "Awaiting IMEI"}</span></li>
                                        <li><strong>Payment mode</strong><span>{fm.paymentMode || "Cash"}</span></li>
                                    </ul>
                                    <div className="add-desktop-actions">
                                        <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                                        <button className="bp" style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }} onClick={doBuy}><ArrowDownCircle size={16} /> Record Purchase</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>}

                    {/* ═══ SELL ═══ */}
                    {pg === "sell" && <div className="fi add-compact">
                        <div className="desktop-workspace">
                            <div className="desktop-workspace-main">
                        <div className="add-compact-top add-desktop-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">New Sale</div>
                                </div>
                            </div>
                            <div className="add-pos-chip"><ArrowUpCircle size={14} /> Invoice-ready</div>
                        </div>

                        <div className="add-mobile-hero add-mobile-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">New Sale</div>
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2>Sale Details</h2>
                                </div>
                            </div>

                            <div className="add-compact-form">
                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">IMEI 1 or IMEI 2</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.imei} onChange={e => { const v = cleanImei(e.target.value); uf("imei", v); if (v.length === 15) { const f = liveDeviceByImei(v); if (f) sFm(toForm(f, { amount: f.sellPrice, paidAmount: f.sellPrice, dueAmount: 0, customerName: "", phone: "", notes: "" })); } }} placeholder="IMEI" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                </div>

                                {fm.model && <div className="add-compact-field span-2" style={{ background: "rgba(163,246,156,.18)", borderColor: "rgba(90,169,88,.2)" }}>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                                        {fm.photos?.length > 0 && <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0, cursor: "pointer" }} onClick={() => sLb({ photos: fm.photos, si: 0 })}><img src={getPhotoPreview(fm.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div>}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ color: "var(--ok)", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>Device Found</div>
                                            <div style={{ color: "var(--t1)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: "-.02em" }}>{fm.brand} {fm.model}</div>
                                            <div style={{ color: "var(--t2)", fontSize: 12, marginTop: 3 }}>{fm.color || "-"} · {fmtSpecs(fm.ram, fm.storage)}{fm.batteryHealth ? ` · Battery ${fm.batteryHealth}` : ""} · {fm.condition}</div>
                                            <div style={{ color: "var(--t3)", fontSize: 11, fontFamily: "'Space Mono',monospace", marginTop: 3, wordBreak: "break-all" }}>IMEI 1: {fm.imei}{fm.imei2 ? ` | IMEI 2: ${fm.imei2}` : ""}</div>
                                            <div style={{ color: "var(--t2)", fontSize: 12, marginTop: 3 }}>Buy: {fmtCurrency(fm.buyPrice)} {"->"} Sell: {fmtCurrency(fm.sellPrice)}</div>
                                        </div>
                                    </div>
                                </div>}

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Customer *</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.customerName} onChange={e => uf("customerName", e.target.value)} placeholder="Buyer" /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Phone</div>
                                    <div className="add-input-shell"><input className="gi" type="tel" value={fm.phone} onChange={e => uf("phone", e.target.value)} placeholder="Phone" /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Address</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.customerAddress || ""} onChange={e => uf("customerAddress", e.target.value)} placeholder="Customer address (optional)" /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Salesman</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.salesman || ""} onChange={e => uf("salesman", e.target.value)} placeholder="Salesman name (optional)" /></div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Bill Type</div>
                                        <div className="add-input-shell"><select className="gs" value={fm.billType} onChange={e => uf("billType", e.target.value)}>{BILL_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">GST Rate %</div>
                                        <div className="add-input-shell"><input className="gi" type="number" step="0.01" value={fm.gstRate} onChange={e => uf("gstRate", e.target.value)} placeholder="18" disabled={fm.billType !== "GST"} /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Amount</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={fm.amount} onChange={e => uf("amount", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Payment</div>
                                    <div className="add-input-shell"><select className="gs" value={fm.paymentMode} onChange={e => uf("paymentMode", e.target.value)}>{PAYMENT_MODES.map(p => <option key={p}>{p}</option>)}</select></div>
                                </div>

                                {fm.paymentMode === "EMI" && <div className="add-compact-field span-2">
                                    <div style={{ border: "1px solid rgba(217,164,65,.45)", background: "rgba(217,164,65,.14)", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Banknote size={15} style={{ color: "#a5720e", flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#a5720e" }}>EMI finance details — mandatory</span>
                                        </div>
                                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                                            <div className="add-compact-field"><div className="add-compact-label">Finance Provider *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" value={fm.financeProvider} onChange={e => uf("financeProvider", e.target.value)} placeholder="Bajaj Finance / HDFC / Cardless" /></div></div>
                                            <div className="add-compact-field"><div className="add-compact-label">Loan Reference *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" value={fm.loanReference} onChange={e => uf("loanReference", e.target.value)} placeholder="BF/123456789" /></div></div>
                                            <div className="add-compact-field"><div className="add-compact-label">Tenure (Months) *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" inputMode="numeric" value={fm.financeTenureMonths} onChange={e => uf("financeTenureMonths", e.target.value)} placeholder="12" /></div></div>
                                            <div className="add-compact-field"><div className="add-compact-label">Down Payment ₹ *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" type="number" value={fm.paidAmount} onChange={e => uf("paidAmount", e.target.value)} placeholder="0" /></div></div>
                                        </div>
                                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#5f4a12" }}>Finance Amount: {fmtCurrency(Math.max((+fm.amount || 0) - (+fm.paidAmount || 0), 0))}</span>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#5f4a12" }}>Settlement: Pending</span>
                                        </div>
                                    </div>
                                </div>}

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Notes</div>
                                    <div className="add-input-shell"><input className="gi" value={fm.notes} onChange={e => uf("notes", e.target.value)} placeholder="Notes" /></div>
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-actions add-desktop-only desktop-inline-actions">
                            <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                            <button className="bs" onClick={doSell}><ArrowUpCircle size={16} /> Complete Sale</button>
                        </div>

                        <div className="add-mobile-actions add-mobile-only">
                            <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                            <button className="bs" onClick={doSell}>Complete Sale</button>
                        </div>
                            </div>
                            <aside className="desktop-workspace-side desktop-enhanced-only">
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Invoice Ready</div>
                                    <div className="desktop-side-title">Sale Summary</div>
                                    <div className="desktop-side-grid">
                                        {sellDesktopSummary.map(item => <div key={item.label} className="desktop-side-stat"><span>{item.label}</span><strong>{item.value}</strong></div>)}
                                    </div>
                                </div>
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Billing Summary</div>
                                    <ul className="desktop-side-list">
                                        <li><strong>Bill type</strong><span>{fm.billType || "NON GST"}</span></li>
                                        <li><strong>Payment mode</strong><span>{fm.paymentMode || "Cash"}</span></li>
                                        <li><strong>Customer</strong><span>{fm.customerName || "Walk-in customer"}</span></li>
                                        <li><strong>Profit snapshot</strong><span>{fmtCurrency(Number(fm.amount || 0) - Number(fm.buyPrice || 0))}</span></li>
                                    </ul>
                                    <div className="add-desktop-actions">
                                        <button className="bg" onClick={() => sFm(ef)}>Clear</button>
                                        <button className="bs" onClick={doSell}><ArrowUpCircle size={16} /> Complete Sale</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>}

                    {/* ═══ BILL PRO BILLING ═══ */}
                    {pg === "billing" && <div className="fi add-compact billing-page">
                        <div className="desktop-workspace">
                            <div className="desktop-workspace-main">
                                <div className="add-compact-top add-desktop-only">
                                    <div className="add-mobile-top">
                                        <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                        <div>
                                            <div className="add-mobile-header-title">Bill Pro Invoice</div>
                                        </div>
                                    </div>
                                    <div className="add-pos-chip"><FileText size={14} /> Offline billing only</div>
                                </div>

                                <div className="add-mobile-hero add-mobile-only">
                                    <div className="add-mobile-top">
                                        <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                        <div>
                                            <div className="add-mobile-header-title">Bill Pro Invoice</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="add-compact-card">
                                    <div className="add-compact-head">
                                        <div>
                                            <h2>Billing Details</h2>
                                        </div>
                                        <button className="add-link-btn" onClick={resetBillProForm}><RotateCcw size={14} /> Reset</button>
                                    </div>

                                    <div className="add-compact-form">
                                        <div className="add-compact-field span-2">
                                            <div className="add-compact-label">Category</div>
                                            <div className="add-input-shell"><select className="gs" value={billProForm.category} onChange={e => setBillProField("category", e.target.value)}>{BILL_PRO_CATEGORIES.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
                                        </div>

                                        {isBillProMobileCategory(billProForm.category) ? <>
                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Brand *</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.brand} onChange={e => setBillProField("brand", e.target.value)} placeholder="Apple / Samsung / Vivo" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Model *</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.model} onChange={e => setBillProField("model", e.target.value)} placeholder="iPhone 13 / Galaxy S24" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">IMEI 1 *</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.imei} onChange={e => setBillProField("imei", e.target.value)} placeholder="15-digit IMEI" style={{ fontFamily: "'Space Mono',monospace" }} inputMode="numeric" pattern="[0-9]*" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">IMEI 2</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.imei2} onChange={e => setBillProField("imei2", e.target.value)} placeholder="Optional second IMEI" style={{ fontFamily: "'Space Mono',monospace" }} inputMode="numeric" pattern="[0-9]*" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Color</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.color} onChange={e => setBillProField("color", e.target.value)} placeholder="Blue / Black / White" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Condition</div>
                                                <div className="add-input-shell"><select className="gs" value={billProForm.condition} onChange={e => setBillProField("condition", e.target.value)}>{CONDITIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">RAM</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.ram} onChange={e => setBillProField("ram", e.target.value)} placeholder="8GB" inputMode="numeric" pattern="[0-9]*" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Storage</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.storage} onChange={e => setBillProField("storage", e.target.value)} placeholder="128GB" inputMode="numeric" pattern="[0-9]*" /></div>
                                            </div>
                                        </> : <>
                                            <div className="add-compact-field span-2">
                                                <div className="add-compact-label">Item Name *</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.itemLabel} onChange={e => setBillProField("itemLabel", e.target.value)} placeholder="Charger / Headphones / Cable" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Serial / Code</div>
                                                <div className="add-input-shell"><input className="gi" value={billProForm.serialNo} onChange={e => setBillProField("serialNo", e.target.value)} placeholder="Optional code or serial" /></div>
                                            </div>

                                            <div className="add-compact-field">
                                                <div className="add-compact-label">Qty</div>
                                                <div className="add-input-shell"><input className="gi" type="number" min="1" value={billProForm.qty} onChange={e => setBillProField("qty", e.target.value)} placeholder="1" /></div>
                                            </div>
                                        </>}

                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Customer</div>
                                            <div className="add-input-shell"><input className="gi" value={billProForm.customerName} onChange={e => setBillProField("customerName", e.target.value)} placeholder="Buyer name" /></div>
                                        </div>

                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Phone</div>
                                            <div className="add-input-shell"><input className="gi" type="tel" value={billProForm.phone} onChange={e => setBillProField("phone", e.target.value)} placeholder="Customer phone" /></div>
                                        </div>

                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Address</div>
                                            <div className="add-input-shell"><input className="gi" value={billProForm.customerAddress || ""} onChange={e => setBillProField("customerAddress", e.target.value)} placeholder="Customer address (optional)" /></div>
                                        </div>

                                        <div className="add-compact-field">
                                            <div className="add-compact-label">Salesman</div>
                                            <div className="add-input-shell"><input className="gi" value={billProForm.salesman || ""} onChange={e => setBillProField("salesman", e.target.value)} placeholder="Salesman name (optional)" /></div>
                                        </div>

                                        <div className="add-compact-mini-grid">
                                            <div className="add-compact-field mini">
                                                <div className="add-compact-label">Bill Type</div>
                                                <div className="add-input-shell"><select className="gs" value={billProForm.billType} onChange={e => setBillProField("billType", e.target.value)}>{BILL_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>
                                            </div>

                                            <div className="add-compact-field mini">
                                                <div className="add-compact-label">GST Rate %</div>
                                                <div className="add-input-shell"><input className="gi" type="number" step="0.01" value={billProForm.gstRate} onChange={e => setBillProField("gstRate", e.target.value)} placeholder="18" disabled={billProForm.billType !== "GST"} /></div>
                                            </div>

                                            <div className="add-compact-field mini">
                                                <div className="add-compact-label">Amount</div>
                                                <div className="add-input-shell"><input className="gi" type="number" value={billProForm.amount} onChange={e => setBillProField("amount", e.target.value)} placeholder="₹0" /></div>
                                            </div>

                                            <div className="add-compact-field mini">
                                                <div className="add-compact-label">Payment</div>
                                                <div className="add-input-shell"><select className="gs" value={billProForm.paymentMode} onChange={e => setBillProField("paymentMode", e.target.value)}>{PAYMENT_MODES.map(mode => <option key={mode}>{mode}</option>)}</select></div>
                                            </div>
                                        </div>

                                        {billProForm.paymentMode === "EMI" && <div className="add-compact-field span-2">
                                            <div style={{ border: "1px solid rgba(217,164,65,.45)", background: "rgba(217,164,65,.14)", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 10 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <Banknote size={15} style={{ color: "#a5720e", flexShrink: 0 }} />
                                                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "#a5720e" }}>EMI finance details — mandatory</span>
                                                </div>
                                                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                                                    <div className="add-compact-field"><div className="add-compact-label">Finance Provider *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" value={billProForm.financeProvider} onChange={e => setBillProField("financeProvider", e.target.value)} placeholder="Bajaj Finance / HDFC / Cardless" /></div></div>
                                                    <div className="add-compact-field"><div className="add-compact-label">Loan Reference *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" value={billProForm.loanReference} onChange={e => setBillProField("loanReference", e.target.value)} placeholder="BF/123456789" /></div></div>
                                                    <div className="add-compact-field"><div className="add-compact-label">Tenure (Months) *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" inputMode="numeric" value={billProForm.financeTenureMonths} onChange={e => setBillProField("financeTenureMonths", e.target.value)} placeholder="12" /></div></div>
                                                    <div className="add-compact-field"><div className="add-compact-label">Down Payment ₹ *</div><div className="add-input-shell" style={{ background: "rgba(255,255,255,.82)" }}><input className="gi" type="number" value={billProForm.paidAmount} onChange={e => setBillProField("paidAmount", e.target.value)} placeholder="0" /></div></div>
                                                </div>
                                                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#5f4a12" }}>Finance Amount: {fmtCurrency(Math.max((+billProForm.amount || 0) - (+billProForm.paidAmount || 0), 0))}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#5f4a12" }}>Settlement: Pending</span>
                                                </div>
                                            </div>
                                        </div>}

                                        <div className="add-compact-field span-2">
                                            <div className="add-compact-label">Notes</div>
                                            <div className="add-input-shell"><input className="gi" value={billProForm.notes} onChange={e => setBillProField("notes", e.target.value)} placeholder="Optional notes for the invoice" /></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="add-compact-actions add-desktop-only billing-bottom-bar">
                                    <button className="bg" onClick={resetBillProForm}>Clear</button>
                                    <button className="bs" onClick={doBillProSale}><ArrowUpCircle size={16} /> Save Invoice</button>
                                </div>

                                <div className="add-mobile-actions add-mobile-only">
                                    <button className="bg" onClick={resetBillProForm}>Clear</button>
                                    <button className="bs" onClick={doBillProSale}>Save Invoice</button>
                                </div>
                            </div>
                            <aside className="desktop-workspace-side desktop-enhanced-only">
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Bill Pro</div>
                                    <div className="desktop-side-title">Invoice Summary</div>
                                    <div className="desktop-side-grid">
                                        {[
                                            { label: "Item", value: getTxItemLabel(billProForm) || "Awaiting item name" },
                                            { label: "Qty", value: String(getTxQty(billProForm)) },
                                            { label: "Total", value: fmtCurrency(billProForm.amount || 0) },
                                            { label: "Due", value: fmtCurrency(billProForm.dueAmount || 0) },
                                        ].map(item => <div key={item.label} className="desktop-side-stat"><span>{item.label}</span><strong>{item.value}</strong></div>)}
                                    </div>
                                </div>
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Tax Preview</div>
                                    <div className="desktop-side-title">Billing Breakdown</div>
                                    <ul className="desktop-side-list">
                                        <li><strong>Bill type</strong><span>{billProForm.billType || "NON GST"}</span></li>
                                        <li><strong>Taxable</strong><span>{fmtCurrency(billProSalePreview.taxableAmount || 0)}</span></li>
                                        <li><strong>GST</strong><span>{fmtCurrency(billProSalePreview.gstAmount || 0)}</span></li>
                                        <li><strong>Payment mode</strong><span>{billProForm.paymentMode || "Cash"}</span></li>
                                    </ul>
                                    <div className="add-desktop-actions">
                                        <button className="bg" onClick={resetBillProForm}>Clear</button>
                                        <button className="bs" onClick={doBillProSale}><ArrowUpCircle size={16} /> Save Invoice</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>}

                    {/* ═══ BILL PRO STICKERS ═══ */}
                    {pg === "bill-stickers" && <div className="fi add-compact stickers-page">
                        <div className="add-mobile-hero add-mobile-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div><div className="add-mobile-header-title">Sticker Printing</div></div>
                            </div>
                        </div>
                        <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2 style={{ color: "var(--t1)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>Sticker Printing</h2>
                                    <div style={{ color: "var(--t2)", fontSize: 13, marginTop: 4 }}>Create price stickers for chargers, headphones, accessories, and quick offline billing items.</div>
                                </div>
                                <div className="action-row add-desktop-only sticker-head-actions" style={{ marginTop: 0 }}>
                                    <button className="bg" onClick={resetBillProStickerForm}><RotateCcw size={16} /> Reset</button>
                                    <button className="bp" onClick={() => void printBillProSticker()}><Printer size={16} /> Print Sticker</button>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
                                <F l="Category" ic={Package}><select className="gs" value={billProStickerForm.category} onChange={e => setBillProStickerField("category", e.target.value)}>{BILL_PRO_CATEGORIES.map(option => <option key={option} value={option}>{option}</option>)}</select></F>
                                {isBillProMobileCategory(billProStickerForm.category) ? <>
                                    <F l="Brand" ic={Tag}><input className="gi" value={billProStickerForm.brand} onChange={e => setBillProStickerField("brand", e.target.value)} placeholder="Apple / Samsung / Vivo" /></F>
                                    <F l="Model" ic={Smartphone}><input className="gi" value={billProStickerForm.model} onChange={e => setBillProStickerField("model", e.target.value)} placeholder="iPhone 13 / Galaxy S24" /></F>
                                    <F l="IMEI 1" ic={Hash}><div className="add-input-shell"><input className="gi" value={billProStickerForm.imei} onChange={e => setBillProStickerField("imei", e.target.value)} placeholder="15-digit IMEI" style={{ fontFamily: "'Space Mono',monospace" }} inputMode="numeric" pattern="[0-9]*" /></div></F>
                                    <F l="IMEI 2" ic={Hash}><div className="add-input-shell"><input className="gi" value={billProStickerForm.imei2} onChange={e => setBillProStickerField("imei2", e.target.value)} placeholder="Optional second IMEI" style={{ fontFamily: "'Space Mono',monospace" }} inputMode="numeric" pattern="[0-9]*" /></div></F>
                                    <F l="Color" ic={Palette}><input className="gi" value={billProStickerForm.color} onChange={e => setBillProStickerField("color", e.target.value)} placeholder="Blue / Black / White" /></F>
                                    <F l="Condition" ic={Package}><select className="gs" value={billProStickerForm.condition} onChange={e => setBillProStickerField("condition", e.target.value)}>{CONDITIONS.map(option => <option key={option} value={option}>{option}</option>)}</select></F>
                                    <F l="RAM" ic={Zap}><input className="gi" value={billProStickerForm.ram} onChange={e => setBillProStickerField("ram", e.target.value)} placeholder="8GB" /></F>
                                    <F l="Storage" ic={HardDrive}><input className="gi" value={billProStickerForm.storage} onChange={e => setBillProStickerField("storage", e.target.value)} placeholder="128GB" /></F>
                                    <F l="Price" ic={IndianRupee}><input className="gi" type="number" value={billProStickerForm.price} onChange={e => setBillProStickerField("price", e.target.value)} placeholder="59999" /></F>
                                </> : <>
                                    <F l="Item Name" ic={Tag}><input className="gi" value={billProStickerForm.itemLabel} onChange={e => setBillProStickerField("itemLabel", e.target.value)} placeholder="Charger / Earbuds / Adapter" /></F>
                                    <F l="Code / Barcode Text" ic={QrCode}><input className="gi" value={billProStickerForm.code} onChange={e => setBillProStickerField("code", e.target.value)} placeholder="Optional sticker code" /></F>
                                    <F l="Price" ic={IndianRupee}><input className="gi" type="number" value={billProStickerForm.price} onChange={e => setBillProStickerField("price", e.target.value)} placeholder="599" /></F>
                                </>}
                                <F l="Copies" ic={Layers}><input className="gi" type="number" min="1" value={billProStickerForm.copies} onChange={e => setBillProStickerField("copies", e.target.value)} placeholder="1" /></F>
                            </div>
                        </div>
                        <div className="add-compact-card">
                            <div style={{ color: "var(--t1)", fontSize: 15, fontWeight: 700 }}>Sticker Preview Summary</div>
                            <div className="list-row" style={{ padding: "12px 0" }}><div className="list-row-title">Item</div><div className="list-row-value">{getTxItemLabel(billProStickerForm) || "Awaiting item name"}</div></div>
                            <div className="list-row" style={{ padding: "12px 0" }}><div className="list-row-title">Category</div><div className="list-row-value">{billProStickerForm.category || BILL_PRO_MOBILE_CATEGORY}</div></div>
                            <div className="list-row" style={{ padding: "12px 0" }}><div className="list-row-title">Identity</div><div className="list-row-value">{isBillProMobileCategory(billProStickerForm.category) ? (billProStickerForm.imei || "IMEI required") : (billProStickerForm.code || "No code")}</div></div>
                            <div className="list-row" style={{ padding: "12px 0" }}><div className="list-row-title">Copies</div><div className="list-row-value">{billProStickerForm.copies || "1"}</div></div>
                        </div>
                        <div className="sticker-bottom-bar add-desktop-only">
                            <button className="bg" onClick={resetBillProStickerForm}><RotateCcw size={16} /> Reset</button>
                            <button className="bp" onClick={() => void printBillProSticker()}><Printer size={16} /> Print Sticker</button>
                        </div>
                        <div className="add-mobile-actions add-mobile-only">
                            <button className="bg" onClick={resetBillProStickerForm}>Reset</button>
                            <button className="bp" onClick={() => void printBillProSticker()}>Print Sticker</button>
                        </div>
                    </div>}

                    {/* ═══ REPAIR ═══ */}
                    {pg === "repair" && !repairDetail && <div className="fi repair-lab">
                        <div className="repair-lab-hero">
                            <div className="repair-lab-top" style={{ justifyContent: "space-between" }}>
                                <div className="repair-lab-title">
                                    <div className="repair-lab-mark"><Wrench size={16} /></div>
                                    <div>
                                        <h1>Repair Queue</h1>
                                        <p>Manage active jobs and live service intake.</p>
                                    </div>
                                </div>
                                <button className="bp" onClick={() => openRepairForm()}><Plus size={16} /> New Job</button>
                            </div>
                            <div className="repair-lab-stats">
                                <div className="repair-lab-stat queue">
                                    <div className="repair-lab-stat-label">Queue</div>
                                    <div className="repair-lab-stat-value">{String(repairRecords.length).padStart(2, "0")}</div>
                                    <div className="repair-lab-stat-meta">Active tickets</div>
                                </div>
                                <div className="repair-lab-stat open">
                                    <div className="repair-lab-stat-label">Open</div>
                                    <div className="repair-lab-stat-value">{String(repairOpenCount).padStart(2, "0")}</div>
                                    <div className="repair-lab-stat-meta">In progress</div>
                                </div>
                                <div className="repair-lab-stat ready">
                                    <div className="repair-lab-stat-label">Ready</div>
                                    <div className="repair-lab-stat-value">{String(repairReadyCount).padStart(2, "0")}</div>
                                    <div className="repair-lab-stat-meta">Awaiting pickup</div>
                                </div>
                            </div>
                        </div>

                        <div className="repair-lab-controls">
                            <div className="repair-lab-searchbox"><Search size={16} /><input className="gi" placeholder="Search IMEI, customer, ticket" value={repairQuery} onChange={e => setRepairQuery(e.target.value)} /></div>
                            <div className="repair-lab-filters" role="tablist" aria-label="Repair status filter">
                                {["All Statuses", ...REPAIR_STATUSES].map(status => <button key={status} className={`repair-lab-filter-pill ${repairStatusFilter === status ? "active" : ""}`} onClick={() => setRepairStatusFilter(status)}><Filter size={13} /> {status === "All Statuses" ? "All" : status}</button>)}
                            </div>
                        </div>

                        <div className="repair-lab-list">
                            {filteredRepairRecords.length === 0 && <div className="repair-lab-empty"><Wrench size={36} style={{ color: "var(--text-3)", marginBottom: 10 }} /><div className="editor-title">{repairQuery.trim() ? "No matching repair jobs" : "No repair jobs yet"}</div><div className="editor-copy">{repairQuery.trim() ? "Try a different search term." : "Create your first repair entry to start tracking received devices."}</div></div>}
                            {filteredRepairRecords.map(repair => {
                                const repairTone = repair.status === "Ready" || repair.status === "Delivered" ? "repair-lab-card ready" : repair.status === "Cancelled" ? "repair-lab-card cancelled" : "repair-lab-card";
                                return <div key={repair.id} className={repairTone}>
                                    <div className="repair-lab-card-top">
                                        <div>
                                            <div className="repair-lab-card-title">{[repair.brand, repair.model].filter(Boolean).join(" ") || "Device"}</div>
                                            <div className="repair-lab-card-customer">{repair.customerName || "Walk-in Customer"}</div>
                                        </div>
                                        <div className="repair-lab-card-ref">#{repair.repairNo} | {fmtDate(repair.receivedDate)}</div>
                                    </div>

                                    <div className="repair-lab-card-body">
                                        <div className="repair-lab-card-copy">
                                            <span>{repair.imei ? `IMEI ${repair.imei}` : "IMEI --"}</span>
                                            <span className="problem"><strong>Problem</strong> <em>{repair.problem || "Not specified"}</em></span>
                                        </div>
                                        {repair.photos?.length > 0 ? <div className="repair-lab-card-media" onClick={() => sLb({ photos: repair.photos, si: 0 })} style={{ cursor: "pointer" }}><img src={getPhotoPreview(repair.photos[0])} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" /></div> : <div className="repair-lab-card-media"><Smartphone size={20} style={{ color: "#7f8aa3" }} /></div>}
                                    </div>

                                    <div className="repair-lab-card-footer">
                                        <div style={{ minWidth: 0 }}>
                                            <div className="repair-lab-card-finance"><strong>{fmtCurrency(repair.estimatedCost)}</strong><span>Est.</span><strong style={{ color: "#111827" }}>{fmtCurrency(repair.advance)}</strong><span>Adv.</span></div>
                                            <div className="repair-lab-card-statuses" style={{ marginTop: 8 }}>
                                                <select
                                                    className={`gs repair-status-select status-${String(repair.status || "Received").toLowerCase().replace(/\s+/g, "-")}`}
                                                    value={REPAIR_STATUSES.includes(repair.status) ? repair.status : "Received"}
                                                    onChange={e => void updateRepairStatus(repair, e.target.value)}
                                                    aria-label="Repair status"
                                                >
                                                    {REPAIR_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                                                </select>
                                                <select
                                                    className={`gs repair-status-select payment-${String(repair.paymentStatus || "Unpaid").toLowerCase().replace(/\s+/g, "-")}`}
                                                    value={REPAIR_PAYMENT_STATUSES.includes(repair.paymentStatus) ? repair.paymentStatus : "Unpaid"}
                                                    onChange={e => void updateRepairPaymentStatus(repair, e.target.value)}
                                                    aria-label="Repair payment status"
                                                >
                                                    {REPAIR_PAYMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="repair-lab-card-actions">
                                            <button className="repair-lab-icon-btn" onClick={() => setRepairDetail(repair)} title="View"><Eye size={16} /></button>
                                            <button className="repair-lab-icon-btn" onClick={() => openRepairForm(repair)} title="Edit"><ClipboardList size={16} /></button>
                                            <button className="repair-lab-icon-btn" onClick={() => void printRepairSticker(repair)} title="Sticker"><Printer size={16} /></button>
                                            <button className="repair-lab-msg-btn" onClick={() => whatsappRepairMessage(repair)} title="WhatsApp status update"><MessageCircle size={18} /></button>
                                        </div>
                                    </div>
                                </div>;
                            })}
                        </div>
                    </div>}

                    {pg === "repair" && repairDetail && <div className="fi">
                        <div className="repair-shell">
                            <div className="page-hero" style={{ alignItems: "center" }}>
                                <div>
                                    <h1 style={{ color: "#f4f7ff" }}>Repair Detail</h1>
                                    <p>{repairDetail.repairNo}</p>
                                </div>
                                <button className="bg" onClick={() => setRepairDetail(null)} style={repairButtonStyle}><ChevronLeft size={16} /> Back</button>
                            </div>
                            {repairDetail.photos?.length > 0 && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{repairDetail.photos.map((photo, index) => <div key={photo.id || index} style={{ width: 120, height: 120, borderRadius: 14, overflow: "hidden", cursor: "pointer" }} onClick={() => sLb({ photos: repairDetail.photos, si: index })}><img src={getPhotoPreview(photo)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>)}</div>}
                            <div className="repair-detail-grid">
                                {[{ l: "Customer", v: repairDetail.customerName || "—", ic: User }, { l: "Phone", v: repairDetail.phone || "—", ic: Phone }, { l: "Device", v: [repairDetail.brand, repairDetail.model].filter(Boolean).join(" ") || "—", ic: Smartphone }, { l: "Color", v: repairDetail.color || "—", ic: Palette }, { l: "IMEI", v: repairDetail.imei || "—", ic: Hash }, { l: "Status", v: repairDetail.status, ic: Tag }, { l: "Payment", v: repairDetail.paymentStatus || "Unpaid", ic: Banknote }, { l: "Estimate", v: fmtCurrency(repairDetail.estimatedCost), ic: IndianRupee }, { l: "Advance", v: fmtCurrency(repairDetail.advance), ic: Banknote }, { l: "Part Cost", v: fmtCurrency(repairDetail.partCost), ic: IndianRupee }, { l: "Part Supplier", v: getRepairPartSupplierLabel(repairDetail) || "—", ic: Package }, { l: "Received", v: fmtDate(repairDetail.receivedDate), ic: Calendar }].map((d, i) => <div key={i} className="repair-detail-tile"><div className="repair-detail-label">{d.l}</div><div className="repair-detail-value" style={{ display: "flex", gap: 8, alignItems: "center" }}><d.ic size={14} /> {d.v}</div></div>)}
                            </div>
                            <div className="editor-note dark">
                                <div className="editor-title">Problem Statement</div>
                                <div className="editor-copy" style={{ marginTop: 10 }}>{repairDetail.problem}</div>
                                {repairDetail.notes ? <div className="editor-subcopy" style={{ marginTop: 12 }}>Notes: {repairDetail.notes}</div> : null}
                            </div>
                            <div className="action-row"><button className="bp" onClick={() => openRepairForm(repairDetail)}><Edit2 size={16} /> Edit Repair</button><button className="bg" onClick={() => void printRepairSticker(repairDetail)} style={repairButtonStyle}><Printer size={16} /> Print Sticker</button><button className="bd" onClick={() => deleteRepair(repairDetail.id)}><Trash2 size={16} /> Delete</button></div>
                        </div>
                    </div>}

                    {pg === "repair-form" && <div className="fi add-compact">
                        <div className="desktop-workspace">
                            <div className="desktop-workspace-main">
                        <div className="add-compact-top add-desktop-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("repair")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">{repairForm.id ? "Edit Repair" : "New Repair Intake"}</div>
                                </div>
                            </div>
                            <div className="add-pos-chip"><ClipboardList size={14} /> Service workflow</div>
                        </div>

                        <div className="add-mobile-hero add-mobile-only">
                            <div className="add-mobile-top">
                                <button className="add-mobile-back" onClick={() => goPage("repair")} aria-label="Go back"><ChevronLeft size={28} /></button>
                                <div>
                                    <div className="add-mobile-header-title">{repairForm.id ? "Edit Repair" : "New Repair Intake"}</div>
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-card">
                            <div className="add-compact-head">
                                <div>
                                    <h2>Repair Intake</h2>
                                </div>
                            </div>

                            <div className="add-compact-form">
                                <div className="add-compact-field span-2 photos">
                                    <div className="add-compact-label">Device Photos</div>
                                    <PhotoUp photos={repairForm.photos || []} onChange={photos => setRepairField("photos", photos)} max={4} onCameraNeeded={releaseCameraNow} />
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Customer Name</div>
                                    <div className="add-input-shell"><input className="gi" value={repairForm.customerName} onChange={e => setRepairField("customerName", e.target.value)} placeholder="Customer name" /></div>
                                </div>

                                <div className="add-compact-field">
                                    <div className="add-compact-label">Phone</div>
                                    <div className="add-input-shell"><input className="gi" value={repairForm.phone} onChange={e => setRepairField("phone", cleanMobileNumber(e.target.value))} placeholder="Phone number" /></div>
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Brand &amp; Model</div>
                                    <div className="add-compact-brand-row">
                                        <div className="add-input-shell"><select className="gs" value={repairForm.brand} onChange={e => setRepairField("brand", e.target.value)}>{BRANDS.map(brand => <option key={brand}>{brand}</option>)}</select></div>
                                        <div className="add-input-shell"><input className="gi" value={repairForm.model} onChange={e => setRepairField("model", e.target.value)} placeholder="Model" /></div>
                                    </div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Color</div>
                                        <div className="add-input-shell"><input className="gi" value={repairForm.color} onChange={e => setRepairField("color", e.target.value)} placeholder="Color" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Status</div>
                                        <div className="add-input-shell"><select className="gs" value={repairForm.status} onChange={e => setRepairField("status", e.target.value)}>{REPAIR_STATUSES.map(status => <option key={status}>{status}</option>)}</select></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Received Date</div>
                                        <div className="add-input-shell"><input className="gi" type="date" value={repairForm.receivedDate} onChange={e => setRepairField("receivedDate", e.target.value)} /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">IMEI</div>
                                        <div className="add-input-shell"><input className="gi" value={repairForm.imei} onChange={e => setRepairField("imei", e.target.value)} placeholder="Optional" style={{ fontFamily: "'Space Mono',monospace" }} /></div>
                                    </div>
                                </div>

                                <div className="add-compact-mini-grid">
                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Estimated Cost</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={repairForm.estimatedCost} onChange={e => setRepairField("estimatedCost", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Advance</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={repairForm.advance} onChange={e => setRepairField("advance", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Part Cost</div>
                                        <div className="add-input-shell"><input className="gi" type="number" value={repairForm.partCost} onChange={e => setRepairField("partCost", e.target.value)} placeholder="₹0" /></div>
                                    </div>

                                    <div className="add-compact-field mini">
                                        <div className="add-compact-label">Part Supplier</div>
                                        <div className="add-input-shell"><select className="gs" value={repairForm.partSupplierId} onChange={e => { const supplier = partSuppliersById.get(e.target.value); setRepairField("partSupplierId", e.target.value); setRepairField("partSupplierName", supplier?.name || ""); }}><option value="">Select supplier</option>{partSuppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
                                    </div>
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Problem</div>
                                    <textarea className="gi" style={{ minHeight: 96 }} value={repairForm.problem} onChange={e => setRepairField("problem", e.target.value)} placeholder="Describe the reported problem, issue, or required repair" />
                                </div>

                                <div className="add-compact-field span-2">
                                    <div className="add-compact-label">Notes</div>
                                    <textarea className="gi" style={{ minHeight: 84 }} value={repairForm.notes} onChange={e => setRepairField("notes", e.target.value)} placeholder="Internal notes" />
                                </div>
                            </div>
                        </div>

                        <div className="add-compact-actions add-desktop-only repair-form-actions desktop-inline-actions">
                            <button className="bg" onClick={() => { setRepairForm(createEmptyRepairForm()); goPage("repair"); }}><ChevronLeft size={16} /> Back to Repair</button>
                            <button className="bp" onClick={saveRepair}><CheckCircle size={16} /> {repairForm.id ? "Save Repair" : "Add Repair"}</button>
                        </div>

                        <div className="add-mobile-actions add-mobile-only repair-form-actions">
                            <button className="bg" onClick={() => { setRepairForm(createEmptyRepairForm()); goPage("repair"); }}>Back</button>
                            <button className="bp" onClick={saveRepair}>{repairForm.id ? "Save Repair" : "Add Repair"}</button>
                        </div>
                            </div>
                            <aside className="desktop-workspace-side desktop-enhanced-only">
                                <div className="desktop-side-card dark">
                                    <div className="desktop-side-eyebrow">Repair Intake</div>
                                    <div className="desktop-side-title">Repair Summary</div>
                                    <div className="desktop-side-grid">
                                        {repairDesktopSummary.map(item => <div key={item.label} className="desktop-side-stat"><span>{item.label}</span><strong>{item.value}</strong></div>)}
                                    </div>
                                </div>
                                <div className="desktop-side-card">
                                    <div className="desktop-side-eyebrow">Service Status</div>
                                    <ul className="desktop-side-list">
                                        <li><strong>Customer</strong><span>{repairForm.customerName || "Walk-in customer"}</span></li>
                                        <li><strong>Phone</strong><span>{repairForm.phone || "Not added"}</span></li>
                                        <li><strong>Status</strong><span>{repairForm.status || "Received"}</span></li>
                                        <li><strong>Part supplier</strong><span>{repairForm.partSupplierName || "Not linked"}</span></li>
                                    </ul>
                                    <div className="repair-form-actions">
                                        <button className="bg" onClick={() => { setRepairForm(createEmptyRepairForm()); goPage("repair"); }}><ChevronLeft size={16} /> Back to Repair</button>
                                        <button className="bp" onClick={saveRepair}><CheckCircle size={16} /> {repairForm.id ? "Save Repair" : "Add Repair"}</button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>}

                    {pg === "parts" && <div className="fi" style={{ maxWidth: 980 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}><div><h1 style={{ color: "var(--t1)", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}><Package size={28} style={{ color: "var(--a2)" }} /> Parts</h1><p style={{ color: "var(--t3)", fontSize: 14, marginTop: 4 }}>Track suppliers and part value from linked repair jobs.</p></div><button className="bp" onClick={() => openPartSupplierSheet()}><Plus size={16} /> Add Supplier</button></div>
                        <div className="parts-stats">
                            {[{ l: "Suppliers", v: partSuppliers.length, s: "active", c: "var(--a2)" }, { l: "Parts Value", v: fmtCurrency(repairPartsTotal), s: `${repairs.filter(repair => repair.partCost > 0).length} linked`, c: "var(--warn)" }, { l: "Income", v: fmtCurrency(repairValueTotal), s: "repair totals", c: "var(--a)" }, { l: "Net Profit", v: fmtCurrency(repairNetProfit), s: "paid only", c: "var(--ok)" }].map(card => <div key={card.l} className="gc parts-stat-card"><div style={{ color: "var(--t3)", fontSize: 10, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>{card.l}</div><div style={{ color: card.c, fontSize: 22, fontWeight: 700, lineHeight: 1.05 }}>{card.v}</div><div style={{ color: "var(--t3)", fontSize: 11, marginTop: 4 }}>{card.s}</div></div>)}
                        </div>
                        <div className="gc" style={{ marginBottom: 14, padding: 14 }}>
                            <div style={{ position: "relative" }}><Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--t3)" }} /><input className="gi" placeholder="Search supplier, phone, address..." value={partsQuery} onChange={e => setPartsQuery(e.target.value)} style={{ paddingLeft: 36 }} /></div>
                        </div>
                        <div style={{ display: "grid", gap: 12 }}>
                            {partsSupplierRows.length === 0 && <div className="gc" style={{ textAlign: "center", padding: 32 }}><Package size={36} style={{ color: "var(--t3)", marginBottom: 10 }} /><p style={{ color: "var(--t2)", fontSize: 15 }}>{partsQuery.trim() ? "No matching suppliers" : "No part suppliers yet"}</p><p style={{ color: "var(--t3)", fontSize: 13, marginTop: 4 }}>{partsQuery.trim() ? "Try a different search term." : "Add suppliers to start linking part costs with repair jobs."}</p><div className="action-row" style={{ justifyContent: "center", marginTop: 14 }}><button className="bp" onClick={() => openPartSupplierSheet()}><Plus size={16} /> Add Supplier</button></div></div>}
                            {partsSupplierRows.map(supplier => <div key={supplier.id} className="gc" style={{ display: "grid", gap: 8, padding: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                                    <div><div style={{ color: "var(--t1)", fontSize: 15, fontWeight: 700 }}>{supplier.name}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>{supplier.phone || "No phone"}{supplier.address ? ` · ${supplier.address}` : ""}</div></div>
                                    <div style={{ textAlign: "right" }}><div style={{ color: "var(--warn)", fontSize: 17, fontWeight: 700 }}>{fmtCurrency(supplier.totalValue)}</div><div style={{ color: "var(--t3)", fontSize: 11, marginTop: 4 }}>{supplier.repairsCount} linked repair{supplier.repairsCount !== 1 ? "s" : ""}</div></div>
                                </div>
                                {supplier.notes && <div style={{ color: "var(--t2)", fontSize: 12.5, lineHeight: 1.6 }}>{supplier.notes}</div>}
                                <div className="action-row" style={{ marginTop: 0 }}><button className="bg" onClick={() => editPartSupplier(supplier)}><Edit2 size={16} /> Edit</button><button className="bd" onClick={() => void deletePartSupplier(supplier)} disabled={partsSaveBusy}><Trash2 size={16} /> Delete</button>{supplier.lastDateTime ? <span style={{ color: "var(--t3)", fontSize: 12, alignSelf: "center" }}>Last linked {fmtDateTime(supplier.lastDateTime)}</span> : null}</div>
                            </div>)}
                        </div>
                    </div>}

                    {showPartSupplierSheet && pg === "parts" && <div className="so fi parts-sheet-wrap"><div className="gc parts-sheet">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                            <div><div style={{ color: "var(--t1)", fontSize: 18, fontWeight: 700 }}>{partSupplierForm.id ? "Edit Supplier" : "Add Supplier"}</div><div style={{ color: "var(--t3)", fontSize: 12, marginTop: 4 }}>Suppliers are shared across Repair Pro and linked to repair jobs.</div></div>
                            <button className="bg" onClick={closePartSupplierSheet} style={{ padding: 8, minWidth: 36, minHeight: 36, justifyContent: "center" }}><X size={16} /></button>
                        </div>
                        <div style={{ display: "grid", gap: 12 }}>
                            <F l="Supplier Name" ic={Package}><input className="gi" value={partSupplierForm.name} onChange={e => setPartSupplierField("name", e.target.value)} placeholder="Supplier name" /></F>
                            <F l="Phone" ic={Phone}><input className="gi" value={partSupplierForm.phone} onChange={e => setPartSupplierField("phone", e.target.value)} placeholder="Phone number" /></F>
                            <F l="Address" ic={MapPin}><input className="gi" value={partSupplierForm.address} onChange={e => setPartSupplierField("address", e.target.value)} placeholder="Address" /></F>
                            <F l="Notes" ic={FileText}><textarea className="gi" style={{ minHeight: 88 }} value={partSupplierForm.notes} onChange={e => setPartSupplierField("notes", e.target.value)} placeholder="Optional notes" /></F>
                        </div>
                        <div className="action-row"><button className="bp" onClick={() => void savePartSupplier()} disabled={partsSaveBusy}>{partsSaveBusy ? "Saving..." : partSupplierForm.id ? "Save Supplier" : "Add Supplier"}</button><button className="bg" onClick={closePartSupplierSheet}>Cancel</button></div>
                    </div></div>}

                    {/* ═══ INVOICES ═══ */}
                    {pg === "transactions" && <div className="fi invoices-modern">
                        <div className="transactions-desktop-head desktop-enhanced-only">
                            <div className="transactions-desktop-copy">
                                <h1>Sales History</h1>
                                <p>Review and manage past transactions across walk-in customers, invoices, and pending balances.</p>
                            </div>
                            <div className="transactions-desktop-actions">
                                <label className="invoices-searchbar transactions-desktop-search">
                                    <Search size={17} />
                                    <input className="gi" placeholder="Search invoice, customer, phone or device..." value={iq} onChange={e => sIq(e.target.value)} />
                                </label>
                                <button className="dashboard-action-ghost" onClick={exportTransactionsCsv}><Download size={16} /> Export CSV</button>
                                <button className="dashboard-action-primary" onClick={() => { setReportView("Transactions"); setReportType("Sell"); goPage("reports"); }}><Printer size={16} /> Print Report</button>
                            </div>
                        </div>

                        <div className="transactions-summary-grid desktop-enhanced-only">
                            <div className="transactions-summary-card"><span>Total Sales</span><strong>{fmtCompactCurrency(invoiceSummary.totalAmount)}</strong><em>{invoiceRecords.length} invoice{invoiceRecords.length === 1 ? "" : "s"}</em></div>
                            <div className="transactions-summary-card"><span>Outstanding</span><strong>{fmtCompactCurrency(invoiceSummary.dueAmount)}</strong><em>{invoiceSummary.dueAmount > 0 ? "Requires collection" : "All dues cleared"}</em></div>
                            <div className="transactions-summary-card"><span>GST Collected</span><strong>{fmtCompactCurrency(invoiceSummary.gstAmount)}</strong><em>Calculated from GST invoices only</em></div>
                            <div className="transactions-summary-card"><span>Returns</span><strong>{invoiceSummary.returnedCount}</strong><em>{fmtCompactCurrency(invoiceSummary.refundAmount)} refunded</em></div>
                        </div>

                        <div className="transactions-desktop-table desktop-enhanced-only">
                            <div className="transactions-table-head"><span>Invoice</span><span>Customer & Device</span><span>Amount</span><span>Status</span><span>Payment</span><span style={{ textAlign: "right" }}>Actions</span></div>
                            {invoiceRecords.length === 0 ? <div className="reports-modern-empty">No invoices found.</div> : null}
                            {invoiceRecords.map(t => {
                                const dueOpen = Number(t.dueAmount || 0) > 0;
                                const returned = isSaleReturned(t);
                                const returnInvoice = returned ? getReturnForSale(t) : null;
                                return <div key={`desktop-sale-${t.id}`} data-invoice-id={t.id} className={`transactions-table-row ${lastSavedInvoiceId === t.id ? "invoice-flash" : ""}`}>
                                    <div className="transactions-table-cell"><strong>{t.invoiceNo || "INV"}</strong><span>{fmtDashboardTime(t.dateTime || `${t.date || isoDate()}T12:00:00`)}</span></div>
                                    <div className="transactions-table-cell"><strong>{t.customerName || "Walk-in Customer"}</strong><span>{getTxItemLabel(t)}{t.phone ? ` · ${t.phone}` : ""}</span></div>
                                    <div className="transactions-table-amount">{fmtCurrency(t.totalAmount || t.amount)}</div>
                                    <div><span className={`dashboard-status-pill ${returned || dueOpen ? "pending" : ""}`}>{returned ? "Returned" : dueOpen ? "Pending" : "Paid"}</span></div>
                                    <div className="transactions-table-cell"><strong>{t.paymentMode || "Cash"}</strong><span>{t.billType === "GST" ? "GST Invoice" : "Regular Invoice"}</span>{t.paymentMode === "EMI" && !returned ? <button className="table-action-btn" style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".02em" }} onClick={() => markInvoiceSettled(t)} disabled={(t.financeSettlement || "Pending") === "Settled"} title="Mark finance settled">{(t.financeSettlement || "Pending") === "Settled" ? "Settled" : "Mark Settled"}</button> : null}</div>
                                    <div className="transactions-table-actions">
                                        <button className="table-action-btn" onClick={() => void openInvoicePreview(t)} disabled={previewBusy} aria-label="View invoice" title="View invoice"><Eye size={15} /></button>
                                        {appMode === "general" ? <button className="table-action-btn" onClick={() => openReturnModal(t)} disabled={returned} aria-label="Return item"><ArchiveRestore size={15} /></button> : null}
                                        {returnInvoice ? <button className="table-action-btn" onClick={() => void shareInvoice(returnInvoice)} aria-label="Share return invoice PDF" title="Share return invoice"><FileText size={15} /></button> : null}
                                        {returnInvoice ? <button className="table-action-btn primary" onClick={() => void downloadInvoice(returnInvoice)} aria-label="Download return invoice PDF" title="Download return invoice"><Download size={15} /></button> : null}
                                        <button className="table-action-btn" onClick={() => void shareInvoice(t)} aria-label="Share PDF"><Share2 size={15} /></button>
                                        <button className="table-action-btn" onClick={() => whatsappMessage(t)} aria-label="WhatsApp Message"><MessageCircle size={15} /></button>
                                        <button className="table-action-btn primary" onClick={() => void downloadInvoice(t)} aria-label="Download PDF"><Download size={15} /></button>
                                    </div>
                                </div>;
                            })}
                        </div>

                        <div className="transactions-mobile-stack">
                            <div className="invoices-toolbar">
                                <label className="invoices-searchbar">
                                    <Search size={16} />
                                    <input className="gi" placeholder="Search invoices or customer..." value={iq} onChange={e => sIq(e.target.value)} />
                                </label>
                                <button
                                    className="invoices-filter-btn"
                                    onClick={() => setInvoiceStatusFilter(current => current === "All" ? "Paid" : current === "Paid" ? "Due" : current === "Due" ? "Returned" : "All")}
                                    aria-label={`Invoice filter ${invoiceStatusFilter}`}
                                    title={`Filter: ${invoiceStatusFilter}`}
                                >
                                    <Filter size={16} />
                                </button>
                            </div>

                            <div className="invoices-ledger">
                                <div className="invoices-table-head desktop-enhanced-only"><span>Invoice</span><span>Customer & Device</span><span>Status</span><span style={{ textAlign: "right" }}>Actions</span></div>
                                {invoiceRecords.length === 0 && <div className="gc" style={{ textAlign: "center", padding: 30, border: "none", boxShadow: "none" }}><FileText size={36} style={{ color: "var(--t3)", marginBottom: 10 }} /><p style={{ color: "var(--t2)", fontSize: 14 }}>No invoices found</p></div>}
                                {invoiceRecords.map(t => {
                                    const shortDate = new Date(t.dateTime || `${t.date || isoDate()}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                                    const dueOpen = Number(t.dueAmount || 0) > 0;
                                    const returned = isSaleReturned(t);
                                    const returnInvoice = returned ? getReturnForSale(t) : null;
                                    return <div key={t.id} data-invoice-id={t.id} className={`invoice-row ${lastSavedInvoiceId === t.id ? "invoice-flash" : ""}`}>
                                        <div className="invoice-row-top">
                                            <div className="invoice-row-id">
                                                <strong>{t.invoiceNo || "INV"}</strong>
                                                <span>{shortDate}</span>
                                            </div>
                                            <span className={`invoice-row-status ${returned || dueOpen ? "due" : "paid"}`}>{returned ? "RETURNED" : dueOpen ? "DUE" : "PAID"}</span>
                                        </div>
                                        <div className="invoice-row-customer">{t.customerName || "Walk-in Customer"}</div>
                                        <div className="invoice-row-item"><Smartphone size={13} /> {getTxItemLabel(t)}</div>
                                        {t.paymentMode === "EMI" && !returned ? <div style={{ marginTop: 6 }}><button className="bs" style={{ fontSize: 11, padding: "5px 12px", borderRadius: 10 }} onClick={() => markInvoiceSettled(t)} disabled={(t.financeSettlement || "Pending") === "Settled"}>{(t.financeSettlement || "Pending") === "Settled" ? "Finance Settled" : "Mark Settled"}</button></div> : null}
                                        <div className="invoice-row-foot">
                                            <strong className="invoice-row-amount">{fmtCurrency(t.totalAmount || t.amount)}</strong>
                                            <div className="invoice-row-actions">
                                            <button className="invoice-row-icon icon-view" onClick={() => void openInvoicePreview(t)} disabled={previewBusy} aria-label="View invoice" title="View invoice"><Eye size={14} /></button>
                                                {appMode === "general" ? <button className="invoice-row-icon" onClick={() => openReturnModal(t)} disabled={returned} aria-label="Return item" title="Return item"><ArchiveRestore size={14} /></button> : null}
                                                {returnInvoice ? <button className="invoice-row-icon icon-share" onClick={() => void shareInvoice(returnInvoice)} aria-label="Share return invoice PDF" title="Share return invoice"><FileText size={14} /></button> : null}
                                                {returnInvoice ? <button className="invoice-row-icon icon-download" onClick={() => void downloadInvoice(returnInvoice)} aria-label="Download return invoice PDF" title="Download return invoice"><Download size={14} /></button> : null}
                                                <button className="invoice-row-icon icon-share" onClick={() => void shareInvoice(t)} aria-label="Share PDF" title="Share PDF"><Share2 size={14} /></button>
                                                <button className="invoice-row-icon icon-msg" onClick={() => whatsappMessage(t)} aria-label="WhatsApp Message" title="WhatsApp Message"><MessageCircle size={14} /></button>
                                                <button className="invoice-row-icon icon-download" onClick={() => void downloadInvoice(t)} aria-label="Download PDF" title="Download PDF"><Download size={14} /></button>
                                            </div>
                                        </div>
                                    </div>;
                                })}
                            </div>

                            {invoiceRecords.length > 0 ? <div className="invoices-end">END OF HISTORY</div> : null}
                        </div>
                    </div>}

                    {/* ═══ REPORTS ═══ */}
                    {pg === "reports" && <div className="fi reports-modern">
                        <div className="reports-modern-top">
                            <div className="reports-modern-head">
                                <h1>Reports</h1>
                                <p>{reportView} · {reportType} · {reportRange.label}</p>
                            </div>
                            <div className="reports-modern-actions">
                                <button className="bp" onClick={() => void downloadReport()}><Download size={14} /> PDF</button>
                                <button className="bg" onClick={() => void previewReportPdf(false)}><Eye size={14} /> Open</button>
                                <button className="bg" onClick={() => void previewReportPdf(true)}><Printer size={14} /> Print</button>
                            </div>
                        </div>

                        <div className="reports-modern-controls">
                            <div className="reports-modern-control"><BarChart3 size={14} /><select className="gs" value={reportView} onChange={e => setReportView(e.target.value)}>{REPORT_VIEWS.map(type => <option key={type}>{type}</option>)}</select></div>
                            <div className="reports-modern-control"><FileText size={14} /><select className="gs" value={reportType} onChange={e => setReportType(e.target.value)}>{REPORT_TYPES.map(type => <option key={type}>{type}</option>)}</select></div>
                            <div className="reports-modern-control"><Calendar size={14} /><select className="gs" value={reportPreset} onChange={e => setReportPreset(e.target.value)}>{REPORT_RANGE_PRESETS.map(type => <option key={type}>{type}</option>)}</select></div>
                            <div className="reports-modern-control"><Hash size={14} /><select className="gs" value={reportBillFilter} onChange={e => setReportBillFilter(e.target.value)} disabled={reportType === "Buy" || reportType === "Add" || reportType === "Repair" || reportView !== "Transactions"}>{REPORT_BILL_FILTERS.map(type => <option key={type}>{type}</option>)}</select></div>
                            <div className="reports-modern-control"><CreditCard size={14} /><select className="gs" value={reportPaymentFilter} onChange={e => setReportPaymentFilter(e.target.value)}>{["All Payments", ...PAYMENT_MODES].map(type => <option key={type}>{type}</option>)}</select></div>
                            <div className="reports-modern-control"><Banknote size={14} /><select className="gs" value={reportDueFilter} onChange={e => setReportDueFilter(e.target.value)} disabled={reportView === "Supplier Summary" || (reportType !== "All" && reportType !== "Sell" && reportType !== "Repair")}>{REPORT_DUE_FILTERS.map(type => <option key={type}>{type}</option>)}</select></div>
                        </div>

                        {reportPreset === "Custom" && <div className="reports-modern-dates">
                            <div className="reports-modern-control"><Calendar size={14} /><input className="gi" type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></div>
                            <div className="reports-modern-control"><Calendar size={14} /><input className="gi" type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} /></div>
                        </div>}

                        {reportFiltersLabel ? <div className="reports-modern-filter-note">Filters: {reportFiltersLabel}</div> : null}

                        <details className="reports-modern-morefilters">
                            <summary>More Filters</summary>
                            <div className="reports-modern-controls">
                                <div className="reports-modern-control"><Tag size={14} /><select className="gs" value={reportBrandFilter} onChange={e => setReportBrandFilter(e.target.value)}>{reportBrands.map(type => <option key={type}>{type}</option>)}</select></div>
                                <div className="reports-modern-control"><Wrench size={14} /><select className="gs" value={reportRepairStatusFilter} onChange={e => setReportRepairStatusFilter(e.target.value)} disabled={reportView !== "Transactions" || (reportType !== "All" && reportType !== "Repair")}>{["All Repair Statuses", ...REPAIR_STATUSES].map(type => <option key={type}>{type}</option>)}</select></div>
                                <div className="reports-modern-control"><Search size={14} /><input className="gi" value={reportPartyQuery} onChange={e => setReportPartyQuery(e.target.value)} placeholder="Customer / supplier" /></div>
                                <div className="reports-modern-control"><Package size={14} /><input className="gi" value={reportItemQuery} onChange={e => setReportItemQuery(e.target.value)} placeholder="Brand / model / IMEI" /></div>
                            </div>
                        </details>

                        <div className="reports-modern-kpis">
                            {[
                                { label: "Records", value: String(activeReportSummary.records), tone: "" },
                                { label: reportView === "Supplier Summary" ? "Purchases" : "Sales", value: fmtCurrency(reportView === "Supplier Summary" ? activeReportSummary.buyAddTotal : activeReportSummary.sellTotal), tone: "sales" },
                                { label: "Due", value: fmtCurrency(activeReportSummary.dueTotal || 0), tone: "warn" },
                                { label: "Profit", value: fmtCurrency(activeReportSummary.profit || 0), tone: "ok" },
                            ].map(card => <div key={card.label} className="reports-modern-kpi"><div className="reports-modern-kpi-label">{card.label}</div><div className={`reports-modern-kpi-value ${card.tone}`.trim()}>{card.value}</div></div>)}
                        </div>

                        <div className="reports-modern-feed mobile-preview">
                            <div className="reports-modern-feed-head"><strong>Recent Entries</strong><span>{activeReportRows.length} total</span></div>
                            {activeReportRows.length === 0 && <div className="reports-modern-empty">No records found for this range.</div>}
                            {activeReportRows.slice(0, 3).map(row => <div key={row.id} className="reports-modern-row">
                                <span className={`reports-modern-type ${String(row.type || "").toLowerCase()}`}>{row.type}</span>
                                <div className="reports-modern-row-main">
                                    <strong>{row.item || row.label}</strong>
                                    <span>{row.party || "-"} · {fmtDateTime(row.lastDateTime || row.dateTime)}{reportView !== "Transactions" ? ` · ${row.records} records` : ""}</span>
                                </div>
                                <strong className="reports-modern-amt">{fmtCurrency(row.amount || 0)}</strong>
                            </div>)}
                            {activeReportRows.length > 3 ? <div className="reports-modern-more">+ {activeReportRows.length - 3} more rows in PDF export</div> : null}
                        </div>
                        <div className="reports-modern-desktop-table desktop-enhanced-only">
                            <div className="reports-modern-desktop-head"><span>Type</span><span>Item</span><span>Party</span><span>Last Updated</span><span style={{ textAlign: "right" }}>Amount</span></div>
                            {activeReportRows.length === 0 ? <div className="reports-modern-empty">No records found for this range.</div> : null}
                            {activeReportRows.slice(0, 12).map(row => <div key={row.id} className="reports-modern-desktop-row">
                                <span className={`reports-modern-type ${String(row.type || "").toLowerCase()}`}>{row.type}</span>
                                <div><strong>{row.item || row.label}</strong><span>{reportView !== "Transactions" ? `${row.records} records` : "Detailed transaction record"}</span></div>
                                <span>{row.party || "-"}</span>
                                <span>{fmtDateTime(row.lastDateTime || row.dateTime)}</span>
                                <strong style={{ textAlign: "right" }}>{fmtCurrency(row.amount || 0)}</strong>
                            </div>)}
                        </div>
                    </div>}

                    {/* ═══ SELLER ═══ */}
                    {/* seller tools removed — keys are issued from PC via issue-key.js */}

                    {/* ═══ SETTINGS ═══ */}
                    {pg === "settings" && <div className={`fi settings-shell ${showSettingsHub ? "settings-shell-home" : ""}`} style={{ maxWidth: 1240 }}>
                        {showSettingsHub ? <div className="settings-terminal">
                            <div className="settings-terminal-head">
                                {!isDesktopViewport ? <button className="add-mobile-back" onClick={() => goPage("dashboard")} aria-label="Back to dashboard" style={{ marginBottom: 4 }}><ChevronLeft size={28} /></button> : null}
                                <h1>Settings Hub</h1>
                            </div>
                            <div className="settings-home-content">
                                <div className="settings-terminal-grid">
                                <button className={`settings-terminal-card profile ${settingsOpenSection === "shop-profile" ? "active" : ""}`} onClick={() => setSettingsOpenSection(current => current === "shop-profile" ? "" : "shop-profile")}>
                                    <span className="settings-terminal-icon"><Smartphone size={20} /></span>
                                    <div>
                                        <h3>Shop Profile</h3>
                                        <p>Name, GST, Address</p>
                                    </div>
                                </button>
                                <button className={`settings-terminal-card invoice ${settingsOpenSection === "invoice-preferences" ? "active" : ""}`} onClick={() => setSettingsOpenSection(current => current === "invoice-preferences" ? "" : "invoice-preferences")}>
                                    <span className="settings-terminal-icon"><FileText size={20} /></span>
                                    <div>
                                        <h3>Invoicing</h3>
                                        <p>Prefix, Footer, Rules</p>
                                    </div>
                                </button>
                                <button className={`settings-terminal-card status ${settingsOpenSection === "app-status" ? "active" : ""}`} onClick={() => setSettingsOpenSection(current => current === "app-status" ? "" : "app-status")}>
                                    <span className="settings-terminal-icon"><CheckCircle size={20} /></span>
                                    <div>
                                        <h3>App Status</h3>
                                        <p>{appMode === "bill-pro" ? "Offline activation active" : (syncReady ? `Synced ${fmtRelativeTime(syncMeta.lastRemoteSavedAt || syncCfg.lastSyncAt || syncCfg.lastStatusAt || "")}` : "Waiting for sync")}</p>
                                    </div>
                                </button>
                                </div>
                            <div className="settings-terminal-actions">
                                {shopProfileDirty ? <span className="page-chip"><AlertCircle size={14} /> Unsaved changes</span> : <span style={{ color: "var(--t3)", fontSize: 12, fontWeight: 700 }}>All settings saved</span>}
                                <div className="settings-terminal-cta">
                                    <button className="bp settings-terminal-btn save" onClick={() => void saveShopProfile()} disabled={profileSaveBusy}>{profileSaveBusy ? "Saving..." : "Save"}</button>
                                    <button className="bg settings-terminal-btn signout" onClick={logoutShop}><LogOut size={15} /> {shopSession?.isBillPro ? "Close Bill Pro" : "Sign out"}</button>
                                </div>
                            </div>
                            </div>
                        </div> : <div className="settings-detail-screen">
                            <div className="settings-desktop-layout">
                                <aside className="settings-desktop-nav desktop-enhanced-only">
                                    {desktopSettingsSections.map(section => <button key={section.id} className={activeSettingsSection === section.id ? "active" : ""} onClick={() => setSettingsOpenSection(section.id)}><strong>{section.title}</strong><span>{section.subtitle}</span></button>)}
                                </aside>
                                <div>
                            <div className="settings-detail-head">
                                {!isDesktopViewport ? <button className="bg settings-detail-back" onClick={() => setSettingsOpenSection("")}><ChevronLeft size={16} /> Back</button> : null}
                                <div className="settings-detail-copy">
                                    <h2>{settingsScreenMeta.title}</h2>
                                    <p>{settingsScreenMeta.subtitle}</p>
                                </div>
                            </div>
                        {["shop-profile", "invoice-preferences"].includes(activeSettingsSection) ? <div className="settings-grid" style={{ marginBottom: 16 }}>
                            {activeSettingsSection === "shop-profile" ? <SettingsSection
                                title="Shop Profile & Invoice Logo"
                                summary={shopProfileDirty ? "Unsaved changes" : (shopCfg.shopName || "Shop details and invoice branding")}
                                open={activeSettingsSection === "shop-profile"}
                                onToggle={() => setSettingsOpenSection(current => current === "shop-profile" ? "" : "shop-profile")}
                            >
                                <div style={{ display: "grid", gap: 12 }}>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "nowrap" }}>
                                        <div style={{ width: 78, height: 78, flex: "0 0 auto", borderRadius: 16, overflow: "hidden", border: "1px solid var(--gbo)", background: "var(--surface-low)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {shopCfg.logoData ? <img src={shopCfg.logoData} alt="Shop invoice logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Smartphone size={30} style={{ color: "var(--t3)" }} />}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 auto", minWidth: 0 }}>
                                            <button className="bg" onClick={() => logoInputRef.current?.click()}><Upload size={16} /> Upload Shop Logo</button>
                                            {shopCfg.logoData && <button className="bg" onClick={() => setShopField("logoData", "")}><Trash2 size={16} /> Remove Shop Logo</button>}
                                        </div>
                                        <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoPick} />
                                    </div>
                                    <div className="action-row">{shopProfileDirty ? <span style={{ color: "var(--warn)", fontSize: 12, alignSelf: "center" }}>Unsaved changes</span> : null}</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                        <F l="Shop Name" ic={Smartphone}><input className="gi" value={shopCfg.shopName} onChange={e => setShopField("shopName", e.target.value)} placeholder="PhoneDukaan" /></F>
                                        <F l="Owner Name" ic={User}><input className="gi" value={shopCfg.ownerName || ""} onChange={e => setShopField("ownerName", e.target.value)} placeholder="Owner full name" /></F>
                                        <F l="Address" ic={Home}><textarea className="gi" style={{ minHeight: 84 }} value={shopCfg.address} onChange={e => setShopField("address", e.target.value)} placeholder="Street / market / building" /></F>
                                        <F l="Location" ic={MapPin}><input className="gi" value={shopCfg.location} onChange={e => setShopField("location", e.target.value)} placeholder="City, district, landmark" /></F>
                                        <F l="Phone" ic={Phone}><input className="gi" value={shopCfg.phone} onChange={e => setShopField("phone", e.target.value)} placeholder="Shop phone" /></F>
                                        <F l="Email" ic={Mail}><input className="gi" value={shopCfg.email} onChange={e => setShopField("email", e.target.value)} placeholder="shop@email.com" /></F>
                                        <F l="GSTIN" ic={Hash}><input className="gi" value={shopCfg.gstin} onChange={e => setShopField("gstin", e.target.value)} placeholder="22AAAAA0000A1Z5" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                        <F l="State / Code" ic={MapPin}><div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 8 }}><input className="gi" value={shopCfg.state} onChange={e => setShopField("state", e.target.value)} placeholder="State" /><input className="gi" value={shopCfg.stateCode} onChange={e => setShopField("stateCode", e.target.value)} placeholder="Code" /></div></F>
                                    </div>
                                    <div className="shop-profile-sticky-save"><button className="bp" onClick={() => void saveShopProfile()} disabled={profileSaveBusy}>{profileSaveBusy ? "Saving..." : "Save Shop Profile"}</button></div>
                                </div>
                            </SettingsSection> : null}
                            {activeSettingsSection === "invoice-preferences" ? <SettingsSection
                                title="Invoice Preferences"
                                summary={`${shopCfg.defaultBillType || "NON GST"} · GST ${shopCfg.defaultGstRate || 0}% · ${shopCfg.invoicePrefix || "INV"}`}
                                open={activeSettingsSection === "invoice-preferences"}
                                onToggle={() => setSettingsOpenSection(current => current === "invoice-preferences" ? "" : "invoice-preferences")}
                            >
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                                    <F l="Invoice Prefix" ic={Hash}><input className="gi" value={shopCfg.invoicePrefix} onChange={e => setShopField("invoicePrefix", e.target.value)} placeholder="INV" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                    <F l="Default Bill Type" ic={FileText}><select className="gs" value={shopCfg.defaultBillType} onChange={e => setShopField("defaultBillType", e.target.value)}>{BILL_TYPES.map(type => <option key={type}>{type}</option>)}</select></F>
                                    <F l="Default GST Rate %" ic={IndianRupee}><input className="gi" type="number" step="0.01" value={shopCfg.defaultGstRate} onChange={e => setShopField("defaultGstRate", e.target.value)} placeholder="18" /></F>
                                    <F l="HSN/SAC Code" ic={Hash}><input className="gi" value={shopCfg.hsnCode} onChange={e => setShopField("hsnCode", e.target.value)} placeholder="8517" style={{ fontFamily: "'Space Mono',monospace" }} /></F>
                                    <F l="Show Price on Sticker" ic={Printer}><label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={shopCfg.stickerShowPrice} onChange={e => setShopField("stickerShowPrice", e.target.checked)} /><span>{shopCfg.stickerShowPrice ? "Yes — sell price shown on sticker" : "No — price hidden on sticker"}</span></label></F>
                                    <div style={{ gridColumn: "1 / -1" }}><F l="Invoice Layout" ic={FileText}>
                                        <div className="theme-picker-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
                                            <button type="button" className={`theme-choice-card ${(shopCfg.invoiceLayout || "vertical") === "vertical" ? "active" : ""}`} onClick={() => setShopField("invoiceLayout", "vertical")}>
                                                <div className="theme-choice-top"><div className="theme-choice-swatches"><span className="theme-choice-swatch" style={{ width: 14, background: "var(--a)" }} /><span className="theme-choice-swatch" style={{ width: 22, background: "var(--a)", opacity: .5 }} /></div><span className="theme-choice-check">{(shopCfg.invoiceLayout || "vertical") === "vertical" ? <CheckCircle size={16} /> : null}</span></div>
                                                <div><strong>Vertical (A4 portrait)</strong><span>Full-page bill — the classic</span></div>
                                            </button>
                                            <button type="button" className={`theme-choice-card ${shopCfg.invoiceLayout === "horizontal" ? "active" : ""}`} onClick={() => setShopField("invoiceLayout", "horizontal")}>
                                                <div className="theme-choice-top"><div className="theme-choice-swatches"><span className="theme-choice-swatch" style={{ width: 30, background: "var(--a)" }} /></div><span className="theme-choice-check">{shopCfg.invoiceLayout === "horizontal" ? <CheckCircle size={16} /> : null}</span></div>
                                                <div><strong>Horizontal (A4 landscape)</strong><span>Compact wide bill covering the top half</span></div>
                                            </button>
                                        </div>
                                        <div style={{ marginTop: 8, color: "var(--t3)", fontSize: 12 }}>The invoice preview also has a one-tap Vertical/Horizontal switch, so you can flip any single bill without changing the default.</div>
                                    </F></div>
                                    <div style={{ gridColumn: "1 / -1" }}><F l="Warranty Note Languages" ic={FileText}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
                                            {WARRANTY_NOTE_LANGS.map(lang => {
                                                const active = (shopCfg.warrantyLangs || []).includes(lang.id);
                                                return <label key={lang.id} className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                                    <input type="checkbox" checked={active} onChange={e => {
                                                        const cur = Array.isArray(shopCfg.warrantyLangs) ? [...shopCfg.warrantyLangs] : [];
                                                        const next = e.target.checked ? [...cur, lang.id] : cur.filter(id => id !== lang.id);
                                                        setShopField("warrantyLangs", next);
                                                    }} />
                                                    <span>{lang.label}</span>
                                                </label>;
                                            })}
                                        </div>
                                        <div style={{ marginTop: 8, color: "var(--t3)", fontSize: 12 }}>Every sale bill prints the warranty-service line in English plus the languages ticked here (up to 5; keep 2–3 for a tidy bill). Tick none to print only English.</div>
                                    </F></div>
                                    <div style={{ gridColumn: "1 / -1" }}><F l="Invoice Theme" ic={Palette}>
                                        <div className="theme-picker-grid">
                                            {INVOICE_THEMES.map(t => {
                                                const active = (shopCfg.invoiceTheme || DEFAULT_INVOICE_THEME_ID) === t.id;
                                                return <button key={t.id} type="button" className={`theme-choice-card ${active ? "active" : ""}`} onClick={() => setShopField("invoiceTheme", t.id)}>
                                                    <div className="theme-choice-top">
                                                        <div className="theme-choice-swatches">{[t.palette.accent, t.palette.gold, t.palette.bgAlt].map((color, ci) => <span key={ci} className="theme-choice-swatch" style={{ background: `rgb(${color.join(",")})` }} />)}</div>
                                                        <span className="theme-choice-check">{active ? <CheckCircle size={16} /> : null}</span>
                                                    </div>
                                                    <div><strong>{t.name}</strong><span>{t.header === "band" ? "Banner" : t.header === "split" ? "Split" : "Minimal"} · {t.border === "double" ? "Double edge" : t.border === "single" ? "Single edge" : "No edge"}</span></div>
                                                </button>;
                                            })}
                                            <button key="custom" type="button" className={`theme-choice-card ${shopCfg.invoiceTheme === CUSTOM_THEME_ID ? "active" : ""}`} onClick={() => setShopField("invoiceTheme", CUSTOM_THEME_ID)}>
                                                <div className="theme-choice-top">
                                                    <div className="theme-choice-swatches">{[[13, 83, 216], [180, 140, 60], [235, 239, 244]].map((color, ci) => <span key={ci} className="theme-choice-swatch" style={{ background: `rgb(${color.join(",")})` }} />)}</div>
                                                    <span className="theme-choice-check">{shopCfg.invoiceTheme === CUSTOM_THEME_ID ? <CheckCircle size={16} /> : null}</span>
                                                </div>
                                                <div><strong>Custom</strong><span>Your color</span></div>
                                            </button>
                                        </div>
                                        <div className="gc" style={{ marginTop: 12, ...settingsSoftPanelStyle }}>
                                            <div style={{ display: "grid", gap: 12 }}>
                                                {shopCfg.invoiceTheme === CUSTOM_THEME_ID ? <F l="Accent Color" ic={Palette}><label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="color" value={(shopCfg.invoiceCustom && shopCfg.invoiceCustom.accent) || "#16365c"} onChange={e => setShopField("invoiceCustom", { ...normalizeInvoiceCustom(shopCfg.invoiceCustom), accent: e.target.value })} style={{ width: 44, height: 32, padding: 2, border: "none", background: "transparent", cursor: "pointer" }} /><span>{(shopCfg.invoiceCustom && shopCfg.invoiceCustom.accent) || "#16365c"}</span></label></F> : null}
                                                <F l="Logo Watermark" ic={FileText}><label className="gi" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}><input type="checkbox" checked={(shopCfg.invoiceCustom || {}).watermark !== false} onChange={e => setShopField("invoiceCustom", { ...normalizeInvoiceCustom(shopCfg.invoiceCustom), watermark: e.target.checked })} /><span>{(shopCfg.invoiceCustom || {}).watermark !== false ? "Shop logo shows faint behind the bill" : "No watermark"}</span></label></F>
                                                {(shopCfg.invoiceCustom || {}).watermark !== false ? <F l={`Watermark Opacity ${Math.round(((shopCfg.invoiceCustom || {}).watermarkOpacity ?? 0.08) * 100)}%`} ic={FileText}><input type="range" min="4" max="15" value={Math.round(((shopCfg.invoiceCustom || {}).watermarkOpacity ?? 0.08) * 100)} onChange={e => setShopField("invoiceCustom", { ...normalizeInvoiceCustom(shopCfg.invoiceCustom), watermarkOpacity: Number(e.target.value) / 100 })} style={{ width: "100%", accentColor: "var(--a)" }} /></F> : null}
                                                {!shopCfg.logoData ? <div style={{ color: "var(--warn)", fontSize: 12, lineHeight: 1.6 }}>Add a shop logo in Shop Profile to use the watermark.</div> : null}
                                            </div>
                                        </div>
                                    </F></div>

                                    <F l="Footer Note" ic={FileText}><textarea className="gi" style={{ minHeight: 84 }} value={shopCfg.footer} onChange={e => setShopField("footer", e.target.value)} placeholder="Thank you note / declaration" /></F>
                                    <F l="Terms & Warranty" ic={FileText}><textarea className="gi" style={{ minHeight: 84 }} value={shopCfg.terms} onChange={e => setShopField("terms", e.target.value)} placeholder="Service / warranty / return terms" /></F>
                                </div>
                            </SettingsSection> : null}

                        </div> : null}
                        {activeSettingsSection === "app-status" ? <SettingsSection
                            title={appMode === "bill-pro" ? "Activation Status" : "Sync Status"}
                            summary={`${ol ? "Online" : "Offline"} · ${syncStateLabel}`}
                            open={true}
                            onToggle={() => { }}
                        >
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 16 }}>
                            <div className="gc" style={settingsSoftPanelStyle}><h3 style={{ color: "var(--t1)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{appMode === "bill-pro" ? "Activation Status" : "Sync Status"}</h3>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {appMode === "bill-pro" ? <>
                                        <div className="settings-mini-card"><strong>Connection</strong><span style={{ color: ol ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{ol ? "Online" : "Offline"} · Local device storage</span></div>
                                        <div className="settings-mini-card"><strong>Activation</strong><span style={{ color: "var(--ok)", fontWeight: 600 }}>Licence key verified</span><span style={{ color: "var(--t3)", fontWeight: 500 }}>{billProDeviceId}</span></div>
                                        <div className="settings-mini-card"><strong>Issued At</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{shopSession?.activation?.issuedAt ? fmtDateTime(shopSession.activation.issuedAt) : "Stored locally"}</span></div>
                                        <div className="settings-mini-card"><strong>Sticker Mode</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>Generic offline stickers ready</span></div>
                                    </> : <>
                                        <div className="settings-mini-card"><strong>Connection</strong><span style={{ color: ol ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{ol ? "Online" : "Offline"} · {syncReady ? "Connected" : "Waiting for setup"}</span></div>
                                        <div className="settings-mini-card"><strong>Sync State</strong><span style={{ color: syncMeta.syncState === "error" ? "var(--err)" : syncMeta.syncState === "offline" ? "var(--warn)" : "var(--t2)", fontWeight: 600 }}>{syncStateLabel}{syncMeta.pendingSync ? " · pending changes" : ""}</span></div>
                                        <div className="settings-mini-card"><strong>Last Status</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{sanitizeStatus(syncCfg.lastStatus)}</span></div>
                                        <div className="settings-mini-card"><strong>Last Remote Update</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{syncMeta.lastRemoteSavedAt ? fmtDateTime(syncMeta.lastRemoteSavedAt) : "Never"}</span></div>
                                        <div className="settings-mini-card"><strong>Live Updates</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{syncCfg.autoSync ? "Watching for new changes" : "Paused on this device"}</span></div>
                                    </>}
                                </div>
                            </div>

                        </div>
                        </SettingsSection> : null}
                        {activeSettingsSection === "app-status" ? <SettingsSection
                            title="Bills & Backup"
                            summary="Invoice PDFs are saved outside the app"
                            open={true}
                            onToggle={() => { }}
                            style={{ marginBottom: 16 }}
                        >
                            <div className="settings-mini-grid">
                                <div className="settings-mini-card"><strong>PDFs Saved</strong><span style={{ color: "var(--ok)", fontWeight: 600 }}>{tx.filter(item => item.pdfFileName).length} invoice{tx.filter(item => item.pdfFileName).length === 1 ? "" : "s"}</span></div>
                                <div className="settings-mini-card"><strong>Save Location</strong><span style={{ color: "var(--t1)", fontWeight: 600 }}>{billsStorage?.folderName || "Downloads folder"}</span></div>
                                <div className="settings-mini-card"><strong>App Storage</strong><span style={{ color: "var(--t1)", fontWeight: 600 }}>{billsStorage?.supported ? `${fmtBytes(billsStorage.usage)} of ${fmtBytes(billsStorage.quota)}` : "Not reported by this browser"}</span></div>
                                <div className="settings-mini-card"><strong>Storage Protection</strong><span style={{ color: billsStorage?.persisted ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{billsStorage?.persisted ? "Protected from cleanup" : "Not yet protected"}</span></div>
                            </div>
                            <div className="action-row" style={{ marginTop: 10 }}>
                                <button className="bp" onClick={() => void exportBillsBackup()}><Download size={16} /> Export backup (CSV)</button>
                                <button className="bg" onClick={() => billsBackupInputRef.current?.click()}><ArchiveRestore size={16} /> Restore backup</button>
                                {isDirectoryPickerSupported() ? (billsStorage?.folderName
                                    ? <button className="bg" onClick={() => void handleUseDownloadsFolder()}>Use Downloads</button>
                                    : <button className="bg" onClick={() => void handleChooseBillsFolder()}>Choose bill folder</button>) : null}
                            </div>
                            <input ref={billsBackupInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={e => void handleBillsBackupFile(e)} />
                            <div style={{ marginTop: 10, color: "var(--t3)", fontSize: 13, lineHeight: 1.6 }}>
                                Every bill PDF is written to your phone's storage, so deleting the app never removes an invoice. The backup CSV holds your bills and shop profile so you can restore them after a reinstall.
                            </div>
                        </SettingsSection> : null}
                        {activeSettingsSection === "app-status" ? <SettingsSection
                            title="Google Drive Backup"
                            summary="One Google account keeps every device in sync"
                            open={true}
                            onToggle={() => { }}
                            style={{ marginBottom: 16 }}
                        >
                            <div className="settings-mini-grid">
                                <div className="settings-mini-card"><strong>Status</strong><span style={{ color: driveCfg.connected ? "var(--ok)" : "var(--warn)", fontWeight: 600 }}>{driveCfg.connected ? (driveCfg.accountEmail ? `Connected as ${driveCfg.accountEmail}` : "Connected") : "Not connected"}</span></div>
                                <div className="settings-mini-card"><strong>Last Backup</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{driveCfg.lastPushAt ? fmtDateTime(driveCfg.lastPushAt) : "Never"}</span></div>
                                <div className="settings-mini-card"><strong>Drive Folder</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{DRIVE_FOLDER_NAME}</span>{driveCfg.folderId ? <a href={`https://drive.google.com/drive/folders/${driveCfg.folderId}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>Open in Drive</a> : null}</div>
                                <div className="settings-mini-card"><strong>Auto Backup</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{driveCfg.autoBackup ? "After every save (about 15s)" : "Off. Manual only"}</span></div>
                                <div className="settings-mini-card"><strong>Last Drive Check</strong><span style={{ color: "var(--t2)", fontWeight: 600 }}>{driveCfg.lastPullAt ? fmtDateTime(driveCfg.lastPullAt) : "Never"}</span></div>
                                <div className="settings-mini-card"><strong>Note</strong><span style={{ color: driveCfg.lastError ? "var(--err)" : "var(--t2)", fontWeight: 600 }}>{driveCfg.lastError || driveCfg.lastStatus}</span></div>
                            </div>
                            <div className="action-row" style={{ marginTop: 10 }}>
                                {driveCfg.connected ? <>
                                    <button className="bp" onClick={() => void pushDriveBackup("manual")} disabled={!!driveBusy}><Upload size={16} /> {driveBusy === "backup" ? "Backing up…" : "Back up now"}</button>
                                    <button className="bp" onClick={() => void pullDriveBackup("manual")} disabled={!!driveBusy}><RefreshCw size={16} /> {driveBusy === "pull" ? "Restoring…" : "Restore and merge"}</button>
                                    <button className="bg" onClick={() => toggleDriveAutoBackup()} disabled={!!driveBusy}>{driveCfg.autoBackup ? "Pause auto backup" : "Resume auto backup"}</button>
                                    <button className="bg" onClick={() => void disconnectDrive()} disabled={!!driveBusy}><X size={16} /> Disconnect</button>
                                </> : <button className="bp auth-submit" onClick={() => void connectDrive()} disabled={!!driveBusy}>{driveBusy === "connect" ? "Connecting…" : "Connect Google account"}</button>}
                            </div>
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <label style={{ color: "var(--t2)", fontSize: 13, fontWeight: 600 }} htmlFor="pd-device-series">Billing device series</label>
                                <input
                                    id="pd-device-series"
                                    className="auth-field"
                                    style={{ width: 70, textAlign: "center", textTransform: "uppercase", fontFamily: "'Space Mono',monospace" }}
                                    value={deviceSeriesDraft}
                                    maxLength={1}
                                    onChange={e => setDeviceSeriesDraft(normalizeDeviceSeries(e.target.value))}
                                    placeholder="A"
                                    aria-label="Billing device series letter"
                                />
                                <button className="bg" onClick={() => saveDeviceSeries()} disabled={!!driveBusy}>Save series</button>
                                <span style={{ color: "var(--t3)", fontSize: 12 }}>Invoices look like: {effectiveShopCfg.invoicePrefix}-{deviceSeriesDraft || "S"}-{yymmFor()}-0001</span>
                            </div>
                            <div style={{ marginTop: 10, color: "var(--t3)", fontSize: 13, lineHeight: 1.6 }}>
                                Connect once with your shop's Google account. Every bill and stock change is backed up to the {DRIVE_FOLDER_NAME} folder in Drive about 15 seconds after you save. Open this app on another phone or the PC app, connect the same account, and your old data comes back automatically. Give each billing device its own series letter above, so invoice numbers never clash.
                            </div>
                        </SettingsSection> : null}
                                </div>
                            </div>
                        </div>}
                    </div>}

                </div>

                {previewInvoice && <div className="so fi" style={{ zIndex: 998 }} onClick={closeInvoicePreview}><div className="invoice-preview-sheet" onClick={e => e.stopPropagation()}>
                    <div className="invoice-preview-head">
                        <div><strong>{previewInvoice.sale?.invoiceNo || "INV"}</strong><span>Invoice preview — check before printing</span></div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button className={previewEffectiveLayout === "vertical" ? "bd" : "bg"} onClick={() => void flipPreviewLayout("vertical")} disabled={previewBusy} aria-label="Vertical layout" style={{ padding: "7px 12px", fontSize: 12 }}>Vertical</button>
                            <button className={previewEffectiveLayout === "horizontal" ? "bd" : "bg"} onClick={() => void flipPreviewLayout("horizontal")} disabled={previewBusy} aria-label="Horizontal layout" style={{ padding: "7px 12px", fontSize: 12 }}>Horizontal</button>
                            <button className="bg" onClick={closeInvoicePreview} aria-label="Close preview" style={{ minWidth: 40, justifyContent: "center" }}><X size={16} /></button>
                        </div>
                    </div>
                    <div className="invoice-preview-body"><iframe src={previewInvoice.url} title={`Invoice ${previewInvoice.sale?.invoiceNo || ""} preview`} /></div>
                    <div className="invoice-preview-actions">
                        <button className="bp" onClick={printPreviewInvoice}><Printer size={16} /> Print</button>
                        <button className="bg" onClick={() => void downloadInvoice(previewInvoice.sale, previewEffectiveLayout)}><Download size={16} /> Download</button>
                        <button className="bg" onClick={() => void shareInvoice(previewInvoice.sale, previewEffectiveLayout)}><Share2 size={16} /> Share</button>
                    </div>
                </div></div>}

                {returnTarget && <div className="so fi" style={{ zIndex: 999 }}><div style={{ background: "var(--c)", borderRadius: 18, padding: 24, maxWidth: 460, width: "92vw", border: "1px solid var(--gbo)", boxShadow: "var(--shadow-lg)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(245,158,11,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}><ArchiveRestore size={22} color="var(--warn)" /></div>
                        <div>
                            <h3 style={{ color: "var(--t1)", fontSize: 18, fontWeight: 800, margin: 0 }}>Return Item</h3>
                            <p style={{ color: "var(--t3)", fontSize: 12, margin: "4px 0 0" }}>Full item return will restore stock and create a return transaction.</p>
                        </div>
                    </div>
                    <div className="gc" style={{ marginBottom: 14, background: "var(--surface-low)", border: "1px solid rgba(198,197,212,.16)" }}>
                        <div className="list-row" style={{ padding: "8px 0" }}><div className="list-row-title">Invoice</div><div className="list-row-value">{returnTarget.invoiceNo || "INV"}</div></div>
                        <div className="list-row" style={{ padding: "8px 0" }}><div className="list-row-title">Device</div><div className="list-row-value">{getTxItemLabel(returnTarget)}</div></div>
                        <div className="list-row" style={{ padding: "8px 0" }}><div className="list-row-title">IMEI</div><div className="list-row-value" style={{ fontFamily: "'Space Mono',monospace", fontSize: 12 }}>{returnTarget.imei || "-"}</div></div>
                        <div className="list-row" style={{ padding: "8px 0" }}><div className="list-row-title">Original Total</div><div className="list-row-value">{fmtCurrency(returnTarget.totalAmount || returnTarget.amount)}</div></div>
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                        <F l="Refund Amount" ic={IndianRupee}><input className="gi" type="number" value={returnForm.refundAmount} onChange={e => setReturnForm(current => ({ ...current, refundAmount: e.target.value }))} placeholder="0" /></F>
                        <F l="Refund Mode" ic={Banknote}><select className="gs" value={returnForm.refundMode} onChange={e => setReturnForm(current => ({ ...current, refundMode: e.target.value }))}>{PAYMENT_MODES.map(mode => <option key={mode}>{mode}</option>)}</select></F>
                        <F l="Return Reason" ic={FileText}><textarea className="gi" style={{ minHeight: 80 }} value={returnForm.reason} onChange={e => setReturnForm(current => ({ ...current, reason: e.target.value }))} placeholder="Customer return reason / condition notes" /></F>
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                        <button className="bg" style={{ padding: "10px 18px" }} onClick={closeReturnModal} disabled={returnBusy}>Cancel</button>
                        <button className="bd" style={{ padding: "10px 18px" }} onClick={() => void confirmReturn()} disabled={returnBusy}>{returnBusy ? "Returning..." : "Confirm Return"}</button>
                    </div>
                </div></div>}

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

                {lb && <LB photos={lb.photos} si={lb.si} onClose={() => sLb(null)} />}
            </div></div></>
    );
}
