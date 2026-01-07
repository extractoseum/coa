import { Request, Response } from 'express';
import { COA } from '../types/coa';
import { supabase } from '../config/supabase';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateBasicChromatogram } from '../services/chromatogramGenerator';
import { COAExtractor } from '../services/coaExtractor';
import axios from 'axios';
import { syncClientCOAsToShopify } from '../services/shopifyService';
import { notifyCoaAssigned, notifyFraudDetected } from '../services/onesignalService';
import { logFraud, logSystemEvent } from '../services/loggerService';
import { ledgerService } from '../services/ledgerService';

// Helper to generate a short random token
const generateToken = () => crypto.randomBytes(4).toString('hex'); // 8 chars

// Helper to parse Spanish date format like "29/sep./25 11:14" or "14/dic./24 10:30"
const parseSpanishDate = (dateStr: string | undefined): Date | null => {
    if (!dateStr || dateStr === 'N/A') return null;

    // Map Spanish month abbreviations to month numbers
    const spanishMonths: { [key: string]: number } = {
        'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
    };

    // Try Spanish format: "29/sep./25 11:14" or "29/sep./2025 11:14"
    const spanishMatch = dateStr.match(/(\d{1,2})\/([a-z]{3})\.?\/(\d{2,4})\s*(\d{1,2}):(\d{2})?/i);
    if (spanishMatch) {
        const day = parseInt(spanishMatch[1]);
        const monthStr = spanishMatch[2].toLowerCase();
        let year = parseInt(spanishMatch[3]);
        const hour = parseInt(spanishMatch[4]) || 0;
        const minute = parseInt(spanishMatch[5]) || 0;

        // Convert 2-digit year to 4-digit
        if (year < 100) {
            year = year > 50 ? 1900 + year : 2000 + year;
        }

        const month = spanishMonths[monthStr];
        if (month !== undefined) {
            return new Date(year, month, day, hour, minute);
        }
    }

    // Try standard Date parsing as fallback
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    } catch (e) {
        // Ignore parsing errors
    }

    return null;
};

