# Plan: SWIS Watch - Mejoras Opcionales v1.1

## Resumen Ejecutivo

Este plan detalla la implementación de las 4 mejoras opcionales para SWIS Watch:

| Mejora | Beneficio | Esfuerzo | Prioridad |
|--------|-----------|----------|-----------|
| 1. Sitemap.xml dinámico | SEO + crawlers | 1 día | Baja |
| 2. Tests E2E autenticados | Cobertura | 1-2 días | Media |
| 3. Dashboard de telemetría | Visualización | 1 día | Baja |
| 4. Documentación formal MD | Onboarding | 0.5 día | Media |

---

## 1. SITEMAP.XML DINÁMICO

### Objetivo
Generar un sitemap.xml que incluya rutas estáticas y dinámicas (COAs públicos, carpetas) para SEO.

### Archivos a crear/modificar

```
backend/src/routes/sitemapRoutes.ts      # NUEVO - Rutas del sitemap
backend/src/controllers/sitemapController.ts  # NUEVO - Lógica de generación
frontend/public/robots.txt               # NUEVO - Referencia al sitemap
```

### Implementación

#### A. Endpoint Backend (`sitemapController.ts`)

```typescript
// GET /api/v1/sitemap.xml
export const getSitemap = async (req: Request, res: Response) => {
    const BASE_URL = 'https://coa.extractoseum.com';

    // 1. Rutas estáticas
    const staticRoutes = [
        { loc: '/', priority: '1.0', changefreq: 'weekly' },
        { loc: '/login', priority: '0.5', changefreq: 'monthly' },
    ];

    // 2. Rutas dinámicas - COAs públicos
    const { data: coas } = await supabase
        .from('coas')
        .select('public_token, updated_at')
        .eq('is_hidden', false);

    const coaRoutes = coas?.map(coa => ({
        loc: `/coa/${coa.public_token}`,
        lastmod: coa.updated_at,
        priority: '0.8',
        changefreq: 'daily'
    })) || [];

    // 3. Carpetas públicas
    const { data: folders } = await supabase
        .from('folders')
        .select('public_token, updated_at')
        .eq('is_public', true);

    const folderRoutes = folders?.map(f => ({
        loc: `/folder/${f.public_token}`,
        lastmod: f.updated_at,
        priority: '0.6',
        changefreq: 'weekly'
    })) || [];

    // 4. Generar XML
    const xml = generateSitemapXML(BASE_URL, [...staticRoutes, ...coaRoutes, ...folderRoutes]);

    res.header('Content-Type', 'application/xml');
    res.send(xml);
};
```

#### B. Robots.txt (`frontend/public/robots.txt`)

```
User-agent: *
Allow: /
Allow: /coa/
Allow: /folder/
Disallow: /dashboard
Disallow: /admin/
Disallow: /api/

Sitemap: https://coa.extractoseum.com/api/v1/sitemap.xml
```

#### C. Registrar ruta en `index.ts`

```typescript
import sitemapRoutes from './routes/sitemapRoutes';
app.use('/api/v1', sitemapRoutes);
```

### Resultado esperado
- `GET /api/v1/sitemap.xml` → XML válido con ~N COAs públicos
- `GET /robots.txt` → Referencia al sitemap
- Google Search Console puede indexar COAs públicos

---

## 2. TESTS E2E PARA RUTAS AUTENTICADAS

### Objetivo
Probar rutas protegidas (`/dashboard`, `/my-orders`, admin routes) con usuarios autenticados.

### Archivos a crear/modificar

```
e2e/auth.setup.ts            # NUEVO - Setup de autenticación
e2e/fixtures/test-users.ts   # NUEVO - Usuarios de prueba
e2e/authenticated.spec.ts    # NUEVO - Tests de rutas protegidas
playwright.config.ts         # MODIFICAR - Agregar proyecto autenticado
```

### Implementación

#### A. Setup de Autenticación (`e2e/auth.setup.ts`)

```typescript
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate as regular user', async ({ page }) => {
    // Opción 1: Login via API (más rápido)
    const response = await page.request.post('/api/v1/auth/login', {
        data: {
            email: process.env.E2E_TEST_EMAIL || 'test@e2e.local',
            password: process.env.E2E_TEST_PASSWORD || 'TestPass123!'
        }
    });

    const { accessToken, refreshToken } = await response.json();

    // Inyectar tokens en localStorage
    await page.goto('/');
    await page.evaluate(({ access, refresh }) => {
        localStorage.setItem('accessToken', access);
        localStorage.setItem('refreshToken', refresh);
    }, { access: accessToken, refresh: refreshToken });

    // Guardar estado
    await page.context().storageState({ path: authFile });
});
```

#### B. Usuarios de Prueba (`e2e/fixtures/test-users.ts`)

```typescript
export const TEST_USERS = {
    regular: {
        email: 'e2e-user@extractoseum.com',
        password: 'E2E_Test_2024!',
        role: 'client'
    },
    admin: {
        email: 'e2e-admin@extractoseum.com',
        password: 'E2E_Admin_2024!',
        role: 'super_admin'
    }
};
```

