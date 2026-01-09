import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { searchLocalProducts, createShopifyDraftOrder } from '../services/shopifyService';

// Shopify App Credentials
const SHOPIFY_APP_CLIENT_ID = process.env.SHOPIFY_APP_CLIENT_ID || '';
const SHOPIFY_APP_CLIENT_SECRET = process.env.SHOPIFY_APP_CLIENT_SECRET || '';
const SHOPIFY_APP_SCOPES = 'read_products,write_draft_orders,read_customers,write_script_tags';
const APP_URL = process.env.APP_URL || 'https://coa.extractoseum.com';

/**
 * Generate a random nonce for OAuth state
 */
function generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Verify HMAC signature from Shopify
 */
function verifyHmac(query: Record<string, string>, secret: string): boolean {
    const { hmac, ...params } = query;
    if (!hmac) return false;

    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');

    const generatedHmac = crypto
        .createHmac('sha256', secret)
        .update(sortedParams)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(hmac),
        Buffer.from(generatedHmac)
    );
}

/**
 * Step 1: Initiate OAuth installation
 * GET /api/v1/shopify-app/install?shop=example.myshopify.com
 */
export const handleInstall = async (req: Request, res: Response) => {
    try {
        const { shop } = req.query;

        if (!shop || typeof shop !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Missing shop parameter'
            });
        }

        // Validate shop format
        if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid shop format'
            });
        }

        const nonce = generateNonce();
        const redirectUri = `${APP_URL}/api/v1/shopify-app/callback`;

        // Store nonce for verification (expires in 10 minutes)
        await supabase.from('shopify_app_sessions').upsert({
            shop,
            nonce,
            status: 'pending',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }, { onConflict: 'shop' });

        // Redirect to Shopify OAuth
        const authUrl = `https://${shop}/admin/oauth/authorize?` +
            `client_id=${SHOPIFY_APP_CLIENT_ID}&` +
            `scope=${SHOPIFY_APP_SCOPES}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `state=${nonce}`;

        console.log(`[ShopifyApp] Redirecting ${shop} to OAuth`);
        res.redirect(authUrl);
    } catch (error: any) {
        console.error('[ShopifyApp] Install error:', error);
        res.status(500).json({
            success: false,
            error: 'Installation failed'
        });
    }
};

/**
 * Step 2: OAuth callback - exchange code for access token
 * GET /api/v1/shopify-app/callback
 */
export const handleCallback = async (req: Request, res: Response) => {
    try {
        const { code, shop, state, hmac } = req.query as Record<string, string>;

        if (!code || !shop || !state) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Verify HMAC
        if (!verifyHmac(req.query as Record<string, string>, SHOPIFY_APP_CLIENT_SECRET)) {
            console.error('[ShopifyApp] HMAC verification failed');
            return res.status(401).json({
                success: false,
                error: 'Invalid signature'
            });
        }

        // Verify nonce
        const { data: session } = await supabase
            .from('shopify_app_sessions')
            .select('*')
            .eq('shop', shop)
            .eq('nonce', state)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .single();

        if (!session) {
            console.error('[ShopifyApp] Invalid or expired nonce');
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired session'
            });
        }

        // Exchange code for access token
        const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: SHOPIFY_APP_CLIENT_ID,
                client_secret: SHOPIFY_APP_CLIENT_SECRET,
                code
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[ShopifyApp] Token exchange failed:', errorText);
            return res.status(500).json({
                success: false,
                error: 'Failed to get access token'
            });
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Store the access token (encrypted in production)
        await supabase.from('shopify_app_sessions').update({
            access_token: accessToken, // TODO: Encrypt this
            status: 'active',
            installed_at: new Date().toISOString()
        }).eq('shop', shop);

        console.log(`[ShopifyApp] Successfully installed for ${shop}`);

        // Register ScriptTag for the widget
        try {
            const scriptTagResponse = await fetch(`https://${shop}/admin/api/2024-01/script_tags.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({
                    script_tag: {
                        event: 'onload',
                        src: `${APP_URL}/api/v1/shopify-app/widget.js`,
                        display_scope: 'online_store'
                    }
                })
            });

            if (scriptTagResponse.ok) {
                console.log(`[ShopifyApp] ScriptTag registered for ${shop}`);
            } else {
                const errText = await scriptTagResponse.text();
                console.error(`[ShopifyApp] Failed to register ScriptTag:`, errText);
            }
        } catch (scriptErr) {
            console.error(`[ShopifyApp] ScriptTag registration error:`, scriptErr);
        }

        // Redirect to success page or admin
        res.redirect(`https://${shop}/admin/apps`);
    } catch (error: any) {
        console.error('[ShopifyApp] Callback error:', error);
        res.status(500).json({
            success: false,
            error: 'OAuth callback failed'
        });
    }
};

