import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { uploadFileToStorage, deleteFileFromStorage } from '../utils/storage';

/**
 * Upload product image for a COA
 * POST /api/v1/coas/:token/product-image
 */
export const uploadProductImage = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const file = (req as any).file; // Multer file

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, product_image_url')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Delete old image if exists
        if (coa.product_image_url) {
            await deleteFileFromStorage('product-images', coa.product_image_url);
        }

        // Upload new image
        const imageUrl = await uploadFileToStorage(
            'product-images',
            file.buffer,
            file.originalname,
            token
        );

        // Update COA
        const { error: updateError } = await supabase
            .from('coas')
            .update({ product_image_url: imageUrl })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            product_image_url: imageUrl
        });

    } catch (error) {
        console.error('Upload product image error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Get available watermarks (from storage bucket)
 * GET /api/v1/watermarks
 */
export const getAvailableWatermarks = async (req: Request, res: Response) => {
    try {
        // List files in the watermarks bucket
        const { data: files, error } = await supabase
            .storage
            .from('watermarks')
            .list('', {
                limit: 100,
                sortBy: { column: 'name', order: 'asc' }
            });

        if (error) throw error;

        // Get public URLs for each watermark
        const watermarks = (files || [])
            .filter(file => file.name && !file.name.startsWith('.'))
            .map(file => {
                const { data: { publicUrl } } = supabase
                    .storage
                    .from('watermarks')
                    .getPublicUrl(file.name);

                return {
                    name: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
                    filename: file.name,
                    url: publicUrl,
                    created_at: file.created_at
                };
            });

        res.json({
            success: true,
            watermarks
        });

    } catch (error) {
        console.error('Get watermarks error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Upload watermark for a COA
 * POST /api/v1/coas/:token/watermark
 */
export const uploadWatermark = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const file = (req as any).file;
        const { opacity } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, watermark_url, metadata')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        if (coa.watermark_url) {
            await deleteFileFromStorage('watermarks', coa.watermark_url);
        }

        const watermarkUrl = await uploadFileToStorage(
            'watermarks',
            file.buffer,
            file.originalname,
            token
        );

        // Update COA with watermark URL and opacity in metadata
        const updatedMetadata = {
            ...(coa.metadata || {}),
            watermark_opacity: opacity ? parseFloat(opacity) : 0.15
        };

        const { error: updateError } = await supabase
            .from('coas')
            .update({
                watermark_url: watermarkUrl,
                metadata: updatedMetadata
            })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            watermark_url: watermarkUrl,
            watermark_opacity: updatedMetadata.watermark_opacity
        });

    } catch (error) {
        console.error('Upload watermark error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Set watermark from existing URL (select pre-loaded watermark)
 * PATCH /api/v1/coas/:token/watermark-config
 */
export const updateWatermarkConfig = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { watermark_url, opacity } = req.body;

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, metadata')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Update metadata with watermark opacity
        const updatedMetadata = {
            ...(coa.metadata || {}),
            watermark_opacity: opacity !== undefined ? parseFloat(opacity) : 0.15
        };

        const updateData: any = { metadata: updatedMetadata };

        // If watermark_url is provided, update it (can be null to remove)
        if (watermark_url !== undefined) {
            updateData.watermark_url = watermark_url;
        }

        const { error: updateError } = await supabase
            .from('coas')
            .update(updateData)
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            watermark_url: watermark_url,
            watermark_opacity: updatedMetadata.watermark_opacity
        });

    } catch (error) {
        console.error('Update watermark config error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Upload additional document
 * POST /api/v1/coas/:token/documents
 * Body: { type: string }
 */
export const uploadAdditionalDocument = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { type } = req.body;
        const file = (req as any).file;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        if (!type) {
            return res.status(400).json({ error: 'Document type required' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, additional_docs')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Upload document
        const docUrl = await uploadFileToStorage(
            'coa-documents',
            file.buffer,
            file.originalname,
            token
        );

        // Add to additional_docs array
        const docs = (coa.additional_docs as any[]) || [];
        docs.push({
            type,
            filename: file.originalname,
            url: docUrl
        });

        const { error: updateError } = await supabase
            .from('coas')
            .update({ additional_docs: docs })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            document: {
                type,
                filename: file.originalname,
                url: docUrl
            }
        });

    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Delete additional document
 * DELETE /api/v1/coas/:token/documents/:index
 */
export const deleteAdditionalDocument = async (req: Request, res: Response) => {
    try {
        const { token, index } = req.params;
        const docIndex = parseInt(index);

        if (isNaN(docIndex) || docIndex < 0) {
            return res.status(400).json({ error: 'Invalid document index' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, additional_docs')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        const docs = (coa.additional_docs as any[]) || [];

        if (docIndex >= docs.length) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Remove document at index
        const removedDoc = docs[docIndex];
        docs.splice(docIndex, 1);

        const { error: updateError } = await supabase
            .from('coas')
            .update({ additional_docs: docs })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        console.log(`[Delete Document] Removed "${removedDoc.type}" from COA ${token}`);

        res.json({
            success: true,
            message: `Documento "${removedDoc.type}" eliminado`
        });

    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Update purchase links
 * PATCH /api/v1/coas/:token/purchase-links
 * Body: { links: [{label, url}] }
 */
export const updatePurchaseLinks = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { links } = req.body;

        if (!Array.isArray(links)) {
            return res.status(400).json({ error: 'Links must be an array' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        const { error: updateError } = await supabase
            .from('coas')
            .update({ purchase_links: links })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            purchase_links: links
        });

    } catch (error) {
        console.error('Update purchase links error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Update extended metadata
 * PATCH /api/v1/coas/:token/metadata
 * Body: { metadata: {...} }
 */
export const updateExtendedMetadata = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { metadata: newMetadata } = req.body;

        if (!newMetadata || typeof newMetadata !== 'object') {
            return res.status(400).json({ error: 'Invalid metadata' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, metadata')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Merge with existing metadata
        const updatedMetadata = {
            ...(coa.metadata as object || {}),
            ...newMetadata
        };

        const { error: updateError } = await supabase
            .from('coas')
            .update({ metadata: updatedMetadata })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            metadata: updatedMetadata
        });

    } catch (error) {
        console.error('Update metadata error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Update COA custom name and number
 * PATCH /api/v1/coas/:token/basic-info
 */
export const updateBasicInfo = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { custom_name, coa_number } = req.body;

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, coa_number, custom_name')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Build update object - only include fields that are provided
        const updateData: any = {};

        if (custom_name !== undefined) {
            updateData.custom_name = custom_name || null;
        }

        // Only update coa_number if explicitly provided and different from current
        if (coa_number !== undefined && coa_number !== coa.coa_number) {
            // Check if the new coa_number already exists
            if (coa_number) {
                const { data: existing } = await supabase
                    .from('coas')
                    .select('id')
                    .eq('coa_number', coa_number)
                    .neq('id', coa.id)
                    .single();

                if (existing) {
                    return res.status(400).json({
                        success: false,
                        error: `El número de COA "${coa_number}" ya existe. Usa un número diferente.`
                    });
                }
            }
            updateData.coa_number = coa_number || null;
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length === 0) {
            return res.json({
                success: true,
                message: 'No hay cambios que guardar',
                custom_name: coa.custom_name,
                coa_number: coa.coa_number
            });
        }

        // Update basic info
        const { data: updated, error: updateError } = await supabase
            .from('coas')
            .update(updateData)
            .eq('id', coa.id)
            .select('custom_name, coa_number')
            .single();

        if (updateError) {
            console.error('Update basic info DB error:', updateError);
            // Check for unique constraint violation
            if (updateError.code === '23505') {
                return res.status(400).json({
                    success: false,
                    error: 'El número de COA ya existe. Usa un número diferente.'
                });
            }
            throw updateError;
        }

        res.json({
            success: true,
            custom_name: updated?.custom_name,
            coa_number: updated?.coa_number
        });

    } catch (error) {
        console.error('Update basic info error:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar información' });
    }
};

/**
 * Upload company logo
 * POST /api/v1/coas/:token/company-logo
 */
export const uploadCompanyLogo = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const file = (req as any).file;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, metadata')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Delete old logo if exists
        const oldLogoUrl = (coa.metadata as any)?.company_logo_url;
        if (oldLogoUrl) {
            await deleteFileFromStorage('company-logos', oldLogoUrl);
        }

        // Upload new logo
        const logoUrl = await uploadFileToStorage(
            'company-logos',
            file.buffer,
            file.originalname,
            token
        );

        // Update metadata with logo URL
        const updatedMetadata = {
            ...(coa.metadata as object || {}),
            company_logo_url: logoUrl
        };

        const { error: updateError } = await supabase
            .from('coas')
            .update({ metadata: updatedMetadata })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            company_logo_url: logoUrl
        });

    } catch (error) {
        console.error('Upload company logo error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Update COA template
 * PATCH /api/v1/coas/:token/template
 * Body: { template_id: string | null }
 */
export const updateTemplate = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { template_id } = req.body;

        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // If template_id is provided, verify it exists
        if (template_id) {
            const { data: template, error: templateError } = await supabase
                .from('pdf_templates')
                .select('id')
                .eq('id', template_id)
                .single();

            if (templateError || !template) {
                return res.status(400).json({ error: 'Template not found' });
            }
        }

        const { error: updateError } = await supabase
            .from('coas')
            .update({ template_id: template_id || null })
            .eq('id', coa.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            template_id: template_id || null
        });

    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
