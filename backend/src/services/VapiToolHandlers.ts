/**
 * VapiToolHandlers - Handlers for VAPI tool calls during voice conversations
 *
 * These handlers are invoked when Ara (VAPI assistant) makes tool calls.
 * Each handler executes the requested action and returns a result for Ara to use.
 *
 * IMPORTANT: All data comes from the real database (Supabase), not static files.
 * This ensures the voice agent always has up-to-date information.
 *
 * Search mappings are loaded dynamically from the database for auto-learning.
 */

import { supabase } from '../config/supabase';
import { sendWhatsAppMessage } from './whapiService';
import { sendSmartMessage } from './SmartCommunicationService';
import { cleanupPhone } from '../utils/phoneUtils';

// Cache for search mappings (refreshed periodically)
let searchMappingsCache: Record<string, string[]> = {};
let lastMappingsFetch: number = 0;
const MAPPINGS_CACHE_TTL = 60000; // 1 minute

/**
 * Get search mappings from database with caching
 */
async function getSearchMappings(): Promise<Record<string, string[]>> {
    const now = Date.now();

    // Return cached if still fresh
    if (searchMappingsCache && Object.keys(searchMappingsCache).length > 0 && (now - lastMappingsFetch) < MAPPINGS_CACHE_TTL) {
        return searchMappingsCache;
    }

    try {
        const { data, error } = await supabase
            .from('search_term_mappings')
            .select('search_term, mapped_terms')
            .eq('is_active', true)
            .gte('confidence_score', 0.30);

        if (error) {
            console.error('[VapiTools] Error fetching search mappings:', error.message);
            // Return fallback hardcoded mappings if DB fails
            return getFallbackMappings();
        }

        // Convert to lookup object
        const mappings: Record<string, string[]> = {};
        for (const row of data || []) {
            mappings[row.search_term.toLowerCase()] = row.mapped_terms;
        }

        // Update cache
        searchMappingsCache = mappings;
        lastMappingsFetch = now;

        console.log(`[VapiTools] Loaded ${Object.keys(mappings).length} search mappings from DB`);
        return mappings;

    } catch (e: any) {
        console.error('[VapiTools] Exception fetching mappings:', e.message);
        return getFallbackMappings();
    }
}

/**
 * Fallback mappings if database is unavailable
 */
function getFallbackMappings(): Record<string, string[]> {
    return {
        'gomitas': ['gummies', 'comestibles', 'sour', 'extreme'],
        'gummies': ['gummies', 'comestibles', 'sour', 'extreme'],
        'comestibles': ['comestibles', 'gummies', 'edibles', 'bites', 'candy', 'sour'],
        'tintura': ['tinturas', 'aceite', 'oil', 'tintura'],
        'tinturas': ['tinturas', 'aceite', 'oil'],
        'topico': ['topicos', 'crema', 'stick', 'freezing'],
        'topicos': ['topicos', 'crema', 'stick', 'freezing'],
        'crema': ['topicos', 'crema', 'stick', 'freezing'],
        'aceite': ['tinturas', 'aceite', 'oil'],
        'recreativo': ['comestibles', 'delta', 'hhc', 'thc', 'candy', 'sour', 'gummies'],
        'cbd': ['cbd', 'cannabidiol', 'freezing'],
        'hhc': ['hhc', 'hexahidrocannabinol', 'delta'],
        'delta': ['delta', 'delta 8', 'delta 9', 'bites'],
        // Sour/ácido mappings - critical for finding sour products
        'acido': ['sour', 'extreme', 'candy', 'gummies'],
        'acida': ['sour', 'extreme', 'candy', 'gummies'],
        'acidos': ['sour', 'extreme', 'candy', 'gummies'],
        'acidas': ['sour', 'extreme', 'candy', 'gummies'],
        'ácido': ['sour', 'extreme', 'candy', 'gummies'],
        'ácida': ['sour', 'extreme', 'candy', 'gummies'],
        'ácidos': ['sour', 'extreme', 'candy', 'gummies'],
        'ácidas': ['sour', 'extreme', 'candy', 'gummies'],
        'sour': ['sour', 'extreme', 'candy', 'gummies'],
        'caramelo': ['candy', 'caramel', 'cream', 'comestibles'],
        'caramelos': ['candy', 'caramel', 'cream', 'comestibles'],
        'dulces': ['candy', 'comestibles', 'gummies', 'bites'],
        // Efecto mappings - energizante vs relajante
        'energizante': ['sour', 'extreme', 'gummies', 'candy', 'hot bites', 'delta', 'hhc'],
        'energizantes': ['sour', 'extreme', 'gummies', 'candy', 'hot bites', 'delta', 'hhc'],
        'energia': ['sour', 'extreme', 'gummies', 'candy', 'delta', 'hhc'],
        'activo': ['sour', 'extreme', 'gummies', 'candy', 'delta'],
        'activar': ['sour', 'extreme', 'gummies', 'candy', 'delta', 'hhc'],
        'foco': ['sour', 'extreme', 'gummies', 'candy', 'delta'],
        'concentracion': ['sour', 'extreme', 'gummies', 'candy'],
        'relajante': ['cream', 'candy', 'caramel', 'cbd', 'tintura'],
        'relajar': ['cream', 'candy', 'caramel', 'cbd', 'tintura'],
        'dormir': ['cream', 'candy', 'cbn', 'cbd', 'tintura'],
        'extreme': ['sour', 'extreme', 'gummies', 'candy'],
    };
}

