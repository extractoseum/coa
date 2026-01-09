import { Router } from 'express';
import {
    handleInstall,
    handleCallback,
    getSessionStatus,
    searchProductsWidget,
    createDraftOrderWidget,
    getWidgetScript
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
 */

// Check if current user has active impersonation session
// GET /api/v1/shopify-app/session
router.get('/session', requireAuth, getSessionStatus);

// Search products for widget (uses existing product search)
// GET /api/v1/shopify-app/products?query=xxx
router.get('/products', requireAuth, searchProductsWidget);

// Create draft order from widget
// POST /api/v1/shopify-app/draft-order
router.post('/draft-order', requireAuth, createDraftOrderWidget);

/**
 * Widget Script
 * Served to Shopify storefront via Theme App Extension
 */

// Get the widget JavaScript bundle
// GET /api/v1/shopify-app/widget.js
router.get('/widget.js', getWidgetScript);

export default router;
