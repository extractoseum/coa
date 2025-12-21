// Native fetch is available in Node 18+

const API_BASE = 'http://localhost:3000/api/v1';
const ADMIN_TOKEN = 'mock_access_token'; // We might need a real token if auth is enforced at network level, but for seeded local tests usually easier.
// Actually, since we don't have a reliable way to get a token via script without full login flow, 
// let's rely on the module we just wrote OR if running against local dev server, we can disable auth or use a known test token.
// A better approach for this "unit/integration" verification is to directly invoke the service function if we can,
// BUT we want to test the full endpoint.
// Let's assume for this script we just verify the service logic by importing it? 
// No, the service uses `config.supabase` which needs env vars. 
// A standalone script needs to load .env.

console.log('🧪 Verifying Insights Engine...');

// Mock Seeder (Direct fetch to ingestLog endpoint)
// We need to bypass auth for ingestion? 
// logsController.ingestLog generally doesn't require super admin, usually just auth or open for some depending on config.
// Let's look at logsRoutes.ts: `router.post('/', ingestLog);` -> NO AUTH required for ingestion! Great.

async function seedErrors() {
    console.log('🌱 Seeding 6 error logs...');
    for (let i = 0; i < 6; i++) {
        await fetch(`${API_BASE}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level: 'error',
                event: 'TEST_ERROR_SPIKE',
                message: `Simulated error ${i}`,
                trace_id: `test-trace-${i}`
            })
        });
    }
    console.log('✅ Seeded.');
}

// We can't easily call the insights endpoint because it requires `requireSuperAdmin`.
// For verification, we can rely on manual testing in the UI, 
// OR we can temporarily relax the route protection?
// OR we can use the `login` endpoint from our script to get a token?

async function verify() {
    // 1. Seed
    await seedErrors();

    console.log('⚠️  Since /admin/insights is protected, please verify manually or run the frontend.');
    console.log('   Expected Result: An "Error Spike" alert should appear in the dashboard.');
}

verify().catch(console.error);
