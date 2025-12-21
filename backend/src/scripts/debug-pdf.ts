const pdfLib = require('pdf-parse'); // Original
const pdfInternal = require('pdf-parse/lib/pdf-parse');

console.log('--- DEBUG PDF-PARSE ---');
console.log('Main require type:', typeof pdfLib);
console.log('Internal require type:', typeof pdfInternal);
console.log('Main keys:', Object.keys(pdfLib));
console.log('Internal keys:', Object.keys(pdfInternal));
console.log('-----------------------');
