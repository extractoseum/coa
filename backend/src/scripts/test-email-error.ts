
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testEmail() {
    console.log('Testing email to badlt@extractoseum.com...');
    try {
        const { sendDataEmail } = await import('../services/emailService');
        const result = await sendDataEmail(
            'badlt@extractoseum.com',
            'Test Subject',
            '<p>Test Body</p>'
        );
        console.log('Result:', JSON.stringify(result, null, 2));

        if (!result.success && String(result.error).includes('550')) {
            console.log('✅ Captured 550 Error correctly.');
        } else if (!result.success) {
            console.log('❌ Failed but error string might not match checks:', result.error);
        } else {
            console.log('❓ Unexpected success?');
        }

    } catch (e: any) {
        console.error('CRASHED:', e);
    }
}

testEmail();
