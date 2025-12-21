## 1. Modelo de Datos (Esquema Refinado)

### Tablas Principales (Supabase/PostgreSQL)

```mermaid
erDiagram
    CRM_COLUMN ||--o{ CONVERSATION : contains
    CONVERSATION ||--o{ MESSAGE : has
    CONVERSATION ||--o{ TAG_EVENT : labeled_with
    CONVERSATION ||--o{ AUTOMATION_RUN : triggers
    CONVERSATION }o--|| CONSENT : requires_opt_in
    
    CRM_COLUMN {
        uuid id
        string name
        string mode "AI_MODE | HUMAN_MODE | HYBRID"
        jsonb config "agente_id, model, tools_whitelist[], scheduler_rules, guardrails"
        int position
    }

    CONVERSATION {
        uuid id
        string channel "WA | IG | FB"
        string contact_handle
        string status "active | paused | review"
        uuid column_id
        text summary
        int summary_version
        timestamp last_summarized_at
        jsonb facts "Key interests, preferences"
        int facts_version
        string agent_override_id "NULL falls back to column agent"
        string model_override "NULL falls back to column model"
        timestamp last_message_at
    }

    MESSAGE {
        uuid id
        uuid conversation_id
        string direction "inbound | outbound"
        string role "user | assistant | system"
        string message_type "text | image | audio | template | event"
        string status "queued | sent | delivered | read | failed"
        string external_id "API-specific ID"
        string channel_thread_id
        text content
        jsonb raw_payload "Debug/Audit log"
        timestamp created_at
    }

    TAG_EVENT {
        uuid id
        uuid conversation_id
        string tag_slug
        string source "ai | human | import"
        float confidence
        jsonb evidence "Snippet/Message_ID"
        timestamp created_at
    }

    CONSENT {
        string contact_handle
        string channel
        string status "granted | revoked"
        string source
        int policy_version
        timestamp last_updated_at
    }

    AUTOMATION_RULE {
        uuid id
        uuid column_id
        boolean enabled
        string trigger "time_window | inactivity | tag_added"
        string schedule "cron/rrule"
        jsonb action "send_template | run_agent"
        jsonb guardrails "blacklist tags, cost caps"
    }
```

## 2. Motor de Enrutamiento (Dispatcher) & Operational Inheritance

El dispatcher no es solo un puente; es el ejecutor de la **política de columna**:

1. **Inheritance Logic**: Cuando una conversa entra en una columna, hereda:
   - `agente_id`: Define el prompt y personalidad.
   - `model`: Define la capacidad (GPT-4o, Gemini 3, etc).
   - `tools_whitelist`: Solo las herramientas permitidas en esta columna (ej: Ventas puede crear Checkouts, Soporte no).
2. **Fast Gates & Guardrails**:
   - Si `Column.mode == HUMAN_MODE` -> El dispatcher silencia la IA.
   - Guardrails: Si el clasificador detecta `UPSET_CUSTOMER`, el dispatcher puede forzar un `moveConversation` a la columna de Soporte Humano.

## 3. Configuración del "Cerebro de Columna" (JSON Spec)

Estructura de `crm_column.config`:
```json
{
  "agent_id": "sales_ara",
  "model": "gpt-4o",
  "tools": ["search_products", "create_checkout_link"],
  "automations": {
    "follow_up_hours": 6,
    "max_messages_per_day": 5
  },
  "guardrails": {
    "escalate_on_tags": ["UPSET_CUSTOMER", "LEGAL_THREAT"],
    "prohibited_topics": ["medical_claims"]
  }
}
```

## 3. Estrategia de "Smart Memory"

- **Actualización**: El `summary` se re-summariza cada N mensajes o después de 1 hora de inactividad.
- **Facts**: Los `key_facts` se extraen mediante una herramienta específica del agente que actualiza el JSON de la conversación.
- **Audit**: `raw_payload` en cada mensaje permite reconstruir exactamente qué envió el canal oficial (WA/Meta).

## 4. Próximos Pasos Técnicos

1. **Base de Datos**: Crear migraciones para `crm_columns`, `conversations` y `crm_messages`.
2. **Refactor Backend**: Crear `CRMController` y `CRMService` para manejar el enrutamiento.
3. **Frontend MVP**: Tablero Kanban básico utilizando `AdminSidekick` evolucionado o una nueva página `/admin/crm`.
