import cron from 'node-cron';
import { refreshTagsCache, getCacheAge, syncProductsToLocalDB } from './shopifyService';
import { updateAllActiveTrackings } from './trackingService';
import { AuditorService } from './AuditorService';
import { logger } from '../utils/Logger';

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
