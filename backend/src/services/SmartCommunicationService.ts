/**
 * SmartCommunicationService - Intelligent Multi-Channel Communication with Fallbacks
 *
 * This service provides:
 * 1. Multiple communication channels (WhatsApp, Email, SMS, Push)
 * 2. Automatic fallback when a channel fails
 * 3. Health monitoring for each channel
 * 4. Email as permanent backup for all communications
 * 5. Support for multiple WhatsApp accounts (backup tokens)
 *
 * Message Priority Chains:
 * - INSTANT: WhatsApp → SMS → Push (fast delivery required)
 * - INFORMATIONAL: WhatsApp → Email → Push (info delivery, email preferred)
 * - TRANSACTIONAL: Email + WhatsApp parallel (receipts, confirmations)
 * - CRITICAL: ALL channels parallel (fraud, security alerts)
 */

import { sendWhatsAppMessage, checkWhapiStatus } from './whapiService';
import { sendAraEmail } from './emailService';
import { sendSMS } from './twilioService';
import { sendNotification } from './onesignalService';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';
import axios from 'axios';

// Types
export type MessageType = 'instant' | 'informational' | 'transactional' | 'critical';
export type ChannelType = 'whatsapp' | 'email' | 'sms' | 'push';
export type ChannelStatus = 'healthy' | 'degraded' | 'down';

interface ChannelConfig {
    name: ChannelType;
    enabled: boolean;
    priority: number; // Lower = higher priority
    status: ChannelStatus;
    lastCheck: Date;
    failureCount: number;
    token?: string; // For WhatsApp backup tokens
}

interface SendMessageParams {
    to: string; // Phone number or email
    subject?: string; // For email
    body: string;
    type: MessageType;
    clientId?: string;
    conversationId?: string;
    metadata?: Record<string, any>;
}

interface SendResult {
    success: boolean;
    channelUsed: ChannelType | null;
    channelsAttempted: ChannelType[];
    channelResults: Record<ChannelType, { success: boolean; error?: string; messageId?: string }>;
    emailSent: boolean; // Email backup always attempted
    error?: string;
}

interface ChannelHealth {
    channel: ChannelType;
    status: ChannelStatus;
    lastCheck: Date;
    failureCount: number;
    lastError?: string;
}

// Channel registry with multiple WhatsApp backup tokens
const channelRegistry: Map<ChannelType, ChannelConfig[]> = new Map();

// Default WhatsApp tokens (primary + backups)
const WHATSAPP_TOKENS = [
    { token: process.env.WHAPI_TOKEN, name: 'primary' },
    { token: process.env.WHAPI_TOKEN_BACKUP_1, name: 'backup1' },
    { token: process.env.WHAPI_TOKEN_BACKUP_2, name: 'backup2' },
].filter(t => t.token && t.token.length > 10);

// Initialize channel registry
function initializeChannels(): void {
    // WhatsApp channels (multiple tokens for redundancy)
    const whatsappConfigs: ChannelConfig[] = WHATSAPP_TOKENS.map((t, idx) => ({
        name: 'whatsapp',
        enabled: true,
        priority: idx, // Primary has highest priority (0)
        status: 'healthy' as ChannelStatus,
        lastCheck: new Date(),
        failureCount: 0,
        token: t.token
    }));
    channelRegistry.set('whatsapp', whatsappConfigs.length > 0 ? whatsappConfigs : [{
        name: 'whatsapp',
        enabled: false,
        priority: 0,
        status: 'down',
        lastCheck: new Date(),
        failureCount: 0
    }]);

    // Email channel
    channelRegistry.set('email', [{
        name: 'email',
        enabled: true,
        priority: 0,
        status: 'healthy',
        lastCheck: new Date(),
        failureCount: 0
    }]);

    // SMS channel
    channelRegistry.set('sms', [{
        name: 'sms',
        enabled: !!process.env.TWILIO_ACCOUNT_SID,
        priority: 0,
        status: 'healthy',
        lastCheck: new Date(),
        failureCount: 0
    }]);

    // Push notification channel
    channelRegistry.set('push', [{
        name: 'push',
        enabled: !!process.env.ONESIGNAL_APP_ID,
        priority: 0,
        status: 'healthy',
        lastCheck: new Date(),
        failureCount: 0
    }]);
}

// Initialize on module load
initializeChannels();

/**
 * Get the fallback chain for a message type
 */
