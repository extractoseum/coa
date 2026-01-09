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
    // This serves the Sales Agent widget that gets injected into Shopify storefront
    const widgetScript = `
(function() {
    'use strict';

    const API_BASE = '${APP_URL}/api/v1/shopify-app';
    const COA_DOMAIN = '${APP_URL}';

    // Get token from URL parameter or localStorage
    function getToken() {
        // First check URL parameter (from "Abrir Tienda" button)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('eum_token');
        if (urlToken) {
            // Store it for future page navigations
            localStorage.setItem('eum_sales_agent_token', urlToken);
            // Clean up URL (remove token from visible URL)
            const cleanUrl = window.location.href.split('?')[0];
            const otherParams = new URLSearchParams(window.location.search);
            otherParams.delete('eum_token');
            const newUrl = otherParams.toString() ? cleanUrl + '?' + otherParams.toString() : cleanUrl;
            window.history.replaceState({}, '', newUrl);
            return urlToken;
        }
        // Fallback to localStorage
        return localStorage.getItem('eum_sales_agent_token');
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
        const widget = document.createElement('div');
        widget.id = 'eum-sales-agent-widget';
        widget.innerHTML = \`
            <style>
                #eum-sales-agent-widget {
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 400px;
                    height: 100vh;
                    background: #1a1a2e;
                    color: white;
                    box-shadow: -4px 0 20px rgba(0,0,0,0.3);
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    flex-direction: column;
                    transform: translateX(100%);
                    transition: transform 0.3s ease;
                }
                #eum-sales-agent-widget.open {
                    transform: translateX(0);
                }
                #eum-sales-agent-toggle {
                    position: fixed;
                    top: 50%;
                    right: 0;
                    transform: translateY(-50%);
                    background: linear-gradient(135deg, #dc2626, #ea580c);
                    color: white;
                    padding: 12px 8px;
                    border-radius: 8px 0 0 8px;
                    cursor: pointer;
                    z-index: 999998;
                    writing-mode: vertical-rl;
                    font-weight: bold;
                    font-size: 12px;
                }
                .eum-header {
                    background: linear-gradient(135deg, #dc2626, #ea580c);
                    padding: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .eum-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                }
                .eum-search {
                    width: 100%;
                    padding: 12px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    color: white;
                    margin-bottom: 16px;
                }
                .eum-product {
                    background: rgba(255,255,255,0.05);
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 8px;
                }
                .eum-cart {
                    border-top: 1px solid rgba(255,255,255,0.1);
                    padding: 16px;
                    background: rgba(0,0,0,0.2);
                }
                .eum-btn {
                    width: 100%;
                    padding: 12px;
                    background: #3b82f6;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .eum-btn:hover {
                    background: #2563eb;
                }
            </style>
            <div id="eum-sales-agent-toggle">Sales Agent</div>
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

        // Toggle widget
        document.getElementById('eum-sales-agent-toggle').onclick = function() {
            widget.classList.toggle('open');
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

        const token = localStorage.getItem('eum_sales_agent_token');
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
            localStorage.setItem('eum_sales_agent_token', event.data.token);
            checkSession().then(session => {
                if (session && !document.getElementById('eum-sales-agent-widget')) {
                    createWidget(session);
                }
            });
        }
    });
})();
`;

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(widgetScript);
};
