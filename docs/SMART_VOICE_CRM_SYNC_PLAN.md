# Smart Voice-CRM Sync Implementation Plan

> **Objetivo**: Crear un sistema inteligente que sincronice llamadas de voz VAPI con el CRM en tiempo real, con auto-aprendizaje y logging avanzado.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SMART VOICE-CRM SYNC SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   VAPI Cloud                    Backend                      Frontend        │
│  ┌──────────┐               ┌──────────────┐             ┌──────────────┐   │
│  │ Webhooks │──────────────▶│  VapiService │────────────▶│  LiveCallView│   │
│  │          │               │              │             │              │   │
│  │ Events:  │               │  Processors: │  Supabase   │  Features:   │   │
│  │ -status  │               │  -transcript │  Realtime   │  -Live trans │   │
│  │ -transcr │               │  -tool-calls │─────────────│  -Call ctrl  │   │
│  │ -tool-ca │               │  -learning   │             │  -Analytics  │   │
│  │ -end-rep │               │  -error-log  │             │              │   │
│  └──────────┘               └──────────────┘             └──────────────┘   │
│        │                           │                            │           │
│        │                           ▼                            │           │
│        │                    ┌──────────────┐                    │           │
│        │                    │   Supabase   │                    │           │
│        │                    │   Tables:    │                    │           │
│        │                    │ -voice_calls │                    │           │
│        │                    │ -vapi_events │◀───────────────────┘           │
│        │                    │ -tool_logs   │                                │
│        │                    │ -search_map  │                                │
│        │                    └──────────────┘                                │
│        │                           │                                        │
│        │                           ▼                                        │
│        │                    ┌──────────────┐                                │
│        └───────────────────▶│ Call Control │ Inject messages during call    │
│                             │     API      │                                │
│                             └──────────────┘                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementación

### FASE 1: Foundation - Database & Logging
**Duración estimada: 1-2 días**

#### Checkpoint 1.1: Migrations
- [ ] Crear `071_vapi_call_events.sql` - Eventos de llamada en tiempo real
- [ ] Crear `072_vapi_tool_logs.sql` - Logs de tool calls con resultados
- [ ] Crear `073_search_term_mappings.sql` - Mappings auto-aprendidos
- [ ] Actualizar `voice_calls` con campos adicionales

#### Checkpoint 1.2: Backend Logging
- [ ] Crear `VapiEventLogger` service
- [ ] Implementar logging de todos los webhooks
- [ ] Agregar métricas de latencia por tool

---

### FASE 2: Real-time Event Processing
**Duración estimada: 2-3 días**

#### Checkpoint 2.1: Webhook Enhancements
- [ ] Procesar evento `transcript` (parcial y final)
- [ ] Procesar evento `conversation-update`
- [ ] Procesar evento `status-update` con más detalle
- [ ] Guardar cada evento en `vapi_call_events`

#### Checkpoint 2.2: Live Transcript Sync
- [ ] Insertar transcripciones parciales en `vapi_call_events`
- [ ] Emitir updates via Supabase Realtime
- [ ] Agregar indicador de "llamada en vivo" en conversación

---

### FASE 3: Frontend Live Call View
**Duración estimada: 2-3 días**

#### Checkpoint 3.1: Live Call Component
- [ ] Crear `LiveCallIndicator` component
- [ ] Crear `LiveTranscriptView` component
- [ ] Integrar en panel de conversación

#### Checkpoint 3.2: Call Controls
- [ ] Botón para inyectar mensaje durante llamada
- [ ] Botón de mute/unmute asistente
- [ ] Indicador visual de quién habla (AI/User)

#### Checkpoint 3.3: Call Analytics Panel
- [ ] Mostrar duración en tiempo real
- [ ] Mostrar tools ejecutados
- [ ] Mostrar errores si los hay

---

### FASE 4: Auto-Learning System
**Duración estimada: 3-4 días**

#### Checkpoint 4.1: Error Pattern Detection
- [ ] Detectar cuando `search_products` falla
- [ ] Guardar query que falló + contexto
- [ ] Analizar patrones de fallos recurrentes

