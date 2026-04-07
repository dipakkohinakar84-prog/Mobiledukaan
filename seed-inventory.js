import PocketBase from 'pocketbase';
import { Blob } from 'buffer';

const PB_URL = String(process.env.PB_URL || '').trim();
const LOGIN_ID = String(process.env.PB_LOGIN_ID || '').trim();
const PASSWORD = String(process.env.PB_PASSWORD || '').trim();

if (!PB_URL || !LOGIN_ID || !PASSWORD) {
  console.error('Missing PB_URL, PB_LOGIN_ID, or PB_PASSWORD environment variables.');
  process.exit(1);
}

// Real phone images from pngimg.com (transparent PNGs) and freebiehive.com
const BRAND_IMAGES = {
  Samsung: [
    'https://freebiehive.com/wp-content/uploads/2024/01/Samsung-Galaxy-S24-Ultra-PNG.jpg',
    'https://freebiehive.com/wp-content/uploads/2025/01/Samsung-S25-Ultra-PNG.jpg',
  ],
  Apple: [
    'https://freebiehive.com/wp-content/uploads/2024/09/Apple-Iphone-16-Pro-Max-PNG.jpg',
    'https://pngimg.com/d/iphone16_PNG112450.png',
    'https://pngimg.com/d/iphone16_PNG112445.png',
    'https://pngimg.com/d/iphone16_PNG112440.png',
  ],
  OnePlus: [
    'https://pngimg.com/d/smartphone_PNG101507.png',
    'https://pngimg.com/d/smartphone_PNG101502.png',
  ],
  Xiaomi: [
    'https://pngimg.com/d/smartphone_PNG101506.png',
    'https://pngimg.com/d/smartphone_PNG101497.png',
  ],
  Vivo: [
    'https://pngimg.com/d/smartphone_PNG101505.png',
    'https://pngimg.com/d/smartphone_PNG101496.png',
  ],
  Oppo: [
    'https://pngimg.com/d/smartphone_PNG101504.png',
    'https://pngimg.com/d/smartphone_PNG101495.png',
  ],
  Realme: [
    'https://pngimg.com/d/smartphone_PNG101503.png',
    'https://pngimg.com/d/smartphone_PNG101494.png',
  ],
  Motorola: [
    'https://pngimg.com/d/smartphone_PNG101501.png',
    'https://pngimg.com/d/smartphone_PNG101493.png',
  ],
  Nothing: [
    'https://pngimg.com/d/smartphone_PNG101500.png',
    'https://pngimg.com/d/smartphone_PNG101492.png',
  ],
  Google: [
    'https://pngimg.com/d/smartphone_PNG101499.png',
    'https://pngimg.com/d/smartphone_PNG101491.png',
  ],
  iQOO: [
    'https://pngimg.com/d/smartphone_PNG101498.png',
    'https://pngimg.com/d/smartphone_PNG101490.png',
  ],
  Poco: [
    'https://pngimg.com/d/smartphone_PNG8501.png',
    'https://pngimg.com/d/smartphone_PNG8519.png',
  ],
  Other: [
    'https://pngimg.com/d/smartphone_PNG8514.png',
    'https://pngimg.com/d/smartphone_PNG8510.png',
  ],
};

