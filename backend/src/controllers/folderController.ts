import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Shopify API Key for secure communication
const SHOPIFY_API_KEY = process.env.SHOPIFY_INTEGRATION_API_KEY || '';

// Helper: Get viewer's Shopify tags by email
const getViewerShopifyTags = async (email: string | undefined): Promise<string[]> => {
    if (!email) return [];

    const { data: customer } = await supabase
        .from('shopify_customers_backup')
        .select('tags')
        .eq('email', email.toLowerCase())
        .single();

    if (!customer?.tags) return [];

    return customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
};

// Helper: Check if COA should be visible to viewer based on visibility mode and tags
const isCoaVisibleToViewer = (
    coa: any,
    isOwner: boolean,
    viewerTags: string[]
): boolean => {
    // Owner always sees all their COAs
    if (isOwner) return true;

    const visibilityMode = coa.visibility_mode || (coa.is_hidden ? 'hidden' : 'public');

    switch (visibilityMode) {
        case 'public':
            return true;
        case 'hidden':
            return false;
        case 'tag_restricted':
            // Check if viewer has at least one required tag
            const requiredTags = coa.required_tags || [];
            if (requiredTags.length === 0) return true; // No tags required = public
            return requiredTags.some((tag: string) =>
                viewerTags.some(vt => vt.toLowerCase() === tag.toLowerCase())
            );
        default:
            // Fallback to is_hidden logic for backwards compatibility
            return !coa.is_hidden;
    }
};

// Helper: Build folder tree from flat array
const buildFolderTree = (folders: any[], parentId: string | null = null): any[] => {
    return folders
        .filter(f => f.parent_id === parentId)
        .map(folder => ({
            ...folder,
            children: buildFolderTree(folders, folder.id)
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
};

// Get all folders for authenticated client (returns tree structure)
export const getMyFolders = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'No autenticado' });
        }

        // Get all folders for this client
        const { data: folders, error } = await supabase
            .from('folders')
            .select('*')
            .eq('client_id', clientId)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // Get COA counts for each folder
        const folderIds = (folders || []).map(f => f.id);
        let countMap: { [key: string]: number } = {};

        if (folderIds.length > 0) {
            const { data: items } = await supabase
                .from('folder_coas')
                .select('folder_id')
                .in('folder_id', folderIds);

            if (items) {
                items.forEach((item: any) => {
                    countMap[item.folder_id] = (countMap[item.folder_id] || 0) + 1;
                });
            }
        }

        // Add coa_count to each folder
        const foldersWithCount = (folders || []).map(folder => ({
            ...folder,
            coa_count: countMap[folder.id] || 0
        }));

        // Build tree structure
        const tree = buildFolderTree(foldersWithCount);

        res.json({
            success: true,
            folders: tree,           // Tree structure
            flatFolders: foldersWithCount  // Flat list for easier lookup
        });
    } catch (error) {
        console.error('Error fetching folders:', error);
        res.status(500).json({ success: false, error: 'Error al obtener carpetas' });
    }
};

// Create a new folder (supports subcarpetas with parent_id)
export const createFolder = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { name, description, parent_id } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }

        // If parent_id is provided, verify it belongs to this client
        if (parent_id) {
            const { data: parent } = await supabase
                .from('folders')
                .select('id')
                .eq('id', parent_id)
                .eq('client_id', clientId)
                .single();

            if (!parent) {
                return res.status(400).json({ success: false, error: 'Carpeta padre no encontrada' });
            }
        }

        // Get max sort_order for same parent level
        const { data: siblings } = await supabase
            .from('folders')
            .select('sort_order')
            .eq('client_id', clientId)
            .eq('parent_id', parent_id || null)
            .order('sort_order', { ascending: false })
            .limit(1);

        const newSortOrder = (siblings?.[0]?.sort_order || 0) + 1;

        const { data: folder, error } = await supabase
            .from('folders')
            .insert({
                client_id: clientId,
                parent_id: parent_id || null,
                name,
                description: description || null,
                sort_order: newSortOrder
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ success: false, error: 'Ya existe una carpeta con ese nombre en esta ubicación' });
            }
            throw error;
        }

        res.json({ success: true, folder: { ...folder, coa_count: 0, children: [] } });
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ success: false, error: 'Error al crear carpeta' });
    }
};

