
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load backend env for URL
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Load frontend env for ANON KEY
const frontendEnv = fs.readFileSync(path.join(__dirname, '../../../frontend/.env'), 'utf8');
const anonKeyMatch = frontendEnv.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
const anonKey = anonKeyMatch ? anonKeyMatch[1] : '';

console.log('Connecting to Supabase Realtime via ANON KEY...');
const supabase = createClient(process.env.SUPABASE_URL!, anonKey);

const channel = supabase
    .channel('test_realtime_verification')
    .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'crm_messages'
        },
        (payload) => {
            console.log('✅ EVENT RECEIVED!', payload);
        }
    )
    .subscribe((status) => {
        console.log('Subscription Status:', status);
        if (status === 'SUBSCRIBED') {
            console.log('Listening for new messages... (Please trigger a message now)');
        }
    });

// Keep process alive
setInterval(() => { }, 1000);
