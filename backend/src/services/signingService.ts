import forge from 'node-forge';
import signpdf from 'node-signpdf';
import { plainAddPlaceholder } from 'node-signpdf/dist/helpers'; // Helper for placeholder
import fs from 'fs';
import path from 'path';

export class SigningService {
    private p12Buffer: Buffer | null = null;
    private certificatePath: string;

    constructor() {
        // Path to certificate - can be configured via ENV
        this.certificatePath = process.env.SIGNING_CERT_PATH || path.join(process.cwd(), 'certs', 'coa-signer.p12');
        this.loadCertificate();
    }

    private loadCertificate() {
        try {
            if (fs.existsSync(this.certificatePath)) {
                this.p12Buffer = fs.readFileSync(this.certificatePath);
                console.log('[Signing] Certificate loaded successfully');
            } else {
                console.warn(`[Signing] Certificate not found at ${this.certificatePath}. Signatures will be skipped.`);
            }
        } catch (error) {
            console.error('[Signing] Error loading certificate:', error);
        }
    }

    public signPDF(pdfBuffer: Buffer): Buffer {
        if (!this.p12Buffer) {
            console.warn('[Signing] No certificate available. Returning unsigned PDF.');
            return pdfBuffer;
        }

        try {
            // Check if P12 needs passphrase? Usually node-signpdf expects buffer.
            // In a real scenario, we'd handle passphrase here.
            // 1. Add Placeholder (Required for node-signpdf if not present)
            // Even if PDFKit adds it? PDFKit doesn't add it by default.
            // We'll use the helper to be safe. 
            // Note: plainAddPlaceholder returns a Buffer.

            let bufferToSign = pdfBuffer;

            // Check if placeholder exists roughly (optimization)
            if (pdfBuffer.indexOf('/ByteRange') === -1) {
                console.log('[Signing] Adding signature placeholder...');
                bufferToSign = plainAddPlaceholder({
                    pdfBuffer: pdfBuffer,
                    reason: 'Procesado por SWIS WATCH',
                    contactInfo: 'verificacion@extractoseum.com',
                    name: 'Extractos EUM System',
                    location: 'Mexico',
                });
            }

            // 2. Sign
            const signedPdf = signpdf.sign(bufferToSign, this.p12Buffer);
            return signedPdf;
        } catch (error) {
            console.error('[Signing] Failed to sign PDF:', error);
            // In strict mode we might throw, but for now fallback to unsigned
            return pdfBuffer;
        }
    }
}

export const signingService = new SigningService();
