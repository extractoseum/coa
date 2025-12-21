import { supabase } from '../config/supabase';
import crypto from 'crypto';
import sharp from 'sharp';
import convert from 'heic-convert';

/**
 * Upload a file to Supabase Storage with optional image optimization
 * @param bucket - Storage bucket name
 * @param file - File buffer
 * @param originalName - Original filename
 * @param folder - Optional folder path
 * @returns Public URL of uploaded file
 */
export async function uploadFileToStorage(
    bucket: string,
    file: Buffer,
    originalName: string,
    folder?: string
): Promise<string> {
    let finalBuffer = file;
    let ext = originalName.split('.').pop()?.toLowerCase() || '';
    let contentType = getContentType(ext);

    // Primary conversion for HEIC/HEIF files (often missing in server sharp builds)
    if (ext === 'heic' || ext === 'heif') {
        try {
            console.log(`[Storage] Converting ${ext.toUpperCase()} to JPEG...`);
            const outputBuffer = await convert({
                buffer: file as any,
                format: 'JPEG',
                quality: 1
            });
            finalBuffer = Buffer.from(outputBuffer);
            ext = 'jpg';
            contentType = 'image/jpeg';
        } catch (heicError: any) {
            console.error('[Storage] heic-convert error:', heicError.message);
            // Fallthrough to sharp or direct upload
        }
    }

    // Optimize images (including the now-converted JPEG)
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    if (imageExtensions.includes(ext)) {
        try {
            const pipeline = sharp(finalBuffer);

            // Convert everything to JPEG for consistent browser support
            // This also handles HEIC if the underlying libvips has heif support
            finalBuffer = await pipeline
                .jpeg({ quality: 80, mozjpeg: true })
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .toBuffer();

            ext = 'jpg';
            contentType = 'image/jpeg';
        } catch (sharpError) {
            console.error('Sharp processing error:', sharpError);
            // Fallback to original buffer if sharp fails (e.g. missing HEIF dependencies)
            // But we still need to make sure contentType is at least set for HEIC
            if (ext === 'heic' || ext === 'heif') {
                contentType = 'image/heif';
            }
        }
    }

    // Generate unique filename
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const filePath = folder ? `${folder}/${uniqueName}` : uniqueName;

    // Upload file
    const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, finalBuffer, {
            contentType: contentType,
            upsert: false
        });

    if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return publicUrl;
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFileFromStorage(
    bucket: string,
    url: string
): Promise<void> {
    // Extract file path from URL
    const urlParts = url.split('/');
    const bucketIndex = urlParts.findIndex(part => part === bucket);
    if (bucketIndex === -1) return;

    const filePath = urlParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
        .from(bucket)
        .remove([filePath]);

    if (error) {
        console.error('Storage delete error:', error);
    }
}

/**
 * Get content type based on file extension
 */
function getContentType(ext: string): string {
    const types: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'heic': 'image/heic',
        'heif': 'image/heif',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return types[ext.toLowerCase()] || 'application/octet-stream';
}
