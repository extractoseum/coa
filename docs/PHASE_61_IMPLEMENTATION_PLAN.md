# Phase 61: Smart Card Indicators + Message Type Hardening

## Executive Summary
Este plan implementa dos mejoras críticas:
1. **Smart Card Indicators** - Indicadores visuales inteligentes en las tarjetas del CRM
2. **Message Type Hardening** - Soporte completo para todos los tipos de mensaje de WhatsApp

---

## 🎯 Objetivos de Confianza de Datos

### Principio: "Zero Ghost Data"
- Todo dato mostrado en UI debe tener origen verificable en BD
- Logs automáticos para auditoría de flujo de datos
- Checkpoints de validación en cada etapa

---

# PARTE A: Smart Card Indicators

## Checkpoint 1: Schema de Base de Datos
**Archivo:** `backend/migrations/049_smart_card_indicators.sql`

### Cambios en Tabla `conversations`:
```sql
-- Nuevas columnas para tracking temporal
first_inbound_at TIMESTAMPTZ      -- Primer mensaje del cliente (para ventana 24h)
last_inbound_at TIMESTAMPTZ       -- Último mensaje del cliente
last_outbound_at TIMESTAMPTZ      -- Última respuesta nuestra

-- Fuente de tráfico
traffic_source VARCHAR(20)        -- 'ads' | 'organic' | 'direct' | 'qr' | 'referral'
utm_source VARCHAR(100)
utm_campaign VARCHAR(100)
ad_platform VARCHAR(20)           -- 'meta' | 'google' | 'tiktok' | null

-- Chip de origen
origin_chip_id UUID               -- FK a channel_chips (para saber por qué chip entró)
```

### Vista Computada `conversation_indicators`:
```sql
-- Cálculos en tiempo real sin duplicar datos
hours_remaining INTEGER           -- Horas restantes de ventana 24h
window_status VARCHAR(10)         -- 'active' | 'expiring' | 'expired'
hours_since_customer DECIMAL      -- Horas desde último mensaje del cliente
is_stalled BOOLEAN               -- Sin actividad > 6h
awaiting_response BOOLEAN        -- Último mensaje fue inbound
is_new_customer BOOLEAN          -- orders_count = 0
is_vip BOOLEAN                   -- ltv > 5000
health_score INTEGER             -- 0-100 calculado
```

### Validación Checkpoint 1:
```sql
-- Query de verificación post-migración
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations'
AND column_name IN ('first_inbound_at', 'last_inbound_at', 'traffic_source', 'origin_chip_id');

-- Debe retornar 4 filas
```

---

## Checkpoint 2: Backend - Captura de Timestamps
**Archivo:** `backend/src/services/CRMService.ts`

### Modificar `processInbound()` para capturar timestamps:

```typescript
// DESPUÉS de insertar mensaje (línea ~500)
// Actualizar timestamps según dirección

const isInbound = raw.direction === 'inbound' || !raw.from_me;

if (isInbound) {
    // Actualizar last_inbound_at y posiblemente first_inbound_at
    const updatePayload: any = {
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString()
    };

    // Si es el primer mensaje inbound, establecer first_inbound_at
    if (!conversation.first_inbound_at) {
        updatePayload.first_inbound_at = new Date().toISOString();
    }

    await supabase
        .from('conversations')
        .update(updatePayload)
        .eq('id', conversation.id);

    // LOG: Verificación de datos reales
    console.log(`[CRM:TIMESTAMP] Inbound captured for ${conversation.id}`, {
        first_inbound_at: updatePayload.first_inbound_at || 'unchanged',
        last_inbound_at: updatePayload.last_inbound_at
    });
} else {
    // Mensaje outbound
    await supabase
        .from('conversations')
        .update({
            last_outbound_at: new Date().toISOString(),
            last_message_at: new Date().toISOString()
        })
        .eq('id', conversation.id);
}
```

### Validación Checkpoint 2:
```typescript
// Test manual: Enviar mensaje y verificar logs
// Buscar en logs: "[CRM:TIMESTAMP] Inbound captured"

// Query de verificación:
SELECT id, contact_handle, first_inbound_at, last_inbound_at, last_outbound_at
FROM conversations
WHERE last_inbound_at IS NOT NULL
ORDER BY last_inbound_at DESC
LIMIT 5;
```

