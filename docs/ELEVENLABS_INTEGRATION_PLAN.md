# ElevenLabs API Integration Plan

## Executive Summary

Documento completo de todas las opciones disponibles en ElevenLabs API para integración con el VoiceService del sistema. Incluye TTS (Text-to-Speech), STT (Speech-to-Text/Scribe), y configuraciones avanzadas.

---

## 1. Text-to-Speech (TTS) API

### 1.1 Endpoint Principal

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
```

### 1.2 Modelos Disponibles

| Model ID | Nombre | Latencia | Idiomas | Uso Recomendado | Costo |
|----------|--------|----------|---------|-----------------|-------|
| `eleven_flash_v2_5` | Flash v2.5 | ~75ms | 32 | Real-time, Agents | 0.5x |
| `eleven_multilingual_v2` | Multilingual v2 | ~200ms | 29 | Voiceovers, Audiobooks | 1x |
| `eleven_turbo_v2_5` | Turbo v2.5 | ~150ms | 32 | Balanced | 0.5x |
| `eleven_flash_v2` | Flash v2 | ~75ms | English only | Real-time English | 0.5x |
| `eleven_turbo_v2` | Turbo v2 | ~150ms | English only | Deprecated → use Flash | 0.5x |
| `eleven_v3` | Eleven v3 (Alpha) | Variable | Multi | Highest quality (no real-time) | 1x |

**Nota**: `eleven_monolingual_v1` y `eleven_multilingual_v1` están **deprecated**.

### 1.3 Formatos de Salida (`output_format`)

#### MP3 Formats
| Format | Sample Rate | Bitrate | Tier Requerido |
|--------|-------------|---------|----------------|
| `mp3_22050_32` | 22.05kHz | 32kbps | Free |
| `mp3_44100_32` | 44.1kHz | 32kbps | Free |
| `mp3_44100_64` | 44.1kHz | 64kbps | Free |
| `mp3_44100_96` | 44.1kHz | 96kbps | Free |
| `mp3_44100_128` | 44.1kHz | 128kbps | Free (Default) |
| `mp3_44100_192` | 44.1kHz | 192kbps | Creator+ |

#### PCM Formats (Raw Audio)
| Format | Sample Rate | Tier Requerido |
|--------|-------------|----------------|
| `pcm_8000` | 8kHz | Free |
| `pcm_16000` | 16kHz | Free |
| `pcm_22050` | 22.05kHz | Free |
| `pcm_24000` | 24kHz | Free |
| `pcm_44100` | 44.1kHz | Pro+ |

#### Opus Formats (WebRTC/Streaming)
| Format | Sample Rate | Bitrate |
|--------|-------------|---------|
| `opus_48000_32` | 48kHz | 32kbps |
| `opus_48000_64` | 48kHz | 64kbps |
| `opus_48000_96` | 48kHz | 96kbps |
| `opus_48000_128` | 48kHz | 128kbps |
| `opus_48000_192` | 48kHz | 192kbps |

#### Telephony Formats
| Format | Use Case |
|--------|----------|
| `ulaw_8000` | Twilio, VoIP (μ-law) |
| `alaw_8000` | European telephony (A-law) |

### 1.4 Voice Settings

```typescript
interface VoiceSettings {
    stability: number;        // 0.0 - 1.0 (default: 0.5)
    similarity_boost: number; // 0.0 - 1.0 (default: 0.75)
    style: number;            // 0.0 - 1.0 (default: 0.0)
    use_speaker_boost: boolean; // default: true
    speed: number;            // 0.25 - 4.0 (default: 1.0)
}
```

| Parámetro | Descripción | Efecto |
|-----------|-------------|--------|
| `stability` | Control de variación emocional | Bajo = más expresivo, Alto = más consistente |
| `similarity_boost` | Adherencia a la voz original | Alto = más parecido al original |
| `style` | Intensidad de estilo/exageración | Alto = más dramático |
| `use_speaker_boost` | Mejora de claridad del hablante | Recomendado: true |
| `speed` | Velocidad de habla | 0.5 = lento, 2.0 = rápido |

### 1.5 Parámetros Adicionales

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `language_code` | string | auto | ISO 639-1 (ej: "es", "en") - Solo Turbo v2.5 |
| `seed` | int | null | 0-4294967295 para reproducibilidad |
| `previous_text` | string | null | Contexto previo para continuidad |
| `next_text` | string | null | Contexto siguiente |
| `optimize_streaming_latency` | int | 0 | 0-4 (mayor = menor latencia, menor calidad) |
| `apply_text_normalization` | string | "auto" | "auto", "on", "off" |

### 1.6 Voces Recomendadas para Español

| Voice ID | Nombre | Género | Estilo | Uso |
|----------|--------|--------|--------|-----|
| `EXAVITQu4vr4xnSDxMaL` | Bella | F | Cálido | Customer Service |
| `pNInz6obpgDQGcFmaJgB` | Adam | M | Profesional | Announcements |
| `ThT5KcBeYPX3keUQqHPh` | Dorothy | F | Amigable | Conversational |
| `VR6AewLTigWG4xSOukaG` | Arnold | M | Autoritario | B2B |
| `yoZ06aMxZJJ28mfd3POQ` | Sam | M | Narrativo | Audiobooks |

**Nota**: Obtener lista completa via `GET /v1/voices`

---

## 2. Speech-to-Text (Scribe) API

### 2.1 Endpoint Principal

```
POST https://api.elevenlabs.io/v1/speech-to-text
```

### 2.2 Modelos STT

| Model ID | Nombre | Latencia | Idiomas | Uso |
|----------|--------|----------|---------|-----|
| `scribe_v1` | Scribe v1 | ~1-3s | 99 | Transcripción batch |
| `scribe_v1_experimental` | Scribe Experimental | ~1-3s | 99 | Features nuevos |
| `scribe_v2_realtime` | Scribe v2 Realtime | ~150ms | 90+ | Streaming en vivo |

### 2.3 Parámetros STT

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `model_id` | string | required | `scribe_v1` o `scribe_v1_experimental` |
| `file` | binary | - | Audio/Video (max 3GB) |
| `cloud_storage_url` | string | - | URL HTTPS alternativa (max 2GB) |
| `language_code` | string | auto | ISO 639-1/639-3 |
| `diarize` | boolean | false | Identificar hablantes |
| `num_speakers` | int | null | Max 32, auto si null |
| `diarization_threshold` | float | - | Sensibilidad de diarización |
| `timestamps_granularity` | string | "word" | "none", "word", "character" |
| `tag_audio_events` | boolean | true | Anotar "(risas)", "(pasos)" |
| `temperature` | float | - | 0.0-2.0 para control de output |
| `use_multi_channel` | boolean | false | Transcribir canales separados (max 5) |
| `additional_formats` | array | [] | ["srt", "pdf", "docx", "txt", "html", "json"] |

### 2.4 Realtime STT (WebSocket)

```
wss://api.elevenlabs.io/v1/speech-to-text/realtime
```

**Parámetros WebSocket:**
- `model_id`: ID del modelo
- `include_timestamps`: boolean para timestamps por palabra
- Audio: PCM 8kHz-48kHz o μ-law, **solo mono**

**Recomendación**: 16kHz sample rate para balance calidad/bandwidth.

---

## 3. Estado Actual de Integración

### 3.1 Archivos Existentes

| Archivo | Estado | Funcionalidad |
|---------|--------|---------------|
| [VoiceService.ts](backend/src/services/VoiceService.ts) | ✅ | Pipeline completo |
| [ElevenLabsService.ts](backend/src/services/ElevenLabsService.ts) | ⚠️ Básico | Solo TTS básico |
| [041_voice_profile_json.sql](backend/migrations/041_voice_profile_json.sql) | ✅ | Schema JSONB |

### 3.2 Lo que YA funciona

```typescript
// VoiceService.ts
- transcribe() → OpenAI Whisper
- analyzeTranscript() → LLM analysis
- generateAudioResponse() → Dual provider (OpenAI/ElevenLabs)
- mapEmotionToSettings() → Emoción → Voice Settings
```

### 3.3 Lo que FALTA integrar

| Feature | Prioridad | Complejidad |
|---------|-----------|-------------|
| Múltiples modelos ElevenLabs | Alta | Baja |
| Output formats configurables | Media | Baja |
| Speed control por emoción | Media | Baja |
| Scribe STT (reemplazar Whisper) | Alta | Media |
| Realtime WebSocket STT | Baja | Alta |
| Diarización (múltiples hablantes) | Baja | Media |
| Voice cloning | Baja | Media |

---

## 4. Plan de Integración Propuesto

### Fase 1: Mejorar ElevenLabsService.ts

```typescript
// Nuevas interfaces
interface ElevenLabsTTSOptions {
    model_id?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5';
    output_format?: string;
    voice_settings?: VoiceSettings;
    language_code?: string;
    optimize_streaming_latency?: 0 | 1 | 2 | 3 | 4;
}

