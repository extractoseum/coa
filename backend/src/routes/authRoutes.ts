import { Router } from 'express';
import {
    login,
    logout,
    refreshToken,
    me,
    registerClient,
    changePassword,
    initiateShopifyOAuth,
    handleShopifyCallback,
    quickRegister,
    sendOTP,
    verifyOTP,
    debugDBChecks
} from '../controllers/authController';
import { requireAuth, requireSuperAdmin, requireStepUp } from '../middleware/authMiddleware';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/quick-register', quickRegister); // Quick registration with email/phone

// Debug
router.get('/debug-db', debugDBChecks);

// Shopify OAuth routes (requires proper OAuth setup)
router.get('/shopify', initiateShopifyOAuth);           // Initiate OAuth flow
router.post('/shopify/callback', handleShopifyCallback); // Secure OTP Login
router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP); // NEW: Seamless lookup login
// NOTE: loginWithShopifyEmail was removed for security - it allowed login without password verification

// Protected routes
router.get('/me', requireAuth, me);
router.post('/change-password', requireAuth, requireStepUp(10), changePassword);

// Super admin only
router.post('/register', requireAuth, requireSuperAdmin, requireStepUp(5), registerClient);

export default router;
