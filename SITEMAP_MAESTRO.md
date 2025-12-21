# SITEMAP MAESTRO - COA Viewer 2.0 (Vector Search Optimized)

Este documento sirve como índice maestro y mapa de contexto para LLMs y búsquedas vectoriales. Describe la estructura del proyecto, la responsabilidad de cada archivo clave y dónde encontrar información crítica.

## 🔑 Credenciales y Accesos (IMPORTANTE)
**⚠️ NO COLOCAR CREDENCIALES AQUÍ. Ver archivo seguro:**
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Contiene IP del VPS, usuarios SSH, claves de Supabase y URLs de producción. Consultar ese archivo para accesos.

---

## 📂 Estructura del Proyecto y Descripciones

### 🎨 Frontend (`/frontend`)
Aplicación React + Vite + Tailwind CSS. Maneja la interfaz de usuario.

#### Configuración y Contexto (`/frontend/src`)
- **`App.tsx`**: Enrutador principal. Define todas las rutas (`/login`, `/dashboard`, `/coa/:token`, etc.). **Punto de entrada para entender el flujo de navegación.**
- **`main.tsx`**: Punto de entrada de React. Inicializa proveedores.
- **`index.css`**: Estilos globales y configuración de Tailwind v4.

#### Contextos (`/frontend/src/contexts`)
- **`AuthContext.tsx`**: Maneja el estado de autenticación (usuario, login, logout, tokens, permisos). Interactúa con el backend para sesiones.
- **`ThemeContext.tsx`**: Maneja el cambio de temas (Light, Dark, Tokyo). Provee colores dinámicos a toda la app.

#### Páginas Clave (`/frontend/src/pages`)
- **`Login.tsx`**: Pantalla de inicio de sesión. (Actualmente solo email/password). **TODO: Integrar botón Shopify.**
- **`COADetails.tsx`**: **Componente Crítico**. Muestra el certificado de análisis (COA) al usuario final. Renderiza laboratorio, resultados, QR, imágenes y badges.
- **`COAAdminPanel.tsx`**: Panel de administración para gestionar COAs (crear, editar, borrar).
- **`UploadCOA.tsx`**: Página para subir nuevos PDFs de COAs al sistema. Extrae texto automáticamente.
- **`HologramInventory.tsx`**: Gestión de inventario de hologramas físicos.
- **`PushNotificationPanel.tsx`**: Dashboard para enviar notificaciones push via OneSignal.
- **`BadgeManagement.tsx`**: Gestión de insignias (badges) para los certificados.

#### Servicios (`/frontend/src/services`)
- **`onesignalService.ts`**: Lógica de integración con OneSignal para Web Push.

### ⚙️ Backend (`/backend`)
API REST Node.js + Express + TypeScript. Maneja la lógica de negocio y base de datos.

#### Rutas (`/backend/src/routes`)
- **`authRoutes.ts`**: Endpoints de autenticación (`/login`, `/shopify`, `/refresh`).
- **`coaRoutes.ts`**: CRUD de COAs y endpoints públicos para visualizar certificados.
- **`uploadRoutes.ts`**: Maneja la subida de archivos (Multer) y procesamiento inicial.
- **`clientRoutes.ts`**: Gestión de clientes y sincronización con Shopify.

#### Controladores (`/backend/src/controllers`)
- **`authController.ts`**: Lógica de login, registro y OAuth con Shopify.
- **`coaController.ts`**: Lógica para obtener, crear y modificar COAs.
- **`coaEnrichmentController.ts`**: Maneja metadatos extra (imágenes producto, links compra).
- **`pushController.ts`**: Envío de notificaciones push.

#### Base de Datos (`/backend`)
- **`schema.sql`**: Esquema actual de la base de datos PostgreSQL en Supabase. **Referencia de verdad para tablas.**
- **`.env`**: Variables de entorno (Credenciales DB, Claves API). **NO COMPARTIR.**

---

## 🛠️ Deploy y Servidor (VPS)
- **Archivo de referencia**: `DEPLOYMENT.md`
- **Ubicación Frontend**: `/var/www/coa-viewer/` (Nginx root)
- **Ubicación Backend**: `/var/www/coa-viewer/backend/` (Node.js PM2)
- **Comandos clave**: `npm run build` (local), `scp` (subir archivos), `pm2 restart` (reiniciar backend).

---

## 📝 Logs y Errores
- **`ERROR_LOG_MAESTRO.md`**: Registro histórico de errores resueltos y lecciones aprendidas. Consultar antes de debugear problemas recurrentes.
- **`WHATSAPP_DEBUG_LOG.md`**: Logs específicos de la integración con WhatsApp.
- **`backend/debug_extraction.log`**: Logs detallados del proceso de extracción de texto de PDFs.
