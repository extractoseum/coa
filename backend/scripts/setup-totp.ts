
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { supabase } from '../src/config/supabase';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// authenticator is already an instance in modern otplib

async function main() {
    const email = 'badlt@extractoseum.com'; // Hardcoded for safety or accept args
    console.log(`\n🔐 Setting up Passwordless TOTP for: ${email}\n`);

    // 1. Check if user exists
    const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('email', email)
        .single();

    if (error || !client) {
        console.error('❌ Error: User not found.', error?.message);
        process.exit(1);
    }

    // 2. Generate Secret
    const secret = authenticator.generateSecret();
    const serviceName = 'EUM Viewer Admin';
    const otpauth = authenticator.keyuri(email, serviceName, secret);

    // 3. Generate QR Code
    console.log('📷 Scan this QR Code with Google Authenticator:\n');
    await qrcode.toString(otpauth, { type: 'terminal', small: true }, (err, url) => {
        if (err) throw err;
        console.log(url);
    });

    console.log(`\n🔑 Secret (Manual Entry): ${secret}\n`);

    // 4. Confirm before saving
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('⚠️  Type "YES" to confirm removing password and enabling 2FA: ', async (answer) => {
        if (answer.trim() !== 'YES') {
            console.log('❌ Aborted. No changes made.');
            process.exit(0);
        }

        // 5. Update DB
        const { error: updateError } = await supabase
            .from('clients')
            .update({
                mfa_secret: secret,
                mfa_enabled: true,
                password_hash: null, // REMOVING PASSWORD
                updated_at: new Date().toISOString()
            })
            .eq('id', client.id);

        if (updateError) {
            console.error('❌ Database update failed:', updateError.message);
            // Hint about migration
            if (updateError.message.includes('Could not find the function') || updateError.message.includes('column')) {
                console.log('\n💡 Tip: Did you run the SQL migration to add mfa_secret column?');
                console.log(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS mfa_secret text;`);
                console.log(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS mfa_enabled boolean DEFAULT false;`);
            }
        } else {
            console.log('\n✅ SUCCESS! Password removed. Use Google Authenticator to login.');
        }

        rl.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
