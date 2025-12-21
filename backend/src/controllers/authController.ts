import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../config/supabase';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET is not defined in production environment.');
    }
    console.warn('WARNING: Using default insecure JWT_SECRET. Do not use this in production.');
}
const SAFE_SECRET = JWT_SECRET || 'dev-secret-unsafe';
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

// Shopify OAuth Config
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Store for OAuth state tokens (in production, use Redis)
const oauthStates = new Map<string, { createdAt: Date; redirectTo?: string }>();

// Clean up expired states every 5 minutes
setInterval(() => {
    const now = new Date();
    for (const [state, data] of oauthStates.entries()) {
        if (now.getTime() - data.createdAt.getTime() > 10 * 60 * 1000) {
            oauthStates.delete(state);
        }
    }
}, 5 * 60 * 1000);

interface JWTPayload {
    clientId: string;
    email: string;
    role: string;
}

// Helper: Determine effective role based on role field and tags
const getEffectiveRole = (client: { role: string; tags?: string[] }): string => {
    // If role is already super_admin, return it
    if (client.role === 'super_admin') return 'super_admin';

    // Check if tags array contains 'super_admin'
    if (Array.isArray(client.tags) && client.tags.includes('super_admin')) {
        return 'super_admin';
    }

    return client.role || 'client';
};

