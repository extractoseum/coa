
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load env
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const CSV_FILE = path.join(__dirname, '../../ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv');

// Stats
let stats = {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0
};

/**
 * Normalizes phone number to +52 format or similar standard
 */
const normalizePhone = (phone) => {
    if (!phone) return null;
    let p = phone.replace(/[^0-9]/g, '');
    if (p.startsWith('521')) p = p.replace('521', '52'); // Fix 521 issue
    if (p.length === 10) p = '52' + p; // Assume MX
    return '+' + p;
};

const run = async () => {
    console.log('🚀 Starting CRM Import (Supabase SDK) - FIX: updated_at...');
    console.log(`📂 Reading from: ${CSV_FILE}`);

    if (!fs.existsSync(CSV_FILE)) {
        console.error('❌ CSV File not found!');
        process.exit(1);
    }

    const contacts = [];

    // 1. Read CSV
    await new Promise((resolve, reject) => {
        fs.createReadStream(CSV_FILE)
            .pipe(csv())
            .on('data', (data) => contacts.push(data))
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    console.log(`📊 Found ${contacts.length} rows. Processing...`);

    // 2. Process Batch
    for (const contact of contacts) {
        stats.total++;
        if (stats.total % 100 === 0) process.stdout.write('.');

        try {
            const phone = normalizePhone(contact.phone || contact.telefono);
            const rawEmail = contact.email ? contact.email.toLowerCase().trim() : null;
            const name = contact.contactName || contact.nombre || contact['nombre del cliente'] || 'Sin Nombre';

            // Validate minimal requirements (Must have phone OR email)
            if (!phone && !rawEmail) {
                stats.skipped++;
                continue;
            }

            // Generate Placeholder Email if missing (DB requires NOT NULL)
            const email = rawEmail || `${phone || uuidv4()}@noemail.eum`;

            // Prepare Tags
            const rawTags = [
                ...(contact.contactTags?.split(',') || []),
                ...(contact.ticketTags?.split(',') || []),
                'imported_crm',
                contact.pipeline ? `pipeline:${contact.pipeline.replace(/\s+/g, '_')}` : null,
                contact.stage ? `stage:${contact.stage.replace(/\s+/g, '_')}` : null
            ].map(t => t && t.trim()).filter(Boolean);

            const uniqueTags = [...new Set(rawTags)];

            // CHECK EXISTENCE
            let existingClient = null;

            // Check by Phone first
            if (phone) {
                const { data } = await supabase.from('clients').select('*').eq('phone', phone).single();
                if (data) existingClient = data;
            }

            // Check by Email if not found (and not placeholder)
            if (!existingClient && rawEmail) {
                const { data } = await supabase.from('clients').select('*').eq('email', email).single();
                if (data) existingClient = data;
            }

            if (existingClient) {
                // UPDATE / MERGE
                // Merge tags
                const currentTags = existingClient.tags || [];
                const mergedTags = [...new Set([...currentTags, ...uniqueTags])];

                const { error } = await supabase.from('clients').update({
                    tags: mergedTags,
                    updated_at: new Date().toISOString() // Fixed column name
                }).eq('id', existingClient.id);

                if (error) throw error;
                stats.updated++;

            } else {
                // INSERT NEW
                const newId = uuidv4();

                const { error } = await supabase.from('clients').insert({
                    id: newId,
                    name: name,
                    email: email,
                    phone: phone,
                    role: 'client',
                    auth_level: 'registered',
                    tags: uniqueTags,
                    created_at: new Date().toISOString(),
                    is_active: true
                });

                if (error) throw error;
                stats.inserted++;
            }

        } catch (err) {
            console.error(`\n❌ Error on row ${stats.total}:`, err.message || err);
            stats.errors++;
        }
    }

    console.log('\n\n✅ Import Complete');
    console.log('-------------------');
    console.log(`Total:    ${stats.total}`);
    console.log(`Inserted: ${stats.inserted}`);
    console.log(`Updated:  ${stats.updated}`);
    console.log(`Skipped:  ${stats.skipped}`);
    console.log(`Errors:   ${stats.errors}`);
};

run().catch(console.error);
