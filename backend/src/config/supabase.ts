import { createClient } from '@supabase/supabase-js';
import { config } from './env';

if (!config.supabase.url || !config.supabase.serviceKey) {
    console.warn('⚠️ Supabase credentials missing in .env');
}

export const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceKey
);
