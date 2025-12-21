import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import crypto from 'crypto';
import { notifyFraudDetected } from '../services/onesignalService';

// Generate CVV code (8 chars, uppercase hex)
const generateCVV = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Generate QR Token (8 chars, uppercase hex) - separate from CVV
const generateQRToken = () => crypto.randomBytes(4).toString('hex').toUpperCase();

/**
 * Generate multiple CVV codes for a COA (bulk generation)
 * POST /api/v1/coas/:token/generate-cvv
 * Body: { quantity: number, label_prefix?: string, with_qr_token?: boolean }
 */
export const generateCVVCode = async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        const { quantity = 1, label_prefix, with_qr_token = false } = req.body;

        // Validate quantity
        if (quantity < 1 || quantity > 10000) {
            return res.status(400).json({
                error: 'Quantity must be between 1 and 10,000'
            });
        }

        // 1. Get COA ID
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, batch_id')
            .eq('public_token', token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // 2. Generate unique CVVs (and QR Tokens if requested)
        const cvvCodes: string[] = [];
        const qrTokens: string[] = [];
        const cvvRecords: any[] = [];

        for (let i = 0; i < quantity; i++) {
            let cvvCode = generateCVV();
            let attempts = 0;

            // Ensure CVV uniqueness
            while (attempts < 10) {
                const { data: existing } = await supabase
                    .from('verification_codes')
                    .select('id')
                    .eq('cvv_code', cvvCode)
                    .single();

                if (!existing && !cvvCodes.includes(cvvCode)) break;
                cvvCode = generateCVV();
                attempts++;
            }

            // Generate unique QR Token if requested
            let qrToken: string | null = null;
            if (with_qr_token) {
                qrToken = generateQRToken();
                attempts = 0;

                while (attempts < 10) {
                    const { data: existing } = await supabase
                        .from('verification_codes')
                        .select('id')
                        .eq('qr_token', qrToken)
                        .single();

                    if (!existing && !qrTokens.includes(qrToken)) break;
                    qrToken = generateQRToken();
                    attempts++;
                }

                qrTokens.push(qrToken);
            }

            cvvCodes.push(cvvCode);
            cvvRecords.push({
                coa_id: coa.id,
                cvv_code: cvvCode,
                qr_token: qrToken,
                label_id: label_prefix ? `${label_prefix}-${String(i + 1).padStart(4, '0')}` : `${coa.batch_id}-${String(i + 1).padStart(4, '0')}`
            });
        }

        // 3. Bulk insert CVVs
        const { data: cvvData, error: cvvError } = await supabase
            .from('verification_codes')
            .insert(cvvRecords)
            .select();

        if (cvvError) throw cvvError;

        const responseData: any = {
            success: true,
            quantity: cvvCodes.length,
            cvv_codes: cvvCodes,
            data: cvvData
        };

        // Include QR tokens in response if generated
        if (with_qr_token) {
            responseData.qr_tokens = qrTokens;
        }

        res.json(responseData);

    } catch (error) {
        console.error('Generate CVV Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Verify a CVV code and track scan
 * GET /api/v1/verify/:cvv
 */
export const verifyCVV = async (req: Request, res: Response) => {
    try {
        const { cvv } = req.params;
        const { ip, userAgent } = req.body; // Optional tracking data

        // 1. Find CVV
        const { data: cvvData, error: cvvError } = await supabase
            .from('verification_codes')
            .select(`
                *,
                coas (
                    public_token,
                    batch_id,
                    lab_name,
                    compliance_status,
                    cannabinoids,
                    created_at,
                    strain_name,
                    custom_name,
                    client_id
                )
            `)
            .eq('cvv_code', cvv.toUpperCase())
            .single();

        if (cvvError || !cvvData) {
            return res.status(404).json({
                success: false,
                error: 'Código de verificación inválido',
                is_valid: false
            });
        }

        // 2. Check if revoked
        if (cvvData.is_revoked) {
            return res.json({
                success: false,
                is_valid: false,
                is_revoked: true,
                message: 'Este código ha sido revocado',
                revoked_reason: cvvData.revoked_reason
            });
        }

        // 3. Update scan stats
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
            .from('verification_codes')
            .update({
                scan_count: (cvvData.scan_count || 0) + 1,
                last_scanned_at: now,
                first_scanned_at: cvvData.first_scanned_at || now
            })
            .eq('id', cvvData.id);

        if (updateError) console.error('Update scan error:', updateError);

        // 4. Fraud detection
        const newScanCount = (cvvData.scan_count || 0) + 1;
        const fraudWarning = newScanCount > 5;

        // Send fraud alert notification to COA owner when threshold exceeded
        // Only for generated codes (CVV/QR/Holograms) - notify the COA owner
        if (fraudWarning && newScanCount === 6 && cvvData.coas.client_id) {
            // Only notify on the 6th scan (first time crossing threshold)
            const coaName = cvvData.coas.strain_name || cvvData.coas.custom_name || cvvData.coas.batch_id || 'Producto';
            notifyFraudDetected(
                cvvData.cvv_code,
                newScanCount,
                cvvData.coas.public_token,
                coaName,
                cvvData.coas.client_id
            ).catch(err => console.error('[CVV] Fraud notification error:', err));
        }

        res.json({
            success: true,
            is_valid: true,
            is_revoked: false,
            cvv_code: cvvData.cvv_code,
            scan_count: newScanCount,
            first_scanned_at: cvvData.first_scanned_at || now,
            fraud_warning: fraudWarning,
            coa: {
                public_token: cvvData.coas.public_token,
                batch_id: cvvData.coas.batch_id,
                lab_name: cvvData.coas.lab_name,
                compliance_status: cvvData.coas.compliance_status,
                created_at: cvvData.coas.created_at
            }
        });

    } catch (error) {
        console.error('Verify CVV Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Revoke a CVV code
 * DELETE /api/v1/verify/:cvv
 */
export const revokeCVV = async (req: Request, res: Response) => {
    try {
        const { cvv } = req.params;
        const { reason } = req.body;

        const { data, error } = await supabase
            .from('verification_codes')
            .update({
                is_revoked: true,
                revoked_at: new Date().toISOString(),
                revoked_reason: reason || 'Revoked by admin'
            })
            .eq('cvv_code', cvv.toUpperCase())
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'CVV revoked successfully',
            data
        });

    } catch (error) {
        console.error('Revoke CVV Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
