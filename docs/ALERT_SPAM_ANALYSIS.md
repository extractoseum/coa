# Analisis Sistema de Alertas de Envio - SPAM/Timing Issues

**Fecha:** 2025-12-22
**Estado:** CRITICO - Multiples fuentes de notificaciones duplicadas identificadas

---

## Resumen Ejecutivo

El sistema de alertas de envio tiene **3 fuentes principales de notificacion** que pueden disparar mensajes al mismo usuario por el mismo pedido, causando spam:

1. **Webhook de Fulfillment** (`webhookController.ts`)
2. **Webhook de Order Update** (`webhookController.ts`)
3. **Cron de Tracking** (`trackingService.ts` + `cronService.ts`)

---

## Diagrama de Flujo de Notificaciones

```
Shopify Fulfillment Created
         |
         v
+------------------+     +----------------------+
| fulfillment/     |---->| notifyOrderShipped() | --> WhatsApp #1
| update webhook   |     +----------------------+
+------------------+              |
                                  v
                           Push + Email + WA

+------------------+     +----------------------+
| orders/update    |---->| processOrderInternal |
| webhook          |     | (fallback logic)     |
+------------------+              |
                                  v
                    if fulfillments[] exists:
                           notifyOrderShipped() --> WhatsApp #2 (DUPLICADO!)

+------------------+     +----------------------+
| Cron cada 4hrs   |---->| updateAllActiveTrackings|
| cronService.ts   |     +----------------------+
+------------------+              |
                                  v
                    for each tracking:
                      pollEstafeta()
                           |
                    if statusChanged OR historyAdvanced:
                      notifyTrackingUpdate() --> WhatsApp #3+ (MULTIPLES!)
```

---

## P0 - BUGS CRITICOS IDENTIFICADOS

### BUG 1: Doble Notificacion Shipped (Webhook Race Condition)

**Ubicacion:** [webhookController.ts](../backend/src/controllers/webhookController.ts)

**Problema:** Cuando Shopify crea un fulfillment, envia DOS webhooks casi simultaneamente:
1. `fulfillments/update` (linea 600-712)
2. `orders/update` (linea 583-593)

Ambos webhooks procesan el mismo fulfillment y llaman a `notifyOrderShipped()`.

**Codigo problematico (linea 536-546):**
```typescript
// En processOrderInternal - FALLBACK que causa duplicados
if (hasFullTracking) {
    // CRITICAL: Notify user if it's a new or updated fulfillment
    console.log(`[Webhook] Triggering SHIPPED notification via fallback for order ${orderNumber}`);
    await notifyOrderShipped(client.id, orderNumber, mainCarrier, allTrackingNumbers);
}
```

**Fix Propuesto:**
```typescript
// Agregar flag para evitar doble notificacion
if (hasFullTracking && !existingOrder?.fulfilled_notified) {
    // Marcar como notificado ANTES de notificar
    await supabase.from('orders')
        .update({ fulfilled_notified: true })
        .eq('id', savedOrder.id);

    await notifyOrderShipped(client.id, orderNumber, mainCarrier, allTrackingNumbers);
}
```

---

### BUG 2: historyAdvanced Dispara Notificaciones Excesivas

