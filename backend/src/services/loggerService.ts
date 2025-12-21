import { supabase } from '../config/supabase';

// Standardized Error Codes for SWIS WATCH Traceability
export const ERROR_CODES = {
    E_AUTH_FAILED: 'E_AUTH_FAILED',
    E_ACCESS_DENIED: 'E_ACCESS_DENIED',
    E_VALIDATION_FAILED: 'E_VALIDATION_FAILED',
    E_DB_ERROR: 'E_DB_ERROR',
    E_NOT_FOUND: 'E_NOT_FOUND',
    E_WEBHOOK_INVALID: 'E_WEBHOOK_INVALID',
    E_NOTIFICATION_FAILED: 'E_NOTIFICATION_FAILED',
    E_SCRAPER_FAILED: 'E_SCRAPER_FAILED',
    E_RATE_LIMIT_EXCEEDED: 'E_RATE_LIMIT_EXCEEDED',
    E_INTERNAL_ERROR: 'E_INTERNAL_ERROR',
    E_ROUTE_MISMATCH: 'E_ROUTE_MISMATCH',         // Frontend/Navigation mismatch
    E_SELECTOR_NOT_FOUND: 'E_SELECTOR_NOT_FOUND'  // E2E/Testing selector missing
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export type LogCategory = 'webhook' | 'fraud' | 'notification' | 'order' | 'client' | 'badge' | 'system';
export type LogSeverity = 'info' | 'warning' | 'error' | 'critical';

interface LogEntry {
    category: LogCategory;
    eventType: string;
    severity?: LogSeverity;
    payload?: any;
    clientId?: string;
    errorCode?: ErrorCode; // Link to stable error code
}

/**
 * Records a system event in the database for auditing and monitoring.
 */
export const logSystemEvent = async ({
    category,
    eventType,
    severity = 'info',
    payload = {},
    clientId,
    errorCode
}: LogEntry) => {
    try {
        const { error } = await supabase
            .from('system_logs')
            .insert({
                category,
                event_type: eventType,
                severity,
                payload: { ...payload, error_code: errorCode }, // Store error_code in payload for now until schema update
                client_id: clientId
            });

        if (error) {
            console.error(`[Logger] Failed to write to DB: ${error.message}`);
        }
    } catch (err) {
        console.error('[Logger] Critical error:', err);
    }
};

/**
 * Convenience method for logging webhook events
 */
export const logWebhook = (eventType: string, payload: any, clientId?: string) =>
    logSystemEvent({ category: 'webhook', eventType, payload, clientId });

/**
 * Convenience method for logging fraud alerts
 */
export const logFraud = (eventType: string, payload: any, clientId?: string) =>
    logSystemEvent({ category: 'fraud', eventType, severity: 'critical', payload, clientId });

/**
 * Convenience method for logging notifications sent
 */
export const logNotification = (eventType: string, payload: any, clientId: string) =>
    logSystemEvent({ category: 'notification', eventType, payload, clientId });
/**
 * Convenience method for logging client events
 */
export const logClient = (eventType: string, payload: any, clientId?: string) =>
    logSystemEvent({ category: 'client', eventType, payload, clientId });

/**
 * Convenience method for logging badge events
 */
export const logBadge = (eventType: string, payload: any, clientId?: string) =>
    logSystemEvent({ category: 'badge', eventType, payload, clientId });