// Generate tokens
const generateTokens = (client: { id: string; email: string; role: string; tags?: string[] }) => {
    const effectiveRole = getEffectiveRole(client);

    const accessToken = jwt.sign(
        { clientId: client.id, email: client.email, role: effectiveRole },
        SAFE_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
        { clientId: client.id, type: 'refresh' },
        SAFE_SECRET,
        { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
    );

    return { accessToken, refreshToken };
};

// Login
export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email y password son requeridos'
            });
        }

        // Find client by email
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('is_active', true)
            .single();

        if (error || !client) {
            return res.status(401).json({
                success: false,
                error: 'Credenciales invalidas'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, client.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Credenciales invalidas'
            });
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(client);

        // Save refresh token in sessions table
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

        await supabase.from('sessions').insert({
            client_id: client.id,
            refresh_token: refreshToken,
            expires_at: expiresAt.toISOString()
        });

        // Update last login and verification status
        await supabase
            .from('clients')
            .update({
                last_login_at: new Date().toISOString(),
                last_verified_at: new Date().toISOString()
            })
            .eq('id', client.id);

        res.json({
            success: true,
            accessToken,
            refreshToken,
            client: {
                id: client.id,
                email: client.email,
                name: client.name,
                role: getEffectiveRole(client),
                tags: client.tags,
                company: client.company
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response) => {
    try {
        const { refreshToken: token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Refresh token requerido'
            });
        }

        // Verify refresh token
        let decoded: any;
        try {
            decoded = jwt.verify(token, SAFE_SECRET) as any;
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Token invalido o expirado'
            });
        }

        // Check if session exists
        const { data: session, error: sessionError } = await supabase
            .from('sessions')
            .select('*')
            .eq('refresh_token', token)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (sessionError || !session) {
            return res.status(401).json({
                success: false,
                error: 'Sesion invalida'
            });
        }

        // Get client
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', session.client_id)
            .eq('is_active', true)
            .single();

        if (clientError || !client) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(client);

        // Delete old session and create new one
        await supabase.from('sessions').delete().eq('id', session.id);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

        await supabase.from('sessions').insert({
            client_id: client.id,
            refresh_token: newRefreshToken,
            expires_at: expiresAt.toISOString()
        });

        res.json({
            success: true,
            accessToken,
            refreshToken: newRefreshToken
        });
    } catch (err) {
        console.error('Refresh token error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Logout
export const logout = async (req: Request, res: Response) => {
    try {
        const { refreshToken: token } = req.body;

        if (token) {
            // Delete session
            await supabase.from('sessions').delete().eq('refresh_token', token);
        }

        res.json({ success: true, message: 'Sesion cerrada' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get current user
export const me = async (req: Request, res: Response) => {
    try {
        // @ts-ignore - added by middleware
        const clientId = req.clientId;

        if (!clientId) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        const { data: client, error } = await supabase
            .from('clients')
            .select('id, email, name, phone, company, role, tags, shopify_customer_id, created_at')
            .eq('id', clientId)
            .single();

        if (error || !client) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }

        res.json({
            success: true,
            client: {
                ...client,
                role: getEffectiveRole(client)
            }
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Register new client (super_admin only)
export const registerClient = async (req: Request, res: Response) => {
    try {
        // @ts-ignore - added by middleware
        const userRole = req.userRole;

        if (userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Solo super_admin puede registrar clientes'
            });
        }

        const { email, password, name, phone, company, role = 'client' } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email y password son requeridos'
            });
        }

        // Check if email already exists
        const { data: existing } = await supabase
            .from('clients')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'El email ya esta registrado'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create client
        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                email: email.toLowerCase(),
                password_hash: passwordHash,
                name,
                phone,
                company,
                role: role === 'super_admin' ? 'super_admin' : 'client'
            })
            .select('id, email, name, phone, company, role')
            .single();

        if (error) {
            console.error('Register error:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al crear cliente'
            });
        }

        res.json({ success: true, client });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
    try {
        // @ts-ignore - added by middleware
        const clientId = req.clientId;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Passwords requeridos'
            });
        }

        // Get client
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .single();

        if (error || !client) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, client.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Password actual incorrecto'
            });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Update password
        await supabase
            .from('clients')
            .update({
                password_hash: newPasswordHash,
                updated_at: new Date().toISOString()
            })
            .eq('id', clientId);

        // Invalidate all sessions
        await supabase.from('sessions').delete().eq('client_id', clientId);

        res.json({ success: true, message: 'Password actualizado' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================
// SHOPIFY OAUTH FUNCTIONS
// ============================================

// Initiate Shopify OAuth - redirects to Shopify login
export const initiateShopifyOAuth = async (req: Request, res: Response) => {
    try {
        const { redirectTo } = req.query;

        if (!SHOPIFY_CLIENT_ID || !SHOPIFY_STORE_DOMAIN) {
            return res.status(500).json({
                success: false,
                error: 'Shopify OAuth no esta configurado'
            });
        }

        // Generate state token for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, {
            createdAt: new Date(),
            redirectTo: (redirectTo as string) || '/dashboard'
        });

        // Build Shopify OAuth URL
        // Using Shopify Customer Account API (new way) or Headless OAuth
        const redirectUri = `${FRONTEND_URL}/auth/shopify/callback`;
        const scope = 'openid email customer-account-api:full';

        // Shopify uses a different OAuth endpoint for customer accounts
        // This is for Shopify's Customer Account API
        const authUrl = new URL(`https://shopify.com/${SHOPIFY_STORE_DOMAIN.replace('.myshopify.com', '')}/auth/oauth/authorize`);
        authUrl.searchParams.set('client_id', SHOPIFY_CLIENT_ID);
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('state', state);

        // Return the auth URL for frontend to redirect
        res.json({
            success: true,
            authUrl: authUrl.toString(),
            state
        });
    } catch (err) {
        console.error('Shopify OAuth initiate error:', err);
        res.status(500).json({ success: false, error: 'Error iniciando OAuth' });
    }
};

