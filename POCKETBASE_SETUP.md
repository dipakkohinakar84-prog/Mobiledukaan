# PocketBase Setup

Set `VITE_POCKETBASE_URL` in `.env`.

Admin panel note:
- `/777admin` uses the PocketBase superuser account, not a separate `admins` collection.

Recommended collections:

1. `shops`
- fields:
  - `shopId` (text, unique)
  - `name` (text)

2. `shop_users` (auth)
- enable username auth
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `active` (bool)

3. `shop_sync`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `shopId` (text)
  - `shopName` (text)
  - `payload` (json)
  - `savedAt` (text or date)

4. `shop_photos`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `photoId` (text)
  - `itemId` (text)
  - `file` (file, max 1)
  - `uploadedAt` (text or date)

Suggested rules

- `shops`
  - list/view/update rule: `@request.auth.collectionName = "shop_users" && id = @request.auth.shop`

- `shop_sync`
  - list/view/create/update rule: `@request.auth.collectionName = "shop_users" && shop = @request.auth.shop`

- `shop_photos`
  - list/view/create/update rule: `@request.auth.collectionName = "shop_users" && shop = @request.auth.shop`

- `shop_users`
  - create users from admin UI while authenticated as PocketBase superuser

Notes

- The app stores the full business payload JSON in `shop_sync.payload`
- Photos upload to `shop_photos.file`
- Admin UI creates/updates `shops` and `shop_users` using the PocketBase superuser account
