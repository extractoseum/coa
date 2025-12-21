import axios from 'axios';
import { supabase } from '../config/supabase';

// Shopify API configuration from environment variables
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN || '';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

// Base URL for Shopify Admin API
const getBaseUrl = () => {
    if (!SHOPIFY_STORE_DOMAIN) {
        throw new Error('SHOPIFY_STORE_DOMAIN no configurado');
    }
    return `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;
};

// Axios instance for Shopify API with timeout
const shopifyApi = axios.create({
    timeout: 30000, // 30 seconds timeout
    headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    }
});

// ============ REFRESH PROGRESS STATE ============
export interface RefreshProgress {
    isRefreshing: boolean;
    currentPage: number;
    estimatedTotalPages: number;
    customersProcessed: number;
    tagsFound: number;
    startedAt: string | null;
    error: string | null;
}

let refreshProgress: RefreshProgress = {
    isRefreshing: false,
    currentPage: 0,
    estimatedTotalPages: 0,
    customersProcessed: 0,
    tagsFound: 0,
    startedAt: null,
    error: null
};

export const getRefreshProgress = (): RefreshProgress => refreshProgress;

const resetProgress = () => {
    refreshProgress = {
        isRefreshing: false,
        currentPage: 0,
        estimatedTotalPages: 0,
        customersProcessed: 0,
        tagsFound: 0,
        startedAt: null,
        error: null
    };
};

const updateProgress = (updates: Partial<RefreshProgress>) => {
    refreshProgress = { ...refreshProgress, ...updates };
};

// Customer interface matching Shopify's response
export interface ShopifyCustomer {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    verified_email: boolean;
    accepts_marketing: boolean;
    orders_count: number;
    total_spent: string;
    note: string | null;
    state: string;
    tags: string;
    created_at: string;
    updated_at: string;
    default_address?: {
        company: string | null;
        address1: string;
        address2: string | null;
        city: string;
        province: string;
        country: string;
        zip: string;
    };
}

// Check if Shopify is configured
export const isShopifyConfigured = (): boolean => {
    return !!(SHOPIFY_STORE_DOMAIN && SHOPIFY_ACCESS_TOKEN);
};

// Get all customers from Shopify
export const getShopifyCustomers = async (limit: number = 50): Promise<ShopifyCustomer[]> => {
    if (!isShopifyConfigured()) {
        console.log('Shopify not configured, returning empty array');
        return [];
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers.json`, {
            params: { limit }
        });

        return response.data.customers || [];
    } catch (error: any) {
        console.error('Error fetching Shopify customers:', error.response?.data || error.message);
        throw new Error(`Error al obtener clientes de Shopify: ${error.message}`);
    }
};

// Get customer by ID
export const getShopifyCustomerById = async (customerId: string | number): Promise<ShopifyCustomer | null> => {
    if (!isShopifyConfigured()) {
        return null;
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers/${customerId}.json`);
        return response.data.customer || null;
    } catch (error: any) {
        console.error('Error fetching Shopify customer:', error.response?.data || error.message);
        return null;
    }
};

// Search customers by email or name
export const searchShopifyCustomers = async (query: string): Promise<ShopifyCustomer[]> => {
    if (!isShopifyConfigured()) {
        return [];
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers/search.json`, {
            params: { query }
        });

        return response.data.customers || [];
    } catch (error: any) {
        console.error('Error searching Shopify customers:', error.response?.data || error.message);
        throw new Error(`Error al buscar clientes: ${error.message}`);
    }
};

// Get customer by email
export const getShopifyCustomerByEmail = async (email: string): Promise<ShopifyCustomer | null> => {
    if (!isShopifyConfigured()) {
        return null;
    }

    try {
        const customers = await searchShopifyCustomers(`email:${email}`);
        return customers.length > 0 ? customers[0] : null;
    } catch (error: any) {
        console.error('Error finding customer by email:', error);
        return null;
    }
};