const BRANDS = {
  Samsung: {
    models: ['Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S23 FE', 'Galaxy Z Fold 6', 'Galaxy Z Flip 6', 'Galaxy A55', 'Galaxy A35', 'Galaxy M55'],
    colors: ['Titanium Black', 'Titanium Gray', 'Titanium Violet', 'Cream', 'Navy'],
    priceRange: { New: [25000, 135000], Refurbished: [18000, 95000], Used: [12000, 80000] },
  },
  Apple: {
    models: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15', 'iPhone 14', 'iPhone SE (3rd Gen)'],
    colors: ['Desert Titanium', 'Natural Titanium', 'White Titanium', 'Black', 'Blue', 'Pink'],
    priceRange: { New: [49900, 159900], Refurbished: [35000, 120000], Used: [25000, 95000] },
  },
  OnePlus: {
    models: ['13', '13R', '12', 'Nord 4', 'Nord CE 4', 'Open'],
    colors: ['Midnight Ocean', 'Arctic Dawn', 'Emerald Dusk', 'Black'],
    priceRange: { New: [24999, 69999], Refurbished: [18000, 50000], Used: [12000, 40000] },
  },
  Xiaomi: {
    models: ['14 Ultra', '14', '14 Civi', 'Redmi Note 13 Pro+', 'Redmi Note 13', 'Redmi 13C'],
    colors: ['White', 'Black', 'Green', 'Lavender Purple'],
    priceRange: { New: [11999, 79999], Refurbished: [8000, 55000], Used: [5000, 40000] },
  },
  Vivo: {
    models: ['X200 Pro', 'X200', 'V40', 'V40 Pro', 'T3', 'Y300'],
    colors: ['Cosmos Black', 'Natural Green', 'Titanium Silver', 'Blue'],
    priceRange: { New: [18999, 69999], Refurbished: [14000, 50000], Used: [9000, 35000] },
  },
  Oppo: {
    models: ['Find X7 Ultra', 'Find N3 Flip', 'Reno 12 Pro', 'Reno 12', 'A3 Pro', 'A3'],
    colors: ['Rock Grey', 'Sunset Gold', 'Ocean Blue', 'Black'],
    priceRange: { New: [15999, 79999], Refurbished: [11000, 55000], Used: [8000, 40000] },
  },
  Realme: {
    models: ['GT 6', 'GT 6T', 'Narzo 70 Pro', 'Narzo 70', '12 Pro+', 'C67'],
    colors: ['Fluid Silver', 'Razor Green', 'Dark Purple', 'Gold'],
    priceRange: { New: [9999, 40999], Refurbished: [7000, 28000], Used: [5000, 22000] },
  },
  Motorola: {
    models: ['Edge 50 Ultra', 'Edge 50 Pro', 'Edge 50 Fusion', 'Razr 50 Ultra', 'G85', 'G64'],
    colors: ['Forest Grey', 'Luxe Lavender', 'Peach Fuzz', 'Black'],
    priceRange: { New: [12999, 54999], Refurbished: [9000, 38000], Used: [6000, 28000] },
  },
  Nothing: {
    models: ['Phone (2a) Plus', 'Phone (2a)', 'Phone (2)', 'Phone (1)'],
    colors: ['White', 'Black', 'Grey'],
    priceRange: { New: [19999, 44999], Refurbished: [15000, 32000], Used: [10000, 25000] },
  },
  Google: {
    models: ['Pixel 9 Pro XL', 'Pixel 9 Pro', 'Pixel 9', 'Pixel 8a', 'Pixel 8'],
    colors: ['Obsidian', 'Porcelain', 'Hazel', 'Bay'],
    priceRange: { New: [39999, 109999], Refurbished: [28000, 75000], Used: [20000, 55000] },
  },
  iQOO: {
    models: ['13', '12', 'Neo 9 Pro', 'Neo 7 Pro', 'Z9 Turbo', 'Z9'],
    colors: ['Legend', 'Alpha', 'Neon Green', 'Black'],
    priceRange: { New: [19999, 59999], Refurbished: [14000, 42000], Used: [10000, 32000] },
  },
  Poco: {
    models: ['F6 Pro', 'F6', 'X6 Pro', 'X6', 'M6 Pro', 'C65'],
    colors: ['Black', 'Green', 'Yellow', 'White'],
    priceRange: { New: [9999, 34999], Refurbished: [7000, 24000], Used: [5000, 18000] },
  },
  Other: {
    models: ['Tecno Phantom V Fold', 'Tecno Camon 30', 'Infinix GT 20 Pro', 'Lava Blaze Pro'],
    colors: ['Black', 'Silver', 'Blue'],
    priceRange: { New: [8999, 29999], Refurbished: [6000, 20000], Used: [4000, 15000] },
  },
};

