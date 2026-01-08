/**
 * Generate Oracle Predictions
 *
 * Manually trigger prediction generation for testing
 *
 * Run with: npx ts-node src/scripts/generate_predictions.ts
 */

import { generateRestockPredictions } from '../services/oracleService';

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('       GENERATING ORACLE PREDICTIONS');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        const result = await generateRestockPredictions();
        console.log('\n✅ Result:', JSON.stringify(result, null, 2));
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');
}

main();
