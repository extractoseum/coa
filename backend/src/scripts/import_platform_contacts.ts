/**
 * Import Platform Contacts from Vambe CSV
 * Imports Instagram/Messenger contacts that don't have phone numbers
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CSV Parser
function parseCSV(content: string): any[] {
    const lines = content.split('\n');
    const headers = parseCSVLine(lines[0]);
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row: any = {};
        headers.forEach((h: string, idx: number) => {
            row[h] = values[idx] || '';
        });
        rows.push(row);
    }
    return rows;
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function normalizePhone(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
        digits = digits.slice(-10);
    }
    return digits;
}

function parseVambeTags(tagsString: string): string[] {
    if (!tagsString) return [];
    return tagsString.split(',').map(t => t.trim()).filter(t => t);
}

interface ImportStats {
    instagram: number;
    messenger: number;
    other: number;
    skipped: number;
    errors: string[];
}

async function importPlatformContacts(dryRun: boolean = true): Promise<ImportStats> {
    console.log('\n========================================');
    console.log(`📱 IMPORT PLATFORM CONTACTS ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
    console.log('========================================\n');

    const stats: ImportStats = {
        instagram: 0,
        messenger: 0,
        other: 0,
        skipped: 0,
        errors: []
    };

    // Load CSV
    const csvPath = path.join(__dirname, '../../../ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const vambeContacts = parseCSV(csvContent);

    console.log(`📊 Loaded ${vambeContacts.length} Vambe contacts\n`);

    // Filter to platform-only contacts (no valid phone)
    const platformContacts = vambeContacts.filter(c => {
        const normalizedPhone = normalizePhone(c.phone);
        const email = (c.email || '').toLowerCase().trim();
        // Has contactId but no valid phone/email
        return c.contactId && normalizedPhone.length !== 10 && !email;
    });

    console.log(`📱 Platform-only contacts: ${platformContacts.length}\n`);

    // Check for existing vambe_contact_ids
    const existingIds = new Set<string>();

    // Note: This query will fail if column doesn't exist yet
    try {
        const { data: existing } = await supabase
            .from('clients')
            .select('vambe_contact_id')
            .not('vambe_contact_id', 'is', null);

        for (const c of existing || []) {
            if (c.vambe_contact_id) existingIds.add(c.vambe_contact_id);
        }
        console.log(`📋 Found ${existingIds.size} existing vambe_contact_ids\n`);
    } catch (e) {
        console.log('⚠️  vambe_contact_id column may not exist yet. Run migration first.\n');
    }

    // Process each platform contact
    let processed = 0;

    for (const contact of platformContacts) {
        processed++;

        // Skip if already imported
        if (existingIds.has(contact.contactId)) {
            stats.skipped++;
            continue;
        }

        // Determine platform
        const platform = contact.platform || 'unknown';
        const tags = parseVambeTags(contact.contactTags);

        // Add platform tag
        if (platform === 'instagram') {
            tags.push('source_instagram');
            stats.instagram++;
        } else if (platform === 'messenger') {
            tags.push('source_messenger');
            stats.messenger++;
        } else {
            tags.push(`source_${platform}`);
            stats.other++;
        }

        // Prepare client record
        // Note: email is required (NOT NULL constraint), generate placeholder
        const placeholderEmail = `${platform}_${contact.contactId.substring(0, 8)}@placeholder.extractoseum.com`;
        const newClient = {
            name: contact.contactName && contact.contactName !== '.' ? contact.contactName : 'Usuario ' + platform,
            email: placeholderEmail,
            phone: null,
            tags: tags,
            is_active: true,
            role: 'client',
            auth_level: 'registered',
            vambe_contact_id: contact.contactId,
            platform_metadata: {
                vambe_id: contact.id,
                platform: platform,
                ad_platform: contact.adPlatform || null,
                pipeline: contact.pipeline || null,
                stage: contact.stage || null,
                product_interest: contact['producto de interés'] || null,
                utm_campaign_id: contact.utmCampaignId || null,
                last_message: contact.lastMessageContent ? contact.lastMessageContent.substring(0, 200) : null,
                imported_at: new Date().toISOString()
            }
        };

        if (!dryRun) {
            const { error } = await supabase.from('clients').insert(newClient);

            if (error) {
                if (!error.message.includes('duplicate')) {
                    stats.errors.push(`${contact.contactId}: ${error.message}`);
                } else {
                    stats.skipped++;
                }
            } else {
                existingIds.add(contact.contactId);
            }
        }

        if (processed % 100 === 0) {
            console.log(`Progress: ${processed}/${platformContacts.length}`);
        }
    }

    // Print results
    console.log('\n========================================');
    console.log('📊 IMPORT RESULTS');
    console.log('========================================\n');

    console.log(`📸 Instagram contacts: ${stats.instagram}`);
    console.log(`💬 Messenger contacts: ${stats.messenger}`);
    console.log(`🔗 Other platforms: ${stats.other}`);
    console.log(`⏭️  Skipped (existing): ${stats.skipped}`);
    console.log(`❌ Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
        console.log('\n🚨 ERRORS:');
        stats.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
    }

    if (dryRun) {
        console.log('\n⚠️  DRY RUN - No changes were made');
        console.log('To execute for real, run with: --live');
    }

    return stats;
}

// Check for --live flag
const isLive = process.argv.includes('--live');
importPlatformContacts(!isLive).catch(console.error);