/**
 * Check if user has active impersonation session
 * GET /api/v1/shopify-app/session
 */
export const getSessionStatus = async (req: Request, res: Response) => {
    // Set CORS headers for cross-origin requests from Shopify storefront
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
        const isImpersonating = req.isImpersonating || false;
        const sessionId = req.impersonationSessionId;

        if (!isImpersonating || !sessionId) {
            return res.json({
                success: true,
                isImpersonating: false
            });
        }

        // Get session details
        const { data: session } = await supabase
            .from('impersonation_sessions')
            .select('*, impersonated_client:impersonated_client_id(id, name, email, phone, shopify_customer_id)')
            .eq('id', sessionId)
            .single();

        if (!session) {
            return res.json({
                success: true,
                isImpersonating: false
            });
        }

        res.json({
            success: true,
            isImpersonating: true,
            session: {
                id: session.id,
                expiresAt: session.expires_at,
                client: session.impersonated_client
            }
        });
    } catch (error: any) {
        console.error('[ShopifyApp] Session status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Search products for widget
 * GET /api/v1/shopify-app/products?query=xxx
 */
export const searchProductsWidget = async (req: Request, res: Response) => {
    // Set CORS headers for cross-origin requests from Shopify storefront
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
        const { query } = req.query;

        if (!query || typeof query !== 'string') {
            return res.json({ success: true, products: [] });
        }

        const products = await searchLocalProducts(query);
        res.json({ success: true, products });
    } catch (error: any) {
        console.error('[ShopifyApp] Product search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Create draft order from widget
 * POST /api/v1/shopify-app/draft-order
 */
export const createDraftOrderWidget = async (req: Request, res: Response) => {
    // Set CORS headers for cross-origin requests from Shopify storefront
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { items, customerId } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Items required'
            });
        }

        const invoiceUrl = await createShopifyDraftOrder(items, customerId);

        if (invoiceUrl) {
            // Log this action if impersonating
            if (req.isImpersonating && req.impersonationSessionId) {
                await supabase.from('impersonation_audit_logs').insert({
                    session_id: req.impersonationSessionId,
                    admin_id: req.originalAdminId,
                    impersonated_client_id: req.clientId,
                    action_type: 'draft_order_created',
                    endpoint: 'POST /api/v1/shopify-app/draft-order',
                    method: 'POST',
                    request_body_sanitized: { items_count: items.length, customerId },
                    response_status: 200,
                    response_summary: 'success'
                });
            }

            res.json({ success: true, invoiceUrl });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to create draft order'
            });
        }
    } catch (error: any) {
        console.error('[ShopifyApp] Draft order error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * Register ScriptTag manually (for already installed apps)
 * POST /api/v1/shopify-app/register-script
 */
export const registerScriptTag = async (req: Request, res: Response) => {
    try {
        const { shop } = req.body;

        if (!shop) {
            return res.status(400).json({ success: false, error: 'Shop required' });
        }

        // Get access token from database
        const { data: session } = await supabase
            .from('shopify_app_sessions')
            .select('access_token')
            .eq('shop', shop)
            .eq('status', 'active')
            .single();

        if (!session?.access_token) {
            return res.status(404).json({ success: false, error: 'Shop not found or not active' });
        }

        // Register ScriptTag
        const scriptTagResponse = await fetch(`https://${shop}/admin/api/2024-01/script_tags.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': session.access_token
            },
            body: JSON.stringify({
                script_tag: {
                    event: 'onload',
                    src: `${APP_URL}/api/v1/shopify-app/widget.js`,
                    display_scope: 'online_store'
                }
            })
        });

        if (scriptTagResponse.ok) {
            const data = await scriptTagResponse.json();
            console.log(`[ShopifyApp] ScriptTag registered for ${shop}`);
            res.json({ success: true, scriptTag: data.script_tag });
        } else {
            const errText = await scriptTagResponse.text();
            console.error(`[ShopifyApp] Failed to register ScriptTag:`, errText);
            res.status(500).json({ success: false, error: errText });
        }
    } catch (error: any) {
        console.error('[ShopifyApp] Register script error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Serve the widget JavaScript
 * GET /api/v1/shopify-app/widget.js
 */
export const getWidgetScript = async (req: Request, res: Response) => {
    // Set CORS and CORP headers to allow cross-origin loading
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // This serves the Sales Agent widget that gets injected into Shopify storefront
    const widgetScript = `
(function() {
    'use strict';

    const API_BASE = '${APP_URL}/api/v1';
    const COA_DOMAIN = '${APP_URL}';

    // Widget state
    let memoryToken = null;
    let currentSession = null;
    let currentTab = 'products'; // 'products' or 'chat'
    let chatMessages = [];
    let chatConversationId = null;

    // Safe localStorage access
    function safeLocalStorage(action, key, value) {
        try {
            if (action === 'get') return localStorage.getItem(key);
            if (action === 'set') { localStorage.setItem(key, value); return true; }
        } catch (e) {
            console.log('[EUM] localStorage blocked');
            return null;
        }
    }

    // Get token from URL or storage
    function getToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('eum_token');
        if (urlToken) {
            memoryToken = urlToken;
            safeLocalStorage('set', 'eum_sales_agent_token', urlToken);
            // Clean URL
            const otherParams = new URLSearchParams(window.location.search);
            otherParams.delete('eum_token');
            const cleanUrl = window.location.href.split('?')[0];
            const newUrl = otherParams.toString() ? cleanUrl + '?' + otherParams.toString() : cleanUrl;
            window.history.replaceState({}, '', newUrl);
            return urlToken;
        }
        if (memoryToken) return memoryToken;
        return safeLocalStorage('get', 'eum_sales_agent_token');
    }

    // API call helper
    async function apiCall(endpoint, options = {}) {
        const token = getToken();
        if (!token) throw new Error('No token');
        const res = await fetch(API_BASE + endpoint, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                ...(options.headers || {})
            }
        });
        return res.json();
    }

    // Check session
    async function checkSession() {
        try {
            const token = getToken();
            if (!token) return null;
            const data = await apiCall('/shopify-app/session');
            if (data.success && data.isImpersonating) {
                currentSession = data.session;
                return data.session;
            }
            return null;
        } catch (err) {
            console.error('[EUM] Session check failed:', err);
            return null;
        }
    }

    // Load chat messages
    async function loadChat() {
        if (!currentSession?.client?.id) return;
        try {
            const data = await apiCall('/crm/clients/' + currentSession.client.id + '/conversation');
            if (data.success && data.data) {
                chatConversationId = data.data.conversation?.id;
                chatMessages = data.data.messages || [];
                renderChat();
            }
        } catch (err) {
            console.error('[EUM] Load chat failed:', err);
        }
    }

    // Send chat message
    async function sendChatMessage(content) {
        if (!chatConversationId || !content.trim()) return;
        try {
            await apiCall('/crm/conversations/' + chatConversationId + '/messages', {
                method: 'POST',
                body: JSON.stringify({ content, role: 'assistant' })
            });
            // Reload messages
            await loadChat();
        } catch (err) {
            console.error('[EUM] Send message failed:', err);
        }
    }

    // Render chat messages
    function renderChat() {
        const container = document.getElementById('eum-chat-messages');
        if (!container) return;

        container.innerHTML = chatMessages.map(m => \`
            <div style="margin-bottom: 12px; text-align: \${m.role === 'user' ? 'left' : 'right'};">
                <div style="display: inline-block; max-width: 80%; padding: 8px 12px; border-radius: 12px; background: \${m.role === 'user' ? 'rgba(255,255,255,0.1)' : '#3b82f6'}; font-size: 13px;">
                    \${m.content}
                </div>
                <div style="font-size: 10px; opacity: 0.5; margin-top: 2px;">
                    \${new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        \`).join('');

        container.scrollTop = container.scrollHeight;
    }

    // Create widget
    function createWidget(session) {
        // Toggle button
        const toggle = document.createElement('div');
        toggle.id = 'eum-sales-agent-toggle';
        toggle.innerHTML = 'Sales Agent';
        document.body.appendChild(toggle);

        // Main panel
        const widget = document.createElement('div');
        widget.id = 'eum-sales-agent-widget';
        widget.innerHTML = \`
            <style>
                #eum-sales-agent-toggle {
                    position: fixed !important; top: 50% !important; right: 0 !important;
                    transform: translateY(-50%) !important;
                    background: linear-gradient(135deg, #dc2626, #ea580c) !important;
                    color: white !important; padding: 16px 10px !important;
                    border-radius: 8px 0 0 8px !important; cursor: pointer !important;
                    z-index: 2147483647 !important; writing-mode: vertical-rl !important;
                    font-weight: bold !important; font-size: 14px !important;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                    box-shadow: -2px 0 10px rgba(0,0,0,0.3) !important;
                    text-transform: uppercase !important; letter-spacing: 1px !important;
                }
                #eum-sales-agent-toggle:hover { padding-right: 14px !important; }
                #eum-sales-agent-widget {
                    position: fixed !important; top: 0 !important; right: 0 !important;
                    width: 400px !important; height: 100vh !important;
                    background: #1a1a2e !important; color: white !important;
                    box-shadow: -4px 0 20px rgba(0,0,0,0.3) !important;
                    z-index: 2147483646 !important;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                    display: flex !important; flex-direction: column !important;
                    transform: translateX(100%) !important;
                    transition: transform 0.3s ease !important;
                }
                #eum-sales-agent-widget.open { transform: translateX(0) !important; }
                .eum-header {
                    background: linear-gradient(135deg, #dc2626, #ea580c) !important;
                    padding: 12px 16px !important; display: flex !important;
                    justify-content: space-between !important; align-items: center !important;
                    flex-shrink: 0 !important;
                }
                .eum-tabs {
                    display: flex !important; background: #16213e !important;
                    flex-shrink: 0 !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important;
                }
                .eum-tab {
                    flex: 1 !important; padding: 14px 12px !important; text-align: center !important;
                    cursor: pointer !important; border: none !important; background: transparent !important;
                    color: rgba(255,255,255,0.5) !important; font-size: 13px !important;
                    font-weight: 500 !important; transition: all 0.2s !important;
                    border-radius: 0 !important; outline: none !important;
                    border-bottom: 2px solid transparent !important;
                }
                .eum-tab:hover {
                    color: rgba(255,255,255,0.8) !important;
                    background: rgba(255,255,255,0.05) !important;
                }
                .eum-tab.active {
                    color: white !important; background: transparent !important;
                    border-bottom: 2px solid #3b82f6 !important;
                }
                .eum-content {
                    flex: 1 !important; overflow-y: auto !important; padding: 16px !important;
                    display: none !important;
                }
                .eum-content.active { display: block !important; }
                .eum-search {
                    width: 100% !important; padding: 12px !important;
                    background: rgba(255,255,255,0.1) !important;
                    border: 1px solid rgba(255,255,255,0.2) !important;
                    border-radius: 8px !important; color: white !important;
                    margin-bottom: 16px !important; box-sizing: border-box !important;
                    font-size: 14px !important;
                }
                .eum-search::placeholder { color: rgba(255,255,255,0.5) !important; }
                .eum-product {
                    background: rgba(255,255,255,0.05) !important;
                    padding: 12px !important; border-radius: 8px !important;
                    margin-bottom: 12px !important; border: 1px solid rgba(255,255,255,0.1) !important;
                }
                .eum-product-name { font-weight: 600 !important; margin-bottom: 4px !important; font-size: 14px !important; }
                .eum-product-price { font-size: 13px !important; color: #a5b4fc !important; margin-bottom: 8px !important; }
                .eum-variants { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; margin-top: 8px !important; }
                .eum-variant-btn {
                    padding: 6px 10px !important;
                    background: rgba(99, 102, 241, 0.2) !important; color: #a5b4fc !important;
                    border: 1px solid rgba(99, 102, 241, 0.4) !important; border-radius: 6px !important;
                    cursor: pointer !important; font-size: 11px !important;
                    transition: all 0.2s !important;
                }
                .eum-variant-btn:hover {
                    background: rgba(99, 102, 241, 0.4) !important;
                    color: white !important;
                    border-color: #6366f1 !important;
                }
                .eum-cart-items {
                    max-height: 150px !important; overflow-y: auto !important;
                    margin-bottom: 12px !important;
                }
                .eum-cart-item {
                    display: flex !important; justify-content: space-between !important;
                    align-items: center !important; padding: 8px !important;
                    background: rgba(255,255,255,0.05) !important;
                    border-radius: 6px !important; margin-bottom: 6px !important;
                    font-size: 12px !important;
                }
                .eum-cart-item-name { flex: 1 !important; margin-right: 8px !important; }
                .eum-cart-item-price { color: #a5b4fc !important; margin-right: 8px !important; }
                .eum-cart-item-remove {
                    background: none !important; border: none !important;
                    color: #f87171 !important; cursor: pointer !important;
                    font-size: 16px !important; padding: 0 4px !important;
                }
                .eum-cart-item-remove:hover { color: #ef4444 !important; }
                .eum-chat-container {
                    display: flex !important; flex-direction: column !important;
                    height: 100% !important;
                }
                .eum-chat-messages {
                    flex: 1 !important; overflow-y: auto !important;
                    padding: 8px !important; min-height: 200px !important;
                }
                .eum-chat-input-container {
                    display: flex !important; gap: 8px !important; margin-top: 12px !important;
                }
                .eum-chat-input {
                    flex: 1 !important; padding: 10px !important;
                    background: rgba(255,255,255,0.1) !important;
                    border: 1px solid rgba(255,255,255,0.2) !important;
                    border-radius: 8px !important; color: white !important;
                    font-size: 14px !important;
                }
                .eum-chat-send {
                    padding: 10px 16px !important; background: #3b82f6 !important;
                    color: white !important; border: none !important;
                    border-radius: 8px !important; cursor: pointer !important;
                    font-weight: bold !important;
                }
                .eum-chat-send:hover { background: #2563eb !important; }
                .eum-cart {
                    border-top: 1px solid rgba(255,255,255,0.1) !important;
                    padding: 16px !important; background: rgba(0,0,0,0.2) !important;
                    flex-shrink: 0 !important;
                }
                .eum-btn {
                    width: 100% !important; padding: 12px !important;
                    background: #3b82f6 !important; color: white !important;
                    border: none !important; border-radius: 8px !important;
                    cursor: pointer !important; font-weight: bold !important;
                }
                .eum-btn:hover { background: #2563eb !important; }
                .eum-loading { text-align: center !important; padding: 20px !important; opacity: 0.6 !important; }
                .eum-empty { text-align: center !important; padding: 20px !important; opacity: 0.5 !important; font-size: 13px !important; }
            </style>
            <div class="eum-header">
                <div>
                    <div style="font-weight: bold; font-size: 15px;">Sales Agent</div>
                    <div style="font-size: 12px; opacity: 0.8;">\${session.client?.name || 'Cliente'}</div>
                </div>
                <button id="eum-close-btn" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">×</button>
            </div>
            <div class="eum-tabs">
                <button class="eum-tab active" data-tab="products">Productos</button>
                <button class="eum-tab" data-tab="chat">Chat</button>
            </div>
            <div class="eum-content active" id="eum-tab-products">
                <input type="text" class="eum-search" placeholder="Buscar productos..." id="eum-search-input">
                <div id="eum-products"><div class="eum-empty">Busca productos para agregar al pedido</div></div>
            </div>
            <div class="eum-content" id="eum-tab-chat">
                <div class="eum-chat-container">
                    <div class="eum-chat-messages" id="eum-chat-messages">
                        <div class="eum-loading">Cargando mensajes...</div>
                    </div>
                    <div class="eum-chat-input-container">
                        <input type="text" class="eum-chat-input" placeholder="Escribe un mensaje..." id="eum-chat-input">
                        <button class="eum-chat-send" id="eum-chat-send">Enviar</button>
                    </div>
                </div>
            </div>
            <div class="eum-cart">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: bold;">Carrito (<span id="eum-cart-count">0</span>)</span>
                    <span style="color: #a5b4fc;">$<span id="eum-cart-total">0.00</span> MXN</span>
                </div>
                <div class="eum-cart-items" id="eum-cart-items"></div>
                <button class="eum-btn" id="eum-checkout-btn">Generar Link de Pago</button>
            </div>
        \`;
        document.body.appendChild(widget);

        // Event handlers
        toggle.onclick = () => {
            widget.classList.toggle('open');
            toggle.style.right = widget.classList.contains('open') ? '400px' : '0';
        };

        document.getElementById('eum-close-btn').onclick = () => {
            widget.classList.remove('open');
            toggle.style.right = '0';
        };

        // Tab switching
        document.querySelectorAll('.eum-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.eum-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.eum-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('eum-tab-' + tab.dataset.tab).classList.add('active');
                if (tab.dataset.tab === 'chat' && chatMessages.length === 0) {
                    loadChat();
                }
            };
        });

        // Search
        let searchTimeout;
        document.getElementById('eum-search-input').oninput = (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchProducts(e.target.value), 500);
        };

        // Chat send
        document.getElementById('eum-chat-send').onclick = () => {
            const input = document.getElementById('eum-chat-input');
            if (input.value.trim()) {
                sendChatMessage(input.value);
                input.value = '';
            }
        };
        document.getElementById('eum-chat-input').onkeypress = (e) => {
            if (e.key === 'Enter') document.getElementById('eum-chat-send').click();
        };

        // Checkout
        document.getElementById('eum-checkout-btn').onclick = () => createDraftOrder();

        console.log('[EUM] Widget initialized for:', session.client?.name);
    }

    // Search products
    async function searchProducts(query) {
        if (!query || query.length < 2) {
            document.getElementById('eum-products').innerHTML = '<div class="eum-empty">Busca productos para agregar al pedido</div>';
            return;
        }

        document.getElementById('eum-products').innerHTML = '<div class="eum-loading">Buscando...</div>';

        try {
            const data = await apiCall('/shopify-app/products?query=' + encodeURIComponent(query));
            console.log('[EUM] Search results:', data);

            const container = document.getElementById('eum-products');
            if (data.success && data.products && data.products.length > 0) {
                container.innerHTML = data.products.map(p => {
                    const variants = p.variants || [];
                    const hasVariants = variants.length > 1 || (variants.length === 1 && variants[0].title !== 'Default Title');

                    let variantsHtml = '';
                    if (hasVariants) {
                        variantsHtml = '<div class="eum-variants">' + variants.map(v => \`
                            <button class="eum-variant-btn" onclick="window.eumAddToCart('\${v.id}', '\${escapeHtml(p.name + ' - ' + v.title).replace(/'/g, "\\\\'")}', \${parseFloat(v.price) || 0})">
                                \${escapeHtml(v.title)} - $\${v.price}
                            </button>
                        \`).join('') + '</div>';
                    } else {
                        variantsHtml = '<div class="eum-variants"><button class="eum-variant-btn" onclick="window.eumAddToCart(\\'' + (variants[0]?.id || p.id) + '\\', \\'' + escapeHtml(p.name).replace(/'/g, "\\\\'") + '\\', ' + (parseFloat(p.price) || 0) + ')">+ Agregar $' + p.price + '</button></div>';
                    }

                    return \`
                        <div class="eum-product">
                            <div class="eum-product-name">\${escapeHtml(p.name)}</div>
                            \${hasVariants ? '<div class="eum-product-price">Selecciona variante:</div>' : ''}
                            \${variantsHtml}
                        </div>
                    \`;
                }).join('');
            } else {
                container.innerHTML = '<div class="eum-empty">No se encontraron productos</div>';
            }
        } catch (err) {
            console.error('[EUM] Search error:', err);
            document.getElementById('eum-products').innerHTML = '<div class="eum-empty">Error al buscar</div>';
        }
    }

    // Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Cart
    window.eumCart = [];
    window.eumAddToCart = function(variantId, name, price) {
        // Check if already in cart, increment quantity
        const existing = window.eumCart.find(item => item.variantId === variantId);
        if (existing) {
            existing.quantity += 1;
        } else {
            window.eumCart.push({ variantId, name, price: parseFloat(price) || 0, quantity: 1 });
        }
        updateCartDisplay();
        console.log('[EUM] Added to cart:', { variantId, name, price });
    };

    window.eumRemoveFromCart = function(index) {
        window.eumCart.splice(index, 1);
        updateCartDisplay();
    };

    function updateCartDisplay() {
        const countEl = document.getElementById('eum-cart-count');
        const totalEl = document.getElementById('eum-cart-total');
        const itemsEl = document.getElementById('eum-cart-items');

        const totalQty = window.eumCart.reduce((sum, item) => sum + item.quantity, 0);
        if (countEl) countEl.textContent = totalQty;

        const total = window.eumCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (totalEl) totalEl.textContent = total.toFixed(2);

        if (itemsEl) {
            if (window.eumCart.length === 0) {
                itemsEl.innerHTML = '<div style="text-align: center; opacity: 0.5; font-size: 12px; padding: 8px;">Carrito vacío</div>';
            } else {
                itemsEl.innerHTML = window.eumCart.map((item, idx) => \`
                    <div class="eum-cart-item">
                        <span class="eum-cart-item-name">\${escapeHtml(item.name)}</span>
                        <span class="eum-cart-item-price">\${item.quantity > 1 ? item.quantity + 'x ' : ''}$\${(item.price * item.quantity).toFixed(2)}</span>
                        <button class="eum-cart-item-remove" onclick="window.eumRemoveFromCart(\${idx})">×</button>
                    </div>
                \`).join('');
            }
        }
    }

    // Create draft order
    async function createDraftOrder() {
        if (window.eumCart.length === 0) {
            alert('Agrega productos al carrito primero');
            return;
        }

        try {
            const items = window.eumCart.map(item => ({
                variant_id: item.variantId,
                quantity: item.quantity
            }));

            const data = await apiCall('/shopify-app/draft-order', {
                method: 'POST',
                body: JSON.stringify({
                    items,
                    customerId: currentSession?.client?.shopify_customer_id
                })
            });

            if (data.success && data.invoiceUrl) {
                window.eumCart = [];
                updateCartDisplay();
                window.open(data.invoiceUrl, '_blank');
            } else {
                alert('Error al crear pedido: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('[EUM] Draft order error:', err);
            alert('Error al crear pedido');
        }
    }

    // Poll for new chat messages
    function startChatPolling() {
        setInterval(() => {
            if (currentTab === 'chat' && chatConversationId) {
                loadChat();
            }
        }, 5000);
    }

    // Initialize
    checkSession().then(session => {
        if (session) {
            createWidget(session);
            startChatPolling();
        }
    });

    // Listen for token from COA app
    window.addEventListener('message', function(event) {
        if (event.origin === COA_DOMAIN && event.data.type === 'EUM_SALES_AGENT_TOKEN') {
            memoryToken = event.data.token;
            safeLocalStorage('set', 'eum_sales_agent_token', event.data.token);
            checkSession().then(session => {
                if (session && !document.getElementById('eum-sales-agent-widget')) {
                    createWidget(session);
                }
            });
        }
    });

    console.log('[EUM Sales Agent] Script loaded, checking for token...');
})();
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // No cache during development
    res.send(widgetScript);
};