#### Checkpoint 4.2: Search Mapping Learning
- [ ] Cuando tool falla y humano corrige → guardar mapping
- [ ] Tabla `search_term_mappings` con scores de confianza
- [ ] Cargar mappings dinámicamente en `VapiToolHandlers`

#### Checkpoint 4.3: Prompt Optimization Suggestions
- [ ] Detectar cuando usuarios se frustran (sentiment)
- [ ] Detectar preguntas sin respuesta satisfactoria
- [ ] Generar sugerencias de mejora para el prompt de Ara

---

### FASE 5: Smart Context Injection
**Duración estimada: 2-3 días**

#### Checkpoint 5.1: Dynamic Context Updates
- [ ] Si conversación tiene issues pendientes → inyectar en llamada
- [ ] Si hay pedidos problemáticos → context automático
- [ ] Actualizar facts durante la llamada (no solo al final)

#### Checkpoint 5.2: Proactive Interventions
- [ ] Detectar frustración → sugerir escalación automática
- [ ] Detectar confusión → inyectar clarificación
- [ ] API endpoint para intervención manual del agente humano

---

### FASE 6: Analytics Dashboard
**Duración estimada: 2-3 días**

#### Checkpoint 6.1: Call Metrics
- [ ] Dashboard de llamadas por día/semana
- [ ] Duración promedio, tasa de éxito
- [ ] Tools más usados y su success rate

#### Checkpoint 6.2: Learning Metrics
- [ ] Mappings aprendidos por semana
- [ ] Queries que siguen fallando
- [ ] Mejoras sugeridas pendientes

---

## Detalle de Tablas a Crear

### 1. `vapi_call_events`
```sql
CREATE TABLE vapi_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id VARCHAR(100) NOT NULL,
  conversation_id UUID REFERENCES conversations(id),

  -- Event Info
  event_type VARCHAR(50) NOT NULL,  -- 'transcript', 'status-update', 'tool-call', etc.
  event_data JSONB NOT NULL,

  -- For transcripts
  speaker VARCHAR(20),              -- 'ai', 'user'
  transcript_text TEXT,
  is_final BOOLEAN DEFAULT false,

  -- Timing
  event_time TIMESTAMPTZ DEFAULT NOW(),
  seconds_from_start NUMERIC(10,3),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vapi_events_call ON vapi_call_events(vapi_call_id);
CREATE INDEX idx_vapi_events_conv ON vapi_call_events(conversation_id);
CREATE INDEX idx_vapi_events_type ON vapi_call_events(event_type);
```

### 2. `vapi_tool_logs`
```sql
CREATE TABLE vapi_tool_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id VARCHAR(100) NOT NULL,
  conversation_id UUID REFERENCES conversations(id),

  -- Tool Info
  tool_name VARCHAR(100) NOT NULL,
  tool_call_id VARCHAR(100),
  arguments JSONB,

  -- Result
  success BOOLEAN NOT NULL,
  result JSONB,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,

  -- Learning
  user_feedback VARCHAR(20),        -- 'helpful', 'not_helpful', null
  correction_applied TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tool_logs_call ON vapi_tool_logs(vapi_call_id);
CREATE INDEX idx_tool_logs_tool ON vapi_tool_logs(tool_name);
CREATE INDEX idx_tool_logs_success ON vapi_tool_logs(success);
```

### 3. `search_term_mappings`
```sql
CREATE TABLE search_term_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mapping
  search_term VARCHAR(100) NOT NULL,
  mapped_terms TEXT[] NOT NULL,

  -- Source
  source VARCHAR(50) NOT NULL,      -- 'manual', 'auto_learned', 'ai_suggested'
  learned_from_call_id VARCHAR(100),

  -- Confidence
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  times_used INTEGER DEFAULT 0,
  times_successful INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_search_mappings_term ON search_term_mappings(search_term) WHERE is_active = true;
```

