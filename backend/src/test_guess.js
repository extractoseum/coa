const { Client } = require('pg');

async function testGuess() {
    // URL Encode special characters in password: Mv+7c#dQ4U9ALV4Lup#p
    const connectionString = 'postgresql://postgres:Mv%2B7c%23dQ4U9ALV4Lup%23p@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres';
    console.log('Testing guessed connection string (encoded)...');
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('CONNECTION SUCCESSFUL! Guessed password is CORRECT.');
        await client.end();
    } catch (err) {
        console.error('Connection failed:', err.message);
    }
}

testGuess();
