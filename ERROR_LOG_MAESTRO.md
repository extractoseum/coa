# ERROR LOG MAESTRO - COA Viewer 2.0

Este documento contiene todos los errores resueltos y las soluciones correctas para no repetirlos.

**Última actualización**: 17 dic 2025 - Todos los errores resueltos ✅

---

## ERROR #1: Inputs/Cards blancos en Dark/Tokyo mode

### Fecha: 17 diciembre 2025
### Estado: ✅ RESUELTO

### Problema
Los inputs y cards en PushNotificationPanel.tsx se veían BLANCOS en temas dark/tokyo, a pesar de que light mode funcionaba correctamente.

### Causa Raíz
Tailwind CSS v4 tiene un reset base que establece `background-color: transparent` (#0000) en todos los inputs. Las clases de Tailwind como `bg-gray-800` existen en el CSS compilado, pero el reset las sobreescribe.

### Intentos Fallidos (NO REPETIR)

| # | Intento | Por qué falló |
|---|---------|---------------|
| 1 | CSS !important con variables | Tailwind v4 procesa después y sobreescribe |
| 2 | CSS attribute selectors `[style]` | `inherit` no funciona con inline styles de React |
| 3 | @layer utilities en index.css | Tailwind v4 lo ignora, no aparece en CSS compilado |
| 4 | Clases Tailwind (bg-gray-800) | El reset base de Tailwind sobreescribe |
| 5 | CSS override con :where() | No tiene suficiente especificidad |

### Solución Correcta ✅

**Usar inline styles en JSX con los valores del theme context:**

```jsx
import { useTheme } from '../contexts/ThemeContext';

function MiComponente() {
    const { theme } = useTheme();

    return (
        <input
            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
            style={{
                backgroundColor: theme.cardBg2,
                color: theme.text,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: theme.border
            }}
        />
    );
}
```

### Por qué funciona
- Los inline styles tienen la **máxima especificidad CSS** (1000)
- Ningún reset de Tailwind puede sobreescribirlos
- Los valores del theme context cambian dinámicamente según el tema seleccionado

### Valores del Theme Context

```javascript
// Dark mode
{
    cardBg: '#111827',
    cardBg2: '#1f2937',
    text: '#ffffff',
    border: '#374151'
}

// Tokyo mode
{
    cardBg: '#1a1a2e',
    cardBg2: '#16213e',
    text: '#ffffff',
    border: '#4a4a8a'
}

// Light mode
{
    cardBg: '#ffffff',
    cardBg2: '#f9fafb',
    text: '#111827',
    border: '#d1d5db'
}
```

### Archivos Modificados
- `/frontend/src/pages/PushNotificationPanel.tsx`
  - L155: input en TagAutocomplete
  - L357: input en CustomerSearch
  - L851: input de título
  - L865: textarea de mensaje
  - L881: input de imagen URL
  - L946: select de audiencia
  - L1007: select de nivel
  - L1027: input datetime-local

---

## ERROR #2: Deploy no llega a producción

### Fecha: 17 diciembre 2025
### Estado: ✅ RESUELTO

### Problema
Los cambios se hacían en local pero no aparecían en coa.extractoseum.com

### Causa Raíz
1. Solo se hacía `npm run build` pero no se desplegaba al VPS
2. Se intentaba usar `scp dist/*` pero el glob no funciona en scp

### Solución Correcta ✅

```bash
# 1. Build
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"
npm run build

# 2. Deploy archivos principales (sin glob)
expect -c '
spawn scp -o StrictHostKeyChecking=no -r /Users/bdelatorre8/COA\ Viewer\ 2.0/frontend/dist/index.html /Users/bdelatorre8/COA\ Viewer\ 2.0/frontend/dist/vite.svg /Users/bdelatorre8/COA\ Viewer\ 2.0/frontend/dist/OneSignalSDKWorker.js root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

# 3. Deploy carpeta assets
expect -c '
spawn scp -o StrictHostKeyChecking=no -r "/Users/bdelatorre8/COA Viewer 2.0/frontend/dist/assets" root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
```

### Destino correcto en VPS
```
/var/www/coa-viewer/     <- Aquí van los archivos
├── index.html
├── vite.svg
├── OneSignalSDKWorker.js
└── assets/
    ├── index-*.js
    └── index-*.css
```

**NO usar**: `/var/www/coa-viewer/frontend/dist/` (incorrecto)

---

## Checklist de Deploy Frontend

- [ ] Hacer cambios en `/frontend/src/`
- [ ] `npm run build` en `/frontend/`
- [ ] Verificar que `/frontend/dist/` tiene los archivos nuevos
- [ ] Deploy archivos principales al VPS
- [ ] Deploy carpeta assets al VPS
- [ ] Hard refresh (Cmd+Shift+R) en el navegador
- [ ] Verificar cambios en https://coa.extractoseum.com

---

## Reglas de Oro

1. **Tailwind v4 + Temas**: Siempre usar inline styles con theme context para colores dinámicos
2. **Deploy**: Siempre desplegar al VPS después del build, no olvidar los assets
3. **Rutas**: Usar rutas absolutas desde `/Users/bdelatorre8/COA Viewer 2.0/`
4. **VPS**: El nginx root es `/var/www/coa-viewer/` directamente (sin /frontend/dist/)
5. **Cache**: Hacer hard refresh después de deploy para ver cambios
