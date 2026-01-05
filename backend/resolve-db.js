const dns = require('dns');
const host = 'db.vbnpcospodhwuzvxejui.supabase.co';

dns.resolve4(host, (err, addresses) => {
    if (err) {
        console.error('DNS Resolve Error:', err);
        return;
    }
    console.log('IPv4 Addresses:', addresses);
});
