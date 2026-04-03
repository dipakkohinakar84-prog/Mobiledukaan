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
  - `username`
  - `email`
- fields:
  - `shop` (relation -> `shops`, max 1)
  - `active` (bool)

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

Suggested rules for first setup
- keep all API rules blank while testing

Notes
- The app loads inventory, transactions, shop profile, and photos directly from PocketBase collections.
- Changes are written directly to PocketBase and realtime subscriptions re-fetch updated collections.
- For `Buy` entries with `Used` or `Refurbished` condition, seller verification fields should be filled for compliance and safety.
