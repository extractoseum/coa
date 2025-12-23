import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    correlation_id?: string;
    context?: any;
    error?: any;
}

export class Logger {
    private static instance: Logger;
    private defaultContext: any = {};

    private constructor() { }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    public setDefaultContext(context: any) {
        this.defaultContext = { ...this.defaultContext, ...context };
    }

    private log(level: LogLevel, message: string, context?: any, error?: any) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            correlation_id: context?.correlation_id || this.defaultContext.correlation_id,
            context: { ...this.defaultContext, ...context },
            error: error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : undefined
        };

        // In production, this would go to a file or aggregation service (Datadog, Elastic, etc.)
        // For now, we print JSON to stdout so standard collectors can pick it up.
        console.log(JSON.stringify(entry));
    }

    public debug(message: string, context?: any) {
        this.log(LogLevel.DEBUG, message, context);
    }

    public info(message: string, context?: any) {
        this.log(LogLevel.INFO, message, context);
    }

    public warn(message: string, error?: any, context?: any) {
        this.log(LogLevel.WARN, message, context, error);
    }

    public error(message: string, error?: any, context?: any) {
        this.log(LogLevel.ERROR, message, context, error);
    }

    public startTrace(): string {
        return uuidv4();
    }
}

export const logger = Logger.getInstance();
