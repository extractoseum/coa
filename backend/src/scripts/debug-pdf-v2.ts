const pdfLibV2 = require('pdf-parse');

async function test() {
    console.log('Keys:', Object.keys(pdfLibV2));
    if (pdfLibV2.PDFParse) {
        console.log('PDFParse found. Type:', typeof pdfLibV2.PDFParse);
        // Try calling it as a function
        try {
            console.log('Trying to call PDFParse as function...');
            // Mock buffer
            const buffer = Buffer.from('test');
            const result = await pdfLib.PDFParse(buffer);
            console.log('Result:', result);
        } catch (e: any) {
            console.log('Call failed:', e.message);
        }

        // Try new PDFParse()??
        try {
            console.log('Trying new PDFParse()...');
            const instance = new pdfLib.PDFParse();
            console.log('Instance created:', instance);
        } catch (e: any) {
            console.log('Constructor failed:', e.message);
        }
    }
}

test();