function getFallbackChain(type: MessageType): ChannelType[] {
    switch (type) {
        case 'instant':
            // Fast delivery: WhatsApp first, then SMS, then Push
            return ['whatsapp', 'sms', 'push'];

        case 'informational':
            // Info delivery: WhatsApp preferred, email as main backup
            return ['whatsapp', 'email', 'push'];

        case 'transactional':
            // Receipts/confirmations: Email + WhatsApp parallel (handled specially)
            return ['email', 'whatsapp'];

        case 'critical':
            // Security/fraud: ALL channels parallel (handled specially)
            return ['whatsapp', 'sms', 'push', 'email'];

        default:
            return ['whatsapp', 'email', 'push'];
    }
}

/**
 * Get a healthy WhatsApp config (with working token)
 */
function getHealthyWhatsAppConfig(): ChannelConfig | null {
    const configs = channelRegistry.get('whatsapp') || [];
    return configs.find(c => c.enabled && c.status !== 'down' && c.failureCount < 3) || null;
}

/**
 * Mark a channel as failed and update status
 */
function markChannelFailed(channel: ChannelType, tokenIndex: number = 0, error: string): void {
    const configs = channelRegistry.get(channel);
    if (configs && configs[tokenIndex]) {
        configs[tokenIndex].failureCount++;
        configs[tokenIndex].lastCheck = new Date();

        if (configs[tokenIndex].failureCount >= 3) {
            configs[tokenIndex].status = 'down';
        } else if (configs[tokenIndex].failureCount >= 1) {
            configs[tokenIndex].status = 'degraded';
        }

        console.log(`[SmartComm] Channel ${channel}[${tokenIndex}] marked as ${configs[tokenIndex].status} (failures: ${configs[tokenIndex].failureCount})`);
    }
}

/**
 * Mark a channel as healthy
 */
function markChannelHealthy(channel: ChannelType, tokenIndex: number = 0): void {
    const configs = channelRegistry.get(channel);
    if (configs && configs[tokenIndex]) {
        configs[tokenIndex].failureCount = 0;
        configs[tokenIndex].status = 'healthy';
        configs[tokenIndex].lastCheck = new Date();
    }
}

/**
 * Send via WhatsApp with token rotation
 */
async function sendViaWhatsApp(to: string, body: string): Promise<{ success: boolean; error?: string; messageId?: string; tokenIndex: number }> {
    const configs = channelRegistry.get('whatsapp') || [];

    for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        if (!config.enabled || config.status === 'down') continue;

        try {
            console.log(`[SmartComm] Trying WhatsApp token #${i} (${config.token?.substring(0, 5)}...)`);

            const result = await sendWhatsAppMessage({ to, body }, config.token);

            if (result.sent) {
                markChannelHealthy('whatsapp', i);
                return { success: true, messageId: result.message?.id, tokenIndex: i };
            } else {
                markChannelFailed('whatsapp', i, result.error || 'Unknown error');
                console.log(`[SmartComm] WhatsApp token #${i} failed: ${result.error}`);
            }
        } catch (error: any) {
            markChannelFailed('whatsapp', i, error.message);
            console.error(`[SmartComm] WhatsApp token #${i} exception:`, error.message);
        }
    }

    return { success: false, error: 'All WhatsApp tokens failed', tokenIndex: -1 };
}

/**
 * Send via Email (using Ara email service)
 */
