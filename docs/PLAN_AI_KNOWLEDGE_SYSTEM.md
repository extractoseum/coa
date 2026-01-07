# Plan de Implementación: Sistema de Conocimiento AI Inteligente

## Resumen Ejecutivo
Este plan implementa mejoras quirúrgicas al sistema de AI Knowledge para maximizar la efectividad de los agentes mediante auto-aprendizaje, tracking de outcomes, y feedback loops.

---

## FASE 1: Drag-and-Drop para Knowledge Files
**Objetivo:** Permitir arrastrar archivos entre carpetas y reorganizar el conocimiento visualmente.

### Checkpoint 1.1: Backend - Endpoint de movimiento
**Archivo:** `backend/src/controllers/knowledgeController.ts`
```typescript
// Nuevo endpoint: moveKnowledgeFile
export const moveKnowledgeFile = async (req, res) => {
    // sourcePath, destinationFolder
    // Validar paths, mover archivo, actualizar metadata
}
```

### Checkpoint 1.2: Backend - Ruta
**Archivo:** `backend/src/routes/knowledgeRoutes.ts`
```typescript
router.post('/move', moveKnowledgeFile);
```

### Checkpoint 1.3: Frontend - Drag handlers
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx`
- Agregar `draggable` a FileCard
- Implementar `onDragStart`, `onDragOver`, `onDrop` en folders
- Visual feedback durante drag (border highlight)

### Checkpoint 1.4: Sync de Snaps post-movimiento
**Archivo:** `backend/src/services/intelligenceService.ts`
- Al mover archivo, regenerar snap en destino
- Eliminar snap del origen si aplica

**Criterio de éxito:** Poder arrastrar un archivo .md de una carpeta a otra y ver el snap actualizado.

---

## FASE 2: Enhanced Snaps (Triggers, Priority, Effectiveness)
**Objetivo:** Snaps más inteligentes con información de cuándo activarse y qué tan efectivos son.

### Checkpoint 2.1: Extender interfaz KnowledgeSnap
**Archivo:** `backend/src/services/intelligenceService.ts`
```typescript
export interface KnowledgeSnap {
    // Existentes
    fileName: string;
    path: string;
    summary: string;
    usage: string;
    adminNotes: string;
    lastUpdated: string;
    contentHash: string;
    isGlobal: boolean;

    // NUEVOS
    triggers: string[];        // Palabras clave que activan este conocimiento
    priority: number;          // 1-10, para resolver conflictos
    usageCount: number;        // Veces que se ha usado
    effectivenessScore: number; // 0-100 basado en feedback
    lastUsed: string | null;   // Timestamp de último uso
    category: 'product' | 'policy' | 'faq' | 'procedure' | 'reference';
}
```

### Checkpoint 2.2: AI genera triggers automáticos
**Archivo:** `backend/src/services/intelligenceService.ts`
```typescript
// Modificar createKnowledgeSnap para extraer triggers
const prompt = `...
Responde en JSON:
{
  "summary": "...",
  "usage": "...",
  "triggers": ["precio", "costo", "cuánto cuesta"],
  "category": "product"
}`;
```

### Checkpoint 2.3: UI para editar triggers y priority
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx`
- En el modal de snaps, agregar:
  - Input de tags para triggers (editable)
  - Slider para priority (1-10)
  - Badge para category (selectable)
  - Display de usageCount y effectivenessScore (readonly)

### Checkpoint 2.4: Integrar triggers en selección de contexto
**Archivo:** `backend/src/controllers/aiController.ts`
```typescript
// Antes de chat, analizar mensaje del usuario
// Filtrar snaps que tengan triggers que matcheen
// Ordenar por priority
// Incluir solo los top N relevantes en el contexto
```

**Criterio de éxito:** Admin puede ver/editar triggers, y el agente usa snaps relevantes basado en keywords del mensaje.

---

## FASE 3: Conversation Outcome Tracking
**Objetivo:** Saber si una conversación resultó en venta, resolución, o churn.

### Checkpoint 3.1: Extender Conversation interface
**Archivo:** `backend/src/services/aiConversationService.ts`
```typescript
export interface Conversation {
    // Existentes...

    // NUEVOS
    outcome?: 'sale' | 'resolution' | 'escalation' | 'churn' | 'pending' | null;
    outcomeValue?: number;     // Valor en $ si es venta
    outcomeNotes?: string;     // Notas del admin
    outcomeSetBy?: string;     // userId que marcó el outcome
    outcomeSetAt?: string;     // Timestamp
    agentUsed: string;         // Qué agente manejó la conversación
    snapsUsed: string[];       // Qué snaps se incluyeron en el contexto
}
```

