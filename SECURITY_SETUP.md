# Secret Safety

Keep real secrets out of git.

What is safe to commit:
- `.env.example`
- source code without keys or tokens
- docs with placeholder values only

What must never be committed:
- `.env`
- PocketBase admin credentials
- real PocketBase URLs if they expose internal-only hosts

Local setup
1. Copy `.env.example` to `.env`
2. Fill real values only in `.env`
3. Keep your PocketBase URL and any secrets only in `.env`

Deployment setup
1. Add `VITE_POCKETBASE_URL` in your hosting environment variables
2. Point it to your PocketBase instance URL
3. Redeploy after changes

Recommended env strategy
- `VITE_POCKETBASE_URL` points the frontend to your PocketBase instance
- Admin/shop auth lives in PocketBase collections instead of local env secrets where possible

Secret rotation
- If PocketBase admin credentials were exposed, change them in PocketBase immediately
- Update `.env` and Netlify env vars if needed

PocketBase config used by this app
- `VITE_POCKETBASE_URL`

Quick checklist before pushing code
- `.env` is not staged
- no real secret values appear in changed files
- `.env.example` contains placeholders only

PocketBase rule hardening
1. Set these environment variables locally or in your shell only:
   - `POCKETBASE_URL`
   - `POCKETBASE_ADMIN_EMAIL`
   - `POCKETBASE_ADMIN_PASSWORD`
2. Preview the rule changes:
   - `npm run security:pocketbase-rules -- --dry-run`
3. Apply the rules:
   - `npm run security:pocketbase-rules`

By default this keeps public signup enabled for `shops` and `shop_users`. To disable public signup collection creates, run with `ALLOW_PUBLIC_SIGNUP=false`.