export const saveCOA = async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];
        const { extractedData } = req.body; // JSON string

        console.log("Saving COA with files:", files?.length);

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const data = JSON.parse(extractedData);

        // 1. Upload File(s) to Supabase Storage
        // For now, if multiple files, we'll zip them or just store the first one?
        // User requirement: "Multi-Files" are for averaging. The saved file should probably be the FIRST one (or merged PDF?).
        // Simplest MVP: Save the first file as the "Original" reference.
        // OR: Loop and upload all? Scheme supports 'pdf_url_original' (singular).
        // 1. Upload ALL Files to Supabase Storage
        const publicToken = generateToken(); // Generate token early for file naming
        const uploadedUrls: string[] = [];
        for (const file of files) {
            const fileExt = file.originalname.split('.').pop();
            const fileName = `${publicToken}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `uploads/${fileName}`;

            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('coas')
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: publicURL } = supabase.storage.from('coas').getPublicUrl(filePath);
            uploadedUrls.push(publicURL.publicUrl);
        }

        const mainPdfUrl = uploadedUrls[0];

        // Determine analysis date: use extracted date (handles Spanish format), or fallback to current date
        let analysisDate: Date | null = null;
        if (data.analysis_date && data.analysis_date !== 'N/A') {
            // Try parseSpanishDate first (handles "29/sep./25 11:14" format)
            analysisDate = parseSpanishDate(data.analysis_date);
            if (!analysisDate) {
                // Fallback to current date if parsing failed
                analysisDate = new Date();
            }
        } else {
            // No date extracted, use current date (document creation date)
            analysisDate = new Date();
        }

        console.log('[Save COA] Date parsing:', { extracted: data.analysis_date, parsed: analysisDate?.toISOString() });

        // 3. Save to DB - merge all extracted metadata with file info
        const extractedMetadata = data.metadata || {};
        const mergedMetadata = {
            ...extractedMetadata,
            file_urls: uploadedUrls,
            original_filenames: files.map(f => f.originalname)
        };

        console.log('[Save COA] Extracted metadata keys:', Object.keys(extractedMetadata));
        console.log('[Save COA] Injection details present:', !!extractedMetadata.injection_details);
        console.log('[Save COA] Peaks present:', !!extractedMetadata.peaks);

        const { data: dbData, error: dbError } = await supabase
            .from('coas')
            .insert({
                public_token: publicToken,
                lab_name: data.lab_name,
                batch_id: data.batch_id || 'UNKNOWN',
                analysis_date: analysisDate,
                cannabinoids: data.cannabinoids, // JSONB
                compliance_status: data.compliance_status || 'pending',
                thc_compliance_flag: data.thc_compliance_flag,
                pdf_url_original: mainPdfUrl,
                metadata: mergedMetadata
            })
            .select()
            .single();

        if (dbError) {
            console.error('DB Insert Error:', dbError);
            return res.status(500).json({ error: 'Database Insertion Failed' });
        }

        // 4. Record in Integrity Ledger (Phase 2)
        await ledgerService.recordEvent({
            eventType: 'COA_CREATED',
            entityId: dbData.id,
            entityType: 'coas',
            payload: {
                public_token: publicToken,
                batch_id: data.batch_id,
                lab_name: data.lab_name,
                payload_hash: crypto.createHash('sha256').update(JSON.stringify(data.cannabinoids)).digest('hex')
            },
            createdBy: (req as any).clientId
        });

        res.status(201).json({
            success: true,
            token: publicToken,
            data: dbData
        });

    } catch (error) {
        console.error('Save COA Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getCOAByToken = async (req: Request, res: Response) => {
    const { token } = req.params;

    try {
        // MOCK DATA FOR DEMO
        if (token === 'demo') {
            return res.json({
                success: true,
                data: {
                    public_token: 'demo',
                    product_sku: 'EUM-TEST-001',
                    lab_name: 'Confident Cannabis',
                    analysis_date: '2023-12-01',
                    cannabinoids: [
                        { analyte: 'CBD', result_pct: '84.5', detected: true },
                        { analyte: 'THC', result_pct: '0.21', detected: true, result_mg_g: '2.1' },
                        { analyte: 'CBG', result_pct: '1.2', detected: true }
                    ],
                    compliance_status: 'pass',
                    thc_compliance_flag: true
                }
            });
        }

        // Use the supabase client to fetch the COA (without badges for now)
        const { data, error } = await supabase
            .from('coas')
            .select('*')
            .eq('public_token', token)
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return res.status(404).json({ error: 'COA not found' });
        }

        // Check tag-based visibility restrictions
        if (data.visibility_mode === 'tag_restricted' && data.required_tags && data.required_tags.length > 0) {
            // Try to get the viewer's email from auth token (if logged in)
            let viewerEmail: string | null = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const jwtToken = authHeader.split(' ')[1];
                    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET || 'dev_secret_key_12345') as any;
                    if (decoded.email) {
                        viewerEmail = decoded.email;
                    } else if (decoded.clientId) {
                        // Get email from clients table
                        const { data: clientData } = await supabase
                            .from('clients')
                            .select('email')
                            .eq('id', decoded.clientId)
                            .single();
                        if (clientData?.email) {
                            viewerEmail = clientData.email;
                        }
                    }
                } catch (e) {
                    // Invalid token or not logged in, continue as anonymous
                }
            }

            // Check if this is the COA owner (owner always has access)
            const isOwner = viewerEmail && data.owner_email && viewerEmail.toLowerCase() === data.owner_email.toLowerCase();

            if (!isOwner) {
                // Get viewer's Shopify tags
                let viewerTags: string[] = [];
                if (viewerEmail) {
                    const { data: customer } = await supabase
                        .from('shopify_customers_backup')
                        .select('tags')
                        .eq('email', viewerEmail.toLowerCase())
                        .single();

                    if (customer?.tags) {
                        viewerTags = customer.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
                    }
                }

                // Check if viewer has any of the required tags
                const hasAccess = data.required_tags.some((requiredTag: string) =>
                    viewerTags.some(viewerTag => viewerTag.toLowerCase() === requiredTag.toLowerCase())
                );

                if (!hasAccess) {
                    // Log the access attempt
                    console.log(`[Tag Restricted] Access denied to COA ${token} for ${viewerEmail || 'anonymous'}. Required: ${data.required_tags.join(', ')}, Has: ${viewerTags.join(', ')}`);

                    // Return restricted access response with limited COA info
                    return res.json({
                        success: true,
                        restricted: true,
                        restriction_type: 'tag_restricted',
                        required_tags: data.required_tags,
                        data: {
                            public_token: data.public_token,
                            product_image_url: data.product_image_url,
                            custom_name: data.custom_name,
                            batch_id: data.batch_id,
                            compliance_status: data.compliance_status,
                            // Don't include sensitive data like cannabinoids, PDF URLs, etc.
                        }
                    });
                }
            }
        }

        // Check if COA is hidden (only owner can see)
        if (data.visibility_mode === 'hidden') {
            let viewerEmail: string | null = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const jwtToken = authHeader.split(' ')[1];
                    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET || 'dev_secret_key_12345') as any;
                    if (decoded.email) {
                        viewerEmail = decoded.email;
                    } else if (decoded.clientId) {
                        const { data: clientData } = await supabase
                            .from('clients')
                            .select('email')
                            .eq('id', decoded.clientId)
                            .single();
                        if (clientData?.email) {
                            viewerEmail = clientData.email;
                        }
                    }
                } catch (e) {
                    // Invalid token
                }
            }

            const isOwner = viewerEmail && data.owner_email && viewerEmail.toLowerCase() === data.owner_email.toLowerCase();
            if (!isOwner) {
                return res.json({
                    success: true,
                    restricted: true,
                    restriction_type: 'hidden',
                    data: {
                        public_token: data.public_token,
                        product_image_url: data.product_image_url,
                        custom_name: data.custom_name,
                    }
                });
            }
        }

        // Try to fetch badges if the tables exist
        // If they don't exist, just use an empty array
        let badges: any[] = [];
        try {
            const { data: badgesData } = await supabase
                .from('coa_badges')
                .select('badge:badges(*)')
                .eq('coa_id', data.id);

            if (badgesData) {
                badges = badgesData.map((cb: any) => cb.badge).filter(Boolean);
            }
        } catch (badgesError) {
            // Badges tables don't exist yet, use empty array
        }

        // Transform badges structure
        // Generate signed QR URL for the frontend
        const verificationUrl = process.env.VERIFICATION_URL || 'https://coa.extractoseum.com/verify';
        const jwtPayload = {
            t: data.public_token,
            b: data.batch_id,
            iat: Math.floor(Date.now() / 1000)
        };
        const signedToken = jwt.sign(jwtPayload, process.env.JWT_SECRET || 'dev_secret_key_12345', { expiresIn: '1y' });
        const qr_code_secure_url = `${verificationUrl}?src=qr&sig=${signedToken}`;

        const transformedData = {
            ...data,
            badges,
            qr_code_secure_url // Add this field for the frontend
        };

        res.json({
            success: true,
            data: transformedData
        });

    } catch (err) {
        console.error('Get COA error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get chromatogram image for a COA
export const getChromatogram = async (req: Request, res: Response) => {
    // TEMPORARY: Disable due to chartjs dependency issue causing boot loop
    // return res.status(503).json({ error: 'Chromatogram generation temporarily disabled' });

    const { token } = req.params;

    try {
        // Fetch COA data
        const { data, error } = await supabase
            .from('coas')
            .select('cannabinoids')
            .eq('public_token', token)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'COA not found' });
        }

        const cannabinoids = data.cannabinoids || [];

        // Check if we have chromatogram data
        const hasChromatogramData = cannabinoids.some(
            (c: any) => c.retention_time !== undefined && c.area !== undefined && c.area > 0
        );

        if (!hasChromatogramData) {
            return res.status(404).json({ error: 'No chromatogram data available for this COA' });
        }

        // Generate chromatogram
        const chromatogramBuffer = await generateBasicChromatogram(cannabinoids, {
            width: 800,
            height: 300,
            backgroundColor: '#ffffff'
        });

        // Send as PNG image
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': chromatogramBuffer.length,
            'Cache-Control': 'public, max-age=3600'
        });
        res.send(chromatogramBuffer);

    } catch (err) {
        console.error('Get chromatogram error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const updateCOAMetadata = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { product_image_url, custom_name, product_sku, client } = req.body;

    try {
        // First, get the current COA to merge metadata
        const { data: existingCOA, error: fetchError } = await supabase
            .from('coas')
            .select('metadata')
            .eq('public_token', token)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // Merge existing metadata with new values
        const updatedMetadata = {
            ...(existingCOA.metadata || {}),
            ...(product_image_url && { product_image_url }),
            ...(client && { client })
        };

        // Update the COA
        const updateData: any = {
            metadata: updatedMetadata,
            updated_at: new Date().toISOString()
        };

        // Update custom_name if provided
        if (custom_name) {
            updateData.custom_name = custom_name;
        }

        // Update product_sku if provided
        if (product_sku) {
            updateData.product_sku = product_sku;
        }

        const { data, error } = await supabase
            .from('coas')
            .update(updateData)
            .eq('public_token', token)
            .select()
            .single();

        if (error) {
            console.error('Update error:', error);
            return res.status(500).json({ error: 'Failed to update COA' });
        }

        res.json({
            success: true,
            message: 'COA metadata updated successfully',
            data
        });

    } catch (err) {
        console.error('Update COA metadata error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Re-extract COA data from stored PDF files
export const reExtractCOA = async (req: Request, res: Response) => {
    // TEMPORARY: Disable due to dependency issue
    // return res.status(503).json({ error: 'Re-extraction temporarily disabled' });

    const { token } = req.params;

    try {
        // 1. Get COA
        const { data: coa, error: fetchError } = await supabase
            .from('coas')
            .select('*')
            .eq('public_token', token)
            .single();

        if (fetchError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        if (!coa.pdf_url_original) {
            return res.status(400).json({ error: 'No original PDF URL found for this COA' });
        }

        console.log(`[Re-Extract] Fetching PDF from: ${coa.pdf_url_original}`);

        // 2. Download PDF
        const pdfResponse = await axios.get(coa.pdf_url_original, {
            responseType: 'arraybuffer'
        });
        const pdfBuffer = Buffer.from(pdfResponse.data);

        // 3. Extract Data
        const extractor = new COAExtractor();
        const extractedData = await extractor.extractFromBuffer(pdfBuffer);

        console.log(`[Re-Extract] Success. Lab: ${extractedData.lab_name}`);

        // 4. Update DB (merge metadata)
        const updatedMetadata = {
            ...coa.metadata,
            ...extractedData.metadata,
            technicians: extractedData.technicians,
            terpenes: extractedData.terpenes,
            terpenes_status: extractedData.terpenes_status,
            sample_info: extractedData.sample_info,
            client_info: extractedData.client_info,
            re_extracted_at: new Date().toISOString()
        };

        const { data: updatedCOA, error: updateError } = await supabase
            .from('coas')
            .update({
                lab_name: extractedData.lab_name,
                batch_id: extractedData.batch_id || coa.batch_id,
                cannabinoids: extractedData.cannabinoids,
                compliance_status: extractedData.compliance_status || coa.compliance_status,
                thc_compliance_flag: extractedData.thc_compliance_flag,
                metadata: updatedMetadata
            })
            .eq('id', coa.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // Calculate stats for the frontend
        const stats = {
            cannabinoidsFound: extractedData.cannabinoids.length,
            hasChromatogramData: extractedData.cannabinoids.some((c: any) => c.retention_time !== undefined),
            pdfsProcessed: 1,
            totalTHC: extractedData.metadata?.calculatedTotalTHC || 0
        };

        res.json({
            success: true,
            message: 'COA re-extracted successfully',
            data: updatedCOA,
            stats
        });

    } catch (err: any) {
        console.error('[Re-Extract] Error:', err.message);
        res.status(500).json({ error: 'Re-extraction failed: ' + err.message });
    }
};

// Update COA visibility (for super admins)
export const updateCOAVisibility = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { visibility_mode, required_tags } = req.body;
    const client = (req as any).client;

    try {
        // Only super admins can use this endpoint
        if (client.role !== 'super_admin') {
            return res.status(403).json({ success: false, error: 'Solo super admins pueden usar este endpoint' });
        }

        // Get the COA
        const { data: coa, error: fetchError } = await supabase
            .from('coas')
            .select('id')
            .eq('public_token', token)
            .single();

        if (fetchError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Build update object - only use visibility_mode and required_tags
        const updateData: any = {};

        if (visibility_mode && ['public', 'hidden', 'tag_restricted'].includes(visibility_mode)) {
            updateData.visibility_mode = visibility_mode;
        } else {
            updateData.visibility_mode = 'public';
        }

        if (Array.isArray(required_tags)) {
            updateData.required_tags = required_tags;
        } else {
            updateData.required_tags = [];
        }

        // Update visibility
        const { error: updateError } = await supabase
            .from('coas')
            .update(updateData)
            .eq('id', coa.id);

        if (updateError) {
            console.error('[Update Visibility] Error:', updateError);
            return res.status(500).json({ success: false, error: 'Error al actualizar visibilidad: ' + updateError.message });
        }

        // Record in Integrity Ledger
        await ledgerService.recordEvent({
            eventType: 'COA_VISIBILITY_CHANGED',
            entityId: coa.id,
            entityType: 'coas',
            payload: {
                visibility_mode: updateData.visibility_mode,
                required_tags: updateData.required_tags
            },
            createdBy: (req as any).clientId
        });

        const messages: Record<string, string> = {
            public: 'COA marcado como público',
            hidden: 'COA marcado como oculto',
            tag_restricted: `COA restringido a tags: ${updateData.required_tags.join(', ')}`
        };

        res.json({
            success: true,
            visibility_mode: updateData.visibility_mode,
            required_tags: updateData.required_tags,
            message: messages[updateData.visibility_mode] || messages['public']
        });

    } catch (err: any) {
        console.error('[Update Visibility] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor: ' + err.message });
    }
};

// Fields that clients are allowed to edit
const CLIENT_EDITABLE_FIELDS = [
    'product_image_url',
    'short_description',
    'long_description',
    'custom_title',
    'purchase_links',
    'additional_docs',
    'is_hidden',  // Allow clients to hide COAs from public views (legacy)
    'visibility_mode',  // New visibility mode: public, hidden, tag_restricted
    'required_tags'  // Array of Shopify tags required when visibility_mode is tag_restricted
];

// Update COA with permission check (for authenticated users)
export const updateCOAWithPermissions = async (req: Request, res: Response) => {
    const { token } = req.params;
    const client = (req as any).client;

    try {
        // 1. Get the COA
        const { data: coa, error: fetchError } = await supabase
            .from('coas')
            .select('*')
            .eq('public_token', token)
            .single();

        if (fetchError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // 2. Check permissions
        const isSuperAdmin = client.role === 'super_admin';
        const isOwner = coa.client_id === client.id;

        if (!isSuperAdmin && !isOwner) {
            return res.status(403).json({ success: false, error: 'No tienes permiso para editar este COA' });
        }

        // 3. Filter fields based on role
        const updateData: any = {};
        const requestBody = req.body;

        if (isSuperAdmin) {
            // Super admin can update all fields
            Object.keys(requestBody).forEach(key => {
                if (requestBody[key] !== undefined) {
                    updateData[key] = requestBody[key];
                }
            });
        } else {
            // Client can only update allowed fields
            CLIENT_EDITABLE_FIELDS.forEach(field => {
                if (requestBody[field] !== undefined) {
                    updateData[field] = requestBody[field];
                }
            });

            // Check if client tried to update restricted fields
            const restrictedFields = Object.keys(requestBody).filter(
                key => !CLIENT_EDITABLE_FIELDS.includes(key)
            );
            if (restrictedFields.length > 0) {
                console.log(`[COA Update] Client ${client.id} tried to update restricted fields:`, restrictedFields);
            }
        }

        // 4. If nothing to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campos válidos para actualizar' });
        }

        // 5. Add updated_at timestamp
        updateData.updated_at = new Date().toISOString();

        // 6. Update the COA
        const { data: updatedCOA, error: updateError } = await supabase
            .from('coas')
            .update(updateData)
            .eq('public_token', token)
            .select()
            .single();

        if (updateError) {
            console.error('[COA Update] Database error:', updateError);
            return res.status(500).json({ success: false, error: 'Error al actualizar el COA' });
        }

        console.log(`[COA Update] ${isSuperAdmin ? 'Admin' : 'Client'} ${client.id} updated COA ${token}:`, Object.keys(updateData));

        res.json({
            success: true,
            message: 'COA actualizado correctamente',
            data: updatedCOA
        });

    } catch (err) {
        console.error('[COA Update] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get COAs owned by the authenticated client
export const getMyCOAs = async (req: Request, res: Response) => {
    const client = (req as any).client;

    try {
        const { data: coas, error } = await supabase
            .from('coas')
            .select('id, public_token, lab_report_number, product_sku, batch_id, custom_title, custom_name, compliance_status, product_image_url, created_at, updated_at')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            coas: coas || []
        });

    } catch (err) {
        console.error('[Get My COAs] Error:', err);
        res.status(500).json({ success: false, error: 'Error al obtener COAs' });
    }
};

// Assign a COA to a client (super_admin only)
export const assignCOAToClient = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { client_id } = req.body;
    const adminClient = (req as any).client;

    // Only super_admin can assign COAs
    if (adminClient.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Solo administradores pueden asignar COAs' });
    }

    try {
        // First, get the current COA to check if it has a previous owner
        const { data: existingCOA, error: fetchError } = await supabase
            .from('coas')
            .select('id, client_id')
            .eq('public_token', token)
            .single();

        if (fetchError) {
            console.error('[Assign COA] Error fetching COA:', fetchError);
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        const coaId = existingCOA?.id;
        const previousClientId = existingCOA?.client_id;

        // Get previous client info for Shopify sync (if exists and different from new)
        let previousClient = null;
        if (previousClientId && previousClientId !== client_id) {
            const { data: prevClient } = await supabase
                .from('clients')
                .select('id, shopify_customer_id')
                .eq('id', previousClientId)
                .single();
            previousClient = prevClient;
        }

        // Verify new client exists (include shopify_customer_id for sync)
        const { data: targetClient, error: clientError } = await supabase
            .from('clients')
            .select('id, name, email, shopify_customer_id')
            .eq('id', client_id)
            .single();

        if (clientError || !targetClient) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }

        // Update COA with new client_id
        const { data: updatedCOA, error: updateError } = await supabase
            .from('coas')
            .update({
                client_id: client_id,
                updated_at: new Date().toISOString()
            })
            .eq('public_token', token)
            .select()
            .single();

        if (updateError) {
            console.error('[Assign COA] Database error:', updateError);
            return res.status(500).json({ success: false, error: 'Error al asignar COA' });
        }

        console.log(`[Assign COA] Admin ${adminClient.id} assigned COA ${token} to client ${client_id} (${targetClient.email})`);

        // Sync COAs to Shopify metafields for NEW client
        let shopifySynced = false;
        /*
        if (targetClient.shopify_customer_id) {
            try {
                shopifySynced = await syncClientCOAsToShopify(
                    targetClient.shopify_customer_id,
                    client_id,
                    supabase
                );
                if (shopifySynced) {
                    console.log(`[Assign COA] Synced to Shopify for NEW customer ${targetClient.shopify_customer_id}`);
                }
            } catch (syncError) {
                console.error('[Assign COA] Shopify sync error (non-blocking):', syncError);
            }
        }
        */

        // IMPORTANT: Also handle PREVIOUS client - remove from folders and sync Shopify
        let previousSynced = false;
        let folderAssociationsRemoved = 0;
        if (previousClient) {
            // Remove COA from previous client's folders
            try {
                const { data: clientFolders } = await supabase
                    .from('folders')
                    .select('id')
                    .eq('client_id', previousClientId);

                if (clientFolders && clientFolders.length > 0) {
                    const folderIds = clientFolders.map(f => f.id);
                    const { data: deletedAssocs, error: deleteError } = await supabase
                        .from('folder_coas')
                        .delete()
                        .in('folder_id', folderIds)
                        .eq('coa_id', coaId)
                        .select();

                    if (!deleteError && deletedAssocs) {
                        folderAssociationsRemoved = deletedAssocs.length;
                        console.log(`[Assign COA] Removed ${deletedAssocs.length} folder associations for previous client ${previousClientId}`);
                    }
                }
            } catch (folderError) {
                console.error(`[Assign COA] Error removing folder associations:`, folderError);
            }

            // Sync to Shopify
            /*
            if (previousClient.shopify_customer_id) {
                try {
                    previousSynced = await syncClientCOAsToShopify(
                        previousClient.shopify_customer_id,
                        previousClientId,
                        supabase
                    );
                    if (previousSynced) {
                        console.log(`[Assign COA] Synced to Shopify for PREVIOUS customer ${previousClient.shopify_customer_id} (COA removed from their list)`);
                    }
                } catch (syncError) {
                    console.error('[Assign COA] Previous client Shopify sync error (non-blocking):', syncError);
                }
            }
            */
        }

        // Send push notification to the new client (non-blocking)
        const coaName = updatedCOA?.strain_name || updatedCOA?.custom_name || updatedCOA?.custom_title || 'Nuevo COA';
        notifyCoaAssigned(client_id, coaName, token).catch(err => {
            console.error('[Assign COA] Push notification error:', err);
        });

        // Log the assignment
        await logSystemEvent({
            category: 'client',
            eventType: 'coa_assigned_to_client',
            payload: { coa_token: token, client_id, admin_id: adminClient.id },
            clientId: client_id
        });

        res.json({
            success: true,
            message: `COA asignado a ${targetClient.name || targetClient.email}`,
            data: updatedCOA,
            shopify_synced: shopifySynced,
            previous_client_synced: previousSynced,
            folder_associations_removed: folderAssociationsRemoved
        });

    } catch (err) {
        console.error('[Assign COA] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get ALL COAs with filters (super_admin only)
export const getAllCOAs = async (req: Request, res: Response) => {
    try {
        const {
            client_id,
            start_date,
            end_date,
            compliance_status,
            search,
            unassigned,
            page = '1',
            limit = '50'
        } = req.query;

        const pageNum = parseInt(page as string, 10);
        const limitNum = Math.min(parseInt(limit as string, 10), 100); // Max 100 per page
        const offset = (pageNum - 1) * limitNum;

        let query = supabase
            .from('coas')
            .select(`
                id, public_token, lab_report_number, lab_name, analysis_date,
                product_sku, batch_id, custom_title, custom_name, compliance_status,
                thc_compliance_flag, product_image_url, client_id,
                created_at, updated_at,
                client:clients(id, name, email, company)
            `, { count: 'exact' });

        // Apply filters
        if (client_id) {
            query = query.eq('client_id', client_id);
        }

        if (unassigned === 'true') {
            query = query.is('client_id', null);
        }

        if (compliance_status) {
            query = query.eq('compliance_status', compliance_status);
        }

        if (start_date) {
            query = query.gte('analysis_date', start_date);
        }

        if (end_date) {
            query = query.lte('analysis_date', end_date);
        }

        if (search) {
            const searchTerm = `%${search}%`;
            query = query.or(`public_token.ilike.${searchTerm},product_sku.ilike.${searchTerm},batch_id.ilike.${searchTerm},custom_title.ilike.${searchTerm},custom_name.ilike.${searchTerm}`);
        }

        // Pagination
        query = query
            .range(offset, offset + limitNum - 1)
            .order('created_at', { ascending: false });

        const { data, count, error } = await query;

        if (error) {
            console.error('[Get All COAs] Database error:', error);
            return res.status(500).json({ success: false, error: 'Error al obtener COAs' });
        }

        res.json({
            success: true,
            coas: data || [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limitNum)
            }
        });

    } catch (err) {
        console.error('[Get All COAs] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Bulk assign COAs to a client (super_admin only)
export const bulkAssignCOAs = async (req: Request, res: Response) => {
    const { coa_ids, client_id } = req.body;
    const adminClient = (req as any).client;

    if (!coa_ids || !Array.isArray(coa_ids) || coa_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'Se requiere un array de IDs de COAs' });
    }

    try {
        // FIRST: Get current owners of the COAs being modified (for Shopify sync)
        const { data: currentCOAs, error: fetchCoasError } = await supabase
            .from('coas')
            .select('id, client_id')
            .in('id', coa_ids);

        if (fetchCoasError) {
            console.error('[Bulk Assign COAs] Error fetching current COAs:', fetchCoasError);
        }

        // Collect unique previous client IDs (excluding null and the new client_id)
        const previousClientIds = new Set<string>();
        if (currentCOAs) {
            for (const coa of currentCOAs) {
                if (coa.client_id && coa.client_id !== client_id) {
                    previousClientIds.add(coa.client_id);
                }
            }
        }

        // Verify client exists (if assigning, not unassigning)
        let targetClient: { id: string; name: string; email: string; shopify_customer_id?: string } | null = null;
        if (client_id) {
            const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('id, name, email, shopify_customer_id')
                .eq('id', client_id)
                .single();

            if (clientError || !clientData) {
                return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
            }
            targetClient = clientData;
        }

        // Update all COAs with the client_id
        const { data: updatedCOAs, error: updateError } = await supabase
            .from('coas')
            .update({
                client_id: client_id || null,
                updated_at: new Date().toISOString()
            })
            .in('id', coa_ids)
            .select('id, public_token, custom_name, custom_title');

        if (updateError) {
            console.error('[Bulk Assign COAs] Database error:', updateError);
            return res.status(500).json({ success: false, error: 'Error al asignar COAs' });
        }

        const updatedCount = updatedCOAs?.length || 0;
        const message = client_id
            ? `${updatedCount} COAs asignados a ${targetClient?.name || targetClient?.email}`
            : `${updatedCount} COAs desasignados`;

        console.log(`[Bulk Assign COAs] Admin ${adminClient.id}: ${message}`);

        // Sync COAs to Shopify metafields if NEW client has shopify_customer_id
        let shopifySynced = false;
        /*
        if (targetClient?.shopify_customer_id) {
            try {
                shopifySynced = await syncClientCOAsToShopify(
                    targetClient.shopify_customer_id,
                    client_id,
                    supabase
                );
                if (shopifySynced) {
                    console.log(`[Bulk Assign COAs] Synced to Shopify for NEW customer ${targetClient.shopify_customer_id}`);
                }
            } catch (syncError) {
                console.error('[Bulk Assign COAs] Shopify sync error (non-blocking):', syncError);
            }
        }
        */

        // Send push notification to the new client for each COA (non-blocking)
        if (targetClient && updatedCOAs && updatedCOAs.length > 0) {
            // Send one notification per COA assigned
            for (const coa of updatedCOAs) {
                const coaName = (coa as any).custom_name || (coa as any).custom_title || 'Nuevo COA';
                notifyCoaAssigned(client_id, coaName, coa.public_token).catch(err => {
                    console.error('[Bulk Assign COAs] Push notification error:', err);
                });
            }
            console.log(`[Bulk Assign COAs] Sent ${updatedCOAs.length} push notifications to ${targetClient.name || targetClient.email}`);
        }

        // IMPORTANT: Sync PREVIOUS clients to remove COAs from their Shopify metafields
        let previousClientsSynced = 0;
        let folderAssociationsRemoved = 0;
        if (previousClientIds.size > 0) {
            // Get Shopify customer IDs for previous clients
            const { data: previousClients } = await supabase
                .from('clients')
                .select('id, shopify_customer_id')
                .in('id', Array.from(previousClientIds));

            if (previousClients) {
                for (const prevClient of previousClients) {
                    // Remove COAs from previous client's folders
                    try {
                        // Get all folders belonging to the previous client
                        const { data: clientFolders } = await supabase
                            .from('folders')
                            .select('id')
                            .eq('client_id', prevClient.id);

                        if (clientFolders && clientFolders.length > 0) {
                            const folderIds = clientFolders.map(f => f.id);
                            // Delete folder_coas associations for these COAs in this client's folders
                            const { data: deletedAssocs, error: deleteError } = await supabase
                                .from('folder_coas')
                                .delete()
                                .in('folder_id', folderIds)
                                .in('coa_id', coa_ids)
                                .select();

                            if (!deleteError && deletedAssocs) {
                                folderAssociationsRemoved += deletedAssocs.length;
                                console.log(`[Bulk Assign COAs] Removed ${deletedAssocs.length} folder associations for client ${prevClient.id}`);
                            }
                        }
                    } catch (folderError) {
                        console.error(`[Bulk Assign COAs] Error removing folder associations for client ${prevClient.id}:`, folderError);
                    }

                    // Sync to Shopify
                    /*
                    if (prevClient.shopify_customer_id) {
                        try {
                            const synced = await syncClientCOAsToShopify(
                                prevClient.shopify_customer_id,
                                prevClient.id,
                                supabase
                            );
                            if (synced) {
                                previousClientsSynced++;
                                console.log(`[Bulk Assign COAs] Synced to Shopify for PREVIOUS customer ${prevClient.shopify_customer_id} (COAs removed)`);
                            }
                        } catch (syncError) {
                            console.error(`[Bulk Assign COAs] Previous client ${prevClient.id} Shopify sync error:`, syncError);
                        }
                    }
                    */
                }
            }
        }

        res.json({
            success: true,
            message,
            updated_count: updatedCount,
            coas: updatedCOAs,
            shopify_synced: shopifySynced,
            previous_clients_synced: previousClientsSynced,
            folder_associations_removed: folderAssociationsRemoved
        });

    } catch (err) {
        console.error('[Bulk Assign COAs] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get COA statistics for admin dashboard
export const getCOAStats = async (req: Request, res: Response) => {
    try {
        // Get total count
        const { count: totalCount } = await supabase
            .from('coas')
            .select('*', { count: 'exact', head: true });

        // Get unassigned count
        const { count: unassignedCount } = await supabase
            .from('coas')
            .select('*', { count: 'exact', head: true })
            .is('client_id', null);

        // Get compliance status counts
        const { data: complianceData } = await supabase
            .from('coas')
            .select('compliance_status');

        const complianceCounts = {
            pass: 0,
            fail: 0,
            pending: 0
        };

        if (complianceData) {
            complianceData.forEach((coa: any) => {
                const status = coa.compliance_status || 'pending';
                if (status in complianceCounts) {
                    complianceCounts[status as keyof typeof complianceCounts]++;
                }
            });
        }

        res.json({
            success: true,
            stats: {
                total: totalCount || 0,
                unassigned: unassignedCount || 0,
                assigned: (totalCount || 0) - (unassignedCount || 0),
                compliance: complianceCounts
            }
        });

    } catch (err) {
        console.error('[Get COA Stats] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get COAs for a customer by Shopify ID (public endpoint for embed/widget)
export const getCOAsByShopifyCustomer = async (req: Request, res: Response) => {
    const { shopify_customer_id } = req.params;
    const COA_VIEWER_BASE_URL = process.env.COA_VIEWER_URL || 'https://coa.extractoseum.com';

    if (!shopify_customer_id) {
        return res.status(400).json({ success: false, error: 'ID de cliente de Shopify requerido' });
    }

    try {
        // Find client by shopify_customer_id
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, email')
            .eq('shopify_customer_id', shopify_customer_id)
            .single();

        if (clientError || !client) {
            return res.json({
                success: true,
                coas: [],
                count: 0,
                message: 'No se encontró cliente con ese ID de Shopify'
            });
        }

        // Get COAs for this client
        const { data: coas, error: coaError } = await supabase
            .from('coas')
            .select(`
                id,
                public_token,
                custom_title,
                product_sku,
                batch_id,
                compliance_status,
                product_image_url,
                analysis_date,
                created_at
            `)
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });

        if (coaError) {
            console.error('[Get COAs by Shopify Customer] Error:', coaError);
            return res.status(500).json({ success: false, error: 'Error al obtener COAs' });
        }

        // Format COAs for embed with full URLs
        const formattedCOAs = (coas || []).map(coa => ({
            token: coa.public_token,
            title: coa.custom_title || coa.product_sku || coa.public_token,
            sku: coa.product_sku,
            batch: coa.batch_id,
            status: coa.compliance_status || 'pending',
            image: coa.product_image_url,
            date: coa.analysis_date,
            url: `${COA_VIEWER_BASE_URL}/coa/${coa.public_token}`
        }));

        res.json({
            success: true,
            customer: {
                name: client.name,
                email: client.email
            },
            coas: formattedCOAs,
            count: formattedCOAs.length,
            dashboard_url: `${COA_VIEWER_BASE_URL}/dashboard`
        });

    } catch (err) {
        console.error('[Get COAs by Shopify Customer] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Get COA Preview (limited data - for QR Global verification flow)
export const getCOAPreview = async (req: Request, res: Response) => {
    const { token } = req.params;

    if (!token) {
        return res.status(400).json({ success: false, error: 'Token requerido' });
    }

    // Demo token support
    if (token === 'demo') {
        return res.json({
            success: true,
            preview: {
                token: 'demo',
                name: 'CBD Isolate Premium',
                batch: 'BATCH-2023-001',
                image: null,
                status: 'pass',
                lab: 'Confident Cannabis'
            }
        });
    }

    try {
        const { data: coa, error } = await supabase
            .from('coas')
            .select(`
                public_token,
                custom_name,
                custom_title,
                product_sku,
                batch_id,
                product_image_url,
                compliance_status,
                lab_name,
                metadata
            `)
            .eq('public_token', token)
            .single();

        if (error || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Return only preview data (no sensitive cannabinoid info)
        res.json({
            success: true,
            preview: {
                token: coa.public_token,
                name: coa.custom_name || coa.custom_title || coa.product_sku || 'Producto',
                batch: (coa as any).metadata?.batch_number || coa.batch_id || '',
                image: coa.product_image_url,
                status: coa.compliance_status,
                lab: coa.lab_name
            }
        });
    } catch (err) {
        console.error('[Get COA Preview] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// Verify CVV for a specific COA token
export const verifyCVVForCOA = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { cvv } = req.body;

    if (!token || !cvv) {
        return res.status(400).json({ success: false, error: 'Token y código CVV requeridos' });
    }

    try {
        // Get the COA (include fields for fraud notification)
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, public_token, client_id, strain_name, custom_name, batch_id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ success: false, error: 'COA no encontrado' });
        }

        // Check if CVV exists and belongs to this COA
        const { data: cvvRecord, error: cvvError } = await supabase
            .from('verification_codes')
            .select('id, cvv_code, coa_id, is_revoked, scan_count, first_scanned_at')
            .eq('cvv_code', cvv.toUpperCase())
            .single();

        if (cvvError || !cvvRecord) {
            return res.status(404).json({
                success: false,
                error: 'Código de verificación no encontrado',
                valid: false
            });
        }

        // Check if revoked
        if (cvvRecord.is_revoked) {
            return res.status(400).json({
                success: false,
                error: 'Este código ha sido revocado',
                valid: false,
                revoked: true
            });
        }

        // Check if CVV belongs to this COA
        if (cvvRecord.coa_id !== coa.id) {
            return res.status(400).json({
                success: false,
                error: 'El código no corresponde a este producto',
                valid: false
            });
        }

        // Update scan count
        const newScanCount = (cvvRecord.scan_count || 0) + 1;
        const updateData: any = { scan_count: newScanCount };

        if (!cvvRecord.first_scanned_at) {
            updateData.first_scanned_at = new Date().toISOString();
        }

        await supabase
            .from('verification_codes')
            .update(updateData)
            .eq('id', cvvRecord.id);

        // Check for potential fraud (>5 scans)
        const potentialFraud = newScanCount > 5;

        // Send fraud alert to COA owner on 6th scan
        if (potentialFraud && newScanCount === 6 && coa.client_id) {
            const coaName = coa.strain_name || coa.custom_name || coa.batch_id || 'Producto';

            // Log fraud event
            await logFraud('cvv_threshold_exceeded', {
                cvv_code: cvvRecord.cvv_code,
                scan_count: newScanCount,
                coa_token: token,
                coa_name: coaName
            }, coa.client_id);

            notifyFraudDetected(
                cvvRecord.cvv_code,
                newScanCount,
                coa.public_token,
                coaName,
                coa.client_id
            ).catch((err: any) => console.error('[CVV for COA] Fraud notification error:', err));
        }

        res.json({
            success: true,
            valid: true,
            message: 'Código verificado correctamente',
            scan_count: newScanCount,
            potential_fraud: potentialFraud,
            redirect_to: `/coa/${token}`
        });

    } catch (err) {
        console.error('[Verify CVV for COA] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

// ============================================================================
// QR TOKEN HOLOGRAM ENDPOINTS (NEW - for complete holograms with QR+CVV)
// ============================================================================

/**
 * Get COA Preview by QR Token (for hologram with paired QR+CVV)
 * GET /api/v1/coas/preview/qr/:qr_token
 */
export const getCOAPreviewByQR = async (req: Request, res: Response) => {
    const { qr_token } = req.params;

    if (!qr_token) {
        return res.status(400).json({ success: false, error: 'QR Token requerido' });
    }

    try {
        // Find hologram by QR token
        const { data: hologram, error: hologramError } = await supabase
            .from('verification_codes')
            .select('id, cvv_code, coa_id, is_revoked, scan_count')
            .eq('qr_token', qr_token.toUpperCase())
            .single();

        if (hologramError || !hologram) {
            return res.status(404).json({
                success: false,
                error: 'Holograma no encontrado'
            });
        }

        // Check if revoked
        if (hologram.is_revoked) {
            return res.status(400).json({
                success: false,
                error: 'Este holograma ha sido revocado'
            });
        }

        // Check if assigned to a COA
        if (!hologram.coa_id) {
            return res.status(400).json({
                success: false,
                error: 'Este holograma aún no ha sido asignado a un producto'
            });
        }

        // Get COA data
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select(`
                public_token,
                custom_name,
                custom_title,
                product_sku,
                batch_id,
                compliance_status,
                lab_name,
                product_image_url,
                metadata
            `)
            .eq('id', hologram.coa_id)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Return preview data
        res.json({
            success: true,
            preview: {
                qr_token: qr_token.toUpperCase(),
                coa_token: coa.public_token,
                name: coa.custom_name || coa.custom_title || coa.product_sku || 'Producto',
                batch: (coa as any).metadata?.batch_number || coa.batch_id,
                image: coa.product_image_url,
                status: coa.compliance_status,
                lab: coa.lab_name
            }
        });

    } catch (err) {
        console.error('[Get COA Preview by QR] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};

/**
 * Verify CVV for QR Token Hologram
 * POST /api/v1/coas/preview/qr/:qr_token/verify-cvv
 * Body: { cvv: string }
 */
export const verifyCVVForQR = async (req: Request, res: Response) => {
    const { qr_token } = req.params;
    const { cvv } = req.body;

    if (!qr_token || !cvv) {
        return res.status(400).json({ success: false, error: 'QR Token y CVV requeridos' });
    }

    try {
        // Find hologram by QR token
        const { data: hologram, error: hologramError } = await supabase
            .from('verification_codes')
            .select('id, cvv_code, coa_id, is_revoked, scan_count, first_scanned_at')
            .eq('qr_token', qr_token.toUpperCase())
            .single();

        if (hologramError || !hologram) {
            return res.status(404).json({
                success: false,
                error: 'Holograma no encontrado',
                valid: false
            });
        }

        // Check if revoked
        if (hologram.is_revoked) {
            return res.status(400).json({
                success: false,
                error: 'Este holograma ha sido revocado',
                valid: false,
                revoked: true
            });
        }

        // Check if assigned
        if (!hologram.coa_id) {
            return res.status(400).json({
                success: false,
                error: 'Este holograma no está asignado a ningún producto',
                valid: false
            });
        }

        // CRITICAL: Verify CVV matches this specific hologram
        if (hologram.cvv_code !== cvv.toUpperCase()) {
            return res.status(400).json({
                success: false,
                error: 'Código CVV incorrecto para este holograma',
                valid: false
            });
        }

        // Get COA details for redirect and fraud notification
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('public_token, client_id, strain_name, custom_name, batch_id')
            .eq('id', hologram.coa_id)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado',
                valid: false
            });
        }

        // Update scan count
        const newScanCount = (hologram.scan_count || 0) + 1;
        const updateData: any = { scan_count: newScanCount };

        if (!hologram.first_scanned_at) {
            updateData.first_scanned_at = new Date().toISOString();
        }

        await supabase
            .from('verification_codes')
            .update(updateData)
            .eq('id', hologram.id);

        // Check for potential fraud (>5 scans)
        const potentialFraud = newScanCount > 5;

        // Send fraud alert to COA owner on 6th scan
        if (potentialFraud && newScanCount === 6 && coa.client_id) {
            const coaName = coa.strain_name || coa.custom_name || coa.batch_id || 'Producto';

            // Log fraud event
            await logFraud('hologram_threshold_exceeded', {
                cvv_code: hologram.cvv_code,
                qr_token: qr_token,
                scan_count: newScanCount,
                coa_token: coa.public_token,
                coa_name: coaName
            }, coa.client_id);

            notifyFraudDetected(
                hologram.cvv_code,
                newScanCount,
                coa.public_token,
                coaName,
                coa.client_id
            ).catch(err => console.error('[Hologram] Fraud notification error:', err));
        }

        res.json({
            success: true,
            valid: true,
            message: 'Holograma verificado correctamente',
            scan_count: newScanCount,
            potential_fraud: potentialFraud,
            redirect_to: `/coa/${coa.public_token}`
        });

    } catch (err) {
        console.error('[Verify CVV for QR] Error:', err);
        res.status(500).json({ success: false, error: 'Error del servidor' });
    }
};
