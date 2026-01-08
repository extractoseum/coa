import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../config/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-unsafe';
const JWT_EXPIRES_IN = '2h'; // Impersonation sessions last max 2 hours
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Encryption helpers for storing original tokens
const algorithm = 'aes-256-gcm';

function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Helper: Get effective role (same as authController)
const getEffectiveRole = (client: { role: string; tags?: string[] }): string => {
    if (client.role === 'super_admin') return 'super_admin';
    if (Array.isArray(client.tags) && client.tags.includes('super_admin')) {
        return 'super_admin';
    }
    return client.role || 'client';
};

// Generate impersonation JWT with special claims
const generateImpersonationToken = (
    targetClient: { id: string; email: string; role: string; tags?: string[] },
    adminId: string,
    sessionId: string
) => {
    const effectiveRole = getEffectiveRole(targetClient);

    return jwt.sign(
        {
            clientId: targetClient.id,
            email: targetClient.email,
            role: effectiveRole,
            isImpersonating: true,
            adminId,
            impersonationSessionId: sessionId
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

/**
 * Start impersonation session
 * POST /api/v1/impersonation/start
 * Body: { targetClientId: string, reason?: string }
 */
export const startImpersonation = async (req: Request, res: Response) => {
    try {
        const adminId = req.clientId;
        const adminEmail = req.userEmail;

        if (!adminId) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const { targetClientId, reason } = req.body;

        if (!targetClientId) {
            return res.status(400).json({
                success: false,
                error: 'targetClientId es requerido'
            });
        }

        // 1. Verify target client exists
        const { data: targetClient, error: targetError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', targetClientId)
            .single();

        if (targetError || !targetClient) {
            return res.status(404).json({
                success: false,
                error: 'Cliente no encontrado'
            });
        }

        // 2. Prevent impersonating super_admins (security)
        if (getEffectiveRole(targetClient) === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'No puedes impersonar a otro super_admin'
            });
        }

        // 3. Check for existing active session for this admin
        const { data: existingSession } = await supabase
            .from('impersonation_sessions')
            .select('id')
            .eq('admin_id', adminId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .single();

        if (existingSession) {
            return res.status(400).json({
                success: false,
                error: 'Ya tienes una sesión de impersonación activa. Termínala primero.'
            });
        }

        // 4. Get admin's current tokens from Authorization header
        const authHeader = req.headers.authorization;
        const currentAccessToken = authHeader?.substring(7) || '';

        // Get refresh token from body or generate placeholder
        const currentRefreshToken = req.body.refreshToken || 'no-refresh-token-provided';

        // 5. Create impersonation session
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

        const { error: sessionError } = await supabase
            .from('impersonation_sessions')
            .insert({
                id: sessionId,
                admin_id: adminId,
                impersonated_client_id: targetClientId,
                original_access_token_encrypted: encrypt(currentAccessToken),
                original_refresh_token_encrypted: encrypt(currentRefreshToken),
                expires_at: expiresAt.toISOString(),
                reason: reason || null,
                ip_address: req.ip || req.headers['x-forwarded-for'] as string,
                user_agent: req.headers['user-agent'],
                status: 'active'
            });

        if (sessionError) {
            console.error('Error creating impersonation session:', sessionError);
            return res.status(500).json({
                success: false,
                error: 'Error al crear sesión de impersonación'
            });
        }

        // 6. Generate impersonation JWT
        const impersonationToken = generateImpersonationToken(targetClient, adminId, sessionId);

        // 7. Log session start in audit
        await supabase.from('impersonation_audit_logs').insert({
            session_id: sessionId,
            admin_id: adminId,
            impersonated_client_id: targetClientId,
            action_type: 'session_start',
            endpoint: 'POST /api/v1/impersonation/start',
            method: 'POST',
            request_path: req.originalUrl,
            request_body_sanitized: { reason },
            response_status: 200,
            ip_address: req.ip || req.headers['x-forwarded-for'] as string,
            user_agent: req.headers['user-agent']
        });

        // 8. Get admin info for response
        const { data: admin } = await supabase
            .from('clients')
            .select('id, email, name')
            .eq('id', adminId)
            .single();

        res.json({
            success: true,
            impersonationToken,
            sessionId,
            expiresAt: expiresAt.toISOString(),
            impersonatedClient: {
                id: targetClient.id,
                email: targetClient.email,
                name: targetClient.name,
                role: getEffectiveRole(targetClient)
            },
            originalAdmin: admin
        });

    } catch (err) {
        console.error('Start impersonation error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * End impersonation session
 * POST /api/v1/impersonation/end
 */
export const endImpersonation = async (req: Request, res: Response) => {
    try {
        // @ts-ignore - Check if currently impersonating
        const isImpersonating = req.isImpersonating;
        // @ts-ignore
        const sessionId = req.impersonationSessionId;
        // @ts-ignore
        const adminId = req.originalAdminId || req.clientId;

        if (!isImpersonating || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'No hay sesión de impersonación activa'
            });
        }

        // 1. Get the session
        const { data: session, error: sessionError } = await supabase
            .from('impersonation_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('status', 'active')
            .single();

        if (sessionError || !session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión de impersonación no encontrada'
            });
        }

        // 2. Decrypt original tokens
        let originalAccessToken = '';
        let originalRefreshToken = '';

        try {
            originalAccessToken = decrypt(session.original_access_token_encrypted);
            originalRefreshToken = decrypt(session.original_refresh_token_encrypted);
        } catch (decryptError) {
            console.error('Error decrypting tokens:', decryptError);
            // Continue anyway - admin will need to re-login
        }

        // 3. Mark session as ended
        await supabase
            .from('impersonation_sessions')
            .update({
                status: 'ended',
                ended_at: new Date().toISOString()
            })
            .eq('id', sessionId);

        // 4. Log session end in audit
        await supabase.from('impersonation_audit_logs').insert({
            session_id: sessionId,
            admin_id: session.admin_id,
            impersonated_client_id: session.impersonated_client_id,
            action_type: 'session_end',
            endpoint: 'POST /api/v1/impersonation/end',
            method: 'POST',
            request_path: req.originalUrl,
            response_status: 200,
            ip_address: req.ip || req.headers['x-forwarded-for'] as string,
            user_agent: req.headers['user-agent']
        });

        // 5. Get admin info
        const { data: admin } = await supabase
            .from('clients')
            .select('id, email, name, role, tags')
            .eq('id', session.admin_id)
            .single();

        res.json({
            success: true,
            message: 'Sesión de impersonación terminada',
            originalAccessToken: originalAccessToken || null,
            originalRefreshToken: originalRefreshToken || null,
            admin: admin ? {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: getEffectiveRole(admin)
            } : null
        });

    } catch (err) {
        console.error('End impersonation error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get active impersonation session info
 * GET /api/v1/impersonation/active
 */
export const getActiveSession = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const isImpersonating = req.isImpersonating;
        // @ts-ignore
        const sessionId = req.impersonationSessionId;
        // @ts-ignore
        const adminId = req.originalAdminId;
        // @ts-ignore
        const clientId = req.clientId;

        if (isImpersonating && sessionId) {
            // Currently impersonating - return session details
            const { data: session } = await supabase
                .from('impersonation_sessions')
                .select(`
                    id,
                    admin_id,
                    impersonated_client_id,
                    started_at,
                    expires_at,
                    reason
                `)
                .eq('id', sessionId)
                .single();

            if (!session) {
                return res.json({
                    success: true,
                    isImpersonating: false,
                    session: null
                });
            }

            // Get admin and client info
            const { data: admin } = await supabase
                .from('clients')
                .select('id, email, name')
                .eq('id', session.admin_id)
                .single();

            const { data: impersonatedClient } = await supabase
                .from('clients')
                .select('id, email, name')
                .eq('id', session.impersonated_client_id)
                .single();

            return res.json({
                success: true,
                isImpersonating: true,
                session: {
                    id: session.id,
                    startedAt: session.started_at,
                    expiresAt: session.expires_at,
                    reason: session.reason,
                    admin,
                    impersonatedClient
                }
            });
        }

        // Not impersonating - check if admin has any active sessions
        const { data: activeSession } = await supabase
            .from('impersonation_sessions')
            .select('id')
            .eq('admin_id', clientId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString())
            .single();

        res.json({
            success: true,
            isImpersonating: false,
            hasActiveSession: !!activeSession,
            session: null
        });

    } catch (err) {
        console.error('Get active session error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get impersonation history (audit trail)
 * GET /api/v1/impersonation/history
 * Query: ?limit=50&offset=0&adminId=xxx&clientId=xxx
 */
export const getImpersonationHistory = async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const filterAdminId = req.query.adminId as string;
        const filterClientId = req.query.clientId as string;

        let query = supabase
            .from('impersonation_sessions')
            .select(`
                id,
                admin_id,
                impersonated_client_id,
                started_at,
                ended_at,
                expires_at,
                status,
                reason,
                ip_address,
                admin:clients!impersonation_sessions_admin_id_fkey(id, email, name),
                impersonated:clients!impersonation_sessions_impersonated_client_id_fkey(id, email, name)
            `)
            .order('started_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (filterAdminId) {
            query = query.eq('admin_id', filterAdminId);
        }
        if (filterClientId) {
            query = query.eq('impersonated_client_id', filterClientId);
        }

        const { data: sessions, error } = await query;

        if (error) {
            console.error('Error fetching history:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener historial'
            });
        }

        // Get total count
        let countQuery = supabase
            .from('impersonation_sessions')
            .select('id', { count: 'exact', head: true });

        if (filterAdminId) countQuery = countQuery.eq('admin_id', filterAdminId);
        if (filterClientId) countQuery = countQuery.eq('impersonated_client_id', filterClientId);

        const { count } = await countQuery;

        res.json({
            success: true,
            sessions,
            pagination: {
                limit,
                offset,
                total: count || 0
            }
        });

    } catch (err) {
        console.error('Get impersonation history error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Get audit logs for a specific session
 * GET /api/v1/impersonation/audit/:sessionId
 */
export const getSessionAuditLogs = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;

        const { data: logs, error } = await supabase
            .from('impersonation_audit_logs')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) {
            return res.status(500).json({
                success: false,
                error: 'Error al obtener logs de auditoría'
            });
        }

        const { count } = await supabase
            .from('impersonation_audit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', sessionId);

        res.json({
            success: true,
            logs,
            pagination: {
                limit,
                offset,
                total: count || 0
            }
        });

    } catch (err) {
        console.error('Get session audit logs error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Force end an impersonation session (super admin security feature)
 * POST /api/v1/impersonation/force-end/:sessionId
 */
export const forceEndSession = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        // @ts-ignore
        const adminId = req.clientId;

        // 1. Get the session
        const { data: session, error: sessionError } = await supabase
            .from('impersonation_sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('status', 'active')
            .single();

        if (sessionError || !session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada o ya terminada'
            });
        }

        // 2. Force end the session
        await supabase
            .from('impersonation_sessions')
            .update({
                status: 'force_ended',
                ended_at: new Date().toISOString()
            })
            .eq('id', sessionId);

        // 3. Log the force end
        await supabase.from('impersonation_audit_logs').insert({
            session_id: sessionId,
            admin_id: adminId,
            impersonated_client_id: session.impersonated_client_id,
            action_type: 'force_end',
            endpoint: `POST /api/v1/impersonation/force-end/${sessionId}`,
            method: 'POST',
            request_path: req.originalUrl,
            request_body_sanitized: { forcedBy: adminId },
            response_status: 200,
            ip_address: req.ip || req.headers['x-forwarded-for'] as string,
            user_agent: req.headers['user-agent']
        });

        res.json({
            success: true,
            message: 'Sesión terminada forzosamente'
        });

    } catch (err) {
        console.error('Force end session error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
