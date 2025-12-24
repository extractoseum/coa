import { ChannelRouter } from '../src/services/channelRouter';

async function testRouter() {
    console.log('--- TESTING CHANNEL ROUTER NORMALIZATION ---');
    const router = ChannelRouter.getInstance();

    // We can't easily mock supabase here without more boilerplate, 
    // but the console logs in ChannelRouter will show the normalization.

    const testNumbers = [
        '+5215519253043',
        '5215519253043',
        '5519253043'
    ];

    for (const num of testNumbers) {
        try {
            // This will try to hit Supabase but we just want to see the "Normalizing WA identifier" log
            await router.resolveChip('WA', num);
        } catch (e) {
            // Expected to fail if Supabase is not configured or reachable in this env
            // but the log happens before the query
        }
    }
}

testRouter();
