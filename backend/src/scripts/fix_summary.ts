
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { supabase } from '../config/supabase';

async function fixSummary() {
    const handle = 'bdelatorre8@gmail.com';
    const bullets = [
        'Cliente VIP con historial de compras validado.',
        'Total gastado: $2,590.00 en 6 pedidos.',
        'Socio activo del Club EUM.',
        'Alto interés en nuevos lanzamientos.'
    ];

    const { error } = await supabase
        .from('crm_contact_snapshots')
        .update({
            summary_bullets: bullets,
            last_updated_at: new Date().toISOString()
        })
        .eq('handle', handle);

    if (error) console.error('Error updating summary:', error.message);
    else console.log('Summary updated successfully.');
}

fixSummary();