// Get paginated customers
export const getShopifyCustomersPaginated = async (
    cursor?: string,
    limit: number = 50
): Promise<{ customers: ShopifyCustomer[]; nextCursor: string | null }> => {
    if (!isShopifyConfigured()) {
        return { customers: [], nextCursor: null };
    }

    try {
        const params: any = { limit };
        if (cursor) {
            params.page_info = cursor;
        }

        const response = await shopifyApi.get(`${getBaseUrl()}/customers.json`, { params });

        // Extract next cursor from Link header
        let nextCursor: string | null = null;
        const linkHeader = response.headers.link;
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<[^>]*page_info=([^>&]*)[^>]*>;\s*rel="next"/);
            if (nextMatch) {
                nextCursor = nextMatch[1];
            }
        }

        return {
            customers: response.data.customers || [],
            nextCursor
        };
    } catch (error: any) {
        console.error('Error fetching paginated customers:', error.response?.data || error.message);
        throw new Error(`Error al obtener clientes: ${error.message}`);
    }
};

// Get customer orders
export const getShopifyCustomerOrders = async (customerId: string | number): Promise<any[]> => {
    if (!isShopifyConfigured()) {
        return [];
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers/${customerId}/orders.json`);
        return response.data.orders || [];
    } catch (error: any) {
        console.error('Error fetching customer orders:', error.response?.data || error.message);
        return [];
    }
};

// Get order by id
export const getShopifyOrderById = async (orderId: string | number): Promise<any | null> => {
    if (!isShopifyConfigured()) {
        return null;
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/orders/${orderId}.json`);
        return response.data.order;
    } catch (error: any) {
        console.error(`[shopifyService] Error fetching order ${orderId}:`, error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data));
        }
        return null;
    }
};

/**
 * Creates a Draft Order in Shopify and returns the invoice URL
 */
export const createShopifyDraftOrder = async (items: Array<{ variantId: string | number, quantity: number }>): Promise<string | null> => {
    if (!isShopifyConfigured()) {
        throw new Error('Shopify not configured');
    }

    try {
        console.log('[ShopifyService] Creating Draft Order for items:', items);

        const payload = {
            draft_order: {
                line_items: items.map(item => ({
                    variant_id: item.variantId,
                    quantity: item.quantity
                }))
            }
        };

        const response = await shopifyApi.post(`${getBaseUrl()}/draft_orders.json`, payload);
        const draftOrder = response.data.draft_order;

        if (draftOrder && draftOrder.invoice_url) {
            console.log('[ShopifyService] Draft Order created:', draftOrder.id, draftOrder.invoice_url);
            return draftOrder.invoice_url;
        }

        return null;
    } catch (error: any) {
        console.error('[ShopifyService] Error creating Draft Order:', error.response?.data || error.message);
        throw new Error(`Error creates checkout: ${error.message}`);
    }
};

/**
 * Syncs all products from Shopify to local DB
 */
export const syncProductsToLocalDB = async (): Promise<any> => {
    if (!isShopifyConfigured()) {
        throw new Error('Shopify not configured');
    }

    console.log('[ShopifyService] Starting product sync...');
    let url = `${getBaseUrl()}/products.json?limit=250`; // Max limit
    let totalSynced = 0;

    try {
        while (url) {
            console.log(`[ShopifyService] Fetching page: ${url}`);
            const response = await shopifyApi.get(url);
            const products = response.data.products;

            if (!products || products.length === 0) break;

            // Prepare batch upsert
            const upsertData = products.map((p: any) => ({
                id: p.id,
                title: p.title,
                handle: p.handle,
                product_type: p.product_type,
                vendor: p.vendor,
                tags: p.tags ? p.tags.split(',').map((t: string) => t.trim()) : [],
                status: p.status,
                variants: p.variants.map((v: any) => ({
                    id: v.id,
                    title: v.title,
                    price: v.price,
                    sku: v.sku,
                    inventory_quantity: v.inventory_quantity
                })),
                images: p.images.map((i: any) => ({
                    id: i.id,
                    src: i.src,
                    alt: i.alt
                })),
                updated_at: p.updated_at,
                synced_at: new Date().toISOString()
            }));

            const { error } = await supabase
                .from('products')
                .upsert(upsertData);

            if (error) {
                console.error('[ShopifyService] Error upserting batch:', error);
                throw error;
            }

            totalSynced += products.length;

            // Pagination (Link header)
            // Shopify uses Link header for pagination: <url>; rel="next"
            const linkHeader = response.headers['link'];
            if (linkHeader && linkHeader.includes('rel="next"')) {
                const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
                url = match ? match[1] : null;
            } else {
                url = ''; // No more pages
            }
        }

        console.log(`[ShopifyService] Sync complete. Total products: ${totalSynced}`);
        return { success: true, count: totalSynced };

    } catch (error: any) {
        console.error('[ShopifyService] Product sync failed:', error.message);
        throw error;
    }
};

