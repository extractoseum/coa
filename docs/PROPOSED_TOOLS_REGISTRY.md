# Proposed AI Tools Registry - Audit & Gaps

**Fecha:** 2025-12-22
**Auditor:** Claude Code (Mission K)
**Objetivo:** Identificar herramientas faltantes basadas en servicios existentes

---

## Current Tools in aiTools.ts (14 Total)

| # | Tool Name | Category | Status |
|---|-----------|----------|--------|
| 1 | `get_recent_orders` | Shopify | Active |
| 2 | `search_clients` | CRM | Active |
| 3 | `search_shopify_customers` | Shopify | Active |
| 4 | `get_customer_orders_live` | Shopify | Active |
| 5 | `get_system_health` | Admin | Active |
| 6 | `read_file_content` | Admin | Active |
| 7 | `list_directory` | Admin | Active |
| 8 | `get_logs` | Admin | Active |
| 9 | `get_active_clients_count_today` | Analytics | Active |
| 10 | `get_recent_scans_details` | Analytics | Active |
| 11 | `restart_backend_service` | Admin | Active |
| 12 | `search_products_db` | Shopify | Active |
| 13 | `create_checkout_link` | Shopify | Active |
| 14 | `search_knowledge_base` | AI | Active |

---

## MISSING TOOLS - High Priority

### 1. WhatsApp / Whapi Tools

```typescript
// TOOL: send_whatsapp_message
{
    type: 'function',
    function: {
        name: 'send_whatsapp_message',
        description: 'Envía un mensaje de WhatsApp a un número específico. Usar para comunicación directa con clientes.',
        parameters: {
            type: 'object',
            properties: {
                phone: { type: 'string', description: 'Número de teléfono (formato: 5512345678)' },
                message: { type: 'string', description: 'Contenido del mensaje' }
            },
            required: ['phone', 'message']
        }
    }
}

// HANDLER
send_whatsapp_message: async ({ phone, message }) => {
    const { sendWhatsAppMessage } = require('./whapiService');
    const result = await sendWhatsAppMessage({ to: phone, body: message });
    return result.sent
        ? { success: true, message_id: result.message?.id }
        : { success: false, error: result.error };
}
```

```typescript
// TOOL: check_whatsapp_status
{
    type: 'function',
    function: {
        name: 'check_whatsapp_status',
        description: 'Verifica el estado de conexión de WhatsApp Business.',
        parameters: { type: 'object', properties: {} }
    }
}

// HANDLER
check_whatsapp_status: async () => {
    const { checkWhapiStatus } = require('./whapiService');
    return checkWhapiStatus();
}
```

---

### 2. Voice / Vapi Tools

```typescript
// TOOL: initiate_voice_call
{
    type: 'function',
    function: {
        name: 'initiate_voice_call',
        description: 'Inicia una llamada de voz con un cliente usando Vapi AI.',
        parameters: {
            type: 'object',
            properties: {
                phone: { type: 'string', description: 'Número de teléfono del cliente' },
                customer_name: { type: 'string', description: 'Nombre del cliente (opcional)' },
                conversation_id: { type: 'string', description: 'ID de conversación CRM para vincular' }
            },
            required: ['phone']
        }
    }
}

// HANDLER
initiate_voice_call: async ({ phone, customer_name, conversation_id }) => {
    const { VapiService } = require('./VapiService');
    const vapi = new VapiService();
    try {
        const call = await vapi.createCall({
            phoneNumber: phone,
            customerName: customer_name,
            conversationId: conversation_id
        });
        return { success: true, call_id: call.id, status: call.status };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
```

```typescript
// TOOL: get_voice_call_history
{
    type: 'function',
    function: {
        name: 'get_voice_call_history',
        description: 'Obtiene el historial de llamadas de voz para una conversación.',
        parameters: {
            type: 'object',
            properties: {
                conversation_id: { type: 'string', description: 'ID de conversación CRM' }
            },
            required: ['conversation_id']
        }
    }
}

// HANDLER
get_voice_call_history: async ({ conversation_id }) => {
    const { data, error } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) throw error;
    return data.map(c => ({
        id: c.id,
        direction: c.direction,
        status: c.status,
        duration: c.duration_seconds,
        summary: c.summary,
        recording_url: c.recording_url,
        created_at: c.created_at
    }));
}
```

---

### 3. CRM / Conversation Tools

