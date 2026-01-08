import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { notifyLoyaltyUpdate, notifyOrderCreated, notifyOrderShipped, updateOneSignalTags } from '../services/onesignalService';
import { getShopifyCustomerById, getShopifyOrderById } from '../services/shopifyService';
import { logWebhook, logClient } from '../services/loggerService';
import { CRMService } from '../services/CRMService';
import { BehaviorService } from '../services/behaviorService';

// Shopify webhook secret (optional, for HMAC verification)
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

/**
 * Verify Shopify webhook HMAC signature
 */
const verifyShopifyWebhook = (req: Request): boolean => {
    const topic = req.get('X-Shopify-Topic') || 'unknown';

    if (!SHOPIFY_WEBHOOK_SECRET) {
        console.error('[Webhook] FATAL: SHOPIFY_WEBHOOK_SECRET not configured. Rejecting webhook.');
        return false;
    }

    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) {
        console.error('[Webhook] Missing HMAC header');
        return false;
    }

    // Capture raw body from captured property in index.ts
    const rawBody = (req as any).rawBody;
    let calculatedHmac: string;
    let isVerified = false;

    if (!rawBody) {
        console.warn('[Webhook] WARNING: req.rawBody is missing. Verification might fail due to JSON parsing differences.');
        // Fallback to stringified body but log it as a risk
        const bodyToVerify = JSON.stringify(req.body);
        calculatedHmac = crypto
            .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
            .update(bodyToVerify, 'utf8')
            .digest('base64');

        const hmacBuffer = Buffer.from(hmacHeader || '');
        const calculatedBuffer = Buffer.from(calculatedHmac);

        if (hmacBuffer.length === calculatedBuffer.length) {
            isVerified = crypto.timingSafeEqual(hmacBuffer, calculatedBuffer);
        } else {
            isVerified = false;
        }
    } else {
        calculatedHmac = crypto
            .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('base64');

        const hmacBuffer = Buffer.from(hmacHeader || '');
        const calculatedBuffer = Buffer.from(calculatedHmac);

        if (hmacBuffer.length === calculatedBuffer.length) {
            isVerified = crypto.timingSafeEqual(hmacBuffer, calculatedBuffer);
        } else {
            isVerified = false;
        }
    }

    // --- UNIFIED LOGGING (Faro/Beacon) ---
    // Log verification status to system_logs so it's visible in the Beacon view
    supabase.from('system_logs').insert({
        category: 'webhook_verification',
        event_type: topic,
        severity: isVerified ? 'info' : 'error',
        payload: {
            verified: isVerified,
            topic,
            method: req.method,
            path: req.originalUrl,
            hmac_header: hmacHeader,
            // Don't log full body here to save space, but log enough to identify
            body_preview: JSON.stringify(req.body).substring(0, 200)
        }
    }).then(({ error }) => {
        if (error) console.error('[Webhook] Failed to log verification to DB:', error.message);
    });

    if (!isVerified) {
        console.error('[Webhook] HMAC verification failed for topic:', topic);
    }

    return isVerified;
};

/**
 * Handle Beacon Webhook (Public debugging)
 * POST /api/v1/webhooks/beacon
 */
