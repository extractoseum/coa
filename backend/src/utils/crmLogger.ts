import { supabase } from '../config/supabase';

export enum CRMAuditType {
    INFO = 'INFO',
    ERROR = 'ERROR',
    GHOST_DATA = 'GHOST_DATA',
    LATENCY = 'LATENCY'
}

interface AuditEntry {
    event_type: CRMAuditType;
    component: string;
    message: string;
    metadata?: any;
}

class CRMLogger {
    private static instance: CRMLogger;
    private buffer: AuditEntry[] = [];
    private readonly MAX_BUFFER_SIZE = 10;
    private readonly FLUSH_INTERVAL = 30000; // 30 seconds

    private constructor() {
        // Periodic flush
        setInterval(() => this.flush(), this.FLUSH_INTERVAL);
    }

    public static getInstance(): CRMLogger {
        if (!CRMLogger.instance) {
            CRMLogger.instance = new CRMLogger();
        }
        return CRMLogger.instance;
    }

    /**
     * Standard log method
     */
    public log(type: CRMAuditType, component: string, message: string, metadata: any = {}) {
        const entry = {
            event_type: type,
            component,
            message,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString()
            }
        };

        // 1. console.log for immediate visibility in PM2
        const prefix = `[CRM:${type}]`;
        console.log(`${prefix} [${component}] ${message}`);

        // 2. Buffer for DB persistence
        this.buffer.push(entry);

        if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
            this.flush();
        }
    }

    public info(component: string, message: string, metadata?: any) {
        this.log(CRMAuditType.INFO, component, message, metadata);
    }

    public error(component: string, message: string, error?: any, metadata?: any) {
        this.log(CRMAuditType.ERROR, component, message, {
            ...metadata,
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack
            } : error
        });
    }

    public ghost(component: string, message: string, metadata?: any) {
        this.log(CRMAuditType.GHOST_DATA, component, message, metadata);
    }

    /**
     * Persist buffered logs to Supabase
     */
    private async flush() {
        if (this.buffer.length === 0) return;

        const logsToPersist = [...this.buffer];
        this.buffer = [];

        try {
            const { error } = await supabase
                .from('crm_audit_logs')
                .insert(logsToPersist);

            if (error) {
                console.error('[CRMLogger] Failed to flush logs to DB:', error.message);
                // Prepend back to buffer in case of transient failure
                this.buffer = [...logsToPersist, ...this.buffer].slice(0, 100);
            }
        } catch (err) {
            console.error('[CRMLogger] Unexpected flush error:', err);
        }
    }
}

export const crmLogger = CRMLogger.getInstance();