### 4. Updates a `voice_calls`
```sql
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
  live_transcript_enabled BOOLEAN DEFAULT false;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
  tool_calls_count INTEGER DEFAULT 0;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
  tool_errors_count INTEGER DEFAULT 0;

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
  user_sentiment VARCHAR(20);  -- 'positive', 'neutral', 'negative', 'frustrated'

ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS
  intervention_count INTEGER DEFAULT 0;  -- Human interventions during call
```

---

## Nuevos Endpoints API

### VAPI Control
```
POST /api/v1/vapi/call/:callId/inject
  Body: { message: string, type: 'say' | 'add-message' }

POST /api/v1/vapi/call/:callId/mute
POST /api/v1/vapi/call/:callId/unmute
POST /api/v1/vapi/call/:callId/end
```

### Analytics
```
GET /api/v1/vapi/analytics/calls
  Query: { from, to, status }

GET /api/v1/vapi/analytics/tools
  Query: { from, to, tool_name }

GET /api/v1/vapi/analytics/learnings
  Query: { from, to, status }
```

### Learning Management
```
GET /api/v1/vapi/mappings
POST /api/v1/vapi/mappings
  Body: { search_term, mapped_terms, source }

PUT /api/v1/vapi/mappings/:id/review
  Body: { approved: boolean }
```

---

## Nuevos Componentes Frontend

### 1. `LiveCallIndicator.tsx`
- Muestra cuando hay llamada activa en conversación
- Pulso animado verde
- Click para expandir LiveTranscriptView

### 2. `LiveTranscriptView.tsx`
- Stream de transcripción en tiempo real
- Diferenciación visual AI vs User
- Scroll automático

### 3. `CallControlPanel.tsx`
- Botones de control (inject, mute, end)
- Input para mensaje a inyectar
- Estado de la llamada

### 4. `VapiAnalyticsDashboard.tsx`
- Gráficas de llamadas
- Tabla de tools con success rate
- Lista de mappings aprendidos

---

## Webhooks VAPI a Procesar

| Evento | Acción | Prioridad |
|--------|--------|-----------|
| `status-update` | Actualizar `voice_calls.status` + emitir realtime | Alta |
| `transcript` | Guardar en `vapi_call_events` + emitir realtime | Alta |
| `tool-calls` | Ejecutar + guardar en `vapi_tool_logs` | Alta |
| `end-of-call-report` | Finalizar call + análisis | Alta |
| `conversation-update` | Sync con CRM messages | Media |
| `user-interrupted` | Marcar en eventos | Media |
| `hang` | Log de latencia | Baja |

---

## Métricas de Éxito

### KPIs Técnicos
- [ ] Latencia de transcripción < 500ms
- [ ] Tool success rate > 90%
- [ ] Realtime sync < 1s de delay

### KPIs de Negocio
- [ ] Reducción de "No encontré productos" en 50%
- [ ] Aumento de llamadas completadas exitosamente
- [ ] Reducción de escalaciones a humano

### KPIs de Aprendizaje
- [ ] Mappings aprendidos por semana
- [ ] Accuracy de mappings auto-aprendidos > 80%
- [ ] Reducción de errores recurrentes

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Sobrecarga de eventos realtime | Batching de eventos cada 100ms |
| Mappings incorrectos auto-aprendidos | Requiere review humano antes de activar |
| Latencia en tool calls | Timeout de 15s + fallback message |
| Costo de almacenamiento | Retención de 30 días para eventos granulares |

---

## Orden de Implementación Recomendado

```
Semana 1: FASE 1 (Database) + FASE 2.1 (Webhooks)
Semana 2: FASE 2.2 (Live Sync) + FASE 3.1 (Component)
Semana 3: FASE 3.2-3.3 (Controls) + FASE 4.1 (Error Detection)
Semana 4: FASE 4.2-4.3 (Learning) + FASE 5 (Context)
Semana 5: FASE 6 (Dashboard) + Testing + Deploy
```

---

## Próximos Pasos Inmediatos

1. **Crear migrations** (071, 072, 073)
2. **Implementar VapiEventLogger**
3. **Agregar procesamiento de `transcript` webhook**
4. **Crear LiveCallIndicator component**

¿Empezamos con Fase 1?
