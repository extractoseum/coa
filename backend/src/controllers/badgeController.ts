import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { uploadFileToStorage, deleteFileFromStorage } from '../utils/storage';

/**
 * Get all badges
 * GET /api/v1/badges
 */
export const getAllBadges = async (req: Request, res: Response) => {
    try {
        const { data: badges, error } = await supabase
            .from('badges')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            badges: badges || []
        });

    } catch (error) {
        console.error('Get badges error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Create a new badge
 * POST /api/v1/badges
 * Body: { name, description? }
 * File: image (PNG/SVG)
 */
export const createBadge = async (req: Request, res: Response) => {
    try {
        const { name, description } = req.body;
        const file = (req as any).file;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (!file) {
            return res.status(400).json({ error: 'Badge image is required' });
        }

        // Upload to storage
        const imageUrl = await uploadFileToStorage(
            'badges',
            file.buffer,
            file.originalname
        );

        // Insert to database
        const { data: badge, error } = await supabase
            .from('badges')
            .insert({
                name,
                image_url: imageUrl,
                description: description || null
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            badge
        });

    } catch (error) {
        console.error('Create badge error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Delete a badge
 * DELETE /api/v1/badges/:id
 */
export const deleteBadge = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get badge to delete image from storage
        const { data: badge, error: fetchError } = await supabase
            .from('badges')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError || !badge) {
            return res.status(404).json({ error: 'Badge not found' });
        }

        // Delete from storage
        await deleteFileFromStorage('badges', badge.image_url);

        // Delete from database (cascade will remove from coa_badges)
        const { error: deleteError } = await supabase
            .from('badges')
            .delete()
            .eq('id', id);

        if (deleteError) throw deleteError;

        res.json({
            success: true,
            message: 'Badge deleted successfully'
        });

    } catch (error) {
        console.error('Delete badge error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
