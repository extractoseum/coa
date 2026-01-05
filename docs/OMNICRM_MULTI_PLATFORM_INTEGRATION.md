# 🌐 OmniCRM - Plan de Integración Multi-Plataforma

## 📊 Estado Actual

### Plataformas Conectadas
| Plataforma | Estado | Método |
|------------|--------|--------|
| **WhatsApp** | ✅ Activo | Whapi Service |
| **Email** | ✅ Activo | Email Service |
| **Instagram** | ⏳ Pendiente | Meta Graph API |
| **Messenger** | ⏳ Pendiente | Meta Messenger API |
| **TikTok** | 🔜 Futuro | TikTok Business API |

### Contactos Pendientes de Importar (de Vambe)
- **Instagram**: 394 contactos
- **Messenger**: 43 contactos
- **Google Ads leads**: 210 contactos
- **Total**: 846 contactos sin teléfono

---

## 🏗️ Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│                        OmniCRM Backend                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Whapi     │  │   Meta      │  │   TikTok    │             │
│  │  Service    │  │  Service    │  │  Service    │             │
│  │  (WhatsApp) │  │ (IG + MSG)  │  │  (Future)   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                  ┌───────▼───────┐                              │
│                  │ Channel Router │                             │
│                  │ (Unified API)  │                             │
│                  └───────┬───────┘                              │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         │                │                │                     │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐             │
│  │ CRM Service │  │  AI Service │  │Notification │             │
│  │(Conversations)│ │ (Ara, etc) │  │  Service    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📱 1. Integración Meta (Instagram + Messenger)

### 1.1 Requisitos Previos

1. **Facebook Business Account** vinculado a:
   - Página de Facebook de EXTRACTOS EUM
   - Cuenta de Instagram Professional

2. **Meta App** configurada con:
   - Instagram Messaging API
   - Messenger Platform
   - Webhooks

3. **Permisos requeridos**:
   ```
   instagram_basic
   instagram_manage_messages
   pages_messaging
   pages_read_engagement
   ```

### 1.2 Configuración de Webhooks

#### Endpoint a crear:
```
POST /api/webhooks/meta
```

#### Eventos a suscribir:

**Instagram:**
- `messages` - Nuevos mensajes DM
- `messaging_postbacks` - Botones/Quick replies
- `messaging_seen` - Read receipts

**Messenger:**
- `messages` - Nuevos mensajes
- `messaging_postbacks` - Botones
- `message_deliveries` - Delivery receipts
- `message_reads` - Read receipts

### 1.3 Estructura del Webhook Payload

```typescript
// Instagram Message
{
  "object": "instagram",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1234567890,
    "messaging": [{
      "sender": { "id": "IGSID_123" },      // Instagram Scoped ID
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1234567890,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "Hola, me interesa..."
      }
    }]
  }]
}

// Messenger Message
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1234567890,
    "messaging": [{
      "sender": { "id": "PSID_456" },        // Page Scoped ID
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1234567890,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "Quiero más información..."
      }
    }]
  }]
}
```

### 1.4 Flujo de Procesamiento

```
1. Webhook recibe mensaje
         │
         ▼
2. Identificar plataforma (IG vs MSG)
         │
         ▼
3. Buscar cliente por:
   - instagram_id (IGSID)
   - messenger_id (PSID)
   - vambe_contact_id
         │
         ▼
4. Si no existe → Crear cliente
   Si existe → Obtener contexto
         │
         ▼
5. Buscar/Crear conversación
   - channel: 'IG' o 'FB'
   - platform_user_id: IGSID/PSID
         │
         ▼
6. Guardar mensaje entrante
         │
         ▼
7. Procesar con AI (Ara)
         │
         ▼
8. Enviar respuesta via Meta API
```

---

## 🔧 2. Implementación Técnica

### 2.1 Nuevo Servicio: MetaService.ts

```typescript
// backend/src/services/metaService.ts

export class MetaService {
    private accessToken: string;
    private pageId: string;
    private igAccountId: string;

    constructor() {
        this.accessToken = process.env.META_ACCESS_TOKEN!;
        this.pageId = process.env.META_PAGE_ID!;
        this.igAccountId = process.env.META_IG_ACCOUNT_ID!;
    }

    // Send Instagram DM
    async sendInstagramMessage(recipientId: string, message: string): Promise<any> {
        const url = `https://graph.facebook.com/v18.0/${this.igAccountId}/messages`;
        // Implementation...
    }

    // Send Messenger Message
    async sendMessengerMessage(recipientId: string, message: string): Promise<any> {
        const url = `https://graph.facebook.com/v18.0/${this.pageId}/messages`;
        // Implementation...
    }

    // Get user profile
    async getUserProfile(userId: string, platform: 'instagram' | 'messenger'): Promise<any> {
        // Implementation...
    }
}
```

### 2.2 Webhook Controller Update

```typescript
// backend/src/controllers/webhookController.ts

