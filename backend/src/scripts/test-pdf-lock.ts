
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { signingService } from '../services/signingService';

const TEST_PDF_PATH = path.join(__dirname, 'test-locked.pdf');
const SIGNED_PDF_PATH = path.join(__dirname, 'test-locked-signed.pdf');

async function runTest() {
    console.log('--- Testing PDF Permissions + Signing ---');

    try {
        // 1. Generate PDF with Permissions
        console.log('1. Generating PDF with OwnerPassword and Permissions...');

        const doc = new PDFDocument({
            size: 'LETTER',
            userPassword: '', // Allow opening without password
            ownerPassword: 'secure-admin-password-123',
            permissions: {
                modifying: false,
                copying: false,
                annotating: false,
                fillingForms: false,
                contentAccessibility: true, // Keep true for accessibility
                documentAssembly: false,
                printing: 'highResolution'
            }
        });

        // Add ByteRange placeholder for signing (Standard procedure for node-signpdf used in our controller)
        // Wait, our pdfController uses `signingService.signPDF` which adds the placeholder logic implies 
        // node-signpdf usually expects us to add the placeholder OR it adds it?
        // Let's check signingService.ts. 
        // If signingService uses `plainAddPlaceholder`, we need to do that. 
        // But usually we just pass the buffer to it.

        // Actually, let's verify if signingService ADDS the placeholder.
        // If it uses `signpdf.sign`, it typically requires a placeholder to already exist OR using a helper.
        // Let's check `signingService.ts` content first in my next step, but for this script I'll assume 
        // the standard flow used in pdfController.

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        doc.text('This is a locked PDF test.');
        doc.end();

        const pdfBuffer = await new Promise<Buffer>((resolve) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
        });

        console.log('PDF Generated. Size:', pdfBuffer.length);

        // 2. Try to Sign it
        console.log('2. Attempting to Sign encrypted PDF...');
        const signedPdf = await signingService.signPDF(pdfBuffer);

        console.log('Success! PDF Signed.');
        fs.writeFileSync(SIGNED_PDF_PATH, signedPdf);
        console.log('Saved to:', SIGNED_PDF_PATH);

    } catch (error) {
        console.error('Test Failed:', error);
    }
}

runTest();