### Checkpoint 3.2: Endpoint para marcar outcome
**Archivo:** `backend/src/controllers/aiController.ts`
```typescript
export const setConversationOutcome = async (req, res) => {
    const { conversationId, outcome, value, notes } = req.body;
    // Actualizar conversación con outcome
    // Trigger actualización de effectiveness en snaps usados
}
```

### Checkpoint 3.3: UI para marcar outcomes
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx` o nuevo componente
- Lista de conversaciones recientes sin outcome
- Botones rápidos: ✓ Venta | ✓ Resuelto | ⚠ Escalado | ✗ Perdido
- Modal para agregar valor y notas

### Checkpoint 3.4: Auto-tracking de snaps usados
**Archivo:** `backend/src/controllers/aiController.ts`
```typescript
// En chatWithAra, guardar qué snaps se incluyeron
convService.updateSnapsUsed(conversationId, includedSnaps.map(s => s.fileName));
```

**Criterio de éxito:** Conversaciones pueden marcarse con outcomes, y se registra qué snaps se usaron.

---

## FASE 4: Confidence Scoring System
**Objetivo:** AI indica su nivel de confianza en cada respuesta.

### Checkpoint 4.1: Modificar prompt del agente
**Archivo:** `backend/src/services/intelligenceService.ts`
```typescript
// En generateInstructivoSnapsSection, agregar instrucción:
section += `
### INSTRUCCIONES DE CONFIANZA
Al responder, indica tu nivel de confianza:
- 🟢 ALTA: Información directa de tu conocimiento
- 🟡 MEDIA: Inferencia razonable pero no explícita
- 🔴 BAJA: Especulación o información no disponible
`;
```

### Checkpoint 4.2: Parsear confidence de respuesta
**Archivo:** `backend/src/services/aiService.ts`
```typescript
// Post-procesar respuesta para extraer confidence
interface AIResponse {
    content: string;
    confidence?: 'high' | 'medium' | 'low';
    confidenceReason?: string;
}
```

### Checkpoint 4.3: Guardar confidence en mensaje
**Archivo:** `backend/src/services/aiConversationService.ts`
```typescript
export interface Message {
    // Existentes...
    confidence?: 'high' | 'medium' | 'low';
}
```

### Checkpoint 4.4: UI muestra confidence
**Archivo:** Frontend chat component
- Badge de color junto a respuestas del asistente
- Tooltip explicando qué significa cada nivel

**Criterio de éxito:** Respuestas muestran indicador de confianza y se guarda en historial.

---

## FASE 5: Feedback Loop (Ratings + Corrections)
**Objetivo:** Usuarios pueden calificar respuestas y admins corregir información.

### Checkpoint 5.1: Nueva tabla/estructura de feedback
**Archivo:** `backend/src/services/feedbackService.ts` (nuevo)
```typescript
export interface ResponseFeedback {
    id: string;
    conversationId: string;
    messageId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    feedbackType: 'helpful' | 'incorrect' | 'incomplete' | 'confusing';
    correction?: string;        // Texto corregido por admin
    reportedBy: string;
    createdAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    appliedToSnap?: string;    // Si se usó para actualizar un snap
}
```

### Checkpoint 5.2: Endpoints de feedback
**Archivo:** `backend/src/routes/aiRoutes.ts`
```typescript
router.post('/feedback', submitFeedback);
router.get('/feedback', getFeedbackList);
router.post('/feedback/:id/apply', applyFeedbackToSnap);
```

### Checkpoint 5.3: Widget de rating en chat
**Archivo:** Frontend chat component
- Thumbs up/down en cada respuesta del asistente
- Opción de expandir para dar feedback detallado
- Form para sugerir corrección

### Checkpoint 5.4: Panel de revisión de feedback
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx`
- Tab "Feedback Pendiente"
- Lista de feedback con correcciones sugeridas
- Botón "Aplicar a Snap" que actualiza adminNotes del snap relevante

### Checkpoint 5.5: Auto-ajuste de effectiveness
**Archivo:** `backend/src/services/intelligenceService.ts`
```typescript
// Cuando se recibe feedback, actualizar effectivenessScore del snap
// positivo: +5 puntos (max 100)
// negativo: -10 puntos (min 0)
public updateSnapEffectiveness(agentDir: string, fileName: string, isPositive: boolean)
```

**Criterio de éxito:** Usuarios califican respuestas, admins ven feedback, effectiveness se ajusta automáticamente.

---

## FASE 6: Tool Usage Analytics
**Objetivo:** Saber qué herramientas usa el agente y cuáles son más efectivas.

### Checkpoint 6.1: Extender logging de tools
**Archivo:** `backend/src/services/aiService.ts`
```typescript
// En generateChatWithTools, loguear cada tool call
interface ToolUsageLog {
    timestamp: string;
    conversationId: string;
    toolName: string;
    input: any;
    output: any;
    executionTime: number;
    success: boolean;
    errorMessage?: string;
}
```

