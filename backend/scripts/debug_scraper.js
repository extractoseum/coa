const axios = require('axios');

async function debugScraper() {
    const waybill = '7015900880630603363855';
    const url = `https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=${waybill}&wayBillType=0&isShipmentDetail=True`;

    console.log(`Fetching ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36'
            }
        });
        const html = response.data;

        console.log('HTML Length:', html.length);

        // Test patterns
        const patterns = [
            /Código de rastreo:.*?>(.*?)<|Código de rastreo:\s*(\d+)/is,
            /Servicio:.*?>(.*?)<|Servicio:\s*([^|<>]+)/is,
            /Fecha programada de entrega:.*?>(.*?)<|Fecha programada de entrega:\s*(\d{2}\/\d{2}\/\d{4})/is
        ];

        patterns.forEach((p, i) => {
            const match = html.match(p);
            console.log(`Pattern ${i} match:`, match ? (match[1] || match[2]) : 'null');
        });

        // Try simpler literal matches
        console.log('Simple "Código de rastreo" index:', html.indexOf('Código de rastreo'));
        console.log('Snippet:', html.substring(html.indexOf('Código de rastreo'), html.indexOf('Código de rastreo') + 200));

    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

debugScraper();