// Update a folder
export const updateFolder = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id } = req.params;
        const { name, description, is_public, sort_order, parent_id } = req.body;

        console.log('updateFolder called:', { id, clientId, parent_id, body: req.body });

        // Verify ownership
        const { data: existing, error: existingError } = await supabase
            .from('folders')
            .select('id, parent_id, client_id')
            .eq('id', id)
            .eq('client_id', clientId)
            .single();

        console.log('Existing folder:', existing, 'Error:', existingError);

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // If changing parent_id, verify new parent belongs to same client
        if (parent_id !== undefined && parent_id !== existing.parent_id) {
            if (parent_id !== null) {
                const { data: newParent } = await supabase
                    .from('folders')
                    .select('id')
                    .eq('id', parent_id)
                    .eq('client_id', clientId)
                    .single();

                if (!newParent) {
                    return res.status(400).json({ success: false, error: 'Carpeta padre no válida' });
                }

                // Prevent moving a folder into its own descendant
                if (parent_id === id) {
                    return res.status(400).json({ success: false, error: 'No puedes mover una carpeta dentro de sí misma' });
                }
            }
        }

        const updateData: any = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (is_public !== undefined) updateData.is_public = is_public;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (parent_id !== undefined) updateData.parent_id = parent_id;

        const { data: folder, error } = await supabase
            .from('folders')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Supabase error updating folder:', error);
            if (error.code === '23505') {
                return res.status(400).json({ success: false, error: 'Ya existe una carpeta con ese nombre en esta ubicación' });
            }
            throw error;
        }

        res.json({ success: true, folder });
    } catch (error) {
        console.error('Error updating folder:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar carpeta' });
    }
};

// Delete a folder (cascade deletes children and folder items)
export const deleteFolder = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id } = req.params;

        // Verify ownership
        const { data: existing } = await supabase
            .from('folders')
            .select('id')
            .eq('id', id)
            .eq('client_id', clientId)
            .single();

        if (!existing) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // Delete folder (children will cascade delete due to FK constraint)
        const { error } = await supabase
            .from('folders')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Carpeta eliminada' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar carpeta' });
    }
};

// Add COA to folder
export const addCOAToFolder = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id: folderId } = req.params;
        const { coa_id } = req.body;

        // Verify folder ownership
        const { data: folder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', folderId)
            .eq('client_id', clientId)
            .single();

        if (!folder) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // Verify COA ownership
        const { data: coa } = await supabase
            .from('coas')
            .select('id')
            .eq('id', coa_id)
            .eq('client_id', clientId)
            .single();

        if (!coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado o no te pertenece' });
        }

        // Get max sort_order in folder
        const { data: items } = await supabase
            .from('folder_coas')
            .select('sort_order')
            .eq('folder_id', folderId)
            .order('sort_order', { ascending: false })
            .limit(1);

        const newSortOrder = (items?.[0]?.sort_order || 0) + 1;

        const { error } = await supabase
            .from('folder_coas')
            .insert({
                folder_id: folderId,
                coa_id,
                sort_order: newSortOrder
            });

        if (error) {
            if (error.code === '23505') { // Unique violation
                return res.status(400).json({ success: false, error: 'El COA ya está en esta carpeta' });
            }
            throw error;
        }

        res.json({ success: true, message: 'COA agregado a la carpeta' });
    } catch (error) {
        console.error('Error adding COA to folder:', error);
        res.status(500).json({ success: false, error: 'Error al agregar COA' });
    }
};

// Remove COA from folder
export const removeCOAFromFolder = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id: folderId, coaId } = req.params;

        // Verify folder ownership
        const { data: folder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', folderId)
            .eq('client_id', clientId)
            .single();

        if (!folder) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        const { error } = await supabase
            .from('folder_coas')
            .delete()
            .eq('folder_id', folderId)
            .eq('coa_id', coaId);

        if (error) throw error;

        res.json({ success: true, message: 'COA removido de la carpeta' });
    } catch (error) {
        console.error('Error removing COA from folder:', error);
        res.status(500).json({ success: false, error: 'Error al remover COA' });
    }
};

