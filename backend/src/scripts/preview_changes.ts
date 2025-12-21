
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Mock PDF Controller
import { generateCOAPDF } from '../controllers/pdfController';

const runPreview = async () => {
    console.log('Generating preview for token: efda5b7e');
    const token = 'efda5b7e';

    const req: any = {
        params: { token },
        query: { recipient: 'PREVIEW USER' }, // Test watermark
        ip: '127.0.0.1',
        headers: {}
    };

    const res: any = {
        setHeader: (key: string, val: string) => { },
        status: (code: number) => {
            console.log('Status:', code);
            return res;
        },
        send: (body: any) => {
            if (Buffer.isBuffer(body)) {
                const outputPath = path.join(__dirname, 'test-preview-fixes.pdf');
                fs.writeFileSync(outputPath, body);
                console.log(`PDF Generated successfully at: ${outputPath}`);
            } else {
                console.log('Response:', body);
            }
        }
    };

    try {
        await generateCOAPDF(req, res);
    } catch (err) {
        console.error('Error generating PDF:', err);
    }
};

runPreview();
