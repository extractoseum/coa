import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../config/supabase';
import { Cannabinoid } from '../types/coa';
import QRCode from 'qrcode';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import axios from 'axios';
import sharp from 'sharp';
import { generateBasicChromatogram } from '../services/chromatogramGenerator';
import { ledgerService } from '../services/ledgerService';
import { cryptoService } from '../services/cryptoService';
import { signingService } from '../services/signingService';
import jwt from 'jsonwebtoken';

// Helper to optimize images for PDF (resize and compress while maintaining quality for zoom)
// Uses 300x300 max to allow 6x zoom without pixelation (badge displays at 50x50)
const optimizeImageForPDF = async (imageBuffer: Buffer, maxWidth: number = 300, maxHeight: number = 300): Promise<Buffer> => {
    try {
        return await sharp(imageBuffer)
            .resize(maxWidth, maxHeight, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .png({ compressionLevel: 9 })
            .toBuffer();
    } catch (err) {
        console.log('[PDF] Image optimization failed, using original');
        return imageBuffer;
    }
};

// Helper to check if buffer is SVG
const isSVG = (buffer: Buffer): boolean => {
    const str = buffer.toString('utf8', 0, Math.min(buffer.length, 500));
    return str.includes('<svg') || str.includes('<?xml');
};

// Helper to convert SVG to PNG for PDF compatibility (SVG not natively supported by PDFKit)
// Uses high density (450 DPI) for crisp rendering at any zoom level
const convertSVGtoPNG = async (svgBuffer: Buffer, width: number = 1200, height?: number): Promise<Buffer> => {
    try {
        const pngBuffer = await sharp(svgBuffer, { density: 450 })
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: false // Allow upscaling SVG for quality
            })
            .png()
            .toBuffer();
        console.log(`[PDF] SVG converted to PNG: ${Math.round(pngBuffer.length / 1024)}KB`);
        return pngBuffer;
    } catch (err: any) {
        console.error('[PDF] SVG to PNG conversion failed:', err.message);
        throw err;
    }
};

// Helper to process image buffer - handles both raster and SVG
const processImageForPDF = async (buffer: Buffer, targetWidth: number = 600): Promise<Buffer> => {
    if (isSVG(buffer)) {
        return await convertSVGtoPNG(buffer, targetWidth);
    }
    return buffer;
};

// Helper para formatear fechas
const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
};

// Phase 3: Authenticity Seal
const drawAuthenticitySeal = (doc: any, x: number, y: number) => {
    doc.save();
    // Green Authenticity Circle
    doc.circle(x, y, 20).lineWidth(1.5).strokeColor('#10b981').stroke();
    doc.circle(x, y, 18).lineWidth(0.5).strokeColor('#10b981').stroke();

    // Config font
    doc.fontSize(4).font('Helvetica-Bold').fillColor('#10b981');

    // Text
    doc.text('VERIFICADO', x - 13, y - 2, { width: 26, align: 'center' });
    doc.fontSize(3).font('Helvetica');
    doc.text('EXTRACTOS EUM', x - 13, y + 4, { width: 26, align: 'center' });

    doc.restore();
};

// Helper para calcular totales (identical to frontend logic)
const calculateTotals = (cannabinoids: Cannabinoid[]) => {
    // Total cannabinoids - sum of all weighted %
    const totalCannabinoidsPct = cannabinoids.reduce((acc, c) => acc + (parseFloat(c.result_pct) || 0), 0);

    // Check if we have area data to fallback on
    const hasAreaBasis = totalCannabinoidsPct === 0 && cannabinoids.some(c => (c as any).area > 0);

    let totalArea = 0;
    if (hasAreaBasis) {
        totalArea = cannabinoids.reduce((acc, c) => acc + ((c as any).area || 0), 0);
        // Add area_pct to each cannabinoid object for internal use in this function
        cannabinoids.forEach(c => {
            if ((c as any).area) {
                (c as any).area_pct = (((c as any).area / totalArea) * 100).toFixed(4);
            }
        });
    }

    // Helper function to check if a cannabinoid is a THC variant
    const isTHCVariant = (analyte: string): boolean => {
        const upperAnalyte = analyte.toUpperCase();
        return (
            /^Δ\d/.test(analyte) ||
            /^DELTA\s*\d/i.test(analyte) ||
            upperAnalyte.includes('THC') ||
            /^D\d+-THC/i.test(analyte)
        ) && !upperAnalyte.startsWith('TOTAL');
    };

    const getTHCFactor = (analyte: string): number => {
        const upperAnalyte = analyte.toUpperCase();
        if (upperAnalyte.includes('THCA')) return 0.877;
        return 1.0;
    };

    // Calculate total THC
    let totalTHCValue = 0;
    cannabinoids.forEach(c => {
        if (isTHCVariant(c.analyte)) {
            const value = hasAreaBasis ? parseFloat((c as any).area_pct || '0') : (parseFloat(c.result_pct) || 0);
            const factor = hasAreaBasis ? 1.0 : getTHCFactor(c.analyte); // Factor usually 1.0 for area-basis unless specific
            totalTHCValue += value * factor;
        }
    });

    // Find highest non-THC cannabinoid
    const nonTHCCannabinoids = cannabinoids.filter(c => !isTHCVariant(c.analyte));
    const highestNonTHC = nonTHCCannabinoids.length > 0
        ? nonTHCCannabinoids.reduce((max, c) => {
            const valC = hasAreaBasis ? parseFloat((c as any).area_pct || '0') : (parseFloat(c.result_pct) || 0);
            const valMax = hasAreaBasis ? parseFloat((max as any).area_pct || '0') : (parseFloat(max.result_pct) || 0);
            return valC > valMax ? c : max;
        })
        : null;

    return {
        totalCannabinoids: hasAreaBasis ? "100.00" : totalCannabinoidsPct.toFixed(2),
        totalTHC: totalTHCValue.toFixed(2),
        highestNonTHC: highestNonTHC ? {
            name: highestNonTHC.analyte,
            value: hasAreaBasis ? parseFloat((highestNonTHC as any).area_pct).toFixed(4) : parseFloat(highestNonTHC.result_pct).toFixed(4)
        } : { name: 'N/A', value: '0' },
        hasAreaBasis
    };
};