/**
 * Search products in local DB for AI
 */
export const searchLocalProducts = async (query: string): Promise<any[]> => {
    // 1. Try Full Text Search on Title
    let { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('title', `%${query}%`)
        .eq('status', 'active')
        .limit(10);

    if (error) throw error;

    // 2. If few results, try searching tags
    if (!data || data.length < 3) {
        const { data: tagData, error: tagError } = await supabase
            .from('products')
            .select('*')
            .contains('tags', [query]) // Exact tag match? Or use text search on array?
            // PostgreSQL array searching is tricky with simple postgrest filters.
            // Let's rely on Title search for now + or ilike logic on client side filtering if needed.
            // A better query syntax for 'or':
            // .or(`title.ilike.%${query}%,tags.cs.{${query}}`) (cs = contains)
            // But tags is text[], so we can format the query.
            .eq('status', 'active')
            .limit(10);

        if (!tagError && tagData) {
            // Merge results, removing duplicates
            const existingIds = new Set(data?.map(p => p.id));
            tagData.forEach(p => {
                if (!existingIds.has(p.id)) {
                    data?.push(p);
                }
            });
        }
    }

    // Format for AI (minimal tokens)
    return data?.map(p => ({
        id: p.id,
        name: p.title,
        price: p.variants?.[0]?.price || 'N/A',
        stock: p.variants?.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0) > 0 ? 'In Stock' : 'Out of Stock',
        tags: p.tags?.slice(0, 5), // Limit tags
        link: `https://${SHOPIFY_STORE_DOMAIN}/products/${p.handle}`,
        variants: p.variants?.map((v: any) => ({
            id: v.id,
            title: v.title,
            price: v.price
        }))
    })) || [];
};

export const HOLOGRAM_PURCHASE_URL = 'https://extractoseum.com/collections/analisis-coa';

// COA metafield namespace and key
const COA_METAFIELD_NAMESPACE = 'coa_system';
const COA_METAFIELD_KEY = 'assigned_coas';
const COA_DASHBOARD_KEY = 'dashboard_url';

// Base URL for COA viewer (frontend)
const COA_VIEWER_BASE_URL = process.env.COA_VIEWER_URL || 'https://coa.extractoseum.com';

// Interface for COA data to store in metafield
interface COAMetafieldData {
    token: string;
    title: string;
    name?: string;        // custom_name - Nombre del COA (ej: "Extracto RSO")
    coa_number?: string;  // Número de COA (ej: "EUM_11DE8480_COA")
    sku?: string;
    batch?: string;
    status: string;
    url: string;
}

