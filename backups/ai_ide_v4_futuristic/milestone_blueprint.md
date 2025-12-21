# Milestone Blueprint: AI IDE v4 - Futuristic Models & Health System

Este documento contiene la información necesaria para restaurar el sistema al punto estable alcanzado el 20 de diciembre de 2025.

## Estado del Sistema
- **IA**: Soporte para modelos Gemini 2.5, 3.0 (Preview) y 2.0.
- **Salud**: Monitoreo en vivo (🟢/🔴) en el Sidekick basado en un endpoint `/status`.
- **Filtro**: Limpieza automática de errores en el historial de chat.
- **IDE**: Biblioteca de herramientas operativa con Monaco Editor.

## Comandos de Restauración (Panic Button)

Para restaurar los archivos críticos a este punto, ejecuta los siguientes comandos desde la raíz del proyecto:

```bash
# Backend
cp backups/ai_ide_v4_futuristic/aiService.ts.bak backend/src/services/aiService.ts
cp backups/ai_ide_v4_futuristic/aiTools.ts.bak backend/src/services/aiTools.ts
cp backups/ai_ide_v4_futuristic/aiController.ts.bak backend/src/controllers/aiController.ts
cp backups/ai_ide_v4_futuristic/aiRoutes.ts.bak backend/src/routes/aiRoutes.ts
cp backups/ai_ide_v4_futuristic/tools_registry.json.bak backend/data/ai_knowledge_base/core/tools_registry.json

# Frontend
cp backups/ai_ide_v4_futuristic/AdminSidekick.tsx.bak frontend/src/components/AdminSidekick.tsx
```

## Despliegue Directo
Después de restaurar, puedes redesplegar con:
```bash
bash deploy_backend_auto.sh && bash deploy_atomic.sh
```