const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
const RAM_OPTIONS = ['4GB', '6GB', '8GB', '12GB', '16GB'];
const CONDITIONS = ['New', 'Refurbished', 'Used'];
const SUPPLIERS = [
  'Galaxy Distributors', 'Apple Authorized', 'OP Direct', 'Mi Store', 'SecondHand Hub',
  'Walk-in', 'PhoneWale', 'MobiTech Wholesale', 'Digital India Traders', 'Sharma Electronics',
  'Patel Mobile Hub', 'Quick Mobile', 'TechZone Distributors', 'Mobile Mandi', 'Gadget World',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateImei(index) {
  const base = '35' + String(1000000000000 + index * 7919 + randomInt(0, 999)).slice(0, 13);
  return base.slice(0, 15).padEnd(15, '0');
}

function randomDate(daysBack = 30) {
  const now = Date.now();
  const offset = randomInt(0, daysBack) * 86400000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

// Download an image and return as a File-like Blob
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  return { buffer, contentType, ext };
}

// Pre-download one image per brand and cache it
async function downloadBrandImages() {
  const cache = {};
  const brandNames = Object.keys(BRAND_IMAGES);

  console.log('Downloading phone images for each brand...');
  for (const brand of brandNames) {
    const urls = BRAND_IMAGES[brand];
    let downloaded = false;
    for (const url of urls) {
      try {
        const img = await downloadImage(url);
        cache[brand] = img;
        console.log(`  [OK] ${brand}: downloaded (${(img.buffer.length / 1024).toFixed(0)} KB)`);
        downloaded = true;
        break;
      } catch (err) {
        console.warn(`  [SKIP] ${brand}: ${url} failed - ${err.message}`);
      }
    }
    if (!downloaded) {
      console.warn(`  [MISS] ${brand}: no image available, will skip photo upload`);
    }
  }
  return cache;
}

function generatePhones(count) {
  const phones = [];
  const brandNames = Object.keys(BRANDS);

  for (let i = 0; i < count; i++) {
    const condition = CONDITIONS[i % 3];
    const brandName = brandNames[i % brandNames.length];
    const brand = BRANDS[brandName];
    const model = pick(brand.models);
    const color = pick(brand.colors);
    const storage = pick(STORAGE_OPTIONS);
    const ram = pick(RAM_OPTIONS);
    const [minPrice, maxPrice] = brand.priceRange[condition];
    const buyPrice = randomInt(minPrice, maxPrice);
    const sellPrice = buyPrice + randomInt(1000, Math.round(buyPrice * 0.15));
    const batteryHealth = condition === 'New' ? '100%' : `${randomInt(65, 95)}%`;
    const addedDate = randomDate(30);
    const supplier = pick(SUPPLIERS);
    const isSold = Math.random() < 0.1;

    phones.push({
      imei: generateImei(i),
      brand: brandName,
      model,
      color,
      ram,
      storage,
      batteryHealth,
      condition,
      buyPrice,
      sellPrice,
      status: isSold ? 'Sold' : 'In Stock',
      qty: isSold ? 0 : 1,
      addedDate,
      supplier,
      sellerName: '',
      sellerPhone: '',
      sellerAadhaarNumber: '',
      purchaseDate: addedDate,
      warrantyType: condition === 'New' ? '1 Year Brand Warranty' : 'No Warranty',
      warrantyMonths: condition === 'New' ? 12 : 0,
      sellerAgreementAccepted: false,
      customerName: isSold ? `Customer ${i}` : '',
      customerPhone: isSold ? `9${randomInt(100000000, 999999999)}` : '',
      soldDate: isSold ? randomDate(10) : '',
      lastInvoiceNo: '',
      deletedAt: '',
    });
  }

  return phones;
}

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  console.log(`Logging in as "${LOGIN_ID}"...`);
  const auth = await pb.collection('shop_users').authWithPassword(LOGIN_ID, PASSWORD);
  const shopRecordId = auth.record?.shop;
  if (!shopRecordId) {
    console.error('ERROR: No shop linked to this user.');
    process.exit(1);
  }
  console.log(`Authenticated. Shop record ID: ${shopRecordId}\n`);

  // Step 1: Download images
  const imageCache = await downloadBrandImages();
  console.log(`\nImages cached for ${Object.keys(imageCache).length} brands.\n`);

  // Step 2: Generate and insert phones
  const phones = generatePhones(100);
  console.log(`Generated ${phones.length} phones. Inserting into PocketBase...\n`);

  let invSuccess = 0;
  let invFailed = 0;
  let photoSuccess = 0;
  let photoFailed = 0;

  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    try {
      // Create inventory record
      const record = await pb.collection('inventory').create({
        shop: shopRecordId,
        ...phone,
      });
      invSuccess++;

      // Upload photo if we have an image for this brand
      const img = imageCache[phone.brand];
      if (img) {
        try {
          const photoId = `seed-photo-${Date.now()}-${i}`;
          const fileName = `${phone.brand}-${phone.model}-${i}.${img.ext}`.replace(/[^a-zA-Z0-9._-]/g, '-');
          const file = new File([img.buffer], fileName, { type: img.contentType });
          const form = new FormData();
          form.append('shop', shopRecordId);
          form.append('photoId', photoId);
          form.append('inventoryItem', record.id);
          form.append('uploadedAt', new Date().toISOString());
          form.append('file', file);
          await pb.collection('photos').create(form);
          photoSuccess++;
        } catch (photoErr) {
          photoFailed++;
          if (i === 0) console.warn(`  Photo upload error: ${photoErr?.message || photoErr}`);
        }
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  Progress: ${i + 1}/100 phones | ${photoSuccess} photos uploaded`);
      }
    } catch (err) {
      invFailed++;
      console.error(`  FAILED #${i + 1} (${phone.brand} ${phone.model}):`, err?.message || err);
    }
  }

  console.log(`\n========== DONE ==========`);
  console.log(`Inventory: ${invSuccess} inserted, ${invFailed} failed`);
  console.log(`Photos:    ${photoSuccess} uploaded, ${photoFailed} failed`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