---

## Checkpoint 3: Backend - Captura de Traffic Source
**Archivo:** `backend/src/services/CRMService.ts`

### Modificar `getOrCreateConversation()`:

```typescript
// Al crear nueva conversación, capturar origen
const newConv = await supabase
    .from('conversations')
    .insert({
        channel,
        contact_handle: handle,
        column_id: targetColumnId,
        status: 'active',
        agent_override_id: routing.agent_id,
        channel_chip_id: routing.channel_chip_id,
        // NUEVO: Traffic source tracking
        origin_chip_id: routing.channel_chip_id,
        traffic_source: routing.traffic_source || 'direct',
        first_inbound_at: new Date().toISOString(),
        last_inbound_at: new Date().toISOString(),
        facts: routing.traffic_source ? { traffic_source: routing.traffic_source } : {}
    })
    .select('*')
    .single();

// LOG: Verificación de origen
console.log(`[CRM:ORIGIN] New conversation created`, {
    id: newConv.data?.id,
    handle,
    origin_chip_id: routing.channel_chip_id,
    traffic_source: routing.traffic_source || 'direct'
});
```

### Validación Checkpoint 3:
```sql
-- Verificar que nuevas conversaciones tienen origen
SELECT
    id,
    contact_handle,
    traffic_source,
    origin_chip_id,
    created_at
FROM conversations
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Checkpoint 4: Backend - Enriquecer getConversations()
**Archivo:** `backend/src/services/CRMService.ts`

### Modificar `getConversations()` para incluir indicadores:

```typescript
public async getConversations(status: string[] = ['active', 'paused', 'review']): Promise<any[]> {
    // ... existing query ...

    // Enriquecer con indicadores calculados
    const enrichedConvs = uniqueConvs.map(conv => {
        const now = Date.now();
        const firstInbound = conv.first_inbound_at ? new Date(conv.first_inbound_at).getTime() : now;
        const lastInbound = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : now;
        const lastMessage = conv.last_message_at ? new Date(conv.last_message_at).getTime() : now;

        // Calcular ventana 24h
        const hoursSinceFirstInbound = (now - firstInbound) / (1000 * 60 * 60);
        const hoursRemaining = Math.max(0, 24 - hoursSinceFirstInbound);

        // Calcular estado de ventana
        let windowStatus: 'active' | 'expiring' | 'expired' = 'active';
        if (hoursRemaining <= 0) windowStatus = 'expired';
        else if (hoursRemaining <= 2) windowStatus = 'expiring';

        // Horas desde último mensaje del cliente
        const hoursSinceCustomer = (now - lastInbound) / (1000 * 60 * 60);

        // Estancado?
        const hoursSinceLastMessage = (now - lastMessage) / (1000 * 60 * 60);
        const isStalled = hoursSinceLastMessage > 6;

        // Health score
        const friction = conv.facts?.friction_score || 0;
        const intent = conv.facts?.intent_score || 50;
        const healthScore = Math.round(((100 - friction) * intent) / 100);

        // Snapshot data
        const snapshot = snapshotMap[conv.contact_handle] || {};
        const isNewCustomer = (snapshot.orders_count || 0) === 0;
        const isVip = (snapshot.ltv || 0) > 5000;

        return {
            ...conv,
            // Enrichment from snapshots
            contact_name: snapshot.name || null,
            avatar_url: snapshot.avatar_url || null,
            ltv: snapshot.ltv || 0,
            risk_level: snapshot.risk_level || 'low',
            tags: snapshot.tags || [],

            // NUEVO: Smart indicators
            indicators: {
                hoursRemaining: Math.round(hoursRemaining * 10) / 10,
                windowStatus,
                hoursSinceCustomer: Math.round(hoursSinceCustomer * 10) / 10,
                isStalled,
                awaitingResponse: conv.last_inbound_at > conv.last_outbound_at,
                isNewCustomer,
                isVip,
                healthScore,
                trafficSource: conv.traffic_source || 'direct',
                originChipId: conv.origin_chip_id
            }
        };
    });

    // LOG: Sample de indicadores para verificación
    if (enrichedConvs.length > 0) {
        console.log(`[CRM:INDICATORS] Sample enrichment:`, {
            id: enrichedConvs[0].id,
            indicators: enrichedConvs[0].indicators
        });
    }

    return enrichedConvs;
}
```

### Validación Checkpoint 4:
```bash
# Llamar al endpoint y verificar respuesta
curl -X GET "http://localhost:3001/api/crm/conversations" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0].indicators'

