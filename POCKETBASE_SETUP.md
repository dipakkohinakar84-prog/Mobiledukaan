# PocketBase Setup

Set `VITE_POCKETBASE_URL` in `.env`.

Admin panel note:
- `/777admin` uses the PocketBase superuser account.

Recommended collections:

1. `shops`
- fields:
  - `shopId` (text, unique)
  - `name` (text)
  - `legalName` (text, optional)
  - `address` (text, optional)
  - `location` (text, optional)
  - `phone` (text, optional)
  - `email` (text, optional)
  - `gstin` (text, optional)
  - `state` (text, optional)
  - `stateCode` (text, optional)
  - `invoicePrefix` (text, optional)
  - `defaultBillType` (text, optional)
  - `defaultGstRate` (number, optional)
  - `footer` (text, optional)
  - `terms` (text, optional)
  - `logo` (file, max 1, optional)

2. `shop_users` (auth)
- enable username auth
- unique identity fields:
  - `username` (store the 10-digit mobile number here)
  - `email`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `active` (bool)
  - `trialEndsAt` (date, required for app trial expiry)

3. `inventory`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `imei` (text)
  - `imei2` (text)
  - `brand` (text)
  - `model` (text)
  - `color` (text)
  - `ram` (text)
  - `storage` (text)
  - `batteryHealth` (text)
  - `condition` (text)
  - `buyPrice` (number)
  - `sellPrice` (number)
  - `status` (text)
  - `qty` (number)
  - `supplier` (text)
  - `sellerName` (text)
  - `sellerPhone` (text)
  - `sellerAadhaarNumber` (text)
  - `purchaseDate` (text)
  - `sellerAgreementAccepted` (bool)
  - `sellerIdPhoto` (file, max 1)
  - `sellerPhoto` (file, max 1)
  - `sellerSignature` (file, max 1)
  - `addedDate` (text)
  - `customerName` (text)
  - `customerPhone` (text)
  - `soldDate` (text)
  - `lastInvoiceNo` (text)

4. `transactions`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `inventoryItem` (relation -> `inventory`, max 1, optional)
  - `type` (text)
  - `invoiceNo` (text)
  - `imei` (text)
  - `imei2` (text)
  - `brand` (text)
  - `model` (text)
  - `color` (text)
  - `ram` (text)
  - `storage` (text)
  - `batteryHealth` (text)
  - `condition` (text)
  - `customerName` (text)
  - `phone` (text)
  - `amount` (number)
  - `paidAmount` (number)
  - `dueAmount` (number)
  - `costPrice` (number)
  - `paymentMode` (text)
  - `billType` (text)
  - `gstRate` (number)
  - `taxableAmount` (number)
  - `gstAmount` (number)
  - `cgstAmount` (number)
  - `sgstAmount` (number)
  - `totalAmount` (number)
  - `date` (text)
  - `dateTime` (text)
  - `notes` (text)

5. `photos`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `inventoryItem` (relation -> `inventory`, max 1)
  - `photoId` (text)
  - `file` (file, max 1)
  - `uploadedAt` (text)

6. `app_settings`
- fields:
  - `trialDays` (number)
- create one record and set the trial duration there
- allow public read access for this collection so the signup screen can read the current trial length

Suggested secure rules
- do not leave all API rules blank in production
- tenant isolation must be enforced by PocketBase rules, not only by client-side filters
- minimum recommended starting point:

`shop_users` (auth)
- list rule: `id = @request.auth.id`
- view rule: `id = @request.auth.id`
- update rule: `id = @request.auth.id`
- create rule:
  - allow signup only if you want self-registration
  - otherwise disable public create and use admin-only provisioning
- delete rule: admin only

`shops`
- list rule: `id = @request.auth.shop`
- view rule: `id = @request.auth.shop`
- update rule: `id = @request.auth.shop`
- create rule:
  - open only if self-signup needs to create the shop record
  - otherwise admin only

`inventory`
- list rule: `shop = @request.auth.shop`
- view rule: `shop = @request.auth.shop`
- create rule: `shop = @request.auth.shop`
- update rule: `shop = @request.auth.shop`
- delete rule: `shop = @request.auth.shop`

`transactions`
- list rule: `shop = @request.auth.shop`
- view rule: `shop = @request.auth.shop`
- create rule: `shop = @request.auth.shop`
- update rule: `shop = @request.auth.shop`
- delete rule: `shop = @request.auth.shop`

`photos`
- list rule: `shop = @request.auth.shop`
- view rule: `shop = @request.auth.shop`
- create rule: `shop = @request.auth.shop`
- update rule: `shop = @request.auth.shop`
- delete rule: `shop = @request.auth.shop`

`app_settings`
- list rule: `true`
- view rule: `true`
- create/update/delete: admin only

Signup and password reset requirements
- allow auth collection signup for `shop_users`
- keep `username` unique because the app signs in with mobile number
- require a real `email` because reset password is sent by PocketBase email
- keep `active` and `trialEndsAt` trustworthy; do not let normal users change these fields
- configure PocketBase SMTP settings before using reset password:
  - sender name
  - sender email
  - SMTP host
  - SMTP port
  - SMTP username
  - SMTP password

Current app auth behavior
- sign in uses `mobile number + password`
- sign up creates both the `shops` record and the linked `shop_users` auth record
- new accounts get the `app_settings.trialDays` duration, with a 7-day fallback if the settings record is missing
- reset password sends a PocketBase email to the registered address
- expired trials are blocked by the app on sign in and when restoring saved sessions

Admin dashboard
- `/777admin` now talks to a small backend admin API instead of authenticating as `_superusers` directly in the browser
- the backend admin API should run on the same trusted host/network as PocketBase
- required admin API env:
  - `VITE_ADMIN_API_URL=https://adminapi.example.com`
  - `POCKETBASE_URL=https://db.example.com` or local/private PocketBase URL
  - `ADMIN_API_PORT=8787` (optional)
  - `ADMIN_API_ALLOWED_ORIGINS=https://phonedukaan.example.com,https://your-site.netlify.app`
- after login it can:
  - view all users
  - see expired and ending-soon trials
  - extend one user by quick buttons
  - set a user's exact trial end date
  - activate or deactivate a user
  - resend reset password email for a user
  - edit shop name, phone, and email
  - update default signup trial days

Notes
- The app loads inventory, transactions, shop profile, and photos directly from PocketBase collections.
- Changes are written directly to PocketBase and realtime subscriptions re-fetch updated collections.
- For `Buy` entries with `Used` or `Refurbished` condition, seller verification fields should be filled for compliance and safety.
- Security recommendation: move `/777admin` actions behind a trusted backend/API before production scale, because exposing superuser login in the browser is a high-risk design.

Admin API deployment notes
- run `npm run admin-api` on the trusted server
- for Netlify + VPS, expose the admin API on its own subdomain such as `adminapi.example.com`
- the frontend should call it using `VITE_ADMIN_API_URL`
- the admin API uses bearer-token sessions, not browser cookies
- keep the PocketBase service private on `127.0.0.1:8090`
- example Nginx server block for `adminapi.example.com`:

```nginx
server {
    listen 80;
    server_name adminapi.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
