
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    console.log('Using Key:', key ? key.substring(0, 10) + '...' : 'NONE');

    if (!key) return;

    const genAI = new GoogleGenerativeAI(key);
    // Access the model directly if listModels is not easily available on the high level client in this version
    // Actually, checking docs or types... 
    // In newer SDKs, it might be different. Let's try to just instantiate a model and run it.

    try {
        console.log('Testing gemini-1.5-flash...');
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello");
        console.log('Success gemini-1.5-flash:', result.response.text());
    } catch (e: any) {
        console.error('Error gemini-1.5-flash:', e.message);
    }

    try {
        console.log('Testing gemini-pro...');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello");
        console.log('Success gemini-pro:', result.response.text());
    } catch (e: any) {
        console.error('Error gemini-pro:', e.message);
    }
}

listModels();
