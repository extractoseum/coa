
import { handleSearchProducts } from '../src/services/VapiToolHandlers';

async function testLocalSearch() {
    console.log('--- TESTING SEARCH_PRODUCTS LOCALLY ---');

    // Mock Context
    const mockContext = { clientId: 'test-client', customerPhone: '1234567890' };

    // Test 1: "gomitas"
    console.log('\nTest 1: query="gomitas"');
    const res1 = await handleSearchProducts({ query: 'gomitas' }, mockContext);
    console.log(JSON.stringify(res1, null, 2));

    // Test 2: "Flash Vapes" (Variant)
    console.log('\nTest 2: query="Flash Vapes"');
    const res2 = await handleSearchProducts({ query: 'Flash Vapes' }, mockContext);
    console.log(JSON.stringify(res2, null, 2));

    // Test 3: "materias primas" (Broad)
    console.log('\nTest 3: query="materias primas"');
    const res3 = await handleSearchProducts({ query: 'materias primas' }, mockContext);
    console.log(JSON.stringify(res3, null, 2));
}

testLocalSearch();
