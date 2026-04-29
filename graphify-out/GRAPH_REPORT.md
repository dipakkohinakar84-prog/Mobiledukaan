# Graph Report - Mobnage  (2026-04-29)

## Corpus Check
- 11 files · ~549,819 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 237 nodes · 462 edges · 16 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `App()` - 22 edges
2. `createClient()` - 15 edges
3. `normalizeShopProfile()` - 14 edges
4. `buildInvoiceDoc()` - 13 edges
5. `normalizeRepair()` - 11 edges
6. `adminApiRequest()` - 11 edges
7. `pocketbaseRegisterShopUser()` - 10 edges
8. `getDb()` - 8 edges
9. `cleanImei()` - 8 edges
10. `genId()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `getPocketBaseUrl()`  [INFERRED]
  mobile-dukaan_2.jsx → pocketbase-client.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (6): base64UrlFromBytes(), base64UrlFromText(), ensureBillProDeviceId(), generateBillProDeviceId(), isPresetStorage(), StorageInput()

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (20): adminApiRequest(), ensureTrialActive(), ensureUrl(), getPocketBaseUrl(), inferMimeType(), isTrialExpired(), pbPhotoToRef(), pocketbaseAdminExtendUserTrial() (+12 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (21): cleanImei(), cleanMobileNumber(), extractScanImei(), findDuplicateImei(), genId(), getRepairPartCost(), getRepairPartSupplierId(), getRepairPartSupplierName() (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (18): App(), createEmptyForm(), createEmptyPartSupplier(), createEmptyRepairForm(), fmtCompactCurrency(), fmtCurrency(), fmtDate(), fmtRelativeTime() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (18): amountInWords(), buildInvoiceDoc(), calcInvoiceTotals(), fmtDateTime(), fmtMoney(), fmtSpecs(), formatMoney(), getSaleShop() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (12): buildShopUserEmail(), computeTrialDaysValue(), corsHeaders(), getBearerToken(), loadDashboard(), mapDashboard(), normalizeMobileNumber(), normalizeShopId() (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.23
Nodes (14): createClient(), dataUrlToFile(), inferMimeTypeFromDataUrl(), inventoryItemToRecord(), isPocketbaseId(), pocketbaseCreateTransaction(), pocketbaseDeleteInventory(), pocketbaseDeleteRepair() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.18
Nodes (12): buildRepairStickerDoc(), buildReportDoc(), decodeMetaPayload(), getEnabledModules(), loadStore(), makeRepairStickerFile(), makeReportFile(), migrateLegacyName() (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.23
Nodes (12): authRecordToShopSession(), buildShopSlug(), computeTrialEndsAt(), createUniqueShop(), normalizeEmail(), normalizeMobileNumber(), normalizeShopId(), pocketbaseGetTrialDays() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (11): decodeMetaPayload(), fileUrlToDataUrl(), newestTimestamp(), parseEnabledModulesCsv(), parsePartsSuppliersMeta(), pocketbaseLoadShopBundle(), serializePartsSuppliersMeta(), shopFilter() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.42
Nodes (8): deletePhotoBlob(), getDb(), loadAppState(), loadPhotoBlob(), loadSyncState(), saveAppState(), savePhotoBlob(), saveSyncState()

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (9): getRepairPartCost(), getRepairPartSupplierId(), getRepairPartSupplierName(), getRepairPaymentStatus(), parseRepairMeta(), repairItemToRecord(), repairRecordToItem(), serializeRepairNotes() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.47
Nodes (8): downloadBrandImages(), downloadImage(), generateImei(), generatePhones(), main(), pick(), randomDate(), randomInt()

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (7): buildBillProStickerDoc(), buildStickerBarcodeDataUrl(), buildStickerDoc(), getWarrantyStatus(), loadStickerLogoDataUrl(), makeBillProStickerFile(), makeStickerFile()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (5): base64UrlToBytes(), billProLicensePayloadText(), importBillProPublicKey(), textFromBase64Url(), verifyBillProActivationToken()

### Community 15 - "Community 15"
Cohesion: 0.83
Nodes (3): downloadBrandImages(), downloadImage(), main()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `App()` connect `Community 3` to `Community 0`, `Community 1`, `Community 4`, `Community 7`, `Community 13`?**
  _High betweenness centrality (0.307) - this node is a cross-community bridge._
- **Why does `getPocketBaseUrl()` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.302) - this node is a cross-community bridge._
- **Why does `normalizeShopProfile()` connect `Community 7` to `Community 0`, `Community 3`, `Community 4`, `Community 13`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._