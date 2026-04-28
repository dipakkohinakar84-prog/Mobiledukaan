import PocketBase from 'pocketbase'

const PB_URL = String(process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').trim()
const ADMIN_EMAIL = String(process.env.POCKETBASE_ADMIN_EMAIL || process.env.POCKETBASE_SUPERUSER_EMAIL || '').trim()
const ADMIN_PASSWORD = String(process.env.POCKETBASE_ADMIN_PASSWORD || process.env.POCKETBASE_SUPERUSER_PASSWORD || '').trim()
const ALLOW_PUBLIC_SIGNUP = String(process.env.ALLOW_PUBLIC_SIGNUP || 'true').toLowerCase() !== 'false'
const DRY_RUN = process.argv.includes('--dry-run')

const publicRule = '@request.auth.id = "" || @request.auth.id != ""'
const shopScopedRule = 'shop = @request.auth.shop'

const collectionRules = {
  shops: {
    listRule: 'id = @request.auth.shop',
    viewRule: 'id = @request.auth.shop',
    createRule: ALLOW_PUBLIC_SIGNUP ? publicRule : null,
    updateRule: 'id = @request.auth.shop',
    deleteRule: null,
  },
  shop_users: {
    listRule: 'id = @request.auth.id',
    viewRule: 'id = @request.auth.id',
    createRule: ALLOW_PUBLIC_SIGNUP ? publicRule : null,
    updateRule: null,
    deleteRule: null,
  },
  inventory: {
    listRule: shopScopedRule,
    viewRule: shopScopedRule,
    createRule: shopScopedRule,
    updateRule: shopScopedRule,
    deleteRule: shopScopedRule,
  },
  transactions: {
    listRule: shopScopedRule,
    viewRule: shopScopedRule,
    createRule: shopScopedRule,
    updateRule: shopScopedRule,
    deleteRule: shopScopedRule,
  },
  photos: {
    listRule: shopScopedRule,
    viewRule: shopScopedRule,
    createRule: shopScopedRule,
    updateRule: shopScopedRule,
    deleteRule: shopScopedRule,
  },
  repairs: {
    listRule: shopScopedRule,
    viewRule: shopScopedRule,
    createRule: shopScopedRule,
    updateRule: shopScopedRule,
    deleteRule: shopScopedRule,
  },
  app_settings: {
    listRule: publicRule,
    viewRule: publicRule,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
}

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing required env. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, and POCKETBASE_ADMIN_PASSWORD.')
  console.error('Optional: set ALLOW_PUBLIC_SIGNUP=false to disable public shop signup collection creates.')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

async function applyRules(collectionName, rules) {
  const collection = await pb.collections.getOne(collectionName)
  const payload = {
    listRule: rules.listRule,
    viewRule: rules.viewRule,
    createRule: rules.createRule,
    updateRule: rules.updateRule,
    deleteRule: rules.deleteRule,
  }

  if (DRY_RUN) {
    console.log(`[dry-run] ${collectionName}: ${JSON.stringify(payload)}`)
    return
  }

  await pb.collections.update(collection.id, payload)
  console.log(`updated ${collectionName}`)
}

try {
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD)
  for (const [collectionName, rules] of Object.entries(collectionRules)) {
    await applyRules(collectionName, rules)
  }
  console.log(DRY_RUN ? 'PocketBase rule dry run complete.' : 'PocketBase rules updated.')
} catch (error) {
  console.error(error?.response?.message || error?.message || 'Unable to apply PocketBase rules.')
  process.exit(1)
}
