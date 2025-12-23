# Analisis de Extraccion KCA Labs - Oportunidades Perdidas

**Fecha:** 2025-12-23
**COA Analizado:** https://coa.extractoseum.com/coa/9ef391f4
**Objetivo:** Identificar datos disponibles en COAs de KCA Labs que NO se estan extrayendo

---

## Resumen del Sistema Actual

### Archivo Principal: [coaExtractor.ts](../backend/src/services/coaExtractor.ts)

El extractor actual tiene dos modos:
1. **Modo Estandar/KCA** - Para PDFs de laboratorios como KCA Labs
2. **Modo Chromatogram** - Para PDFs de cromatogramas (ppm)

### Datos que SI se Extraen:

| Campo | Status | Metodo |
|-------|--------|--------|
| `lab_name` | SI | `extractLabName()` - Detecta "KCA Laboratories" |
| `analysis_date` | SI | `extractDate()` - Regex para fechas |
| `batch_id` | SI | `extractBatch()` - Multiples patterns |
| `cannabinoids[]` | SI | `extractCannabinoids()` - Tabla principal |
| `heavy_metals_status` | SI | `checkHeavyMetalsTested()` |
| `pesticides_status` | SI | `checkPesticidesTested()` |
| `residual_solvents_status` | SI | `checkResidualSolventsTested()` |
| `foreign_matter_status` | SI | `checkForeignMatter()` |
| `thc_compliance_flag` | SI | `calculateTHCAlert()` |
| `compliance_status` | SI | Derivado de THC |

---

## OPORTUNIDADES PERDIDAS - Datos NO Extraidos

### 1. TERPENOS (Alta Prioridad)

**Disponible en KCA:** SI - Seccion "Terpenes by GC-FID"
**Se extrae:** NO

KCA Labs incluye perfil completo de terpenos:
- Myrcene, Limonene, Linalool, Caryophyllene, Pinene, etc.
- Valores en % y mg/g

**Impacto:** Los usuarios NO ven el perfil de terpenos que define el aroma/efecto del producto.

**Fix Propuesto:**
```typescript
// Agregar a ExtractedData interface:
terpenes: Terpene[];

interface Terpene {
    name: string;
    result_pct: string;
    result_mg_g?: string;
    detected: boolean;
}

// Agregar metodo extractTerpenes():
private extractTerpenes(text: string): Terpene[] {
    // Buscar seccion "Terpenes by GC-FID" o "Terpene Profile"
    // Pattern similar a extractCannabinoids pero para terpenos
}
```

---

### 2. MOISTURE CONTENT (Media Prioridad)

**Disponible en KCA:** SI - "Moisture Content"
**Se extrae:** NO

KCA reporta:
- Moisture: X.XX%
- Water Activity: 0.XXX aw

**Impacto:** Importante para calidad del producto.

**Fix Propuesto:**
```typescript
moisture_content?: string;
water_activity?: string;

// Regex:
const moistureMatch = text.match(/Moisture[:\s]+(\d+\.\d+)\s*%/i);
const waterActivityMatch = text.match(/Water Activity[:\s]+(\d+\.\d+)\s*aw/i);
```

---

### 3. SAMPLE INFORMATION (Media Prioridad)

**Disponible en KCA:** SI - Header del COA
**Se extrae:** PARCIAL

KCA incluye:
- Sample ID: SA-XXXXX-XXXX
- Batch: (ya se extrae)
- Sample Type: Concentrate, Distillate, etc.
- Received Date: XX/XX/XXXX
- Completed Date: XX/XX/XXXX
- Client Name: XXXXXXX
- Matrix: Hemp, Cannabis, etc.

**No se extraen:**
- `sample_id` (diferente a batch_id)
- `sample_type`
- `received_date`
- `completed_date`
- `client_name` (del COA, no de tu sistema)
- `matrix`

**Fix Propuesto:**
```typescript
// Agregar a metadata:
metadata: {
    sample_id?: string;
    sample_type?: string;
    received_date?: string;
    completed_date?: string;
    client_name?: string;
    matrix?: string;
}

// Regexes:
const sampleIdMatch = text.match(/Sample ID[:\s]+(SA-[\d-]+)/i);
const sampleTypeMatch = text.match(/Sample Type[:\s]+([^\n]+)/i);
const matrixMatch = text.match(/Matrix[:\s]+([^\n]+)/i);
```

---

### 4. MYCOTOXINS (Media Prioridad)

**Disponible en KCA:** SI - "Mycotoxins by LC-MS/MS"
**Se extrae:** NO (solo status general)

KCA reporta analitos individuales:
- Aflatoxin B1, B2, G1, G2
- Ochratoxin A
- Total Aflatoxins

**Fix Propuesto:**
```typescript
mycotoxins_status?: 'pass' | 'fail' | 'not_tested';
mycotoxins_detail?: {
    analyte: string;
    result: string;
    limit: string;
    status: 'pass' | 'fail';
}[];
```

---

