"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("./config/env");
const coaRoutes_1 = __importDefault(require("./routes/coaRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const cvvRoutes_1 = __importDefault(require("./routes/cvvRoutes"));
const enrichmentRoutes_1 = __importDefault(require("./routes/enrichmentRoutes"));
const badgeRoutes_1 = __importDefault(require("./routes/badgeRoutes"));
const pdfRoutes_1 = __importDefault(require("./routes/pdfRoutes"));
const bannerRoutes_1 = __importDefault(require("./routes/bannerRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const templateRoutes_1 = __importDefault(require("./routes/templateRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const clientRoutes_1 = __importDefault(require("./routes/clientRoutes"));
const folderRoutes_1 = __importDefault(require("./routes/folderRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const chemistRoutes_1 = __importDefault(require("./routes/chemistRoutes"));
const collectionRoutes_1 = __importDefault(require("./routes/collectionRoutes"));
const reviewRoutes_1 = __importDefault(require("./routes/reviewRoutes"));
const pushRoutes_1 = __importDefault(require("./routes/pushRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const navigationRoutes_1 = __importDefault(require("./routes/navigationRoutes"));
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const aiRoutes_1 = __importDefault(require("./routes/aiRoutes")); // AI Routes for generic classification
const knowledgeRoutes_1 = __importDefault(require("./routes/knowledgeRoutes")); // NEW: Knowledge Base Management
const toolsRoutes_1 = __importDefault(require("./routes/toolsRoutes")); // NEW: IDE Tools Editor
const crmRoutes_1 = __importDefault(require("./routes/crmRoutes")); // NEW: Omnichannel CRM Core
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes")); // NEW: Vitality Health Check
const cronService_1 = require("./services/cronService");
const app = (0, express_1.default)();
// Trust proxy for correct IP detection behind nginx (standard for single-hop proxy)
app.set('trust proxy', 1);
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.onesignal.com", "https://onesignal.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "https://vbnpcospodhwuzvxejui.supabase.co"],
            connectSrc: ["'self'", "https://vbnpcospodhwuzvxejui.supabase.co", "https://onesignal.com", "http://ip-api.com"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: ['https://coa.extractoseum.com', 'capacitor://localhost', 'http://localhost'],
    credentials: true
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Increased to 2000 to allow high-volume webhook traffic (Whapi)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        error: 'Demasiadas solicitudes, por favor intenta más tarde.'
    }
});
// Apply rate limiting to all requests
app.use(limiter);
// IMPORTANT: Do not move or modify this without checking Shopify webhook verification.
// The 'verify' callback is MANDATORY to capture the raw body for HMAC signature validation.
// Shopify sends a hash of the RAW bytes; if Express parses it before we check the hash,
// the digital signature will fail due to subtle JSON formatting differences.
app.use(express_1.default.json({
    limit: '50mb', // Increased to support large Knowledge Base files
    verify: (req, _res, buf) => {
        // Only capture rawBody for Shopify webhooks to save memory
        if (req.originalUrl.includes('/webhooks/shopify')) {
            req.rawBody = buf;
        }
    }
}));
// Routes
app.get('/', (req, res) => {
    res.send('🌿 EUM v2.0 Backend is Running');
});
app.use('/api/v1/coas', coaRoutes_1.default);
app.use('/api/v1/coas', enrichmentRoutes_1.default); // COA enrichment (images, docs, links)
app.use('/api/v1/coas', pdfRoutes_1.default); // PDF generation
app.use('/api/v1/upload', uploadRoutes_1.default);
app.use('/api/v1', cvvRoutes_1.default); // CVV verification routes
app.use('/api/v1', badgeRoutes_1.default); // Badge management and assignment
app.use('/api/v1/banners', bannerRoutes_1.default); // Promotional banners management
app.use('/api/v1/settings', settingsRoutes_1.default); // Global settings (logo, company name)
app.use('/api/v1/templates', templateRoutes_1.default); // White-label PDF templates
app.use('/api/v1/auth', authRoutes_1.default); // Authentication routes
app.use('/api/v1/clients', clientRoutes_1.default); // Client management routes
app.use('/api/v1/folders', folderRoutes_1.default); // Client folder organization
app.use('/api/v1/analytics', analyticsRoutes_1.default); // Analytics and tracking
app.use('/api/v1/chemists', chemistRoutes_1.default); // Chemists/signers management
app.use('/api/v1/collection', collectionRoutes_1.default); // User COA collection
app.use('/api/v1/reviews', reviewRoutes_1.default); // Reviews and ratings
app.use('/api/v1/push', pushRoutes_1.default); // Push notifications
app.use('/api/v1/webhooks', webhookRoutes_1.default); // Shopify webhooks
app.use('/api/v1/navigation', navigationRoutes_1.default); // Dynamic navigation
app.use('/api/v1/orders', orderRoutes_1.default); // Order tracking and history
app.use('/api/v1/admin/audit', auditRoutes_1.default); // Cryptographic integrity audit
app.use('/api/v1/ai', aiRoutes_1.default); // AI Classification
app.use('/api/v1/admin/knowledge', knowledgeRoutes_1.default); // AI Knowledge Base API
app.use('/api/v1/crm', crmRoutes_1.default); // NEW: Omnichannel CRM Core
app.use('/api/v1/health', healthRoutes_1.default); // NEW: Vitality Health Check
app.use('/api/v1/tools', toolsRoutes_1.default); // NEW: IDE Tools Editor
// Start Server
app.listen(env_1.config.port, () => {
    console.log(`🚀 Server running on http://localhost:${env_1.config.port}`);
    // Initialize cron jobs after server starts
    (0, cronService_1.initCronJobs)();
});
