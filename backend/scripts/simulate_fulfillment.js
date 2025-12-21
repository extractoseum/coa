
const axios = require('axios');
const fulfillment = {
    "id": 6186420535468,
    "order_id": 6993280434348,
    "tracking_company": "Estafeta",
    "tracking_number": "3055892120610706104294",
    "tracking_numbers": [
        "3055892120610706104294",
        "2015892120610605091008"
    ],
    "tracking_urls": [
        "https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=3055892120610706104294&wayBillType=0&isShipmentDetail=False",
        "https://cs.estafeta.com/es/Tracking/searchByGet?wayBill=2015892120610605091008&wayBillType=0&isShipmentDetail=False"
    ]
};

async function simulate() {
    console.log('Simulating fulfillment update webhook...');
    try {
        // We call the local API if security is disabled or we mock the handler
        // Since I'm on the same machine, I can try to trigger it via the backend if I can find the port.
        // Or I can just write a script that imports the handler and calls it.
        // But better is to just test the logic.
    } catch (e) {
        console.error(e);
    }
}
