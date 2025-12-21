import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

/**
 * Get all CVV codes for a COA
 * GET /api/v1/coas/:token/cvv-codes
 */
export const getCVVCodes = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        // 1. Get COA ID
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // 2. Get all CVVs
        const { data: cvvs, error: cvvsError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('coa_id', coa.id)
            .order('generated_at', { ascending: false });

        if (cvvsError) throw cvvsError;

        res.json({
            success: true,
            total: cvvs.length,
            data: cvvs
        });

    } catch (error) {
        console.error('Get CVV Codes Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
