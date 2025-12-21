import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Save COA to user's collection
export const saveCOA = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).clientId;
        const { notes } = req.body;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Get COA by token
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', coaToken)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA not found' });
        }

        // Save to collection
        const { data, error } = await supabase
            .from('user_saved_coas')
            .upsert({
                client_id: clientId,
                coa_id: coa.id,
                notes: notes || null,
                saved_at: new Date().toISOString()
            }, {
                onConflict: 'client_id,coa_id'
            })
            .select()
            .single();

        if (error) {
            console.error('Save COA error:', error);
            return res.status(500).json({ success: false, error: 'Failed to save COA' });
        }

        res.json({ success: true, saved: data });
    } catch (err) {
        console.error('Save COA error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Remove COA from user's collection
export const removeCOA = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).clientId;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Get COA by token
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', coaToken)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA not found' });
        }

        // Remove from collection
        const { error } = await supabase
            .from('user_saved_coas')
            .delete()
            .eq('client_id', clientId)
            .eq('coa_id', coa.id);

        if (error) {
            console.error('Remove COA error:', error);
            return res.status(500).json({ success: false, error: 'Failed to remove COA' });
        }

        res.json({ success: true, message: 'COA removed from collection' });
    } catch (err) {
        console.error('Remove COA error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get user's collection
export const getMyCollection = async (req: Request, res: Response) => {
    try {
        const clientId = (req as any).clientId;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Get saved COAs with COA details
        const { data, error } = await supabase
            .from('user_saved_coas')
            .select(`
                id,
                saved_at,
                notes,
                coas (
                    id,
                    public_token,
                    custom_name,
                    coa_number,
                    product_sku,
                    batch_id,
                    lab_name,
                    analysis_date,
                    compliance_status,
                    product_image_url,
                    cannabinoids
                )
            `)
            .eq('client_id', clientId)
            .order('saved_at', { ascending: false });

        if (error) {
            console.error('Get collection error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch collection' });
        }

        // Transform data to flatten COA info
        const collection = (data || []).map(item => ({
            id: item.id,
            saved_at: item.saved_at,
            notes: item.notes,
            coa: item.coas
        }));

        res.json({ success: true, collection });
    } catch (err) {
        console.error('Get collection error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Check if COA is saved in user's collection
export const checkSaved = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).clientId;

        if (!clientId) {
            return res.json({ success: true, isSaved: false });
        }

        // Get COA by token
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', coaToken)
            .single();

        if (coaError || !coa) {
            return res.json({ success: true, isSaved: false });
        }

        // Check if saved
        const { data, error } = await supabase
            .from('user_saved_coas')
            .select('id')
            .eq('client_id', clientId)
            .eq('coa_id', coa.id)
            .maybeSingle();

        res.json({ success: true, isSaved: !!data });
    } catch (err) {
        console.error('Check saved error:', err);
        res.json({ success: true, isSaved: false });
    }
};

// Update notes for a saved COA
export const updateNotes = async (req: Request, res: Response) => {
    try {
        const { coaToken } = req.params;
        const clientId = (req as any).clientId;
        const { notes } = req.body;

        if (!clientId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Get COA by token
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', coaToken)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA not found' });
        }

        // Update notes
        const { data, error } = await supabase
            .from('user_saved_coas')
            .update({ notes })
            .eq('client_id', clientId)
            .eq('coa_id', coa.id)
            .select()
            .single();

        if (error) {
            console.error('Update notes error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update notes' });
        }

        res.json({ success: true, saved: data });
    } catch (err) {
        console.error('Update notes error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
