import { Router } from 'express';
import {
    handleCustomerUpdate,
    handleCustomerCreate,
    handleCustomerDelete,
    handleOrderCreate,
    handleOrderUpdate,
    handleCheckoutUpdate,
    handleFulfillmentUpdate,
    handleBeacon,
    getBeaconLogs,
    handleTwilioSmsInbound
} from '../controllers/webhookController';

const router = Router();

/**
 * Shopify Webhooks
 * These endpoints receive webhooks from Shopify when customer data changes
 *
 * Configure in Shopify Admin:
 * Settings -> Notifications -> Webhooks -> Create webhook
 *
 * Events to subscribe:
 * - Customer update: POST /api/v1/webhooks/shopify/customer-update
 * - Customer create: POST /api/v1/webhooks/shopify/customer-create (optional)
 * - Customer delete: POST /api/v1/webhooks/shopify/customer-delete (optional)
 */

// Customer update - syncs tags from Shopify to our system and OneSignal
router.post('/shopify/customer-update', handleCustomerUpdate);

// Customer create (optional - we create clients on first OAuth login)
router.post('/shopify/customer-create', handleCustomerCreate);

// Customer delete (optional - for compliance/logging)
router.post('/shopify/customer-delete', handleCustomerDelete);

// Order creation - notifies user and registers order for tracking
router.post('/shopify/order-create', handleOrderCreate);

// Order update - handles payment status changes
router.post('/shopify/order-updated', handleOrderUpdate);

// Checkout webhooks for recovery
router.post('/shopify/checkout-create', handleCheckoutUpdate);
router.post('/shopify/checkout-update', handleCheckoutUpdate);

// Fulfillment update - registers tracking number and notifies user
router.post('/shopify/fulfillment-update', handleFulfillmentUpdate);

// Beacon - public debugging
router.post('/beacon', handleBeacon);
router.get('/beacon/recent', getBeaconLogs);

/**
 * Twilio SMS Inbound Webhook
 * Configure in Twilio Console: Phone Number -> Messaging -> Webhook URL
 * URL: https://coa.extractoseum.com/api/v1/webhooks/twilio/sms
 */
router.post('/twilio/sms', handleTwilioSmsInbound);

export default router;
