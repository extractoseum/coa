import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/Logger';

// Extend Express Request to include correlation ID
declare global {
    namespace Express {
        interface Request {
            correlationId?: string;
        }
    }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    // 1. Get or generate correlation ID
    const correlationId = (req.headers['x-request-id'] as string) || uuidv4();
    req.correlationId = correlationId;

    // 2. Add to response headers so client sees it
    res.setHeader('x-request-id', correlationId);

    // 3. Log Request Start
    logger.info(`[Incoming] ${req.method} ${req.originalUrl}`, {
        correlation_id: correlationId,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // 4. Capture Response Finish
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'WARN' : 'INFO';

        const logData = {
            correlation_id: correlationId,
            status: res.statusCode,
            duration_ms: duration
        };

        if (level === 'WARN') {
            logger.warn(`[Response] ${req.method} ${req.originalUrl} - ${res.statusCode}`, null, logData);
        } else {
            logger.info(`[Response] ${req.method} ${req.originalUrl} - ${res.statusCode}`, logData);
        }
    });

    next();
};