**Ubicacion:** [trackingService.ts:50](../backend/src/services/trackingService.ts#L50)

**Problema:** La condicion `historyAdvanced` es TRUE cada vez que Estafeta agrega un nuevo evento al historial, incluso si el status NO cambio. Esto causa notificaciones por cada movimiento interno del paquete.

**Codigo problematico:**
```typescript
const statusChanged = result.status !== tracking.current_status;
const historyAdvanced = result.history && result.history.length > (tracking.status_history?.length || 0);

// PROBLEMA: Se notifica si historyAdvanced es true AUNQUE status no cambio!
if (statusChanged || historyAdvanced) {
    await notifyTrackingUpdate(...);
}
```

**Ejemplo real:**
- Status permanece `in_transit`
- Estafeta agrega evento: "Recibido en CDMX (Centro de Distribucion)"
- `historyAdvanced = true` porque history.length paso de 3 a 4
- Se envia notificacion aunque el paquete sigue "En Transito"

**Fix Propuesto:**
```typescript
// SOLO notificar si el STATUS cambio a un estado relevante
if (statusChanged) {
    // Filtrar estados relevantes para el usuario
    const notifiableStatuses = ['out_for_delivery', 'delivered'];
    const isRelevantChange = notifiableStatuses.includes(result.status) ||
        (tracking.current_status === 'pending' && result.status === 'in_transit');

    if (isRelevantChange) {
        await notifyTrackingUpdate(...);
    }
}

// Siempre guardar el historial actualizado (sin notificar)
```

---

### BUG 3: Deduplicacion Insuficiente (10 min window)

**Ubicacion:** [onesignalService.ts:794-825](../backend/src/services/onesignalService.ts#L794)

**Problema:** La ventana de deduplicacion es de solo 10 minutos. Si el cron corre cada 4 horas y hay multiples webhooks procesando el mismo fulfillment, la ventana de 10 min no cubre los casos donde:

1. Webhook A procesa a las 14:00
2. Webhook B procesa a las 14:15 (fuera de ventana, DUPLICADO!)

**Codigo actual:**
```typescript
const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
```

**Fix Propuesto:**
```typescript
// Extender a 30 minutos para cubrir race conditions de webhooks
const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

// Para tracking updates, usar 4 horas (igual al intervalo del cron)
const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
```

---

### BUG 4: Cron cada 4 horas + Status Transitorios

**Ubicacion:** [cronService.ts:29](../backend/src/services/cronService.ts#L29)

**Problema:** El cron `0 */4 * * *` corre a las 00:00, 04:00, 08:00, 12:00, 16:00, 20:00. Cuando un paquete pasa rapidamente por estados transitorios (in_transit -> out_for_delivery -> delivered en el mismo dia), cada corrida del cron puede detectar un "cambio" y notificar.

**Escenario de spam:**
```
08:00 AM - Cron detecta: pending -> in_transit (Notif #1)
12:00 PM - Cron detecta: in_transit -> out_for_delivery (Notif #2)
16:00 PM - Estafeta ya entrego pero cron ve historial adicional (Notif #3)
20:00 PM - Cron detecta: out_for_delivery -> delivered (Notif #4)
```

**Fix Propuesto:** Agregar rate limiting por orden:
```typescript
// Solo 1 notificacion de tracking por orden cada 6 horas maximo
const lastNotifKey = `tracking_notif_${orderId}`;
const lastNotif = await redis.get(lastNotifKey);
if (lastNotif && Date.now() - lastNotif < 6 * 60 * 60 * 1000) {
    console.log(`[Tracking] Rate limited for order ${orderId}`);
    return;
}
```

---

## P1 - Issues de Timing

### Issue 1: Notificaciones Fuera de Horario

**Ubicacion:** [onesignalService.ts:30-31](../backend/src/services/onesignalService.ts#L30)

El sistema intenta detectar horario nocturno pero solo ajusta el COPY, no el TIMING del envio:

```typescript
const hour = (now.getUTCHours() - 6 + 24) % 24;
const isLate = hour >= 19 || hour < 8; // Entre 7 PM y 8 AM
```

**Problema:** Los mensajes de WhatsApp se envian a cualquier hora. Los clientes reciben notificaciones a las 4:00 AM cuando el cron corre.

**Fix Propuesto:**
```typescript
// Agregar queue para notificaciones fuera de horario
if (isLate && notificationType !== 'fraud_alert') {
    await queueNotificationForMorning(clientId, title, message);
    return;
}
```

---

### Issue 2: Zona Horaria Incorrecta en Cron

**Ubicacion:** [cronService.ts:29](../backend/src/services/cronService.ts#L29)

```typescript
// El tracking cron NO tiene timezone configurado!
cron.schedule('0 */4 * * *', async () => {
    // Corre en UTC, no Mexico City
});

// Mientras que otros crons SI lo tienen:
cron.schedule('0 3 * * *', async () => {...}, {
    timezone: 'America/Mexico_City'  // <-- Este si tiene
});
```

**Fix:** Agregar timezone al tracking cron.

---

## P2 - Mejoras Recomendadas

### 1. Tabla de Notificaciones Enviadas por Tracking

Crear tabla dedicada para tracking de notificaciones de envio:

```sql
CREATE TABLE tracking_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    tracking_number TEXT NOT NULL,
    status_notified TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'push', 'whatsapp', 'email'
    sent_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(order_id, tracking_number, status_notified, channel)
);
```

### 2. Consolidar Fuentes de Notificacion

En lugar de tener 3 lugares que disparan `notifyOrderShipped`, crear un servicio centralizado:

```typescript
// backend/src/services/fulfillmentNotificationService.ts
export const handleFulfillmentNotification = async (orderId: string, trackingNumbers: string[]) => {
    // 1. Verificar si ya se notifico
    // 2. Verificar horario
    // 3. Rate limiting
    // 4. Enviar UNA sola notificacion
    // 5. Marcar como notificado
};
```

### 3. User Preferences para Tracking

Permitir que usuarios configuren nivel de detalle:
- "Solo notificarme cuando llegue" (delivered only)
- "Notificarme estados importantes" (shipped, out_for_delivery, delivered)
- "Notificarme todo" (cada cambio)

---

## Quick Fixes Inmediatos

### Fix 1: Aumentar ventana de deduplicacion

```typescript
// onesignalService.ts linea 797 y 871
// Cambiar de 10 minutos a 60 minutos
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
```

### Fix 2: Remover historyAdvanced como trigger

```typescript
// trackingService.ts linea 50
// Cambiar de:
if (statusChanged || historyAdvanced) {
// A:
if (statusChanged && ['out_for_delivery', 'delivered'].includes(result.status)) {
```

### Fix 3: Agregar flag fulfilled_notified

```sql
-- Migracion SQL
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_notified BOOLEAN DEFAULT FALSE;
```

---

## Conclusion

El sistema actual tiene una arquitectura de "dispara todo y deja que la deduplicacion filtre" que no escala bien. Los principales culpables son:

1. **Multiples webhooks procesando el mismo evento** - Race condition
2. **historyAdvanced como trigger** - Sobre-notificacion por cada movimiento interno
3. **Ventana de deduplicacion muy corta** - 10 minutos no cubre race conditions
4. **Sin rate limiting por cliente** - Pueden llegar 5+ mensajes el mismo dia

**Prioridad de fixes:**
1. P0-BUG2 (historyAdvanced) - Mayor impacto en spam actual
2. P0-BUG1 (doble webhook) - Causa duplicados inmediatos
3. P0-BUG3 (ventana dedup) - Prevencion
4. P1-Issue1 (horario) - UX improvement