// Update customer metafields with COA list
export const updateCustomerCOAMetafields = async (
    shopifyCustomerId: string | number,
    coas: Array<{
        public_token: string;
        custom_title?: string;
        custom_name?: string;
        coa_number?: string;
        product_sku?: string;
        batch_id?: string;
        compliance_status: string;
    }>
): Promise<boolean> => {
    if (!isShopifyConfigured()) {
        console.log('[Shopify Metafield] Shopify not configured, skipping');
        return false;
    }

    try {
        // Format COA data for metafield
        const coaList: COAMetafieldData[] = coas.map(coa => ({
            token: coa.public_token,
            title: coa.custom_title || coa.product_sku || coa.public_token,
            name: coa.custom_name,          // Nombre del COA (ej: "Extracto RSO")
            coa_number: coa.coa_number,     // Número de COA (ej: "EUM_11DE8480_COA")
            sku: coa.product_sku,
            batch: coa.batch_id,
            status: coa.compliance_status,
            url: `${COA_VIEWER_BASE_URL}/coa/${coa.public_token}`
        }));

        // Create dashboard URL
        const dashboardUrl = `${COA_VIEWER_BASE_URL}/dashboard`;

        // Update metafields using REST API
        const metafieldsPayload = {
            customer: {
                id: shopifyCustomerId,
                metafields: [
                    {
                        namespace: COA_METAFIELD_NAMESPACE,
                        key: COA_METAFIELD_KEY,
                        value: JSON.stringify(coaList),
                        type: 'json'
                    },
                    {
                        namespace: COA_METAFIELD_NAMESPACE,
                        key: COA_DASHBOARD_KEY,
                        value: dashboardUrl,
                        type: 'single_line_text_field'
                    },
                    {
                        namespace: COA_METAFIELD_NAMESPACE,
                        key: 'coa_count',
                        value: coas.length.toString(),
                        type: 'number_integer'
                    }
                ]
            }
        };

        const response = await shopifyApi.put(
            `${getBaseUrl()}/customers/${shopifyCustomerId}.json`,
            metafieldsPayload
        );

        console.log(`[Shopify Metafield] Updated customer ${shopifyCustomerId} with ${coas.length} COAs`);
        return true;
    } catch (error: any) {
        console.error('[Shopify Metafield] Error updating customer metafields:', error.response?.data || error.message);
        return false;
    }
};

// Get customer metafields
export const getCustomerMetafields = async (shopifyCustomerId: string | number): Promise<any[]> => {
    if (!isShopifyConfigured()) {
        return [];
    }

    try {
        const response = await shopifyApi.get(
            `${getBaseUrl()}/customers/${shopifyCustomerId}/metafields.json`
        );
        return response.data.metafields || [];
    } catch (error: any) {
        console.error('[Shopify Metafield] Error getting metafields:', error.response?.data || error.message);
        return [];
    }
};

