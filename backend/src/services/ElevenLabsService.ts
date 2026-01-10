import axios from 'axios';

interface ElevenLabsConfig {
    apiKey?: string;
}

export interface VoiceSettings {
    stability?: number;        // 0.0 - 1.0 (default: 0.5)
    similarity_boost?: number; // 0.0 - 1.0 (default: 0.75)
    style?: number;            // 0.0 - 1.0 (default: 0.0)
    use_speaker_boost?: boolean; // default: true
    speed?: number;            // 0.25 - 4.0 (default: 1.0)
}

export interface ElevenLabsTTSOptions {
    model_id?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_v3';
    output_format?: string;
    voice_settings?: VoiceSettings;
    language_code?: string;
    optimize_streaming_latency?: 0 | 1 | 2 | 3 | 4;
}

export class ElevenLabsService {
    private apiKey: string;
    private baseUrl = 'https://api.elevenlabs.io/v1';

    constructor(config?: ElevenLabsConfig) {
        this.apiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY || '';
        if (!this.apiKey) {
            console.warn('[ElevenLabs] No API Key found. Service will fail if called.');
        }
    }

    /**
     * Detects if text contains ElevenLabs v3 audio tags like [warmly], [pause], etc.
     */
    private hasAudioTags(text: string): boolean {
        // Common v3 audio tag patterns
        const tagPattern = /\[(whispers|sighs|excited|sad|angry|happily|warmly|curious|pause|short pause|long pause|laughs|chuckles|softly|loudly|slowly|quickly|thoughtful|reassuring|encouraging|friendly|professional)\]/i;
        return tagPattern.test(text);
    }

    /**
     * Generates audio from text using ElevenLabs API (Basic V1)
     * Auto-detects v3 audio tags and uses appropriate model
     */
    async generateAudio(
        text: string,
        voiceId: string,
        settings?: VoiceSettings
    ): Promise<Buffer> {
        // Auto-detect v3 tags and use eleven_v3 model if found
        const modelId = this.hasAudioTags(text) ? 'eleven_v3' : 'eleven_multilingual_v2';

        if (this.hasAudioTags(text)) {
            console.log('[ElevenLabs] Detected v3 audio tags, using eleven_v3 model');
        }

        return this.generateAudioAdvanced(text, voiceId, {
            model_id: modelId,
            voice_settings: settings
        });
    }

    /**
     * Advanced Audio Generation using explicit options (Phase 1 from Integration Plan)
     */
    async generateAudioAdvanced(
        text: string,
        voiceId: string,
        options: ElevenLabsTTSOptions
    ): Promise<Buffer> {
        if (!this.apiKey) throw new Error('Missing ELEVENLABS_API_KEY');

        // Defaults based on Phase 1 Plan
        const modelId = options.model_id || 'eleven_multilingual_v2';
        const outputFormat = options.output_format || 'mp3_44100_128';

        // eleven_v3 model has different parameters - it doesn't use traditional voice_settings
        const isV3Model = modelId === 'eleven_v3';

        try {
            // Build request body based on model type
            const requestBody: any = {
                text,
                model_id: modelId,
            };

            // v3 model uses different voice settings structure
            if (isV3Model) {
                // eleven_v3 primarily uses the text tags for expression, minimal voice settings
                requestBody.voice_settings = {
                    stability: 0.5,
                    similarity_boost: 0.75,
                };
                console.log(`[ElevenLabs] Using eleven_v3 model with audio tags`);
            } else {
                // Standard models (multilingual_v2, turbo, flash)
                requestBody.voice_settings = {
                    stability: options.voice_settings?.stability ?? 0.5,
                    similarity_boost: options.voice_settings?.similarity_boost ?? 0.75,
                    style: options.voice_settings?.style ?? 0.0,
                    use_speaker_boost: options.voice_settings?.use_speaker_boost ?? true,
                    speed: options.voice_settings?.speed ?? 1.0
                };
                if (options.language_code) {
                    requestBody.language_code = options.language_code;
                }
            }

            // Determine Accept header based on output format
            const acceptHeader = outputFormat.startsWith('ulaw') ? 'audio/basic' :
                                 outputFormat.startsWith('pcm') ? 'audio/pcm' : 'audio/mpeg';

            const response = await axios.post(
                `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
                requestBody,
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        'Accept': acceptHeader
                    },
                    responseType: 'arraybuffer'
                }
            );

            return Buffer.from(response.data);

        } catch (error: any) {
            // Log the actual error response for debugging
            const errorData = error?.response?.data;
            let errorMessage = error.message;

            if (errorData) {
                // Try to decode arraybuffer error response
                if (Buffer.isBuffer(errorData)) {
                    try {
                        const decoded = errorData.toString('utf-8');
                        console.error('[ElevenLabs] Error response:', decoded);
                        errorMessage = decoded;
                    } catch (e) {
                        console.error('[ElevenLabs] Raw error data:', errorData);
                    }
                } else if (typeof errorData === 'object') {
                    console.error('[ElevenLabs] Error response:', errorData);
                    errorMessage = JSON.stringify(errorData);
                } else {
                    console.error('[ElevenLabs] Error response:', errorData);
                    errorMessage = String(errorData);
                }
            }

            console.error(`[ElevenLabs] Generation failed for model ${modelId}:`, errorMessage);
            throw new Error(`ElevenLabs generation failed: ${errorMessage}`);
        }
    }

    /**
     * Maps abstract emotions to ElevenLabs "Style" parameters
     * @param emotionPrimary - 'happy', 'serious', 'urgent', etc.
     */
    mapEmotionToSettings(emotionPrimary: string): VoiceSettings {
        switch (emotionPrimary?.toLowerCase()) {
            case 'frustrado':
            case 'urgente':
            case 'enojado':
                // High stability (clear), some style
                return { stability: 0.6, style: 0.3, speed: 1.1 };

            case 'satisfecho':
            case 'happy':
            case 'entusiasmado':
                // Lower stability (more variation), high style
                return { stability: 0.4, style: 0.5, speed: 1.0 };

            case 'preocupado':
            case 'ansioso':
                // Slight style boost
                return { stability: 0.5, style: 0.2, speed: 1.0 };

            default: // Neutral/Serious
                return { stability: 0.5, style: 0.0, speed: 1.0 };
        }
    }
}
