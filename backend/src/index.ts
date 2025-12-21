import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
import coaRoutes from './routes/coaRoutes';
import uploadRoutes from './routes/uploadRoutes';
import cvvRoutes from './routes/cvvRoutes';
import enrichmentRoutes from './routes/enrichmentRoutes';
import badgeRoutes from './routes/badgeRoutes';
import pdfRoutes from './routes/pdfRoutes';
import bannerRoutes from './routes/bannerRoutes';
import settingsRoutes from './routes/settingsRoutes';
import templateRoutes from './routes/templateRoutes';
import authRoutes from './routes/authRoutes';
import clientRoutes from './routes/clientRoutes';
import folderRoutes from './routes/folderRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import chemistRoutes from './routes/chemistRoutes';
import collectionRoutes from './routes/collectionRoutes';
import reviewRoutes from './routes/reviewRoutes';
import pushRoutes from './routes/pushRoutes';
import webhookRoutes from './routes/webhookRoutes';
import navigationRoutes from './routes/navigationRoutes';
import auditRoutes from './routes/auditRoutes';
import orderRoutes from './routes/orderRoutes';
import aiRoutes from './routes/aiRoutes'; // AI Routes for generic classification
import knowledgeRoutes from './routes/knowledgeRoutes'; // NEW: Knowledge Base Management
import toolsRoutes from './routes/toolsRoutes'; // NEW: IDE Tools Editor
import crmRoutes from './routes/crmRoutes'; // NEW: Omnichannel CRM Core
import healthRoutes from './routes/healthRoutes'; // NEW: Vitality Health Check
import behaviorRoutes from './routes/behaviorRoutes'; // NEW: Behavioral Intelligence Tracking
import logsRoutes from './routes/logsRoutes'; // NEW: Telemetry Logs
import sitemapRoutes from './routes/sitemapRoutes'; // NEW: Dynamic Sitemap

import { initCronJobs } from './services/cronService';

const app = express();

// Trust proxy for correct IP detection behind nginx (standard for single-hop proxy)
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
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
app.use(cors({
    origin: ['https://coa.extractoseum.com', 'capacitor://localhost', 'http://localhost'],
    credentials: true
}));

const limiter = rateLimit({
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
app.use(express.json({
    limit: '50mb', // Increased to support large Knowledge Base files
    verify: (req: any, _res, buf) => {
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

// Create a specialized router just for the root-level sitemap or mount it under /api/v1
// The goal was /api/v1/sitemap.xml
// We can just use app.use here
app.use('/api/v1', sitemapRoutes);

app.use('/api/v1/coas', coaRoutes);
app.use('/api/v1/coas', enrichmentRoutes); // COA enrichment (images, docs, links)
app.use('/api/v1/coas', pdfRoutes); // PDF generation
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1', cvvRoutes); // CVV verification routes
app.use('/api/v1', badgeRoutes); // Badge management and assignment
app.use('/api/v1/banners', bannerRoutes); // Promotional banners management
app.use('/api/v1/settings', settingsRoutes); // Global settings (logo, company name)
app.use('/api/v1/templates', templateRoutes); // White-label PDF templates
app.use('/api/v1/auth', authRoutes); // Authentication routes
app.use('/api/v1/clients', clientRoutes); // Client management routes
app.use('/api/v1/folders', folderRoutes); // Client folder organization
app.use('/api/v1/analytics', analyticsRoutes); // Analytics and tracking
app.use('/api/v1/chemists', chemistRoutes); // Chemists/signers management
app.use('/api/v1/collection', collectionRoutes); // User COA collection
app.use('/api/v1/reviews', reviewRoutes); // Reviews and ratings
app.use('/api/v1/push', pushRoutes); // Push notifications
app.use('/api/v1/webhooks', webhookRoutes); // Shopify webhooks
app.use('/api/v1/navigation', navigationRoutes); // Dynamic navigation
app.use('/api/v1/orders', orderRoutes); // Order tracking and history
app.use('/api/v1/admin/audit', auditRoutes); // Cryptographic integrity audit
app.use('/api/v1/ai', aiRoutes); // AI Classification
app.use('/api/v1/admin/knowledge', knowledgeRoutes); // AI Knowledge Base API
app.use('/api/v1/crm', crmRoutes); // NEW: Omnichannel CRM Core
app.use('/api/v1/health', healthRoutes); // NEW: Vitality Health Check
app.use('/api/v1/tools', toolsRoutes); // NEW: IDE Tools Editor
app.use('/api/v1/behavior', behaviorRoutes); // NEW: Behavioral Intelligence Tracking

// Telemetry Logs Endpoint (Surgical Injection)
app.use('/api/v1/logs', logsRoutes); // Telemetry Logs

// Start Server
app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);

    // Initialize cron jobs after server starts
    initCronJobs();
});
