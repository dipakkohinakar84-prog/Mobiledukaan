# Graph Report - Mobiledukaan  (2026-10-19)

## Corpus Check
- 28 files · ~3,421,879 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 349 nodes · 667 edges · 18 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 18|Community 18]]

## God Nodes (most connected - your core abstractions)
1. `App()` - 28 edges
2. `buildInvoiceDoc()` - 18 edges
3. `buildInvoiceLandscapeDoc()` - 18 edges
4. `normalizeShopProfile()` - 16 edges
5. `createClient()` - 15 edges
6. `getDb()` - 11 edges
7. `normalizeRepair()` - 11 edges
8. `adminApiRequest()` - 11 edges
9. `pocketbaseRegisterShopUser()` - 10 edges
10. `genId()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `yymmFor()` --calls--> `App()`  [INFERRED]
  drive-backup.js → mobile-dukaan_2.jsx
- `normalizeInvoiceCustom()` --calls--> `normalizeShopProfile()`  [INFERRED]
  invoice-themes.js → mobile-dukaan_2.jsx
- `resolveInvoiceTheme()` --calls--> `buildInvoiceDoc()`  [INFERRED]
  invoice-themes.js → mobile-dukaan_2.jsx
- `resolveInvoiceTheme()` --calls--> `buildInvoiceLandscapeDoc()`  [INFERRED]
  invoice-themes.js → mobile-dukaan_2.jsx
- `buildBillProStickerDoc()` --calls--> `ensureRupeeFont()`  [INFERRED]
  mobile-dukaan_2.jsx → pdf-font.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (66): adminApiRequest(), authRecordToShopSession(), buildShopSlug(), computeTrialEndsAt(), createClient(), createUniqueShop(), dataUrlToFile(), decodeMetaPayload() (+58 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (32): amountInWords(), buildInvoiceDoc(), buildInvoiceLandscapeDoc(), buildRepairStickerDoc(), buildReportDoc(), buildStickerDoc(), calcInvoiceTotals(), collectWarrantyBlocks() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (4): isPresetStorage(), normalizeDeviceSeries(), readDeviceSeries(), StorageInput()

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (21): authFetch(), backupFileNameFor(), downloadBackupFile(), DriveBackupError, ensureBackupFolder(), fetchDriveEmail(), findBackupFile(), isRecordObject() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (19): deleteHandle(), deletePhotoBlob(), getDb(), loadAppState(), loadHandle(), loadPhotoBlob(), loadSyncState(), saveAppState() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (12): buildShopUserEmail(), computeTrialDaysValue(), corsHeaders(), getBearerToken(), loadDashboard(), mapDashboard(), normalizeMobileNumber(), normalizeShopId() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (16): App(), createEmptyPartSupplier(), fmtBytes(), fmtCompactCurrency(), fmtCurrency(), fmtRelativeTime(), fmtSpecs(), getTxItemContext() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.23
Nodes (11): b32decode(), b32encode(), groupsOf(), normalizeDeviceId(), hashBillProKey(), normalizeBillProKey(), verifyBillProKey(), verifyBillProKeyV2() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (12): cleanImei(), createEmptyForm(), createEmptyRepairForm(), findDuplicateImei(), fmtDate(), getReportRange(), hasImei(), isoDate() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (11): buildBillProStickerDoc(), buildStickerBarcodeDataUrl(), getEnabledModules(), loadStickerLogoDataUrl(), loadStore(), makeBillProStickerFile(), migrateLegacyName(), normalizeShopProfile() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.36
Nodes (9): $(), boot(), clearFail(), enterIssue(), fail(), getRoot(), loadJSON(), refreshLog() (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.38
Nodes (7): buildCustomTheme(), hexToRgb(), luminance(), mix(), normalizeInvoiceCustom(), resolveInvoiceTheme(), rgbToHex()

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (10): cleanMobileNumber(), genId(), getPhotoPreview(), LB(), localRecord(), localTransaction(), normalizePartSupplier(), normalizePhotoRef() (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.27
Nodes (10): decodeMetaPayload(), getRepairPartCost(), getRepairPartSupplierId(), getRepairPartSupplierName(), getRepairPaymentStatus(), normalizeRepair(), parsePartsSuppliersMeta(), parseRepairMeta() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.47
Nodes (8): downloadBrandImages(), downloadImage(), generateImei(), generatePhones(), main(), pick(), randomDate(), randomInt()

### Community 15 - "Community 15"
Cohesion: 0.32
Nodes (3): parseBillsBackupCsv(), parseCsv(), readShopProfile()

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (7): billProDeviceIdFromFingerprint(), billProFingerprintSource(), deriveBillProDeviceId(), ensureBillProDeviceId(), ensureFingerprintSeed(), hash53(), loadBillProActivationRecord()

### Community 18 - "Community 18"
Cohesion: 0.83
Nodes (3): downloadBrandImages(), downloadImage(), main()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `Community 6` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 8`, `Community 9`, `Community 12`, `Community 16`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `isDirectoryPickerSupported()` connect `Community 4` to `Community 6`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `yymmFor()` connect `Community 3` to `Community 6`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `App()` (e.g. with `isDirectoryPickerSupported()` and `yymmFor()`) actually correct?**
  _`App()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `buildInvoiceDoc()` (e.g. with `ensureRupeeFont()` and `resolveInvoiceTheme()`) actually correct?**
  _`buildInvoiceDoc()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `buildInvoiceLandscapeDoc()` (e.g. with `ensureRupeeFont()` and `resolveInvoiceTheme()`) actually correct?**
  _`buildInvoiceLandscapeDoc()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._