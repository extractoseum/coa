/**
 * Centralized Route Definitions
 * This is the SINGLE SOURCE OF TRUTH for all application routes.
 * 
 * Usage:
 * import { ROUTES, to } from './routes';
 * navigate(to.coa('123'));
 */

export const ROUTES = {
    // Public
    home: '/',
    login: '/login',
    shopifyCallback: '/auth/shopify/callback',
    coaDetails: '/coa/:token',
    coaDetailsApp: '/apps/coa/:token',
    coaPreview: '/preview/:token',
    qrPreview: '/preview/qr/:qr_token',
    verifyCVV: '/verify/:cvv',
    verifyMember: '/verify-member/:memberId',
    publicFolder: '/folder/:token',

    // User
    dashboard: '/dashboard',
    myOrders: '/my-orders',
    myOrdersLegacy: '/orders', // Kept for backward compatibility
    myCollection: '/my-collection',
    folders: '/folders',

    // Admin
    upload: '/upload',
    inventory: '/inventory',
    badges: '/badges',
    banners: '/banners',
    settings: '/settings',
    templates: '/templates',
    chemists: '/chemists',
    adminCoas: '/admin/coas',
    adminPush: '/admin/push',
    adminNavigation: '/admin/navigation',
    adminKnowledge: '/admin/knowledge',
    adminCrm: '/admin/crm',
    adminTelemetry: '/admin/telemetry',
} as const;

// Helper functions to generate dynamic routes safely
export const to = {
    coa: (token: string) => `/coa/${encodeURIComponent(token)}`,
    coaApp: (token: string) => `/apps/coa/${encodeURIComponent(token)}`,
    preview: (token: string) => `/preview/${encodeURIComponent(token)}`,
    qrPreview: (qrToken: string) => `/preview/qr/${encodeURIComponent(qrToken)}`,
    verifyCVV: (cvv: string) => `/verify/${encodeURIComponent(cvv)}`,
    verifyMember: (memberId: string) => `/verify-member/${encodeURIComponent(memberId)}`,
    publicFolder: (token: string) => `/folder/${encodeURIComponent(token)}`,
} as const;
