# WhatsApp Integration Debug Log

## Fecha: 2025-12-17

---

## RUTAS IMPORTANTES

### Local (Mac)
```
/Users/bdelatorre8/COA Viewer 2.0/backend/
├── src/
│   ├── services/whapiService.ts      <- Servicio WhatsApp
│   ├── controllers/pushController.ts <- Controlador que usa whapiService
│   └── routes/pushRoutes.ts          <- Ruta /whatsapp/status
└── dist/                              <- Build compilado
```

### VPS (148.230.88.203)
```
/var/www/coa-viewer/backend/
├── dist/
│   ├── services/whapiService.js      <- DEBE EXISTIR
│   ├── controllers/pushController.js
│   └── config/supabase.js
├── node_modules/
├── package.json
└── .env                              <- WHAPI_TOKEN debe estar aquí
```

---

## PROBLEMA ACTUAL

**Síntoma**: El panel muestra "Notificacion enviada + WhatsApp en cola" pero el mensaje NO llega al teléfono.

**Lo que funciona**:
- ✅ WhatsApp status muestra "Conectado" en el panel
- ✅ Curl directo a Whapi API funciona (mensaje llega)
- ✅ Backend arranca sin errores MODULE_NOT_FOUND

**Lo que NO funciona**:
- ❌ Mensajes enviados desde el panel no llegan
- ❌ Los logs no muestran "[Whapi] Sending to..." después de "Queueing WhatsApp"

---

## ERRORES RESUELTOS

### 1. MODULE_NOT_FOUND (RESUELTO)
- **Causa**: Carpetas anidadas corruptas en dist/ (services/services/, services/config/)
- **Solución**: `rm -rf dist && npm run build` + deploy limpio
- **Fecha**: 2025-12-17 02:39

### 2. WhatsApp status "Desconectado" (RESUELTO)
- **Causa**: Endpoint /settings no retorna status
- **Solución**: Cambiar a /health endpoint
- **Archivo**: whapiService.ts línea 99
- **Fecha**: 2025-12-17

### 3. Formato de teléfono incorrecto (RESUELTO)
- **Causa**: Whapi requiere 521XXXXXXXXXX (13 dígitos) para México
- **Solución**: normalizePhone() agrega 521 a números de 10 dígitos
- **Archivo**: whapiService.ts líneas 52-74

---

## PENDIENTE DE INVESTIGAR

1. ¿Por qué sendBulkWhatsApp() no ejecuta después de "Queueing"?
2. ¿El WHAPI_TOKEN está correctamente configurado en el .env del VPS?
3. ¿Hay algún error silencioso en la promesa async?

---

## COMANDOS ÚTILES

### Verificar estructura VPS
```bash
ssh root@148.230.88.203
ls -la /var/www/coa-viewer/backend/dist/services/
cat /var/www/coa-viewer/backend/.env | grep WHAPI
```

### Ver logs en tiempo real
```bash
pm2 logs coa-backend --lines 100
```

### Test directo a Whapi (funciona)
```bash
curl -X POST "https://gate.whapi.cloud/messages/text" \
  -H "Authorization: Bearer lBp06kXfjrHd7X5m..." \
  -H "Content-Type: application/json" \
  -d '{"to":"5213327177432","body":"Test"}'
```

### Rebuild y deploy completo
```bash
# Local
cd "/Users/bdelatorre8/COA Viewer 2.0/backend"
rm -rf dist && npm run build

# VPS
ssh root@148.230.88.203
pm2 stop coa-backend
rm -rf /var/www/coa-viewer/backend/dist/*
# (scp files)
pm2 start dist/index.js --name coa-backend
```

---

## PRÓXIMOS PASOS

1. Verificar que WHAPI_TOKEN está en .env del VPS
2. Agregar logs más detallados en sendBulkWhatsApp()
3. Cambiar de fire-and-forget a await para capturar errores