// Get folder by public token (for QR sharing)
export const getFolderByToken = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // First get the folder
        const { data: folder, error: folderError } = await supabase
            .from('folders')
            .select(`
                id,
                name,
                description,
                is_public,
                client_id,
                parent_id,
                created_at
            `)
            .eq('public_token', token)
            .single();

        if (folderError || !folder) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // Check if folder is public or user is authenticated owner
        const clientId = (req as any).client?.id || req.clientId;
        if (!folder.is_public && folder.client_id !== clientId) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        // Get client info
        const { data: client } = await supabase
            .from('clients')
            .select('name, company')
            .eq('id', folder.client_id)
            .single();

        // Get COAs in this folder with their details
        const { data: folderItems } = await supabase
            .from('folder_coas')
            .select('coa_id, sort_order')
            .eq('folder_id', folder.id)
            .order('sort_order', { ascending: true });

        let coas: any[] = [];
        const isOwner = folder.client_id === clientId;

        // Get viewer's email for tag-based filtering
        const viewerEmail = (req as any).client?.email;
        const viewerTags = await getViewerShopifyTags(viewerEmail);

        if (folderItems && folderItems.length > 0) {
            const coaIds = folderItems.map(item => item.coa_id);
            const { data: coaData } = await supabase
                .from('coas')
                .select(`
                    id,
                    public_token,
                    lab_report_number,
                    product_sku,
                    batch_id,
                    custom_title,
                    custom_name,
                    coa_number,
                    compliance_status,
                    product_image_url,
                    is_hidden,
                    visibility_mode,
                    required_tags,
                    created_at,
                    metadata
                `)
                .in('id', coaIds);

            // Sort COAs according to folder item sort_order
            if (coaData) {
                const coaMap = new Map(coaData.map(coa => [coa.id, coa]));
                coas = folderItems
                    .map(item => coaMap.get(item.coa_id))
                    .filter(Boolean)
                    // Filter COAs based on visibility mode and viewer's tags
                    .filter((coa: any) => isCoaVisibleToViewer(coa, isOwner, viewerTags))
                    .map((coa: any) => ({
                        ...coa,
                        // Use metadata.batch_number if set, otherwise batch_id
                        batch_id: coa.metadata?.batch_number || coa.batch_id
                    }));
            }
        }

        // Get public subfolders only (for public view, only show public children)
        const { data: subfolders } = await supabase
            .from('folders')
            .select('id, name, description, public_token, is_public')
            .eq('parent_id', folder.id)
            .eq('is_public', true)
            .order('sort_order', { ascending: true });

        // Transform response
        const response = {
            id: folder.id,
            name: folder.name,
            description: folder.description,
            is_public: folder.is_public,
            owner: client?.company || client?.name || 'Cliente',
            coas,
            subfolders: subfolders || [],
            coa_count: coas.length
        };

        res.json({ success: true, folder: response });
    } catch (error) {
        console.error('Error fetching folder by token:', error);
        res.status(500).json({ success: false, error: 'Error al obtener carpeta' });
    }
};

// Reorder COAs in folder
export const reorderFolderCOAs = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id: folderId } = req.params;
        const { coa_ids } = req.body; // Array of COA IDs in new order

        // Verify folder ownership
        const { data: folder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', folderId)
            .eq('client_id', clientId)
            .single();

        if (!folder) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // Update sort_order for each COA
        for (let i = 0; i < coa_ids.length; i++) {
            await supabase
                .from('folder_coas')
                .update({ sort_order: i })
                .eq('folder_id', folderId)
                .eq('coa_id', coa_ids[i]);
        }

        res.json({ success: true, message: 'Orden actualizado' });
    } catch (error) {
        console.error('Error reordering COAs:', error);
        res.status(500).json({ success: false, error: 'Error al reordenar COAs' });
    }
};

