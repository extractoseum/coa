import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Get global settings (company branding)
export const getSettings = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('global_settings')
            .select('*')
            .eq('id', 'main')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get settings error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch settings' });
        }

        // Return default settings if none exist
        const settings = data || {
            id: 'main',
            company_name: 'EXTRACTOS EUM™',
            company_logo_url: null,
            primary_color: '#1a5c3e',
            secondary_color: '#10b981'
        };

        res.json({ success: true, settings });
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Update global settings
export const updateSettings = async (req: Request, res: Response) => {
    try {
        const { company_name, primary_color, secondary_color } = req.body;
        const file = req.file;

        let logoUrl: string | undefined;

        // Upload new logo if provided
        if (file) {
            const fileName = `company-logo-${Date.now()}.${file.originalname.split('.').pop()}`;

            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('settings')
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true
                });

            if (uploadError) {
                console.error('Logo upload error:', uploadError);
                return res.status(500).json({ success: false, error: 'Failed to upload logo' });
            }

            const { data: publicUrlData } = supabase
                .storage
                .from('settings')
                .getPublicUrl(fileName);

            logoUrl = publicUrlData.publicUrl;
            console.log('Logo uploaded:', logoUrl);
        }

        // Check if settings exist
        const { data: existing } = await supabase
            .from('global_settings')
            .select('id')
            .eq('id', 'main')
            .single();

        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (company_name !== undefined) updateData.company_name = company_name;
        if (primary_color !== undefined) updateData.primary_color = primary_color;
        if (secondary_color !== undefined) updateData.secondary_color = secondary_color;
        if (logoUrl) updateData.company_logo_url = logoUrl;

        let result;
        if (existing) {
            // Update existing
            result = await supabase
                .from('global_settings')
                .update(updateData)
                .eq('id', 'main')
                .select()
                .single();
        } else {
            // Insert new
            result = await supabase
                .from('global_settings')
                .insert({
                    id: 'main',
                    company_name: company_name || 'EXTRACTOS EUM™',
                    company_logo_url: logoUrl || null,
                    primary_color: primary_color || '#1a5c3e',
                    secondary_color: secondary_color || '#10b981',
                    ...updateData
                })
                .select()
                .single();
        }

        if (result.error) {
            console.error('Update settings error:', result.error);
            return res.status(500).json({ success: false, error: 'Failed to update settings' });
        }

        res.json({ success: true, settings: result.data });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Remove company logo
export const removeLogo = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('global_settings')
            .update({
                company_logo_url: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', 'main')
            .select()
            .single();

        if (error) {
            console.error('Remove logo error:', error);
            return res.status(500).json({ success: false, error: 'Failed to remove logo' });
        }

        res.json({ success: true, settings: data });
    } catch (err) {
        console.error('Remove logo error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
