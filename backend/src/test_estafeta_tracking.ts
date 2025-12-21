import axios from 'axios';

async function testEstafeta(waybill: string) {
    console.log(`Testing Estafeta tracking for: ${waybill}`);
    const url = `https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=${waybill}&wayBillType=0&isShipmentDetail=True`;

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = response.data;
        // console.log('HTML Response Sample:', html.substring(0, 1000));

        let status = 'unknown';
        if (html.includes('Entregado')) {
            status = 'delivered';
        } else if (html.includes('En Proceso de Entrega') || html.includes('En reparto')) {
            status = 'out_for_delivery';
        } else if (html.includes('Recibido por Estafeta')) {
            status = 'in_transit';
        } else if (html.includes('movimiento no encontrado') || html.includes('no encontrado')) {
            status = 'not_found';
        }

        console.log(`Detected Status: ${status}`);

        // Find specific phrases to see what's actually in there
        const keywords = ['Entregado', 'En reparto', 'Proceso', 'Recibido', 'Estafeta', 'Historia', 'Guia', 'Rastreo'];
        keywords.forEach(kw => {
            if (html.toLowerCase().includes(kw.toLowerCase())) {
                console.log(`Found keyword: ${kw}`);
            }
        });

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

// Test with Abraham's waybill
testEstafeta('4015900880630603363847');
// Test with Maria's waybill
testEstafeta('4055900880630703063954');