/**
 * Update mapping stats after a search
 */
async function updateMappingStats(searchTerm: string, wasSuccessful: boolean): Promise<void> {
    try {
        // Get current stats
        const { data: mapping } = await supabase
            .from('search_term_mappings')
            .select('times_used, times_successful')
            .eq('search_term', searchTerm.toLowerCase())
            .eq('is_active', true)
            .single();

        if (mapping) {
            const newTimesUsed = (mapping.times_used || 0) + 1;
            const newTimesSuccessful = wasSuccessful ? (mapping.times_successful || 0) + 1 : (mapping.times_successful || 0);
            const newConfidence = newTimesSuccessful / newTimesUsed;

            await supabase
                .from('search_term_mappings')
                .update({
                    times_used: newTimesUsed,
                    times_successful: newTimesSuccessful,
                    confidence_score: Math.min(1.0, Math.max(0.1, newConfidence)),
                    last_used_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('search_term', searchTerm.toLowerCase())
                .eq('is_active', true);
        }
    } catch (e) {
        // Non-critical, just log
        console.error('[VapiTools] Error updating mapping stats:', e);
    }
}

interface ToolCallContext {
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
    customerEmail?: string; // For SmartCommunication email fallback
}

interface ToolResult {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
}

/**
 * Tool: send_whatsapp / function_tool_wa
 * Sends a message to the customer during the call using SmartCommunicationService
 *
 * Uses intelligent fallback: WhatsApp → SMS → Email
 * Email is ALWAYS sent as backup so customer has permanent record
 */
export async function handleSendWhatsApp(
    args: { message: string; media_url?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { message, media_url } = args;
    const { customerPhone, customerEmail, conversationId, clientId } = context;

    // Enhanced logging for debugging
    console.log(`[VapiTools] send_whatsapp CALLED with:`, {
        customerPhone,
        customerEmail,
        conversationId,
        clientId,
        messageLength: message?.length,
        hasMediaUrl: !!media_url
    });

    if (!customerPhone) {
        console.error('[VapiTools] send_whatsapp FAILED: Missing customerPhone in context', { context });
        return {
            success: false,
            error: 'No se pudo identificar el teléfono del cliente. Pídele su número para enviarlo.'
        };
    }

    try {
        console.log(`[VapiTools] Sending message via SmartCommunicationService to ${customerPhone}`);

        // Use SmartCommunicationService for intelligent fallback
        const result = await sendSmartMessage({
            to: customerPhone,
            toEmail: customerEmail, // Direct email for fallback (skips DB lookup)
            subject: 'Información de tu llamada con Extractos EUM',
            body: message,
            type: 'informational', // WhatsApp → Email → Push with email backup
            clientId,
            conversationId,
            metadata: { source: 'voice_call', media_url }
        });

        console.log(`[VapiTools] SmartCommunication result:`, {
            success: result.success,
            channelUsed: result.channelUsed,
            channelsAttempted: result.channelsAttempted,
            emailSent: result.emailSent
        });

        // Log in CRM messages if we have conversation context
        if (conversationId && result.success) {
            await supabase.from('crm_messages').insert({
                conversation_id: conversationId,
                direction: 'outbound',
                role: 'assistant',
                message_type: media_url ? 'image' : 'text',
                content: message,
                status: 'sent',
                raw_payload: {
                    source: 'vapi_tool_call',
                    media_url,
                    channel_used: result.channelUsed,
                    channels_attempted: result.channelsAttempted,
                    email_sent: result.emailSent
                }
            });
        }

        if (result.success) {
            // Build response message based on what channels were used
            let successMessage = '';
            if (result.channelUsed === 'whatsapp') {
                successMessage = 'Mensaje enviado por WhatsApp exitosamente';
            } else if (result.channelUsed === 'sms') {
                successMessage = 'WhatsApp no disponible, pero te envié la información por SMS';
            } else if (result.channelUsed === 'email') {
                successMessage = 'Te envié la información por correo electrónico';
            } else if (result.channelUsed === 'push') {
                successMessage = 'Te envié una notificación con la información';
            }

            if (result.emailSent && result.channelUsed !== 'email') {
                successMessage += '. También te envié una copia por correo para que tengas la información guardada';
            }

            return {
                success: true,
                message: successMessage,
                data: {
                    channelUsed: result.channelUsed,
                    emailSent: result.emailSent,
                    channelResults: result.channelResults
                }
            };
        } else {
            return {
                success: false,
                error: result.error || 'No pude enviar el mensaje por ningún canal. Por favor verifica tu información de contacto.'
            };
        }
    } catch (error: any) {
        console.error('[VapiTools] send_whatsapp error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: search_products
 * Searches products in the catalog and returns info for the voice agent
 * This queries the REAL products database, not static files
 *
 * Search strategy:
 * 1. Load mappings from database (with fallback to hardcoded)
 * 2. Map common Spanish terms to actual product keywords
 * 3. Search in title, product_type, and description
 * 4. Update mapping stats for learning
 */
export async function handleSearchProducts(
    args: { query: string; category?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { query, category } = args;

    try {
        console.log(`[VapiTools] Searching products: query="${query}", category="${category}"`);

        // Load mappings from database (with caching)
        const searchMappings = await getSearchMappings();

        let products: any[] = [];
        const queryLower = (query || '').toLowerCase().trim();
        let usedMapping = false;
        let expandedTerms: string[] = []; // [MOVING SCOPE] So scoring can see it

        if (query) {
            // [PRIORITY PASS] Search for the literal query in Title first
            const { data: literalResults } = await supabase
                .from('products')
                .select('id, title, handle, product_type, description_plain, variants, status')
                .eq('status', 'active')
                .ilike('title', `%${queryLower}%`)
                .limit(5);

            if (literalResults && literalResults.length > 0) {
                products = [...literalResults];
            }

            // Split query into words and collect all expanded terms
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

            // First try exact match for full query
            if (searchMappings[queryLower]) {
                expandedTerms.push(...searchMappings[queryLower]);
                usedMapping = true;
            }

            // Then expand each word individually
            for (const word of queryWords) {
                if (searchMappings[word]) {
                    expandedTerms.push(...searchMappings[word]);
                    usedMapping = true;
                } else {
                    // Include the original word too
                    expandedTerms.push(word);
                }
            }

            // Deduplicate terms
            expandedTerms = [...new Set(expandedTerms)];

            // If no mapping found at all, just use the original words
            if (expandedTerms.length === 0) {
                expandedTerms = queryWords.length > 0 ? queryWords : [queryLower];
            }

            console.log(`[VapiTools] Expanded search terms from "${queryLower}":`, expandedTerms);

            // Try each term until we find results
            for (const term of expandedTerms) {
                if (products.length >= 10) break; // Increased limit to 10 for better recall

                // Search in title OR product_type OR description (broader search)
                const { data: results } = await supabase
                    .from('products')
                    .select('id, title, handle, product_type, description_plain, variants, status')
                    .eq('status', 'active')
                    .or(`title.ilike.%${term}%,product_type.ilike.%${term}%,description_plain.ilike.%${term}%`)
                    .limit(10); // Check more candidates

                if (results && results.length > 0) {
                    const existingIds = new Set(products.map(p => p.id));
                    // Prioritize exact matches in TITLE first
                    const exactMatches = results.filter(p => !existingIds.has(p.id) && p.title.toLowerCase().includes(term));
                    const otherMatches = results.filter(p => !existingIds.has(p.id) && !p.title.toLowerCase().includes(term));

                    products = [...products, ...exactMatches, ...otherMatches];
                }
            }

            // Fallback: If still few results, try to match ANY word in title (very broad)
            if (products.length < 3 && queryWords.length > 0) {
                const orQuery = queryWords.map(w => `title.ilike.%${w}%`).join(',');
                const { data: broadResults } = await supabase
                    .from('products')
                    .select('id, title, handle, product_type, description_plain, variants, status')
                    .eq('status', 'active')
                    .or(orQuery)
                    .limit(10);

                if (broadResults) {
                    const existingIds = new Set(products.map(p => p.id));
                    products = [...products, ...broadResults.filter(p => !existingIds.has(p.id))];
                }
            }

            // EXTRA PASS: Handle specific merged/split cases (e.g., "Candy Kush" vs "CandyKush")
            if (queryLower.includes('candy kush') || queryLower.includes('candykush')) {
                const { data: candyResults } = await supabase
                    .from('products')
                    .select('id, title, handle, product_type, description_plain, variants, status')
                    .eq('status', 'active')
                    .or(`title.ilike.%CandyKush%,title.ilike.%Candy Kush%`) // Explicitly check both
                    .limit(10);

                if (candyResults) {
                    const existingIds = new Set(products.map(p => p.id));
                    products = [...products, ...candyResults.filter(p => !existingIds.has(p.id))];
                }
            }

            // Deduplicate and limit
            const seen = new Set();
            products = products.filter(p => {
                if (seen.has(p.id)) return false;
                seen.add(p.id);
                return true;
            }).slice(0, 8); // Return up to 8 relevant results
        } else {
            // No query - return generic mix
            const { data } = await supabase
                .from('products')
                .select('id, title, handle, product_type, description_plain, variants, status')
                .eq('status', 'active')
                .limit(5);
            products = data || [];
        }

        // Apply category filter if provided
        if (category && products.length > 0) {
            products = products.filter(p =>
                p.product_type?.toLowerCase().includes(category.toLowerCase())
            );
        }

        // Score and sort all results
        const scoredProducts = products.map(p => {
            let score = 0;
            const titleLower = p.title.toLowerCase();
            const typeLower = (p.product_type || '').toLowerCase();

            // 1. Literal Query Match (Highest priority)
            if (queryLower) {
                if (titleLower.includes(queryLower)) score += 200;
                if (typeLower.includes(queryLower)) score += 100;
            }

            // 2. Expanded Term Match
            for (const term of expandedTerms) {
                if (titleLower.includes(term)) score += 50;
                if (typeLower.includes(term)) score += 20;
            }

            // 3. Exact HHC product boost
            if (queryLower === 'hhc' && (titleLower === 'hexahidrocannabinol (hhc)' || titleLower.includes('hhc soluble'))) {
                score += 1000;
            }

            // 4. Category Boost (NEW)
            if ((queryLower === 'gomitas' || queryLower === 'gummies' || queryLower === 'comestibles') && typeLower === 'comestibles') {
                score += 500;
            }

            // 5. Anti-Rank: Hot Bites are NOT gomitas (per user instruction)
            if ((queryLower === 'gomitas' || queryLower === 'gummies') && titleLower.includes('hot bites')) {
                score -= 2000;
            }

            // 6. Stock Availability (Small boost to break ties)
            const totalStock = (p.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
            if (totalStock > 0) score += 5;

            return { ...p, _score: score };
        });

        // Sort by score and take top 10
        products = scoredProducts
            .sort((a, b) => (b as any)._score - (a as any)._score)
            .slice(0, 10);

        console.log(`[VapiTools] Found ${products.length} products after filtering/ranking.`);

        // Update mapping stats for learning (non-blocking)
        if (usedMapping && queryLower) {
            updateMappingStats(queryLower, products.length > 0).catch(() => { });
        }

        if (!products || products.length === 0) {
            // Get available product types for helpful suggestion
            const { data: allProducts } = await supabase
                .from('products')
                .select('product_type')
                .eq('status', 'active');

            const types = [...new Set((allProducts || []).map(p => p.product_type).filter(Boolean))];
            const suggestion = types.length > 0
                ? `Tenemos productos en categorías como: ${types.slice(0, 3).join(', ')}.`
                : '';

            return {
                success: false,
                message: `No encontré productos con "${query}". ${suggestion} ¿Quieres que busque algo más específico?`,
                error: 'No results found'
            };
        }

        // Format products for voice agent (Simplified for speech)
        const productList = products.map(p => {
            const variants = p.variants || [];
            const totalStock = variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
            const prices = variants.map((v: any) => parseFloat(v.price) || 0).filter((p: number) => p > 0);
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

            // Clean description: Remove HTML/CSS and take first few meaningful sentences
            let cleanDesc = (p.description_plain || '')
                .replace(/<style[^>]*>.*<\/style>/gms, '') // Remove CSS blocks
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\.cannabis-minimal[^{]*\{[^}]*\}/g, '') // Remove specific CSS classes
                .replace(/\s+/g, ' ') // Collapse whitespace
                .trim();

            // Take first 300 chars or first two sentences
            const sentences = cleanDesc.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
            const shortDesc = sentences.slice(0, 2).join('. ') + (sentences.length > 2 ? '...' : '');

            return {
                name: p.title,
                description: cleanDesc, // Give full cleaned desc to AI context
                price: minPrice,
                stock: totalStock > 0 ? 'Sí' : 'No',
                stock_quantity: totalStock,
                summary: `${p.title} a $${minPrice}. ${shortDesc}`
            };
        });

        // Create a summary that Ara can naturally speak
        const summary = productList.map(p =>
            `${p.name}, desde $${p.price}`
        ).join('. ');

        return {
            success: true,
            message: `Encontré estos productos: ${summary}. ¿Te interesa alguno en particular?`,
            data: {
                products: productList,
                count: products.length
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] search_products error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: get_coa / cannabinoides-webhook
 * Looks up a Certificate of Analysis from the REAL database
 * Returns cannabinoid info and can send PDF via WhatsApp
 */
export async function handleGetCOA(
    args: { batch_number?: string; product_name?: string; send_whatsapp?: boolean },
    context: ToolCallContext
): Promise<ToolResult> {
    const { batch_number, product_name, send_whatsapp } = args;
    const { customerPhone, conversationId } = context;

    try {
        console.log(`[VapiTools] Looking up COA: batch=${batch_number}, product=${product_name}`);

        let coa = null;

        // Search by batch_id first (most accurate)
        if (batch_number) {
            const { data } = await supabase
                .from('coas')
                .select('id, public_token, batch_id, lab_name, cannabinoids, pdf_url_original, pdf_url_branded, metadata, custom_name, analysis_date')
                .ilike('batch_id', `%${batch_number}%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            coa = data;
        }

        // If not found, try by product_name in COAs table
        if (!coa && product_name) {
            const { data } = await supabase
                .from('coas')
                .select('id, public_token, batch_id, lab_name, cannabinoids, pdf_url_original, pdf_url_branded, metadata, custom_name, analysis_date')
                .ilike('custom_name', `%${product_name}%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            coa = data;
        }

        // If STILL not found, check PRODUCTS table metadata/tags for COA links
        if (!coa && product_name) {
            console.log(`[VapiTools] COA not found in table. Checking product metadata for: ${product_name}`);

            const { data: products } = await supabase
                .from('products')
                .select('id, title, metadata, tags')
                .ilike('title', `%${product_name}%`)
                .limit(1);

            const product = products?.[0];

            if (product?.metadata?.coa_url || product?.metadata?.coa_pdf) {
                // Construct a "Virtual COA" from metadata
                coa = {
                    batch_id: product.metadata.batch_id || 'N/D',
                    lab_name: product.metadata.lab_name || 'Laboratorio Externo',
                    cannabinoids: product.metadata.cannabinoids || [],
                    pdf_url_original: product.metadata.coa_url || product.metadata.coa_pdf,
                    custom_name: product.title,
                    analysis_date: product.metadata.coa_date,
                    public_token: 'metadata' // Flag implies no real COA record
                };
                console.log(`[VapiTools] Found Virtual COA in product metadata: ${product.title}`);
            }
        }

        if (!coa) {
            return {
                success: false,
                message: 'No encontré el COA con esos datos. ¿Tienes el número de lote? Usualmente viene en la etiqueta del producto, empieza con letras y números.',
                error: 'COA not found in table or metadata'
            };
        }

        // Extract cannabinoid info
        const cannabinoids = coa.cannabinoids || [];
        const thcEntry = cannabinoids.find((c: any) =>
            c.analyte?.toLowerCase().includes('thc') &&
            (c.analyte?.toLowerCase().includes('total') || c.analyte?.toLowerCase() === 'thc')
        );
        const cbdEntry = cannabinoids.find((c: any) =>
            c.analyte?.toLowerCase().includes('cbd') &&
            (c.analyte?.toLowerCase().includes('total') || c.analyte?.toLowerCase() === 'cbd')
        );

        const thcTotal = thcEntry?.result_pct || 'N/D';
        const cbdTotal = cbdEntry?.result_pct || 'N/D';
        const productName = coa.custom_name || coa.metadata?.product_name || `Lote ${coa.batch_id}`;
        const pdfUrl = coa.pdf_url_branded || coa.pdf_url_original;
        const viewerUrl = `https://coa.extractoseum.com/coa/${coa.public_token}`;

        // Send via WhatsApp if requested
        if (send_whatsapp && customerPhone && pdfUrl) {
            const message = `📄 *COA - ${productName}*\n\n` +
                `🔬 Lote: ${coa.batch_id}\n` +
                `🧪 THC Total: ${thcTotal}%\n` +
                `🌿 CBD Total: ${cbdTotal}%\n` +
                `🏛️ Lab: ${coa.lab_name || 'N/D'}\n\n` +
                `📎 Ver COA completo:\n${viewerUrl}`;

            await sendWhatsAppMessage({
                to: customerPhone,
                body: message
            });

            // Log in CRM
            if (conversationId) {
                await supabase.from('crm_messages').insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'text',
                    content: message,
                    status: 'sent',
                    raw_payload: { source: 'vapi_tool_call', coa_id: coa.id }
                });
            }

            return {
                success: true,
                message: `Encontré el COA del ${productName}. Tiene ${thcTotal}% de THC y ${cbdTotal}% de CBD. Ya te lo envié por WhatsApp.`,
                data: {
                    product_name: productName,
                    batch_id: coa.batch_id,
                    thc_total: thcTotal,
                    cbd_total: cbdTotal,
                    lab_name: coa.lab_name,
                    sent_via_whatsapp: true
                }
            };
        }

        // Return info without sending (let Ara ask if they want it)
        return {
            success: true,
            message: `Encontré el COA del ${productName}. Tiene ${thcTotal}% de THC y ${cbdTotal}% de CBD. Del laboratorio ${coa.lab_name || 'certificado'}. ¿Te lo envío por WhatsApp?`,
            data: {
                product_name: productName,
                batch_id: coa.batch_id,
                thc_total: thcTotal,
                cbd_total: cbdTotal,
                lab_name: coa.lab_name,
                analysis_date: coa.analysis_date,
                viewer_url: viewerUrl,
                sent_via_whatsapp: false
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] get_coa error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: lookup_order
 * Looks up order status from the REAL orders database
 */
export async function handleLookupOrder(
    args: { order_number?: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { order_number } = args;
    const { clientId, customerPhone } = context;

    console.log(`[VapiTools] lookup_order: order_number=${order_number}, clientId=${clientId}, customerPhone=${customerPhone}`);

    try {
        let order;
        let searchMethod = '';

        if (order_number) {
            searchMethod = 'order_number';
            // Search by order number
            const { data } = await supabase
                .from('orders')
                .select('*')
                .ilike('order_number', `%${order_number}%`)
                .limit(1)
                .maybeSingle();
            order = data;
        } else if (clientId) {
            searchMethod = 'clientId';
            // Get latest order for client
            const { data } = await supabase
                .from('orders')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            order = data;
        } else if (customerPhone) {
            searchMethod = 'customerPhone';
            const cleanPhone = cleanupPhone(customerPhone);
            console.log(`[VapiTools] lookup_order: searching by phone ${cleanPhone}`);

            // STRATEGY 1: Try to find client_id from crm_contact_snapshots (most reliable)
            const { data: snapshot } = await supabase
                .from('crm_contact_snapshots')
                .select('client_id, email')
                .ilike('handle', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (snapshot?.client_id) {
                console.log(`[VapiTools] lookup_order: found snapshot with client_id ${snapshot.client_id}`);
                const { data } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('client_id', snapshot.client_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                order = data;
                if (order) {
                    console.log(`[VapiTools] lookup_order: found order ${order.order_number} by snapshot client_id`);
                }
            }

            // STRATEGY 2: Try by email from snapshot
            if (!order && snapshot?.email) {
                console.log(`[VapiTools] lookup_order: searching by snapshot email ${snapshot.email}`);
                const { data: orderByEmail } = await supabase
                    .from('orders')
                    .select('*')
                    .ilike('customer_email', snapshot.email)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (orderByEmail) {
                    console.log(`[VapiTools] lookup_order: found order ${orderByEmail.order_number} by email`);
                    order = orderByEmail;
                }
            }

            // STRATEGY 3: Try to find client in clients table by phone
            if (!order) {
                const { data: client } = await supabase
                    .from('clients')
                    .select('id')
                    .ilike('phone', `%${cleanPhone}%`)
                    .limit(1)
                    .maybeSingle();

                if (client) {
                    console.log(`[VapiTools] lookup_order: found client ${client.id} in clients table`);
                    const { data } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('client_id', client.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    order = data;
                }
            }

            // STRATEGY 4: Fallback - search orders directly by phone number
            if (!order) {
                console.log(`[VapiTools] lookup_order: fallback - searching orders by customer_phone ${cleanPhone}`);
                const { data: orderByPhone } = await supabase
                    .from('orders')
                    .select('*')
                    .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%52${cleanPhone}%`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (orderByPhone) {
                    console.log(`[VapiTools] lookup_order: found order ${orderByPhone.order_number} by customer_phone`);
                    order = orderByPhone;
                } else {
                    console.log(`[VapiTools] lookup_order: no orders found for phone ${cleanPhone}`);
                }
            }
        } else {
            searchMethod = 'none';
            console.log(`[VapiTools] lookup_order: no search criteria available`);
        }

        console.log(`[VapiTools] lookup_order: searchMethod=${searchMethod}, found=${!!order}`);

        if (!order) {
            const noContextMsg = !order_number && !clientId && !customerPhone
                ? 'No tengo suficiente información para buscar tu pedido. ¿Me puedes dar el número de orden?'
                : 'No encontré el pedido. ¿Tienes el número de orden? Lo encuentras en el correo de confirmación.';
            return {
                success: false,
                message: noContextMsg
            };
        }

        // Determine actual status from Shopify fields (financial_status + fulfillment_status)
        // Priority: fulfillment_status > financial_status > status
        let actualStatus = order.status || 'created';

        // Map Shopify financial_status
        if (order.financial_status) {
            const financialMap: Record<string, string> = {
                'pending': 'pending',
                'authorized': 'authorized',
                'paid': 'paid',
                'partially_paid': 'partially_paid',
                'refunded': 'refunded',
                'voided': 'cancelled'
            };
            actualStatus = financialMap[order.financial_status] || actualStatus;
        }

        // Map Shopify fulfillment_status (overrides financial if exists)
        if (order.fulfillment_status) {
            const fulfillmentMap: Record<string, string> = {
                'fulfilled': 'shipped',
                'partial': 'processing',
                'restocked': 'refunded'
            };
            actualStatus = fulfillmentMap[order.fulfillment_status] || actualStatus;
        }

        // Also check tracking_status for more specific status
        if (order.tracking_status) {
            const trackingMap: Record<string, string> = {
                'pre_transit': 'processing',
                'in_transit': 'in_transit',
                'out_for_delivery': 'out_for_delivery',
                'delivered': 'delivered',
                'available_for_pickup': 'available_for_pickup',
                'return_to_sender': 'return_to_sender',
                'failure': 'delivery_failed',
                'unknown': 'in_transit'
            };
            if (trackingMap[order.tracking_status]) {
                actualStatus = trackingMap[order.tracking_status];
            }
        }

        // Format status in Spanish (natural for voice)
        const statusMap: Record<string, string> = {
            'created': 'recién creado',
            'pending': 'pendiente de pago',
            'authorized': 'pago autorizado, en preparación',
            'paid': 'pagado y en preparación',
            'processing': 'en preparación',
            'shipped': 'enviado',
            'in_transit': 'en camino',
            'out_for_delivery': 'en reparto',
            'delivered': 'entregado',
            'available_for_pickup': 'listo para recoger',
            'cancelled': 'cancelado',
            'refunded': 'reembolsado',
            'return_to_sender': 'regresado al remitente',
            'delivery_failed': 'entrega fallida'
        };

        const statusText = statusMap[actualStatus] || actualStatus;
        const totalAmount = order.total_amount || order.total || 0;

        // Build tracking info
        let trackingInfo = '';
        if (order.tracking_number) {
            trackingInfo = ` El número de rastreo es ${order.tracking_number}.`;
            if (order.tracking_status === 'delivered') {
                trackingInfo += ' Ya fue entregado.';
            }
        }

        return {
            success: true,
            message: `Tu pedido número ${order.order_number} está ${statusText}. El total fue de ${totalAmount} pesos.${trackingInfo}`,
            data: {
                order_number: order.order_number,
                status: actualStatus,
                status_text: statusText,
                total: totalAmount,
                created_at: order.created_at,
                tracking_number: order.tracking_number,
                tracking_status: order.tracking_status,
                financial_status: order.financial_status,
                fulfillment_status: order.fulfillment_status,
                line_items: order.line_items
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] lookup_order error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: create_coupon
 * Creates a discount coupon for the customer
 */
export async function handleCreateCoupon(
    args: { discount_percent: number; reason: string },
    context: ToolCallContext
): Promise<ToolResult> {
    const { discount_percent, reason } = args;
    const { clientId, conversationId, customerPhone } = context;

    // Validate discount range
    if (discount_percent < 5 || discount_percent > 30) {
        return {
            success: false,
            error: 'El descuento debe ser entre 5% y 30%'
        };
    }

    try {
        // Generate unique coupon code
        const code = `ARA${discount_percent}-${Date.now().toString(36).toUpperCase()}`;

        // Create coupon in database
        const { data: coupon, error } = await supabase
            .from('coupons')
            .insert({
                code,
                discount_percent,
                reason,
                created_by: 'vapi_ara',
                client_id: clientId,
                conversation_id: conversationId,
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                max_uses: 1,
                is_active: true
            })
            .select()
            .single();

        if (error) {
            console.error('[VapiTools] Coupon creation error:', error);
            return { success: false, error: 'Error creando el cupón' };
        }

        // Send via WhatsApp if we have phone
        if (customerPhone) {
            const message = `🎁 Te creé un cupón especial del ${discount_percent}% de descuento:\n\n*${code}*\n\nVálido por 30 días en extractoseum.com`;

            await sendWhatsAppMessage({
                to: customerPhone,
                body: message
            });

            // Log in CRM
            if (conversationId) {
                await supabase.from('crm_messages').insert({
                    conversation_id: conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'text',
                    content: message,
                    status: 'sent',
                    raw_payload: { source: 'vapi_tool_call', coupon_id: coupon.id }
                });
            }
        }

        return {
            success: true,
            message: `Listo, te creé el cupón ${code} con ${discount_percent}% de descuento. ${customerPhone ? 'Te lo acabo de enviar por WhatsApp.' : ''} Es válido por 30 días.`,
            data: {
                code,
                discount_percent,
                expires_at: coupon.expires_at
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] create_coupon error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: escalate_to_human
 * Registers request for human attention (does NOT transfer the call)
 */
export async function handleEscalateToHuman(
    args: { reason: string; wants_callback?: boolean },
    context: ToolCallContext
): Promise<ToolResult> {
    const { reason, wants_callback } = args;
    const { conversationId, customerPhone } = context;

    try {
        console.log(`[VapiTools] Escalation requested: ${reason}, callback: ${wants_callback}`);

        // Create escalation record / internal note
        if (conversationId) {
            // Add internal note about escalation
            await supabase.from('crm_messages').insert({
                conversation_id: conversationId,
                direction: 'inbound',
                role: 'system',
                message_type: 'internal_note',
                is_internal: true,
                content: `🚨 **Solicitud de Escalación (Llamada)**\n\nRazón: ${reason}\nCallback solicitado: ${wants_callback ? 'Sí' : 'No'}\nTeléfono: ${customerPhone || 'N/A'}`,
                status: 'delivered'
            });

            // Update conversation tags for visibility
            const { data: conv } = await supabase
                .from('conversations')
                .select('tags, facts')
                .eq('id', conversationId)
                .single();

            const currentTags = conv?.tags || [];
            const currentFacts = conv?.facts || {};

            await supabase
                .from('conversations')
                .update({
                    tags: [...currentTags, 'Callback Pendiente'],
                    facts: { ...currentFacts, escalation_reason: reason }
                })
                .eq('id', conversationId);
        }

        if (wants_callback) {
            return {
                success: true,
                message: 'Perfecto, registré tu solicitud. Un supervisor se comunicará contigo en el siguiente horario disponible.',
                data: { callback_scheduled: true, reason }
            };
        }

        return {
            success: true,
            message: 'Entendido, tomé nota de tu solicitud. ¿Hay algo más en lo que pueda ayudarte mientras tanto?',
            data: { escalated: true, reason }
        };

    } catch (error: any) {
        console.error('[VapiTools] escalate_to_human error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Tool: get_client_info
 * Returns information about the current customer from the REAL database
 */
export async function handleGetClientInfo(
    args: {},
    context: ToolCallContext
): Promise<ToolResult> {
    const { clientId, customerPhone } = context;

    try {
        let client;

        if (clientId) {
            const { data } = await supabase
                .from('clients')
                .select('*')
                .eq('id', clientId)
                .single();
            client = data;
        } else if (customerPhone) {
            const cleanPhone = cleanupPhone(customerPhone);
            const { data } = await supabase
                .from('clients')
                .select('*')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();
            client = data;
        }

        if (!client) {
            return {
                success: false,
                message: 'No encontré información del cliente en el sistema. Puede ser cliente nuevo.'
            };
        }

        // Get order stats
        const { data: orders } = await supabase
            .from('orders')
            .select('id, total, status, created_at')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        const totalOrders = orders?.length || 0;
        const ltv = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
        const lastOrder = orders?.[0];

        return {
            success: true,
            message: client.name
                ? `El cliente es ${client.name}. Tiene ${totalOrders} pedidos con nosotros por un total de ${Math.round(ltv)} pesos.`
                : `Cliente registrado con ${totalOrders} pedidos, total ${Math.round(ltv)} pesos.`,
            data: {
                name: client.name,
                email: client.email,
                phone: client.phone,
                total_orders: totalOrders,
                ltv: Math.round(ltv),
                last_order_date: lastOrder?.created_at,
                created_at: client.created_at
            }
        };

    } catch (error: any) {
        console.error('[VapiTools] get_client_info error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Main tool router - dispatches tool calls to appropriate handlers
 */
export async function handleToolCall(
    toolName: string,
    args: any,
    context: ToolCallContext
): Promise<ToolResult> {
    console.log(`[VapiTools] Handling tool: ${toolName}`, args);

    switch (toolName) {
        // WhatsApp sending
        case 'send_whatsapp':
        case 'function_tool_wa': // Legacy name from VAPI dashboard
            return handleSendWhatsApp(args, context);

        // Product search
        case 'search_products':
        case 'buscar_productos':
            return handleSearchProducts(args, context);

        // COA lookup
        case 'get_coa':
        case 'get_coa_and_send':
        case 'cannabinoides-webhook': // Legacy name from VAPI dashboard
            return handleGetCOA(args, context);

        // Order lookup
        case 'lookup_order':
        case 'consultar_pedido':
            return handleLookupOrder(args, context);

        // Coupon creation
        case 'create_coupon':
        case 'crear_cupon':
            return handleCreateCoupon(args, context);

        // Escalation
        case 'escalate_to_human':
        case 'escalar_humano':
            return handleEscalateToHuman(args, context);

        // Client info
        case 'get_client_info':
        case 'lookup_client':
        case 'info_cliente':
            return handleGetClientInfo(args, context);

        default:
            console.warn(`[VapiTools] Unknown tool: ${toolName}`);
            return {
                success: false,
                error: `Herramienta desconocida: ${toolName}`
            };
    }
}