### Checkpoint 6.2: Servicio de analytics
**Archivo:** `backend/src/services/toolAnalyticsService.ts` (nuevo)
```typescript
export class ToolAnalyticsService {
    logToolUsage(log: ToolUsageLog): void;
    getToolStats(): {
        byTool: Record<string, { calls: number, successRate: number, avgTime: number }>;
        byDay: Record<string, number>;
        topErrors: { tool: string, error: string, count: number }[];
    };
}
```

### Checkpoint 6.3: Dashboard de tools
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx`
- Tab "Tool Analytics"
- Gráfico de uso por herramienta (bar chart)
- Tabla de success rate
- Lista de errores frecuentes

**Criterio de éxito:** Admin puede ver qué tools se usan más y cuáles fallan.

---

## FASE 7: Agent Performance Dashboard
**Objetivo:** Vista ejecutiva del rendimiento de cada agente.

### Checkpoint 7.1: Agregación de métricas
**Archivo:** `backend/src/services/agentMetricsService.ts` (nuevo)
```typescript
export interface AgentMetrics {
    agentName: string;
    period: 'day' | 'week' | 'month';
    conversationCount: number;
    avgMessagesPerConv: number;
    outcomeBreakdown: Record<string, number>;
    avgConfidence: number;
    avgRating: number;
    topSnapsUsed: { snapName: string, count: number }[];
    totalRevenue: number;  // Si outcome=sale con valor
}
```

### Checkpoint 7.2: Endpoint de métricas
**Archivo:** `backend/src/routes/knowledgeRoutes.ts`
```typescript
router.get('/agents/:agentName/metrics', getAgentMetrics);
router.get('/metrics/summary', getAllAgentsMetricsSummary);
```

### Checkpoint 7.3: Dashboard UI
**Archivo:** `frontend/src/pages/AdminAIKnowledge.tsx`
- Tab "Performance"
- Selector de agente y período
- Cards con KPIs principales
- Gráfico de tendencia de outcomes
- Tabla comparativa entre agentes

### Checkpoint 7.4: Alertas automáticas
**Archivo:** `backend/src/services/agentMetricsService.ts`
```typescript
// Detectar anomalías
checkForAlerts(): Alert[] {
    // - Effectiveness de snap cayó >20%
    // - Ratio de churn aumentó
    // - Confidence promedio bajó
}
```

**Criterio de éxito:** Dashboard muestra métricas por agente, tendencias, y alertas de anomalías.

---

## Orden de Implementación Recomendado

```
Semana 1: FASE 1 (Drag-and-Drop) + FASE 2 (Enhanced Snaps)
          └─ Fundación para todo lo demás

Semana 2: FASE 3 (Outcome Tracking) + FASE 4 (Confidence)
          └─ Empezar a recolectar datos de calidad

Semana 3: FASE 5 (Feedback Loop)
          └─ Cerrar el ciclo de mejora continua

Semana 4: FASE 6 (Tool Analytics) + FASE 7 (Dashboard)
          └─ Visibilidad ejecutiva
```

---

## Archivos a Crear/Modificar por Fase

| Fase | Backend | Frontend |
|------|---------|----------|
| 1 | knowledgeController.ts, knowledgeRoutes.ts, intelligenceService.ts | AdminAIKnowledge.tsx |
| 2 | intelligenceService.ts, aiController.ts | AdminAIKnowledge.tsx |
| 3 | aiConversationService.ts, aiController.ts | AdminAIKnowledge.tsx |
| 4 | intelligenceService.ts, aiService.ts, aiConversationService.ts | Chat component |
| 5 | feedbackService.ts (nuevo), aiRoutes.ts | AdminAIKnowledge.tsx, Chat component |
| 6 | aiService.ts, toolAnalyticsService.ts (nuevo) | AdminAIKnowledge.tsx |
| 7 | agentMetricsService.ts (nuevo), knowledgeRoutes.ts | AdminAIKnowledge.tsx |

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Overhead de logging afecta performance | Usar escritura async, batch de logs |
| Triggers generan falsos positivos | Permitir admin override, A/B testing |
| Dashboard lento con muchos datos | Agregación incremental, cache |
| Usuarios no dan feedback | Gamification, simplificar a 1-click |

---

## Métricas de Éxito del Proyecto

1. **Adopción:** >80% de conversaciones con outcome marcado
2. **Feedback:** >50 ratings por semana
3. **Effectiveness:** Promedio de snaps >70%
4. **Confidence:** >60% respuestas con alta confianza
5. **Revenue:** Tracking de ingresos atribuidos a agentes