```typescript
// TOOL: get_conversation_summary
{
    type: 'function',
    function: {
        name: 'get_conversation_summary',
        description: 'Obtiene el resumen de una conversación específica del CRM.',
        parameters: {
            type: 'object',
            properties: {
                conversation_id: { type: 'string', description: 'UUID de la conversación' }
            },
            required: ['conversation_id']
        }
    }
}

// HANDLER
get_conversation_summary: async ({ conversation_id }) => {
    const { data, error } = await supabase
        .from('conversations')
        .select('id, summary, facts, status, last_message_at, contact_handle')
        .eq('id', conversation_id)
        .single();

    if (error) throw error;
    return data;
}
```

```typescript
// TOOL: get_contact_360
{
    type: 'function',
    function: {
        name: 'get_contact_360',
        description: 'Obtiene el perfil completo "Customer 360" de un contacto (LTV, órdenes, tags, riesgo).',
        parameters: {
            type: 'object',
            properties: {
                phone: { type: 'string', description: 'Teléfono del contacto' }
            },
            required: ['phone']
        }
    }
}

// HANDLER
get_contact_360: async ({ phone }) => {
    const { CRMService } = require('./CRMService');
    const crm = CRMService.getInstance();
    return crm.getContactSnapshot(phone, 'WA');
}
```

```typescript
// TOOL: move_conversation_to_column
{
    type: 'function',
    function: {
        name: 'move_conversation_to_column',
        description: 'Mueve una conversación a una columna específica del CRM Kanban.',
        parameters: {
            type: 'object',
            properties: {
                conversation_id: { type: 'string', description: 'UUID de la conversación' },
                column_name: { type: 'string', description: 'Nombre de la columna destino (ej: "Soporte Humano", "Ventas")' }
            },
            required: ['conversation_id', 'column_name']
        }
    }
}

// HANDLER
move_conversation_to_column: async ({ conversation_id, column_name }) => {
    // Find column by name
    const { data: column } = await supabase
        .from('crm_columns')
        .select('id')
        .ilike('name', `%${column_name}%`)
        .single();

    if (!column) return { error: `Column "${column_name}" not found` };

    const { CRMService } = require('./CRMService');
    const crm = CRMService.getInstance();
    await crm.moveConversation(conversation_id, column.id);
    return { success: true, moved_to: column_name };
}
```

---

### 4. Analytics / Insights Tools

```typescript
// TOOL: get_system_insights
{
    type: 'function',
    function: {
        name: 'get_system_insights',
        description: 'Obtiene alertas e insights del sistema (errores, rendimiento).',
        parameters: { type: 'object', properties: {} }
    }
}

// HANDLER
get_system_insights: async () => {
    const { getInsights } = require('./insightService');
    return getInsights();
}
```

```typescript
// TOOL: get_ai_usage_stats
{
    type: 'function',
    function: {
        name: 'get_ai_usage_stats',
        description: 'Obtiene estadísticas de uso de APIs de AI (tokens, costos estimados).',
        parameters: {
            type: 'object',
            properties: {
                days: { type: 'number', description: 'Días hacia atrás (default 7)' }
            }
        }
    }
}

// HANDLER
get_ai_usage_stats: async ({ days = 7 }) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('model, input_tokens, output_tokens, created_at')
        .gte('created_at', since);

    if (error) throw error;

    // Aggregate by model
    const byModel: Record<string, { calls: number, input: number, output: number }> = {};
    data.forEach(log => {
        if (!byModel[log.model]) byModel[log.model] = { calls: 0, input: 0, output: 0 };
        byModel[log.model].calls++;
        byModel[log.model].input += log.input_tokens;
        byModel[log.model].output += log.output_tokens;
    });

    return { period_days: days, usage_by_model: byModel, total_calls: data.length };
}
```

```typescript
// TOOL: get_behavior_insights
{
    type: 'function',
    function: {
        name: 'get_behavior_insights',
        description: 'Obtiene insights de comportamiento de navegación para un contacto.',
        parameters: {
            type: 'object',
            properties: {
                phone: { type: 'string', description: 'Teléfono del contacto' }
            },
            required: ['phone']
        }
    }
}

// HANDLER
get_behavior_insights: async ({ phone }) => {
    const last10 = phone.replace(/\D/g, '').slice(-10);

    const { data, error } = await supabase
        .from('browsing_behavior')
        .select('*')
        .ilike('phone', `%${last10}%`)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) throw error;

    // Aggregate pages viewed
    const pages: Record<string, number> = {};
    let totalTime = 0;

    data.forEach(b => {
        pages[b.page_url] = (pages[b.page_url] || 0) + 1;
        totalTime += b.time_on_page || 0;
    });

    return {
        events: data.length,
        pages_visited: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 5),
        avg_time_per_page: data.length > 0 ? Math.round(totalTime / data.length) : 0
    };
}
```

