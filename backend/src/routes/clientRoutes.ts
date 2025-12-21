import { Router } from 'express';
import {
    getAllClients,
    getClientById,
    getShopifyClientsList,
    searchShopifyClients,
    importFromShopify,
    createClient,
    updateClient,
    deleteClient,
    assignCOAToClient,
    getClientCOAs,
    getHologramPurchaseUrl,
    checkShopifyStatus,
    setDefaultTemplate,
    getAllClientsWithTemplates,
    syncClientToShopify,
    syncAllClientsToShopify,
    testShopifyMetafields,
    getVIPCredential,
    uploadCredentialPhoto,
    updateMembershipTier,
    getMembershipTiers,
    createMembershipTier,
    updateMembershipTierConfig,
    deleteMembershipTier,
    verifyMember
} from '../controllers/clientController';
import { requireAuth, requireSuperAdmin, requireStepUp } from '../middleware/authMiddleware';

const router = Router();

// Public routes (no auth required)
router.get('/verify-member/:memberId', verifyMember);

// All routes below require authentication
router.use(requireAuth);

// Client can access their own COAs
router.get('/my-coas', getClientCOAs);
router.get('/hologram-url', getHologramPurchaseUrl);

// VIP Credential routes (authenticated users)
router.get('/me/vip-credential', getVIPCredential);
router.post('/me/credential-photo', uploadCredentialPhoto);

// Super admin only routes
router.get('/', requireSuperAdmin, getAllClients);

// Membership tiers management (super_admin only)
router.get('/membership-tiers', requireSuperAdmin, getMembershipTiers);
router.post('/membership-tiers', requireSuperAdmin, createMembershipTier);
router.put('/membership-tiers/:tierId', requireSuperAdmin, updateMembershipTierConfig);
router.delete('/membership-tiers/:tierId', requireSuperAdmin, deleteMembershipTier);
router.get('/with-templates', requireSuperAdmin, getAllClientsWithTemplates); // Get all clients with template info
router.get('/shopify/status', requireSuperAdmin, checkShopifyStatus);
router.get('/shopify', requireSuperAdmin, getShopifyClientsList);
router.get('/shopify/search', requireSuperAdmin, searchShopifyClients);
router.post('/shopify/import/:shopifyId', requireSuperAdmin, importFromShopify);
router.post('/', requireSuperAdmin, requireStepUp(5), createClient);
router.get('/:id', requireSuperAdmin, getClientById);
router.put('/:id', requireSuperAdmin, requireStepUp(10), updateClient);
router.put('/:id/default-template', requireSuperAdmin, setDefaultTemplate); // Set default template for client
router.post('/:id/sync-shopify', requireSuperAdmin, syncClientToShopify); // Sync single client COAs to Shopify metafields
router.delete('/:id', requireSuperAdmin, requireStepUp(5), deleteClient);
router.get('/:clientId/coas', requireSuperAdmin, getClientCOAs);
router.post('/assign-coa/:coaId', requireSuperAdmin, assignCOAToClient);
router.post('/shopify/sync-all', requireSuperAdmin, syncAllClientsToShopify); // Sync ALL clients to Shopify metafields
router.get('/shopify/test-metafields/:shopifyCustomerId', requireSuperAdmin, testShopifyMetafields); // TEST: Get metafields
router.put('/:id/membership', requireSuperAdmin, updateMembershipTier); // Update membership tier

export default router;
