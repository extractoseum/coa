
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const streamPipeline = promisify(pipeline);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''; // Must be service key to read all
const BACKUP_DIR = process.env.BACKUP_STORAGE_DIR || '/var/www/backups/storage';
const BUCKETS = ['coas', 'firmas', 'evidencias']; // Buckets to mirror

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[Storage Mirror] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Downloads a file if it doesn't exist locally or if size differs.
 */
async function syncFile(bucket: string, filePath: string) {
    try {
        const localPath = path.join(BACKUP_DIR, bucket, filePath);
        const localDir = path.dirname(localPath);

        // Ensure directory exists
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }

        // Get file URL (signed or public) - for simplicity using download method
        const { data, error } = await supabase.storage.from(bucket).download(filePath);

        if (error) {
            console.error(`[Storage Mirror] Error downloading ${bucket}/${filePath}:`, error.message);
            return;
        }

        const buffer = await data.arrayBuffer();

        // Check if file exists and compare size (naive check, but sufficient for immutable files)
        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            if (stats.size === buffer.byteLength) {
                // File exists and size matches, skipping
                return;
            }
        }

        fs.writeFileSync(localPath, Buffer.from(buffer));
        console.log(`[Storage Mirror] ✅ Synced: ${bucket}/${filePath}`);

    } catch (err) {
        console.error(`[Storage Mirror] Failed to sync ${bucket}/${filePath}:`, err);
    }
}

/**
 * Lists all files in a bucket using recursion (since list limits to 100 usually).
 * Using a simple approach: top-level + folder recursion
 */
async function syncBucket(bucket: string, prefix = '') {
    try {
        const { data: files, error } = await supabase.storage.from(bucket).list(prefix, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
        });

        if (error) {
            console.error(`[Storage Mirror] Error listing bucket ${bucket}:`, error.message);
            return;
        }

        if (!files) return;

        for (const file of files) {
            if (file.id === null) {
                // It's a folder (Supabase storage quirk: folders have null id usually or specific metadata)
                // Actually, list returns object with .id. If it's a folder, we recurse.
                // Supabase JS SDK v2: check for metadata usually. 
                // However, folders don't have metadata properties like content-type usually.
                // Let's rely on naming convention or checking if it acts like a folder.
                // Better approach: if it has no metadata.mimetype, it might be a folder placeholder

                // NOTE: Supabase storage list is tricky with folders.
                // Assuming flat structure for now or simple recursion. 
                // Recursive call:
                await syncBucket(bucket, prefix ? `${prefix}/${file.name}` : file.name);
            } else {
                // It's a file
                const fullPath = prefix ? `${prefix}/${file.name}` : file.name;
                await syncFile(bucket, fullPath);
            }
        }
    } catch (err) {
        console.error(`[Storage Mirror] Bucket sync error ${bucket}:`, err);
    }
}

async function run() {
    console.log(`[Storage Mirror] Starting sync to ${BACKUP_DIR}...`);

    // Ensure root backup dir
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    for (const bucket of BUCKETS) {
        console.log(`[Storage Mirror] Syncing bucket: ${bucket}`);
        await syncBucket(bucket);
    }

    console.log('[Storage Mirror] Metadata Sync Complete.');
}

run();
