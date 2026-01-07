import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAppUsage() {
    console.log('--- APK / Mobile App Usage Report ---');
    
    // 1. Check push_tokens for platforms (INDICATOR OF INSTALLS + PERMISSIONS)
    const { data: pushTokens, error: pushError } = await supabase
        .from('push_tokens')
        .select('platform, created_at');

    if (pushError) {
        console.error('Error fetching push_tokens:', pushError.message);
    } else {
        const platformCounts = pushTokens.reduce((acc: any, t) => {
            acc[t.platform] = (acc[t.platform] || 0) + 1;
            return acc;
        }, {});
        console.log('\n📱 Push Tokens by Platform (OneSignal/Mobile):');
        console.table(platformCounts);
    }

    // 2. Check coa_scans (INDICATOR OF APP USAGE)
    const { data: scans, error: scansError } = await supabase
        .from('coa_scans')
        .select('os, device_type, access_type, scanned_at');

    if (scansError) {
        console.error('Error fetching scans:', scansError.message);
    } else {
        const appScans = scans.filter(s => s.access_type === 'app' || s.device_type === 'android_app');
        const androidScans = scans.filter(s => s.os === 'Android');
        const iosScans = scans.filter(s => s.os === 'iOS');
        
        console.log(`\n🔍 Scans Analysis:`);
        console.log(`- Scans from App (Access type 'app'): ${appScans.length}`);
        console.log(`- Scans from Android: ${androidScans.length}`);
        console.log(`- Scans from iOS: ${iosScans.length}`);
        console.log(`- Total Scans Analyzed: ${scans.length}`);
    }

    // 3. Check system_logs for intent (INDICATOR OF DOWNLOAD INTEREST)
    const { data: logs, error: logError } = await supabase
        .from('system_logs')
        .select('*')
        .eq('event_type', 'app_download_click');

    if (logError) {
        console.error('Error fetching system_logs:', logError.message);
    } else {
        console.log(`\n📥 APK Download Clicks (app_download_click): ${logs?.length || 0}`);
        if (logs && logs.length > 0) {
            const byOS = logs.reduce((acc: any, l) => {
                const os = l.payload?.os || 'unknown';
                acc[os] = (acc[os] || 0) + 1;
                return acc;
            }, {});
            console.table(byOS);
        }
    }

    // 4. Check Profiles (INDICATOR OF RECOGNIZED APP USERS)
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('metadata')
        .not('metadata', 'is', null);

    if (!profileError && profiles) {
        const appUsers = profiles.filter(p => p.metadata?.last_platform === 'android' || p.metadata?.app_version);
        console.log(`\n👥 Profiles with app metadata: ${appUsers.length}`);
    }
}

checkAppUsage().catch(console.error);
