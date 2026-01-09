import { Request, Response } from 'express';
import { searchLocalProducts } from '../services/shopifyService';

export const searchProducts = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.json({ success: true, products: [] });
        }

        const products = await searchLocalProducts(query);
        res.json({ success: true, products });
    } catch (error: any) {
        console.error('Error searching products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
