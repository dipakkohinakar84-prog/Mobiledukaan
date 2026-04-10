import PocketBase from 'pocketbase';

const PB_URL = String(process.env.PB_URL || '').trim();
const LOGIN_ID = String(process.env.PB_LOGIN_ID || '').trim();
const PASSWORD = String(process.env.PB_PASSWORD || '').trim();

if (!PB_URL || !LOGIN_ID || !PASSWORD) {
  console.error('Missing PB_URL, PB_LOGIN_ID, or PB_PASSWORD environment variables.');
  process.exit(1);
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

  console.log('Fetching all photos...');
  const photos = await pb.collection('photos').getFullList({
    filter: `shop="${shopRecordId}"`,
  });
  console.log(`Found ${photos.length} photos. Deleting...\n`);

  if (photos.length === 0) {
    console.log('No photos to delete.');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < photos.length; i++) {
    try {
      await pb.collection('photos').delete(photos[i].id);
      deleted++;
    } catch (err) {
      failed++;
      if (failed <= 3) console.error(`  Error: ${err?.message || err}`);
    }
    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${photos.length} | ${deleted} deleted`);
    }
  }

  console.log(`\n========== DONE ==========`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Failed:  ${failed}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