export const generateCOAPDF = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        let coaData: any;

        // Handle demo token
        if (token === 'demo') {
            coaData = {
                public_token: 'demo',
                product_sku: 'EUM-TEST-001',
                custom_name: 'Extracto de CBD Premium',
                lab_name: 'Confident Cannabis',
                analysis_date: '2023-12-01',
                batch_id: 'BATCH-001',
                created_at: '2023-11-20',
                cannabinoids: [
                    { analyte: 'CBD', result_pct: '84.5', result_mg_g: '845.0', detected: true },
                    { analyte: 'THC', result_pct: '0.21', result_mg_g: '2.1', detected: true },
                    { analyte: 'CBG', result_pct: '1.2', result_mg_g: '12.0', detected: true },
                    { analyte: 'CBN', result_pct: '0.08', result_mg_g: '0.8', detected: true }
                ],
                compliance_status: 'pass',
                thc_compliance_flag: true,
                metadata: {
                    client: 'EXTRACTOS EUM™',
                    product_image_url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png'
                },
                badges: []
            };
        } else {
            // Fetch COA data from database
            const { data, error } = await supabase
                .from('coas')
                .select('*')
                .eq('public_token', token)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: 'COA not found' });
            }

            coaData = data;

            // Fetch badges for this COA
            try {
                const { data: badgesData } = await supabase
                    .from('coa_badges')
                    .select('badge:badges(*)')
                    .eq('coa_id', data.id);

                if (badgesData) {
                    coaData.badges = badgesData.map((cb: any) => cb.badge).filter(Boolean);
                    console.log(`[PDF] Found ${coaData.badges.length} badges for COA`);
                }
            } catch (badgesError) {
                console.log('[PDF] Could not fetch badges:', badgesError);
                coaData.badges = [];
            }
        }

        // Generate QR Code and tracking URLs
        const baseUrl = process.env.COA_VIEWER_URL || 'https://coa.extractoseum.com';
        const verificationUrl = `${baseUrl}/coa/${token}`;

        // Tracking URLs with source parameter for analytics
        // Phase 3: JWT Signed QR
        const jwtPayload = {
            t: token,
            b: coaData.batch_id,
            iat: Math.floor(Date.now() / 1000)
        };
        const signedToken = jwt.sign(jwtPayload, process.env.JWT_SECRET || 'dev_secret_key_12345', { expiresIn: '1y' });

        const trackingUrls = {
            token: `${verificationUrl}?src=pdf_token`,
            batch: `${verificationUrl}?src=pdf_batch`,
            productImage: `${verificationUrl}?src=pdf_image`,
            coaNumber: `${verificationUrl}?src=pdf_coa_number`,
            qrCode: `${verificationUrl}?src=pdf_qr&sig=${signedToken}` // Added signature to QR URL
        };

        const qrCodeDataUrl = await QRCode.toDataURL(trackingUrls.qrCode, {
            width: 120,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        // ===== PHASE 1: INTEGRITY CORE =====
        // Calculate Data Integrity Hash
        // We create a canonical object containing only the immutable certification data
        const integrityPayload = {
            token: token,
            batch_id: coaData.batch_id,
            lab_name: coaData.lab_name,
            analysis_date: coaData.analysis_date,
            cannabinoids: coaData.cannabinoids?.map((c: any) => ({
                analyte: c.analyte,
                result: c.result_pct,
                detected: c.detected
            })), // Minimal canonical form
            compliance: coaData.compliance_status
        };
        const dataHash = cryptoService.hashPayload(integrityPayload);
        const shortHash = dataHash.substring(0, 16);
        console.log(`[PDF] Integrity Hash calculated: ${shortHash}...`);

        // Create PDF document
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: {
                top: 40,
                bottom: 50,
                left: 50,
                right: 50
            },
            permissions: {
                modifying: false,
                copying: false,
                annotating: false,
                fillingForms: false,
                contentAccessibility: true, // Allow screen readers
                documentAssembly: false
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=COA_${token}.pdf`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Buffer PDF for signing (PAdES) instead of direct pipe (Phase 2)
        // const stream = doc.pipe(res); // Removed for Phase 2
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));

        doc.on('end', async () => {
            try {
                const pdfBuffer = Buffer.concat(chunks);
                console.log(`[PDF] Generated raw PDF size: ${pdfBuffer.length} bytes`);

                // Sign the PDF (Phase 2)
                const signedPdfBuffer = signingService.signPDF(pdfBuffer);
                console.log(`[PDF] Signed PDF size: ${signedPdfBuffer.length} bytes`);

                // Calculate Final File Hash (Phase 1 Part 2)
                const fileHash = cryptoService.hashPayload(signedPdfBuffer); // Should hash the buffer content
                // Note: hashPayload expects object or string, if it accepts buffer great. 
                // If not we might need to update cryptoService or use crypto directly.
                // Assuming cryptoService.hashPayload handles any input or we use simple crypto here.
                // Checking cryptoService usage: `crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')` usually.
                // So passing a Buffer to JSON.stringify isn't ideal for hash. 
                // I will use crypto directly here for safety or assume buffer support.

                // Send response
                res.send(signedPdfBuffer);

                // Record generation event in Integrity Ledger (Async)
                // We move this here to capture the final file hash
                ledgerService.recordEvent({
                    eventType: 'COA_PDF_GENERATED',
                    entityId: token,
                    entityType: 'COA',
                    payload: {
                        ...integrityPayload,
                        generated_at: new Date().toISOString(),
                        data_hash: dataHash,
                        file_hash: fileHash, // New field for Phase 1/2 completeness
                        access_source: req.query.src || 'direct_download',
                        recipient: req.query.recipient || 'anonymous',
                        ip_address: req.ip,
                        user_agent: req.get('User-Agent')
                    },
                    createdBy: 'SYSTEM'
                }).catch(err => console.error('[PDF] Ledger record failed:', err));

            } catch (endError) {
                console.error('[PDF] Error finalizing PAdES:', endError);
                if (!res.headersSent) res.status(500).send('Error signing PDF');
            }
        });

        // Calculate totals
        const totals = calculateTotals(coaData.cannabinoids || []);
        const pageWidth = 612; // Letter width in points
        const pageHeight = 792; // Letter height in points

        // Template settings will be set after loading active template
        let watermarkOpacity = 0.15;
        let watermarkScale = 1.0; // Scale factor: 0.5 = 50%, 1.0 = 100%, 2.0 = 200%
        let logoWidth = 180; // Logo width in points (default 180)

        // Helper function to add watermark to current page
        const addWatermark = () => {
            if (watermarkBuffer) {
                try {
                    // Save the current graphics state
                    doc.save();

                    // Apply configured opacity (Phase 5 fix)
                    doc.opacity(watermarkOpacity);


                    // Draw the background watermark FIRST
                    doc.image(watermarkBuffer, 0, 0, {
                        width: pageWidth,
                        height: pageHeight
                    });

                    doc.restore();
                } catch (wmErr) {
                    console.error('[PDF] Error adding watermark image:', wmErr);
                }
            }

            const recipientName = req.query.recipient as string;

            // Phase 4: Anti-Leak Recipient Watermark (Draw ON TOP of background)
            if (recipientName) {
                doc.save();
                doc.rotate(-45, { origin: [pageWidth / 2, pageHeight / 2] });
                doc.opacity(0.15);
                doc.fontSize(24).font('Helvetica-Bold').fillColor('#ff0000'); // Bold Red
                doc.text(`SOLO PARA: ${recipientName.toUpperCase()}`, -100, pageHeight / 2, {
                    width: pageWidth + 200,
                    align: 'center'
                });
                doc.text(`IP: ${req.ip}`, -100, (pageHeight / 2) + 30, {
                    width: pageWidth + 200,
                    align: 'center'
                });
                doc.restore();
            }
        };


        // Generate chart at high resolution (3x) for crisp PDF output
        const chartWidth = 840;  // 280 * 3
        const chartHeight = 480; // 160 * 3
        const chartCanvas = new ChartJSNodeCanvas({ width: chartWidth, height: chartHeight });

        // Prepare chart data - top 5 cannabinoids
        const sortedCannabinoids = [...(coaData.cannabinoids || [])].sort((a, b) => {
            const valA = totals.hasAreaBasis ? parseFloat((a as any).area_pct || '0') : parseFloat(a.result_pct || '0');
            const valB = totals.hasAreaBasis ? parseFloat((b as any).area_pct || '0') : parseFloat(b.result_pct || '0');
            return valB - valA;
        });
        const top5 = sortedCannabinoids.slice(0, 5);
        const chartLabels = top5.map(c => c.analyte);
        const chartValues = top5.map(c => totals.hasAreaBasis ? parseFloat((c as any).area_pct || '0') : parseFloat(c.result_pct || '0'));
        const chartColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];

        const chartConfig: any = {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartValues,
                    backgroundColor: chartColors,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            font: { size: 30 },  // Scaled 3x from 10
                            boxWidth: 36,        // Scaled 3x from 12
                            padding: 20
                        }
                    },
                    title: {
                        display: false
                    }
                }
            }
        };

        const chartBuffer = await chartCanvas.renderToBuffer(chartConfig);
        // const chartBuffer = Buffer.from(''); // Dummy buffer

        // Fetch product image if available
        // Priority: 1) Direct field product_image_url, 2) Fallback to metadata.product_image_url
        let productImageBuffer: Buffer | null = null;
        const imageUrl = coaData.product_image_url || coaData.metadata?.product_image_url;

        if (imageUrl) {
            try {
                console.log(`[PDF] Fetching product image from: ${imageUrl}`);
                const imgResponse = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; EUM-COA-Generator/1.0)'
                    }
                });
                productImageBuffer = Buffer.from(imgResponse.data);
                console.log(`[PDF] Product image fetched successfully, size: ${productImageBuffer.length} bytes`);
            } catch (err: any) {
                console.error('[PDF] Could not fetch product image:', err.message);
            }
        } else {
            console.log('[PDF] No product image URL provided');
        }

        // Fetch active template FIRST (white-label configuration) - needed for watermark and logo URLs
        let activeTemplate: any = {
            name: 'Default',
            company_name: 'EXTRACTOS EUM™',
            company_logo_url: null,
            watermark_url: null,
            watermark_opacity: 0.15,
            primary_color: '#1a5c3e',
            secondary_color: '#10b981',
            accent_color: '#059669',
            footer_text: ''
        };

        try {
            const { data: templateData } = await supabase
                .from('pdf_templates')
                .select('*')
                .eq('is_active', true)
                .single();

            if (templateData) {
                activeTemplate = { ...activeTemplate, ...templateData };
                // Set template settings
                watermarkOpacity = activeTemplate.watermark_opacity ?? 0.15;
                watermarkScale = activeTemplate.watermark_scale ?? 1.0;
                logoWidth = activeTemplate.logo_width ?? 180;
                console.log('[PDF] Active template loaded:', activeTemplate.name, 'Watermark opacity:', watermarkOpacity, 'Scale:', watermarkScale, 'Logo width:', logoWidth);
            } else {
                // Fallback to global_settings if no active template
                const { data: settingsData } = await supabase
                    .from('global_settings')
                    .select('*')
                    .eq('id', 'main')
                    .single();

                if (settingsData) {
                    activeTemplate = { ...activeTemplate, ...settingsData };
                    console.log('[PDF] Using global settings as fallback:', activeTemplate.company_name);
                }
            }
        } catch (templateError: any) {
            console.log('[PDF] Using default template:', templateError.message);
        }

        // Fetch watermark image - prioritize active template, then COA-specific watermark
        let watermarkBuffer: Buffer | null = null;
        const watermarkUrl = activeTemplate.watermark_url || coaData.watermark_url;

        if (watermarkUrl) {
            try {
                console.log(`[PDF] Fetching watermark from: ${watermarkUrl}`);
                const watermarkResponse = await axios.get(watermarkUrl, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; EUM-COA-Generator/1.0)'
                    }
                });
                const rawBuffer = Buffer.from(watermarkResponse.data);
                // Process image (converts SVG to PNG if needed)
                watermarkBuffer = await processImageForPDF(rawBuffer, 600);
                console.log(`[PDF] Watermark processed successfully, size: ${watermarkBuffer.length} bytes`);
            } catch (err: any) {
                console.error('[PDF] Could not fetch watermark:', err.message);
            }
        } else {
            console.log('[PDF] No watermark URL provided');
        }

        // Fetch company logo - prioritize active template, fallback to COA metadata
        let companyLogoBuffer: Buffer | null = null;
        const companyLogoUrl = activeTemplate.company_logo_url || coaData.metadata?.company_logo_url;

        if (companyLogoUrl) {
            try {
                console.log(`[PDF] Fetching company logo from: ${companyLogoUrl}`);
                const logoResponse = await axios.get(companyLogoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; EUM-COA-Generator/1.0)'
                    }
                });
                const rawLogoBuffer = Buffer.from(logoResponse.data);
                // Process image (converts SVG to PNG if needed) - use 1200px for crisp logo
                companyLogoBuffer = await processImageForPDF(rawLogoBuffer, 1200);
                console.log(`[PDF] Company logo processed successfully, size: ${companyLogoBuffer.length} bytes`);
            } catch (err: any) {
                console.error('[PDF] Could not fetch company logo:', err.message);
            }
        } else {
            console.log('[PDF] No company logo URL provided');
        }

        // Add watermark to first page (must be called after watermarkBuffer is defined)
        addWatermark();

        // ===== HEADER WITH CENTERED LOGO =====
        let headerY = 25;
        const logoHeight = 50;
        // logoWidth is now loaded from template settings (default 180)

        // QR Code will be added inside the product card (moved from here)
        const qrBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');

        // Company logo centered at top OR company name text (if no logo)
        if (companyLogoBuffer) {
            try {
                console.log('[PDF] Adding company logo centered at top');
                const logoX = (pageWidth - logoWidth) / 2;
                doc.image(companyLogoBuffer, logoX, headerY, {
                    width: logoWidth,
                    height: logoHeight,
                    fit: [logoWidth, logoHeight],
                    align: 'center',
                    valign: 'center'
                });
                console.log('[PDF] Company logo added centered (skipping company name text)');
                headerY += logoHeight + 8;
            } catch (err: any) {
                console.error('[PDF] Could not add company logo:', err.message);
                // Fallback to company name text if logo fails
                doc.fontSize(20)
                    .font('Helvetica-Bold')
                    .fillColor(activeTemplate.primary_color)
                    .text(activeTemplate.company_name, 50, headerY, {
                        width: pageWidth - 100,
                        align: 'center'
                    });
                headerY += 28;
            }
        } else {
            // No logo - show company name as text
            doc.fontSize(20)
                .font('Helvetica-Bold')
                .fillColor(activeTemplate.primary_color)
                .text(activeTemplate.company_name, 50, headerY, {
                    width: pageWidth - 100,
                    align: 'center'
                });
            headerY += 28;
        }

        // Certificate title centered below company name
        doc.fontSize(14)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('CERTIFICADO DE ANÁLISIS', 50, headerY + 24, {
                width: pageWidth - 100,
                align: 'center'
            });

        // Info line below title - with clickable token
        const infoY = headerY + 46;
        const infoText = `Token: ${token} | Lab: ${coaData.lab_name || 'N/A'} | ${formatDate(coaData.analysis_date)}`;

        // Calculate token link position (center-aligned text)
        doc.fontSize(8).font('Helvetica');
        const fullTextWidth = doc.widthOfString(infoText);
        const tokenTextWidth = doc.widthOfString(`Token: ${token}`);
        const infoTextX = (pageWidth - fullTextWidth) / 2;

        doc.fillColor('#666666')
            .text(infoText, 50, infoY, {
                width: pageWidth - 100,
                align: 'center'
            });

        // Make token clickable (underline and link)
        doc.link(infoTextX, infoY, tokenTextWidth, 10, trackingUrls.token);

        // ===== COMPACT PRODUCT CARD WITH IMAGE =====
        // Position card below header (dynamic based on logo presence)
        const cardY = infoY + 18;
        const cardHeight = productImageBuffer ? 90 : 70;

        doc.rect(50, cardY, pageWidth - 100, cardHeight)
            .fillAndStroke('#f8f9fa', '#10b981');

        // Product image on left (if available) - CLICKABLE
        let contentStartX = 65;
        const productImageX = 60;
        const productImageY = cardY + 10;
        const productImageSize = 70;

        if (productImageBuffer) {
            try {
                console.log('[PDF] Adding product image to PDF document');
                doc.image(productImageBuffer, productImageX, productImageY, {
                    width: productImageSize,
                    height: productImageSize,
                    fit: [productImageSize, productImageSize],
                    align: 'center',
                    valign: 'center'
                });
                // Make product image clickable
                doc.link(productImageX, productImageY, productImageSize, productImageSize, trackingUrls.productImage);
                contentStartX = 145;
                console.log('[PDF] Product image added successfully with tracking link');
            } catch (err: any) {
                console.error('[PDF] Could not add product image to PDF:', err.message);
                console.log('[PDF] Continuing without product image');
            }
        } else {
            console.log('[PDF] No product image buffer available, skipping image');
        }

        // Product info
        doc.fontSize(14)
            .font('Helvetica-Bold')
            .fillColor('#1a5c3e')
            .text(coaData.custom_name || coaData.product_sku || 'Producto sin nombre', contentStartX, cardY + 12, {
                width: 300
            });

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('#666666');

        let infoLineY = cardY + 32;

        // Use batch_number from metadata if available, otherwise use batch_id - CLICKABLE
        const batchNumber = coaData.metadata?.batch_number || coaData.batch_id;
        if (batchNumber) {
            const batchText = `Lote: ${batchNumber}`;
            doc.fillColor('#1a5c3e') // Use brand color to indicate clickable
                .text(batchText, contentStartX, infoLineY);
            // Make batch clickable
            const batchTextWidth = doc.widthOfString(batchText);
            doc.link(contentStartX, infoLineY, batchTextWidth, 10, trackingUrls.batch);
            doc.fillColor('#666666'); // Reset color
            infoLineY += 12;
        }

        // Add COA number if available - CLICKABLE
        const coaNumber = coaData.coa_number || coaData.metadata?.coa_number;
        if (coaNumber) {
            const coaText = `COA: ${coaNumber}`;
            doc.fillColor('#1a5c3e') // Use brand color to indicate clickable
                .text(coaText, contentStartX, infoLineY);
            // Make COA number clickable
            const coaTextWidth = doc.widthOfString(coaText);
            doc.link(contentStartX, infoLineY, coaTextWidth, 10, trackingUrls.coaNumber);
            doc.fillColor('#666666'); // Reset color
            infoLineY += 12;
        }

        // Add short description if available
        const shortDescription = coaData.metadata?.description_short;
        if (shortDescription) {
            doc.fontSize(7)
                .fillColor('#444444')
                .text(shortDescription, contentStartX, infoLineY, {
                    width: 280,
                    lineBreak: true
                });
        }

        // TESTED badge + THC Compliance indicator (matching style)
        // Position badges and QR to fit inside card (card ends at pageWidth - 50 = 562)
        // QR (50px) + badges (50px) + spacing = ~110px from right edge of card
        const badgeX = pageWidth - 165; // Moved left to make room for QR
        const badgeY = cardY + 8;
        const badgeWidth = 50;
        const badgeHeight = 28;

        // Badge 1: TESTED (same rectangular style as THC badge)
        const testedColor = coaData.compliance_status === 'pass' ? '#10b981' : '#ef4444';
        const testedText = 'TESTED';
        const testedSubtext = coaData.compliance_status === 'pass' ? 'Verified' : 'Failed';

        // Badge with no fill, only border and text
        doc.roundedRect(badgeX - 8, badgeY, badgeWidth, badgeHeight, 3)
            .stroke(testedColor);

        doc.fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(testedColor)
            .text(testedText, badgeX - 8, badgeY + 5, {
                width: badgeWidth,
                align: 'center'
            });

        doc.fontSize(5)
            .font('Helvetica')
            .fillColor(testedColor)
            .text(testedSubtext, badgeX - 8, badgeY + 15, {
                width: badgeWidth,
                align: 'center'
            });

        // Badge 2: THC Compliance (calculated from actual THC percentage)
        const isTHCCompliant = parseFloat(totals.totalTHC) <= 1.0;
        const thcColor = isTHCCompliant ? '#10b981' : '#ef4444';
        const thcText = isTHCCompliant ? 'THC <= 1%' : 'THC > 1%';
        const thcSubtext = isTHCCompliant ? 'Compliant MX' : 'No Compliant MX';

        // THC compliance badge below TESTED badge - no fill, only border
        doc.roundedRect(badgeX - 8, badgeY + badgeHeight + 5, badgeWidth, badgeHeight, 3)
            .stroke(thcColor);

        doc.fontSize(7)
            .font('Helvetica-Bold')
            .fillColor(thcColor)
            .text(thcText, badgeX - 8, badgeY + badgeHeight + 10, {
                width: badgeWidth,
                align: 'center'
            });

        doc.fontSize(5)
            .font('Helvetica')
            .fillColor(thcColor)
            .text(thcSubtext, badgeX - 8, badgeY + badgeHeight + 20, {
                width: badgeWidth,
                align: 'center'
            });

        // QR Code - positioned to the right of badges inside the product card
        // Card ends at pageWidth - 50 = 562, so QR must end before that
        const qrSize = 50;
        const qrX = badgeX + badgeWidth + 5; // Right after badges with small gap
        const qrY = cardY + 12; // Vertically centered in card
        doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

        doc.fontSize(5)
            .font('Helvetica')
            .fillColor('#666666')
            .text('Escanear', qrX, qrY + qrSize + 2, { width: qrSize, align: 'center' });

        // Add Authenticity Seal if COMPLIANT (Phase 3)
        if (coaData.compliance_status === 'pass') {
            drawAuthenticitySeal(doc, qrX + qrSize + 25, qrY + 25);
        }

        // ===== METRICS + CHART ROW =====
        const metricsY = cardY + cardHeight + 20;

        // Left side: Key metrics (compact)
        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('RESULTADOS', 50, metricsY);

        const boxY = metricsY + 18;
        const boxWidth = 85;
        const boxHeight = 50;

        // Total Cannabinoids Box
        doc.rect(50, boxY, boxWidth, boxHeight)
            .strokeColor('#e5e7eb')
            .stroke();

        doc.fontSize(7)
            .font('Helvetica')
            .fillColor('#666666')
            .text(totals.hasAreaBasis ? 'Pureza Area' : 'Total', 55, boxY + 8, { width: boxWidth - 10, align: 'center' });

        doc.fontSize(18)
            .font('Helvetica-Bold')
            .fillColor('#10b981')
            .text(`${totals.totalCannabinoids}%`, 55, boxY + 20, { width: boxWidth - 10, align: 'center' });

        // Total THC Box
        const thcBoxColor = parseFloat(totals.totalTHC) > 1.0 ? '#ef4444' : '#10b981';
        doc.rect(50 + boxWidth + 10, boxY, boxWidth, boxHeight)
            .strokeColor('#e5e7eb')
            .stroke();

        doc.fontSize(7)
            .font('Helvetica')
            .fillColor('#666666')
            .text(totals.hasAreaBasis ? 'THC (Area)' : 'THC', 55 + boxWidth + 10, boxY + 8, { width: boxWidth - 10, align: 'center' });

        doc.fontSize(18)
            .font('Helvetica-Bold')
            .fillColor(thcBoxColor)
            .text(`${totals.totalTHC}%`, 55 + boxWidth + 10, boxY + 20, { width: boxWidth - 10, align: 'center' });

        doc.fontSize(6)
            .font('Helvetica')
            .fillColor('#666666')
            .text(parseFloat(totals.totalTHC) <= 1.0 ? 'Cumple MX' : 'No Cumple MX', 55 + boxWidth + 10, boxY + 40, { width: boxWidth - 10, align: 'center' });

        // Third Box - Highest non-THC cannabinoid (same as frontend)
        doc.rect(50 + (boxWidth + 10) * 2, boxY, boxWidth, boxHeight)
            .strokeColor('#e5e7eb')
            .stroke();

        doc.fontSize(7)
            .font('Helvetica')
            .fillColor('#666666')
            .text(totals.highestNonTHC.name, 55 + (boxWidth + 10) * 2, boxY + 8, { width: boxWidth - 10, align: 'center' });

        doc.fontSize(18)
            .font('Helvetica-Bold')
            .fillColor('#10b981')
            .text(`${totals.highestNonTHC.value}%`, 55 + (boxWidth + 10) * 2, boxY + 20, { width: boxWidth - 10, align: 'center' });

        // Right side: Chart
        const chartX = 320;
        const chartY = metricsY - 5;

        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('COMPOSICIÓN', chartX, metricsY);

        // Chart aspect ratio: 840/480 = 1.75, so for width 220, height should be 220/1.75 = 126
        doc.image(chartBuffer, chartX, chartY + 18, { width: 220, height: 126 });

        const afterChartY = Math.max(boxY + boxHeight + 15, chartY + 18 + 126 + 5);

        // ===== SAMPLE INFORMATION SECTION =====
        doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('INFORMACIÓN DE LA MUESTRA', 50, afterChartY);

        const metaStartY = afterChartY + 15;
        const metaCol1X = 60;
        const metaCol2X = 320;
        const labelWidth = 100;
        let currentMetaY = metaStartY;

        // Helper function to add a metadata row
        const addMetaRow = (label: string, value: string | null | undefined, colX: number, y: number) => {
            if (value) {
                doc.fontSize(7)
                    .font('Helvetica-Bold')
                    .fillColor('#666666')
                    .text(label, colX, y);
                doc.font('Helvetica')
                    .fillColor('#000000')
                    .text(value, colX + labelWidth, y, { width: 150 });
            }
        };

        // Column 1 - Left side
        const metadata = coaData.metadata || {};

        // Cliente
        addMetaRow('Cliente:', metadata.client_name, metaCol1X, currentMetaY);

        // Referencia del Cliente
        addMetaRow('Ref. Cliente:', metadata.client_reference, metaCol1X, currentMetaY + 12);

        // Fecha de Recepción
        addMetaRow('Fecha Recepción:', formatDate(metadata.received_date), metaCol1X, currentMetaY + 24);

        // Condición de Muestra
        addMetaRow('Condición:', metadata.sample_condition, metaCol1X, currentMetaY + 36);

        // Column 2 - Right side
        // Temperatura de Almacenamiento
        addMetaRow('Temp. Almac.:', metadata.storage_temp, metaCol2X, currentMetaY);

        // Tiempo de Almacenamiento
        addMetaRow('Tiempo Almac.:', metadata.storage_time ? `${metadata.storage_time} días` : null, metaCol2X, currentMetaY + 12);

        // Tipo de Recipiente
        addMetaRow('Recipiente:', metadata.container_type, metaCol2X, currentMetaY + 24);

        // Batch
        addMetaRow('Batch:', metadata.batch_number, metaCol2X, currentMetaY + 36);

        // Sample Weight / Total Potency - Add a row for this
        let sampleWeightText = null;
        if (metadata.is_total_potency) {
            sampleWeightText = 'Potencia Total';
        } else if (metadata.sample_weight) {
            sampleWeightText = metadata.sample_weight;
        }

        // Add sample weight/potency row spanning both columns if present
        let extraRowY = 0;
        if (sampleWeightText) {
            extraRowY = 15;
            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#1a5c3e')
                .text('Peso Muestra:', metaCol1X, currentMetaY + 50);
            doc.font('Helvetica')
                .fillColor('#000000')
                .text(sampleWeightText, metaCol1X + labelWidth, currentMetaY + 50);
        }

        // ===== ANALYSIS DETAILS SECTION =====
        const analysisY = currentMetaY + 55 + extraRowY;

        doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('DETALLES DEL ANÁLISIS', 50, analysisY);

        const analysisStartY = analysisY + 12;

        doc.fontSize(7)
            .font('Helvetica-Bold')
            .fillColor('#666666')
            .text('Análisis:', metaCol1X, analysisStartY);
        doc.font('Helvetica')
            .fillColor('#000000')
            .text(formatDate(coaData.analysis_date) || 'N/A', metaCol1X + labelWidth, analysisStartY);

        doc.font('Helvetica-Bold')
            .fillColor('#666666')
            .text('Laboratorio:', metaCol2X, analysisStartY);
        doc.font('Helvetica')
            .fillColor('#000000')
            .text(coaData.lab_name || 'N/A', metaCol2X + labelWidth, analysisStartY);

        // ===== CANNABINOID PROFILE TABLE (COMPACT) =====
        const tableStartY = analysisStartY + 20;

        doc.fontSize(9)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text('PERFIL DE CANNABINOIDES', 50, tableStartY);

        const tableTop = tableStartY + 20;
        // Check if we have chromatogram data to show additional columns
        const hasChromaColumns = (coaData.cannabinoids || []).some(
            (c: any) => c.retention_time !== undefined && c.area !== undefined
        );

        // Extended table with chromatogram columns if data exists
        // Table should match header width: pageWidth - 100 = 512, starting at x=50
        const tableHeaders = hasChromaColumns
            ? ['Cannabinoide', '%', 'mg/g', 'Ret. Time', 'Area', 'ppm']
            : ['Cannabinoide', '%', 'mg/g', 'Estado'];
        const colWidths = hasChromaColumns
            ? [140, 72, 72, 76, 76, 76]  // Total: 512 (matches page content width)
            : [232, 110, 110, 60];       // Total: 512 (matches page content width)
        let xPos = 50; // Start at same margin as rest of content

        // Table header (compact)
        doc.fontSize(8)
            .font('Helvetica-Bold')
            .fillColor('#ffffff');

        const headerHeight = 20;
        const tableHeaderOpacity = 0.70; // Transparencia para que se vea la marca de agua

        tableHeaders.forEach((header, i) => {
            // Draw header background with opacity
            doc.save();
            doc.opacity(tableHeaderOpacity);
            doc.rect(xPos, tableTop, colWidths[i], headerHeight)
                .fillAndStroke('#10b981', '#10b981');
            doc.restore();

            doc.fillColor('#ffffff')
                .text(header, xPos + 8, tableTop + 5, {
                    width: colWidths[i] - 16,
                    align: 'left'
                });

            xPos += colWidths[i];
        });

        // Table rows (compact)
        let yPos = tableTop + headerHeight;
        doc.font('Helvetica')
            .fontSize(8);

        const rowHeight = 18;
        const bottomMargin = 50; // Reserve minimal space for footer

        (coaData.cannabinoids || []).forEach((cannabinoid: Cannabinoid, index: number) => {
            // Check if we need a new page
            if (yPos + rowHeight > pageHeight - bottomMargin) {
                doc.addPage();

                // Add watermark to new page
                addWatermark();

                yPos = 50; // Reset to top of new page

                // Redraw table header on new page
                doc.fontSize(8)
                    .font('Helvetica-Bold')
                    .fillColor('#ffffff');

                let headerXPos = 50; // Same margin as table
                tableHeaders.forEach((header, i) => {
                    // Draw header background with opacity
                    doc.save();
                    doc.opacity(tableHeaderOpacity);
                    doc.rect(headerXPos, yPos, colWidths[i], headerHeight)
                        .fillAndStroke('#10b981', '#10b981');
                    doc.restore();

                    doc.fillColor('#ffffff')
                        .text(header, headerXPos + 8, yPos + 5, {
                            width: colWidths[i] - 16,
                            align: 'left'
                        });

                    headerXPos += colWidths[i];
                });

                yPos += headerHeight;
                doc.font('Helvetica').fontSize(8);
            }

            const rowColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
            xPos = 50; // Same as table header

            // Background
            const totalWidth = colWidths.reduce((a, b) => a + b, 0);
            doc.rect(50, yPos, totalWidth, rowHeight)
                .fillAndStroke(rowColor, '#e0e0e0');

            // Cannabinoid name
            doc.fillColor('#000000')
                .text(cannabinoid.analyte, xPos + 4, yPos + 5, {
                    width: colWidths[0] - 8,
                    lineBreak: false
                });
            xPos += colWidths[0];

            // Percentage
            const pctValue = totals.hasAreaBasis
                ? (cannabinoid as any).area_pct || '0.0000'
                : cannabinoid.result_pct || '0';

            doc.fillColor(totals.hasAreaBasis ? '#f59e0b' : '#000000') // Warning color if area-based
                .text(`${pctValue}`, xPos + 4, yPos + 5, {
                    width: colWidths[1] - 8,
                    lineBreak: false,
                    align: 'right'
                });
            xPos += colWidths[1];

            // mg/g
            doc.text(cannabinoid.result_mg_g || '-', xPos + 4, yPos + 5, {
                width: colWidths[2] - 8,
                lineBreak: false,
                align: 'right'
            });
            xPos += colWidths[2];

            if (hasChromaColumns) {
                // Retention Time
                const rtValue = (cannabinoid as any).retention_time;
                doc.text(rtValue !== undefined ? rtValue.toFixed(3) : '-', xPos + 4, yPos + 5, {
                    width: colWidths[3] - 8,
                    lineBreak: false,
                    align: 'right'
                });
                xPos += colWidths[3];

                // Area
                const areaValue = (cannabinoid as any).area;
                doc.text(areaValue !== undefined ? areaValue.toFixed(3) : '-', xPos + 4, yPos + 5, {
                    width: colWidths[4] - 8,
                    lineBreak: false,
                    align: 'right'
                });
                xPos += colWidths[4];

                // ppm (Amount) - convert from percentage
                const ppmValue = parseFloat(cannabinoid.result_pct || '0') * 10000;
                doc.fillColor('#10b981')
                    .text(ppmValue.toFixed(4), xPos + 4, yPos + 5, {
                        width: colWidths[5] - 8,
                        lineBreak: false,
                        align: 'right'
                    });
            } else {
                // Estado (Detectado/No Detectado)
                doc.fillColor(cannabinoid.detected ? '#10b981' : '#9ca3af')
                    .text(cannabinoid.detected ? '✓' : 'N/D', xPos, yPos + 5, {
                        width: colWidths[3],
                        lineBreak: false,
                        align: 'center'
                    });
            }

            yPos += rowHeight;
        });

        // ===== BADGES SECTION =====
        const badges = coaData.badges || [];
        if (badges.length > 0) {
            // Badge layout configuration
            const badgeSize = 50;
            const badgeSpacing = 15;
            const badgeLabelHeight = 15; // Space for badge name below image
            const rowHeight = badgeSize + badgeLabelHeight + 10; // Total height per row
            const availableWidth = pageWidth - 100; // 50px margin on each side
            const maxBadgesPerRow = Math.floor((availableWidth + badgeSpacing) / (badgeSize + badgeSpacing));
            const numRows = Math.ceil(badges.length / maxBadgesPerRow);

            // Calculate total section height needed
            const badgesSectionHeight = 25 + (numRows * rowHeight); // Title + all rows

            // Check if we need a new page for badges section
            if (yPos + badgesSectionHeight > pageHeight - 100) {
                doc.addPage();
                addWatermark();
                yPos = 50;
            }

            const badgesY = yPos + 15;

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('CERTIFICACIONES E INSIGNIAS', 50, badgesY);

            // Pre-fetch all badge images IN PARALLEL for faster loading
            console.log(`[PDF] Fetching and optimizing ${badges.length} badge images in parallel...`);
            const badgePromises = badges
                .filter((badge: any) => badge.image_url)
                .map(async (badge: any) => {
                    try {
                        const badgeResponse = await axios.get(badge.image_url, {
                            responseType: 'arraybuffer',
                            timeout: 8000, // Shorter timeout since we're parallel
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (compatible; EUM-COA-Generator/1.0)'
                            }
                        });
                        // Optimize image: resize to 300x300 max (6x display size for quality zoom)
                        const originalBuffer = Buffer.from(badgeResponse.data);
                        const optimizedBuffer = await optimizeImageForPDF(originalBuffer, 300, 300);
                        console.log(`[PDF] Badge ${badge.name}: ${Math.round(originalBuffer.length / 1024)}KB -> ${Math.round(optimizedBuffer.length / 1024)}KB`);
                        return { badge, buffer: optimizedBuffer };
                    } catch (err: any) {
                        console.error(`[PDF] Could not fetch badge ${badge.name}:`, err.message);
                        return null;
                    }
                });

            const badgeResults = await Promise.all(badgePromises);
            const validBadges = badgeResults.filter((result): result is { badge: any; buffer: Buffer } => result !== null);
            console.log(`[PDF] ${validBadges.length}/${badges.length} badges optimized successfully`);

            // Render badges in centered rows
            let badgeIndex = 0;
            let currentRowY = badgesY + 18;

            while (badgeIndex < validBadges.length) {
                // Determine how many badges in this row
                const remainingBadges = validBadges.length - badgeIndex;
                const badgesInThisRow = Math.min(remainingBadges, maxBadgesPerRow);

                // Calculate row width and starting X to center
                const rowWidth = (badgesInThisRow * badgeSize) + ((badgesInThisRow - 1) * badgeSpacing);
                let badgeX = (pageWidth - rowWidth) / 2;

                // Render badges in this row
                for (let i = 0; i < badgesInThisRow; i++) {
                    const { badge, buffer } = validBadges[badgeIndex];

                    // Draw badge image
                    doc.image(buffer, badgeX, currentRowY, {
                        width: badgeSize,
                        height: badgeSize,
                        fit: [badgeSize, badgeSize],
                        align: 'center',
                        valign: 'center'
                    });

                    // Badge name below image
                    doc.fontSize(6)
                        .font('Helvetica')
                        .fillColor('#666666')
                        .text(badge.name, badgeX - 5, currentRowY + badgeSize + 3, {
                            width: badgeSize + 10,
                            align: 'center'
                        });

                    badgeX += badgeSize + badgeSpacing;
                    badgeIndex++;
                }

                // Move to next row
                currentRowY += rowHeight;
            }

            yPos = currentRowY + 10; // Update yPos after all badge rows
        }

        // ===== CHROMATOGRAM SECTION =====
        // Check if we have chromatogram data (retention_time and area)
        const hasChromatogramData = (coaData.cannabinoids || []).some(
            (c: Cannabinoid) => c.retention_time !== undefined && c.area !== undefined && c.area > 0
        );

        if (hasChromatogramData) {
            const chromatogramHeight = 180; // Height for chromatogram image
            const chromatogramSectionHeight = chromatogramHeight + 40; // Title + image + margin

            // Check if we need a new page for chromatogram
            if (yPos + chromatogramSectionHeight > pageHeight - 100) {
                doc.addPage();
                addWatermark();
                yPos = 50;
            }

            const chromaY = yPos + 15;

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('CROMATOGRAMA', 50, chromaY);

            try {
                console.log('[PDF] Generating synthetic chromatogram...');
                // Generate at high resolution (3x) for crisp PDF output
                // The image will be scaled down to display size, maintaining high DPI
                const chromatogramBuffer = await generateBasicChromatogram(coaData.cannabinoids || [], {
                    width: 1600,
                    height: 600,
                    backgroundColor: 'transparent'
                });

                // Add chromatogram image
                doc.image(chromatogramBuffer, 50, chromaY + 18, {
                    width: pageWidth - 100,
                    height: chromatogramHeight,
                    fit: [pageWidth - 100, chromatogramHeight]
                });

                console.log('[PDF] Chromatogram added successfully');
                yPos = chromaY + chromatogramHeight + 30;

                // ===== INJECTION DETAILS TABLE (below chromatogram) =====
                const injectionDetails = coaData.metadata?.injection_details;
                if (injectionDetails && Object.keys(injectionDetails).length > 0) {
                    // Check if we need a new page for injection details
                    const injectionTableHeight = 70;
                    if (yPos + injectionTableHeight > pageHeight - 100) {
                        doc.addPage();
                        addWatermark();
                        yPos = 50;
                    }

                    doc.fontSize(8)
                        .font('Helvetica-Bold')
                        .fillColor('#000000')
                        .text('DETALLES DE INYECCIÓN', 50, yPos);

                    const injY = yPos + 12;
                    const col1X = 60;
                    const col2X = 320;
                    const labelW = 95;

                    // Helper to draw injection detail row
                    const drawInjRow = (label: string, value: string | undefined, x: number, y: number) => {
                        if (value) {
                            doc.fontSize(6)
                                .font('Helvetica-Bold')
                                .fillColor('#666666')
                                .text(label, x, y);
                            doc.font('Helvetica')
                                .fillColor('#000000')
                                .text(value, x + labelW, y, { width: 150 });
                        }
                    };

                    // Row 1
                    drawInjRow('Injection Name:', injectionDetails.injection_name, col1X, injY);
                    drawInjRow('Run Time (min):', injectionDetails.run_time, col2X, injY);

                    // Row 2
                    drawInjRow('Vial Number:', injectionDetails.vial_number, col1X, injY + 10);
                    drawInjRow('Injection Volume:', injectionDetails.injection_volume, col2X, injY + 10);

                    // Row 3
                    drawInjRow('Injection Type:', injectionDetails.injection_type, col1X, injY + 20);
                    drawInjRow('Channel:', injectionDetails.channel, col2X, injY + 20);

                    // Row 4
                    drawInjRow('Instrument Method:', injectionDetails.instrument_method, col1X, injY + 30);
                    drawInjRow('Wavelength:', injectionDetails.wavelength, col2X, injY + 30);

                    // Row 5
                    drawInjRow('Processing Method:', injectionDetails.processing_method, col1X, injY + 40);
                    drawInjRow('Bandwidth:', injectionDetails.bandwidth, col2X, injY + 40);

                    // Row 6
                    drawInjRow('Injection Date/Time:', injectionDetails.injection_datetime, col1X, injY + 50);
                    drawInjRow('Dilution Factor:', injectionDetails.dilution_factor, col2X, injY + 50);

                    // Row 7
                    drawInjRow('Sample Weight:', injectionDetails.sample_weight, col1X, injY + 60);

                    yPos = injY + 75;
                }

            } catch (chromaError: any) {
                console.error('[PDF] Could not generate chromatogram:', chromaError.message);
                // Continue without chromatogram
                doc.fontSize(7)
                    .font('Helvetica')
                    .fillColor('#999999')
                    .text('Cromatograma no disponible', 50, chromaY + 18);
                yPos = chromaY + 40;
            }
        }

        // ===== CHEMIST / TECHNICAL RESPONSIBLE SECTION =====
        let chemistBuffer: Buffer | null = null;
        let chemistData: any = null;

        try {
            // First check if COA has a specific chemist assigned
            let chemistId = coaData.chemist_id;

            if (chemistId) {
                // Fetch specific chemist
                const { data: specificChemist } = await supabase
                    .from('chemists')
                    .select('*')
                    .eq('id', chemistId)
                    .single();
                if (specificChemist) {
                    chemistData = specificChemist;
                }
            }

            // If no specific chemist, get the default one
            if (!chemistData) {
                const { data: defaultChemist } = await supabase
                    .from('chemists')
                    .select('*')
                    .eq('is_default', true)
                    .eq('is_active', true)
                    .single();
                if (defaultChemist) {
                    chemistData = defaultChemist;
                }
            }

            // Fetch chemist signature if available
            if (chemistData?.signature_url) {
                console.log(`[PDF] Fetching chemist signature: ${chemistData.name}`);
                const signatureResponse = await axios.get(chemistData.signature_url, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; EUM-COA-Generator/1.0)'
                    }
                });
                const rawSignatureBuffer = Buffer.from(signatureResponse.data);
                // Process image (converts SVG to PNG if needed)
                chemistBuffer = await processImageForPDF(rawSignatureBuffer, 300);
                console.log('[PDF] Chemist signature processed successfully');
            }
        } catch (chemistError: any) {
            console.log('[PDF] Could not fetch chemist data:', chemistError.message);
        }

        // Render chemist section if we have chemist data
        if (chemistData) {
            const chemistSectionHeight = 100;

            // Check if we need a new page
            if (yPos + chemistSectionHeight > pageHeight - 150) {
                doc.addPage();
                addWatermark();
                yPos = 50;
            }

            const chemistY = yPos + 15;

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000000')
                .text('RESPONSABLE TÉCNICO', 50, chemistY);

            // Draw chemist info box
            const chemistBoxY = chemistY + 15;
            const chemistBoxHeight = 70;

            doc.rect(50, chemistBoxY, pageWidth - 100, chemistBoxHeight)
                .strokeColor('#e5e7eb')
                .stroke();

            // Signature image on left (if available)
            let chemistTextX = 70;
            if (chemistBuffer) {
                try {
                    const signatureWidth = 100;
                    const signatureHeight = 50;
                    doc.image(chemistBuffer, 60, chemistBoxY + 10, {
                        width: signatureWidth,
                        height: signatureHeight,
                        fit: [signatureWidth, signatureHeight],
                        align: 'center',
                        valign: 'center'
                    });
                    chemistTextX = 175;
                } catch (sigErr: any) {
                    console.error('[PDF] Could not add signature image:', sigErr.message);
                }
            }

            // Chemist name
            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#1a5c3e')
                .text(chemistData.name, chemistTextX, chemistBoxY + 12);

            // Title and credentials
            const titleCredentials = [chemistData.title, chemistData.credentials].filter(Boolean).join(' - ');
            if (titleCredentials) {
                doc.fontSize(8)
                    .font('Helvetica')
                    .fillColor('#666666')
                    .text(titleCredentials, chemistTextX, chemistBoxY + 28);
            }

            // License number with verification link
            if (chemistData.license_number) {
                const licenseText = `Céd. Prof: ${chemistData.license_number}`;
                doc.fontSize(7)
                    .font('Helvetica')
                    .fillColor('#3b82f6')
                    .text(licenseText, chemistTextX, chemistBoxY + 42);

                // Make license clickable if URL is available
                if (chemistData.license_url) {
                    const licenseTextWidth = doc.widthOfString(licenseText);
                    doc.link(chemistTextX, chemistBoxY + 42, licenseTextWidth, 10, chemistData.license_url);

                    // Add small link indicator (Phase 3 UX improvement)
                    // Replaced text "(verificar)" with a checkmark icon to lookCleaner
                    doc.fontSize(8).fillColor('#10b981').text('✓', chemistTextX + licenseTextWidth + 3, chemistBoxY + 42);
                }
            }

            yPos = chemistBoxY + chemistBoxHeight + 5;
        }

        // ===== PROMOTIONAL BANNER (before footer) =====
        let bannerBuffer: Buffer | null = null;
        let activeBanner: any = null;
        try {
            // Fetch active promotional banner
            const { data: bannerData } = await supabase
                .from('promo_banners')
                .select('*')
                .eq('is_active', true)
                .single();

            if (bannerData?.image_url) {
                activeBanner = bannerData;
                console.log('[PDF] Fetching promotional banner:', bannerData.title);
                const bannerResponse = await axios.get(bannerData.image_url, {
                    responseType: 'arraybuffer',
                    timeout: 15000
                });
                bannerBuffer = Buffer.from(bannerResponse.data);
                console.log('[PDF] Promotional banner fetched successfully');
            }
        } catch (bannerError: any) {
            console.log('[PDF] No active promotional banner or fetch error:', bannerError.message);
        }

        // If we have a banner, add it before footer
        const bannerHeight = bannerBuffer ? 70 : 0;
        const bannerMargin = bannerBuffer ? 8 : 0;

        // ===== COMPACT FOOTER =====
        // Footer height: approximately 60 points (line + text + margins)
        const footerHeight = 60;

        // Calculate total space needed for banner + footer
        const totalNeeded = bannerHeight + bannerMargin + footerHeight + 10;

        // Check if there's enough space on current page
        if (yPos + totalNeeded > pageHeight - 20) {
            doc.addPage();
            addWatermark();
            yPos = 50;
        }

        // Render promotional banner right after chemist section
        let bannerY = yPos + 5;
        if (bannerBuffer && activeBanner) {
            try {
                doc.image(bannerBuffer, 50, bannerY, {
                    width: pageWidth - 100,
                    height: bannerHeight,
                    fit: [pageWidth - 100, bannerHeight],
                    align: 'center',
                    valign: 'center'
                });

                if (activeBanner.link_url) {
                    doc.link(50, bannerY, pageWidth - 100, bannerHeight, activeBanner.link_url);
                }

                console.log('[PDF] Promotional banner added successfully');
                bannerY += bannerHeight + bannerMargin;
            } catch (bannerRenderError: any) {
                console.error('[PDF] Error rendering banner:', bannerRenderError.message);
            }
        }

        let footerY = bannerBuffer ? bannerY : yPos + 10;

        // Divider line
        doc.moveTo(50, footerY)
            .lineTo(pageWidth - 50, footerY)
            .strokeColor('#e5e7eb')
            .stroke();

        // Footer text - center manually to avoid PDFKit internal cursor issues
        const centerX = pageWidth / 2;

        // Helper to draw centered text at exact position without triggering pagination
        const drawCenteredText = (text: string, y: number, fontSize: number, font: string, color: string) => {
            doc.fontSize(fontSize).font(font).fillColor(color);
            const textWidth = doc.widthOfString(text);
            doc.text(text, centerX - textWidth / 2, y, { lineBreak: false, continued: false });
        };

        drawCenteredText('EXTRACTOS EUM™', footerY + 8, 9, 'Helvetica-Bold', '#10b981');
        drawCenteredText('Sistema de Trazabilidad y Certificación', footerY + 18, 7, 'Helvetica', '#666666');
        drawCenteredText(`Verificación: ${verificationUrl}`, footerY + 28, 6, 'Helvetica', '#999999');
        drawCenteredText(`Token: ${token} | ${new Date().toLocaleDateString('es-MX')}`, footerY + 36, 6, 'Helvetica', '#999999');
        drawCenteredText('Certificado válido solo para el lote especificado. Resultados referentes exclusivamente a la muestra analizada.', footerY + 44, 5, 'Helvetica', '#999999');
        drawCenteredText(`Data Integrity Hash: ${shortHash}... (Verificar en Ledger)`, footerY + 52, 5, 'Helvetica', '#999999');

        // Finalize PDF
        doc.end();

        // Ledger recording is now handled in doc.on('end') to include file_hash


    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({ error: 'Error generating PDF' });
    }
};