---

### 5. Shopify Extended Tools

```typescript
// TOOL: get_order_tracking
{
    type: 'function',
    function: {
        name: 'get_order_tracking',
        description: 'Obtiene el estado de rastreo de un pedido específico.',
        parameters: {
            type: 'object',
            properties: {
                order_id: { type: 'string', description: 'ID del pedido de Shopify' }
            },
            required: ['order_id']
        }
    }
}

// HANDLER
get_order_tracking: async ({ order_id }) => {
    const { getShopifyOrderById } = require('./shopifyService');
    const order = await getShopifyOrderById(order_id);

    if (!order) return { error: 'Order not found' };

    const fulfillment = order.fulfillments?.[0];
    return {
        order_number: order.name,
        status: order.fulfillment_status || 'unfulfilled',
        tracking_number: fulfillment?.tracking_number || null,
        tracking_url: fulfillment?.tracking_url || null,
        carrier: fulfillment?.tracking_company || null,
        shipped_at: fulfillment?.created_at || null
    };
}
```

```typescript
// TOOL: create_shopify_coupon
{
    type: 'function',
    function: {
        name: 'create_shopify_coupon',
        description: 'Crea un cupón de descuento en Shopify.',
        parameters: {
            type: 'object',
            properties: {
                code: { type: 'string', description: 'Código del cupón (ej: DESCUENTO10)' },
                discount: { type: 'string', description: 'Descuento (ej: "10%" o "100")' }
            },
            required: ['code', 'discount']
        }
    }
}

// HANDLER
create_shopify_coupon: async ({ code, discount }) => {
    const { createShopifyPriceRule, createShopifyDiscountCode } = require('./shopifyService');

    const isPercentage = discount.includes('%');
    let value = discount.replace('%', '');
    if (!value.startsWith('-')) value = `-${value}`;

    const priceRule = await createShopifyPriceRule({
        title: `AI_COUPON_${code}_${Date.now()}`,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: isPercentage ? 'percentage' : 'fixed_amount',
        value: value,
        customer_selection: 'all',
        starts_at: new Date().toISOString()
    });

    const discountCode = await createShopifyDiscountCode(priceRule.id, code);
    return { success: true, code: code, discount: discount };
}
```

```typescript
// TOOL: sync_products_from_shopify
{
    type: 'function',
    function: {
        name: 'sync_products_from_shopify',
        description: 'Sincroniza todos los productos de Shopify a la base de datos local. Usar solo cuando sea necesario actualizar catálogo.',
        parameters: { type: 'object', properties: {} }
    }
}

// HANDLER
sync_products_from_shopify: async () => {
    const { syncProductsToLocalDB } = require('./shopifyService');
    return syncProductsToLocalDB();
}
```

---

### 6. ElevenLabs / Voice Generation Tools

```typescript
// TOOL: generate_voice_message
{
    type: 'function',
    function: {
        name: 'generate_voice_message',
        description: 'Genera un mensaje de voz usando ElevenLabs TTS.',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Texto a convertir en voz' },
                voice_id: { type: 'string', description: 'ID de voz ElevenLabs (default: Rachel - 21m00Tcm4TlvDq8ikWAM)' },
                emotion: { type: 'string', description: 'Emoción: happy, serious, urgent, neutral' }
            },
            required: ['text']
        }
    }
}

// HANDLER
generate_voice_message: async ({ text, voice_id, emotion }) => {
    const { ElevenLabsService } = require('./ElevenLabsService');
    const elevenlabs = new ElevenLabsService();

    const voiceSettings = emotion ? elevenlabs.mapEmotionToSettings(emotion) : undefined;
    const audioBuffer = await elevenlabs.generateAudio(
        text,
        voice_id || '21m00Tcm4TlvDq8ikWAM', // Rachel
        voiceSettings
    );

    // Upload to storage and return URL
    const filename = `voice_generated/${Date.now()}.mp3`;
    const { data: uploadData, error } = await supabase.storage
        .from('crm_attachments')
        .upload(filename, audioBuffer, { contentType: 'audio/mpeg' });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage.from('crm_attachments').getPublicUrl(filename);
    return { success: true, audio_url: publicUrlData.publicUrl };
}
```

