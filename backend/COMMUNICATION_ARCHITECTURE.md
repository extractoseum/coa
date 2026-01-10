# Communication Architecture - Extractos EUM

> Technical documentation for AI agents and developers working on the communication system.
> Last updated: 2026-01-10

## System Overview

The communication system provides **multi-channel messaging with automatic fallbacks** to ensure messages reach customers even when primary channels fail.

```
                                    ┌─────────────────────────────────────────┐
                                    │         SmartCommunicationService       │
                                    │    (Orchestrator with Health Tracking)  │
                                    └─────────────────┬───────────────────────┘
                                                      │
              ┌───────────────────┬───────────────────┼───────────────────┬───────────────────┐
              ▼                   ▼                   ▼                   ▼                   ▼
        ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐        ┌──────────┐
        │ WhatsApp │        │  Email   │        │   SMS    │        │   Push   │        │  Voice   │
        │  (Whapi) │        │  (SMTP)  │        │ (Twilio) │        │(OneSignal)│       │ (Twilio) │
        │ 3 tokens │        │          │        │Multi-Acct│        │          │        │+Claude AI│
        └──────────┘        └──────────┘        └──────────┘        └──────────┘        └──────────┘
```

---

## 1. SmartCommunicationService

**Location:** `backend/src/services/SmartCommunicationService.ts`

### Message Types & Priority Chains

| Type | Use Case | Channel Priority |
|------|----------|------------------|
| `instant` | Time-sensitive | WhatsApp → SMS → Push |
| `informational` | General updates | WhatsApp → Email → Push |
| `transactional` | Orders, receipts | Email + WhatsApp (parallel) |
| `critical` | Security alerts | ALL channels (parallel) |

### Channel Health System

```typescript
// Health states
type ChannelStatus = 'healthy' | 'degraded' | 'down';

// Transitions:
// - 0 failures = healthy
// - 1-2 failures = degraded
// - 3+ failures = down (channel disabled)
```

**Auto-Recovery:** Channels marked `healthy` on first successful send after failure.

**Admin Alerts:** Email sent to admins when channel becomes `degraded` or `down` (15-min cooldown).

### WhatsApp Token Rotation

```
WHAPI_TOKEN (primary)
    ↓ fails
WHAPI_TOKEN_BACKUP_1
    ↓ fails
WHAPI_TOKEN_BACKUP_2
    ↓ fails
Return error (all tokens exhausted)
```

Each token has independent failure tracking.

### Email as Universal Backup

For non-email message types, the system:
1. Looks up client email from phone number
2. Sends HTML-formatted backup email in background
3. Does not block main flow on email failure

---

## 2. Twilio Multi-Account Architecture

**Location:** `backend/src/services/twilioService.ts`

### Account Structure

```
┌─────────────────────────────────────────────────────────────┐
│  VOICE ACCOUNT (Extractos EUM - Mexico)                     │
│  ├─ TWILIO_ACCOUNT_SID                                      │
│  ├─ TWILIO_AUTH_TOKEN                                       │
│  └─ TWILIO_PHONE_NUMBER = +525596616455 (voice only)        │
├─────────────────────────────────────────────────────────────┤
│  SMS ACCOUNT (Bernardo Paid - US)                           │
│  ├─ TWILIO_SMS_ACCOUNT_SID                                  │
│  ├─ TWILIO_SMS_AUTH_TOKEN                                   │
│  └─ TWILIO_SMS_PHONE_NUMBER = +19154654725 (SMS enabled)    │
├─────────────────────────────────────────────────────────────┤
│  BACKUP ACCOUNT (EUM MX Trial - Emergency)                  │
│  ├─ TWILIO_BACKUP_ACCOUNT_SID                               │
│  ├─ TWILIO_BACKUP_AUTH_TOKEN                                │
│  └─ TWILIO_BACKUP_PHONE_NUMBER = +19284875505               │
└─────────────────────────────────────────────────────────────┘
```

### SMS Sending Priority

```typescript
sendSMS(to, body)
    │
    ├─► Try SMS Account (Bernardo Paid)
    │       ├─ Success → return { success: true, account: 'primary' }
    │       └─ Fail → continue
    │
    └─► Try Backup Account (EUM MX Trial)
            ├─ Success → return { success: true, account: 'backup' }
            └─ Fail → return { success: false, error: 'All SMS accounts failed' }
```

