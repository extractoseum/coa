# PROJECT CHECKPOINTS & BASELINES

Este documento actúa como un registro inmutable de estados estables del proyecto. Cada checkpoint define un "baseline" sobre el cual construir.

---

## [2025-12-21] Theme & Layout Indicator
**Tag**: `checkpoint-2025-12-21-theme-layout`
**Status**: ❤️ Stable & Verified

> **BASELINE DECLARATION**:
> - [x] **Mission A**: Agent Trust (100% Score) - Verified by `agent-challenge.spec.ts`
> - [x] **Mission B**: Self-Healing UI - Verified by `fix-drift.js`
> - [x] **Mission C**: Telemetry Insights - Verified by `insightService.ts`
> - [x] **Mission D**: Commercial Ready - Verified by `SWIS_COMMERCIAL.md`
> es el **baseline visual y de layout** para todos los pilares de SWIS Watch. Cualquier cambio futuro en estilos globales, layouts o themes debe ser comparado contra este estado.

### 🌟 Key Achievements
- **Theme Engine**: Desacoplado vía `ThemeContext`.
- **Navigation**: `ThemeSwitcher` no invasivo + integración responsive.
- **Layout**: Unificado en `AdminAIKnowledge` y `AdminCRM`.

### ⚠️ Known Constraints
- **Theme Persistence**: El cambio de tema es *client-side only* (localStorage). No hay sincronización SSR por el momento.
- **Neon Availability**: El tema "Neon Premium" está disponible para todos los usuarios. La restricción por rol/suscripción está planeada para una fase futura.

---
