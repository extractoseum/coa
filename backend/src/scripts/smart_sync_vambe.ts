/**
 * SMART SYNC: Vambe → OmniCRM
 *
 * Strategy:
 * 1. Match by phone (normalized last 10 digits)
 * 2. Match by email (case-insensitive)
 * 3. For matches: ENRICH existing client with Vambe data (tags, interests, etc.)
 * 4. For new: CREATE new client with all Vambe data
 * 5. Never create duplicates
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

// Simple CSV parser
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

// Normalize phone for comparison
function normalizePhone(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
        digits = digits.slice(-10);
    }
    return digits;
}

// Convert Vambe tags to our format
function parseVambeTags(tagsString: string): string[] {
    if (!tagsString) return [];
    return tagsString.split(',').map(t => t.trim()).filter(t => t);
}

// Map Vambe stage to a tag
function mapStageToTag(stage: string): string | null {
    const stageMap: Record<string, string> = {
        'Ara AI - VENTAS': 'lead_hot',
        'Ara 2 VENTAS SLOW': 'lead_warm',
        'QUALIFIED': 'qualified',
        'CONVERTED': 'converted'
    };
    return stageMap[stage] || null;
}

interface SyncStats {
    enriched: number;
    created: number;
    skipped: number;
    errors: string[];
}

async function smartSyncVambe(dryRun: boolean = true): Promise<SyncStats> {
    console.log('\n========================================');
    console.log(`🔄 SMART SYNC: Vambe → OmniCRM ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
    console.log('========================================\n');

    const stats: SyncStats = {
        enriched: 0,
        created: 0,
        skipped: 0,
        errors: []
    };

    // 1. Load CSV
    const csvPath = path.join(__dirname, '../../../ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const vambeContacts = parseCSV(csvContent);

    console.log(`📊 Loaded ${vambeContacts.length} Vambe contacts\n`);

    // 2. Get ALL existing clients
    let allClients: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('clients')
            .select('id, phone, email, name, tags, shopify_customer_id')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching clients:', error.message);
            break;
        }

        if (!data || data.length === 0) break;
        allClients = allClients.concat(data);
        page++;

        if (data.length < pageSize) break;
    }

    console.log(`📊 Loaded ${allClients.length} existing clients from DB\n`);

    // 3. Create lookup maps
    const phoneMap = new Map<string, any>();
    const emailMap = new Map<string, any>();

    for (const client of allClients) {
        if (client.phone) {
            const normalizedPhone = normalizePhone(client.phone);
            if (normalizedPhone.length === 10) {
                phoneMap.set(normalizedPhone, client);
            }
        }
        if (client.email) {
            emailMap.set(client.email.toLowerCase(), client);
        }
    }

    // 4. Process each Vambe contact
    let processed = 0;

    for (const contact of vambeContacts) {
        processed++;

        // Skip if no valid identifier
        const normalizedPhone = normalizePhone(contact.phone);
        const email = (contact.email || '').toLowerCase().trim();

        if (normalizedPhone.length !== 10 && !email) {
            stats.skipped++;
            continue;
        }

        // Check for existing client
        let existingClient = null;
        let matchType = '';

        if (normalizedPhone.length === 10 && phoneMap.has(normalizedPhone)) {
            existingClient = phoneMap.get(normalizedPhone);
            matchType = 'phone';
        } else if (email && emailMap.has(email)) {
            existingClient = emailMap.get(email);
            matchType = 'email';
        }

        // Prepare Vambe data
        const vambeTags = parseVambeTags(contact.contactTags);
        const stageTag = mapStageToTag(contact.stage);
        if (stageTag) vambeTags.push(stageTag);

        const vambeMetadata = {
            vambe_id: contact.id,
            vambe_contact_id: contact.contactId,
            product_interest: contact['producto de interés'] || null,
            order_number: contact['numero de orden'] || null,
            utm_campaign_id: contact.utmCampaignId || null,
            ad_platform: contact.adPlatform || null,
            pipeline: contact.pipeline || null,
            stage: contact.stage || null,
            synced_at: new Date().toISOString()
        };

        if (existingClient) {
            // ENRICH existing client
            const existingTags = existingClient.tags || [];
            const mergedTags = [...new Set([...existingTags, ...vambeTags])];

            if (!dryRun) {
                const { error } = await supabase
                    .from('clients')
                    .update({
                        tags: mergedTags,
                        // Only update name if empty
                        ...((!existingClient.name || existingClient.name === 'Nuevo Usuario') && contact.contactName
                            ? { name: contact.contactName }
                            : {}),
                        // Store vambe metadata
                        // Note: We could add a vambe_metadata column or store in existing metadata
                    })
                    .eq('id', existingClient.id);

                if (error) {
                    stats.errors.push(`Enrich ${existingClient.id}: ${error.message}`);
                }
            }

            stats.enriched++;

            if (processed % 100 === 0) {
                console.log(`Progress: ${processed}/${vambeContacts.length} (${stats.enriched} enriched, ${stats.created} created)`);
            }

        } else {
            // CREATE new client
            const newClient = {
                phone: contact.phone ? `+52${normalizedPhone}` : null,
                email: email || null,
                name: contact.contactName || 'Sin nombre',
                tags: vambeTags,
                is_active: true,
                role: 'client',
                auth_level: 0,
                // vambe_metadata: vambeMetadata // If column exists
            };

            if (!dryRun) {
                const { error } = await supabase
                    .from('clients')
                    .insert(newClient);

                if (error) {
                    // Check if duplicate error
                    if (error.message.includes('duplicate')) {
                        stats.skipped++;
                        continue;
                    }
                    stats.errors.push(`Create ${contact.phone}: ${error.message}`);
                } else {
                    // Add to maps to prevent duplicates in same batch
                    if (normalizedPhone.length === 10) {
                        phoneMap.set(normalizedPhone, newClient);
                    }
                    if (email) {
                        emailMap.set(email, newClient);
                    }
                }
            }

            stats.created++;

            if (processed % 100 === 0) {
                console.log(`Progress: ${processed}/${vambeContacts.length} (${stats.enriched} enriched, ${stats.created} created)`);
            }
        }
    }

    // 5. Print results
    console.log('\n========================================');
    console.log('📊 SYNC RESULTS');
    console.log('========================================\n');

    console.log(`✅ Enriched existing clients: ${stats.enriched}`);
    console.log(`🆕 Created new clients: ${stats.created}`);
    console.log(`⏭️  Skipped (invalid): ${stats.skipped}`);
    console.log(`❌ Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
        console.log('\n🚨 ERRORS:');
        stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
        if (stats.errors.length > 10) {
            console.log(`  ... and ${stats.errors.length - 10} more`);
        }
    }

    if (dryRun) {
        console.log('\n⚠️  DRY RUN - No changes were made');
        console.log('To execute for real, run with: --live');
    }

    return stats;
}

// Check for --live flag
const isLive = process.argv.includes('--live');
smartSyncVambe(!isLive).catch(console.error);