interface ElevenLabsSTTOptions {
    model_id?: 'scribe_v1' | 'scribe_v1_experimental';
    language_code?: string;
    diarize?: boolean;
    timestamps_granularity?: 'none' | 'word' | 'character';
    tag_audio_events?: boolean;
}

// Nuevos métodos
class ElevenLabsService {
    // Existing
    generateAudio(text, voiceId, settings): Promise<Buffer>

    // New
    generateAudioAdvanced(text, voiceId, options: ElevenLabsTTSOptions): Promise<Buffer>
    transcribe(audioBuffer, options: ElevenLabsSTTOptions): Promise<TranscriptResult>
    listVoices(): Promise<Voice[]>
    getVoiceSettings(voiceId): Promise<VoiceSettings>
}
```

### Fase 2: Actualizar voice_profile Schema

```typescript
// Nuevo formato JSONB en crm_columns.voice_profile
interface VoiceProfileConfig {
    provider: 'openai' | 'elevenlabs';
    voice_id: string;
    model_id?: string;           // eleven_multilingual_v2
    output_format?: string;      // opus_48000_128
    settings: {
        stability: number;
        similarity_boost: number;
        style: number;
        use_speaker_boost: boolean;
        speed: number;
    };
    emotion_mapping?: {
        [emotion: string]: Partial<VoiceSettings>;
    };
}
```

### Fase 3: Smart Model Selection

```typescript
// En VoiceService
selectOptimalModel(context: {
    isRealtime: boolean;
    language: string;
    qualityPriority: 'speed' | 'balanced' | 'quality';
}): string {
    if (context.isRealtime) return 'eleven_flash_v2_5';
    if (context.qualityPriority === 'quality') return 'eleven_multilingual_v2';
    return 'eleven_turbo_v2_5';
}
```

---

## 5. Ejemplo de Configuración Completa

### Para CRM Column "Ventas"

```json
{
    "provider": "elevenlabs",
    "voice_id": "EXAVITQu4vr4xnSDxMaL",
    "model_id": "eleven_multilingual_v2",
    "output_format": "opus_48000_128",
    "settings": {
        "stability": 0.5,
        "similarity_boost": 0.75,
        "style": 0.0,
        "use_speaker_boost": true,
        "speed": 1.0
    },
    "emotion_mapping": {
        "frustrado": { "stability": 0.6, "style": 0.3, "speed": 0.9 },
        "satisfecho": { "stability": 0.4, "style": 0.5, "speed": 1.1 },
        "urgente": { "stability": 0.7, "style": 0.4, "speed": 1.2 }
    }
}
```

### Para CRM Column "Soporte Técnico"

```json
{
    "provider": "elevenlabs",
    "voice_id": "pNInz6obpgDQGcFmaJgB",
    "model_id": "eleven_flash_v2_5",
    "output_format": "mp3_44100_128",
    "settings": {
        "stability": 0.7,
        "similarity_boost": 0.8,
        "style": 0.0,
        "use_speaker_boost": true,
        "speed": 1.0
    }
}
```

---

## 6. Costos Estimados

| Operación | Modelo | Costo por 1000 chars |
|-----------|--------|---------------------|
| TTS | Flash/Turbo | ~$0.15 |
| TTS | Multilingual v2 | ~$0.30 |
| STT | Scribe v1 | ~$0.10/min |
| STT | Realtime v2 | ~$0.20/min |

**Comparación con OpenAI:**
- OpenAI TTS: ~$0.015/1000 chars (10x más barato)
- OpenAI Whisper: ~$0.006/min (15x más barato)

**Recomendación**: Usar ElevenLabs solo para voces premium/emocionales, OpenAI para volumen.

---

## 7. Referencias

- [ElevenLabs TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [ElevenLabs Models](https://help.elevenlabs.io/hc/en-us/articles/17883183930129-What-models-do-you-offer)
- [ElevenLabs STT/Scribe](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [Output Formats](https://elevenlabs.io/blog/pcm-output-format)
- [Voice Settings Guide](https://elevenlabs.io/docs/capabilities/text-to-speech)

---

*Documento creado: 2025-12-22*
*Para: COA Viewer 2.0 / Voice Pipeline Integration*
