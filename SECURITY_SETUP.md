# Secret Safety

Keep real secrets out of git.

What is safe to commit:
- `.env.example`
- source code without keys or tokens
- docs with placeholder values only

What must never be committed:
- `.env`
- service account JSON files
- OAuth client secrets
- private keys
- refresh tokens

Local setup
1. Copy `.env.example` to `.env`
2. Fill real values only in `.env`
3. Keep downloaded Google service account JSON files outside the repo, or delete them after copying needed values

Netlify setup
1. Open Site settings -> Environment variables
2. Add real values there
3. Redeploy after changes

Recommended env strategy
- Central admin registry secrets live in `.env` locally and Netlify env vars in production
- Per-shop customer secrets are entered in the admin panel and stored in the central registry sheet

Key rotation
- If a private key was exposed, delete that key in Google Cloud immediately
- Create a new key
- Update `.env` and Netlify env vars

Google credentials used by this app
- `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `PHONEDUKAAN_ADMIN_ID`
- `PHONEDUKAAN_ADMIN_PASSWORD`

Quick checklist before pushing code
- `.env` is not staged
- no `*.json` service account key file is staged
- no private key text appears in changed files
- `.env.example` contains placeholders only
