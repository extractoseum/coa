import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    DEBUG = 'debug'
}

interface LogPayload {
    event: string;
    level?: LogLevel;
    trace_id?: string;
    [key: string]: any;
}

class TelemetryService {
    private static instance: TelemetryService;
    private sessionId: string;

    private constructor() {
        this.sessionId = uuidv4();
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
}

export const telemetry = TelemetryService.getInstance();

// Legacy adapter for existing code
export const trackEvent = (event: string, metadata?: any) => {
    telemetry.log(event, metadata);
};

export const trackPageView = (url: string) => {
    telemetry.log('PageView', { url });
};
