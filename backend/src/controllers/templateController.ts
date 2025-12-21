import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Get all templates
export const getAllTemplates = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('pdf_templates')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Get templates error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
        }

        res.json({ success: true, templates: data || [] });
    } catch (err) {
        console.error('Get templates error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get active template
export const getActiveTemplate = async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('pdf_templates')
            .select('*')
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get active template error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch active template' });
        }

        // Return default template if none active
        const template = data || {
            id: 'default',
            name: 'Default Template',
            company_name: 'EXTRACTOS EUM™',
            company_logo_url: null,
            watermark_url: null,
            primary_color: '#1a5c3e',
            secondary_color: '#10b981',
            accent_color: '#059669',
            footer_text: 'Certificado generado por EUM Viewer 2.0',
            is_active: true
        };

        res.json({ success: true, template });
    } catch (err) {
        console.error('Get active template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Get template by ID
export const getTemplateById = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('pdf_templates')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        console.error('Get template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Create new template
export const createTemplate = async (req: Request, res: Response) => {
    try {
        const { name, company_name, primary_color, secondary_color, accent_color, footer_text, watermark_opacity, watermark_scale, logo_width, is_active } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        let logoUrl: string | null = null;
        let watermarkUrl: string | null = null;

        // Upload logo if provided
        if (files?.logo?.[0]) {
            const logoFile = files.logo[0];
            const logoFileName = `template-logo-${Date.now()}.${logoFile.originalname.split('.').pop()}`;

            const { error: logoError } = await supabase.storage
                .from('templates')
                .upload(logoFileName, logoFile.buffer, {
                    contentType: logoFile.mimetype,
                    upsert: true
                });

            if (logoError) {
                console.error('Logo upload error:', logoError);
                return res.status(500).json({
                    success: false,
                    error: `Error uploading logo: ${logoError.message}. Make sure the 'templates' bucket exists in Supabase Storage.`
                });
            }

            const { data: logoPublicUrl } = supabase.storage
                .from('templates')
                .getPublicUrl(logoFileName);
            logoUrl = logoPublicUrl.publicUrl;
        }

        // Upload watermark if provided
        if (files?.watermark?.[0]) {
            const wmFile = files.watermark[0];
            const wmFileName = `template-watermark-${Date.now()}.${wmFile.originalname.split('.').pop()}`;

            const { error: wmError } = await supabase.storage
                .from('templates')
                .upload(wmFileName, wmFile.buffer, {
                    contentType: wmFile.mimetype,
                    upsert: true
                });

            if (wmError) {
                console.error('Watermark upload error:', wmError);
                return res.status(500).json({
                    success: false,
                    error: `Error uploading watermark: ${wmError.message}. Make sure the 'templates' bucket exists in Supabase Storage.`
                });
            }

            const { data: wmPublicUrl } = supabase.storage
                .from('templates')
                .getPublicUrl(wmFileName);
            watermarkUrl = wmPublicUrl.publicUrl;
        }

        // If this template should be active, deactivate others first
        if (is_active === 'true' || is_active === true) {
            await supabase
                .from('pdf_templates')
                .update({ is_active: false })
                .neq('id', 'placeholder');
        }

        const { data, error } = await supabase
            .from('pdf_templates')
            .insert({
                name: name || 'New Template',
                company_name: company_name || 'Company Name',
                company_logo_url: logoUrl,
                watermark_url: watermarkUrl,
                watermark_opacity: watermark_opacity ? parseFloat(watermark_opacity) : 0.15,
                watermark_scale: watermark_scale ? parseFloat(watermark_scale) : 1.0,
                logo_width: logo_width ? parseFloat(logo_width) : 180,
                primary_color: primary_color || '#1a5c3e',
                secondary_color: secondary_color || '#10b981',
                accent_color: accent_color || '#059669',
                footer_text: footer_text || '',
                is_active: is_active === 'true' || is_active === true
            })
            .select()
            .single();

        if (error) {
            console.error('Create template error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create template' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        console.error('Create template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Update template
export const updateTemplate = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { name, company_name, primary_color, secondary_color, accent_color, footer_text, watermark_opacity, watermark_scale, logo_width } = req.body;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        console.log('[Template Update] Received body:', { watermark_opacity, watermark_scale, logo_width });

        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (company_name !== undefined) updateData.company_name = company_name;
        if (primary_color !== undefined) updateData.primary_color = primary_color;
        if (secondary_color !== undefined) updateData.secondary_color = secondary_color;
        if (accent_color !== undefined) updateData.accent_color = accent_color;
        if (footer_text !== undefined) updateData.footer_text = footer_text;
        if (watermark_opacity !== undefined) updateData.watermark_opacity = parseFloat(watermark_opacity);
        if (watermark_scale !== undefined) updateData.watermark_scale = parseFloat(watermark_scale);
        if (logo_width !== undefined) updateData.logo_width = parseFloat(logo_width);

        console.log('[Template Update] Update data:', updateData);

        // Upload new logo if provided
        if (files?.logo?.[0]) {
            const logoFile = files.logo[0];
            const logoFileName = `template-logo-${id}-${Date.now()}.${logoFile.originalname.split('.').pop()}`;

            const { error: logoError } = await supabase.storage
                .from('templates')
                .upload(logoFileName, logoFile.buffer, {
                    contentType: logoFile.mimetype,
                    upsert: true
                });

            if (!logoError) {
                const { data: logoPublicUrl } = supabase.storage
                    .from('templates')
                    .getPublicUrl(logoFileName);
                updateData.company_logo_url = logoPublicUrl.publicUrl;
            }
        }

        // Upload new watermark if provided
        if (files?.watermark?.[0]) {
            const wmFile = files.watermark[0];
            const wmFileName = `template-watermark-${id}-${Date.now()}.${wmFile.originalname.split('.').pop()}`;

            const { error: wmError } = await supabase.storage
                .from('templates')
                .upload(wmFileName, wmFile.buffer, {
                    contentType: wmFile.mimetype,
                    upsert: true
                });

            if (!wmError) {
                const { data: wmPublicUrl } = supabase.storage
                    .from('templates')
                    .getPublicUrl(wmFileName);
                updateData.watermark_url = wmPublicUrl.publicUrl;
            }
        }

        const { data, error } = await supabase
            .from('pdf_templates')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update template error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update template' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        console.error('Update template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Set template as active
export const setActiveTemplate = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Deactivate all templates first
        await supabase
            .from('pdf_templates')
            .update({ is_active: false })
            .neq('id', 'placeholder');

        // Activate the selected template
        const { data, error } = await supabase
            .from('pdf_templates')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Set active template error:', error);
            return res.status(500).json({ success: false, error: 'Failed to activate template' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        console.error('Set active template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Delete template
export const deleteTemplate = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        // Check if it's the active template
        const { data: existing } = await supabase
            .from('pdf_templates')
            .select('is_active')
            .eq('id', id)
            .single();

        if (existing?.is_active) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete active template. Activate another template first.'
            });
        }

        const { error } = await supabase
            .from('pdf_templates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete template error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete template' });
        }

        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        console.error('Delete template error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Remove logo from template
export const removeTemplateLogo = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('pdf_templates')
            .update({ company_logo_url: null, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to remove logo' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// Remove watermark from template
export const removeTemplateWatermark = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('pdf_templates')
            .update({ watermark_url: null, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to remove watermark' });
        }

        res.json({ success: true, template: data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