export const handleBeacon = async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        const headers = req.headers;
        const topic = req.get('X-Shopify-Topic') || 'manual_beacon';

        console.log(`[Beacon] Received event: ${topic}`);

        await supabase.from('system_logs').insert({
            category: 'beacon',
            event_type: topic,
            severity: 'info',
            payload: {
                headers,
                body: payload
            }
        });

        res.status(200).json({ success: true, message: 'Beacon received and logged' });
    } catch (error: any) {
        console.error('[Beacon] Error logging:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Get recent Beacon logs (Public)
 * GET /api/v1/webhooks/beacon/recent
 */
export const getBeaconLogs = async (_req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('system_logs')
            .select('*')
            .in('category', ['beacon', 'webhook_verification', 'system'])
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json(data);
    } catch (error: any) {
        console.error('[Beacon] Error fetching logs:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Handle Shopify customer update webhook
 * POST /api/v1/webhooks/shopify/customer-update
 *
 * This is called by Shopify whenever a customer is updated (including tag changes)
 */
export const handleCustomerUpdate = async (req: Request, res: Response) => {
    try {
        // Verify webhook authenticity (optional but recommended)
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            console.error('[Webhook] Invalid HMAC signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const customer = req.body;

        if (!customer || !customer.id) {
            console.error('[Webhook] Invalid customer data');
            return res.status(400).json({ error: 'Invalid customer data' });
        }

        const shopifyId = customer.id?.toString();
        const email = customer.email;
        let rawTags = customer.tags || '';

        console.log(`[Webhook] Customer update received: ${email} (Shopify ID: ${shopifyId})`);
        console.log(`[Webhook] Object keys: ${Object.keys(customer).join(', ')}`);

        // Log raw webhook
        await logWebhook('shopify_customer_update_raw', customer);

        // --- SECURE FALLBACK: If tags are empty or missing, query Shopify API directly ---
        if (!rawTags) {
            console.log(`[Webhook] Tags empty in webhook. Querying Shopify Admin API for ${shopifyId}...`);
            const shopifyCustomer = await getShopifyCustomerById(shopifyId);
            if (shopifyCustomer && shopifyCustomer.tags) {
                rawTags = shopifyCustomer.tags;
                console.log(`[Webhook] Recovered tags from direct API call: "${rawTags}"`);
            } else {
                console.warn(`[Webhook] Shopify API also returned no tags for ${shopifyId}.`);
            }
        }

        const tags = rawTags.split(',').map((t: string) => t.trim()).filter(Boolean);
        const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || email?.split('@')[0];

        console.log(`[Webhook] Raw Tags: "${rawTags}"`);
        console.log(`[Webhook] Parsed tags: ${tags.join(', ')}`);

        // Find the client in our database
        let { data: existingClient, error: findError } = await supabase
            .from('clients')
            .select('id, email, tags, onesignal_player_id, shopify_customer_id')
            .eq('shopify_customer_id', shopifyId)
            .single();

        if (findError || !existingClient) {
            // Try to find by email
            const { data: clientByEmail } = await supabase
                .from('clients')
                .select('id, email, tags, onesignal_player_id, shopify_customer_id')
                .eq('email', email)
                .single();

            if (!clientByEmail) {
                console.log(`[Webhook] Client not found for Shopify ID ${shopifyId} or email ${email}`);
                return res.status(200).json({ success: true, message: 'Client not in system' });
            }
            existingClient = clientByEmail;
        }

        const oldTags = existingClient.tags || [];

        const phone = customer.phone || customer.default_address?.phone || null;

        // If even after API check we have zero tags, and the database already has tags, 
        // we might want to AVOID overwriting if we suspect Shopify is glitching.
        // But for now, we follow the source of truth (API check).

        // Update client in database
        const { error: updateError } = await supabase
            .from('clients')
            .update({
                shopify_customer_id: shopifyId,
                tags: tags.length > 0 ? tags : (oldTags.length > 0 ? oldTags : []), // Only clear if we are sure? 
                // Let's stick to tags if rawTags was explicitly fetched or confirmed empty
                phone: phone,
                name: name || existingClient.email.split('@')[0],
                updated_at: new Date().toISOString()
            })
            .eq('id', existingClient.id);

        if (updateError) {
            console.error('[Webhook] Error updating client:', updateError);
            await logClient('shopify_sync_error', { error: updateError.message, shopifyId }, existingClient.id);
            return res.status(500).json({ error: 'Database error' });
        }

        console.log(`[Webhook] Updated client ${existingClient.email}`);
        await logClient('shopify_sync_success', { email: existingClient.email, tags }, existingClient.id);

        // Update OneSignal tags if player ID exists
        if (existingClient.onesignal_player_id) {
            await updateOneSignalTags(existingClient.onesignal_player_id, tags);
        }

        // Check for membership status changes
        const addedTags = tags.filter((t: string) => !oldTags.includes(t));

        if (addedTags.length > 0) {
            console.log(`[Webhook] Tags added for ${existingClient.email}: ${addedTags.join(', ')}`);

            if (addedTags.includes('Club_partner_REV')) {
                await notifyLoyaltyUpdate(existingClient.id, 'Revision', 'review');
            } else if (addedTags.includes('Club_partner')) {
                await notifyLoyaltyUpdate(existingClient.id, 'Partner', 'active');
            } else if (addedTags.includes('Gold_member')) {
                await notifyLoyaltyUpdate(existingClient.id, 'Gold', 'escalated');
            } else if (addedTags.includes('Platino_member')) {
                await notifyLoyaltyUpdate(existingClient.id, 'Platinum', 'escalated');
            } else if (addedTags.includes('Black_member')) {
                await notifyLoyaltyUpdate(existingClient.id, 'Black', 'escalated');
            }
        }


        // Always return 200 to Shopify to acknowledge receipt
        res.status(200).json({ success: true, updated: true });

    } catch (error: any) {
        console.error('[Webhook] Error processing customer update:', error);
        // Still return 200 to avoid Shopify retrying
        res.status(200).json({ success: false, error: error.message });
    }
};


/**
 * Handle Shopify customer create webhook (optional)
 * POST /api/v1/webhooks/shopify/customer-create
 */
export const handleCustomerCreate = async (req: Request, res: Response) => {
    try {
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        // For now, just log and acknowledge
        // New customers will be created when they first log in via OAuth
        console.log('[Webhook] Customer create received:', req.body?.email);
        res.status(200).json({ success: true, message: 'Acknowledged' });
    } catch (error: any) {
        console.error('[Webhook] Error processing customer create:', error);
        res.status(200).json({ success: false });
    }
};

/**
 * Handle Shopify customer delete webhook (optional)
 * POST /api/v1/webhooks/shopify/customer-delete
 */
export const handleCustomerDelete = async (req: Request, res: Response) => {
    try {
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        const customer = req.body;
        const shopifyId = customer?.id?.toString();

        if (shopifyId) {
            // Optionally mark client as deleted or deactivate
            console.log(`[Webhook] Customer delete received for Shopify ID: ${shopifyId}`);

            // We don't delete the client, just log it
            // You could add soft delete logic here if needed
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[Webhook] Error processing customer delete:', error);
        res.status(200).json({ success: true });
    }
};

/**
 * Internal helper to find or create a client from Shopify data
 */
const getOrCreateClientInternal = async (shopifyCustomer: any, email: string) => {
    const shopifyId = shopifyCustomer?.id?.toString();
    const customerEmail = email || shopifyCustomer?.email;

    // 1. Try to find by Shopify ID
    let { data: client } = await supabase
        .from('clients')
        .select('id, email, name, phone')
        .eq('shopify_customer_id', shopifyId)
        .maybeSingle();

    if (!client && customerEmail) {
        // 2. Try to find by Email
        const { data: clientByEmail } = await supabase
            .from('clients')
            .select('id, email, name, phone')
            .eq('email', customerEmail)
            .maybeSingle();
        client = clientByEmail;
    }

    if (!client) {
        // 3. Create client on the fly
        console.log(`[Webhook] Auto-creating client for ${customerEmail} (B2B/New)`);
        const phone = shopifyCustomer?.phone || shopifyCustomer?.default_address?.phone || null;
        const name = [shopifyCustomer?.first_name, shopifyCustomer?.last_name].filter(Boolean).join(' ') ||
            customerEmail?.split('@')[0] || 'Cliente B2B';
        const rawTags = shopifyCustomer?.tags || '';
        const tags = rawTags.split(',').map((t: string) => t.trim()).filter(Boolean);

        const { data: newClient, error: createError } = await supabase
            .from('clients')
            .insert({
                email: customerEmail,
                shopify_customer_id: shopifyId,
                name: name,
                phone: phone,
                tags: tags,
                role: 'client'
            })
            .select('id, email, name, phone')
            .single();

        if (createError) {
            console.error('[Webhook] Error auto-creating client:', createError);
            return null;
        }
        return newClient;
    }

    return client;
};

/**
 * Internal helper to process Shopify orders from webhooks
 */
const processOrderInternal = async (order: any, eventType: 'create' | 'update') => {
    const shopifyOrderId = order.id?.toString();
    const orderNumber = order.name;
    const financialStatus = order.financial_status; // e.g., 'paid', 'pending'
    const email = order.email || order.customer?.email;

    console.log(`[Webhook] Order ${eventType} received: ${orderNumber} (Status: ${financialStatus})`);

    // Log raw webhook
    await logWebhook(`shopify_order_${eventType}_raw`, order);

    // Find or Create Client
    const client = await getOrCreateClientInternal(order.customer, email);

    if (client) {
        // Check if order already exists in our system
        const { data: existingOrder } = await supabase
            .from('orders')
            .select('id, status, fulfilled_notified, paid_notified')
            .eq('shopify_order_id', shopifyOrderId)
            .maybeSingle();

        // LOGIC:
        // 1. If order doesn't exist at all -> creation it.
        // 2. If it exists but was 'created' (unpaid) and now it's 'paid' -> update to paid and NOTIFY.
        // 3. We only notify when financialStatus is 'paid'.

        const isNew = !existingOrder;
        const currentStatusInDb = existingOrder?.status || 'none';

        // We only notify when financialStatus is 'paid'.
        const isNewlyPaid = existingOrder && (existingOrder.status === 'created') && financialStatus === 'paid';
        const shouldNotify = (isNew && financialStatus === 'paid') || isNewlyPaid;

        // Determine new status: 
        // 1. If it's already fulfilled, keep it fulfilled unless it's cancelled
        // 2. If financialStatus is paid, it's paid.
        // 3. Otherwise it's created.
        let newStatus = financialStatus === 'paid' ? 'paid' : 'created';
        if (currentStatusInDb === 'fulfilled' || currentStatusInDb === 'delivered') {
            newStatus = currentStatusInDb; // Preserve fulfillment status
        }
        if (order.cancelled_at) {
            newStatus = 'cancelled';
        }

        // Extract line_items for Oracle predictions
        const lineItems = Array.isArray(order.line_items)
            ? order.line_items.map((item: any) => ({
                product_id: item.product_id?.toString(),
                variant_id: item.variant_id?.toString(),
                title: item.title || item.name,
                quantity: item.quantity,
                price: item.price
            }))
            : [];

        const { data: savedOrder, error: orderError } = await supabase
            .from('orders')
            .upsert({
                client_id: client.id,
                shopify_order_id: shopifyOrderId,
                order_number: orderNumber,
                status: newStatus,
                total_amount: order.total_price,
                currency: order.currency,
                shopify_created_at: order.created_at,
                shopify_updated_at: order.updated_at,
                line_items: lineItems,
                customer_email: email,
                customer_phone: order.customer?.phone || order.customer?.default_address?.phone || null
            }, { onConflict: 'shopify_order_id' })
            .select()
            .single();

        if (!orderError) {
            await logWebhook(`shopify_order_${eventType}_linked`,
                { orderId: savedOrder.id, shopifyId: shopifyOrderId, orderNumber, financialStatus, currentStatus: newStatus, notified: shouldNotify },
                client.id
            );

            // --- RECOVERY LOGIC ---
            // If order is pending/authorized and doesn't have a recovery check date yet, set it for 1 hour from now
            if (financialStatus !== 'paid' && !order.cancelled_at && newStatus === 'created') {
                const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                await supabase
                    .from('orders')
                    .update({
                        recovery_status: 'pending',
                        recovery_next_check_at: oneHourLater,
                        abandoned_checkout_url: order.checkout_id ? `https://extractoseum.com/checkout/${order.token}` : null // Ideally from checkout_url
                    })
                    .eq('id', savedOrder.id)
                    .is('recovery_status', null);
            }

            // --- TRACKING FALLBACK ---
            // Extract tracking from order if fulfilled
            if (order.fulfillments && order.fulfillments.length > 0) {
                console.log(`[Webhook] Extracting ${order.fulfillments.length} fulfillments from order ${orderNumber}`);
                let hasFullTracking = false;
                const allTrackingNumbers: string[] = [];
                let mainCarrier = 'Estafeta';
                let mainServiceType = undefined;
                let mainEstimatedDelivery = undefined;

                for (const fulfillment of order.fulfillments) {
                    const carrier = fulfillment.tracking_company || 'Estafeta';
                    mainCarrier = carrier;
                    const trackingNumbers = fulfillment.tracking_numbers || (fulfillment.tracking_number ? [fulfillment.tracking_number] : []);
                    const trackingUrls = fulfillment.tracking_urls || (fulfillment.tracking_url ? [fulfillment.tracking_url] : []);
                    const shopifyFulfillmentId = fulfillment.id?.toString();

                    if (trackingNumbers.length > 0) {
                        hasFullTracking = true;

                        // Try to pull service type from fulfillment metadata if available
                        // Shopify fulfillments might have service codes in receipts or notes
                        if (fulfillment.service) mainServiceType = fulfillment.service;
                        if (fulfillment.tracking_company) mainCarrier = fulfillment.tracking_company;

                        for (let i = 0; i < trackingNumbers.length; i++) {
                            const trackingNumber = trackingNumbers[i];
                            const trackingUrl = trackingUrls[i] || trackingUrls[0] || null;
                            allTrackingNumbers.push(trackingNumber);

                            console.log(`[Webhook] Upserting tracking for order ${savedOrder.id}: ${trackingNumber}`);
                            const trackingData: any = {
                                order_id: savedOrder.id,
                                carrier: carrier,
                                tracking_number: trackingNumber,
                                tracking_url: trackingUrl,
                                current_status: 'in_transit', // Default since it was just fulfilled
                                updated_at: new Date().toISOString()
                            };

                            // Multi-tracking constraint might be missing, use manual update-or-insert
                            const { data: existingRows } = await supabase
                                .from('order_tracking')
                                .select('id')
                                .eq('order_id', savedOrder.id)
                                .eq('tracking_number', trackingNumber)
                                .limit(1);

                            let trackingError;
                            if (existingRows && existingRows.length > 0) {
                                const { error } = await supabase
                                    .from('order_tracking')
                                    .update(trackingData)
                                    .eq('id', existingRows[0].id);
                                trackingError = error;
                            } else {
                                const { error } = await supabase
                                    .from('order_tracking')
                                    .insert(trackingData);
                                trackingError = error;
                            }

                            if (trackingError) {
                                console.error(`[Webhook] ERROR upserting tracking for ${orderNumber}:`, trackingError);
                                await logWebhook('tracking_fallback_error', {
                                    orderId: savedOrder.id,
                                    orderNumber,
                                    trackingNumber,
                                    error: trackingError.message
                                }, client.id);
                            } else {
                                console.log(`[Webhook] Successfully saved tracking for ${orderNumber}: ${trackingNumber}`);
                            }
                        }
                    }
                }

                if (hasFullTracking) {
                    // Update order status if not already set
                    if (newStatus !== 'fulfilled' && newStatus !== 'delivered') {
                        await supabase.from('orders').update({ status: 'fulfilled' }).eq('id', savedOrder.id);
                        newStatus = 'fulfilled'; // Update local variable for next checks
                    }

                    // CRITICAL: Notify user if it's a new or updated fulfillment
                    // BUG FIX: Prevent duplicate notifications by checking and setting fulfilled_notified flag
                    if (!existingOrder?.fulfilled_notified) {
                        console.log(`[Webhook] Triggering SHIPPED notification via fallback for order ${orderNumber}`);

                        await notifyOrderShipped(
                            client.id,
                            orderNumber,
                            mainCarrier,
                            allTrackingNumbers,
                            client,
                            mainEstimatedDelivery,
                            mainServiceType
                        );

                        // Fix Ghost Data: Only mark as notified AFTER successful send
                        await supabase.from('orders').update({ fulfilled_notified: true }).eq('id', savedOrder.id);
                    } else {
                        console.log(`[Webhook] Shipped notification already sent for ${orderNumber}, skipping fallback.`);
                    }
                }
            }

            // Only send "Order Created" notification if:
            // 1. shouldNotify is true (new paid order OR newly paid existing order)
            // 2. NOT already notified (paid_notified flag)
            // 3. NOT already fulfilled (prevents "Order Received" after "Order Shipped")
            const alreadyFulfilled = order.fulfillments && order.fulfillments.length > 0 && order.fulfillments.some((f: any) => f.tracking_numbers?.length > 0 || f.tracking_number);
            const alreadyNotified = existingOrder?.paid_notified === true;

            if (shouldNotify && !alreadyNotified && !alreadyFulfilled) {
                console.log(`[Webhook] Triggering CREATED notification for order ${orderNumber} (Client: ${client.id})`);
                await notifyOrderCreated(client.id, orderNumber, client);

                // Mark as notified to prevent duplicates from simultaneous webhooks
                await supabase.from('orders').update({ paid_notified: true }).eq('id', savedOrder.id);
            } else {
                console.log(`[Webhook] Skipping CREATED notification for ${orderNumber} - shouldNotify: ${shouldNotify}, alreadyNotified: ${alreadyNotified}, alreadyFulfilled: ${alreadyFulfilled}`);
            }

            // --- Behavioral Engagement (Post-Purchase) ---
            BehaviorService.getInstance().analyzeAndReact({
                event_type: 'purchase_success',
                user_identifier: client.email,
                metadata: {
                    order_id: savedOrder.id,
                    amount: order.total_price,
                    items: order.line_items?.map((i: any) => i.name) || [],
                    customer_name: client.name
                }
            });
        }
        else {
            console.error('[Webhook] Error saving order:', orderError);
        }
    } else {
        console.log(`[Webhook] Client could not be found or created for order ${orderNumber} (${email})`);
    }
};

/**
 * Handle Shopify order create webhook
 * POST /api/v1/webhooks/shopify/order-create
 */
export const handleOrderCreate = async (req: Request, res: Response) => {
    try {
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        await processOrderInternal(req.body, 'create');
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Error processing order create:', error);
        res.status(200).json({ success: false });
    }
};

/**
 * Handle Shopify order updated webhook
 * POST /api/v1/webhooks/shopify/order-updated
 */
export const handleOrderUpdate = async (req: Request, res: Response) => {
    try {
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        await processOrderInternal(req.body, 'update');
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Error processing order update:', error);
        res.status(200).json({ success: false });
    }
};

/**
 * Handle Shopify fulfillment create/update webhook
 * POST /api/v1/webhooks/shopify/fulfillment-update
 */
export const handleFulfillmentUpdate = async (req: Request, res: Response) => {
    try {
        if (SHOPIFY_WEBHOOK_SECRET && !verifyShopifyWebhook(req)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const fulfillment = req.body;
        const shopifyOrderId = fulfillment.order_id?.toString();
        const shopifyFulfillmentId = fulfillment.id?.toString();
        const trackingNumbers = fulfillment.tracking_numbers || (fulfillment.tracking_number ? [fulfillment.tracking_number] : []);
        const trackingUrls = fulfillment.tracking_urls || (fulfillment.tracking_url ? [fulfillment.tracking_url] : []);
        const carrier = fulfillment.tracking_company || 'Estafeta';

        console.log(`[Webhook] Fulfillment updated for order ${shopifyOrderId}: ${trackingNumbers.join(', ')} (${carrier})`);

        // Log raw webhook
        await logWebhook('shopify_fulfillment_update_raw', fulfillment);

        if (trackingNumbers.length > 0) {
            // Find the order in our DB
            let { data: order } = await supabase
                .from('orders')
                .select('id, client_id, order_number, fulfilled_notified')
                .eq('shopify_order_id', shopifyOrderId)
                .maybeSingle();

            if (!order) {
                console.log(`[Webhook] Order ${shopifyOrderId} not found in DB. Fetching from Shopify...`);
                const shopifyOrder = await getShopifyOrderById(shopifyOrderId);
                if (shopifyOrder) {
                    const email = shopifyOrder.email || shopifyOrder.customer?.email;
                    const client = await getOrCreateClientInternal(shopifyOrder.customer, email);
                    if (client) {
                        // Extract line_items for Oracle predictions
                        const lineItems = Array.isArray(shopifyOrder.line_items)
                            ? shopifyOrder.line_items.map((item: any) => ({
                                product_id: item.product_id?.toString(),
                                variant_id: item.variant_id?.toString(),
                                title: item.title || item.name,
                                quantity: item.quantity,
                                price: item.price
                            }))
                            : [];

                        const { data: newOrder, error: orderError } = await supabase
                            .from('orders')
                            .upsert({
                                client_id: client.id,
                                shopify_order_id: shopifyOrderId,
                                order_number: shopifyOrder.name,
                                status: shopifyOrder.financial_status === 'paid' ? 'paid' : 'created',
                                total_amount: shopifyOrder.total_price,
                                currency: shopifyOrder.currency,
                                shopify_created_at: shopifyOrder.created_at,
                                shopify_updated_at: shopifyOrder.updated_at,
                                line_items: lineItems,
                                customer_email: email,
                                customer_phone: shopifyOrder.customer?.phone || shopifyOrder.customer?.default_address?.phone || null
                            }, { onConflict: 'shopify_order_id' })
                            .select('id, client_id, order_number, fulfilled_notified')
                            .single();

                        if (!orderError) {
                            order = newOrder;
                        }
                    }
                }
            }

            if (order) {
                // Update order status
                await supabase
                    .from('orders')
                    .update({ status: 'fulfilled', updated_at: new Date().toISOString() })
                    .eq('id', order.id);

                // Process each tracking number (could be multi-piece shipment)
                for (let i = 0; i < trackingNumbers.length; i++) {
                    const trackingNumber = trackingNumbers[i];
                    const trackingUrl = trackingUrls[i] || trackingUrls[0] || null;

                    const trackingData: any = {
                        order_id: order.id,
                        carrier: carrier,
                        tracking_number: trackingNumber,
                        tracking_url: trackingUrl,
                        current_status: 'in_transit',
                        updated_at: new Date().toISOString()
                    };

                    // Manual update-or-insert to avoid constraint issues
                    const { data: existingRows } = await supabase
                        .from('order_tracking')
                        .select('id')
                        .eq('order_id', order.id)
                        .eq('tracking_number', trackingNumber)
                        .limit(1);

                    let trackingError;
                    if (existingRows && existingRows.length > 0) {
                        const { error } = await supabase
                            .from('order_tracking')
                            .update(trackingData)
                            .eq('id', existingRows[0].id);
                        trackingError = error;
                    } else {
                        const { error } = await supabase
                            .from('order_tracking')
                            .insert(trackingData);
                        trackingError = error;
                    }

                    if (trackingError) {
                        console.error(`[Webhook] Error saving tracking ${trackingNumber}:`, trackingError);
                    }
                }

                // Notify user with all tracking numbers
                // BUG FIX: Only notify if not already notified
                if (!order.fulfilled_notified) {
                    console.log(`[Webhook] Triggering SHIPPED notification for order ${order.order_number}`);

                    // Try to get enriched data from the fulfillment webhook body
                    const serviceType = fulfillment.service || undefined;

                    await notifyOrderShipped(
                        order.client_id,
                        order.order_number,
                        carrier,
                        trackingNumbers,
                        undefined,
                        undefined,
                        serviceType
                    );

                    // Mark as notified AFTER successful notification
                    // Fixes "Ghost Data #4": Notification marked before sending
                    await supabase.from('orders').update({ fulfilled_notified: true }).eq('id', order.id);
                } else {
                    console.log(`[Webhook] Shipped notification already sent for ${order.order_number}, skipping fulfillment webhook notify.`);
                }
            }
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Error processing fulfillment update:', error);
        res.status(200).json({ success: false });
    }
};

/**
 * Handle checkout/create or checkout/update
 */
export const handleCheckoutUpdate = async (req: Request, res: Response) => {
    try {
        const checkout = req.body;
        const checkoutId = checkout.id?.toString();
        const email = checkout.email;
        const customer = checkout.customer;

        console.log(`[Webhook] Checkout updated: ${checkoutId} (${email})`);
        await logWebhook('shopify_checkout_update_raw', checkout);

        // Relaxed Condition: email OR customer (Phase 53 Fix)
        if (email || (customer && customer.id)) {
            const client = await getOrCreateClientInternal(customer, email);
            if (client) {
                // Save to abandoned_checkouts table
                const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();

                await supabase
                    .from('abandoned_checkouts')
                    .upsert({
                        shopify_checkout_id: checkoutId,
                        client_id: client.id,
                        email: email,
                        customer_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
                        checkout_url: checkout.abandoned_checkout_url,
                        total_price: checkout.total_price,
                        currency: checkout.currency,
                        recovery_status: 'pending',
                        recovery_next_check_at: oneHourLater,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'shopify_checkout_id' });

                // --- NEW: PROACTIVE ENRICHMENT (Phase 53) ---
                // 1. Force Sync Snapshot to get Name/Avatar immediately
                const phone = client.phone || customer.phone || customer.default_address?.phone;
                if (phone) {
                    console.log(`[Webhook] Proactively syncing snapshot for ${phone}...`);
                    // We assume WA channel for now as primary, or we could check if they have a conversation
                    try {
                        await CRMService.getInstance().syncContactSnapshot(phone, 'WA');
                    } catch (err) {
                        console.error('[Webhook] Failed to sync snapshot:', err);
                    }
                }

                // 2. Insert into Browsing Events for AI Context
                await supabase.from('browsing_events').insert({
                    event_type: 'checkout_abandoned',
                    handle: phone || email, // Prefer phone if available for AI matching
                    client_id: client.id,
                    url: checkout.abandoned_checkout_url,
                    metadata: {
                        value: checkout.total_price,
                        currency: checkout.currency,
                        items_count: checkout.line_items?.length || 0,
                        checkout_id: checkoutId
                    }
                });
            }
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Webhook] Error processing checkout update:', error);
        res.status(200).json({ success: false });
    }
};
