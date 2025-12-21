import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
// import helmet from 'helmet';
// import rateLimit from 'express-rate-limit';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET must be defined in environment.');
}

// Extend Request type
declare global {
    namespace Express {
        interface Request {
            clientId?: string;
            userEmail?: string;
            userRole?: string;
            lastVerifiedAt?: string;
        }
    }
}

interface JWTPayload {
    clientId: string;
    email: string;
    role: string;
}

// Helper to determine effective role (considering tags)
function getEffectiveRole(client: { role: string; tags?: string[] }): string {
    // Check if user has super_admin tag from Shopify
    if (client.tags && Array.isArray(client.tags) && client.tags.includes('super_admin')) {
        return 'super_admin';
    }
    return client.role || 'client';
}

// Middleware: Require authentication
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Token de autorizacion requerido'
            });
        }

        const token = authHeader.substring(7);

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

            // Verify client still exists and is active
            const { data: client, error } = await supabase
                .from('clients')
                .select('id, email, role, is_active, tags, last_verified_at')
                .eq('id', decoded.clientId)
                .single();

            if (error || !client || !client.is_active) {
                return res.status(401).json({
                    success: false,
                    error: 'Usuario no autorizado'
                });
            }

            // Add client info to request (use effective role considering tags)
            req.clientId = client.id;
            req.userEmail = client.email;
            req.userRole = getEffectiveRole(client);
            req.lastVerifiedAt = client.last_verified_at;

            // Also attach full client object for controllers that need it
            (req as any).client = client;

            next();
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Token invalido o expirado'
            });
        }
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Middleware: Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token, continue without auth
            return next();
        }

        const token = authHeader.substring(7);

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

            const { data: client } = await supabase
                .from('clients')
                .select('id, email, role, is_active')
                .eq('id', decoded.clientId)
                .single();

            if (client && client.is_active) {
                req.clientId = client.id;
                req.userEmail = client.email;
                req.userRole = client.role;
            }
        } catch (err) {
            // Token invalid, continue without auth
        }

        next();
    } catch (err) {
        next();
    }
};

// Middleware: Require specific role
export const requireRole = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.userRole) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        if (!allowedRoles.includes(req.userRole)) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para esta accion'
            });
        }

        next();
    };
};

// Middleware: Require super_admin role
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole || req.userRole !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Solo super_admin puede realizar esta accion'
        });
    }
    next();
};

// Middleware: Require COA ownership (client owns the COA or is super_admin)
export const requireCOAOwnership = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.params.token || req.params.id;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token de COA requerido'
            });
        }

        // Super admin can access all COAs
        if (req.userRole === 'super_admin') {
            return next();
        }

        // Check if client owns this COA
        const { data: coa, error } = await supabase
            .from('coas')
            .select('id, client_id')
            .eq('public_token', token)
            .single();

        if (error || !coa) {
            return res.status(404).json({
                success: false,
                error: 'COA no encontrado'
            });
        }

        if (coa.client_id !== req.clientId) {
            return res.status(403).json({
                success: false,
                error: 'No tienes acceso a este COA'
            });
        }

        next();
    } catch (err) {
        console.error('COA ownership check error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Fields that clients can edit
export const CLIENT_EDITABLE_FIELDS = [
    'product_image_url',
    'short_description',
    'long_description',
    'purchase_links',
    'additional_docs',
    'custom_title',
];

// Middleware: Filter editable fields based on role
export const filterEditableFields = (req: Request, res: Response, next: NextFunction) => {
    // Super admin can edit all fields
    if (req.userRole === 'super_admin') {
        return next();
    }

    // Client can only edit specific fields
    if (req.body) {
        const filteredBody: any = {};

        for (const field of CLIENT_EDITABLE_FIELDS) {
            if (req.body[field] !== undefined) {
                filteredBody[field] = req.body[field];
            }
        }

        // Replace body with filtered version
        req.body = filteredBody;
    }

    next();
};

/**
 * Middleware: Require Step-up Authentication
 * Checks if the user has verified their identity recently (e.g., last 5 minutes)
 * If not, returns a 403 step_up_required error.
 */
export const requireStepUp = (maxAgeMinutes = 5) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.lastVerifiedAt) {
            return res.status(403).json({
                success: false,
                error: 'step_up_required',
                message: 'Verificación de identidad requerida para esta acción'
            });
        }

        const lastVerified = new Date(req.lastVerifiedAt).getTime();
        const now = new Date().getTime();
        const ageMinutes = (now - lastVerified) / (1000 * 60);

        if (ageMinutes > maxAgeMinutes) {
            return res.status(403).json({
                success: false,
                error: 'step_up_required',
                message: 'Tu sesión de verificación ha expirado. Por favor re-verifica tu identidad.'
            });
        }

        next();
    };
};
