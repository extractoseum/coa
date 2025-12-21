import { Request, Response } from 'express';
import { COAExtractor } from '../services/coaExtractor';
import { supabase } from '../config/supabase';
import { v4 as uuidv4 } from 'uuid';

const extractor = new COAExtractor();

// Upload image to Supabase Storage
export const uploadImage = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image file provided' });
        }

        const file = req.file;
        const type = req.body.type || 'general'; // credential_photo, badge, banner, etc.

        // Validate file type
        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({ success: false, error: 'File must be an image' });
        }

        // Generate unique filename
        const ext = file.originalname.split('.').pop() || 'jpg';
        const filename = `${type}/${uuidv4()}.${ext}`;

        // Upload to Supabase Storage
        const { error } = await supabase.storage
            .from('images')
            .upload(filename, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            console.error('[Upload Image] Supabase error:', error);
            return res.status(500).json({ success: false, error: 'Error uploading to storage' });
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filename);

        res.json({
            success: true,
            url: urlData.publicUrl,
            path: filename
        });

    } catch (error: any) {
        console.error('[Upload Image] Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Error uploading image' });
    }
};

export const uploadAndExtractCOA = async (req: Request, res: Response) => {
    try {
        let buffers: Buffer[] = [];

        if (req.files && Array.isArray(req.files)) {
            // Multiple files
            buffers = (req.files as Express.Multer.File[]).map(f => f.buffer);
        } else if (req.file) {
            // Single file
            buffers = [req.file.buffer];
        }

        if (buffers.length === 0) {
            return res.status(400).json({ success: false, error: 'No PDF files provided' });
        }

        // 1. Extract Data from PDF Buffers
        const extractedData = await extractor.extractFromBuffers(buffers);

        res.json({
            success: true,
            message: `Processed ${buffers.length} PDF(s) successfully`,
            data: extractedData
        });

    } catch (error: any) {
        console.error('Extraction Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Error processing PDF' });
    }
};
