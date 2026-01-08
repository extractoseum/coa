/**
 * Script to generate Google OAuth2 Refresh Token for Nodemailer/ImapFlow
 * Usage: node auth_gmail.js <CLIENT_ID> <CLIENT_SECRET>
 */

const http = require('http');
const url = require('url');
const axios = require('axios');

const args = process.argv.slice(2);

if (args.length < 2) {
    console.error('Usage: node auth_gmail.js <CLIENT_ID> <CLIENT_SECRET>');
    process.exit(1);
}

const CLIENT_ID = args[0];
const CLIENT_SECRET = args[1];
const REDIRECT_URI = 'http://localhost:3000/callback';

// Scopes for Gmail (IMAP/SMTP)
const SCOPES = [
    'https://mail.google.com/',
    'email',
    'profile'
];

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${REDIRECT_URI}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
    `&access_type=offline` +
    `&prompt=consent`;

console.log('\n🔥 GMAIL OAUTH2 SETUP 🔥\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Login with ara@extractoseum.com and authorize the app.');
console.log('   (If you receive a "This app isn\'t verified" warning, click Advanced > Go to App (unsafe))');
console.log('\n3. Waiting for callback at http://localhost:3000/callback ...\n');

const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/callback')) {
        const queryObject = url.parse(req.url, true).query;
        const code = queryObject.code;

        if (code) {
            console.log('✅ Code received! exchanging for token...');

            try {
                const response = await axios.post('https://oauth2.googleapis.com/token', {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    code: code,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI
                });

                const { refresh_token, access_token } = response.data;

                if (!refresh_token) {
                    console.error('❌ No refresh token received! (Did you forget prompt=consent?)');
                    res.end('Error: No refresh token. Try running the script again.');
                    return;
                }

                console.log('\n✅ SUCCESS! Here are your credentials:\n');
                console.log('ARA_EMAIL_USER=ara@extractoseum.com');
                console.log(`ARA_CLIENT_ID=${CLIENT_ID}`);
                console.log(`ARA_CLIENT_SECRET=${CLIENT_SECRET}`);
                console.log(`ARA_REFRESH_TOKEN=${refresh_token}`);
                console.log(`ARA_ACCESS_TOKEN=${access_token}`);
                console.log('\nKeep these safe! Update your .env file with these values.');

                res.end('Success! Check your terminal.');
                server.close();
                process.exit(0);
            } catch (err) {
                console.error('❌ Error fetching token:', err.response?.data || err.message);
                res.end('Error fetching token.');
            }
        } else {
            res.end('Error: No code found in URL');
        }
    } else {
        res.end('Not found');
    }
});

server.listen(3000);
