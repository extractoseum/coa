import {
    notifyTrackingUpdate,
    notifyOrderShipped,
    notifyDeliveryAttemptFailed,
    notifyPackageAtOffice,
    notifyDeliveryDelay
} from '../src/services/onesignalService';

// Use a known client ID from logs
const TEST_CLIENT_ID = '7cd732b6-438e-4a40-be4b-bb2153f14fe2';
const TEST_ORDER = 'SIM-EVO-123';

async function runSimulation() {
    console.log('--- STARTING ALERT NETWORK SIMULATION ---');

    // 1. Test Shipped with Service Type and ETA
    console.log('1. Simulating Shipped Notification...');
    await notifyOrderShipped(
        TEST_CLIENT_ID,
        TEST_ORDER,
        'Estafeta',
        '8067890123',
        undefined,
        new Date().toISOString(),
        'Día Siguiente'
    );

    // 2. Test Tracking Update with Location
    console.log('2. Simulating Tracking Update (Location: TOLUCA)...');
    await notifyTrackingUpdate(
        TEST_CLIENT_ID,
        TEST_ORDER,
        'in_transit',
        'Paquete en centro de distribución',
        undefined,
        'TOLUCA'
    );

    // 3. Test Failed Attempt
    console.log('3. Simulating Failed Attempt...');
    await notifyDeliveryAttemptFailed(TEST_CLIENT_ID, TEST_ORDER, 'Domicilio cerrado');

    // 4. Test Package at Office
    console.log('4. Simulating Package at Office...');
    await notifyPackageAtOffice(TEST_CLIENT_ID, TEST_ORDER, 'SUCURSAL TOLUCA CENTRO');

    // 5. Test Delay Alert
    console.log('5. Simulating Delay Alert...');
    await notifyDeliveryDelay(TEST_CLIENT_ID, TEST_ORDER);

    console.log('--- SIMULATION COMPLETE ---');
    console.log('Wait 5 seconds for logs to persist...');
    await new Promise(r => setTimeout(r, 5000));
}

runSimulation();