async function sendViaEmail(to: string, subject: string, body: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
        // If 'to' is a phone number, we need to find the email from the client
        let email = to;
        if (!to.includes('@')) {
            // Try to find client email by phone
            const cleanPhone = to.replace(/\D/g, '').slice(-10);
            const { data: client } = await supabase
                .from('clients')
                .select('email')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (client?.email) {
                email = client.email;
            } else {
                return { success: false, error: 'No email found for this phone number' };
            }
        }

        const result = await sendAraEmail({
            to: email,
            subject: subject || 'Mensaje de Extractos EUM',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Extractos EUM</h1>
                    </div>
                    <div style="padding: 20px; background: #f9fafb;">
                        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
                            ${body.replace(/\n/g, '<br>')}
                        </p>
                    </div>
                    <div style="padding: 15px; background: #1f2937; text-align: center;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            Este mensaje fue enviado por Ara, tu asistente de Extractos EUM
                        </p>
                    </div>
                </div>
            `,
            text: body
        });

        markChannelHealthy('email');
        return { success: true, messageId: result?.messageId };
    } catch (error: any) {
        markChannelFailed('email', 0, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send via SMS (using Twilio)
 */
async function sendViaSMS(to: string, body: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
        const phone = normalizePhone(to, 'twilio');
        const result = await sendSMS(phone, body);

        if (result.success) {
            markChannelHealthy('sms');
            return { success: true, messageId: result.sid };
        } else {
            markChannelFailed('sms', 0, result.error || 'SMS failed');
            return { success: false, error: result.error };
        }
    } catch (error: any) {
        markChannelFailed('sms', 0, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send via Push Notification (using OneSignal)
 */
async function sendViaPush(clientId: string, body: string, subject?: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    if (!clientId) {
        return { success: false, error: 'No clientId for push notification' };
    }

    try {
        const result = await sendNotification({
            title: subject || 'Extractos EUM',
            message: body,
            targetType: 'individual',
            targetValue: clientId,
            data: { source: 'smart_comm' }
        });

        if (result.success) {
            markChannelHealthy('push');
            return { success: true, messageId: result.notificationId };
        } else {
            markChannelFailed('push', 0, result.error || 'Push failed');
            return { success: false, error: result.error };
        }
    } catch (error: any) {
        markChannelFailed('push', 0, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Log communication attempt to database
 */
async function logCommunication(params: {
    to: string;
    type: MessageType;
    channelsAttempted: ChannelType[];
    channelUsed: ChannelType | null;
    success: boolean;
    results: Record<ChannelType, { success: boolean; error?: string }>;
    clientId?: string;
    conversationId?: string;
}): Promise<void> {
    try {
        await supabase.from('communication_logs').insert({
            recipient: params.to,
            message_type: params.type,
            channels_attempted: params.channelsAttempted,
            channel_used: params.channelUsed,
            success: params.success,
            channel_results: params.results,
            client_id: params.clientId,
            conversation_id: params.conversationId,
            created_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('[SmartComm] Failed to log communication:', error);
    }
}

/**
 * Main function: Send a message with intelligent fallback
 */
export async function sendSmartMessage(params: SendMessageParams): Promise<SendResult> {
    const { to, subject, body, type, clientId, conversationId, metadata } = params;

    console.log(`[SmartComm] Sending ${type} message to ${to}`);

    const result: SendResult = {
        success: false,
        channelUsed: null,
        channelsAttempted: [],
        channelResults: {} as any,
        emailSent: false
    };

    const fallbackChain = getFallbackChain(type);

    // For CRITICAL and TRANSACTIONAL, send to all channels in parallel
    if (type === 'critical' || type === 'transactional') {
        const promises: Promise<void>[] = [];

        for (const channel of fallbackChain) {
            result.channelsAttempted.push(channel);

            const sendPromise = (async () => {
                let channelResult: { success: boolean; error?: string; messageId?: string };

                switch (channel) {
                    case 'whatsapp':
                        channelResult = await sendViaWhatsApp(to, body);
                        break;
                    case 'email':
                        channelResult = await sendViaEmail(to, subject || `Mensaje importante de Extractos EUM`, body);
                        if (channelResult.success) result.emailSent = true;
                        break;
                    case 'sms':
                        channelResult = await sendViaSMS(to, body);
                        break;
                    case 'push':
                        channelResult = await sendViaPush(clientId || '', body, subject);
                        break;
                    default:
                        channelResult = { success: false, error: 'Unknown channel' };
                }

                result.channelResults[channel] = channelResult;
                if (channelResult.success && !result.channelUsed) {
                    result.channelUsed = channel;
                    result.success = true;
                }
            })();

            promises.push(sendPromise);
        }

        await Promise.all(promises);

    } else {
        // For INSTANT and INFORMATIONAL, use fallback chain sequentially

        // Always send email in background for backup (unless it's in the chain)
        const emailInChain = fallbackChain.includes('email');
        if (!emailInChain) {
            // Fire and forget email backup
            sendViaEmail(to, subject || 'Información de Extractos EUM', body)
                .then(r => {
                    result.emailSent = r.success;
                    result.channelResults['email'] = r;
                })
                .catch(e => console.error('[SmartComm] Email backup failed:', e));
        }

        // Try channels in order until one succeeds
        for (const channel of fallbackChain) {
            result.channelsAttempted.push(channel);

            let channelResult: { success: boolean; error?: string; messageId?: string };

            switch (channel) {
                case 'whatsapp':
                    channelResult = await sendViaWhatsApp(to, body);
                    break;
                case 'email':
                    channelResult = await sendViaEmail(to, subject || 'Información de Extractos EUM', body);
                    if (channelResult.success) result.emailSent = true;
                    break;
                case 'sms':
                    channelResult = await sendViaSMS(to, body);
                    break;
                case 'push':
                    channelResult = await sendViaPush(clientId || '', body, subject);
                    break;
                default:
                    channelResult = { success: false, error: 'Unknown channel' };
            }

            result.channelResults[channel] = channelResult;

            if (channelResult.success) {
                result.channelUsed = channel;
                result.success = true;
                console.log(`[SmartComm] Message sent via ${channel}`);
                break; // Stop trying other channels
            } else {
                console.log(`[SmartComm] ${channel} failed: ${channelResult.error}, trying next...`);
            }
        }
    }

    // Log the communication attempt
    await logCommunication({
        to,
        type,
        channelsAttempted: result.channelsAttempted,
        channelUsed: result.channelUsed,
        success: result.success,
        results: result.channelResults,
        clientId,
        conversationId
    });

    if (!result.success) {
        result.error = `All channels failed: ${Object.entries(result.channelResults)
            .map(([ch, r]) => `${ch}: ${r.error}`)
            .join(', ')}`;
    }

    return result;
}

/**
 * Get health status of all channels
 */
export function getChannelHealth(): ChannelHealth[] {
    const health: ChannelHealth[] = [];

    for (const [channelType, configs] of channelRegistry) {
        for (let i = 0; i < configs.length; i++) {
            const config = configs[i];
            health.push({
                channel: channelType,
                status: config.status,
                lastCheck: config.lastCheck,
                failureCount: config.failureCount,
                lastError: config.failureCount > 0 ? `${config.failureCount} recent failures` : undefined
            });
        }
    }

    return health;
}

/**
 * Run health check on all channels
 */
export async function runHealthCheck(): Promise<ChannelHealth[]> {
    console.log('[SmartComm] Running health check on all channels...');

    const results: ChannelHealth[] = [];

    // Check WhatsApp
    const waConfigs = channelRegistry.get('whatsapp') || [];
    for (let i = 0; i < waConfigs.length; i++) {
        const config = waConfigs[i];
        if (!config.enabled) continue;

        try {
            const status = await checkWhapiStatus();
            if (status.connected) {
                markChannelHealthy('whatsapp', i);
                results.push({
                    channel: 'whatsapp',
                    status: 'healthy',
                    lastCheck: new Date(),
                    failureCount: 0
                });
            } else {
                markChannelFailed('whatsapp', i, status.error || 'Not connected');
                results.push({
                    channel: 'whatsapp',
                    status: 'down',
                    lastCheck: new Date(),
                    failureCount: config.failureCount,
                    lastError: status.error
                });
            }
        } catch (error: any) {
            markChannelFailed('whatsapp', i, error.message);
            results.push({
                channel: 'whatsapp',
                status: 'down',
                lastCheck: new Date(),
                failureCount: config.failureCount,
                lastError: error.message
            });
        }
    }

    // Check SMS (Twilio)
    const smsConfig = channelRegistry.get('sms')?.[0];
    if (smsConfig?.enabled) {
        // Just mark as healthy if configured - Twilio doesn't have a simple health check
        results.push({
            channel: 'sms',
            status: smsConfig.status,
            lastCheck: new Date(),
            failureCount: smsConfig.failureCount
        });
    }

    // Check Email
    const emailConfig = channelRegistry.get('email')?.[0];
    if (emailConfig?.enabled) {
        results.push({
            channel: 'email',
            status: emailConfig.status,
            lastCheck: new Date(),
            failureCount: emailConfig.failureCount
        });
    }

    // Check Push
    const pushConfig = channelRegistry.get('push')?.[0];
    if (pushConfig?.enabled) {
        results.push({
            channel: 'push',
            status: pushConfig.status,
            lastCheck: new Date(),
            failureCount: pushConfig.failureCount
        });
    }

    return results;
}

/**
 * Reset a channel's failure count (after manual intervention)
 */
export function resetChannelHealth(channel: ChannelType, tokenIndex: number = 0): void {
    markChannelHealthy(channel, tokenIndex);
    console.log(`[SmartComm] Channel ${channel}[${tokenIndex}] health reset manually`);
}

/**
 * Add a new WhatsApp backup token dynamically
 */
export function addWhatsAppBackupToken(token: string): void {
    const configs = channelRegistry.get('whatsapp') || [];
    configs.push({
        name: 'whatsapp',
        enabled: true,
        priority: configs.length,
        status: 'healthy',
        lastCheck: new Date(),
        failureCount: 0,
        token
    });
    channelRegistry.set('whatsapp', configs);
    console.log(`[SmartComm] Added WhatsApp backup token #${configs.length - 1}`);
}

// Export for use in voice call tools
export { sendViaWhatsApp, sendViaEmail, sendViaSMS, sendViaPush };
