import { Router } from 'express';
import {
    handleInstall,
    handleCallback,
    getSessionStatus,
    searchProductsWidget,
    createDraftOrderWidget,
    getWidgetScript,
    registerScriptTag
} from '../controllers/shopifyAppController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

/**
 * Shopify App OAuth Flow
 * These endpoints handle app installation and authentication
 */

// Step 1: Initiate OAuth - redirects to Shopify authorization
// GET /api/v1/shopify-app/install?shop=example.myshopify.com
router.get('/install', handleInstall);

// Step 2: OAuth callback - receives authorization code
// GET /api/v1/shopify-app/callback?code=xxx&shop=xxx&state=xxx
router.get('/callback', handleCallback);

/**
 * Widget Endpoints
 * Used by the storefront widget when Sales Agent is active
 * Note: These endpoints have CORS enabled for cross-origin requests from Shopify storefront
 */

// Check if current user has active impersonation session
// GET /api/v1/shopify-app/session
router.options('/session', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});
router.get('/session', requireAuth, getSessionStatus);

// Search products for widget (uses existing product search)
// GET /api/v1/shopify-app/products?query=xxx
router.options('/products', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});
router.get('/products', requireAuth, searchProductsWidget);

// Create draft order from widget
// POST /api/v1/shopify-app/draft-order
router.options('/draft-order', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});
router.post('/draft-order', requireAuth, createDraftOrderWidget);

/**
 * Widget Script
 * Served to Shopify storefront via Theme App Extension
 * Note: CORS enabled for cross-origin script loading
 */

// Get the widget JavaScript bundle
// GET /api/v1/shopify-app/widget.js
router.options('/widget.js', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
});
router.get('/widget.js', getWidgetScript);

// Register ScriptTag manually (admin only)
// POST /api/v1/shopify-app/register-script
router.post('/register-script', requireAuth, registerScriptTag);

export default router;
