import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '');
    try {
        // Note: The SDK doesn't have a direct listModels, we use the raw fetch if needed or we use a common method
        // But we can try to get a model and count tokens or just check a known one.
        // Actually, listing models is part of the REST API.

        console.log('--- Listing All Gemini Models via REST ---');
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data: any = await response.json();

        if (data.models) {
            data.models.forEach((m: any) => {
                console.log(`- ${m.name} (${m.displayName})`);
                console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
            });
        } else {
            console.log('No models found or error:', data);
        }
    } catch (err) {
        console.error('Error listing models:', err);
    }
}

listModels();