// Get customer with full details including tags
export const getCustomerWithTags = async (shopifyCustomerId: string | number): Promise<ShopifyCustomer | null> => {
    if (!isShopifyConfigured()) {
        return null;
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers/${shopifyCustomerId}.json`);
        return response.data.customer || null;
    } catch (error: any) {
        console.error('[Shopify Customer] Error getting customer:', error.response?.data || error.message);
        return null;
    }
};

// Check if customer has specific tag (exact match)
export const customerHasTag = async (shopifyCustomerId: string | number, tag: string): Promise<boolean> => {
    const customer = await getCustomerWithTags(shopifyCustomerId);
    if (!customer || !customer.tags) return false;

    const tagsArray = customer.tags.split(',').map(t => t.trim().toLowerCase());
    return tagsArray.includes(tag.toLowerCase());
};

// Get all customer tags as array
export const getCustomerTags = async (shopifyCustomerId: string | number): Promise<string[]> => {
    const customer = await getCustomerWithTags(shopifyCustomerId);
    if (!customer || !customer.tags) return [];

    return customer.tags.split(',').map(t => t.trim());
};

// Sync all COAs for a client to Shopify metafields
export const syncClientCOAsToShopify = async (
    shopifyCustomerId: string | number,
    clientId: string,
    supabase: any
): Promise<boolean> => {
    if (!isShopifyConfigured() || !shopifyCustomerId) {
        return false;
    }

    try {
        // Get all COAs for this client (including custom_name, coa_number, and metadata for overrides)
        const { data: coas, error } = await supabase
            .from('coas')
            .select('public_token, custom_title, custom_name, coa_number, product_sku, batch_id, compliance_status, metadata')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Shopify Sync] Error fetching COAs:', error);
            return false;
        }

        // Map COAs with custom_name, coa_number, and batch_number override
        const mappedCoas = (coas || []).map((coa: any) => ({
            ...coa,
            // Use metadata.batch_number if set, otherwise fallback to batch_id
            batch_id: coa.metadata?.batch_number || coa.batch_id,
            // Include custom_name and coa_number for Shopify metafields
            custom_name: coa.custom_name,
            coa_number: coa.coa_number
        }));

        // Update Shopify metafields
        return await updateCustomerCOAMetafields(shopifyCustomerId, mappedCoas);
    } catch (error) {
        console.error('[Shopify Sync] Error syncing COAs to Shopify:', error);
        return false;
    }
};

// Interface for tag with count
export interface TagWithCount {
    tag: string;
    count: number;
}

// Helper function to delay execution (for rate limiting)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to fetch with retry on rate limit
const fetchWithRetry = async (url: string, maxRetries: number = 3): Promise<any> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await shopifyApi.get(url);
        } catch (error: any) {
            const isRateLimit = error.response?.status === 429 ||
                error.response?.data?.errors?.includes('Exceeded');

            if (isRateLimit && attempt < maxRetries) {
                const waitTime = attempt * 2000; // 2s, 4s, 6s
                console.log(`[Shopify Tags] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
                await delay(waitTime);
            } else {
                throw error;
            }
        }
    }
};

// Get total customer count from Shopify
export const getCustomerCount = async (): Promise<number> => {
    if (!isShopifyConfigured()) {
        return 0;
    }

    try {
        const response = await shopifyApi.get(`${getBaseUrl()}/customers/count.json`);
        return response.data.count || 0;
    } catch (error: any) {
        console.error('[Shopify] Error getting customer count:', error.message);
        return 0;
    }
};

