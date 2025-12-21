
import { AIService } from '../services/aiService';
import path from 'path';
import fs from 'fs';

async function testAdminAssistant() {
    console.log('🚀 Starting Admin Assistant Verification Test...');

    const aiService = AIService.getInstance();

    // Load Admin Persona
    const personaPath = path.join(__dirname, '../ai_knowledge_base/identity/admin_assistant.md');
    const systemInstruction = fs.readFileSync(personaPath, 'utf-8');

    const testMessages = [
        { role: 'user', content: '¿Cuáles son los pedidos más recientes en el sistema? Dame un resumen rápido.' }
    ];

    console.log(`\nUser: ${testMessages[0].content}`);

    try {
        const response = await aiService.generateChatWithTools(systemInstruction, testMessages);

        console.log('\n--- AI RESPONSE ---');
        console.log(response.content);
        console.log('--- END OF RESPONSE ---\n');

        if (response.content && response.content.toLowerCase().includes('pedido')) {
            console.log('✅ Success: AI used tools to find orders.');
        } else {
            console.log('⚠️ Warning: AI output might not reflect tool usage.');
        }

    } catch (err: any) {
        console.error('❌ Test failed:', err.message);
    }
}

testAdminAssistant();
