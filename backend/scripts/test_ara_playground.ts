
import dotenv from 'dotenv';
import { AIService, AIProvider } from '../src/services/aiService';

// Cargar variables de entorno
dotenv.config();

const runPlayground = async () => {
    console.log('\n🧠 --- ARA AI PLAYGROUND (SANDBOX) --- 🧠');
    console.log('Este script prueba tus llaves y compara los modelos activos.\n');

    const aiService = AIService.getInstance();

    // 1. Mensaje de prueba (Simulación de un cliente enojado)
    const testMessage = "Llevo esperando mi pedido 3 semanas y nadie me contesta. Quiero mi dinero de vuelta o los denuncio con Profeco.";

    // 2. Contexto de prueba (Lo que el sistema sabría del cliente)
    const testContext = JSON.stringify({
        user_tier: "VIP_PLATINUM",
        last_order_date: "2024-11-01",
        total_spent: 50000
    });

    console.log(`📝 Mensaje del Cliente: "${testMessage}"`);
    console.log(`Contexto: Cliente VIP (Gasto alto)\n`);

    // 3. Probar Modelos Disponibles
    const providers: AIProvider[] = ['openai', 'anthropic', 'gemini'];

    for (const provider of providers) {
        console.log(`\n--- Probando proveedor: ${provider.toUpperCase()} ---`);
        try {
            // Intentar clasificar
            const startTime = Date.now();
            // classify now takes (context, text, provider)
            const result = await aiService.classify(testContext, testMessage, provider);
            const duration = Date.now() - startTime;

            console.log(`✅ ÉXITO (${duration}ms)`);
            console.log(JSON.stringify(result, null, 2));
        } catch (error: any) {
            console.log(`❌ FALLÓ o NO CONFIGURADO: ${error.message}`);
            if (error.message.includes('Key missing')) {
                console.log(`   (Falta agregar ${provider.toUpperCase()}_API_KEY en .env)`);
            }
        }
    }

    console.log('\n--- FIN DEL TEST ---');
};

runPlayground();
