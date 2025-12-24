
import dotenv from 'dotenv';
import path from 'path';
import { VoiceService } from '../src/services/VoiceService';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    console.log('--- Testing Audio Directionality & Context ---');

    const vs = new VoiceService();

    // MOCK AUDIO (We can't easily mock the buffer->openai-whisper part without a real file or heavy mocking)
    // So we will MOCK the `transcribe` method to skip Whisper and test the PROMPT logic directly.

    // Monkey-patch transcribe to return text
    vs.transcribe = async () => ({
        transcript: "Hola, estoy haciendo una prueba para ver si el sistema entiende quien soy.",
        confidence: 0.99,
        language: 'es'
    });

    console.log('\nCase 1: Simulating CLIENT (User) Audio...');
    const clientResult = await vs.processVoiceMessage(
        Buffer.from('mock'), 'audio/ogg', undefined, undefined, undefined, undefined,
        'user'
    );
    console.log('Role: User | Emotion:', clientResult.emotionFusionPrimary);

    // Monkey-patch transcribe for Agent
    vs.transcribe = async () => ({
        transcript: "Claro señor, le confirmo que el pedido ya salió y le llega mañana a las 3 de la tarde.",
        confidence: 0.99,
        language: 'es'
    });

    console.log('\nCase 2: Simulating AGENT (Assistant) Audio...');
    const agentResult = await vs.processVoiceMessage(
        Buffer.from('mock'), 'audio/ogg', undefined, undefined, undefined, undefined,
        'assistant'
    );
    console.log('Role: Assistant | Emotion:', agentResult.emotionFusionPrimary);
    console.log('Summary:', agentResult.summary);

    if (agentResult.emotionFusionPrimary.toLowerCase().includes('profesional') ||
        agentResult.emotionFusionPrimary.toLowerCase().includes('amable') ||
        agentResult.emotionFusionPrimary.toLowerCase().includes('directo')) {
        console.log('✅ Success: Agent prompt was used (Expected professional/amable/etc).');
    } else {
        console.warn('⚠️ Warning: Check if Agent prompt was actually used. Emotion:', agentResult.emotionFusionPrimary);
    }
}

run();
