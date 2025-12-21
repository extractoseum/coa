import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabase } from '../config/supabase';
import {
    getShopifyCustomers,
    getShopifyCustomerById,
    searchShopifyCustomers,
    isShopifyConfigured,
    ShopifyCustomer,
    HOLOGRAM_PURCHASE_URL,
    syncClientCOAsToShopify,
    getCustomerMetafields,
    getCustomerWithTags,
    customerHasTag,
    getCustomerTags
} from '../services/shopifyService';
import { ledgerService } from '../services/ledgerService';

// Get all clients (local database)
export const getAllClients = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select('id, email, name, phone, company, role, shopify_customer_id, is_active, created_at, last_login_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get clients error:', error);
            return res.status(500).json({ success: false, error: 'Error al obtener clientes' });
        }

        res.json({ success: true, clients: data || [] });
    } catch (err) {
        console.error('Get clients error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get client by ID
export const getClientById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('clients')
            .select('id, email, name, phone, company, role, shopify_customer_id, is_active, created_at, last_login_at')
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        res.json({ success: true, client: data });
    } catch (err) {
        console.error('Get client error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get clients from Shopify
export const getShopifyClientsList = async (req: Request, res: Response) => {
    try {
        if (!isShopifyConfigured()) {
            return res.json({
                success: true,
                configured: false,
                customers: [],
                message: 'Shopify no esta configurado. Agrega SHOPIFY_STORE_DOMAIN y SHOPIFY_ADMIN_API_ACCESS_TOKEN al .env'
            });
        }

        const customers = await getShopifyCustomers(100);

        res.json({
            success: true,
            configured: true,
            customers: customers.map(c => ({
                id: c.id,
                email: c.email,
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
                phone: c.phone,
                company: c.default_address?.company,
                orders_count: c.orders_count,
                total_spent: c.total_spent,
                created_at: c.created_at
            }))
        });
    } catch (err: any) {
        console.error('Get Shopify customers error:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Error al obtener clientes de Shopify'
        });
    }
};

// Search Shopify customers
export const searchShopifyClients = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, error: 'Query de busqueda requerido' });
        }

        if (!isShopifyConfigured()) {
            return res.json({ success: true, configured: false, customers: [] });
        }

        const customers = await searchShopifyCustomers(query);

        res.json({
            success: true,
            customers: customers.map(c => ({
                id: c.id,
                email: c.email,
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
                phone: c.phone,
                company: c.default_address?.company
            }))
        });
    } catch (err: any) {
        console.error('Search Shopify customers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Import client from Shopify
export const importFromShopify = async (req: Request, res: Response) => {
    try {
        const { shopifyId } = req.params;
        const { password } = req.body; // Optional password, will generate one if not provided

        if (!isShopifyConfigured()) {
            return res.status(400).json({
                success: false,
                error: 'Shopify no esta configurado'
            });
        }

        // Get customer from Shopify
        const shopifyCustomer = await getShopifyCustomerById(shopifyId);

        if (!shopifyCustomer) {
            return res.status(404).json({
                success: false,
                error: 'Cliente no encontrado en Shopify'
            });
        }

        // Check if already imported
        const { data: existing } = await supabase
            .from('clients')
            .select('id')
            .eq('shopify_customer_id', shopifyId.toString())
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Este cliente ya fue importado'
            });
        }

        // Check if email already exists
        const { data: emailExists } = await supabase
            .from('clients')
            .select('id')
            .eq('email', shopifyCustomer.email.toLowerCase())
            .single();

        if (emailExists) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un cliente con este email'
            });
        }

        // Generate password if not provided
        const clientPassword = password || generateRandomPassword();
        const passwordHash = await bcrypt.hash(clientPassword, 10);

        // Create client
        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                shopify_customer_id: shopifyId.toString(),
                email: shopifyCustomer.email.toLowerCase(),
                name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim(),
                phone: shopifyCustomer.phone,
                company: shopifyCustomer.default_address?.company,
                password_hash: passwordHash,
                role: 'client'
            })
            .select('id, email, name, phone, company, role, shopify_customer_id')
            .single();

        if (error) {
            console.error('Import client error:', error);
            return res.status(500).json({ success: false, error: 'Error al importar cliente' });
        }

        res.json({
            success: true,
            client,
            // Only return password if it was generated
            ...(password ? {} : { generatedPassword: clientPassword })
        });
    } catch (err) {
        console.error('Import from Shopify error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Create client manually (not from Shopify)
export const createClient = async (req: Request, res: Response) => {
    try {
        const { email, password, name, phone, company } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email y password son requeridos'
            });
        }

        // Check if email exists
        const { data: existing } = await supabase
            .from('clients')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Ya existe un cliente con este email'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { data: client, error } = await supabase
            .from('clients')
            .insert({
                email: email.toLowerCase(),
                password_hash: passwordHash,
                name,
                phone,
                company,
                role: 'client'
            })
            .select('id, email, name, phone, company, role')
            .single();

        if (error) {
            console.error('Create client error:', error);
            return res.status(500).json({ success: false, error: 'Error al crear cliente' });
        }

        res.json({ success: true, client });
    } catch (err) {
        console.error('Create client error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Update client
export const updateClient = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, phone, company, is_active } = req.body;

        const updateData: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (company !== undefined) updateData.company = company;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', id)
            .select('id, email, name, phone, company, role, is_active')
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Error al actualizar cliente' });
        }

        res.json({ success: true, client: data });
    } catch (err) {
        console.error('Update client error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Delete client
export const deleteClient = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Check if client has assigned COAs
        const { data: coas } = await supabase
            .from('coas')
            .select('id')
            .eq('client_id', id)
            .limit(1);

        if (coas && coas.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'No se puede eliminar: el cliente tiene COAs asignados'
            });
        }

        // Delete sessions first
        await supabase.from('sessions').delete().eq('client_id', id);

        // Delete client
        const { error } = await supabase.from('clients').delete().eq('id', id);

        if (error) {
            return res.status(500).json({ success: false, error: 'Error al eliminar cliente' });
        }

        // Record in Integrity Ledger
        await ledgerService.recordEvent({
            eventType: 'CLIENT_DELETED',
            entityId: id,
            entityType: 'clients',
            payload: { id, timestamp: new Date().toISOString() },
            createdBy: (req as any).clientId
        });

        res.json({ success: true, message: 'Cliente eliminado' });
    } catch (err) {
        console.error('Delete client error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Assign COA to client
export const assignCOAToClient = async (req: Request, res: Response) => {
    try {
        const { coaId } = req.params;
        const { clientId } = req.body;

        // Verify client exists
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, email')
            .eq('id', clientId)
            .single();

        if (clientError || !client) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        // Update COA
        const { data: coa, error } = await supabase
            .from('coas')
            .update({
                client_id: clientId,
                owner_type: 'client',
                owner_id: clientId,
                updated_at: new Date().toISOString()
            })
            .eq('id', coaId)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Error al asignar COA' });
        }

        res.json({
            success: true,
            message: `COA asignado a ${client.name || client.email}`,
            coa
        });
    } catch (err) {
        console.error('Assign COA error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get COAs assigned to a client
export const getClientCOAs = async (req: Request, res: Response) => {
    try {
        const clientId = req.params.clientId || req.clientId;

        const { data, error } = await supabase
            .from('coas')
            .select('*')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, error: 'Error al obtener COAs' });
        }

        // Map COAs to use metadata.batch_number if available, also include custom_name and coa_number
        const mappedCoas = (data || []).map((coa: any) => ({
            ...coa,
            // Use metadata.batch_number if set, otherwise fallback to batch_id
            batch_id: coa.metadata?.batch_number || coa.batch_id
        }));

        res.json({ success: true, coas: mappedCoas });
    } catch (err) {
        console.error('Get client COAs error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get hologram purchase URL
export const getHologramPurchaseUrl = async (req: Request, res: Response) => {
    res.json({
        success: true,
        url: HOLOGRAM_PURCHASE_URL
    });
};

// Check Shopify configuration status
export const checkShopifyStatus = async (req: Request, res: Response) => {
    res.json({
        success: true,
        configured: isShopifyConfigured(),
        message: isShopifyConfigured()
            ? 'Shopify esta configurado correctamente'
            : 'Shopify no esta configurado. Agrega las variables de entorno necesarias.'
    });
};

// Helper function to generate random password
function generateRandomPassword(length: number = 12): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Set default template for a client (super_admin only)
export const setDefaultTemplate = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { template_id } = req.body;

        // Verify template exists if provided
        if (template_id) {
            const { data: template, error: templateError } = await supabase
                .from('pdf_templates')
                .select('id, name')
                .eq('id', template_id)
                .single();

            if (templateError || !template) {
                return res.status(404).json({ success: false, error: 'Template no encontrado' });
            }
        }

        // Update client with default_template_id
        const { data: updatedClient, error: updateError } = await supabase
            .from('clients')
            .update({
                default_template_id: template_id || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('id, email, name, company, default_template_id')
            .single();

        if (updateError) {
            console.error('[Set Default Template] Database error:', updateError);
            return res.status(500).json({ success: false, error: 'Error al actualizar template' });
        }

        if (!updatedClient) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        const message = template_id
            ? `Template predeterminado asignado a ${updatedClient.name || updatedClient.email}`
            : `Template predeterminado removido de ${updatedClient.name || updatedClient.email}`;

        console.log(`[Set Default Template] ${message}`);

        res.json({
            success: true,
            message,
            client: updatedClient
        });

    } catch (err) {
        console.error('[Set Default Template] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get all clients with their default templates (for admin panel)
export const getAllClientsWithTemplates = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('clients')
            .select(`
                id, email, name, phone, company, role, shopify_customer_id,
                is_active, created_at, last_login_at, default_template_id,
                default_template:pdf_templates(id, name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get clients with templates error:', error);
            return res.status(500).json({ success: false, error: 'Error al obtener clientes' });
        }

        res.json({ success: true, clients: data || [] });
    } catch (err) {
        console.error('Get clients with templates error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Sync a single client's COAs to Shopify metafields (super_admin only)
export const syncClientToShopify = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get client with shopify_customer_id
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, email, name, shopify_customer_id')
            .eq('id', id)
            .single();

        if (clientError || !client) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        if (!client.shopify_customer_id) {
            return res.status(400).json({
                success: false,
                error: 'Este cliente no tiene un ID de Shopify asociado'
            });
        }

        // Sync COAs to Shopify
        const synced = await syncClientCOAsToShopify(
            client.shopify_customer_id,
            client.id,
            supabase
        );

        if (synced) {
            console.log(`[Sync Client] Synced ${client.email} to Shopify`);
            res.json({
                success: true,
                message: `Metafields de ${client.name || client.email} sincronizados con Shopify`
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al sincronizar con Shopify'
            });
        }

    } catch (err) {
        console.error('[Sync Client] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Sync ALL clients with Shopify IDs to Shopify metafields (super_admin only)
export const syncAllClientsToShopify = async (req: Request, res: Response) => {
    try {
        // Get all clients with shopify_customer_id
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('id, email, name, shopify_customer_id')
            .not('shopify_customer_id', 'is', null);

        if (clientsError) {
            console.error('[Sync All Clients] Database error:', clientsError);
            return res.status(500).json({ success: false, error: 'Error al obtener clientes' });
        }

        if (!clients || clients.length === 0) {
            return res.json({
                success: true,
                message: 'No hay clientes con ID de Shopify para sincronizar',
                synced: 0,
                failed: 0
            });
        }

        let synced = 0;
        let failed = 0;
        const results: { email: string; success: boolean; error?: string }[] = [];

        for (const client of clients) {
            try {
                const success = await syncClientCOAsToShopify(
                    client.shopify_customer_id!,
                    client.id,
                    supabase
                );

                if (success) {
                    synced++;
                    results.push({ email: client.email, success: true });
                } else {
                    failed++;
                    results.push({ email: client.email, success: false, error: 'Sync failed' });
                }
            } catch (err: any) {
                failed++;
                results.push({ email: client.email, success: false, error: err.message });
            }
        }

        console.log(`[Sync All Clients] Completed: ${synced} synced, ${failed} failed`);

        res.json({
            success: true,
            message: `Sincronizacion completada: ${synced} exitosos, ${failed} fallidos`,
            synced,
            failed,
            total: clients.length,
            details: results
        });

    } catch (err) {
        console.error('[Sync All Clients] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// TEST: Get metafields for a Shopify customer (super_admin only)
export const testShopifyMetafields = async (req: Request, res: Response) => {
    try {
        const { shopifyCustomerId } = req.params;

        if (!isShopifyConfigured()) {
            return res.status(400).json({
                success: false,
                error: 'Shopify no está configurado'
            });
        }

        console.log(`[Test Metafields] Fetching metafields for customer ${shopifyCustomerId}`);

        // Get customer info with tags
        const customer = await getCustomerWithTags(shopifyCustomerId);

        // Get metafields
        const metafields = await getCustomerMetafields(shopifyCustomerId);

        // Group metafields by namespace for easier reading
        const groupedMetafields: Record<string, any[]> = {};
        metafields.forEach(mf => {
            const namespace = mf.namespace || 'no_namespace';
            if (!groupedMetafields[namespace]) {
                groupedMetafields[namespace] = [];
            }
            groupedMetafields[namespace].push({
                key: mf.key,
                value: mf.value,
                type: mf.type,
                id: mf.id
            });
        });

        res.json({
            success: true,
            shopifyConfigured: true,
            customer: customer ? {
                id: customer.id,
                email: customer.email,
                name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
                phone: customer.phone,
                tags: customer.tags,
                tagsArray: customer.tags?.split(',').map(t => t.trim()) || [],
                hasClubPartnerTag: customer.tags?.toLowerCase().includes('club_partner') || false
            } : null,
            metafieldsCount: metafields.length,
            metafieldsByNamespace: groupedMetafields,
            rawMetafields: metafields
        });

    } catch (err: any) {
        console.error('[Test Metafields] Error:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Error del servidor'
        });
    }
};

// Get VIP credential for authenticated client
export const getVIPCredential = async (req: Request, res: Response) => {
    try {
        const clientId = req.clientId;
        console.log('[VIP Credential] Request for clientId:', clientId);

        // Get client with shopify_customer_id
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, email, name, phone, company, shopify_customer_id, credential_photo_url, membership_tier, member_since, custom_member_id')
            .eq('id', clientId)
            .single();

        console.log('[VIP Credential] Client data:', client?.email, 'shopify_id:', client?.shopify_customer_id);

        if (clientError || !client) {
            console.log('[VIP Credential] Client not found:', clientError);
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        // Get all active membership tiers with their Shopify tags
        const { data: tiers, error: tiersError } = await supabase
            .from('membership_tiers')
            .select('id, name, shopify_tag, color, secondary_color, description, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: false }); // Highest sort_order first

        console.log('[VIP Credential] Tiers loaded:', tiers?.length, tiers?.map(t => t.shopify_tag));

        if (tiersError) {
            console.error('[VIP Credential] Error getting tiers:', tiersError);
        }

        // Get customer tags from Shopify
        let customerTags: string[] = [];
        let shopifyData: any = null;
        let metafields: any[] = [];
        let matchedTier: any = null;

        if (client.shopify_customer_id) {
            customerTags = await getCustomerTags(client.shopify_customer_id);
            console.log('[VIP Credential] Customer tags from Shopify:', customerTags);

            // Find which tier matches the customer's tags
            if (tiers && tiers.length > 0) {
                for (const tier of tiers) {
                    if (customerTags.some(tag => tag.toLowerCase() === tier.shopify_tag.toLowerCase())) {
                        matchedTier = tier;
                        console.log('[VIP Credential] Matched tier:', matchedTier.name, 'with tag:', tier.shopify_tag);
                        break; // Use the first matching tier (highest priority since we ordered DESC)
                    }
                }
            }

            if (matchedTier) {
                // Get Shopify customer data
                shopifyData = await getCustomerWithTags(client.shopify_customer_id);

                // Get metafields for additional data (RFC, address, etc.)
                metafields = await getCustomerMetafields(client.shopify_customer_id);
            }
        }

        if (!matchedTier) {
            return res.json({
                success: true,
                isClubPartner: false,
                message: 'Este cliente no es miembro del Club EUM Care',
                customerTags // Include for debugging
            });
        }

        // Parse metafields into usable format
        const metafieldMap: Record<string, string> = {};
        metafields.forEach(mf => {
            metafieldMap[`${mf.namespace}.${mf.key}`] = mf.value;
        });

        // Build credential object
        const credential = {
            memberId: client.custom_member_id || `EUM-${new Date().getFullYear()}-${client.id.substring(0, 6).toUpperCase()}`,
            memberName: client.name || `${shopifyData?.first_name || ''} ${shopifyData?.last_name || ''}`.trim() || client.email,
            memberEmail: client.email,
            memberPhone: client.phone || shopifyData?.phone,
            company: client.company || shopifyData?.default_address?.company,
            memberSince: client.member_since || shopifyData?.created_at,
            tier: matchedTier.id, // Use matched tier from database
            tierName: matchedTier.name,
            tierColor: matchedTier.color,
            tierSecondaryColor: matchedTier.secondary_color,
            status: 'active',
            photoUrl: client.credential_photo_url, // User uploaded photo

            // From Shopify metafields (using actual keys from API)
            rfc: metafieldMap['custom.rfc_tax_id_clave_fiscal_en_mxico_o_equivalente_en_su_pas'] || null,
            fiscalAddress: metafieldMap['custom.direccin_fiscal'] || shopifyData?.default_address?.address1,
            officePhone: metafieldMap['custom.telefono_de_oficina']?.toString() || null,
            birthDate: metafieldMap['facts.birth_date'] || null
        };

        res.json({
            success: true,
            isClubPartner: true,
            credential,
            // Include for debugging
            debug: process.env.NODE_ENV === 'development' ? {
                metafieldMap,
                customerTags,
                matchedTier: matchedTier.shopify_tag
            } : undefined
        });

    } catch (err) {
        console.error('[VIP Credential] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Upload credential photo
export const uploadCredentialPhoto = async (req: Request, res: Response) => {
    try {
        const clientId = req.clientId;
        const { photoUrl } = req.body;

        if (!photoUrl) {
            return res.status(400).json({ success: false, error: 'URL de foto requerida' });
        }

        const { data, error } = await supabase
            .from('clients')
            .update({
                credential_photo_url: photoUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', clientId)
            .select('id, credential_photo_url')
            .single();

        if (error) {
            console.error('[Upload Credential Photo] Error:', error);
            return res.status(500).json({ success: false, error: 'Error al actualizar foto' });
        }

        res.json({
            success: true,
            message: 'Foto de credencial actualizada',
            photoUrl: data.credential_photo_url
        });

    } catch (err) {
        console.error('[Upload Credential Photo] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Update membership tier (super_admin only)
export const updateMembershipTier = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { tier, customMemberId } = req.body;

        const validTiers = ['Partner', 'Gold', 'Platinum', 'Black'];
        if (tier && !validTiers.includes(tier)) {
            return res.status(400).json({
                success: false,
                error: `Tier inválido. Valores permitidos: ${validTiers.join(', ')}`
            });
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (tier) updateData.membership_tier = tier;
        if (customMemberId !== undefined) updateData.custom_member_id = customMemberId;

        // If this is the first time setting tier, set member_since
        const { data: existingClient } = await supabase
            .from('clients')
            .select('member_since')
            .eq('id', id)
            .single();

        if (!existingClient?.member_since && tier) {
            updateData.member_since = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', id)
            .select('id, email, name, membership_tier, custom_member_id, member_since')
            .single();

        if (error) {
            console.error('[Update Membership Tier] Error:', error);
            return res.status(500).json({ success: false, error: 'Error al actualizar membresía' });
        }

        // Record in Integrity Ledger
        await ledgerService.recordEvent({
            eventType: 'MEMBERSHIP_TIER_UPDATED',
            entityId: id,
            entityType: 'clients',
            payload: { tier, customMemberId },
            createdBy: (req as any).clientId
        });

        res.json({
            success: true,
            message: `Membresía actualizada a ${tier}`,
            client: data
        });

    } catch (err) {
        console.error('[Update Membership Tier] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get all membership tiers (for admin panel)
export const getMembershipTiers = async (req: Request, res: Response) => {
    try {
        const { data: tiers, error } = await supabase
            .from('membership_tiers')
            .select('id, name, shopify_tag, color, secondary_color, description, benefits, sort_order, is_active')
            .order('sort_order', { ascending: true });

        if (error) {
            console.error('[Get Membership Tiers] Error:', error);
            return res.status(500).json({ success: false, error: 'Error al obtener tiers' });
        }

        res.json({
            success: true,
            tiers: tiers || []
        });
    } catch (err) {
        console.error('[Get Membership Tiers] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Create new membership tier (super_admin only)
export const createMembershipTier = async (req: Request, res: Response) => {
    try {
        const { id, name, shopify_tag, color, secondary_color, description, benefits, sort_order } = req.body;

        if (!id || !name || !shopify_tag) {
            return res.status(400).json({
                success: false,
                error: 'id, name y shopify_tag son requeridos'
            });
        }

        const { data, error } = await supabase
            .from('membership_tiers')
            .insert({
                id,
                name,
                shopify_tag,
                color: color || '#4F46E5',
                secondary_color: secondary_color || '#818CF8',
                description,
                benefits: benefits || [],
                sort_order: sort_order || 0
            })
            .select()
            .single();

        if (error) {
            console.error('[Create Membership Tier] Error:', error);
            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ success: false, error: 'Ya existe un tier con ese ID o shopify_tag' });
            }
            return res.status(500).json({ success: false, error: 'Error al crear tier' });
        }

        res.json({
            success: true,
            message: `Tier ${name} creado exitosamente`,
            tier: data
        });
    } catch (err) {
        console.error('[Create Membership Tier] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Update membership tier (super_admin only)
export const updateMembershipTierConfig = async (req: Request, res: Response) => {
    try {
        const { tierId } = req.params;
        const { name, shopify_tag, color, secondary_color, description, benefits, sort_order, is_active } = req.body;

        const updateData: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (shopify_tag !== undefined) updateData.shopify_tag = shopify_tag;
        if (color !== undefined) updateData.color = color;
        if (secondary_color !== undefined) updateData.secondary_color = secondary_color;
        if (description !== undefined) updateData.description = description;
        if (benefits !== undefined) updateData.benefits = benefits;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data, error } = await supabase
            .from('membership_tiers')
            .update(updateData)
            .eq('id', tierId)
            .select()
            .single();

        if (error) {
            console.error('[Update Membership Tier Config] Error:', error);
            return res.status(500).json({ success: false, error: 'Error al actualizar tier' });
        }

        if (!data) {
            return res.status(404).json({ success: false, error: 'Tier no encontrado' });
        }

        res.json({
            success: true,
            message: `Tier ${data.name} actualizado`,
            tier: data
        });
    } catch (err) {
        console.error('[Update Membership Tier Config] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Delete membership tier (super_admin only)
export const deleteMembershipTier = async (req: Request, res: Response) => {
    try {
        const { tierId } = req.params;

        const { error } = await supabase
            .from('membership_tiers')
            .delete()
            .eq('id', tierId);

        if (error) {
            console.error('[Delete Membership Tier] Error:', error);
            return res.status(500).json({ success: false, error: 'Error al eliminar tier' });
        }

        res.json({
            success: true,
            message: 'Tier eliminado'
        });
    } catch (err) {
        console.error('[Delete Membership Tier] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Verify member by ID (public endpoint for QR code scanning)
export const verifyMember = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        console.log('[Verify Member] Request for memberId:', memberId);

        if (!memberId) {
            return res.status(400).json({ success: false, error: 'ID de miembro requerido' });
        }

        // Parse member ID format: EUM-YYYY-XXXXXX
        // XXXXXX is the first 6 characters of the client UUID (uppercase)
        const parts = memberId.split('-');
        const uuidPrefix = parts.length >= 3 ? parts.slice(2).join('-').toLowerCase() : '';

        console.log('[Verify Member] Parsed UUID prefix:', uuidPrefix);

        // First try to find by custom_member_id
        let { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, company, shopify_customer_id, credential_photo_url, membership_tier, member_since, custom_member_id')
            .eq('custom_member_id', memberId)
            .single();

        // If not found by custom_member_id, try to find by UUID prefix
        // Note: UUID columns don't support ilike, so we fetch all and filter client-side
        if ((clientError || !client) && uuidPrefix) {
            console.log('[Verify Member] Trying UUID prefix search:', uuidPrefix);
            const { data: allClients, error: allError } = await supabase
                .from('clients')
                .select('id, name, company, shopify_customer_id, credential_photo_url, membership_tier, member_since, custom_member_id');

            if (!allError && allClients) {
                // Find client whose UUID starts with the prefix
                const foundClient = allClients.find(c =>
                    c.id.toLowerCase().startsWith(uuidPrefix)
                );
                if (foundClient) {
                    client = foundClient;
                    clientError = null;
                    console.log('[Verify Member] Found client by UUID prefix:', foundClient.id);
                }
            }
        }

        if (clientError || !client) {
            console.log('[Verify Member] Client not found. Error:', clientError);
            return res.status(404).json({ success: false, error: 'Miembro no encontrado' });
        }

        console.log('[Verify Member] Found client:', client.id, client.name);

        // Get tier info
        let tier = client.membership_tier || 'Partner';
        let tierColor = '#4F46E5';
        let status: 'active' | 'inactive' = 'active';

        // If has shopify_customer_id, verify tags
        if (client.shopify_customer_id) {
            const customerTags = await getCustomerTags(client.shopify_customer_id);
            console.log('[Verify Member] Customer tags:', customerTags);

            // Check if has any club tag
            const { data: tiers } = await supabase
                .from('membership_tiers')
                .select('id, name, shopify_tag, color')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (tiers && tiers.length > 0) {
                for (const t of tiers) {
                    if (customerTags.some(tag => tag.toLowerCase() === t.shopify_tag.toLowerCase())) {
                        tier = t.id;
                        tierColor = t.color;
                        break;
                    }
                }
            }

            // Check if member is still active (has club tag)
            const hasClubTag = customerTags.some(tag =>
                tag.toLowerCase().includes('club') ||
                tag.toLowerCase().includes('partner') ||
                tag.toLowerCase().includes('gold') ||
                tag.toLowerCase().includes('platinum') ||
                tag.toLowerCase().includes('black')
            );
            status = hasClubTag ? 'active' : 'inactive';
        }

        // Generate member ID if not custom
        const displayMemberId = client.custom_member_id ||
            `EUM-${new Date(client.member_since || Date.now()).getFullYear()}-${client.id.substring(0, 6).toUpperCase()}`;

        res.json({
            success: true,
            member: {
                memberId: displayMemberId,
                memberName: client.name || 'Miembro',
                company: client.company,
                tier,
                status,
                memberSince: client.member_since || new Date().toISOString(),
                photoUrl: client.credential_photo_url
            }
        });

    } catch (err) {
        console.error('[Verify Member] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