### Why Separate Accounts?

- **Mexican numbers (+52)** cannot send SMS - only voice
- **US numbers (+1)** support both SMS and voice
- Priority given to paid accounts over trial accounts

---

## 3. Voice Call System

**Location:** `backend/src/services/VoiceCallService.ts`

### Pipeline Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌───────────┐
│  Twilio  │────►│ Deepgram │────►│  Claude  │────►│ ElevenLabs│
│(Telephony)│    │  (STT)   │     │   (AI)   │     │   (TTS)   │
└──────────┘     └──────────┘     └──────────┘     └───────────┘
```

### Webhook Flow

```
1. Twilio receives call on any configured number
   │
2. POST /api/voice/incoming
   │
3. VoiceCallService.handleIncomingCall()
   ├─ Lookup customer by phone
   ├─ Create/find conversation
   ├─ Generate TwiML with WebSocket stream
   │
4. Real-time bidirectional audio stream
   ├─ Audio IN  → Deepgram → Text → Claude → Response
   └─ Audio OUT ← ElevenLabs ← Claude response text
```

### Available Voice Tools (Claude)

| Tool | Description |
|------|-------------|
| `search_products` | Search product catalog |
| `lookup_order` | Check order status by number |
| `get_coa` | Retrieve Certificate of Analysis |
| `send_whatsapp` | Send WhatsApp message to caller |
| `escalate_to_human` | Request human agent handoff |

### Call Recording

- Initiated via Twilio API after call connects
- Webhook: `POST /api/voice/recording-status`
- Stored in `voice_calls.recording_url`

---

## 4. Inbound Message Handling

### SMS Inbound

**Webhook:** `POST /api/v1/webhooks/twilio/sms`
**Handler:** `webhookController.handleTwilioSmsInbound`

```
Twilio POST (From, To, Body, MessageSid)
    │
    ├─► Normalize phone (last 10 digits)
    │
    ├─► Find existing conversation
    │   └─ First by SMS channel, then any channel
    │
    ├─► If not found: Create new conversation
    │   ├─ Lookup channel chip: 'sms_twilio'
    │   ├─ Get default CRM column from chip
    │   └─ Insert conversation with channel='SMS'
    │
    ├─► Insert message to crm_messages
    │   └─ direction: 'inbound', channel: 'SMS'
    │
    └─► Return TwiML <Response></Response>
```

### Email Inbound

**Service:** `emailService.startEmailPolling(60000)`
**Interval:** Every 60 seconds

```
Poll Cycle:
    │
    ├─► Connect to IMAP (OAuth2 or password)
    │
    ├─► Fetch unseen emails
    │   └─ Mark as read after fetch
    │
    ├─► For each email:
    │   ├─ Parse with simpleParser
    │   ├─ Find/create conversation
    │   │   └─ Channel chip: 'email_ara_ghostbuster'
    │   ├─ Insert to crm_messages
    │   └─ Update conversation timestamps
    │
    └─► Log poll completion
```

### Channel Chip Routing

Both SMS and Email use the `channel_chips` table for CRM routing:

```sql
channel_chips:
  - channel_id: 'sms_twilio'
  - channel_id: 'email_ara_ghostbuster'
  - default_entry_column_id: UUID of CRM column
  - is_active: boolean
```

If chip inactive or not found, messages go to first CRM column.

---

## 5. Phone Number Normalization

**Location:** `backend/src/utils/phoneUtils.ts`

### Provider-Specific Formats

| Provider | Format | Example |
|----------|--------|---------|
| WhatsApp (Whapi) | No `+`, with `521` for MX mobile | `5215512345678` |
| Twilio/VAPI | E.164 with `+` | `+525512345678` |
| Database | Last 10 digits | `5512345678` |

### Logic

```typescript
normalizePhone(phone, provider)
    │
    ├─ 10 digits → Add country prefix
    │   ├─ whapi: '521' + phone (MX mobile)
    │   └─ twilio/vapi: '52' + phone
    │
    ├─ 12 digits (52...) → Adjust for provider
    │   ├─ whapi: Convert to 521...
    │   └─ twilio: Keep as 52...
    │
    └─ Return formatted phone
