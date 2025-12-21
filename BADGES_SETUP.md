# Configuración del Sistema de Badges

El sistema de badges requiere dos componentes en Supabase:
1. **Tablas de base de datos** (`badges` y `coa_badges`)
2. **Bucket de almacenamiento** para las imágenes

## Paso 1: Crear las Tablas en Supabase

### Opción A: Usando SQL Editor (Recomendado)

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor** en el menú lateral
3. Haz clic en **New Query**
4. Copia y pega el contenido del archivo `backend/supabase-badges-schema.sql`
5. Haz clic en **Run** (o presiona Cmd+Enter / Ctrl+Enter)

### Opción B: Usando la línea de comandos

```bash
# Asegúrate de tener el Supabase CLI instalado
# npm install -g supabase

# Ejecuta el script SQL
supabase db push backend/supabase-badges-schema.sql
```

## Paso 2: Crear el Bucket de Storage

### Opción A: Usando el script automático

```bash
cd backend
node setup-badges-storage.js
```

### Opción B: Manualmente en Supabase Dashboard

1. Ve a **Storage** en el menú lateral
2. Haz clic en **New bucket**
3. Configura:
   - **Name**: `badges`
   - **Public bucket**: ✅ ON (activado)
   - **File size limit**: `5 MB`
   - **Allowed MIME types**: `image/png`, `image/svg+xml`, `image/jpeg`
4. Haz clic en **Create bucket**

## Verificación

Para verificar que todo está configurado correctamente:

```bash
cd backend
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check tables
  const { data: badges } = await supabase.from('badges').select('*').limit(1);
  const { data: coaBadges } = await supabase.from('coa_badges').select('*').limit(1);

  // Check bucket
  const { data: buckets } = await supabase.storage.listBuckets();
  const hasBadgesBucket = buckets.some(b => b.name === 'badges');

  console.log('✅ Badges table:', badges !== null ? 'OK' : 'MISSING');
  console.log('✅ COA Badges table:', coaBadges !== null ? 'OK' : 'MISSING');
  console.log('✅ Badges bucket:', hasBadgesBucket ? 'OK' : 'MISSING');
})();
"
```

## Estructura de las Tablas

### Tabla `badges`
- `id` (UUID) - Primary key
- `name` (VARCHAR) - Nombre del badge
- `description` (TEXT) - Descripción opcional
- `image_url` (TEXT) - URL de la imagen en storage
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### Tabla `coa_badges`
- `id` (UUID) - Primary key
- `coa_id` (UUID) - Foreign key a `coas.id`
- `badge_id` (UUID) - Foreign key a `badges.id`
- `assigned_at` (TIMESTAMPTZ)
- Constraint único en (`coa_id`, `badge_id`)

## Políticas de Seguridad (RLS)

Las tablas tienen Row Level Security habilitado con las siguientes políticas:

- **Lectura pública**: Cualquiera puede leer badges y asignaciones
- **Escritura service_role**: Solo el backend (con service_role key) puede crear/modificar/eliminar

## Uso del Sistema de Badges

Una vez configurado, podrás:

1. **Crear badges** desde el panel de administración
2. **Asignar badges** a COAs específicos
3. **Visualizar badges** en los certificados públicos

## Solución de Problemas

### Error: "Could not find the table 'public.badges'"
→ Ejecuta el script SQL del Paso 1

### Error: "Could not find bucket 'badges'"
→ Crea el bucket según el Paso 2

### Error: "permission denied for table badges"
→ Verifica que estés usando la `SUPABASE_SERVICE_ROLE_KEY` correcta en tu `.env`

### Error al subir imagen
→ Verifica que el bucket sea público y los tipos MIME estén configurados correctamente