// Handle Shopify OAuth callback - exchange code for tokens
export const handleShopifyCallback = async (req: Request, res: Response) => {
    try {
        const { code, state } = req.body;

        // Verify state
        const stateData = oauthStates.get(state);
        if (!stateData) {
            return res.status(400).json({
                success: false,
                error: 'Estado invalido o expirado'
            });
        }
        oauthStates.delete(state);

        // Exchange code for access token
        const tokenUrl = `https://shopify.com/${SHOPIFY_STORE_DOMAIN.replace('.myshopify.com', '')}/auth/oauth/token`;

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: SHOPIFY_CLIENT_ID,
                client_secret: SHOPIFY_CLIENT_SECRET,
                redirect_uri: `${FRONTEND_URL}/auth/shopify/callback`,
                code
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('Token exchange error:', errorData);
            return res.status(400).json({
                success: false,
                error: 'Error al obtener token de Shopify'
            });
        }

        const tokenData = await tokenResponse.json();

        // Get customer info from Shopify
        const customerInfo = await getShopifyCustomerInfo(tokenData.access_token);

        if (!customerInfo || !customerInfo.email) {
            return res.status(400).json({
                success: false,
                error: 'No se pudo obtener informacion del cliente'
            });
        }

        // Find or create client in our database
        let client = await findOrCreateClientFromShopify(customerInfo);

        // Generate our JWT tokens
        const { accessToken, refreshToken: refreshTokenValue } = generateTokens(client);

        // Save session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

        await supabase.from('sessions').insert({
            client_id: client.id,
            refresh_token: refreshTokenValue,
            expires_at: expiresAt.toISOString()
        });

        // Update last login and verification status
        await supabase
            .from('clients')
            .update({
                last_login_at: new Date().toISOString(),
                last_verified_at: new Date().toISOString()
            })
            .eq('id', client.id);

        res.json({
            success: true,
            accessToken,
            refreshToken: refreshTokenValue,
            client: {
                id: client.id,
                email: client.email,
                name: client.name,
                role: client.role,
                company: client.company,
                shopify_customer_id: client.shopify_customer_id
            },
            redirectTo: stateData.redirectTo
        });
    } catch (err) {
        console.error('Shopify OAuth callback error:', err);
        res.status(500).json({ success: false, error: 'Error en callback OAuth' });
    }
};