#### C. Tests Autenticados (`e2e/authenticated.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authenticated Routes', () => {
    test.use({ storageState: '.auth/user.json' });

    test('Dashboard loads for authenticated user', async ({ page }) => {
        await page.goto('/dashboard');
        await expect(page.locator('[data-screen-id="screen.dashboard"]')).toBeVisible();
        await expect(page).not.toHaveURL('/login');
    });

    test('My Orders shows order list', async ({ page }) => {
        await page.goto('/my-orders');
        await expect(page.locator('[data-screen-id="MyOrders"]')).toBeVisible();
    });

    test('My Collection accessible', async ({ page }) => {
        await page.goto('/my-collection');
        await expect(page.locator('[data-screen-id="MyCollection"]')).toBeVisible();
    });

    test('Redirect to login when not authenticated', async ({ browser }) => {
        const context = await browser.newContext(); // Sin auth
        const page = await context.newPage();
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Admin Routes', () => {
    test.use({ storageState: '.auth/admin.json' });

    test('Admin CRM accessible for super_admin', async ({ page }) => {
        await page.goto('/admin/crm');
        await expect(page.locator('[data-screen-id="screen.admin.crm"]')).toBeVisible();
    });

    test('Regular user denied admin routes', async ({ browser }) => {
        const context = await browser.newContext({ storageState: '.auth/user.json' });
        const page = await context.newPage();
        await page.goto('/admin/crm');
        // Debería mostrar Access Denied o redirect
        await expect(page.locator('text=Acceso Denegado')).toBeVisible();
    });
});
```

#### D. Actualizar `playwright.config.ts`

```typescript
export default defineConfig({
    // ... config existente
    projects: [
        // Setup projects
        { name: 'setup', testMatch: /.*\.setup\.ts/ },

        // Tests sin auth
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            testIgnore: /authenticated/,
        },

        // Tests con auth
        {
            name: 'chromium-authenticated',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /authenticated/,
            dependencies: ['setup'],
        },
    ],
});
```

### Resultado esperado
- Tests verifican acceso a rutas protegidas
- CI falla si rutas autenticadas se rompen
- Cobertura de `/dashboard`, `/my-orders`, `/my-collection`, `/admin/*`

---

## 3. DASHBOARD DE TELEMETRÍA

### Objetivo
Visualizar logs de telemetría en una página admin con filtros y búsqueda.

### Archivos a crear/modificar

```
frontend/src/pages/AdminTelemetry.tsx    # NUEVO - Página dashboard
frontend/src/telemetry/uiMap.ts          # MODIFICAR - Agregar testid
frontend/src/routes.ts                   # MODIFICAR - Agregar ruta
frontend/src/App.tsx                     # MODIFICAR - Agregar Route
backend/src/routes/logsRoutes.ts         # NUEVO - Rutas de logs
backend/src/controllers/logsController.ts # NUEVO - Controlador
backend/src/index.ts                     # MODIFICAR - Persistir logs
```

### Implementación

#### A. Persistir logs en DB (`backend/src/index.ts`)

```typescript
// Cambiar endpoint /api/v1/logs para persistir
app.post('/api/v1/logs', async (req, res) => {
    const { event, trace_id, build_id, env, url, path, ...ctx } = req.body;

    // Persistir en system_logs
    await supabase.from('system_logs').insert({
        category: 'telemetry',
        event_type: event,
        severity: 'info',
        payload: { trace_id, build_id, env, url, path, ...ctx }
    });

    res.status(200).json({ success: true });
});
```

#### B. Endpoint para leer logs (`logsController.ts`)

```typescript
// GET /api/v1/admin/telemetry
export const getTelemetryLogs = async (req: Request, res: Response) => {
    const { category, severity, limit = 100, offset = 0, from, to } = req.query;

    let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);
    if (severity) query = query.eq('severity', severity);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, count, error } = await query;

    res.json({ success: true, logs: data, total: count });
};
```

#### C. Página Frontend (`AdminTelemetry.tsx`)

```typescript
export default function AdminTelemetry() {
    const [logs, setLogs] = useState([]);
    const [filters, setFilters] = useState({ category: '', severity: '' });

    useEffect(() => {
        fetchLogs();
    }, [filters]);

    return (
        <Screen id="AdminTelemetry">
            <Layout>
                {/* Filtros */}
                <div className="flex gap-4 mb-4">
                    <select onChange={e => setFilters({...filters, category: e.target.value})}>
                        <option value="">Todas las categorías</option>
                        <option value="telemetry">Telemetry</option>
                        <option value="webhook">Webhook</option>
                        <option value="fraud">Fraud</option>
                    </select>
                    <select onChange={e => setFilters({...filters, severity: e.target.value})}>
                        <option value="">Todas</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>

                {/* Tabla de logs */}
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Category</th>
                            <th>Event</th>
                            <th>Severity</th>
                            <th>Trace ID</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td>{formatDate(log.created_at)}</td>
                                <td>{log.category}</td>
                                <td>{log.event_type}</td>
                                <td><SeverityBadge level={log.severity} /></td>
                                <td className="font-mono">{log.payload?.trace_id?.slice(0,8)}</td>
                                <td><ExpandableJSON data={log.payload} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Layout>
        </Screen>
    );
}
```

#### D. Agregar ruta (`routes.ts` + `App.tsx`)

```typescript
// routes.ts
adminTelemetry: '/admin/telemetry',

