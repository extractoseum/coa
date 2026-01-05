// Analyze Vambe CSV export and compare with existing clients
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
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    // Get last 10 digits (Mexico format)
    if (digits.length >= 10) {
        digits = digits.slice(-10);
    }
    return digits;
}

async function analyzeVambeCSV() {
    console.log('\n========================================');
    console.log('🔍 VAMBE CSV ANALYSIS & SYNC PLANNING');
    console.log('========================================\n');

    // 1. Load CSV
    const csvPath = path.join(__dirname, '../../../ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const vambeContacts = parseCSV(csvContent);

    console.log(`📊 VAMBE CONTACTS: ${vambeContacts.length}`);

    // 2. Get existing clients from DB
    const { data: existingClients, error } = await supabase
        .from('clients')
        .select('id, phone, email, name, shopify_customer_id');

    if (error) {
        console.error('Error fetching clients:', error.message);
        return;
    }

    console.log(`📊 EXISTING CLIENTS: ${existingClients?.length || 0}`);

    // 3. Create lookup maps for deduplication
    const phoneMap = new Map<string, any>();
    const emailMap = new Map<string, any>();

    for (const client of existingClients || []) {
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

    // 4. Categorize Vambe contacts
    const categories = {
        alreadyExists: [] as any[],        // Match by phone or email
        newWithPhone: [] as any[],         // New contacts with valid phone
        newWithEmail: [] as any[],         // New contacts with email only
        invalid: [] as any[]               // No phone or email
    };

    const matchDetails = {
        byPhone: 0,
        byEmail: 0
    };

    for (const contact of vambeContacts) {
        const normalizedPhone = normalizePhone(contact.phone);
        const email = (contact.email || '').toLowerCase().trim();

        // Check if exists
        let existingClient = null;
        let matchType = '';

        if (normalizedPhone.length === 10 && phoneMap.has(normalizedPhone)) {
            existingClient = phoneMap.get(normalizedPhone);
            matchType = 'phone';
            matchDetails.byPhone++;
        } else if (email && emailMap.has(email)) {
            existingClient = emailMap.get(email);
            matchType = 'email';
            matchDetails.byEmail++;
        }

        if (existingClient) {
            categories.alreadyExists.push({
                vambe: contact,
                existing: existingClient,
                matchType
            });
        } else if (normalizedPhone.length === 10) {
            categories.newWithPhone.push(contact);
        } else if (email) {
            categories.newWithEmail.push(contact);
        } else {
            categories.invalid.push(contact);
        }
    }

    // 5. Print analysis
    console.log('\n========================================');
    console.log('📈 SYNC ANALYSIS RESULTS');
    console.log('========================================\n');

    console.log(`✅ Already in DB (duplicates): ${categories.alreadyExists.length}`);
    console.log(`   - Matched by phone: ${matchDetails.byPhone}`);
    console.log(`   - Matched by email: ${matchDetails.byEmail}`);
    console.log(`\n🆕 NEW contacts to import:`);
    console.log(`   - With valid phone: ${categories.newWithPhone.length}`);
    console.log(`   - With email only: ${categories.newWithEmail.length}`);
    console.log(`\n❌ Invalid (no phone/email): ${categories.invalid.length}`);

    const totalNew = categories.newWithPhone.length + categories.newWithEmail.length;
    console.log(`\n📊 TOTAL NEW TO IMPORT: ${totalNew}`);

    // 6. Sample of new contacts
    console.log('\n========================================');
    console.log('🔍 SAMPLE NEW CONTACTS (first 10)');
    console.log('========================================\n');

    for (const contact of categories.newWithPhone.slice(0, 10)) {
        console.log(`  📱 ${contact.contactName || 'No name'}`);
        console.log(`     Phone: ${contact.phone}`);
        console.log(`     Email: ${contact.email || 'N/A'}`);
        console.log(`     Tags: ${contact.contactTags || 'N/A'}`);
        console.log(`     Stage: ${contact.stage}`);
        console.log(`     Created: ${contact.createdAt}`);
        console.log('');
    }

    // 7. Analyze useful Vambe data we could enrich
    console.log('\n========================================');
    console.log('💡 VAMBE DATA FIELDS TO ENRICH');
    console.log('========================================\n');

    const enrichmentStats = {
        withTags: vambeContacts.filter(c => c.contactTags).length,
        withProductInterest: vambeContacts.filter(c => c['producto de interés']).length,
        withOrderNumber: vambeContacts.filter(c => c['numero de orden']).length,
        withInstagram: vambeContacts.filter(c => c.instagram_username).length,
        withUtm: vambeContacts.filter(c => c.utmCampaignId).length
    };

    console.log(`  📌 With tags: ${enrichmentStats.withTags}`);
    console.log(`  🛒 With product interest: ${enrichmentStats.withProductInterest}`);
    console.log(`  📦 With order number: ${enrichmentStats.withOrderNumber}`);
    console.log(`  📸 With Instagram: ${enrichmentStats.withInstagram}`);
    console.log(`  📊 With UTM data: ${enrichmentStats.withUtm}`);

    // 8. Return summary for next steps
    return {
        total: vambeContacts.length,
        duplicates: categories.alreadyExists.length,
        newWithPhone: categories.newWithPhone.length,
        newWithEmail: categories.newWithEmail.length,
        invalid: categories.invalid.length,
        contacts: {
            alreadyExists: categories.alreadyExists,
            newWithPhone: categories.newWithPhone,
            newWithEmail: categories.newWithEmail
        }
    };
}

analyzeVambeCSV().then(result => {
    if (result) {
        console.log('\n========================================');
        console.log('🎯 RECOMMENDATION');
        console.log('========================================\n');

        const newContacts = result.newWithPhone + result.newWithEmail;
        console.log(`Total NEW contacts to import: ${newContacts}`);
        console.log(`Already have ${result.duplicates} of these contacts in DB`);
        console.log(`\nDuplication rate: ${((result.duplicates / result.total) * 100).toFixed(1)}%`);

        console.log('\n✅ SAFE TO PROCEED with smart sync - will NOT create duplicates');
    }
}).catch(console.error);
