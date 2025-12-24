
import { CRMService } from '../src/services/CRMService';
import { supabase } from '../src/config/supabase';

async function test() {
    try {
        const c = CRMService.getInstance();
        console.log('Fetching conversations...');
        const convs = await c.getConversations(['active'], false);

        const target = convs.find(x => x.contact_handle === '13038159669');
        console.log('--- TARGET CONTACT (13038159669) ---');
        console.log(target ? {
            id: target.id,
            name: target.contact_name,
            avatar: target.avatar_url,
            handle: target.contact_handle
        } : 'Not Found');

        console.log('\n--- SAMPLE OTHER CONTACT ---');
        if (convs[0]) {
            console.log({
                id: convs[0].id,
                handle: convs[0].contact_handle,
                avatar: convs[0].avatar_url
            });
        }
    } catch (e) {
        console.error(e);
    }
}
test();