// Get folders for a Shopify customer by email (secured with API Key)
export const getShopifyCustomerFolders = async (req: Request, res: Response) => {
    try {
        // Validate API Key for Shopify integration
        const apiKey = req.headers['x-shopify-api-key'] as string;

        if (!SHOPIFY_API_KEY) {
            console.error('SHOPIFY_INTEGRATION_API_KEY not configured');
            return res.status(500).json({ success: false, error: 'API Key no configurada' });
        }

        if (!apiKey || apiKey !== SHOPIFY_API_KEY) {
            return res.status(401).json({ success: false, error: 'API Key inválida o no proporcionada' });
        }

        const { email } = req.params;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email requerido' });
        }

        // Find client by email
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, company')
            .eq('email', email.toLowerCase())
            .single();

        if (clientError || !client) {
            return res.json({ success: true, folders: [], coas: [] });
        }

        // Get all folders for this client
        const { data: folders, error: foldersError } = await supabase
            .from('folders')
            .select('id, name, description, public_token, is_public, parent_id, sort_order')
            .eq('client_id', client.id)
            .order('sort_order', { ascending: true });

        if (foldersError) throw foldersError;

        // Get COA counts for each folder
        const folderIds = (folders || []).map(f => f.id);
        let folderCoaMap: { [key: string]: any[] } = {};

        if (folderIds.length > 0) {
            const { data: folderItems } = await supabase
                .from('folder_coas')
                .select('folder_id, coa_id, sort_order')
                .in('folder_id', folderIds)
                .order('sort_order', { ascending: true });

            if (folderItems && folderItems.length > 0) {
                // Group by folder
                folderItems.forEach((item: any) => {
                    if (!folderCoaMap[item.folder_id]) {
                        folderCoaMap[item.folder_id] = [];
                    }
                    folderCoaMap[item.folder_id].push(item.coa_id);
                });

                // Get all COA details
                const allCoaIds = folderItems.map(item => item.coa_id);
                const { data: coaData } = await supabase
                    .from('coas')
                    .select(`
                        id,
                        public_token,
                        lab_report_number,
                        product_sku,
                        batch_id,
                        custom_title,
                        custom_name,
                        coa_number,
                        compliance_status,
                        product_image_url,
                        metadata
                    `)
                    .in('id', allCoaIds);

                if (coaData) {
                    const coaMap = new Map(coaData.map(coa => [coa.id, coa]));
                    // Replace IDs with full COA objects in each folder
                    for (const folderId of Object.keys(folderCoaMap)) {
                        folderCoaMap[folderId] = folderCoaMap[folderId]
                            .map(coaId => coaMap.get(coaId))
                            .filter(Boolean)
                            .map((coa: any) => ({
                                id: coa.id,
                                token: coa.public_token,
                                name: coa.custom_name || coa.custom_title || coa.product_sku || coa.lab_report_number || 'COA',
                                batch: coa.metadata?.batch_number || coa.batch_id || '',
                                coa_number: coa.coa_number || '',
                                image: coa.product_image_url,
                                status: coa.compliance_status
                            }));
                    }
                }
            }
        }

        // Also get COAs not in any folder
        const { data: allCoas } = await supabase
            .from('coas')
            .select(`
                id,
                public_token,
                lab_report_number,
                product_sku,
                batch_id,
                custom_title,
                custom_name,
                coa_number,
                compliance_status,
                product_image_url,
                metadata
            `)
            .eq('client_id', client.id);

        // Find COAs not in any folder
        const coasInFolders = new Set(Object.values(folderCoaMap).flat().map((c: any) => c.id));
        const unfiledCoas = (allCoas || [])
            .filter(coa => !coasInFolders.has(coa.id))
            .map(coa => ({
                id: coa.id,
                token: coa.public_token,
                name: coa.custom_name || coa.custom_title || coa.product_sku || coa.lab_report_number || 'COA',
                batch: coa.metadata?.batch_number || coa.batch_id || '',
                coa_number: coa.coa_number || '',
                image: coa.product_image_url,
                status: coa.compliance_status
            }));

        // Build folder response with nested COAs
        const buildFolderResponse = (folders: any[], parentId: string | null = null): any[] => {
            return folders
                .filter(f => f.parent_id === parentId)
                .map(folder => ({
                    id: folder.id,
                    name: folder.name,
                    description: folder.description,
                    token: folder.public_token,
                    coas: folderCoaMap[folder.id] || [],
                    coa_count: (folderCoaMap[folder.id] || []).length,
                    subfolders: buildFolderResponse(folders, folder.id)
                }));
        };

        const folderTree = buildFolderResponse(folders || []);

        res.json({
            success: true,
            client_name: client.company || client.name,
            folders: folderTree,
            unfiled_coas: unfiledCoas
        });
    } catch (error) {
        console.error('Error fetching Shopify customer folders:', error);
        res.status(500).json({ success: false, error: 'Error al obtener carpetas' });
    }
};

// Get folder contents (COAs) by folder ID - for authenticated users
export const getFolderContents = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).client?.id || req.clientId;
        const { id: folderId } = req.params;

        // Verify folder ownership
        const { data: folder } = await supabase
            .from('folders')
            .select('*')
            .eq('id', folderId)
            .eq('client_id', clientId)
            .single();

        if (!folder) {
            return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
        }

        // Get COAs in this folder
        const { data: folderItems } = await supabase
            .from('folder_coas')
            .select('coa_id, sort_order')
            .eq('folder_id', folderId)
            .order('sort_order', { ascending: true });

        let coas: any[] = [];
        if (folderItems && folderItems.length > 0) {
            const coaIds = folderItems.map(item => item.coa_id);
            const { data: coaData } = await supabase
                .from('coas')
                .select(`
                    id,
                    public_token,
                    lab_report_number,
                    product_sku,
                    batch_id,
                    custom_title,
                    custom_name,
                    coa_number,
                    compliance_status,
                    product_image_url,
                    created_at,
                    metadata
                `)
                .in('id', coaIds);

            if (coaData) {
                const coaMap = new Map(coaData.map(coa => [coa.id, coa]));
                coas = folderItems
                    .map(item => coaMap.get(item.coa_id))
                    .filter(Boolean)
                    .map((coa: any) => ({
                        ...coa,
                        batch_id: coa.metadata?.batch_number || coa.batch_id
                    }));
            }
        }

        res.json({
            success: true,
            folder,
            coas,
            coa_count: coas.length
        });
    } catch (error) {
        console.error('Error fetching folder contents:', error);
        res.status(500).json({ success: false, error: 'Error al obtener contenido de carpeta' });
    }
};
