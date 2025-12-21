import { supabase } from './config/supabase';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Please provide a migration file path.');
        process.exit(1);
    }

    const sql = fs.readFileSync(path.resolve(filePath), 'utf8');
    const statements = sql
        .split(/;(?=\s*(?:--|CREATE|ALTER|INSERT|DO|DROP))/i)
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

    console.log(`Running migration: ${filePath} (${statements.length} statements)`);

    for (const statement of statements) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        const { error } = await supabase.rpc('query', {
            query: statement
        });

        if (error) {
            console.error('Migration failed at statement:', statement);
            console.error('Error:', error);
            process.exit(1);
        }
    }

    console.log('Migration completed successfully.');
}

runMigration().catch(console.error);
