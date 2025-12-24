import dotenv from 'dotenv';
dotenv.config();

import { VoiceService } from '../src/services/VoiceService';

// Mock logger to avoid clutter
const logger = {
    info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ''),
    warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ''),
    error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : ''),
};

async function main() {
    console.log('--- STARTING OUTBOUND AUDIO ROLE REPRODUCTION ---');

    console.log('1. Instantiating VoiceService...');
    const vs = new VoiceService();

    // Mock transcribe to avoid OpenAI Audio costs and isolate Analysis logic
    vs.transcribe = async (buffer: Buffer, mime: string) => {
        console.log('   [Mock] Skipping Whisper API. Returning mock transcript.');
        return {
            transcript: "Hola, ¿qué tal? Habla Ara de Extractos EUM. Solo quería confirmarte que ya tenemos tu pedido listo para enviarse mañana. Avísame si necesitas algo más.",
            confidence: 0.99,
            language: "es"
        };
    };

    // Make sure we are connected to DB? processVoiceMessage needs DB to fetch client context
    // For this test, likely we won't have a real client ID that matches easily unless we mock that too.
    // However, the critical part is analyzeTranscript.

    // Let's call processVoiceMessage with role 'assistant'
    const mockAudioBuffer = Buffer.from('mock_audio_data');

    try {
        console.log('2. Calling processVoiceMessage with role="assistant"...');
        const result = await vs.processVoiceMessage(
            mockAudioBuffer,
            'audio/ogg',
            undefined, // no client id
            undefined, // no conversation id
            undefined, // no message id
            'mock_url',
            'assistant' // <--- CRITICAL TEST
        );

        console.log('\n--- RESULT ---');
        console.log('Intent:', result.intent);
        console.log('Summary:', result.summary);
        console.log('Emotion:', result.emotionFusionPrimary);
        console.log('Predicted Action:', result.predictedAction);

        console.log('\nDoes the summary look like an Agent Audit? (e.g. "El agente informó...")');
        console.log('Actual Summary:', result.summary);

    } catch (error) {
        console.error('Error running reproduction:', error);
    }
}

main();
