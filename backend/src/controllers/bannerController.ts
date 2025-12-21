import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import crypto from 'crypto';

// Get active banner (the one currently displayed on PDFs)
export const getActiveBanner = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('promo_banners')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get active banner error:', error);
            return res.status(500).json({ error: 'Error fetching active banner' });
        }

        res.json({
            success: true,
            banner: data || null
        });
    } catch (err) {
        console.error('Get active banner error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get all banners
export const getAllBanners = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('promo_banners')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get all banners error:', error);
            return res.status(500).json({ error: 'Error fetching banners' });
        }

        res.json({
            success: true,
            banners: data || []
        });
    } catch (err) {
        console.error('Get all banners error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Create a new banner
export const createBanner = async (req: Request, res: Response) => {
    try {
        const file = req.file;
        const { title, description, link_url, is_active } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'Banner image is required' });
        }

        // Upload image to Supabase Storage
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExt}`;
        const filePath = `banners/${fileName}`;

        const { error: uploadError } = await supabase
            .storage
            .from('coas')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (uploadError) {
            console.error('Banner upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload banner image' });
        }

        const { data: urlData } = supabase.storage.from('coas').getPublicUrl(filePath);
        const imageUrl = urlData.publicUrl;

        // If this banner is being set as active, deactivate all others first
        if (is_active === 'true' || is_active === true) {
            await supabase
                .from('promo_banners')
                .update({ is_active: false })
                .eq('is_active', true);
        }

        // Insert banner record
        const { data, error } = await supabase
            .from('promo_banners')
            .insert({
                title: title || 'Promotional Banner',
                description: description || '',
                image_url: imageUrl,
                link_url: link_url || '',
                is_active: is_active === 'true' || is_active === true
            })
            .select()
            .single();

        if (error) {
            console.error('Banner insert error:', error);
            return res.status(500).json({ error: 'Failed to create banner' });
        }

        res.status(201).json({
            success: true,
            message: 'Banner created successfully',
            banner: data
        });
    } catch (err) {
        console.error('Create banner error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update banner
export const updateBanner = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, description, link_url, is_active } = req.body;

    try {
        // If this banner is being set as active, deactivate all others first
        if (is_active === true) {
            await supabase
                .from('promo_banners')
                .update({ is_active: false })
                .eq('is_active', true);
        }

        const { data, error } = await supabase
            .from('promo_banners')
            .update({
                title,
                description,
                link_url,
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Banner update error:', error);
            return res.status(500).json({ error: 'Failed to update banner' });
        }

        res.json({
            success: true,
            message: 'Banner updated successfully',
            banner: data
        });
    } catch (err) {
        console.error('Update banner error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Set banner as active
export const setActiveBanner = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Deactivate all banners first
        await supabase
            .from('promo_banners')
            .update({ is_active: false })
            .eq('is_active', true);

        // Activate the selected banner
        const { data, error } = await supabase
            .from('promo_banners')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Set active banner error:', error);
            return res.status(500).json({ error: 'Failed to set active banner' });
        }

        res.json({
            success: true,
            message: 'Banner activated successfully',
            banner: data
        });
    } catch (err) {
        console.error('Set active banner error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Deactivate all banners (no banner on PDFs)
export const deactivateAllBanners = async (req: Request, res: Response) => {
    try {
        await supabase
            .from('promo_banners')
            .update({ is_active: false })
            .eq('is_active', true);

        res.json({
            success: true,
            message: 'All banners deactivated'
        });
    } catch (err) {
        console.error('Deactivate banners error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Delete banner
export const deleteBanner = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Get banner to delete image from storage
        const { data: banner } = await supabase
            .from('promo_banners')
            .select('image_url')
            .eq('id', id)
            .single();

        if (banner?.image_url) {
            // Extract file path from URL
            const urlParts = banner.image_url.split('/');
            const filePath = `banners/${urlParts[urlParts.length - 1]}`;

            await supabase.storage.from('coas').remove([filePath]);
        }

        const { error } = await supabase
            .from('promo_banners')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete banner error:', error);
            return res.status(500).json({ error: 'Failed to delete banner' });
        }

        res.json({
            success: true,
            message: 'Banner deleted successfully'
        });
    } catch (err) {
        console.error('Delete banner error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};
