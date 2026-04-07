import PocketBase from 'pocketbase';

const PB_URL = String(process.env.PB_URL || '').trim();
const LOGIN_ID = String(process.env.PB_LOGIN_ID || '').trim();
const PASSWORD = String(process.env.PB_PASSWORD || '').trim();

if (!PB_URL || !LOGIN_ID || !PASSWORD) {
  console.error('Missing PB_URL, PB_LOGIN_ID, or PB_PASSWORD environment variables.');
  process.exit(1);
}

const BRAND_IMAGES = {
  Samsung: [
    'https://freebiehive.com/wp-content/uploads/2024/01/Samsung-Galaxy-S24-Ultra-PNG.jpg',
    'https://freebiehive.com/wp-content/uploads/2025/01/Samsung-S25-Ultra-PNG.jpg',
  ],
  Apple: [
    'https://freebiehive.com/wp-content/uploads/2024/09/Apple-Iphone-16-Pro-Max-PNG.jpg',
    'https://pngimg.com/d/iphone16_PNG112450.png',
    'https://pngimg.com/d/iphone16_PNG112445.png',
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

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = res.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
  return { buffer, contentType, ext };
}

async function downloadBrandImages() {
  const cache = {};
  console.log('Downloading phone images for each brand...');
  for (const [brand, urls] of Object.entries(BRAND_IMAGES)) {
    for (const url of urls) {
      try {
        const img = await downloadImage(url);
        cache[brand] = img;
        console.log(`  [OK] ${brand}: ${(img.buffer.length / 1024).toFixed(0)} KB`);
        break;
      } catch (err) {
        console.warn(`  [SKIP] ${brand}: ${err.message}`);
      }
    }
    if (!cache[brand]) console.warn(`  [MISS] ${brand}: no image found`);
  }
  return cache;
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

  // Step 2: Fetch existing inventory
  console.log('Fetching existing inventory...');
  const inventory = await pb.collection('inventory').getFullList({
    filter: `shop="${shopRecordId}"`,
    sort: '-created',
  });
  console.log(`Found ${inventory.length} inventory items.\n`);

  // Step 3: Check which items already have photos
  const existingPhotos = await pb.collection('photos').getFullList({
    filter: `shop="${shopRecordId}"`,
  });
  const itemsWithPhotos = new Set(existingPhotos.map(p => p.inventoryItem));
  const itemsNeedingPhotos = inventory.filter(item => !itemsWithPhotos.has(item.id));
  console.log(`${itemsWithPhotos.size} items already have photos.`);
  console.log(`${itemsNeedingPhotos.length} items need photos.\n`);

  if (itemsNeedingPhotos.length === 0) {
    console.log('All items already have photos. Nothing to do!');
    return;
  }

  // Step 4: Upload photos
  let success = 0;
  let failed = 0;

  for (let i = 0; i < itemsNeedingPhotos.length; i++) {
    const item = itemsNeedingPhotos[i];
    const brand = item.brand || 'Other';
    const img = imageCache[brand] || imageCache['Other'];

    if (!img) {
      failed++;
      continue;
    }

    try {
      const photoId = `seed-photo-${Date.now()}-${i}`;
      const fileName = `${brand}-${item.model || 'phone'}-${i}.${img.ext}`.replace(/[^a-zA-Z0-9._-]/g, '-');
      const file = new File([img.buffer], fileName, { type: img.contentType });
      const form = new FormData();
      form.append('shop', shopRecordId);
      form.append('photoId', photoId);
      form.append('inventoryItem', item.id);
      form.append('uploadedAt', new Date().toISOString());
      form.append('file', file);
      await pb.collection('photos').create(form);
      success++;
    } catch (err) {
      failed++;
      if (failed <= 3) console.error(`  Error: ${err?.message || err}`);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${itemsNeedingPhotos.length} | ${success} uploaded`);
    }
  }

  console.log(`\n========== DONE ==========`);
  console.log(`Photos uploaded: ${success}`);
  console.log(`Photos failed:   ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
