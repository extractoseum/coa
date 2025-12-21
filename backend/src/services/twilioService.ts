/**
 * Twilio Service - SMS Integration
 * 
 * Handles sending SMS verification codes via Twilio.
 */

import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const client = (ACCOUNT_SID && AUTH_TOKEN) ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

/**
 * Check if Twilio is configured
 */
export const isTwilioConfigured = (): boolean => {
    return !!(ACCOUNT_SID && AUTH_TOKEN && PHONE_NUMBER);
};

/**
 * Send SMS
 * @param to Phone number (E.164 format, e.g., +521...)
 * @param body Message body
 */
export const sendSMS = async (to: string, body: string): Promise<{ success: boolean; error?: string; messageId?: string }> => {
    if (!client || !PHONE_NUMBER) {
        console.error('Twilio not configured');
        return { success: false, error: 'Servicio de SMS no configurado' };
    }

    try {
        const message = await client.messages.create({
            body,
            from: PHONE_NUMBER,
            to
        });

        console.log(`SMS sent to ${to}: ${message.sid}`);
        return { success: true, messageId: message.sid };
    } catch (error: any) {
        console.error('Twilio send error:', error);
        return { success: false, error: error.message || 'Error enviando SMS' };
    }
};

/**
 * Make Voice Call (OTP)
 * @param to Phone number
 * @param code OTP Code
 */
export const makeVoiceCall = async (to: string, code: string): Promise<{ success: boolean; error?: string; callId?: string }> => {
    if (!client || !PHONE_NUMBER) {
        return { success: false, error: 'Twilio no configurado' };
    }

    try {
        // Space out digits for clarity
        const spacedCode = code.split('').join(' ');

        const twiml = `<Response>
            <Pause length="1"/>
            <Say language="es-MX">Hola. Tu código de verificación es. ${spacedCode}. Repito. Tu código es. ${spacedCode}.</Say>
        </Response>`;

        const call = await client.calls.create({
            twiml,
            to,
            from: PHONE_NUMBER
        });

        console.log(`Voice call initiated to ${to}: ${call.sid}`);
        return { success: true, callId: call.sid };
    } catch (error: any) {
        console.error('Twilio voice error:', error);
        return { success: false, error: error.message || 'Error iniciando llamada' };
    }
};
