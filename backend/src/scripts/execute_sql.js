
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { URL } = require('url');

// Load .env logic
const envPath1 = path.resolve(__dirname, '../../.env');
const envPath2 = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envPath1)) {
    dotenv.config({ path: envPath1 });
} else if (fs.existsSync(envPath2)) {
    dotenv.config({ path: envPath2 });
} else {
    console.warn('Warning: .env file not found in likely locations.');
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.error('Usage: node execute_sql.js <filename_in_migrations_dir>');
    process.exit(1);
}

async function run() {
    try {
        const url = new URL(connectionString);

        // Try switching to port 5432 (Direct) if it is 6543 (Pooler)
        if (url.port === '6543') {
            console.log('Switching from port 6543 to 5432...');
            url.port = '5432';
        }

        // Force IPv4 Resolution removed - Supabase might be IPv6 only
        console.log(`Using hostname: ${url.hostname}`);

        const client = new Client({
            host: url.hostname,
            port: parseInt(url.port),
            user: url.username,
            password: url.password,

            database: url.pathname.substring(1),
            ssl: { rejectUnauthorized: false, servername: url.hostname }
        });

        await client.connect();

        const filePath = path.join(__dirname, '../../migrations', sqlFile);
        console.log(`Reading SQL file: ${filePath}`);
        const sql = fs.readFileSync(filePath, 'utf-8');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('Success!');
        await client.end();

    } catch (err) {
        console.error('Error executing SQL:', err);
        process.exit(1);
    }
}

run();