---

### 7. COA System Tools

```typescript
// TOOL: search_coas
{
    type: 'function',
    function: {
        name: 'search_coas',
        description: 'Busca Certificados de Análisis (COA) por nombre, lote o código.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Término de búsqueda' }
            },
            required: ['query']
        }
    }
}

// HANDLER
search_coas: async ({ query }) => {
    const { data, error } = await supabase
        .from('coas')
        .select('id, custom_name, custom_title, coa_number, batch_number, status, public_url')
        .or(`custom_name.ilike.%${query}%,coa_number.ilike.%${query}%,batch_number.ilike.%${query}%`)
        .eq('is_hidden', false)
        .limit(10);

    if (error) throw error;
    return data;
}
```

```typescript
// TOOL: get_coa_details
{
    type: 'function',
    function: {
        name: 'get_coa_details',
        description: 'Obtiene los detalles completos de un COA específico.',
        parameters: {
            type: 'object',
            properties: {
                coa_id: { type: 'string', description: 'UUID del COA' }
            },
            required: ['coa_id']
        }
    }
}

// HANDLER
get_coa_details: async ({ coa_id }) => {
    const { data, error } = await supabase
        .from('coas')
        .select('*')
        .eq('id', coa_id)
        .single();

    if (error) throw error;
    return data;
}
```

---

## Summary: Tools to Add

| Category | New Tools | Priority |
|----------|-----------|----------|
| WhatsApp | `send_whatsapp_message`, `check_whatsapp_status` | **HIGH** |
| Voice/Vapi | `initiate_voice_call`, `get_voice_call_history` | **HIGH** |
| CRM | `get_conversation_summary`, `get_contact_360`, `move_conversation_to_column` | **HIGH** |
| Analytics | `get_system_insights`, `get_ai_usage_stats`, `get_behavior_insights` | **MEDIUM** |
| Shopify | `get_order_tracking`, `create_shopify_coupon`, `sync_products_from_shopify` | **MEDIUM** |
| Voice Gen | `generate_voice_message` | **MEDIUM** |
| COA | `search_coas`, `get_coa_details` | **LOW** |

**Total Current Tools:** 14
**Total Proposed New Tools:** 15
**New Total:** 29

---

## Quick Implementation Checklist

### Phase 1 - Critical (WhatsApp + Voice + CRM)
- [ ] `send_whatsapp_message`
- [ ] `check_whatsapp_status`
- [ ] `initiate_voice_call`
- [ ] `get_conversation_summary`
- [ ] `get_contact_360`
- [ ] `move_conversation_to_column`

### Phase 2 - Analytics & Insights
- [ ] `get_system_insights`
- [ ] `get_ai_usage_stats`
- [ ] `get_behavior_insights`
- [ ] `get_voice_call_history`

### Phase 3 - Extended Features
- [ ] `get_order_tracking`
- [ ] `create_shopify_coupon`
- [ ] `sync_products_from_shopify`
- [ ] `generate_voice_message`
- [ ] `search_coas`
- [ ] `get_coa_details`

---

## Tools Registry JSON Format (For tools_registry.json)

```json
{
  "version": "2.0.0",
  "updated_at": "2025-12-22",
  "tools": [
    {
      "name": "send_whatsapp_message",
      "category": "communication",
      "description": "Envía un mensaje de WhatsApp a un número específico",
      "service": "whapiService",
      "requires_auth": true,
      "risk_level": "medium"
    },
    {
      "name": "initiate_voice_call",
      "category": "voice",
      "description": "Inicia una llamada de voz con Vapi AI",
      "service": "VapiService",
      "requires_auth": true,
      "risk_level": "high"
    }
    // ... etc
  ]
}
```

---

## Security Considerations

| Tool | Risk | Mitigation |
|------|------|------------|
| `send_whatsapp_message` | Spam/Abuse | Rate limit, require conversation context |
| `initiate_voice_call` | Cost/Abuse | Admin-only, daily limit |
| `restart_backend_service` | System crash | Super-admin only |
| `sync_products_from_shopify` | API limits | Cooldown period, not for chat agents |
| `generate_voice_message` | Cost | Token limit per day |

---

## Next Steps

1. **Review this document** and approve tools to implement
2. **Add to aiTools.ts** in phases
3. **Update tools_registry.json** for documentation
4. **Test each tool** in isolation before exposing to agents
5. **Configure tool whitelists** per agent persona
