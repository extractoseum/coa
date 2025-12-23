# Analisis CI/CD - Plan de Optimizacion

**Fecha:** 2025-12-23
**Estado Actual:** Basico
**Objetivo:** Evaluar niveles de optimizacion propuestos

---

## Estado Actual de tu Infraestructura

### Workflows Existentes:
```
.github/workflows/
├── swis-watch.yml      # Build + E2E en cada push/PR
└── drift-check.yml     # Detecta UI drift en PRs
```

### Scripts de Deploy:
```
deploy_backend_auto.sh   # SSH + SCP directo a VPS
deploy_frontend_auto.sh  # SSH + SCP con expect (password)
deploy_atomic.sh         # Deploy atomico
```

### Estructura del Proyecto:
```
COA Viewer 2.0/
├── frontend/           # Vite + React + Capacitor
├── backend/            # Express + TypeScript
├── e2e/                # Playwright tests (4 specs)
└── migrations/         # SQL files
```

### Deploy Actual:
- **Metodo:** SSH directo a VPS (148.230.88.203)
- **Backend:** PM2 restart
- **Frontend:** SCP a /var/www/coa-viewer/
- **NO hay:** Docker, Kubernetes, Vercel, AWS

---

## Evaluacion por Nivel

### NIVEL 1: Path Filters + Cache
**Aplicabilidad:** ALTA
**Esfuerzo:** BAJO (1-2 horas)

#### 1.1 Path Filters

**PUEDE APLICARSE:** SI

Actualmente `swis-watch.yml` corre en CADA push sin filtrar:
```yaml
on: [push, pull_request]  # ← Corre TODO siempre
```

**Mejora propuesta:**
```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    paths:
      - 'frontend/**'
      - 'backend/**'
      - 'e2e/**'
      - 'package.json'

jobs:
  frontend:
    if: |
      contains(github.event.head_commit.modified, 'frontend/') ||
      github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run build

  backend:
    if: |
      contains(github.event.head_commit.modified, 'backend/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && npm ci && npm run build

  e2e:
    needs: [frontend]
    if: |
      contains(github.event.head_commit.modified, 'e2e/') ||
      contains(github.event.head_commit.modified, 'frontend/')
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test
```

**Beneficio:** Si solo cambias `docs/`, no corre nada. Si cambias `backend/`, no corre frontend tests.

#### 1.2 Cache NPM + Playwright

**PUEDE APLICARSE:** SI (No existe actualmente)

Tu workflow actual:
```yaml
- run: npm ci                           # ← Descarga TODO cada vez
- run: npx playwright install --with-deps  # ← Descarga browsers cada vez
```

**Mejora propuesta:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: |
      frontend/package-lock.json
      backend/package-lock.json

- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}

- run: npx playwright install --with-deps
  if: steps.cache-playwright.outputs.cache-hit != 'true'
```

**Beneficio:** De ~3 min a ~30 seg en cache hit.

#### 1.3 Vite Build Cache

**PUEDE APLICARSE:** SI

```yaml
- name: Cache Vite build
  uses: actions/cache@v4
  with:
    path: frontend/node_modules/.vite
    key: vite-${{ hashFiles('frontend/src/**') }}
```

**Beneficio:** Builds incrementales.

---

### NIVEL 2: Turborepo/Nx
**Aplicabilidad:** MEDIA
**Esfuerzo:** MEDIO (4-8 horas)

#### Analisis:

Tu proyecto tiene estructura de **monorepo** (`frontend/` + `backend/`) pero NO esta configurado como tal.

**Problemas actuales:**
- `npm ci` en raiz no instala frontend/backend
- Builds se hacen por separado
- No hay orquestacion de tareas

**Turbo podria ayudar:**
```json
// turbo.json (nuevo archivo)
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

```bash
# En lugar de:
cd frontend && npm run build
cd backend && npm run build

# Usarias:
turbo run build --filter=...[origin/main]
```

**PERO:** Tu proyecto es relativamente simple (2 packages). Turbo/Nx brilla mas con 5+ packages.

**Recomendacion:** SKIP por ahora. El ROI no justifica la complejidad.

---

### NIVEL 3: Preview Deployments + Canary
**Aplicabilidad:** MEDIA-BAJA
**Esfuerzo:** ALTO (8-16 horas)

#### 3.1 Preview Deployments

**Situacion actual:** Deploy directo a produccion via SSH

**Para preview deployments necesitarias:**