# Debe retornar objeto con:
# hoursRemaining, windowStatus, isStalled, healthScore, etc.
```

---

## Checkpoint 5: Frontend - Tipos Actualizados
**Archivo:** `frontend/src/types/crm.ts`

```typescript
export interface ConversationIndicators {
    hoursRemaining: number;
    windowStatus: 'active' | 'expiring' | 'expired';
    hoursSinceCustomer: number;
    isStalled: boolean;
    awaitingResponse: boolean;
    isNewCustomer: boolean;
    isVip: boolean;
    healthScore: number;
    trafficSource: 'ads' | 'organic' | 'direct' | 'qr' | 'referral';
    originChipId?: string;
}

export interface Conversation {
    // ... existing fields ...

    // NUEVO
    indicators?: ConversationIndicators;
    first_inbound_at?: string;
    last_inbound_at?: string;
    last_outbound_at?: string;
    traffic_source?: string;
    origin_chip_id?: string;
}
```

---

## Checkpoint 6: Frontend - Componente CardIndicators
**Archivo:** `frontend/src/components/CardIndicators.tsx`

```typescript
import React from 'react';
import { Clock, AlertTriangle, Zap, User, Star, Target, MessageCircle } from 'lucide-react';
import type { ConversationIndicators } from '../types/crm';

interface CardIndicatorsProps {
    indicators: ConversationIndicators;
    compact?: boolean;
}