```

---

## 6. Key Endpoints Reference

### Voice
- `POST /api/voice/incoming` - Twilio voice webhook
- `POST /api/voice/gather/:callSid` - Speech recognition results
- `POST /api/voice/status` - Call status updates
- `POST /api/voice/recording-status` - Recording completion
- `GET /api/voice/comm-health` - Channel health status

### Webhooks
- `POST /api/v1/webhooks/twilio/sms` - SMS inbound
- `POST /api/v1/webhooks/shopify/*` - Shopify events

### CRM
- `GET /api/crm/comm-health` - Channel health (authenticated)
- `POST /api/crm/comm-health/:channel/reset` - Reset channel health

### VAPI (Legacy/Alternative)
- `POST /api/vapi/webhook` - VAPI assistant webhooks
- `POST /api/vapi/call` - Initiate outbound VAPI call

---

## 7. Environment Variables

### Communication Services

```bash
# WhatsApp (Whapi) - 3 tokens for redundancy
WHAPI_TOKEN=
WHAPI_TOKEN_BACKUP_1=
WHAPI_TOKEN_BACKUP_2=

# Twilio Voice (Mexico - voice only)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+525596616455

# Twilio SMS (US - SMS enabled)
TWILIO_SMS_ACCOUNT_SID=
TWILIO_SMS_AUTH_TOKEN=
TWILIO_SMS_PHONE_NUMBER=+19154654725

# Twilio Backup (Emergency)
TWILIO_BACKUP_ACCOUNT_SID=
TWILIO_BACKUP_AUTH_TOKEN=
TWILIO_BACKUP_PHONE_NUMBER=+19284875505

# Email (Ara - IMAP polling)
ARA_EMAIL_USER=ara@extractoseum.com
ARA_CLIENT_ID=
ARA_CLIENT_SECRET=
ARA_REFRESH_TOKEN=

# Push Notifications
ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=

# Voice AI
ANTHROPIC_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_VOICE_ID=
```

---

## 8. Database Tables

### communication_logs
Tracks all outbound message attempts with channel results.

### voice_calls
Stores call metadata, transcripts, recordings.

### crm_messages
Unified inbox for all channels (WA, SMS, Email, Voice).

### channel_chips
Maps inbound channels to CRM columns.

### system_logs
Alerts, errors, channel down notifications.

---

## 9. Troubleshooting

### SMS Not Sending
1. Check `TWILIO_SMS_*` env vars are set
2. Verify phone normalization for destination country
3. Check `communication_logs` for error details
4. Verify Twilio account balance

### Voice Calls Not Working
1. Verify Twilio webhook URL: `https://coa.extractoseum.com/api/voice/incoming`
2. Check Deepgram/ElevenLabs API keys
3. Review `voice_calls` table for errors
4. Test with `/api/voice/test-incoming`

### Email Polling Issues
1. Check OAuth token validity (ARA_REFRESH_TOKEN)
2. Verify IMAP connection in logs: `[AraEmail] Poll complete:`
3. Check `channel_chips` for `email_ara_ghostbuster` config

### WhatsApp Failures
1. Check Whapi token validity
2. Review channel health: `/api/voice/comm-health`
3. Token rotation logs: `[SmartComm] WhatsApp token 0 failed`
4. Reset channel: `POST /api/crm/comm-health/whatsapp/reset`

---

## 10. Architecture Decisions

### Why Multiple Twilio Accounts?
Mexican phone numbers cannot send SMS internationally. US numbers can. By separating accounts:
- MX number handles voice (local calls)
- US number handles SMS (international reach)
- Trial account provides emergency backup

### Why Token Rotation for WhatsApp?
Whapi has rate limits and occasional token issues. Multiple tokens provide:
- Redundancy if one token fails
- Higher throughput capacity
- Automatic failover without manual intervention

### Why Email as Universal Backup?
Email is the most reliable channel:
- No rate limits like WhatsApp
- No carrier restrictions like SMS
- Works across all countries
- Permanent record for customer

---

*For questions or updates, contact the development team.*
