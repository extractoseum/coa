# SWIS Watch v1.0 - Especificación Técnica

> v1.0 – Resilience Baseline
> Estado: 🟢 Stable · Auditable · CI-Ready

## Qué es SWIS Watch

SWIS Watch (Self-Watching Interface System) es un framework de observabilidad
que hace que el frontend se explique solo, se audite solo y se defienda solo.

## Los 7 Pilares

### 1. UI Beacons
- `data-testid` en elementos críticos
- Catálogo central: `frontend/src/telemetry/uiMap.ts`
- Convención: `section.subsection.element` (ej: `nav.admin.coas`)

### 2. Route Contracts
- Source of truth: `frontend/src/routes.ts`
- Helpers tipados: `to.coa(token)`, `to.folder(token)`
- Manifest generado: `public/routeManifest.json`

### 3. Site Stamps
- BuildStamp visible con `env` + `buildId`
- Screen wrapper: `<Screen id="ScreenName">`
- Cada página tiene `data-screen-id`

### 4. Traceability
- TraceId por sesión (sessionStorage)
- Logger estructurado con contexto
- Códigos de error `E_*` estables

### 5. Self-Verification
- Playwright smoke + beacon tests
- CI verifica contratos automáticamente
- Artifacts en caso de fallo

### 6. QA Overlay
- Toggle: `Cmd+.` o `Ctrl+.`
- Inspector de elementos
- Copy selector al clipboard

### 7. Governance
- Husky pre-commit: `validate-uimap.js`
- GitHub Actions: `swis-watch.yml`
- Bloquea PRs que rompan observabilidad

## Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `frontend/src/routes.ts` | Rutas tipadas |
| `frontend/src/telemetry/uiMap.ts` | Catálogo de testIds |
| `frontend/src/telemetry/Screen.tsx` | Wrapper de pantalla |
| `frontend/src/telemetry/trace.ts` | Generador de traceId |
| `frontend/src/telemetry/log.ts` | Logger frontend |
| `frontend/src/telemetry/QAOverlay.tsx` | Inspector visual |
| `scripts/validate-uimap.js` | Guardrails pre-commit |
| `.github/workflows/swis-watch.yml` | CI pipeline |
| `backend/src/services/loggerService.ts` | Logger backend + E_* codes |