// App.tsx
<Route path={ROUTES.adminTelemetry} element={
    <ProtectedRoute requireSuperAdmin>
        <AdminTelemetry />
    </ProtectedRoute>
} />
```

### Resultado esperado
- Página `/admin/telemetry` con tabla de logs filtrable
- Filtros por categoría, severidad, fecha
- Drill-down en payload JSON
- TraceId clickeable para ver sesión completa

---

## 4. DOCUMENTACIÓN FORMAL MD

### Objetivo
Crear documentación oficial de SWIS Watch para onboarding y referencia.

### Archivos a crear

```
docs/SWIS_WATCH.md           # NUEVO - Spec completa
docs/SWIS_CHECKLIST.md       # NUEVO - Checklist para PRs
docs/SWIS_COMMERCIAL.md      # NUEVO - Narrativa comercial
```

### Implementación

#### A. SWIS_WATCH.md (Spec Técnica)

```markdown
# SWIS Watch v1.0 - Especificación Técnica

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
```

#### B. SWIS_CHECKLIST.md (Para PRs)

```markdown
# SWIS Watch - Checklist para PRs

## Antes de crear PR

- [ ] ¿Agregaste `data-testid` a elementos nuevos interactivos?
- [ ] ¿Registraste los testIds en `uiMap.ts`?
- [ ] ¿Tu nueva página tiene `<Screen id="...">`?
- [ ] ¿Usaste `ROUTES.*` en lugar de strings hardcodeados?
- [ ] ¿Usaste `to.*()` para rutas dinámicas?

## Antes de merge

- [ ] `npm run lint` pasa
- [ ] `node scripts/validate-uimap.js` pasa
- [ ] Tests E2E pasan (`npx playwright test`)

## Si modificaste rutas

- [ ] ¿Actualizaste `routes.ts`?
- [ ] ¿El `routeManifest.json` se regeneró?
- [ ] ¿Actualizaste tests E2E si aplica?

## Si agregaste errores

- [ ] ¿Usaste código `E_*` de `ERROR_CODES`?
- [ ] ¿O agregaste uno nuevo al enum?
```

#### C. SWIS_COMMERCIAL.md (Narrativa de Venta)

```markdown
# SWIS Watch - Propuesta de Valor

## El Problema

Los sistemas tradicionales son "opacos":
- Los bugs no tienen contexto
- Los tests fallan sin saber por qué
- La IA adivina dónde están los elementos
- Los updates rompen cosas silenciosamente

## La Solución

SWIS Watch convierte tu frontend en un **sistema auto-descriptivo**.

> "Nuestro sistema es auditable y verificable por diseño,
> incluso por agentes de IA."

## Diferenciadores

| Competencia dice | SWIS Watch dice |
|------------------|-----------------|
| "Tenemos tests" | "Nuestros tests se auto-generan de contratos" |
| "Tenemos logs" | "Cada log tiene traceId, screenId, buildId" |
| "Tenemos monitoreo" | "El sistema se verifica solo en CI" |

## Para Quién

- **Fintech** - Compliance y auditoría
- **Healthtech** - Trazabilidad regulatoria
- **E-commerce** - SEO y debugging rápido
- **Cannabis/Pharma** - Cadena de custodia

## ROI

- Bugs sin versión: 0
- Tiempo de debug: Horas → Minutos
- Rutas rotas en prod: ~0
- Onboarding de devs: 50% más rápido
```

### Resultado esperado
- Documentación clara para nuevos desarrolladores
- Checklist accionable para PRs
- Material de venta para clientes enterprise

---

## Orden de Implementación Recomendado

1. **Documentación MD** (0.5 día) - Base para todo lo demás
2. **Tests E2E autenticados** (1-2 días) - Mayor impacto en calidad
3. **Dashboard de telemetría** (1 día) - Visibilidad operativa
4. **Sitemap.xml** (1 día) - SEO cuando esté estable

## Dependencias

- Sitemap requiere: COAs públicos en producción
- Tests E2E requieren: Usuarios de prueba en DB
- Dashboard requiere: Persistencia de logs activa
- Docs: Sin dependencias

---

## Archivos Críticos Existentes

| Archivo | Para consultar |
|---------|----------------|
| `frontend/src/routes.ts` | Estructura de rutas |
| `frontend/vite.config.ts` | Patrón de plugin (routeManifest) |
| `e2e/*.spec.ts` | Estructura de tests existentes |
| `playwright.config.ts` | Config actual de Playwright |
| `backend/src/services/loggerService.ts` | Sistema de logging |
| `backend/migrations/022_system_audit_logs.sql` | Schema de logs |
| `frontend/src/contexts/AuthContext.tsx` | Flujo de autenticación |