### 5. HEAVY METALS DETAIL (Baja Prioridad)

**Disponible en KCA:** SI - Valores individuales
**Se extrae:** Solo status (pass/fail)

KCA reporta:
- Arsenic: X.XXX ppb (Limit: XXX ppb)
- Cadmium: X.XXX ppb
- Lead: X.XXX ppb
- Mercury: X.XXX ppb

**Fix Propuesto:**
```typescript
heavy_metals_detail?: {
    metal: string;
    result: string;
    limit: string;
    unit: string;
}[];
```

---

### 6. PESTICIDES DETAIL (Baja Prioridad)

**Disponible en KCA:** SI - ~70 pesticidas individuales
**Se extrae:** Solo status (pass/fail)

KCA reporta lista completa de pesticidas con LOD/LOQ/Result.

**Fix Propuesto:**
```typescript
pesticides_detail?: {
    pesticide: string;
    result: string;
    lod: string;
    loq: string;
    limit: string;
}[];
```

---

### 7. RESIDUAL SOLVENTS DETAIL (Baja Prioridad)

**Disponible en KCA:** SI - Valores individuales
**Se extrae:** Solo status (pass/fail)

KCA reporta:
- Acetone, Benzene, Butane, Ethanol, etc.

---

### 8. MICROBIALS DETAIL (Baja Prioridad)

**Disponible en KCA:** SI - Valores individuales
**Se extrae:** NO

KCA reporta:
- Total Aerobic Count
- Total Yeast & Mold
- E. Coli
- Salmonella
- STEC (pathogenic E. coli)

---

### 9. QR CODE / VERIFICATION URL (Media Prioridad)

**Disponible en KCA:** SI - URL de verificacion
**Se extrae:** NO

KCA incluye URL como:
`https://portal.kcalabs.com/coa?id=XXXXXXX`

**Fix Propuesto:**
```typescript
original_verification_url?: string;

// Regex:
const urlMatch = text.match(/portal\.kcalabs\.com\/coa\?id=(\d+)/i);
```

---

### 10. ANALYST/REVIEWER SIGNATURES (Baja Prioridad)

**Disponible en KCA:** SI
**Se extrae:** NO

KCA incluye:
- Analyst Name
- Reviewer Name
- Signatures

---

## Matriz de Prioridad de Implementacion

| Oportunidad | Impacto Usuario | Esfuerzo | Prioridad |
|-------------|-----------------|----------|-----------|
| Terpenos | ALTO | Medio | P0 |
| Sample Info | Medio | Bajo | P1 |
| Moisture | Medio | Bajo | P1 |
| QR/URL Verificacion | Medio | Bajo | P1 |
| Mycotoxins | Medio | Medio | P2 |
| Heavy Metals Detail | Bajo | Medio | P3 |
| Pesticides Detail | Bajo | Alto | P3 |
| Solvents Detail | Bajo | Medio | P3 |
| Microbials Detail | Bajo | Medio | P3 |
| Signatures | Bajo | Bajo | P4 |

---

## Campos de Base de Datos a Agregar

```sql
-- Migracion propuesta: 047_coa_extended_data.sql

-- Terpenos como JSONB (como cannabinoids)
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS terpenes JSONB DEFAULT '[]'::jsonb;

-- Metadata extendida del sample
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS sample_id TEXT;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS sample_type TEXT;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS matrix TEXT;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS original_client_name TEXT;

-- Quality metrics
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS moisture_content DECIMAL(5,2);
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS water_activity DECIMAL(5,3);

-- Detail arrays
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS heavy_metals_detail JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS pesticides_detail JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS mycotoxins_detail JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS microbials_detail JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS solvents_detail JSONB DEFAULT '[]'::jsonb;

-- Original lab verification
ALTER TABLE public.coas ADD COLUMN IF NOT EXISTS original_verification_url TEXT;

-- Index para busquedas
CREATE INDEX IF NOT EXISTS idx_coas_sample_type ON public.coas(sample_type);
CREATE INDEX IF NOT EXISTS idx_coas_matrix ON public.coas(matrix);
```

---

## Impacto en Frontend

### Componentes a Actualizar:

1. **COAViewer.tsx** - Mostrar seccion de terpenos
2. **COACard.tsx** - Badge de perfil de terpenos
3. **COADetail.tsx** - Tabs para Heavy Metals, Pesticides, etc.

### Visualizacion de Terpenos Sugerida:

```
TERPENE PROFILE

Myrcene      ████████████████  45.2%
Limonene     ██████████        28.1%
Linalool     ████              12.3%
Caryophyllene ███               8.7%
Other        ██                 5.7%
```

---

## Siguiente Paso Recomendado

1. **P0: Implementar extraccion de Terpenos**
   - Modificar `coaExtractor.ts`
   - Agregar columna `terpenes` a DB
   - Actualizar frontend para mostrar

2. **P1: Sample Info + Moisture**
   - Quick wins con bajo esfuerzo
   - Mejora la informacion mostrada al usuario
