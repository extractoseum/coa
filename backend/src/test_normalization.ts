import { normalizePhone } from './services/whapiService';

const testNumbers = [
    { input: '13038159669', expected: '13038159669', note: 'US number (Colorado) - Preserved' },
    { input: '17022137213', expected: '17022137213', note: 'US number - Preserved 11 digits' },
    { input: '+1 303 815 9669', expected: '13038159669', note: 'Formatted US' },
    { input: '5512345678', expected: '5215512345678', note: 'MX number (10 digits) -> Add 521' },
    { input: '1234567890', expected: '5211234567890', note: '10 digits (treated as MX)' },
    { input: '+5215512345678', expected: '5215512345678', note: 'Already normalized MX' }
];

console.log('--- WhatsApp Normalization Test (Phase 62) ---');
testNumbers.forEach(test => {
    // Note: normalizePhone expects a second argument for provider, defaulting to 'whapi' for testing
    const result = normalizePhone(test.input, 'whapi');
    const pass = result === test.expected;
    console.log(`${pass ? '✅' : '❌'} [${test.note}]`);
    console.log(`   Input:    ${test.input}`);
    console.log(`   Output:   ${result}`);
    if (!pass) console.log(`   Expected: ${test.expected}`);
});
