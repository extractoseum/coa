// Execute SQL via Supabase Management API
const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
console.log('Project ref:', projectRef);

// Read SQL file from argument or default
const sqlFile = process.argv[2] || 'migrations/011_chemists_system.sql';
console.log('Executing SQL file:', sqlFile);

const sqlContent = fs.readFileSync(
    path.resolve(sqlFile),
    'utf8'
);

// Split into separate statements and execute each one
const statements = sqlContent
    .split(/;(?=\s*(?:--|CREATE|ALTER|INSERT|DO|DROP))/i)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

async function executeStatement(sql) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ query: sql });

        const options = {
            hostname: `${projectRef}.supabase.co`,
            path: '/rest/v1/rpc/query',
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                } else {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Use the Supabase client for direct table operations
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'public' },
    auth: { persistSession: false }
});

async function runMigration() {
    console.log(`\n=== Running Migration: ${sqlFile} ===\n`);
    console.log(`Found ${statements.length} statements.`);

    for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 80)}...`);
        try {
            const result = await executeStatement(statement);
            console.log('Success:', result);
        } catch (error) {
            console.error('Statement failed:', error.message);
            // Don't exit, might be "already exists" errors
        }
    }

    console.log('\n=== Migration completed ===\n');
}

runMigration().catch(console.error);