// Get all unique customer tags from Shopify with customer count
// Uses since_id pagination which is more reliable than cursor-based pagination
export const getAllCustomerTagsWithCount = async (): Promise<TagWithCount[]> => {
    if (!isShopifyConfigured()) {
        console.log('[Shopify Tags] Shopify not configured');
        return [];
    }

    // Check if already refreshing
    if (refreshProgress.isRefreshing) {
        console.log('[Shopify Tags] Refresh already in progress');
        throw new Error('Refresh already in progress');
    }

    try {
        // Get total customer count first
        const totalCustomers = await getCustomerCount();
        const estimatedPages = Math.ceil(totalCustomers / 250);
        console.log(`[Shopify Tags] Total customers in Shopify: ${totalCustomers}, estimated pages: ${estimatedPages}`);

        // Initialize progress
        updateProgress({
            isRefreshing: true,
            currentPage: 0,
            estimatedTotalPages: estimatedPages,
            customersProcessed: 0,
            tagsFound: 0,
            startedAt: new Date().toISOString(),
            error: null
        });

        const tagCounts = new Map<string, number>();
        let sinceId = 0;
        let hasMore = true;
        let pageCount = 0;
        let totalFetched = 0;

        console.log('[Shopify Tags] Starting to fetch all customers using since_id pagination...');

        // Paginate using since_id (more reliable than cursor)
        while (hasMore) {
            pageCount++;

            // Build URL with since_id for pagination
            // Only request id and tags fields to minimize data transfer
            const url = `${getBaseUrl()}/customers.json?limit=250&fields=id,tags&since_id=${sinceId}`;

            console.log(`[Shopify Tags] Fetching page ${pageCount} (since_id=${sinceId})...`);
            const response: any = await fetchWithRetry(url);
            const customers = response.data.customers || [];

            if (customers.length === 0) {
                console.log('[Shopify Tags] No more customers');
                hasMore = false;
                break;
            }

            totalFetched += customers.length;

            // Process customers and extract tags
            for (const customer of customers) {
                if (customer.tags) {
                    const tags = customer.tags.split(',').map((t: string) => t.trim());
                    tags.forEach((tag: string) => {
                        if (tag) {
                            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                        }
                    });
                }
            }

            // Update since_id for next page (use the last customer's ID)
            const lastCustomer = customers[customers.length - 1];
            sinceId = lastCustomer.id;

            console.log(`[Shopify Tags] Page ${pageCount}: ${customers.length} fetched, total: ${totalFetched}, tags: ${tagCounts.size}`);

            // Update progress
            updateProgress({
                currentPage: pageCount,
                customersProcessed: totalFetched,
                tagsFound: tagCounts.size
            });

            // If we got less than 250 customers, we've reached the end
            if (customers.length < 250) {
                console.log(`[Shopify Tags] Last page reached (${customers.length} < 250)`);
                hasMore = false;
                break;
            }

            // Rate limit: wait 500ms between requests
            await delay(500);

            // Safety: stop if we've processed way more than expected
            if (totalFetched > totalCustomers + 1000) {
                console.error('[Shopify Tags] Safety limit reached, stopping');
                hasMore = false;
            }
        }

        // Convert map to array and sort by count (most popular first)
        const tagsWithCount: TagWithCount[] = Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);

        console.log(`[Shopify Tags] Done! ${pageCount} pages, ${totalFetched} customers, ${tagsWithCount.length} unique tags`);

        // Reset progress on success
        resetProgress();

        return tagsWithCount;
    } catch (error: any) {
        console.error('[Shopify Tags] Error getting all tags:', error.response?.data || error.message);
        updateProgress({
            isRefreshing: false,
            error: error.message
        });
        throw error;
    }
};

// Get all unique customer tags from Shopify (simple list)
export const getAllCustomerTags = async (): Promise<string[]> => {
    const tagsWithCount = await getAllCustomerTagsWithCount();
    return tagsWithCount.map(t => t.tag);
};

// ============ CACHE FUNCTIONS FOR SHOPIFY TAGS ============

// Cache singleton ID
const TAGS_CACHE_ID = '00000000-0000-0000-0000-000000000001';

// Get tags from cache (fast)
export const getCachedTags = async (): Promise<TagWithCount[]> => {
    try {
        const { data, error } = await supabase
            .from('shopify_tags_cache')
            .select('tags, updated_at')
            .eq('id', TAGS_CACHE_ID)
            .single();

        if (error || !data) {
            console.log('[Shopify Tags] No cache found');
            return [];
        }

        console.log(`[Shopify Tags] Cache hit, ${(data.tags as TagWithCount[]).length} tags, updated: ${data.updated_at}`);
        return data.tags as TagWithCount[];
    } catch (error: any) {
        console.error('[Shopify Tags] Error reading cache:', error.message);
        return [];
    }
};

