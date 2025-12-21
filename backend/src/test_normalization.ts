import { normalizePhone } from './services/whapiService';

const testNumbers = [
    { input: '17022137213', expected: '5217022137213', note: 'US-looking number (treated as MX)' },
    { input: '7022137213', expected: '5217022137213', note: 'US-looking without prefix (treated as MX)' },
    { input: '+52 1 702 213 7213', expected: '5217022137213', note: 'Misformatted MX/US' },
    { input: '4613638719', expected: '5214613638719', note: 'Random 10 digits as MX' },
    { input: '5512345678', expected: '5215512345678', note: 'MX number (CDMX area)' },
    { input: '+1 (702) 213-7213', expected: '5217022137213', note: 'Formatted looking number' }
];

console.log('--- WhatsApp Normalization Test ---');
testNumbers.forEach(test => {
    const result = normalizePhone(test.input);
    const pass = result === test.expected;
    console.log(`${pass ? '✅' : '❌'} [${test.note}]`);
    console.log(`   Input:    ${test.input}`);
    console.log(`   Output:   ${result}`);
    if (!pass) console.log(`   Expected: ${test.expected}`);
});
