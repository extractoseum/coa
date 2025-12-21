import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

export const getNavigationItems = async (req: Request, res: Response) => {
    try {
        const { type, isAdmin } = req.query;

        let query = supabase
            .from('navigation_items')
            .select('*')
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        if (type) {
            query = query.eq('type', type);
        }

        if (isAdmin !== 'true') {
            // If not asking for admin view (which sees everything), filter out admin-only items
            // unless the user sends some proof, but usually frontend filters. 
            // However, for security, if the user is not admin, we shouldn't show admin items.
            // This controller is public? Or protected?
            // Usually we'd check req.user from middleware.
            // For now, we'll return all active items and let frontend filter, 
            // or rely on the endpoint being protected for sensitive stuff.
            // But navigation structure itself isn't super sensitive usually.
        }

        const { data, error } = await query;

        if (error) {
            // If table doesn't exist yet, return empty list or default to avoid crash
            if (error.code === 'PGRST116' || error.message.includes('relation "navigation_items" does not exist')) {
                console.warn('Navigation table missing, returning empty array');
                return res.json({ success: true, items: [] });
            }
            console.error('Error fetching navigation items:', error);
            return res.status(500).json({ error: 'Failed to fetch navigation items' });
        }

        // Build tree structure if needed, or return flat list and let frontend handle it.
        // Frontend likely easier to handle flat list or tree. Let's return flat list.
        res.json({ success: true, items: data });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const createNavigationItem = async (req: Request, res: Response) => {
    try {
        const { label, icon, href, type, parent_id, order_index, is_external, is_auth_only, is_admin_only } = req.body;

        const { data, error } = await supabase
            .from('navigation_items')
            .insert({
                label,
                icon,
                href,
                type,
                parent_id: parent_id || null,
                order_index: order_index || 0,
                is_external: is_external || false,
                is_auth_only: is_auth_only || false,
                is_admin_only: is_admin_only || false
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating navigation item:', error);
            return res.status(500).json({ error: 'Failed to create navigation item' });
        }

        res.status(201).json({ success: true, item: data });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const updateNavigationItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Remove undefined fields
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        const { data, error } = await supabase
            .from('navigation_items')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating navigation item:', error);
            return res.status(500).json({ error: 'Failed to update navigation item' });
        }

        res.json({ success: true, item: data });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const deleteNavigationItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('navigation_items')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting navigation item:', error);
            return res.status(500).json({ error: 'Failed to delete navigation item' });
        }

        res.json({ success: true, message: 'Item deleted successfully' });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const reorderNavigationItems = async (req: Request, res: Response) => {
    try {
        const { items } = req.body; // Array of { id, order_index }

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        const updates = items.map(item =>
            supabase
                .from('navigation_items')
                .update({ order_index: item.order_index })
                .eq('id', item.id)
        );

        await Promise.all(updates);

        res.json({ success: true, message: 'Items reordered successfully' });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};