export const CardIndicators: React.FC<CardIndicatorsProps> = ({ indicators, compact = true }) => {
    // Ventana 24h
    const windowBadge = () => {
        if (indicators.windowStatus === 'expired') {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">EXPIRADO</span>;
        }
        if (indicators.windowStatus === 'expiring') {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold animate-pulse">
                {Math.round(indicators.hoursRemaining * 60)}min
            </span>;
        }
        return <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            {Math.round(indicators.hoursRemaining)}h
        </span>;
    };

    // Tipo de cliente
    const customerBadge = () => {
        if (indicators.isVip) {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">VIP</span>;
        }
        if (indicators.isNewCustomer) {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">NUEVO</span>;
        }
        return null;
    };

    // Fuente de tráfico
    const sourceBadge = () => {
        const sources: Record<string, { label: string; color: string }> = {
            'ads': { label: 'ADS', color: 'bg-pink-500/20 text-pink-400' },
            'organic': { label: 'WEB', color: 'bg-green-500/20 text-green-400' },
            'qr': { label: 'QR', color: 'bg-cyan-500/20 text-cyan-400' },
            'direct': { label: 'DIRECTO', color: 'bg-gray-500/20 text-gray-400' },
            'referral': { label: 'REF', color: 'bg-orange-500/20 text-orange-400' }
        };
        const src = sources[indicators.trafficSource] || sources['direct'];
        return <span className={`text-[8px] px-1.5 py-0.5 rounded ${src.color}`}>{src.label}</span>;
    };

    // Estado de conversación
    const statusBadge = () => {
        if (indicators.isStalled) {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">ESTANCADO</span>;
        }
        if (indicators.awaitingResponse) {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 animate-pulse">PENDIENTE</span>;
        }
        if (indicators.hoursSinceCustomer < 0.5) {
            return <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">ACTIVO</span>;
        }
        return null;
    };

    if (compact) {
        return (
            <div className="flex flex-wrap gap-1 mt-1">
                {windowBadge()}
                {customerBadge()}
                {sourceBadge()}
                {statusBadge()}
            </div>
        );
    }

    // Vista expandida con barra de salud
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {windowBadge()}
                {customerBadge()}
                {sourceBadge()}
                {statusBadge()}
            </div>

            {/* Barra de salud */}
            <div className="flex items-center gap-2">
                <span className="text-[8px] opacity-50">Salud</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${
                            indicators.healthScore >= 70 ? 'bg-green-500' :
                            indicators.healthScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${indicators.healthScore}%` }}
                    />
                </div>
                <span className="text-[8px] opacity-50">{indicators.healthScore}%</span>
            </div>
        </div>
    );
};
```

---

## Checkpoint 7: Integrar en KanbanCard
**Archivo:** `frontend/src/components/KanbanCard.tsx`

```typescript
// Importar nuevo componente
import { CardIndicators } from './CardIndicators';

// En el JSX, después de los tags existentes:
{conv.indicators && (
    <CardIndicators indicators={conv.indicators} compact={true} />
)}
```

---

# PARTE B: Message Type Hardening

## Checkpoint 8: Handlers de Mensajes Faltantes
**Archivo:** `backend/src/controllers/crmController.ts`

### Insertar después de línea 148 (antes del else final):

```typescript
// === NUEVOS HANDLERS (Phase 61) ===

// Botones interactivos (Alta frecuencia)
} else if (msg.type === 'button' || msg.type === 'interactive' || msg.type === 'button_reply') {
    const buttonText = msg.button?.text ||
                       msg.interactive?.button_reply?.title ||
                       msg.interactive?.list_reply?.title ||
                       msg.interactive?.list_reply?.id ||
                       msg.text?.body ||
                       'Selección';
    content = `✅ ${buttonText}`;
    type = 'text';
    console.log(`[CRM:MSG] Button/Interactive handled: "${buttonText}"`);

// Mensajes con cita/respuesta
} else if (msg.type === 'reply' || msg.context?.quoted_message_id) {
    const quotedId = msg.context?.quoted_message_id;
    const replyText = msg.text?.body || msg.caption || '';
    content = replyText; // El texto es lo importante, la cita es contexto
    type = 'text';
    // Guardar referencia en metadata para UI
    if (quotedId) {
        metadata = { ...metadata, quoted_message_id: quotedId };
    }
    console.log(`[CRM:MSG] Reply handled, quoted: ${quotedId}`);

// Álbum de múltiples medios
} else if (msg.type === 'album' || msg.type === 'carousel' || msg.type === 'media_group') {
    const items = msg.album?.items || msg.items || msg.media || [];
    const urls = items.map((i: any) => i.link || i.url || i.media?.link).filter(Boolean);
    content = urls.length > 0
        ? `📷 [Álbum: ${urls.length} archivos]\n${urls.slice(0, 3).join('\n')}${urls.length > 3 ? '\n...' : ''}`
        : `📷 [Álbum: ${items.length} archivos]`;
    type = 'image';
    console.log(`[CRM:MSG] Album handled: ${items.length} items`);

// GIFs animados
} else if (msg.type === 'gif') {
    const url = msg.gif?.link || msg.gif?.url || msg.video?.link || msg.video?.url;
    content = url ? `[GIF](${url})` : '[GIF animado]';
    type = 'video';
    console.log(`[CRM:MSG] GIF handled`);

// Mensaje editado
} else if (msg.type === 'edited' || msg.type === 'edit') {
    const editedText = msg.text?.body || msg.edited?.text || msg.body || '';
    content = `✏️ ${editedText}`;
    type = 'text';
    metadata = { ...metadata, is_edited: true, original_id: msg.edited?.message_id };
    console.log(`[CRM:MSG] Edited message handled`);

// Mensaje reenviado
} else if (msg.type === 'forwarded' || msg.forwarded) {
    const fwdContent = msg.text?.body || msg.caption || '[Mensaje reenviado]';
    content = `↪️ ${fwdContent}`;
    type = msg.image ? 'image' : msg.video ? 'video' : msg.document ? 'file' : 'text';
    metadata = { ...metadata, is_forwarded: true };
    console.log(`[CRM:MSG] Forwarded message handled`);

// Notificación de llamada
} else if (msg.type === 'call' || msg.type === 'call_log') {
    const callType = msg.call?.type || msg.call_type || 'voice';
    const duration = msg.call?.duration || 0;
    content = `📞 [Llamada ${callType}${duration > 0 ? ` - ${Math.round(duration/60)}min` : ' perdida'}]`;
    type = 'event';
    console.log(`[CRM:MSG] Call notification handled: ${callType}`);

// === FIN NUEVOS HANDLERS ===

// FALLBACK MEJORADO (reemplaza el else existente)
} else {
    // Log detallado para debugging
    console.warn(`[CRM:MSG:UNKNOWN] Type: ${msg.type}`, {
        hasText: !!msg.text,
        hasCaption: !!msg.caption,
        hasMedia: !!(msg.image || msg.video || msg.audio || msg.document),
        keys: Object.keys(msg).slice(0, 10)
    });

    // Intentar extraer cualquier contenido útil
    const fallbackContent = msg.text?.body ||
                           msg.caption ||
                           msg.body ||
                           msg.content ||
                           `[${msg.type || 'Mensaje'}]`;

    // Intentar extraer URL de media
    const mediaUrl = msg.link || msg.url ||
                    msg[msg.type]?.link ||
                    msg[msg.type]?.url ||
                    msg.media?.link;

    content = mediaUrl
        ? `${fallbackContent}\n📎 ${mediaUrl}`
        : fallbackContent;
    type = 'file';

    // Guardar raw para análisis posterior
    metadata = {
        ...metadata,
        unknown_type: msg.type,
        raw_sample: JSON.stringify(msg).slice(0, 500)
    };
}
```

---

## Checkpoint 9: Migración SQL para Nuevos Tipos
**Archivo:** `backend/migrations/050_message_types_extended.sql`

```sql
-- Extender constraint de message_type para incluir nuevos tipos
ALTER TABLE crm_messages
DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;

ALTER TABLE crm_messages
ADD CONSTRAINT crm_messages_message_type_check
CHECK (message_type IN (
    'text', 'image', 'video', 'audio', 'file', 'template',
    'event', 'sticker', 'call_summary',
    -- Nuevos tipos (Phase 61)
    'button', 'interactive', 'gif', 'album'
));

-- Índice para búsqueda de mensajes unknown (debugging)
CREATE INDEX IF NOT EXISTS idx_crm_messages_unknown
ON crm_messages ((metadata->>'unknown_type'))
WHERE metadata->>'unknown_type' IS NOT NULL;
```

---

## Checkpoint 10: Sistema de Logging para Auditoría
**Archivo:** `backend/src/utils/crmLogger.ts` (NUEVO)

```typescript
import { supabase } from '../config/supabase';

interface CRMLogEntry {
    event_type: 'message_received' | 'message_unknown' | 'indicator_calculated' | 'timestamp_updated';
    conversation_id?: string;
    contact_handle?: string;
    details: Record<string, any>;
}

class CRMLogger {
    private buffer: CRMLogEntry[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Flush cada 30 segundos
        this.flushInterval = setInterval(() => this.flush(), 30000);
    }

    log(entry: CRMLogEntry) {
        this.buffer.push({
            ...entry,
            details: {
                ...entry.details,
                timestamp: new Date().toISOString()
            }
        });

        // Flush si hay muchos entries
        if (this.buffer.length >= 50) {
            this.flush();
        }
    }

    async flush() {
        if (this.buffer.length === 0) return;

        const entries = [...this.buffer];
        this.buffer = [];

        try {
            // Insertar en tabla de logs (crear si no existe)
            await supabase.from('crm_audit_logs').insert(
                entries.map(e => ({
                    event_type: e.event_type,
                    conversation_id: e.conversation_id,
                    contact_handle: e.contact_handle,
                    details: e.details,
                    created_at: new Date().toISOString()
                }))
            );
        } catch (err) {
            // Si falla, solo log a consola (no perder datos)
            console.error('[CRMLogger] Flush failed:', err);
            entries.forEach(e => console.log('[CRMLogger:FALLBACK]', JSON.stringify(e)));
        }
    }

    // Para debugging: obtener mensajes unknown recientes
    async getUnknownTypes(hours: number = 24): Promise<any[]> {
        const { data } = await supabase
            .from('crm_audit_logs')
            .select('*')
            .eq('event_type', 'message_unknown')
            .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(100);
        return data || [];
    }
}

export const crmLogger = new CRMLogger();
```

---

## Checkpoint 11: Tabla de Auditoría
**Archivo:** `backend/migrations/051_crm_audit_logs.sql`

```sql
-- Tabla para logging de eventos CRM
CREATE TABLE IF NOT EXISTS crm_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    contact_handle VARCHAR(100),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries de auditoría
CREATE INDEX idx_crm_audit_event_type ON crm_audit_logs(event_type);
CREATE INDEX idx_crm_audit_created ON crm_audit_logs(created_at DESC);
CREATE INDEX idx_crm_audit_unknown ON crm_audit_logs(event_type) WHERE event_type = 'message_unknown';

-- Limpieza automática de logs viejos (>30 días)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    DELETE FROM crm_audit_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

---

# VALIDACIÓN FINAL

## Query de Verificación de Datos Reales

```sql
-- 1. Verificar indicadores están siendo calculados
SELECT
    id,
    contact_handle,
    first_inbound_at,
    last_inbound_at,
    traffic_source,
    origin_chip_id,
    EXTRACT(EPOCH FROM (NOW() - first_inbound_at)) / 3600 as hours_since_first
FROM conversations
WHERE first_inbound_at IS NOT NULL
ORDER BY last_message_at DESC
LIMIT 10;

-- 2. Verificar mensajes unknown (debe ser 0 o muy bajo)
SELECT
    metadata->>'unknown_type' as unknown_type,
    COUNT(*) as count,
    MAX(created_at) as last_seen
FROM crm_messages
WHERE metadata->>'unknown_type' IS NOT NULL
GROUP BY metadata->>'unknown_type'
ORDER BY count DESC;

-- 3. Verificar distribución de traffic sources
SELECT
    traffic_source,
    COUNT(*) as conversations,
    AVG(CASE WHEN facts->>'friction_score' IS NOT NULL
        THEN (facts->>'friction_score')::int ELSE NULL END) as avg_friction
FROM conversations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY traffic_source;

-- 4. Verificar health scores
SELECT
    CASE
        WHEN ((100 - COALESCE((facts->>'friction_score')::int, 0)) *
              COALESCE((facts->>'intent_score')::int, 50)) / 100 >= 70 THEN 'healthy'
        WHEN ((100 - COALESCE((facts->>'friction_score')::int, 0)) *
              COALESCE((facts->>'intent_score')::int, 50)) / 100 >= 40 THEN 'needs_attention'
        ELSE 'at_risk'
    END as health_bucket,
    COUNT(*) as count
FROM conversations
WHERE status IN ('active', 'paused', 'review')
GROUP BY health_bucket;
```

---

# ORDEN DE IMPLEMENTACIÓN

| Paso | Archivo | Checkpoint | Tiempo Est. |
|------|---------|------------|-------------|
| 1 | `migrations/049_smart_card_indicators.sql` | CP1 | 10 min |
| 2 | `migrations/050_message_types_extended.sql` | CP9 | 5 min |
| 3 | `migrations/051_crm_audit_logs.sql` | CP11 | 5 min |
| 4 | `CRMService.ts` - timestamps | CP2, CP3 | 30 min |
| 5 | `CRMService.ts` - getConversations | CP4 | 45 min |
| 6 | `crmController.ts` - message handlers | CP8 | 30 min |
| 7 | `utils/crmLogger.ts` | CP10 | 20 min |
| 8 | `types/crm.ts` | CP5 | 10 min |
| 9 | `CardIndicators.tsx` | CP6 | 30 min |
| 10 | `KanbanCard.tsx` - integración | CP7 | 15 min |

**Total estimado:** ~3.5 horas

---

# ROLLBACK PLAN

Si algo falla:

```sql
-- Rollback migración 049
ALTER TABLE conversations
DROP COLUMN IF EXISTS first_inbound_at,
DROP COLUMN IF EXISTS last_inbound_at,
DROP COLUMN IF EXISTS last_outbound_at,
DROP COLUMN IF EXISTS traffic_source,
DROP COLUMN IF EXISTS utm_source,
DROP COLUMN IF EXISTS utm_campaign,
DROP COLUMN IF EXISTS ad_platform,
DROP COLUMN IF EXISTS origin_chip_id;

-- Rollback migración 050 (restaurar constraint original)
ALTER TABLE crm_messages
DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;

ALTER TABLE crm_messages
ADD CONSTRAINT crm_messages_message_type_check
CHECK (message_type IN (
    'text', 'image', 'video', 'audio', 'file', 'template',
    'event', 'sticker', 'call_summary'
));

-- Rollback migración 051
DROP TABLE IF EXISTS crm_audit_logs;
```

---

**Documento creado:** 2024-12-24
**Autor:** Claude Code Assistant
**Versión:** 1.0
