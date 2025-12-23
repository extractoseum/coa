import { ElevenLabsService } from '../services/ElevenLabsService';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('[ElevenLabs] Starting Verification Scan...');

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error('❌ CRITICAL: ELEVENLABS_API_KEY is missing in .env');
        process.exit(1);
    }
    console.log('✅ API Key detected');

    const service = new ElevenLabsService({ apiKey });

    // Test parameters
    const voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Kina (Cute happy girl)
    const text = 'Soy Ara, la reina del sistema. Sistemas de comunicación activados y listos.';
    const emotion = 'happy'; // Should trigger stability: 0.4, style: 0.5

    console.log(`[ElevenLabs] Generating audio for voice "${voiceId}" with emotion "${emotion}"...`);

    try {
        const settings = service.mapEmotionToSettings(emotion);
        console.log('[ElevenLabs] Computed Settings:', settings);

        const startTime = Date.now();
        const buffer = await service.generateAudio(text, voiceId, settings);
        const duration = Date.now() - startTime;

        console.log(`✅ Audio generated in ${duration}ms! Size: ${buffer.length} bytes`);

        const outputPath = path.join(__dirname, 'test_output_elevenlabs.mp3');
        fs.writeFileSync(outputPath, buffer);
        console.log(`💾 Saved to: ${outputPath}`);

    } catch (error: any) {
        console.error('❌ Generation Failed:', error.message);
        process.exit(1);
    }
}

main();
