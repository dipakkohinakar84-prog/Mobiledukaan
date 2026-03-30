# Secret Safety

Keep real secrets out of git.

What is safe to commit:
- `.env.example`
- source code without keys or tokens
- docs with placeholder values only

What must never be committed:
- `.env`
- Apps Script deployment URLs that include private test values
- admin secrets or sync keys

Local setup
1. Copy `.env.example` to `.env`
2. Fill real values only in `.env`
3. Keep your Apps Script URLs and secrets only in `.env`

Netlify setup
1. Open Site settings -> Environment variables
2. Add real values there
3. Redeploy after changes

Recommended env strategy
- Central admin registry secrets live in `.env` locally and Netlify env vars in production
- Per-shop customer Apps Script URLs are entered in the admin panel and stored in the central registry

Secret rotation
- If an Apps Script admin secret or sync key was exposed, change it in Apps Script
- Update `.env` and Netlify env vars

Apps Script credentials used by this app
- `PHONEDUKAAN_REGISTRY_APPS_SCRIPT_URL`
- `APPS_SCRIPT_ADMIN_SECRET`
- `APPS_SCRIPT_WEB_APP_URL`
- `APPS_SCRIPT_SYNC_KEY`
- `PHONEDUKAAN_ADMIN_ID`
- `PHONEDUKAAN_ADMIN_PASSWORD`

Quick checklist before pushing code
- `.env` is not staged
- no real secret values appear in changed files
- `.env.example` contains placeholders only