**Opcion A: Vercel (Frontend)**
- Migrar frontend de VPS a Vercel
- Cada PR obtiene URL automatica
- E2E corre contra esa URL

**Opcion B: DIY con Docker + Nginx**
```yaml
# En VPS, crear subdominio por PR
pr-123.coa.extractoseum.com
```

**Problema:** Tu backend es Express en VPS, no serverless. Preview deployments requeririan:
1. Dockerizar backend
2. Orquestar con Docker Compose por PR
3. Proxy reverso dinamico (Traefik/Nginx)

**Esfuerzo:** 8-16 horas de setup inicial

**Recomendacion:** SKIP. Tu modelo de deploy directo a VPS es simple y funciona. Preview deployments son mas utiles cuando tienes multiples developers.

#### 3.2 Canary Deployments

**Situacion actual:** PM2 restart = todo o nada

**Para canary necesitarias:**
1. Load balancer (Nginx upstream)
2. Multiples instancias PM2
3. Health checks
4. Rollback automatico

**No aplica bien** porque:
- Solo tienes 1 VPS
- No tienes load balancer
- No tienes telemetria de canary (errores por version)

**Recomendacion:** SKIP. Canary es para produccion con alto trafico.

---

## Resumen de Recomendaciones

| Mejora | Aplicable? | Esfuerzo | Beneficio | Prioridad |
|--------|------------|----------|-----------|-----------|
| Path filters | SI | 1 hora | Alto | P0 |
| NPM cache | SI | 30 min | Alto | P0 |
| Playwright cache | SI | 30 min | Alto | P0 |
| Vite cache | SI | 15 min | Medio | P1 |
| Turborepo | NO | 4-8 hrs | Bajo | SKIP |
| Preview deploys | NO* | 8-16 hrs | Medio | SKIP |
| Canary | NO | 16+ hrs | Bajo | SKIP |

*Preview deploys podrian valer la pena si migras frontend a Vercel.

---

## Plan de Implementacion Sugerido

### Fase 1: Quick Wins (2 horas)

1. **Actualizar swis-watch.yml con path filters y cache**
2. **Agregar cache de Playwright browsers**
3. **Agregar cache de npm**

### Fase 2: Mejoras Opcionales (4 horas)

1. **Separar jobs por frontend/backend**
2. **Agregar job de migrations check**
3. **Agregar notificacion Slack/Discord en failure**

### Fase 3: Si el Proyecto Crece (Futuro)

1. Evaluar Vercel para frontend (preview deploys gratis)
2. Evaluar Docker para backend (portabilidad)
3. Evaluar Turbo si agregas mas packages

---

## Mejoras NO Mencionadas que SI Deberias Considerar

### 1. Migration Check en CI

**No tienes:** Validacion de SQL antes de deploy

```yaml
migrations-check:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Check SQL syntax
      run: |
        for f in backend/migrations/*.sql; do
          psql --set ON_ERROR_STOP=on -f "$f" || exit 1
        done
      env:
        PGHOST: localhost  # Usar PostgreSQL action
```

### 2. TypeScript Strict Check

**Tienes:** `npm run build` pero no valida strict mode

```yaml
- name: TypeScript Check
  run: |
    cd backend && npx tsc --noEmit
    cd ../frontend && npx tsc --noEmit
```

### 3. Security Audit

```yaml
- name: Security Audit
  run: |
    cd backend && npm audit --audit-level=high
    cd ../frontend && npm audit --audit-level=high
```

### 4. Deploy desde CI (no local)

**Riesgo actual:** Deploys manuales desde tu Mac

**Mejora:** Agregar workflow de deploy:
```yaml
name: Deploy Production

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: 148.230.88.203
          username: root
          key: ${{ secrets.DEPLOY_KEY }}
          script: |
            cd /var/www/coa-viewer/backend
            git pull
            npm ci --omit=dev
            npm run build
            pm2 restart coa-backend
```

---

## Conclusion

**Tu setup actual es funcional para un proyecto de tu tamano.** Las mejoras de Nivel 1 (path filters + cache) daran el mayor ROI con minimo esfuerzo.

**Niveles 2 y 3 son over-engineering** para tu caso actual:
- Solo 1 developer (tu)
- Solo 1 VPS
- Proyecto no es microservicios
- No hay CD complejo

**Enfocate en:**
1. Cache (ahorra tiempo)
2. Path filters (ahorra tiempo)
3. Deploy desde CI (seguridad)
4. TypeScript strict (calidad)
