import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

// Base URL for the frontend application
const BASE_URL = process.env.COA_VIEWER_URL || 'https://coa.extractoseum.com';

export const generateSitemap = async (req: Request, res: Response) => {
    try {
        // Fetch all public (non-hidden) COAs
        // We only need the token and the last modification date
        const { data: coas, error } = await supabase
            .from('coas')
            .select('public_token, updated_at, created_at')
            .eq('is_hidden', false)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Sitemap] Database error:', error);
            return res.status(500).send('Error generating sitemap');
        }

        // XML Header
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        // Add static routes
        const staticRoutes = [
            '/',
            '/login'
        ];

        staticRoutes.forEach(route => {
            sitemap += `
    <url>
        <loc>${BASE_URL}${route}</loc>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`;
        });

        // Add dynamic COA routes
        if (coas) {
            coas.forEach(coa => {
                const lastMod = coa.updated_at || coa.created_at;
                // Ensure date is in ISO 8601 format (YYYY-MM-DD)
                const dateStr = lastMod ? new Date(lastMod).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

                sitemap += `
    <url>
        <loc>${BASE_URL}/coa/${coa.public_token}</loc>
        <lastmod>${dateStr}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>`;
            });
        }

        // Close XML
        sitemap += `
</urlset>`;

        // Set Headers
        res.header('Content-Type', 'application/xml');
        res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

        res.send(sitemap);

    } catch (err) {
        console.error('[Sitemap] Error:', err);
        res.status(500).send('Internal Server Error');
    }
};
