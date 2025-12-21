
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC_PLACEHOLDER';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'AUTH_TOKEN_PLACEHOLDER';
const fromPhone = process.env.TWILIO_FROM_PHONE || '+525500000000';
const toPhone = process.env.TWILIO_TO_PHONE || '+523300000000';

console.log('Testing Twilio Voice Call...');

const client = twilio(accountSid, authToken);

async function testVoice() {
    try {
        // TwiML to say the code
        const code = '1 2 3 4 5 6';
        const twiml = `<Response>
            <Pause length="1"/>
            <Say language="es-MX">Hola. Tu código de verificación es. ${code}. Repito. Tu código es. ${code}.</Say>
        </Response>`;

        const call = await client.calls.create({
            twiml,
            to: toPhone,
            from: fromPhone
        });

        console.log('✅ Voice call initiated!');
        console.log('Call SID:', call.sid);
    } catch (error: any) {
        console.error('❌ Error testing voice call:', error.message);
    }
}

testVoice();