// Refresh tags cache from Shopify (slow - runs in background)
export const refreshTagsCache = async (): Promise<TagWithCount[]> => {
    console.log('[Shopify Tags] Refreshing cache from Shopify...');

    try {
        const tags = await getAllCustomerTagsWithCount();

        // Upsert cache
        const { error } = await supabase
            .from('shopify_tags_cache')
            .upsert({
                id: TAGS_CACHE_ID,
                tags: tags,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error('[Shopify Tags] Error saving cache:', error.message);
        } else {
            console.log(`[Shopify Tags] Cache updated with ${tags.length} tags`);
        }

        return tags;
    } catch (error: any) {
        console.error('[Shopify Tags] Error refreshing cache:', error.message);
        throw error;
    }
};

// Get cache age in minutes
export const getCacheAge = async (): Promise<number | null> => {
    try {
        const { data } = await supabase
            .from('shopify_tags_cache')
            .select('updated_at')
            .eq('id', TAGS_CACHE_ID)
            .single();

        if (!data?.updated_at) return null;

        const updatedAt = new Date(data.updated_at);
        const now = new Date();
        return Math.floor((now.getTime() - updatedAt.getTime()) / 60000);
    } catch {
        return null;
    }
};

// ============ CUSTOMER BACKUP FUNCTIONS ============

// Interface for customer backup data
interface CustomerBackupData {
    shopify_id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    tags: string | null;
    accepts_marketing: boolean;
    orders_count: number;
    total_spent: number;
    state: string | null;
    verified_email: boolean;
    note: string | null;
    address_company: string | null;
    address_address1: string | null;
    address_address2: string | null;
    address_city: string | null;
    address_province: string | null;
    address_country: string | null;
    address_zip: string | null;
    shopify_created_at: string | null;
    shopify_updated_at: string | null;
    synced_at: string;
}

// Transform Shopify customer to backup format
const transformCustomerForBackup = (customer: ShopifyCustomer): CustomerBackupData => {
    const address = customer.default_address;
    return {
        shopify_id: customer.id,
        email: customer.email || null,
        first_name: customer.first_name || null,
        last_name: customer.last_name || null,
        phone: customer.phone || null,
        tags: customer.tags || null,
        accepts_marketing: customer.accepts_marketing || false,
        orders_count: customer.orders_count || 0,
        total_spent: parseFloat(customer.total_spent) || 0,
        state: customer.state || null,
        verified_email: customer.verified_email || false,
        note: customer.note || null,
        address_company: address?.company || null,
        address_address1: address?.address1 || null,
        address_address2: address?.address2 || null,
        address_city: address?.city || null,
        address_province: address?.province || null,
        address_country: address?.country || null,
        address_zip: address?.zip || null,
        shopify_created_at: customer.created_at || null,
        shopify_updated_at: customer.updated_at || null,
        synced_at: new Date().toISOString()
    };
};

// Backup customers to database (upsert batch)
const backupCustomersBatch = async (customers: ShopifyCustomer[]): Promise<number> => {
    if (customers.length === 0) return 0;

    try {
        const backupData = customers.map(transformCustomerForBackup);

        const { error } = await supabase
            .from('shopify_customers_backup')
            .upsert(backupData, {
                onConflict: 'shopify_id',
                ignoreDuplicates: false
            });

        if (error) {
            // If table doesn't exist, log and continue (don't fail the tag refresh)
            if (error.code === 'PGRST205' || error.message.includes('does not exist')) {
                console.log('[Shopify Backup] Table not found, skipping backup');
                return 0;
            }
            console.error('[Shopify Backup] Error upserting batch:', error.message);
            return 0;
        }

        return customers.length;
    } catch (error: any) {
        console.error('[Shopify Backup] Error in batch backup:', error.message);
        return 0;
    }
};

// Full sync: Get all customers and backup them
export const syncAllCustomersToBackup = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    if (!isShopifyConfigured()) {
        return { success: false, count: 0, error: 'Shopify not configured' };
    }

    console.log('[Shopify Backup] Starting full customer sync...');

    try {
        const totalCustomers = await getCustomerCount();
        console.log(`[Shopify Backup] Total customers to sync: ${totalCustomers}`);

        let sinceId = 0;
        let hasMore = true;
        let totalSynced = 0;
        let pageCount = 0;

        while (hasMore) {
            pageCount++;

            // Fetch full customer data (no fields filter for backup)
            const url = `${getBaseUrl()}/customers.json?limit=250&since_id=${sinceId}`;
            const response = await fetchWithRetry(url);
            const customers: ShopifyCustomer[] = response.data.customers || [];

            if (customers.length === 0) {
                hasMore = false;
                break;
            }

            // Backup this batch
            const backed = await backupCustomersBatch(customers);
            totalSynced += backed;

            // Update since_id for next page
            const lastCustomer = customers[customers.length - 1];
            sinceId = lastCustomer.id;

            console.log(`[Shopify Backup] Page ${pageCount}: ${customers.length} fetched, ${totalSynced} synced`);

            if (customers.length < 250) {
                hasMore = false;
                break;
            }

            // Rate limit
            await delay(500);
        }

        console.log(`[Shopify Backup] Sync complete! ${totalSynced} customers backed up`);
        return { success: true, count: totalSynced };

    } catch (error: any) {
        console.error('[Shopify Backup] Sync failed:', error.message);
        return { success: false, count: 0, error: error.message };
    }
};

