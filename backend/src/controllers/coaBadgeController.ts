import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { logBadge } from '../services/loggerService';

/**
 * Get badges for a specific COA
 * GET /api/v1/coas/:token/badges
 */
export const getCOABadges = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Get badges for this COA
        const { data: coaBadges, error } = await supabase
            .from('coa_badges')
            .select(`
                badge_id,
                badges (
                    id,
                    name,
                    image_url,
                    description
                )
            `)
            .eq('coa_id', coa.id);

        if (error) throw error;

        // Extract badges from relation
        const badges = (coaBadges || []).map((cb: any) => cb.badges);

        res.json({
            success: true,
            badges
        });

    } catch (error) {
        console.error('Get COA badges error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Assign badges to a COA
 * POST /api/v1/coas/:token/badges
 * Body: { badge_ids: [1, 2, 3] }
 */
export const assignBadgesToCOA = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { badge_ids } = req.body;

        if (!Array.isArray(badge_ids)) {
            return res.status(400).json({ error: 'badge_ids must be an array' });
        }

        // Get COA
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Remove all existing badges for this COA
        await supabase
            .from('coa_badges')
            .delete()
            .eq('coa_id', coa.id);

        // Insert new badge assignments
        if (badge_ids.length > 0) {
            const assignments = badge_ids.map(badge_id => ({
                coa_id: coa.id,
                badge_id
            }));

            const { error: insertError } = await supabase
                .from('coa_badges')
                .insert(assignments);

            if (insertError) throw insertError;
        }

        res.json({
            success: true,
            message: `${badge_ids.length} badge(s) assigned to COA`
        });

        // Log badge assignment
        await logBadge('badge_assigned_to_coa', { coa_token: token, badge_ids });

    } catch (error) {
        console.error('Assign badges error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
