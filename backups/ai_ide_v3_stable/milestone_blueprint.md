# Blueprint: AI IDE Milestones (Dec 20th - Stable V3)

Este documento sirve como mapa técnico para restaurar la configuración exacta del **AI Knowledge Editor** en caso de fallos en futuras iteraciones.

## 🏗️ Estructura del Sistema
El sistema se divide en tres pilares fundamentales que deben estar sincronizados:

### 1. El Registro (La Inteligencia)
- **Archivo**: `backend/data/ai_knowledge_base/core/tools_registry.json`
- **Función**: Fuente de verdad única para las herramientas.
- **Formato**: JSON compatible con OpenAI-Schema, enriquecido con la propiedad `"category"` para iconos visuales.

### 2. El Motor (El Backend)
- **Archivos**: 
  - `backend/src/controllers/knowledgeController.ts`
  - `backend/src/routes/knowledgeRoutes.ts`
- **Lógica Crítica**:
  - Filtra archivos por extensión (`.md`, `.json`, `.yaml`) para permitir la edición del registro.
  - Define `KNOWLEDGE_BASE_DIR` fuera de `dist` para persistencia en despliegues.
  - Expone el registro mediante `/api/knowledge/tools-registry`.

### 3. La Interfaz (El IDE)
- **Archivo**: `frontend/src/pages/AdminAIKnowledge.tsx`
- **Componentes Clave**:
  - **Monaco Editor**: Integrado con soporte dinámico para Markdown y JSON.
  - **Toolbox Sidebar**: Renderizado lateral con búsqueda y mapeo de iconos mediante Lucide-React.
  - **Layout Flex-Stretch**: Diseño resiliente al zoom mediante `lg:grid-cols-12` y `min-width: 0`.

---

## 🛠️ Procedimiento de Restauración (Panic Button)
Si algo se rompe irremediablemente, ejecuta estos comandos desde la raíz del proyecto:

```bash
# 1. Restaurar Frontend
cp backups/ai_ide_v3_stable/AdminAIKnowledge.tsx.bak frontend/src/pages/AdminAIKnowledge.tsx

# 2. Restaurar Backend (Lógica)
cp backups/ai_ide_v3_stable/knowledgeController.ts.bak backend/src/controllers/knowledgeController.ts
cp backups/ai_ide_v3_stable/knowledgeRoutes.ts.bak backend/src/routes/knowledgeRoutes.ts

# 3. Restaurar Registro de Tools
cp backups/ai_ide_v3_stable/tools_registry.json.bak backend/data/ai_knowledge_base/core/tools_registry.json

# 4. Redesplegar Todo
bash deploy_backend_auto.sh && bash deploy_atomic.sh
```

---

## 💎 Características de este Milestone
- [x] **Elastic UI**: El IDE no se rompe a 200% de zoom.
- [x] **Visual Symbols**: Todas las herramientas tienen iconos descriptivos (WhatsApp, Shopify, etc.).
- [x] **CORE Editing**: El archivo `tools_registry.json` es visible y editable desde el navegador.
- [x] **Atomic Sync**: Despliegues automáticos que no borran la base de datos de conocimiento.
