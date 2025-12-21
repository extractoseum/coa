const { updateOrderTracking } = require('../dist/services/trackingService');

async function testUpdate() {
    const orderId = process.argv[2] || '24af99f0-e1b3-4bf9-a125-4dbb2d9f3473'; // Fallback to EUM_1441_SHOP
    console.log(`Updating tracking for order ${orderId}...`);
    try {
        await updateOrderTracking(orderId);
        console.log('Update completed successfully.');
    } catch (err) {
        console.error('Update failed:', err);
    }
}

testUpdate();