// NEW: Seamless "Lookup" Login
// Checks if email exists in our synced DB and logs in immediately without password
// This assumes trusting the email input (requested feature for friction reduction)
// SECURE: Send OTP (Email, WhatsApp, SMS)
export const sendOTP = async (req: Request, res: Response) => {
    try {
        // DEBUG: Inspect incoming body
        console.log('[DEBUG] sendOTP req.body:', req.body);
        let { identifier, email } = req.body;

        // BACKWARD COMPATIBILITY: If identifier is missing, check for 'email'
        if (!identifier && email) {
            identifier = email;
        }

        if (!identifier) {
            return res.status(400).json({
                success: false,
                error: `Email o teléfono requerido. DEBUG_SERVER_RECEIVED: ${JSON.stringify(req.body)}`
            });
        }

        const isEmail = identifier.includes('@');
        let cleanIdentifier = identifier.trim();
        if (isEmail) {
            cleanIdentifier = cleanIdentifier.toLowerCase();
        } else {
            // Normalize phone: remove non-digits
            cleanIdentifier = cleanIdentifier.replace(/\D/g, '');
        }

        // 1. Validate user exists
        const query = supabase
            .from('clients')
            .select('id, name, email, phone')
            .eq('is_active', true);

        if (isEmail) {
            query.eq('email', cleanIdentifier);
        } else {
            // For phone we might need to be careful with formatting in DB
            // This assumes phone in DB is stored similarly or we might need to check 'contains' if format varies
            // For now assume exact match on digits or stored format
            query.ilike('phone', `%${cleanIdentifier}%`); // Loose match for phone to be safe
        }

        let { data: client, error } = await query.maybeSingle(); // Use let to allow update

        if (error || !client) {
            // RETRY: Check Shopify Real-time (Sync on fail)
            console.log(`[Auth] User not found locally for ${cleanIdentifier}. Checking Shopify...`);

            let shopifyCustomer = null;
            if (isEmail) {
                shopifyCustomer = await findShopifyCustomerByEmail(cleanIdentifier);
            } else {
                shopifyCustomer = await findShopifyCustomerByPhone(cleanIdentifier);
            }

            if (shopifyCustomer) {
                console.log(`[Auth] Found in Shopify: ${shopifyCustomer.email}. Syncing now...`);
                // Create local user from Shopify data
                client = await findOrCreateClientFromShopify({
                    id: shopifyCustomer.id.toString(),
                    email: shopifyCustomer.email,
                    firstName: shopifyCustomer.first_name,
                    lastName: shopifyCustomer.last_name,
                    phone: shopifyCustomer.phone
                });
            } else {
                // OPEN REGISTRATION: User not found locally or in Shopify.
                // Proceed to output message anyway. We will create the user in verifyOTP.
                console.log(`[Auth] User ${cleanIdentifier} not found. Proceeding with Open Registration (OTP flow).`);

                // Temporary mock client object for email template personalization
                // We use 'any' cast to avoid TS issues with missing required fields since this is just for the template
                client = {
                    name: 'Nuevo Usuario',
                    email: isEmail ? cleanIdentifier : undefined,
                    phone: !isEmail ? cleanIdentifier : undefined
                } as any;
            }
        }


        // 2. Generate 6 digit code
        const code = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

        // Determine Channel
        let channel = 'email';
        if (!isEmail) {
            // Check availability of channels for phone
            // We dynamic import to avoid crashes if deps are missing
            const { checkWhapiStatus, checkPhoneExists } = await import('../services/whapiService');
            // const { isTwilioConfigured } = await import('../services/twilioService'); // If we had one

            const whapiStatus = await checkWhapiStatus();

            if (whapiStatus.configured && whapiStatus.connected && await checkPhoneExists(cleanIdentifier)) {
                channel = 'whatsapp';
            } else {
                channel = 'sms';
            }
        }

        // Define channel variable for the next block
        const targetChannel = channel;

        // 3. Save to DB (new schema with identifier/channel)
        const { error: otpError } = await supabase
            .from('otp_codes')
            .upsert({
                identifier: cleanIdentifier,
                code,
                channel,
                expires_at: expiresAt.toISOString(),
                attempts: 0
            });

        if (otpError) {
            console.error('OTP DB Error:', otpError);
            // DEBUG: Return exact error to frontend
            return res.status(500).json({
                success: false,
                error: `Error DB: ${otpError.message} (Details: ${JSON.stringify(otpError)})`
            });
        }

        // 4. Send Code
        let sendResult = { success: false, error: '' };

        if (targetChannel === 'email') {
            try {
                const { sendDataEmail } = await import('../services/emailService');
                const emailRes = await sendDataEmail(
                    cleanIdentifier,
                    'Tu código de verificación EUM',
                    `<div style="font-family: Arial, sans-serif; color: #333;">
                        <h2>Tu código de acceso</h2>
                        <p>Hola ${client?.name || 'Cliente'},</p>
                        <p>Usa el siguiente código para iniciar sesión en <strong>Extractos EUM Viewer</strong>:</p>
                        <div style="background: #f4f4f4; padding: 15px; text-align: center; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                            ${code}
                        </div>
                    </div>`
                );
                sendResult = { success: emailRes.success, error: emailRes.error ? String(emailRes.error) : '' };
            } catch (err: any) {
                sendResult = { success: false, error: err.message };
            }
        } else if (targetChannel === 'whatsapp') {
            const { sendWhatsAppMessage } = await import('../services/whapiService');
            const waRes = await sendWhatsAppMessage({
                to: cleanIdentifier,
                body: `*${code}* es tu código de verificación para Extractos EUM.`
            });
            sendResult = { success: waRes.sent, error: waRes.error || '' };
        } else if (targetChannel === 'sms') {
            const { sendSMS, makeVoiceCall } = await import('../services/twilioService');
            // Try SMS first
            let smsRes = await sendSMS(cleanIdentifier, `${code} es tu código de verificación EUM.`);

            if (smsRes.success) {
                sendResult = { success: true, error: '' };
            } else {
                // FALLBACK: Voice Call
                // Use Voice if SMS fails (e.g. number capability issues)
                console.log(`[Auth] SMS failed (${smsRes.error}). Attempting Twilio Voice Call fallback...`);
                const voiceRes = await makeVoiceCall(cleanIdentifier, code);

                if (voiceRes.success) {
                    sendResult = { success: true, error: '' };
                    channel = 'voice'; // Update channel for response clarity
                } else {
                    sendResult = { success: false, error: `SMS: ${smsRes.error} | Voice: ${voiceRes.error}` };
                }
            }
        }

        if (!sendResult.success) {
            console.error(`Error sending OTP via ${targetChannel}:`, sendResult.error);
            return res.status(500).json({ success: false, error: `Error al enviar ${targetChannel}: ${sendResult.error}` });
        }

        res.json({ success: true, message: `Código enviado por ${targetChannel}`, channel: targetChannel });

    } catch (err) {
        console.error('Send OTP error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// SECURE: Verify OTP and Login
export const verifyOTP = async (req: Request, res: Response) => {
    try {
        let { identifier, email, code } = req.body;

        // BACKWARD COMPATIBILITY
        if (!identifier && email) {
            identifier = email;
        }

        if (!identifier || !code) return res.status(400).json({ success: false, error: 'Código y usuario requeridos' });

        const isEmail = identifier.includes('@');
        let cleanIdentifier = identifier.trim();
        if (isEmail) {
            cleanIdentifier = cleanIdentifier.toLowerCase();
        } else {
            cleanIdentifier = cleanIdentifier.replace(/\D/g, '');
        }

        // 1. Get OTP record
        const { data: record, error } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('identifier', cleanIdentifier) // Changed from email to identifier
            .single();

        if (error || !record) {
            return res.status(400).json({ success: false, error: 'Código inválido o expirado' });
        }

        // 2. Validate Expiry
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'Código expirado. Solicita uno nuevo.' });
        }

        // 3. Validate Attempts
        if (record.attempts >= 5) {
            return res.status(400).json({ success: false, error: 'Demasiados intentos. Solicita nuevo código.' });
        }

        // 4. Compare Code
        if (record.code !== code) {
            // Increment attempts
            await supabase.from('otp_codes').update({ attempts: record.attempts + 1 }).eq('identifier', cleanIdentifier);
        }

        // --- SUCCESS ---

        // 5. Get Client or Create New
        let query = supabase
            .from('clients')
            .select('*');

        if (isEmail) {
            query = query.eq('email', cleanIdentifier);
        } else {
            query = query.ilike('phone', `%${cleanIdentifier}%`);
        }

        let { data: existingClient, error: clientError } = await query.maybeSingle();
        let client = existingClient;

        if (!client) {
            console.log(`[Auth] User ${cleanIdentifier} verified but not found locally. Creating new account...`);

            // 1. Create in Shopify (if not exists checks are handled inside helper usually, but here we just try create)
            // The quickRegister helper logic helps, but let's use createShopifyCustomer directly
            // 1. Create in Shopify or Get Existing
            let shopifyCustomer = null;
            try {
                // Try to create
                shopifyCustomer = await createShopifyCustomer(cleanIdentifier, isEmail);
            } catch (err) {
                // If failed, it might exist (Shopify API throws if phone/email taken)
                // We'll try to find it
                console.log('[Auth] Shopify creation failed/exists, trying to find existing...');
                if (isEmail) {
                    shopifyCustomer = await findShopifyCustomerByEmail(cleanIdentifier);
                } else {
                    shopifyCustomer = await findShopifyCustomerByPhone(cleanIdentifier);
                }
            }

            const shopifyId = shopifyCustomer ? shopifyCustomer.id.toString() : null;

            // 2. Create in Local DB
            const newClientData: any = {
                name: shopifyCustomer ? `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim() || 'Nuevo Usuario' : 'Nuevo Usuario',
                is_active: true,
                shopify_customer_id: shopifyId,
                role: 'client'
            };

            if (isEmail) {
                newClientData.email = cleanIdentifier;
            } else {
                newClientData.phone = cleanIdentifier;
                // DATABASE HACK: Email is NON-NULL unique in DB. 
                // Since we can't run migration easily right now, we use a dummy placeholder.
                // Format: phone.NUMBER@placeholder.com to be unique
                newClientData.email = `phone.${cleanIdentifier}@placeholder.com`;
            }

            // Set preferences based on channel used
            // DISABLED: Columns not in DB yet. Will run migration later.
            /* const channelUsed = record.channel || 'email';
            if (channelUsed === 'whatsapp') newClientData.whatsapp_notifications = true;
            if (channelUsed === 'sms') newClientData.sms_notifications = true;
            if (channelUsed === 'email') newClientData.email_notifications = true; */

            const { data: newClient, error: createError } = await supabase
                .from('clients')
                .insert(newClientData)
                .select()
                .single();

            if (createError || !newClient) {
                console.error('[Auth] Failed to auto-create user:', createError);
                return res.status(500).json({ success: false, error: 'Error creando usuario nuevo' });
            }

            client = newClient;
            console.log(`[Auth] New user created: ${client.id}`);
        } else {
            // Sync shopify ID if missing
            if (!client.shopify_customer_id) {
                const shopifyCustomer = isEmail
                    ? await findShopifyCustomerByEmail(cleanIdentifier)
                    : await findShopifyCustomerByPhone(cleanIdentifier);

                if (shopifyCustomer) {
                    await supabase.from('clients').update({ shopify_customer_id: shopifyCustomer.id.toString() }).eq('id', client.id);
                }
            }
        }

        // 6. Generate Tokens
        const { accessToken, refreshToken: refreshTokenValue } = generateTokens(client);

        // 7. Create Session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

        await supabase.from('sessions').insert({
            client_id: client.id,
            refresh_token: refreshTokenValue,
            expires_at: expiresAt.toISOString()
        });

        // 8. Update Last Login, Verification status and Clear OTP
        await supabase.from('clients').update({
            last_login_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString()
        }).eq('id', client.id);
        await supabase.from('otp_codes').delete().eq('identifier', cleanIdentifier); // Burn code

        res.json({
            success: true,
            accessToken,
            refreshToken: refreshTokenValue,
            client: {
                id: client.id,
                email: client.email,
                name: client.name,
                role: getEffectiveRole(client),
                tags: client.tags,
                company: client.company,
                shopify_customer_id: client.shopify_customer_id
            }
        });

    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// DEBUG: Check DB Structure and Connectivity
export const debugDBChecks = async (req: Request, res: Response) => {
    try {
        const results = {
            step1_connection: 'pending',
            step2_table_schema: 'pending',
            step3_insert_test: 'pending',
            details: {} as any
        };

        // 1. Check Connection
        const { data: now, error: connError } = await supabase.rpc('now'); // Simple RPC if exists or just query
        if (connError && connError.code !== 'PGRST202') {
            // If RPC missing, try basic select
            const { error: selError } = await supabase.from('clients').select('id').limit(1);
            if (selError) {
                results.step1_connection = 'failed: ' + selError.message;
            } else {
                results.step1_connection = 'ok';
            }
        } else {
            results.step1_connection = 'ok';
        }

        // 2. Check Input Handling (Migration)
        // We try to insert with the NEW columns. If it fails invalid column, we know migration is missing.
        const testId = 'debug_' + Date.now();
        const { error: insertError } = await supabase
            .from('otp_codes')
            .insert({
                identifier: testId,
                channel: 'debug',
                code: '000000',
                expires_at: new Date().toISOString()
            });

        if (insertError) {
            results.step3_insert_test = 'failed';
            results.details.insert_error = insertError;
            // Also try legacy insert to confirm
            const { error: legacyError } = await supabase
                .from('otp_codes')
                .insert({
                    email: testId,
                    code: '000000',
                    expires_at: new Date().toISOString()
                } as any);

            if (!legacyError) {
                results.details.diagnosis = "CRITICAL: Table still has 'email' column instead of 'identifier'. MIGRATION NOT APPLIED.";
            } else {
                results.details.diagnosis = "Unknown DB structure. Both new and old inserts failed.";
                results.details.legacy_error = legacyError;
            }

        } else {
            results.step3_insert_test = 'ok';
            results.details.diagnosis = "Table structure seems CORRECT.";
            // Cleanup
            await supabase.from('otp_codes').delete().eq('identifier', testId);
        }

        res.json({ success: true, diagnostics: results });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
};

// Alternative: Login by matching Shopify customer email (using Admin API)
// This is useful when OAuth is not set up
export const loginWithShopifyEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email requerido'
            });
        }

        // Always check Shopify first to get the latest tags
        const shopifyCustomer = await findShopifyCustomerByEmail(email);

        if (!shopifyCustomer) {
            return res.status(401).json({
                success: false,
                error: 'No eres cliente de nuestra tienda Shopify'
            });
        }

        // Get Shopify tags
        const shopifyTags = shopifyCustomer.tagsArray || [];

        // Check if client exists in our database
        let { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('email', email.toLowerCase())
            .eq('is_active', true)
            .single();

        // If not in our DB, create from Shopify data
        if (!client) {
            client = await findOrCreateClientFromShopify({
                id: shopifyCustomer.id.toString(),
                email: shopifyCustomer.email,
                firstName: shopifyCustomer.first_name,
                lastName: shopifyCustomer.last_name,
                phone: shopifyCustomer.phone
            });
        }

        // Merge Shopify tags with client data for role check
        const clientWithTags = { ...client, tags: shopifyTags };

        // Generate tokens using Shopify tags for role determination
        const { accessToken, refreshToken: refreshTokenValue } = generateTokens(clientWithTags);

        // Save session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

        await supabase.from('sessions').insert({
            client_id: client.id,
            refresh_token: refreshTokenValue,
            expires_at: expiresAt.toISOString()
        });

        // Update last login and verification status
        await supabase
            .from('clients')
            .update({
                last_login_at: new Date().toISOString(),
                last_verified_at: new Date().toISOString()
            })
            .eq('id', client.id);

        res.json({
            success: true,
            accessToken,
            refreshToken: refreshTokenValue,
            client: {
                id: client.id,
                email: client.email,
                name: client.name,
                role: getEffectiveRole(clientWithTags),
                tags: shopifyTags,
                company: client.company,
                shopify_customer_id: client.shopify_customer_id
            }
        });
    } catch (err) {
        console.error('Shopify email login error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Helper: Get customer info from Shopify using access token
async function getShopifyCustomerInfo(accessToken: string): Promise<any> {
    try {
        // Using Shopify Customer Account API
        const response = await fetch(`https://shopify.com/${SHOPIFY_STORE_DOMAIN.replace('.myshopify.com', '')}/account/customer/api/2024-01/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                query: `
                    query {
                        customer {
                            id
                            emailAddress {
                                emailAddress
                            }
                            firstName
                            lastName
                            phoneNumber {
                                phoneNumber
                            }
                        }
                    }
                `
            })
        });

        if (!response.ok) {
            console.error('Failed to get customer info:', await response.text());
            return null;
        }

        const data = await response.json();
        const customer = data.data?.customer;

        if (!customer) return null;

        return {
            id: customer.id,
            email: customer.emailAddress?.emailAddress,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phoneNumber?.phoneNumber
        };
    } catch (err) {
        console.error('Error getting customer info:', err);
        return null;
    }
}

// Helper: Find Shopify customer by email using Admin API
async function findShopifyCustomerByEmail(email: string): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        if (!adminToken || !SHOPIFY_STORE_DOMAIN) return null;

        const response = await fetch(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}`,
            {
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            console.error('Shopify search error:', await response.text());
            return null;
        }

        const data = await response.json();
        const customer = data.customers?.[0] || null;

        // Parse Shopify tags into array
        if (customer && customer.tags) {
            customer.tagsArray = customer.tags.split(',').map((t: string) => t.trim());
        } else if (customer) {
            customer.tagsArray = [];
        }

        return customer;
    } catch (err) {
        console.error('Error searching Shopify customer:', err);
        return null;
    }
}

// Helper: Find Shopify customer by phone using Admin API
async function findShopifyCustomerByPhone(phone: string): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        if (!adminToken || !SHOPIFY_STORE_DOMAIN) return null;

        // Strip country code for broader search if needed, or search as is
        // Shopify phone search can be tricky. Try searching last 10 digits
        const cleanPhone = phone.replace(/\D/g, '').slice(-10);

        console.log(`[Shopify] Searching for phone containing: ${cleanPhone}`);

        const response = await fetch(
            `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${cleanPhone}`, // Removed wildcard for better precision
            {
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            console.error('Shopify search error:', await response.text());
            return null;
        }

        const data = await response.json();
        let customer = null;

        // Smart Filtering: Find the best match
        if (data.customers && data.customers.length > 0) {
            // Priority 1: Exact match on last 10 digits
            customer = data.customers.find((c: any) => {
                if (!c.phone) return false;
                const p = c.phone.replace(/\D/g, '');
                return p.includes(cleanPhone);
            });

            // Priority 2: Fallback to first if strict match fails (shouldn't happen if Shopify search deemed it relevant)
            if (!customer) customer = data.customers[0];
        }

        // Fallback: Try exact match if they provided country code and standard search failed
        if (!customer && phone.length > 10) {
            console.log(`[Shopify] Retrying with exact string: ${phone}`);
            const responseExact = await fetch(
                `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${phone}`,
                {
                    headers: { 'X-Shopify-Access-Token': adminToken, 'Content-Type': 'application/json' }
                }
            );
            if (responseExact.ok) {
                const dataExact = await responseExact.json();
                customer = dataExact.customers?.[0] || null;
            }
        }

        // Parse Shopify tags into array
        if (customer && customer.tags) {
            customer.tagsArray = customer.tags.split(',').map((t: string) => t.trim());
        } else if (customer) {
            customer.tagsArray = [];
        }

        return customer;
    } catch (err) {
        console.error('Error searching Shopify customer by phone:', err);
        return null;
    }
}

// ============================================
// QUICK REGISTER (No password, just email/phone)
// ============================================

// Quick register - DEPRECATED for security. Use OTP flow.
export const quickRegister = async (req: Request, res: Response) => {
    return res.status(410).json({
        success: false,
        error: 'Este endpoint ha sido deshabilitado por seguridad. Use el login con OTP.'
    });
};

// Helper: Create customer in Shopify
async function createShopifyCustomer(identifier: string, isEmail: boolean): Promise<any> {
    try {
        const adminToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
        const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;

        if (!adminToken || !storeDomain) {
            console.log('Shopify Admin API not configured, skipping Shopify customer creation');
            return null;
        }

        const customerData: any = {
            customer: {
                verified_email: false,
                send_email_welcome: false,
                tags: 'coa-viewer-user'
            }
        };

        if (isEmail) {
            customerData.customer.email = identifier;
        } else {
            customerData.customer.phone = identifier;
        }

        const response = await fetch(
            `https://${storeDomain}/admin/api/2024-01/customers.json`,
            {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': adminToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(customerData)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Shopify customer creation error:', errorText);
            // Don't fail - we can still create local account
            return null;
        }

        const data = await response.json();
        return data.customer;
    } catch (err) {
        console.error('Error creating Shopify customer:', err);
        return null;
    }
}

// Helper: Find or create client from Shopify customer data
async function findOrCreateClientFromShopify(customerInfo: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
}): Promise<any> {
    // First try to find by shopify_customer_id
    let { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('shopify_customer_id', customerInfo.id)
        .single();

    if (client) return client;

    // Try to find by email
    const { data: existingByEmail } = await supabase
        .from('clients')
        .select('*')
        .eq('email', customerInfo.email.toLowerCase())
        .single();

    if (existingByEmail) {
        // Update with Shopify ID AND Phone (since they just logged in with it/Shopify has it)
        const updateData: any = { shopify_customer_id: customerInfo.id };
        if (customerInfo.phone) {
            updateData.phone = customerInfo.phone;
        }

        await supabase
            .from('clients')
            .update(updateData)
            .eq('id', existingByEmail.id);

        return { ...existingByEmail, ...updateData };
    }

    // Create new client
    const name = [customerInfo.firstName, customerInfo.lastName].filter(Boolean).join(' ') || null;

    const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
            email: customerInfo.email.toLowerCase(),
            name,
            phone: customerInfo.phone,
            shopify_customer_id: customerInfo.id,
            role: 'client',
            is_active: true
        })
        .select('*')
        .single();

    if (error) {
        console.error('Error creating client:', error);
        throw new Error('No se pudo crear el cliente');
    }

    return newClient;
}