// Add new endpoint
router.post('/meta', async (req, res) => {
    // Verify webhook (GET for verification, POST for events)
    if (req.method === 'GET') {
        return verifyMetaWebhook(req, res);
    }

    const { object, entry } = req.body;

    if (object === 'instagram') {
        await processInstagramWebhook(entry);
    } else if (object === 'page') {
        await processMessengerWebhook(entry);
    }

    res.sendStatus(200);
});
```

### 2.3 CRMService Updates

```typescript
// Agregar a getOrCreateConversation
async getOrCreateConversation(
    channel: 'WA' | 'IG' | 'FB' | 'EMAIL',
    handle: string,
    options?: {
        platformUserId?: string;
        platformThreadId?: string;
    }
): Promise<CRMConversation> {
    // ... existing logic ...

    // For Instagram/Messenger, also search by platform_user_id
    if ((channel === 'IG' || channel === 'FB') && options?.platformUserId) {
        const { data: platformMatch } = await supabase
            .from('conversations')
            .select('*')
            .eq('channel', channel)
            .eq('platform_user_id', options.platformUserId)
            .maybeSingle();

        if (platformMatch) return platformMatch;
    }

    // ... create new conversation with platform fields ...
}
```

---

## 📋 3. Variables de Entorno Necesarias

```env
# Meta/Facebook Configuration
META_ACCESS_TOKEN=your_long_lived_access_token
META_PAGE_ID=your_page_id
META_IG_ACCOUNT_ID=your_instagram_account_id
META_APP_SECRET=your_app_secret
META_VERIFY_TOKEN=your_custom_verify_token

# TikTok (Future)
TIKTOK_ACCESS_TOKEN=
TIKTOK_BUSINESS_ID=
```

---

## 📊 4. Schema de Base de Datos (Migración)

```sql
-- Ya incluido en add_platform_identifiers.sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_username VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS messenger_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS vambe_contact_id VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS platform_metadata JSONB DEFAULT '{}';
```

---

## 🚀 5. Plan de Ejecución

### Fase 1: Preparación (Esta semana)
- [ ] Ejecutar migración SQL en Supabase
- [ ] Importar contactos de Vambe (Instagram/Messenger)
- [ ] Ejecutar smart_sync para enriquecer clientes existentes

### Fase 2: Configuración Meta (1-2 días)
- [ ] Crear/Configurar Meta App
- [ ] Solicitar permisos de messaging
- [ ] Configurar webhook URL en Meta Dashboard
- [ ] Generar Long-Lived Access Token

### Fase 3: Implementación Backend (2-3 días)
- [ ] Crear MetaService.ts
- [ ] Agregar endpoint /api/webhooks/meta
- [ ] Actualizar CRMService para multi-plataforma
- [ ] Actualizar ChannelRouter

### Fase 4: Testing (1-2 días)
- [ ] Probar recepción de webhooks
- [ ] Probar envío de mensajes IG/MSG
- [ ] Validar flujo completo con AI
- [ ] Verificar creación de conversaciones

### Fase 5: Go Live
- [ ] Desconectar de Vambe
- [ ] Monitorear métricas
- [ ] Ajustar según feedback

---

## 📱 6. URLs y Recursos

### Meta Developer Portal
- Dashboard: https://developers.facebook.com/apps/
- Documentación IG: https://developers.facebook.com/docs/instagram-api/guides/messaging
- Documentación Messenger: https://developers.facebook.com/docs/messenger-platform

### Supabase Dashboard
- SQL Editor: https://supabase.com/dashboard/project/vbnpcospodhwuzvxejui/sql/new

### Tu Backend
- Webhook URL: https://api.extractoseum.com/api/webhooks/meta

---

## 🔐 7. Consideraciones de Seguridad

1. **Verificación de Webhooks**: Validar firma X-Hub-Signature-256
2. **Rate Limiting**: Meta tiene límites por ventana de tiempo
3. **Token Refresh**: Long-lived tokens expiran en 60 días
4. **HTTPS requerido**: Todos los webhooks deben ser HTTPS

---

## 📈 8. Métricas a Monitorear

- Mensajes recibidos por plataforma
- Tiempo de respuesta del AI
- Tasa de conversión lead → cliente
- Errores de envío de mensajes
- Volumen por hora/día

---

*Documento generado: 2026-01-05*
*Versión: 1.0*
