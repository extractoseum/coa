/**
 * Script to add paid_notified column to orders table
 * Run: npx ts-node src/scripts/add_paid_notified_column.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { Pool } = pg;

async function addColumn() {
    console.log('--- Adding paid_notified column to orders table ---');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const client = await pool.connect();

        console.log('Connected to database');

        // Add the column
        await client.query(`
            ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS paid_notified BOOLEAN DEFAULT false;
        `);

        console.log('✅ Column paid_notified added successfully!');

        // Verify
        const result = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'paid_notified';
        `);

        if (result.rows.length > 0) {
            console.log('Verified:', result.rows[0]);
        }

        client.release();
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

addColumn();
