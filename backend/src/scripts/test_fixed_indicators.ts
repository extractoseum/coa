/**
 * Test the fixed indicator merge
 */

import { CRMService } from '../services/CRMService';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const crm = CRMService.getInstance();
    const convs = await crm.getConversations();

    console.log('Total conversations:', convs.length);

    // Check first 5
    console.log('\n=== FIRST 5 CONVERSATIONS ===');
    convs.slice(0, 5).forEach((c: any) => {
        console.log('Handle:', c.contact_handle?.substring(0, 10));
        console.log('  hours_remaining:', c.hours_remaining);
        console.log('  window_status:', c.window_status);
        console.log('  health_score:', c.health_score);
        console.log('  is_vip:', c.is_vip, '| is_new:', c.is_new_customer);
        console.log('');
    });

    // Count how many have indicators
    const withIndicators = convs.filter((c: any) => c.hours_remaining !== undefined).length;
    console.log('Conversations with indicators:', withIndicators, '/', convs.length);
}

test().catch(console.error);
