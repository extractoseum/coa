import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-unsafe';

// Sensitive fields to redact from audit logs
const SENSITIVE_FIELDS = ['password', 'password_hash', 'token', 'accessToken', 'refreshToken', 'secret', 'mfa_secret'];

/**
 * Sanitize request body for audit logging
 * Removes sensitive fields like passwords, tokens, etc.
 */
function sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized: any = {};
    for (const [key, value] of Object.entries(body)) {
        if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeRequestBody(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

/**
 * Prevent cascade impersonation
 * Blocks an admin from impersonating while already impersonating
 */
export const preventCascadeImpersonation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        if (decoded.isImpersonating) {
            return res.status(403).json({
                success: false,
                error: 'cascade_impersonation_blocked',
                message: 'No puedes impersonar mientras ya estás impersonando a otro usuario. Termina la sesión actual primero.'
            });
        }

        next();
    } catch (err) {
        // If token verification fails, let requireAuth handle it
        next();
    }
};

/**
 * Log impersonation action
 * Logs every API call made during an impersonation session to the audit table
 * Should be applied AFTER requireAuth middleware
 */
export const logImpersonationAction = async (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - added by requireAuth
    const isImpersonating = req.isImpersonating;

    if (!isImpersonating) {
        return next();
    }

    // @ts-ignore
    const sessionId = req.impersonationSessionId;
    // @ts-ignore
    const adminId = req.originalAdminId;
    // @ts-ignore
    const clientId = req.clientId;

    const startTime = Date.now();

    // Capture original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function(data: any) {
        const duration = Date.now() - startTime;

        // Skip logging for certain endpoints to avoid noise
        const skipEndpoints = [
            '/api/v1/impersonation/active',
            '/api/v1/impersonation/end'
        ];

        const shouldSkip = skipEndpoints.some(ep => req.originalUrl.includes(ep));

        if (!shouldSkip && sessionId) {
            // Log to impersonation_audit_logs (async, don't block response)
            supabase.from('impersonation_audit_logs').insert({
                session_id: sessionId,
                admin_id: adminId,
                impersonated_client_id: clientId,
                action_type: 'api_call',
                endpoint: `${req.method} ${req.path}`,
                method: req.method,
                request_path: req.originalUrl,
                request_body_sanitized: sanitizeRequestBody(req.body),
                response_status: res.statusCode,
                response_summary: data?.success !== undefined
                    ? (data.success ? 'success' : data.error || 'error')
                    : 'unknown',
                ip_address: req.ip || (req.headers['x-forwarded-for'] as string),
                user_agent: req.headers['user-agent'],
                duration_ms: duration
            }).then(({ error }) => {
                if (error) {
                    console.error('[Impersonation Audit] Failed to log action:', error);
                }
            });
        }

        return originalJson(data);
    };

    next();
};

/**
 * Validate impersonation session is still active
 * Called within requireAuth when impersonation is detected
 */
export const validateImpersonationSession = async (sessionId: string): Promise<{
    valid: boolean;
    session?: any;
    error?: string;
}> => {
    try {
        const { data: session, error } = await supabase
            .from('impersonation_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .single();

        if (error || !session) {
            return {
                valid: false,
                error: 'impersonation_session_expired'
            };
        }

        return {
            valid: true,
            session
        };
    } catch (err) {
        console.error('Error validating impersonation session:', err);
        return {
            valid: false,
            error: 'validation_error'
        };
    }
};

/**
 * Auto-expire impersonation sessions
 * Can be called by a cron job or on-demand
 */
export const expireImpersonationSessions = async (): Promise<number> => {
    try {
        const { data, error } = await supabase
            .from('impersonation_sessions')
            .update({
                status: 'expired',
                ended_at: new Date().toISOString()
            })
            .eq('status', 'active')
            .lt('expires_at', new Date().toISOString())
            .select('id');

        if (error) {
            console.error('Error expiring sessions:', error);
            return 0;
        }

        return data?.length || 0;
    } catch (err) {
        console.error('Error in expireImpersonationSessions:', err);
        return 0;
    }
};
