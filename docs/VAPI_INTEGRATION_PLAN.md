# Vapi Voice AI Integration Plan

## Overview

Integración de llamadas de voz en tiempo real usando [Vapi](https://vapi.ai) para el sistema COA Viewer / Omnichannel Orchestrator.

**Arquitectura Vapi:**
```
┌─────────────────────────────────────────────────────────────┐
│                    VAPI ORCHESTRATION                       │
├─────────────────────────────────────────────────────────────┤
│  📞 Telephony    →   🎤 STT        →   🧠 LLM              │
│  (Twilio/SIP)        (Deepgram)        (GPT-4o/Claude)     │
│                                                             │
│                  ←   🔊 TTS        ←                        │
│                      (ElevenLabs)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. API Reference

### Base URL
```
https://api.vapi.ai
```

### Authentication
```http
Authorization: Bearer YOUR_VAPI_API_KEY
Content-Type: application/json
```

---

## 2. Core Endpoints

### 2.1 Crear Llamada Outbound
```http
POST /call
```

```typescript
interface CreateCallRequest {
  // REQUIRED: Phone number to call
  phoneNumberId?: string;      // Your Vapi phone number ID
  customer: {
    number: string;            // E.164 format: +521XXXXXXXXXX
    name?: string;
  };

  // Assistant Configuration (choose one)
  assistantId?: string;        // Pre-configured assistant
  assistant?: TransientAssistant; // Inline configuration

  // Optional
  squadId?: string;            // Multi-agent orchestration
  metadata?: Record<string, any>;
}
```

**Response:**
```typescript
interface CallResponse {
  id: string;                  // Call UUID
  orgId: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'ended';
  phoneNumberId: string;
  customer: { number: string; name?: string };
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  analysis?: object;
}
```

### 2.2 Listar Llamadas
```http
GET /call
GET /call/{id}
```

### 2.3 Actualizar Llamada (Live Control)
```http
PATCH /call/{id}
```
```typescript
{
  // Inject message during call
  messages?: [{ role: 'system' | 'assistant', content: string }]
}
```

### 2.4 Terminar Llamada
```http
DELETE /call/{id}
```

---

## 3. Assistant Configuration

### 3.1 Crear Assistant
```http
POST /assistant
```

```typescript
interface CreateAssistantRequest {
  name: string;

  // Voice Configuration
  voice: {
    provider: 'elevenlabs' | 'openai' | 'playht' | 'azure';
    voiceId: string;           // e.g., "21m00Tcm4TlvDq8ikWAM"
    stability?: number;        // 0-1
    similarityBoost?: number;  // 0-1
    speed?: number;            // 0.25-4.0
  };

  // LLM Configuration
  model: {
    provider: 'openai' | 'anthropic' | 'groq';
    model: string;             // e.g., "gpt-4o", "claude-3-5-sonnet-20241022"
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  };

  // Transcriber Configuration
  transcriber?: {
    provider: 'deepgram' | 'assemblyai' | 'gladia' | 'openai';
    model?: string;
    language?: string;         // e.g., "es"
  };

  // Tools/Functions
  tools?: VapiTool[];

  // Server for webhooks
  serverUrl?: string;
  serverUrlSecret?: string;

  // Behavior
  firstMessage?: string;       // Greeting
  voicemailMessage?: string;
  endCallMessage?: string;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  hipaaEnabled?: boolean;
}
```

### 3.2 COA-Specific Assistant Template
```typescript
const coaAssistant = {
  name: "Ara - COA Assistant",

  voice: {
    provider: "elevenlabs",
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel voice
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1.0
  },

  model: {
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.7,
    systemPrompt: `Eres Ara, la asistente virtual de Extractos EUM.
Tu rol es ayudar con:
- Consultas sobre COA (Certificados de Análisis)
- Estado de pedidos
- Información de productos
- Soporte técnico

Responde siempre en español de forma clara y profesional.
Si detectas frustración, escala a un humano.`
  },

  transcriber: {
    provider: "deepgram",
    model: "nova-2",
    language: "es"
  },

  serverUrl: "https://your-backend.com/api/vapi/webhook",

  firstMessage: "Hola, soy Ara de Extractos EUM. ¿En qué puedo ayudarte hoy?",
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600 // 10 min max
};
```

---

## 4. Webhook Events (Server URL)

### 4.1 Event Types

| Event | Requires Response | Description |
|-------|-------------------|-------------|
| `assistant-request` | ✅ (7.5s timeout) | Dynamic assistant selection for inbound |
| `tool-calls` | ✅ | Function execution results |
| `status-update` | ❌ | Call state changes |
| `transcript` | ❌ | Real-time transcription |
| `end-of-call-report` | ❌ | Final summary, recording URL |
| `hang` | ❌ | System delay alert |

### 4.2 Webhook Handler Structure

```typescript
// backend/src/controllers/vapiController.ts

interface VapiWebhookPayload {
  message: {
    type: string;
    call: VapiCall;
    // Type-specific fields
  };
}

// assistant-request response
interface AssistantRequestResponse {
  assistantId?: string;
  assistant?: TransientAssistant;
  error?: string;
}

// tool-calls response
interface ToolCallResponse {
  results: Array<{
    toolCallId: string;
    result: string | object;
  }>;
}

// end-of-call-report payload
interface EndOfCallReport {
  type: 'end-of-call-report';
  call: VapiCall;
  transcript: string;
  recordingUrl: string;
  summary: string;
  endedReason: string;
  messages: Array<{
    role: 'assistant' | 'user';
    message: string;
    time: number;
  }>;
}
```

---

## 5. Phone Number Management

### 5.1 Import Existing Number (Twilio)
```http
POST /phone-number
```

```typescript
{
  provider: "twilio",
  twilioAccountSid: "AC...",
  twilioAuthToken: "...",
  number: "+521XXXXXXXXXX",
  assistantId: "ast_xxxxx",
  serverUrl: "https://your-backend.com/api/vapi/webhook"
}
```

### 5.2 Buy New Number
```http
POST /phone-number
```

```typescript
{
  provider: "vapi",
  areaCode: "55",    // Mexico City
  assistantId: "ast_xxxxx"
}
```

---

## 6. Integration Architecture

### 6.1 System Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                         COA VIEWER + VAPI                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │
│  │  WhatsApp   │     │   Vapi      │     │   CRM       │            │
│  │  (Whapi)    │     │  (Calls)    │     │  (Supabase) │            │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘            │
│         │                   │                   │                    │
│         ▼                   ▼                   ▼                    │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              BACKEND (Express.js)                     │           │
│  ├──────────────────────────────────────────────────────┤           │
│  │  /api/whapi/webhook    → CRMService                  │           │
│  │  /api/vapi/webhook     → VapiService (NEW)           │           │
│  │  /api/crm/call         → Initiate outbound call      │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │                    SERVICES                           │           │
│  ├──────────────────────────────────────────────────────┤           │
│  │  VapiService                                          │           │
│  │    ├── createCall(phoneNumber, assistantId)          │           │
│  │    ├── handleWebhook(event)                          │           │
│  │    ├── getAssistantForColumn(columnId)               │           │
│  │    └── syncCallToConversation(callData)              │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Database Schema Extension

```sql
-- Migration: 043_vapi_integration.sql

-- Store Vapi assistant configurations per column
ALTER TABLE crm_columns ADD COLUMN IF NOT EXISTS
  vapi_assistant_id VARCHAR(100);

-- Track voice calls
CREATE TABLE IF NOT EXISTS voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id VARCHAR(100) UNIQUE NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  client_id UUID REFERENCES clients(id),

  -- Call Metadata
  direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
  phone_number VARCHAR(20),
  status VARCHAR(20),

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  -- Content
  transcript TEXT,
  summary TEXT,
  recording_url TEXT,

  -- Analysis (from Vapi)
  ended_reason VARCHAR(50),
  sentiment VARCHAR(20),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_voice_calls_conversation ON voice_calls(conversation_id);
CREATE INDEX idx_voice_calls_vapi_id ON voice_calls(vapi_call_id);
```

---

## 7. Implementation Files

### 7.1 VapiService.ts

```typescript
// backend/src/services/VapiService.ts

import axios from 'axios';
import { supabase } from '../config/supabase';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';

const vapiApi = axios.create({
  baseURL: VAPI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

export class VapiService {

  /**
   * Initiate outbound call to customer
   */
  async createCall(params: {
    phoneNumber: string;
    customerName?: string;
    assistantId?: string;
    conversationId?: string;
    metadata?: Record<string, any>;
  }) {
    const response = await vapiApi.post('/call', {
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: this.normalizePhone(params.phoneNumber),
        name: params.customerName
      },
      assistantId: params.assistantId || process.env.VAPI_DEFAULT_ASSISTANT_ID,
      metadata: {
        conversationId: params.conversationId,
        ...params.metadata
      }
    });

    // Track in DB
    await supabase.from('voice_calls').insert({
      vapi_call_id: response.data.id,
      conversation_id: params.conversationId,
      direction: 'outbound',
      phone_number: params.phoneNumber,
      status: 'queued'
    });

    return response.data;
  }

  /**
   * Handle incoming webhook events
   */
  async handleWebhook(payload: any) {
    const { type } = payload.message;
    const call = payload.message.call;

    switch (type) {
      case 'assistant-request':
        return this.handleAssistantRequest(call);

      case 'tool-calls':
        return this.handleToolCalls(payload.message);

      case 'status-update':
        await this.updateCallStatus(call);
        break;

      case 'end-of-call-report':
        await this.handleEndOfCall(payload.message);
        break;

      case 'transcript':
        // Optional: real-time transcript updates
        break;
    }

    return { success: true };
  }

  /**
   * Dynamic assistant selection for inbound calls
   */
  private async handleAssistantRequest(call: any) {
    // Look up by phone number → channel chip → column → assistant
    const { data: chip } = await supabase
      .from('channel_chips')
      .select('default_entry_column_id')
      .eq('account_reference', call.customer?.number)
      .single();

    if (chip?.default_entry_column_id) {
      const { data: column } = await supabase
        .from('crm_columns')
        .select('vapi_assistant_id')
        .eq('id', chip.default_entry_column_id)
        .single();

      if (column?.vapi_assistant_id) {
        return { assistantId: column.vapi_assistant_id };
      }
    }

    // Default fallback
    return { assistantId: process.env.VAPI_DEFAULT_ASSISTANT_ID };
  }

  /**
   * Execute tool calls (CRM lookups, COA queries, etc.)
   */
  private async handleToolCalls(message: any) {
    const results = [];

    for (const toolCall of message.toolWithToolCallList || []) {
      let result;

      switch (toolCall.name) {
        case 'lookup_client':
          result = await this.lookupClient(toolCall.arguments);
          break;
        case 'get_coa_status':
          result = await this.getCOAStatus(toolCall.arguments);
          break;
        case 'escalate_to_human':
          result = await this.escalateToHuman(toolCall.arguments);
          break;
        default:
          result = { error: 'Unknown tool' };
      }

      results.push({
        toolCallId: toolCall.id,
        result: JSON.stringify(result)
      });
    }

    return { results };
  }

  /**
   * Sync completed call to CRM conversation
   */
  private async handleEndOfCall(report: any) {
    const call = report.call;

    // Update voice_calls record
    await supabase.from('voice_calls').update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      duration_seconds: report.durationSeconds,
      transcript: report.transcript,
      summary: report.summary,
      recording_url: report.recordingUrl,
      ended_reason: report.endedReason
    }).eq('vapi_call_id', call.id);

    // Create CRM message with call summary
    const { data: voiceCall } = await supabase
      .from('voice_calls')
      .select('conversation_id')
      .eq('vapi_call_id', call.id)
      .single();

    if (voiceCall?.conversation_id) {
      await supabase.from('crm_messages').insert({
        conversation_id: voiceCall.conversation_id,
        direction: 'inbound',
        role: 'system',
        message_type: 'call_summary',
        content: `📞 **Llamada finalizada** (${Math.round(report.durationSeconds / 60)}min)

**Resumen:** ${report.summary}

**Razón de fin:** ${report.endedReason}

[🎧 Escuchar grabación](${report.recordingUrl})`,
        raw_payload: report
      });
    }
  }

  // Helper functions
  private async lookupClient(args: { phone?: string; email?: string }) {
    const query = supabase.from('clients').select('*');
    if (args.phone) query.eq('phone', args.phone);
    if (args.email) query.eq('email', args.email);
    const { data } = await query.single();
    return data || { found: false };
  }

  private async getCOAStatus(args: { batch_number: string }) {
    // Implement COA lookup logic
    return { status: 'pending', batch: args.batch_number };
  }

  private async escalateToHuman(args: { reason: string }) {
    // Trigger human escalation flow
    return { escalated: true, reason: args.reason };
  }

  private normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) return `+521${clean}`;
    if (clean.startsWith('521') && clean.length === 13) return `+${clean}`;
    return `+${clean}`;
  }
}
```

### 7.2 Controller & Routes

```typescript
// backend/src/controllers/vapiController.ts

