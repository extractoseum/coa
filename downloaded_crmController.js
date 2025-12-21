"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCoupon = exports.getClientOrders = exports.getContactSnapshot = exports.deleteConversation = exports.archiveConversation = exports.sendMessage = exports.getMessages = exports.createConversation = exports.updateColumnConfig = exports.handleInbound = exports.moveConversation = exports.getConversations = exports.getColumns = exports.getOrderDetails = void 0;
const CRMService_1 = require("../services/CRMService");
const shopifyService_1 = require("../services/shopifyService");
const crmService = CRMService_1.CRMService.getInstance();
const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        console.log(`[CRM] Fetching details for Shopify Order ID: ${orderId}`);
        // Use ShopifyService directly to get fresh data
        const order = await (0, shopifyService_1.getShopifyOrderById)(orderId);
        if (!order) {
            res.status(404).json({ success: false, error: 'Order not found in Shopify' });
            return;
        }
        res.json({ success: true, data: order });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getOrderDetails = getOrderDetails;
const getColumns = async (req, res) => {
    try {
        const columns = await crmService.getColumns();
        res.json({ success: true, data: columns });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getColumns = getColumns;
const getConversations = async (req, res) => {
    try {
        const conversations = await crmService.getConversations();
        res.json({ success: true, data: conversations });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getConversations = getConversations;
const moveConversation = async (req, res) => {
    try {
        const { conversationId, targetColumnId } = req.body;
        if (!conversationId || !targetColumnId) {
            res.status(400).json({ success: false, error: 'Missing conversationId or targetColumnId' });
            return;
        }
        await crmService.moveConversation(conversationId, targetColumnId);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.moveConversation = moveConversation;
const handleInbound = async (req, res) => {
    try {
        const payload = req.body;
        console.log('[CRM] Webhook received:', JSON.stringify(payload).substring(0, 500));
        // 1. Check if it's a Whapi.cloud payload (arrays of messages)
        if (payload.messages && Array.isArray(payload.messages)) {
            for (const msg of payload.messages) {
                const handle = msg.chat_id || msg.from;
                // Explicitly cast to boolean and log for debugging loop issues
                const fromMe = !!msg.from_me;
                console.log(`[CRM] Msg fromMe raw: ${msg.from_me} (${typeof msg.from_me}) -> Casted: ${fromMe}. Type: ${msg.type}`);
                // Extract content based on type
                let content = '';
                let type = 'text';
                if (msg.type === 'text') {
                    content = msg.text?.body || '';
                }
                else if (msg.type === 'image') {
                    const url = msg.image?.link || msg.image?.url || '';
                    const caption = msg.image?.caption || '';
                    console.log(`[CRM] Image detected. URL: ${url}, Caption: ${caption}`);
                    content = url ? `[Image](${url}) ${caption}` : `[Foto] ${caption}`;
                    type = 'image';
                }
                else if (msg.type === 'sticker') {
                    const url = msg.sticker?.link || msg.sticker?.url || '';
                    console.log(`[CRM] Sticker detected. URL: ${url}`);
                    content = url ? `[Sticker](${url})` : '[Sticker]';
                    type = 'image';
                }
                else if (msg.type === 'audio' || msg.type === 'voice') {
                    const url = msg.audio?.link || msg.audio?.url || msg.voice?.link || msg.voice?.url || '';
                    console.log(`[CRM] Audio detected. URL: ${url}`);
                    content = url ? `[Audio](${url})` : '[Audio]';
                    type = 'audio';
                }
                else if (msg.type === 'video') {
                    const url = msg.video?.link || msg.video?.url || '';
                    const caption = msg.video?.caption || '';
                    console.log(`[CRM] Video detected. URL: ${url}`);
                    content = url ? `[Video](${url}) ${caption}` : `[Video] ${caption}`;
                    type = 'video';
                }
                else if (msg.type === 'document' || msg.type === 'file') {
                    const url = msg.document?.link || msg.document?.url || msg.file?.link || msg.file?.url || '';
                    const caption = msg.document?.caption || msg.document?.filename || '';
                    console.log(`[CRM] Document detected. URL: ${url}`);
                    content = url ? `[File](${url}) ${caption}` : `[Archivo] ${caption}`;
                    type = 'file';
                }
                else {
                    console.log(`[CRM] Unknown type detected: ${msg.type}`);
                    content = `[Archivo: ${msg.type}]`;
                    type = 'file';
                }
                // Skip if empty (status updates etc)
                if (!content && !msg.type)
                    continue;
                let cleanHandle = handle.replace('@s.whatsapp.net', '').replace('@c.us', '');
                // Fix for Mexico WhatsApp numbers (521 + 10 digits -> 52 + 10 digits)
                // If it starts with 521 and has 13 digits total, remove the '1'
                if (cleanHandle.startsWith('521') && cleanHandle.length === 13) {
                    cleanHandle = cleanHandle.replace('521', '52');
                }
                // Fire and forget - Do NOT await to prevent timeout
                crmService.processInbound('WA', cleanHandle, content, {
                    ...msg,
                    // Ensure type matches our enum: 'text' | 'image' | 'video' | 'audio' | 'file' | 'template' | 'event'
                    type: type,
                    // FORCE override direction/role based on our local strict check
                    direction: fromMe ? 'outbound' : 'inbound',
                    role: fromMe ? 'assistant' : 'user',
                    // Add explicit flag for service to check
                    _generated_from_me: fromMe
                }).catch(err => console.error('[CRM] Background processInbound Error:', err));
            }
            res.json({ success: true, processed: payload.messages.length });
            return;
        }
        // 2. Fallback to legacy/manual format
        const { channel, handle, content, raw } = req.body;
        if (!channel || !handle || !content) {
            res.status(400).json({ success: false, error: 'Missing required fields' });
            return;
        }
        await crmService.processInbound(channel, handle, content, raw || {});
        res.json({ success: true });
    }
    catch (error) {
        console.error('[CRM] handleInbound Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.handleInbound = handleInbound;
const updateColumnConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const { mode, config } = req.body;
        if (!id || !mode) {
            res.status(400).json({ success: false, error: 'Missing column id or mode' });
            return;
        }
        await crmService.updateColumnConfig(id, mode, config);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.updateColumnConfig = updateColumnConfig;
const createConversation = async (req, res) => {
    try {
        const { channel, handle, column_id } = req.body;
        if (!channel || !handle) {
            res.status(400).json({ success: false, error: 'Missing channel or handle' });
            return;
        }
        const conversation = await crmService.createConversation({ channel, handle, column_id });
        res.json({ success: true, data: conversation });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.createConversation = createConversation;
const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await crmService.getMessages(conversationId);
        res.json({ success: true, data: messages });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getMessages = getMessages;
const sendMessage = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content, role } = req.body;
        const message = await crmService.appendMessage({
            conversation_id: conversationId,
            direction: 'outbound',
            role: role || 'assistant',
            message_type: 'text',
            status: 'sent',
            content
        });
        res.json({ success: true, data: message });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.sendMessage = sendMessage;
const archiveConversation = async (req, res) => {
    try {
        const { id } = req.params;
        await crmService.archiveConversation(id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.archiveConversation = archiveConversation;
const deleteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        await crmService.deleteConversation(id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteConversation = deleteConversation;
const getContactSnapshot = async (req, res) => {
    try {
        const { handle } = req.params;
        const { channel } = req.query;
        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }
        const snapshot = await crmService.getContactSnapshot(handle, String(channel || 'WA'));
        res.json({ success: true, data: snapshot });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getContactSnapshot = getContactSnapshot;
const getClientOrders = async (req, res) => {
    try {
        const { handle } = req.params;
        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }
        const orders = await crmService.getClientOrders(handle);
        res.json({ success: true, data: orders });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getClientOrders = getClientOrders;
const createCoupon = async (req, res) => {
    try {
        const { discount, code } = req.body;
        if (!discount || !code) {
            res.status(400).json({ success: false, error: 'Missing discount or code' });
            return;
        }
        const isPercentage = discount.includes('%');
        // Shopify value logic: percentages are like '-15.0', fixed are '-10.0'
        let value = discount.replace('%', '');
        if (!value.startsWith('-'))
            value = `-${value}`;
        const valueType = isPercentage ? 'percentage' : 'fixed_amount';
        console.log(`[CRM] Creating Shopify Coupon: ${code} (${discount})`);
        // 1. Create Price Rule
        const priceRule = await (0, shopifyService_1.createShopifyPriceRule)({
            title: `CRM_AUTO_${code}_${Date.now()}`,
            target_type: 'line_item',
            target_selection: 'all',
            allocation_method: 'across',
            value_type: valueType,
            value: value,
            customer_selection: 'all',
            starts_at: new Date().toISOString()
        });
        // 2. Create Discount Code
        const discountCode = await (0, shopifyService_1.createShopifyDiscountCode)(priceRule.id, code);
        res.json({ success: true, data: discountCode });
    }
    catch (error) {
        console.error('[CRM] Coupon creation error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.createCoupon = createCoupon;
