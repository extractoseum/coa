/**
 * Widget Routes - Ara Chat Widget API
 *
 * These endpoints power the floating Ara Chat Widget for customers.
 * Provides OTP authentication, AI chat, and notifications.
 *
 * Authentication Flow:
 * 1. POST /session - Create anonymous session
 * 2. POST /auth/send-otp - Send OTP to phone/email
 * 3. POST /auth/verify-otp - Verify OTP and link session to client
 * 4. All other endpoints require authenticated session
 *
 * @see COMMUNICATION_ARCHITECTURE.md for system overview
 */

import { Router } from 'express';
import {
    createSession,
    sendWidgetOTP,
    verifyWidgetOTP,
    linkWithAppAuth,
    getConversation,
    sendMessage,
    getMessages,
    getNotifications,
    markNotificationRead,
    getNotificationCount,
    getSessionStatus
} from '../controllers/widgetController';

const router = Router();

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Create anonymous widget session
 * Called when widget first loads
 */
router.post('/session', createSession);

/**
 * Get current session status
 * Returns auth state and client info if authenticated
 */
router.get('/session', getSessionStatus);

// ============================================
// AUTHENTICATION (OTP-based)
// ============================================

/**
 * Send OTP to phone or email
 * Requires valid widget session token
 */
router.post('/auth/send-otp', sendWidgetOTP);

/**
 * Verify OTP code
 * Links session to client account on success
 */
router.post('/auth/verify-otp', verifyWidgetOTP);

/**
 * Link widget session with existing app authentication
 * If user is already logged into the app (has valid JWT), skip OTP
 */
router.post('/auth/link', linkWithAppAuth);

// ============================================
// CONVERSATION & MESSAGING
// ============================================

/**
 * Get or create conversation for authenticated user
 * Returns existing WIDGET conversation or creates new one
 */
router.get('/conversation', getConversation);

/**
 * Send message to Ara (AI assistant)
 * Requires authenticated session
 * Returns AI response and stores in CRM
 */
router.post('/message', sendMessage);

/**
 * Get message history (paginated)
 * Query params: ?limit=50&before=<messageId>
 */
router.get('/messages', getMessages);

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Get notifications for authenticated user
 * Query params: ?limit=20&unread_only=true
 */
router.get('/notifications', getNotifications);

/**
 * Get unread notification count (for badge)
 */
router.get('/notifications/count', getNotificationCount);

/**
 * Mark notification as read
 */
router.patch('/notifications/:id/read', markNotificationRead);

export default router;