import { Request, Response } from 'express';
import { VapiService } from '../services/VapiService';

const vapiService = new VapiService();

export const handleVapiWebhook = async (req: Request, res: Response) => {
  try {
    const result = await vapiService.handleWebhook(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('[Vapi Webhook Error]', error);
    res.status(500).json({ error: error.message });
  }
};

export const initiateCall = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, customerName, conversationId } = req.body;
    const call = await vapiService.createCall({
      phoneNumber,
      customerName,
      conversationId
    });
    res.json(call);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
```

```typescript
// backend/src/routes/vapiRoutes.ts

import { Router } from 'express';
import { handleVapiWebhook, initiateCall } from '../controllers/vapiController';

const router = Router();

router.post('/webhook', handleVapiWebhook);
router.post('/call', initiateCall);

export default router;
```

---

## 8. Environment Variables

```env
# .env additions
VAPI_API_KEY=your_vapi_api_key
VAPI_PHONE_NUMBER_ID=phn_xxxxxxxxxxxxx
VAPI_DEFAULT_ASSISTANT_ID=ast_xxxxxxxxxxxxx
VAPI_WEBHOOK_SECRET=your_webhook_secret
```

---

## 9. Tools Configuration (Assistant Functions)

```typescript
const coaTools = [
  {
    type: 'function',
    function: {
      name: 'lookup_client',
      description: 'Busca información del cliente por teléfono o email',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Número de teléfono del cliente' },
          email: { type: 'string', description: 'Email del cliente' }
        }
      }
    },
    server: { url: 'https://your-backend.com/api/vapi/webhook' }
  },
  {
    type: 'function',
    function: {
      name: 'get_coa_status',
      description: 'Consulta el estado de un Certificado de Análisis',
      parameters: {
        type: 'object',
        properties: {
          batch_number: { type: 'string', description: 'Número de lote del producto' }
        },
        required: ['batch_number']
      }
    },
    server: { url: 'https://your-backend.com/api/vapi/webhook' }
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Escala la llamada a un agente humano',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Razón de la escalación' }
        },
        required: ['reason']
      }
    },
    server: { url: 'https://your-backend.com/api/vapi/webhook' }
  }
];
```

---

## 10. Latency Considerations

| Component | Latency | Recommendation |
|-----------|---------|----------------|
| STT (Deepgram) | ~150ms | Use `nova-2` for Spanish |
| LLM (GPT-4o) | ~300-500ms | Use `gpt-4o-mini` for simple queries |
| TTS (ElevenLabs) | ~200ms | Use `eleven_flash_v2_5` for speed |
| **Total E2E** | **~500-700ms** | Acceptable for real-time |

---

## 11. Cost Estimates

| Item | Cost | Notes |
|------|------|-------|
| Vapi Base | $0.05/min | Platform fee |
| Deepgram STT | $0.0043/min | Nova-2 |
| GPT-4o | ~$0.01/call | Avg 500 tokens |
| ElevenLabs TTS | $0.18/1K chars | ~$0.05/min speech |
| **Total/min** | **~$0.10-0.15** | Depends on usage |

---

## 12. Implementation Phases

### Phase 1: Basic Integration (Week 1)
- [ ] Create VapiService.ts
- [ ] Add webhook routes
- [ ] Create 043_vapi_integration.sql migration
- [ ] Configure Vapi assistant in dashboard
- [ ] Test outbound calls

### Phase 2: CRM Integration (Week 2)
- [ ] Sync calls to conversations
- [ ] Add call button to CRM UI
- [ ] Implement tool functions (lookup, COA status)
- [ ] Add VoiceSelector for Vapi assistants

### Phase 3: Advanced Features (Week 3)
- [ ] Inbound call routing via channel chips
- [ ] Real-time transcript display
- [ ] Call analytics dashboard
- [ ] Squad configuration for transfers

---

## Sources

- [Vapi Documentation](https://docs.vapi.ai)
- [Vapi API Reference](https://docs.vapi.ai/api-reference)
- [Vapi Server Events](https://docs.vapi.ai/server-url/events)
- [ElevenLabs Real-time API](https://elevenlabs.io/docs/websockets)
- [WhatsApp Business Calling API](https://business.whatsapp.com/blog/whatsapp-business-calling-api)
