
import { getContactInfo } from '../src/services/whapiService';

async function test() {
    console.log('--- WHAPI CONNECTIVITY TEST ---');
    const numbers = [
        '13038159669', // USA Canonical (11 digits)
        '3038159669',  // USA Local (10 digits)
        '5213038159669',// Incorrect MX
        '523038159669' // Incorrect MX
    ];

    for (const num of numbers) {
        try {
            console.log(`Testing: ${num}`);
            const info = await getContactInfo(num);
            console.log(`Result for ${num}:`, info);
        } catch (e) {
            console.error(`Error for ${num}:`, (e as any).message);
        }
    }
}
test();
