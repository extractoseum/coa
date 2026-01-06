import { v4 as uuidv4 } from 'uuid';

export const LogLevel = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    DEBUG: 'debug'
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

interface LogPayload {
    event: string;
    level?: LogLevel;
    trace_id?: string;
    [key: string]: any;
}

// Declare global clarity function
declare global {
    interface Window {
        clarity?: (command: string, ...args: any[]) => void;
    }
}

class TelemetryService {
    private static instance: TelemetryService;
    private sessionId: string;
    private fingerprint: string;
    private userEmail: string | null = null;

    private constructor() {
        // Get or create session ID (persists for browser session)
        this.sessionId = sessionStorage.getItem('eum_session_id') || uuidv4();
        sessionStorage.setItem('eum_session_id', this.sessionId);

        // Get or create fingerprint (persists across sessions)
        this.fingerprint = localStorage.getItem('eum_fingerprint') || this.generateFingerprint();
        localStorage.setItem('eum_fingerprint', this.fingerprint);
    }

    private generateFingerprint(): string {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('EUM fingerprint', 2, 2);
            }
            const canvasData = canvas.toDataURL();

            const fp = [
                navigator.userAgent,
                navigator.language,
                `${screen.width}x${screen.height}`,
                new Date().getTimezoneOffset().toString(),
                canvasData.slice(-50)
            ].join('|');

            // Simple hash
            let hash = 0;
            for (let i = 0; i < fp.length; i++) {
                hash = ((hash << 5) - hash) + fp.charCodeAt(i);
                hash = hash & hash;
            }
            return 'fp_' + Math.abs(hash).toString(36);
        } catch {
            return 'fp_' + uuidv4().slice(0, 8);
        }
    }

    public static getInstance(): TelemetryService {
        if (!TelemetryService.instance) {
            TelemetryService.instance = new TelemetryService();
        }
        return TelemetryService.instance;
    }

    public async log(event: string, metadata: any = {}, level: LogLevel = LogLevel.INFO) {
        // Console mirror for local debugging
        if (import.meta.env.DEV) {
            console.log(`[Telemetry][${level.toUpperCase()}] ${event}`, metadata);
        }

        try {
            const payload: LogPayload = {
                event,
                level,
                trace_id: metadata.trace_id || this.sessionId,
                session_id: this.sessionId,
                url: window.location.href,
                ...metadata
            };

            await fetch('/api/v1/logs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            // Failsafe: Don't crash app if telemetry fails
            console.warn('Telemetry flush failed', error);
        }
    }

    public error(event: string, error: any, context: any = {}) {
        this.log(event, {
            ...context,
            error_message: error.message,
            stack: error.stack
        }, LogLevel.ERROR);
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public getFingerprint(): string {
        return this.fingerprint;
    }

    /**
     * Identify user for tracking (call after login)
     * Also identifies user in Microsoft Clarity
     */
    public identifyUser(email: string, metadata?: { name?: string; ordersCount?: number }) {
        this.userEmail = email;

        // Identify in Microsoft Clarity
        if (window.clarity) {
            window.clarity('set', 'customUserId', email);
            if (metadata?.ordersCount !== undefined) {
                window.clarity('set', 'orders_count', metadata.ordersCount.toString());
                window.clarity('set', metadata.ordersCount > 0 ? 'returning_customer' : 'new_customer', 'true');
            }
        }

        // Log identification event
        this.log('user_identified', { email, ...metadata });
    }

    /**
     * Track behavior event (for browsing activity)
     * Sends to /api/behavior/track with identity graph support
     */
    public async trackBehavior(eventType: string, metadata: any = {}) {
        try {
            await fetch('/api/behavior/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_type: eventType,
                    handle: this.userEmail,
                    session_id: this.sessionId,
                    fingerprint: this.fingerprint,
                    url: window.location.href,
                    metadata
                })
            });
        } catch (error) {
            console.warn('Behavior tracking failed', error);
        }
    }
}

export const telemetry = TelemetryService.getInstance();

// Legacy adapter for existing code
export const trackEvent = (event: string, metadata?: any) => {
    telemetry.log(event, metadata);
};

export const trackPageView = (url: string) => {
    telemetry.log('PageView', { url });
};
// Deploy trigger 1767702672
