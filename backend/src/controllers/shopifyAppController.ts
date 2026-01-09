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

    const API_BASE = '${APP_URL}/api/v1/shopify-app';
    const COA_DOMAIN = '${APP_URL}';

    // In-memory token storage (fallback when localStorage is blocked)
    let memoryToken = null;

    // Safe localStorage access (may be blocked in sandboxed iframes)
    function safeLocalStorage(action, key, value) {
        try {
            if (action === 'get') {
                return localStorage.getItem(key);
            } else if (action === 'set') {
                localStorage.setItem(key, value);
                return true;
            }
        } catch (e) {
            // localStorage blocked, use memory fallback
            console.log('[EUM Sales Agent] localStorage blocked, using memory storage');
            return null;
        }
    }

    // Get token from URL parameter or storage
    function getToken() {
        // First check URL parameter (from "Abrir Tienda" button)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('eum_token');
        if (urlToken) {
            // Store it for future use
            memoryToken = urlToken;
            safeLocalStorage('set', 'eum_sales_agent_token', urlToken);
            // Clean up URL (remove token from visible URL)
            const cleanUrl = window.location.href.split('?')[0];
            const otherParams = new URLSearchParams(window.location.search);
            otherParams.delete('eum_token');
            const newUrl = otherParams.toString() ? cleanUrl + '?' + otherParams.toString() : cleanUrl;
            window.history.replaceState({}, '', newUrl);
            return urlToken;
        }
        // Check memory first, then localStorage
        if (memoryToken) return memoryToken;
        return safeLocalStorage('get', 'eum_sales_agent_token');
    }

    // Check if we should show the widget
    async function checkSession() {
        try {
            const token = getToken();
            if (!token) return null;

            const res = await fetch(API_BASE + '/session', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();

            if (data.success && data.isImpersonating) {
                return data.session;
            }
            return null;
        } catch (err) {
            console.error('[EUM Sales Agent] Session check failed:', err);
            return null;
        }
    }

    // Create the floating widget
    function createWidget(session) {
        // Create toggle button OUTSIDE the widget so it stays visible
        const toggle = document.createElement('div');
        toggle.id = 'eum-sales-agent-toggle';
        toggle.innerHTML = 'Sales Agent';
        document.body.appendChild(toggle);

        // Create the main widget panel
        const widget = document.createElement('div');
        widget.id = 'eum-sales-agent-widget';
        widget.innerHTML = \`
            <style>
                #eum-sales-agent-toggle {
                    position: fixed !important;
                    top: 50% !important;
                    right: 0 !important;
                    transform: translateY(-50%) !important;
                    background: linear-gradient(135deg, #dc2626, #ea580c) !important;
                    color: white !important;
                    padding: 16px 10px !important;
                    border-radius: 8px 0 0 8px !important;
                    cursor: pointer !important;
                    z-index: 2147483647 !important;
                    writing-mode: vertical-rl !important;
                    font-weight: bold !important;
                    font-size: 14px !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    box-shadow: -2px 0 10px rgba(0,0,0,0.3) !important;
                    text-transform: uppercase !important;
                    letter-spacing: 1px !important;
                }
                #eum-sales-agent-toggle:hover {
                    padding-right: 14px !important;
                }
                #eum-sales-agent-widget {
                    position: fixed !important;
                    top: 0 !important;
                    right: 0 !important;
                    width: 400px !important;
                    height: 100vh !important;
                    background: #1a1a2e !important;
                    color: white !important;
                    box-shadow: -4px 0 20px rgba(0,0,0,0.3) !important;
                    z-index: 2147483646 !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                    display: flex !important;
                    flex-direction: column !important;
                    transform: translateX(100%) !important;
                    transition: transform 0.3s ease !important;
                }
                #eum-sales-agent-widget.open {
                    transform: translateX(0) !important;
                }
                #eum-sales-agent-widget.open + #eum-sales-agent-toggle,
                #eum-sales-agent-widget.open ~ #eum-sales-agent-toggle {
                    right: 400px !important;
                }
                .eum-header {
                    background: linear-gradient(135deg, #dc2626, #ea580c) !important;
                    padding: 16px !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                }
                .eum-content {
                    flex: 1 !important;
                    overflow-y: auto !important;
                    padding: 16px !important;
                }
                .eum-search {
                    width: 100% !important;
                    padding: 12px !important;
                    background: rgba(255,255,255,0.1) !important;
                    border: 1px solid rgba(255,255,255,0.2) !important;
                    border-radius: 8px !important;
                    color: white !important;
                    margin-bottom: 16px !important;
                    box-sizing: border-box !important;
                }
                .eum-search::placeholder {
                    color: rgba(255,255,255,0.5) !important;
                }
                .eum-product {
                    background: rgba(255,255,255,0.05) !important;
                    padding: 12px !important;
                    border-radius: 8px !important;
                    margin-bottom: 8px !important;
                }
                .eum-cart {
                    border-top: 1px solid rgba(255,255,255,0.1) !important;
                    padding: 16px !important;
                    background: rgba(0,0,0,0.2) !important;
                }
                .eum-btn {
                    width: 100% !important;
                    padding: 12px !important;
                    background: #3b82f6 !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 8px !important;
                    cursor: pointer !important;
                    font-weight: bold !important;
                }
                .eum-btn:hover {
                    background: #2563eb !important;
                }
            </style>
            <div class="eum-header">
                <div>
                    <div style="font-weight: bold;">Sales Agent Mode</div>
                    <div style="font-size: 12px; opacity: 0.8;">Cliente: \${session.client?.name || 'N/A'}</div>
                </div>
                <button onclick="document.getElementById('eum-sales-agent-widget').classList.remove('open')" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">×</button>
            </div>
            <div class="eum-content">
                <input type="text" class="eum-search" placeholder="Buscar productos..." id="eum-search-input">
                <div id="eum-products"></div>
            </div>
            <div class="eum-cart">
                <div style="margin-bottom: 12px; font-weight: bold;">Carrito: <span id="eum-cart-count">0</span> items</div>
                <div style="margin-bottom: 12px;">Total: $<span id="eum-cart-total">0.00</span></div>
                <button class="eum-btn" id="eum-checkout-btn">Generar Link de Pago</button>
            </div>
        \`;
        document.body.appendChild(widget);

        // Toggle widget on click
        toggle.onclick = function() {
            widget.classList.toggle('open');
            // Move toggle with panel
            if (widget.classList.contains('open')) {
                toggle.style.right = '400px';
            } else {
                toggle.style.right = '0';
            }
        };

        // Search functionality
        let searchTimeout;
        document.getElementById('eum-search-input').oninput = function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchProducts(e.target.value), 500);
        };

        console.log('[EUM Sales Agent] Widget initialized for:', session.client?.name);
    }

    // Search products
    async function searchProducts(query) {
        if (!query || query.length < 2) return;

        const token = getToken();
        if (!token) return;
        const res = await fetch(API_BASE + '/products?query=' + encodeURIComponent(query), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        const container = document.getElementById('eum-products');
        if (data.success && data.products) {
            container.innerHTML = data.products.map(p => \`
                <div class="eum-product">
                    <div style="font-weight: bold;">\${p.name}</div>
                    <div style="font-size: 12px; opacity: 0.7;">$\${p.price}</div>
                    <button onclick="window.eumAddToCart(\${p.variants[0]?.id || p.id}, '\${p.name}', \${p.price})" style="margin-top: 8px; padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Agregar</button>
                </div>
            \`).join('');
        }
    }

    // Cart management
    window.eumCart = [];
    window.eumAddToCart = function(variantId, name, price) {
        window.eumCart.push({ variantId, name, price, quantity: 1 });
        updateCartDisplay();
    };

    function updateCartDisplay() {
        document.getElementById('eum-cart-count').textContent = window.eumCart.length;
        const total = window.eumCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        document.getElementById('eum-cart-total').textContent = total.toFixed(2);
    }

    // Initialize
    checkSession().then(session => {
        if (session) {
            createWidget(session);
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
