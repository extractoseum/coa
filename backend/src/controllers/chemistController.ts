import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logger } from '../utils/Logger';

// Get all chemists
export const getAllChemists = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('chemists')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) {
            logger.error('Get chemists error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to fetch chemists' });
        }

        res.json({ success: true, chemists: data || [] });
    } catch (err) {
        logger.error('Get chemists error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get active chemists only
export const getActiveChemists = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('chemists')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) {
            logger.error('Get active chemists error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to fetch active chemists' });
        }

        res.json({ success: true, chemists: data || [] });
    } catch (err) {
        logger.error('Get active chemists error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get default chemist
export const getDefaultChemist = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('chemists')
            .select('*')
            .eq('is_default', true)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Get default chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to fetch default chemist' });
        }

        res.json({ success: true, chemist: data || null });
    } catch (err) {
        logger.error('Get default chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get chemist by ID
export const getChemistById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('chemists')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, error: 'Chemist not found' });
        }

        res.json({ success: true, chemist: data });
    } catch (err) {
        logger.error('Get chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Create new chemist
export const createChemist = async (req: Request, res: Response) => {
    try {
        const {
            name,
            title,
            credentials,
            license_number,
            license_url,
            signature_url,
            email,
            phone,
            is_active,
            is_default,
            sort_order
        } = req.body;

        // Handle signature file upload if provided
        const file = req.file;
        let finalSignatureUrl = signature_url;

        if (file) {
            const signatureFileName = `chemist-signature-${Date.now()}.${file.originalname.split('.').pop()}`;

            const { error: uploadError } = await supabase.storage
                .from('chemists')
                .upload(signatureFileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });

            if (uploadError) {
                logger.error('Signature upload error:', uploadError, { correlation_id: req.correlationId });
                return res.status(500).json({
                    success: false,
                    error: `Error uploading signature: ${uploadError.message}. Make sure the 'chemists' bucket exists in Supabase Storage.`
                });
            }

            const { data: publicUrl } = supabase.storage
                .from('chemists')
                .getPublicUrl(signatureFileName);
            finalSignatureUrl = publicUrl.publicUrl;
        }

        // If this chemist should be default, remove default from others first
        if (is_default === 'true' || is_default === true) {
            await supabase
                .from('chemists')
                .update({ is_default: false })
                .neq('id', 'placeholder');
        }

        const { data, error } = await supabase
            .from('chemists')
            .insert({
                name: name || 'New Chemist',
                title: title || null,
                credentials: credentials || null,
                license_number: license_number || null,
                license_url: license_url || null,
                signature_url: finalSignatureUrl || null,
                email: email || null,
                phone: phone || null,
                is_active: is_active === 'true' || is_active === true || is_active === undefined,
                is_default: is_default === 'true' || is_default === true,
                sort_order: sort_order ? parseInt(sort_order) : 0
            })
            .select()
            .single();

        if (error) {
            logger.error('Create chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to create chemist' });
        }

        res.json({ success: true, chemist: data });
    } catch (err) {
        logger.error('Create chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Update chemist
export const updateChemist = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const {
            name,
            title,
            credentials,
            license_number,
            license_url,
            signature_url,
            email,
            phone,
            is_active,
            is_default,
            sort_order
        } = req.body;

        const file = req.file;

        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (title !== undefined) updateData.title = title;
        if (credentials !== undefined) updateData.credentials = credentials;
        if (license_number !== undefined) updateData.license_number = license_number;
        if (license_url !== undefined) updateData.license_url = license_url;
        if (signature_url !== undefined) updateData.signature_url = signature_url;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (is_active !== undefined) updateData.is_active = is_active === 'true' || is_active === true;
        if (is_default !== undefined) updateData.is_default = is_default === 'true' || is_default === true;
        if (sort_order !== undefined) updateData.sort_order = parseInt(sort_order);

        // Upload new signature if provided
        if (file) {
            const signatureFileName = `chemist-signature-${id}-${Date.now()}.${file.originalname.split('.').pop()}`;

            const { error: uploadError } = await supabase.storage
                .from('chemists')
                .upload(signatureFileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });

            if (!uploadError) {
                const { data: publicUrl } = supabase.storage
                    .from('chemists')
                    .getPublicUrl(signatureFileName);
                updateData.signature_url = publicUrl.publicUrl;
            }
        }

        // If setting as default, remove default from others first
        if (updateData.is_default === true) {
            await supabase
                .from('chemists')
                .update({ is_default: false })
                .neq('id', id);
        }

        const { data, error } = await supabase
            .from('chemists')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Update chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to update chemist' });
        }

        res.json({ success: true, chemist: data });
    } catch (err) {
        logger.error('Update chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Set chemist as default
export const setDefaultChemist = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Remove default from all chemists first
        await supabase
            .from('chemists')
            .update({ is_default: false })
            .neq('id', 'placeholder');

        // Set the selected chemist as default
        const { data, error } = await supabase
            .from('chemists')
            .update({ is_default: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Set default chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to set default chemist' });
        }

        res.json({ success: true, chemist: data });
    } catch (err) {
        logger.error('Set default chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Delete chemist (soft delete by setting is_active to false)
export const deleteChemist = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Check if it's the default chemist
        const { data: existing } = await supabase
            .from('chemists')
            .select('is_default')
            .eq('id', id)
            .single();

        if (existing?.is_default) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete default chemist. Set another chemist as default first.'
            });
        }

        // Soft delete - set is_active to false
        const { data, error } = await supabase
            .from('chemists')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Delete chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to delete chemist' });
        }

        res.json({ success: true, message: 'Chemist deactivated', chemist: data });
    } catch (err) {
        logger.error('Delete chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Permanently delete chemist
export const permanentlyDeleteChemist = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Check if it's the default chemist
        const { data: existing } = await supabase
            .from('chemists')
            .select('is_default')
            .eq('id', id)
            .single();

        if (existing?.is_default) {
            return res.status(400).json({
                success: false,
                error: 'Cannot permanently delete default chemist. Set another chemist as default first.'
            });
        }

        // Check if chemist is assigned to any COAs
        const { data: coasWithChemist } = await supabase
            .from('coas')
            .select('id')
            .eq('chemist_id', id)
            .limit(1);

        if (coasWithChemist && coasWithChemist.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot permanently delete chemist assigned to COAs. Deactivate instead.'
            });
        }

        const { error } = await supabase
            .from('chemists')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Permanently delete chemist error:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to permanently delete chemist' });
        }

        res.json({ success: true, message: 'Chemist permanently deleted' });
    } catch (err) {
        logger.error('Permanently delete chemist error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Remove signature from chemist
export const removeChemistSignature = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('chemists')
            .update({ signature_url: null, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error('Failed to remove signature:', error, { correlation_id: req.correlationId });
            return res.status(500).json({ success: false, error: 'Failed to remove signature' });
        }

        res.json({ success: true, chemist: data });
    } catch (err) {
        logger.error('Remove signature error:', err, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
