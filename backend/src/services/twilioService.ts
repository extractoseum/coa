/**
 * Twilio Service - Multi-Account SMS & Voice Integration
 *
 * Supports separate accounts for Voice (MX) and SMS (US) with emergency backup.
 *
 * Account Priority:
 * 1. TWILIO_SMS_* - Primary SMS (Bernardo Paid, US number with SMS capability)
 * 2. TWILIO_* - Primary Voice (Extractos EUM, MX number, voice only)
 * 3. TWILIO_BACKUP_* - Emergency backup (EUM MX Trial, use only if others fail)
 */

import twilio from 'twilio';

// Voice account (Extractos EUM - MX number, voice only)
const VOICE_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const VOICE_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const VOICE_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// SMS account (Bernardo Paid - US number with SMS)
const SMS_ACCOUNT_SID = process.env.TWILIO_SMS_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const SMS_AUTH_TOKEN = process.env.TWILIO_SMS_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const SMS_PHONE_NUMBER = process.env.TWILIO_SMS_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

// Emergency backup account (EUM MX Trial)
const BACKUP_ACCOUNT_SID = process.env.TWILIO_BACKUP_ACCOUNT_SID;
const BACKUP_AUTH_TOKEN = process.env.TWILIO_BACKUP_AUTH_TOKEN;
const BACKUP_PHONE_NUMBER = process.env.TWILIO_BACKUP_PHONE_NUMBER;

// Initialize clients
const voiceClient = (VOICE_ACCOUNT_SID && VOICE_AUTH_TOKEN) ? twilio(VOICE_ACCOUNT_SID, VOICE_AUTH_TOKEN) : null;
const smsClient = (SMS_ACCOUNT_SID && SMS_AUTH_TOKEN) ? twilio(SMS_ACCOUNT_SID, SMS_AUTH_TOKEN) : null;
const backupClient = (BACKUP_ACCOUNT_SID && BACKUP_AUTH_TOKEN) ? twilio(BACKUP_ACCOUNT_SID, BACKUP_AUTH_TOKEN) : null;

// Log configuration on load
console.log(`[Twilio] Voice configured: ${!!voiceClient} (${VOICE_PHONE_NUMBER || 'no number'})`);
console.log(`[Twilio] SMS configured: ${!!smsClient} (${SMS_PHONE_NUMBER || 'no number'})`);
console.log(`[Twilio] Backup configured: ${!!backupClient} (${BACKUP_PHONE_NUMBER || 'no number'})`);

/**
 * Check if Twilio SMS is configured
 */
export const isTwilioConfigured = (): boolean => {
    return !!(smsClient && SMS_PHONE_NUMBER);
};

/**
 * Check if Twilio Voice is configured
 */
export const isTwilioVoiceConfigured = (): boolean => {
    return !!(voiceClient && VOICE_PHONE_NUMBER);
};

/**
 * Send SMS using primary SMS account, with backup fallback
 * @param to Phone number (E.164 format, e.g., +521...)
 * @param body Message body
 */
export const sendSMS = async (to: string, body: string): Promise<{ success: boolean; error?: string; messageId?: string; account?: string }> => {
    // Try primary SMS account first
    if (smsClient && SMS_PHONE_NUMBER) {
        try {
            console.log(`[Twilio] Sending SMS via primary account to ${to}`);
            const message = await smsClient.messages.create({
                body,
                from: SMS_PHONE_NUMBER,
                to
            });
            console.log(`[Twilio] SMS sent successfully: ${message.sid}`);
            return { success: true, messageId: message.sid, account: 'primary' };
        } catch (error: any) {
            console.error(`[Twilio] Primary SMS failed:`, error.message);
            // Fall through to backup
        }
    }

    // Try backup account
    if (backupClient && BACKUP_PHONE_NUMBER) {
        try {
            console.log(`[Twilio] Trying backup account for SMS to ${to}`);
            const message = await backupClient.messages.create({
                body,
                from: BACKUP_PHONE_NUMBER,
                to
            });
            console.log(`[Twilio] SMS sent via backup: ${message.sid}`);
            return { success: true, messageId: message.sid, account: 'backup' };
        } catch (error: any) {
            console.error(`[Twilio] Backup SMS also failed:`, error.message);
            return { success: false, error: `All SMS accounts failed: ${error.message}` };
        }
    }

    console.error('[Twilio] No SMS accounts configured');
    return { success: false, error: 'Servicio de SMS no configurado' };
};

/**
 * Make Voice Call (OTP) - Uses voice account
 * @param to Phone number
 * @param code OTP Code
 */
export const makeVoiceCall = async (to: string, code: string): Promise<{ success: boolean; error?: string; callId?: string }> => {
    if (!voiceClient || !VOICE_PHONE_NUMBER) {
        return { success: false, error: 'Twilio voice no configurado' };
    }

    try {
        // Space out digits for clarity
        const spacedCode = code.split('').join(' ');

        const twiml = `<Response>
            <Pause length="1"/>
            <Say language="es-MX">Hola. Tu código de verificación es. ${spacedCode}. Repito. Tu código es. ${spacedCode}.</Say>
        </Response>`;

        const call = await voiceClient.calls.create({
            twiml,
            to,
            from: VOICE_PHONE_NUMBER
        });

        console.log(`[Twilio] Voice call initiated to ${to}: ${call.sid}`);
        return { success: true, callId: call.sid };
    } catch (error: any) {
        console.error('[Twilio] Voice call error:', error.message);
        return { success: false, error: error.message || 'Error iniciando llamada' };
    }
};

/**
 * Get Twilio service status
 */
export const getTwilioStatus = () => ({
    voice: {
        configured: !!voiceClient,
        phone: VOICE_PHONE_NUMBER || null
    },
    sms: {
        configured: !!smsClient,
        phone: SMS_PHONE_NUMBER || null
    },
    backup: {
        configured: !!backupClient,
        phone: BACKUP_PHONE_NUMBER || null
    }
});
