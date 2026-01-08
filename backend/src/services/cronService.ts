import cron from 'node-cron';
import { refreshTagsCache, getCacheAge, syncProductsToLocalDB } from './shopifyService';
import { updateAllActiveTrackings } from './trackingService';
import { AuditorService } from './AuditorService';
import { logger } from '../utils/Logger';
import {
    generateRestockPredictions,
    processRestockNotifications,
    aggregateDailySales,
    generateInventoryForecast
} from './oracleService';
import { processGhostbusting } from './ghostbusterService';

/**
 * Initialize all cron jobs
 * Called once when the server starts
 */
export const initCronJobs = () => {
    logger.info('[Cron] Initializing scheduled jobs...');

    // Refresh Shopify tags cache every day at 3:00 AM (server time)
    // Cron expression: minute hour day-of-month month day-of-week
    cron.schedule('0 3 * * *', async () => {
        console.log('[Cron] Starting daily Shopify tags refresh...');
        try {
            const tags = await refreshTagsCache();
            console.log(`[Cron] Shopify tags refresh complete: ${tags.length} tags cached`);
        } catch (error: any) {
            console.error('[Cron] Error refreshing Shopify tags:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    console.log('[Cron] Scheduled: Shopify tags refresh daily at 3:00 AM (Mexico City)');

    // Update tracking statuses every 4 hours
    cron.schedule('0 */4 * * *', async () => {
        console.log('[Cron] Starting tracking status updates...');
        try {
            await updateAllActiveTrackings();
            console.log('[Cron] Tracking status updates complete');
        } catch (error: any) {
            console.error('[Cron] Error updating tracking statuses:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    console.log('[Cron] Scheduled: Tracking status updates every 4 hours');

    // Sync Products to Local DB (Daily at 4:00 AM)
    // After DB sync, regenerate knowledge base files for AI agents
    cron.schedule('0 4 * * *', async () => {
        console.log('[Cron] Starting scheduled product sync...');
        try {
            const result = await syncProductsToLocalDB();
            console.log(`[Cron] Product sync success: ${result.count} products.`);

            // Generate Knowledge Base files for Ara
            console.log('[Cron] Generating product knowledge base...');
            const { syncProductsToKnowledge } = await import('./productKnowledgeService');
            const kbResult = await syncProductsToKnowledge();
            console.log(`[Cron] Knowledge base generated: ${kbResult.count} product files.`);
        } catch (error: any) {
            console.error('[Cron] Product sync failed:', error.message);
        }
    }, {
        timezone: "America/Mexico_City"
    });
    console.log('[Cron] Scheduled: Product DB sync + Knowledge Base daily at 4:00 AM (Mexico City)');

    // Process abandoned recoveries every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Checking for abandoned recoveries...');
        try {
            const { processAbandonedRecoveries } = await import('./recoveryService');
            await processAbandonedRecoveries();
        } catch (error: any) {
            console.error('[Cron] Error in abandoned recovery job:', error.message);
        }
    });

    // Run Auditor (Forensics) every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        const correlationId = logger.startTrace();
        logger.info('[Cron] Starting Auditor (Forensics) Job...', { correlation_id: correlationId });
        try {
            await AuditorService.getInstance().runAudit();
        } catch (error: any) {
            logger.error('[Cron] Auditor Job failed', error, { correlation_id: correlationId });
        }
    }, {
        timezone: 'America/Mexico_City'
    });

    logger.info('[Cron] Scheduled: Auditor (Forensics) every 6 hours');

    logger.info('[Cron] Scheduled: Abandoned recovery checks every 30 minutes');

    // ========================================================================
    // ORACLE - Predictive Restocking (Smart Option A)
    // ========================================================================

    // Aggregate daily sales at 1:00 AM (for yesterday's data)
    cron.schedule('0 1 * * *', async () => {
        console.log('[Cron] Starting Oracle daily sales aggregation...');
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const count = await aggregateDailySales(yesterday);
            console.log(`[Cron] Oracle sales aggregation complete: ${count} products processed`);
        } catch (error: any) {
            console.error('[Cron] Oracle sales aggregation failed:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });
    console.log('[Cron] Scheduled: Oracle sales aggregation daily at 1:00 AM');

    // Generate restock predictions at 5:00 AM (after product sync)
    cron.schedule('0 5 * * *', async () => {
        console.log('[Cron] Starting Oracle restock predictions...');
        try {
            const result = await generateRestockPredictions();
            console.log(`[Cron] Oracle predictions: ${result.created} created, ${result.updated} updated, ${result.errors} errors`);
        } catch (error: any) {
            console.error('[Cron] Oracle predictions failed:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });
    console.log('[Cron] Scheduled: Oracle restock predictions daily at 5:00 AM');

    // Process restock notifications at 9:00 AM (good time for customer messages)
    cron.schedule('0 9 * * *', async () => {
        console.log('[Cron] Starting Oracle restock notifications...');
        try {
            const result = await processRestockNotifications();
            console.log(`[Cron] Oracle notifications: ${result.processed} processed, ${result.notified} notified, ${result.errors} errors`);
        } catch (error: any) {
            console.error('[Cron] Oracle notifications failed:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });
    console.log('[Cron] Scheduled: Oracle restock notifications daily at 9:00 AM');

    // Generate inventory forecast weekly on Monday at 6:00 AM
    cron.schedule('0 6 * * 1', async () => {
        console.log('[Cron] Starting Oracle inventory forecast...');
        try {
            const result = await generateInventoryForecast();
            console.log(`[Cron] Oracle forecast: ${result.products} products, ${result.lowStockAlerts} low stock, ${result.stockoutRisks} stockout risks`);
        } catch (error: any) {
            console.error('[Cron] Oracle inventory forecast failed:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });
    console.log('[Cron] Scheduled: Oracle inventory forecast weekly on Mondays at 6:00 AM');

    // Ghostbuster Protocol daily at 10:00 AM
    cron.schedule('0 10 * * *', async () => {
        console.log('[Cron] Starting Ghostbuster Protocol...');
        try {
            const result = await processGhostbusting();
            console.log(`[Cron] Ghostbuster complete: ${result.ghosts_found} ghosts found, ${result.alerts_created} alerts created`);
        } catch (error: any) {
            console.error('[Cron] Ghostbuster failed:', error.message);
        }
    }, {
        timezone: 'America/Mexico_City'
    });
    console.log('[Cron] Scheduled: Ghostbuster Protocol daily at 10:00 AM');

    // Check if cache needs initial population (on server start)
    checkAndRefreshCacheIfNeeded();
};

/**
 * Check if cache is stale or empty and refresh if needed
 * Called on server startup
 */
const checkAndRefreshCacheIfNeeded = async () => {
    try {
        const cacheAge = await getCacheAge();

        // If cache is older than 24 hours or doesn't exist, refresh in background
        if (cacheAge === null || cacheAge > 24 * 60) {
            console.log('[Cron] Cache is stale or empty, starting background refresh...');

            // Run in background (don't await)
            refreshTagsCache()
                .then(tags => {
                    console.log(`[Cron] Background refresh complete: ${tags.length} tags cached`);
                })
                .catch(error => {
                    console.error('[Cron] Background refresh failed:', error.message);
                });
        } else {
            console.log(`[Cron] Cache is fresh (${cacheAge} minutes old), skipping refresh`);
        }
    } catch (error: any) {
        console.error('[Cron] Error checking cache:', error.message);
    }
};
