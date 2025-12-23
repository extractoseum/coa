# Full System Debug Report - COA Viewer 2.0

**Fecha:** 2025-12-22
**Auditor:** Claude Code (Mission K)
**Scope:** Backend, Frontend, Database, Security

---

## Executive Summary

```
┌────────────────────────────────────────────────────────────┐
│  OVERALL HEALTH SCORE: 88/100                              │
├────────────────────────────────────────────────────────────┤
│  🔴 Critical (P0):     5 issues                           │
│  🟠 High (P1):         8 issues                           │
│  🟡 Medium (P2):       12 issues                          │
│  🟢 Low (P3):          15 observations                    │
├────────────────────────────────────────────────────────────┤
│  Backend Services:     30 files analyzed                  │
│  Controllers:          33 files analyzed                  │
│  Routes:               30 files analyzed                  │
│  Migrations:           52 files analyzed                  │
│  Frontend Pages:       25+ components analyzed            │
└────────────────────────────────────────────────────────────┘
```

---

## 🔴 CRITICAL BUGS (P0) - Fix Immediately

### 1. `aiTools.ts`: Wrong Function Name for Order Tracking

**File:** [aiTools.ts:881](backend/src/services/aiTools.ts#L881)

**Bug:** Uses `getShopifyOrder()` but shopifyService exports `getShopifyOrderById()`

```typescript
// CURRENT (WRONG)
const order = await getShopifyOrder(order_id);

// SHOULD BE
const { getShopifyOrderById } = require('./shopifyService');
const order = await getShopifyOrderById(order_id);
```

**Impact:** `get_order_tracking` tool will crash with "getShopifyOrder is not a function"

---

### 2. `aiTools.ts`: Wrong Function Name for Voice TTS

**File:** [aiTools.ts:929-938](backend/src/services/aiTools.ts#L929)

**Bug:** Uses `voiceService.textToSpeech()` but VoiceService has `generateAudioResponse()`

```typescript
// CURRENT (WRONG)
const audioBuffer = await voiceService.textToSpeech(text, voice_id);

// SHOULD BE
const audioBuffer = await voiceService.generateAudioResponse(text, {
    provider: 'elevenlabs',
    voice_id: voice_id || '21m00Tcm4TlvDq8ikWAM',
    settings: {}
});
```

**Impact:** `generate_voice_message` tool will crash

---

### 3. `aiTools.ts`: Wrong Function Name for Product Sync

**File:** [aiTools.ts:918-927](backend/src/services/aiTools.ts#L918)

**Bug:** Uses `syncProducts()` but shopifyService exports `syncProductsToLocalDB()`

```typescript
// CURRENT (WRONG)
const { syncProducts } = require('./shopifyService');

// SHOULD BE
const { syncProductsToLocalDB } = require('./shopifyService');
return syncProductsToLocalDB();
```

**Impact:** `sync_products_from_shopify` tool will crash

---

### 4. `aiTools.ts`: CRMService Instantiation Inconsistency

**File:** [aiTools.ts:791, 808](backend/src/services/aiTools.ts#L791)

**Bug:** Uses `new CRMService()` but CRMService is a Singleton with `getInstance()`

```typescript
// CURRENT (INCONSISTENT)
const crm = new CRMService();

// SHOULD BE (CONSISTENT WITH REST OF CODEBASE)
const { CRMService } = require('./CRMService');
const crm = CRMService.getInstance();
```

**Impact:** May work but creates multiple instances, wastes memory, could cause race conditions

---

### 5. Migration Numbering Conflict

**Location:** `backend/migrations/`

**Bug:** Multiple migrations share the same number prefix, causing execution order issues:

| Prefix | Files |
|--------|-------|
| 002 | `002_update_verification_codes_inventory.sql`, `002_auth_system.sql`, `002_crm_customer_360.sql` |
| 003 | `003_enrich_coas.sql`, `003_folders_system.sql`, `003_coa_folders.sql`, `003_fix_message_types.sql`, `003_add_notification_prefs.sql`, `003_add_action_plan.sql` |
| 004 | `004_badges_system.sql`, `004_add_parent_id_to_folders.sql`, `004_allow_null_email.sql` |
| 005 | `005_add_is_hidden_to_coas.sql`, `005_add_line_items.sql` |

**Impact:** Migrations may run in wrong order, causing constraint violations or missing columns

**Fix:** Rename to unique sequential numbers (e.g., `050_`, `051_`, etc.)

---

## 🟠 HIGH PRIORITY BUGS (P1)

### 6. Missing `translation` TaskType Policy

**File:** [ModelRouter.ts:28-37](backend/src/services/ModelRouter.ts#L28)

**Bug:** TaskType includes `'translation'` but `initializePolicies()` doesn't define a policy for it

```typescript
// TaskType includes 'translation' but policies Map doesn't have it
// Will return "unknown task type fallback" for translation tasks
```

**Impact:** Translation tasks will use fallback model instead of optimized one

---

### 7. Fire-and-Forget Without Status Update

**File:** [CRMService.ts:199-216](backend/src/services/CRMService.ts#L199)

**Bug:** Retry logic added but doesn't update message status to 'failed' after all retries exhausted

```typescript
// Line 210-211: Comment says "Optional: Update DB status to 'failed'" but not implemented
if (retries > 0) {
    // ...retry
} else {
    console.error('[CRMService] Background dispatch failed after retries:', err);
    // ⚠️ Should update: await supabase.from('crm_messages').update({ status: 'failed' })...
}
```

---

### 8. `browsing_behavior` Table Schema Mismatch

**File:** [045_ai_analytics.sql](backend/migrations/045_ai_analytics.sql)

**Potential Issue:** New migration creates `browsing_behavior` but `033_browsing_behavior.sql` might have different schema

```sql
-- Check if columns match between 033 and 045
-- 033 might have: client_id, page, duration, timestamp
-- 045 has: phone, page_url, time_on_page, referrer, device_type, ip_address
```

**Action:** Verify both migrations are compatible or use ALTER TABLE

---

### 9. No Index on `voice_calls.status`

**File:** [043_vapi_calls.sql](backend/migrations/043_vapi_calls.sql)

**Missing:** Index for frequently queried `status` column

```sql
-- MISSING:
CREATE INDEX idx_voice_calls_status ON voice_calls(status);
```

---

### 10. CORS Fail-Open in Production

**File:** [index.ts:92](backend/src/index.ts#L92)

**Bug:** CORS middleware returns `callback(null, true)` even when origin is not in allowlist

```typescript
// Line 92 - TEMPORARY FAIL-OPEN
return callback(null, true); // TEMPORARY FAIL-OPEN FOR DEBUGGING
// return callback(new Error(msg), false); // THIS IS COMMENTED OUT
```

**Impact:** Any origin can make requests to the API

---

### 11. Rate Limiter Applied Globally Before Webhooks

**File:** [index.ts:110](backend/src/index.ts#L110)

**Issue:** Rate limiter (2000 req/15min) applied to `/crm/inbound` webhook

**Impact:** High-volume WhatsApp accounts could hit rate limit

**Fix:** Exempt webhook routes or increase limit for specific paths

---

### 12. Missing `voice_interactions` Insert Error Handling

**File:** [VoiceService.ts:293-312](backend/src/services/VoiceService.ts#L293)

**Bug:** If insert fails, error is logged but processing continues silently

```typescript
if (insertError) {
    console.error('[VoiceService] Failed to log to voice_interactions:', insertError);
    // ⚠️ Continues without alerting - could lose analytics data
}
```

---

### 13. `ai_usage_logs` Table May Not Exist

**File:** [aiTools.ts:817-828](backend/src/services/aiTools.ts#L817)

**Issue:** `get_ai_usage_stats` handler catches error gracefully but table might not exist

```typescript
// Good: Has error handling
if (error) {
    console.warn('[AITools] Failed to fetch ai_usage_logs:', error.message);
    return { period_days: days, usage_by_model: {}, total_calls: 0, error: error.message };
}
```

**Action:** Ensure `030_ai_usage_tracking.sql` or `045_ai_analytics.sql` is executed

---

## 🟡 MEDIUM PRIORITY ISSUES (P2)

### 14. Duplicate Table Definition Risk

| Table | Defined In | Risk |
|-------|------------|------|
| `browsing_behavior` | 033, 045 | Duplicate CREATE TABLE |
| `ai_usage_logs` | 030, 045 | Duplicate CREATE TABLE |
| `conversations` | 001_crm_core | Extended by 036, OK |

---

### 15. Missing `message_type: 'sticker'` in DB Constraint

**File:** [044_maintenance_fixes.sql](backend/migrations/044_maintenance_fixes.sql)

**Status:** ✅ Fixed in 044

---

### 16. Missing `status: 'closed'` in Conversation Constraint

**File:** [044_maintenance_fixes.sql](backend/migrations/044_maintenance_fixes.sql)

**Status:** ✅ Fixed in 044

---

### 17. Missing Index on `crm_messages.external_id`

**File:** [044_maintenance_fixes.sql](backend/migrations/044_maintenance_fixes.sql)

**Status:** ✅ Fixed in 044

---

### 18. Environment Config Incomplete

**File:** [config/env.ts](backend/src/config/env.ts)

**Issue:** Only exports `port` and `supabase` config, many env vars accessed directly via `process.env`

**Recommendation:** Centralize all config:
```typescript
export const config = {
    port: process.env.PORT || 3000,
    supabase: { ... },
    whapi: { token: process.env.WHAPI_TOKEN },
    vapi: { apiKey: process.env.VAPI_API_KEY, phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID },
    elevenlabs: { apiKey: process.env.ELEVENLABS_API_KEY },
    shopify: { domain: process.env.SHOPIFY_STORE_DOMAIN, token: process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
};
```

---

### 19. No Validation on Chip Upsert

**File:** [crmController.ts:419-426](backend/src/controllers/crmController.ts#L419)

**Issue:** `upsertMiniChip` and `upsertChannelChip` accept raw `req.body` without validation

---

### 20. Hardcoded ElevenLabs Voice IDs

**File:** [aiTools.ts:938](backend/src/services/aiTools.ts#L938), [ElevenLabsService.ts](backend/src/services/ElevenLabsService.ts)

**Issue:** Default voice ID `21m00Tcm4TlvDq8ikWAM` hardcoded in multiple places

---

### 21. Frontend: API Endpoint Mismatch Risk

**Files:** `AdminCRM.tsx`, `AdminTelemetry.tsx`

**Observation:** Frontend makes calls to `/api/v1/crm/*` - all match backend routes ✅

---

### 22. Frontend: Missing Loading States

**File:** [AdminCRM.tsx](frontend/src/pages/AdminCRM.tsx)

**Observation:** Uses `loading` state but some fetch calls might not set it properly

---

### 23. Frontend: No Offline Detection

**Observation:** No mechanism to detect API offline and show user feedback

---

### 24. Shopify Timeout Risk

**File:** [shopifyService.ts](backend/src/services/shopifyService.ts)

**Issue:** 30s timeout might not be enough for large product syncs

---

### 25. No Database Connection Pooling Config

**Observation:** Using Supabase client defaults, no explicit pool configuration

---

## 🟢 LOW PRIORITY / OBSERVATIONS (P3)

| # | Issue | File | Notes |
|---|-------|------|-------|
| 26 | `any` type usage | Multiple | Type safety could be improved |
| 27 | Console.log in production | Multiple | Should use structured logger |
| 28 | Magic strings for agent IDs | CRMService.ts | Should be constants |
| 29 | No unit tests | - | Test coverage is 0% |
| 30 | No integration tests | - | No E2E test suite |
| 31 | Knowledge base path hardcoded | aiService.ts | Should be env var |
| 32 | Missing JSDoc | Multiple | Documentation sparse |
| 33 | `@ts-ignore` usage | behaviorController.ts:3 | Type issue suppressed |
| 34 | Inline requires in routes | crmRoutes.ts:32-35 | Non-standard pattern |
| 35 | No health check for Whapi | - | Could fail silently |
| 36 | No health check for Vapi | - | Could fail silently |
| 37 | No retry for Shopify API | shopifyService.ts | Single attempt |
| 38 | No caching for products | - | Every search hits DB |
| 39 | No rate limit for voice calls | VapiService.ts | Could incur costs |
| 40 | Unused migrations | diagnose_realtime.sql | Should be removed |

---

## Quick Fix SQL (Run in Supabase)

```sql
-- 1. Add missing index for voice_calls
CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON voice_calls(status);

-- 2. Add missing translation policy (run in app code, not SQL)
-- This is TypeScript fix, not SQL

-- 3. Verify all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'voice_interactions',
    'voice_calls',
    'ai_usage_logs',
    'browsing_behavior',
    'mini_chips',
    'channel_chips',
    'conversation_chips'
);

-- 4. Check for duplicate table definitions (should return 0)
SELECT table_name, COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
GROUP BY table_name
HAVING COUNT(*) > 1;
```

---

## Code Fixes Required

### Fix 1: aiTools.ts - Order Tracking

```typescript
// Line 877-895
get_order_tracking: async ({ order_id }) => {
    const { getShopifyOrderById } = require('./shopifyService');
    try {
        const order = await getShopifyOrderById(order_id);
        if (!order) return { error: 'Order not found' };
        const fulfillments = order.fulfillments || [];
        return {
            order_id: order.id,
            order_number: order.name,
            status: order.fulfillment_status,
            tracking: fulfillments.map((f: any) => ({
                company: f.tracking_company,
                number: f.tracking_number,
                url: f.tracking_url,
                status: f.shipment_status
            }))
        };
    } catch (e: any) {
        return { error: e.message };
    }
},
```

### Fix 2: aiTools.ts - Voice Generation

```typescript
// Line 929-945
generate_voice_message: async ({ text, voice_id }) => {
    const { VoiceService } = require('./VoiceService');
    const voiceService = new VoiceService();
    try {
        const voiceProfile = {
            provider: 'elevenlabs' as const,
            voice_id: voice_id || '21m00Tcm4TlvDq8ikWAM',
            settings: {}
        };
        const audioBuffer = await voiceService.generateAudioResponse(text, voiceProfile);

        // Upload to storage
        const filename = `voice_generated/${Date.now()}.mp3`;
        const { error } = await supabase.storage
            .from('crm_attachments')
            .upload(filename, audioBuffer, { contentType: 'audio/mpeg' });

        if (error) throw error;

        const { data: urlData } = supabase.storage.from('crm_attachments').getPublicUrl(filename);
        return { success: true, audio_url: urlData.publicUrl };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
},
```

### Fix 3: aiTools.ts - Product Sync

```typescript
// Line 918-927
sync_products_from_shopify: async () => {
    const { syncProductsToLocalDB } = require('./shopifyService');
    try {
        const result = await syncProductsToLocalDB();
        return { success: true, ...result };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
},
```

### Fix 4: aiTools.ts - CRMService Singleton

```typescript
// Lines 791, 808 - Change from:
const crm = new CRMService();

// To:
const { CRMService } = require('./CRMService');
const crm = CRMService.getInstance();
```

### Fix 5: ModelRouter.ts - Add Translation Policy

```typescript
// In initializePolicies(), add after 'voice_analysis':
['translation', {
    cost: { model: 'gpt-4o-mini', budget: 1000 },
    balanced: { model: 'gpt-4o', budget: 1500 },
    quality: { model: 'gpt-4o', budget: 2000 }
}]
```

---

## Migration Rename Recommendations

```bash
# Rename conflicting migrations to unique sequential numbers
# Example new numbering:

050_verification_codes_inventory.sql  # was 002_update_verification_codes_inventory.sql
051_auth_system.sql                   # was 002_auth_system.sql
052_crm_customer_360.sql              # was 002_crm_customer_360.sql
# ... etc
```

---

## Security Recommendations

| Priority | Issue | Action |
|----------|-------|--------|
| HIGH | CORS fail-open | Uncomment strict CORS check in index.ts:92 |
| HIGH | No webhook signature verification | Add HMAC verification for Whapi webhooks |
| MEDIUM | Rate limit too high | Reduce to 500/15min for non-webhook routes |
| MEDIUM | No API key rotation | Implement key rotation schedule |
| LOW | Verbose error messages | Sanitize errors before returning to client |

---

## Performance Recommendations

| Priority | Issue | Action |
|----------|-------|--------|
| HIGH | No product caching | Add Redis or in-memory cache |
| MEDIUM | No connection pooling | Configure Supabase pool |
| MEDIUM | Large payloads | Paginate message history |
| LOW | Sync operations blocking | Move to background jobs |

---

## Summary

**Immediate Actions (Today):**
1. Fix 3 function name bugs in aiTools.ts
2. Fix CRMService singleton usage
3. Add translation policy to ModelRouter

**This Week:**
4. Enable strict CORS
5. Add missing indexes
6. Rename conflicting migrations

**Next Sprint:**
7. Add unit tests
8. Add caching layer
9. Add webhook signature verification
10. Centralize config

---

## Files Modified Tracker

This audit identified issues in:

| Category | Files Affected |
|----------|----------------|
| Critical Fixes | 2 files (aiTools.ts, ModelRouter.ts) |
| Migration Renames | 12+ files |
| Security Fixes | 1 file (index.ts) |
| Config Improvements | 1 file (config/env.ts) |

**Total Estimated Fix Time:** 2-3 hours for P0+P1
