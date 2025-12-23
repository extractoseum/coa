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
    model_id?: 'eleven_flash_v2_5' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5';
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
     * Generates audio from text using ElevenLabs API (Basic V1)
     */
    async generateAudio(
        text: string,
        voiceId: string,
        settings?: VoiceSettings
    ): Promise<Buffer> {
        // Fallback to advanced with default model
        return this.generateAudioAdvanced(text, voiceId, {
            model_id: 'eleven_multilingual_v2',
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

        try {
            const response = await axios.post(
                `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
                {
                    text,
                    model_id: modelId,
                    voice_settings: {
                        stability: options.voice_settings?.stability ?? 0.5,
                        similarity_boost: options.voice_settings?.similarity_boost ?? 0.75,
                        style: options.voice_settings?.style ?? 0.0,
                        use_speaker_boost: options.voice_settings?.use_speaker_boost ?? true,
                        speed: options.voice_settings?.speed ?? 1.0
                    },
                    language_code: options.language_code || undefined // Only for Turbo v2.5 if needed, but 'eleven_multilingual_v2' auto-detects well
                },
                {
                    headers: {
                        'xi-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg'
                    },
                    responseType: 'arraybuffer'
                }
            );

            return Buffer.from(response.data);

        } catch (error: any) {
            console.error('[ElevenLabs] Generation failed:', error?.response?.data || error.message);
            throw new Error(`ElevenLabs generation failed: ${error.message}`);
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