// Get backup stats
export const getBackupStats = async (): Promise<{
    totalCustomers: number;
    lastSyncAt: string | null;
    oldestRecord: string | null;
    newestRecord: string | null;
}> => {
    try {
        // Count total
        const { count } = await supabase
            .from('shopify_customers_backup')
            .select('*', { count: 'exact', head: true });

        // Get oldest and newest
        const { data: oldest } = await supabase
            .from('shopify_customers_backup')
            .select('synced_at')
            .order('synced_at', { ascending: true })
            .limit(1)
            .single();

        const { data: newest } = await supabase
            .from('shopify_customers_backup')
            .select('synced_at')
            .order('synced_at', { ascending: false })
            .limit(1)
            .single();

        return {
            totalCustomers: count || 0,
            lastSyncAt: newest?.synced_at || null,
            oldestRecord: oldest?.synced_at || null,
            newestRecord: newest?.synced_at || null
        };
    } catch (error: any) {
        console.error('[Shopify Backup] Error getting stats:', error.message);
        return {
            totalCustomers: 0,
            lastSyncAt: null,
            oldestRecord: null,
            newestRecord: null
        };
    }
};

// Search customers in backup
export const searchCustomersInBackup = async (
    query: string,
    limit: number = 50
): Promise<CustomerBackupData[]> => {
    try {
        const { data, error } = await supabase
            .from('shopify_customers_backup')
            .select('*')
            .or(`email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`)
            .order('synced_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error: any) {
        console.error('[Shopify Backup] Search error:', error.message);
        return [];
    }
};

// Get customers by tag from backup
export const getCustomersByTagFromBackup = async (
    tag: string,
    limit: number = 100
): Promise<CustomerBackupData[]> => {
    try {
        const { data, error } = await supabase
            .from('shopify_customers_backup')
            .select('*')
            .ilike('tags', `%${tag}%`)
            .order('synced_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error: any) {
        console.error('[Shopify Backup] Get by tag error:', error.message);
        return [];
    }
};

/**
 * Create a Price Rule in Shopify
 */
export const createShopifyPriceRule = async (params: {
    title: string,
    target_type: 'line_item' | 'shipping_line',
    target_selection: 'all' | 'entitled',
    allocation_method: 'across' | 'each',
    value_type: 'percentage' | 'fixed_amount',
    value: string,
    customer_selection: 'all' | 'prerequisite',
    starts_at: string
}): Promise<any> => {
    if (!isShopifyConfigured()) throw new Error('Shopify not configured');

    try {
        const response = await shopifyApi.post(`${getBaseUrl()}/price_rules.json`, {
            price_rule: params
        });
        return response.data.price_rule;
    } catch (error: any) {
        console.error('[Shopify] Error creating price rule:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Create a Discount Code for a Price Rule
 */
export const createShopifyDiscountCode = async (priceRuleId: number | string, code: string): Promise<any> => {
    if (!isShopifyConfigured()) throw new Error('Shopify not configured');

    try {
        const response = await shopifyApi.post(`${getBaseUrl()}/price_rules/${priceRuleId}/discount_codes.json`, {
            discount_code: { code }
        });
        return response.data.discount_code;
    } catch (error: any) {
        console.error('[Shopify] Error creating discount code:', error.response?.data || error.message);
        throw error;
    }
};
