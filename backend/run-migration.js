// Run migration 011_chemists_system.sql
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('Running chemists migration...');

    try {
        // Create chemists table
        const { error: tableError } = await supabase.rpc('exec', {
            query: `
                CREATE TABLE IF NOT EXISTS chemists (
                    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                    name TEXT NOT NULL,
                    title TEXT,
                    credentials TEXT,
                    license_number TEXT,
                    license_url TEXT,
                    signature_url TEXT,
                    email TEXT,
                    phone TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    is_default BOOLEAN DEFAULT FALSE,
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `
        });

        if (tableError) {
            console.log('Table creation via RPC failed, trying direct insert...');
        }

        // Insert default chemist using regular insert
        const { data: existing } = await supabase
            .from('chemists')
            .select('id')
            .eq('name', 'Georgina Ocampo')
            .single();

        if (!existing) {
            const { data, error } = await supabase
                .from('chemists')
                .insert({
                    name: 'Georgina Ocampo',
                    title: 'Responsable Técnico',
                    credentials: 'Ing. Bioquímico',
                    license_number: '8112996',
                    license_url: 'https://cdn.shopify.com/s/files/1/0710/3361/8604/files/Constancia_ROOA901227MNTMCN04.pdf?v=1761667242',
                    signature_url: 'https://cdn.shopify.com/s/files/1/0710/3361/8604/files/FIRMA-GEORGINA-OCAMPO-8112996.png?v=1765805473',
                    is_active: true,
                    is_default: true
                })
                .select()
                .single();

            if (error) {
                console.error('Insert error:', error);
            } else {
                console.log('Default chemist created:', data);
            }
        } else {
            console.log('Default chemist already exists:', existing);
        }

        // Verify the table exists and has data
        const { data: chemists, error: fetchError } = await supabase
            .from('chemists')
            .select('*');

        if (fetchError) {
            console.error('Fetch error:', fetchError);
            console.log('\nThe chemists table may not exist yet.');
            console.log('Please run this SQL in your Supabase SQL Editor:');
            console.log(fs.readFileSync(path.join(__dirname, 'migrations/011_chemists_system.sql'), 'utf8'));
        } else {
            console.log('\nChemists in database:', chemists);
        }

    } catch (err) {
        console.error('Migration error:', err);
    }
}

runMigration();
