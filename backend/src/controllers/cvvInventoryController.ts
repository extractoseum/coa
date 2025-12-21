import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import crypto from 'crypto';

// Generate CVV code (8 chars, uppercase hex)
const generateCVV = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Generate QR Token (8 chars, uppercase hex) - separate from CVV
const generateQRToken = () => crypto.randomBytes(4).toString('hex').toUpperCase();

/**
 * Generate unassigned CVVs for hologram inventory
 * POST /api/v1/cvv/generate-unassigned
 * Body: { quantity: number, label_prefix?: string, with_qr_token?: boolean }
 *
 * with_qr_token: true = Hologramas completos (QR + CVV pareados)
 * with_qr_token: false/omitido = CVV simples (compatibilidad con sistema existente)
 */
export const generateUnassignedCVVs = async (req: Request, res: Response) => {
    try {
        const { quantity = 1, label_prefix = 'HOLO', with_qr_token = false } = req.body;

        if (quantity < 1 || quantity > 10000) {
            return res.status(400).json({
                error: 'Quantity must be between 1 and 10,000'
            });
        }

        // Generate unique CVVs WITHOUT coa_id (unassigned)
        const cvvCodes: string[] = [];
        const qrTokens: string[] = [];
        const cvvRecords: any[] = [];

        for (let i = 0; i < quantity; i++) {
            // Generate unique CVV
            let cvvCode = generateCVV();
            let attempts = 0;

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
                coa_id: null, // Unassigned
                cvv_code: cvvCode,
                qr_token: qrToken, // null for simple CVV, value for complete hologram
                label_id: `${label_prefix}-${String(i + 1).padStart(4, '0')}`
            });
        }

        // Bulk insert
        const { data: cvvData, error: cvvError } = await supabase
            .from('verification_codes')
            .insert(cvvRecords)
            .select();

        if (cvvError) throw cvvError;

        const responseData: any = {
            success: true,
            quantity: cvvCodes.length,
            cvv_codes: cvvCodes,
            message: with_qr_token
                ? `${cvvCodes.length} hologramas completos (QR+CVV) generados y listos para asignar`
                : `${cvvCodes.length} códigos CVV simples generados y listos para asignar`,
            data: cvvData
        };

        // Include QR tokens in response if generated
        if (with_qr_token) {
            responseData.qr_tokens = qrTokens;
            responseData.holograms = cvvData?.map((record: any) => ({
                label: record.label_id,
                qr_token: record.qr_token,
                cvv_code: record.cvv_code,
                qr_url: `https://coa.extractoseum.com/preview/qr/${record.qr_token}`
            }));
        }

        res.json(responseData);

    } catch (error) {
        console.error('Generate Unassigned CVVs Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Get count of unassigned CVVs
 * GET /api/v1/cvv/unassigned
 */
export const getUnassignedCVVs = async (req: Request, res: Response) => {
    try {
        const { data, error, count } = await supabase
            .from('verification_codes')
            .select('*', { count: 'exact' })
            .is('coa_id', null)
            .order('generated_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            total_unassigned: count || 0,
            data: data || []
        });

    } catch (error) {
        console.error('Get Unassigned CVVs Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Assign unassigned CVVs to a COA
 * POST /api/v1/cvv/assign
 * Body: { coa_token: string, quantity: number }
 */
export const assignCVVsToCOA = async (req: Request, res: Response) => {
    try {
        const { coa_token, quantity } = req.body;

        if (!coa_token || !quantity) {
            return res.status(400).json({ error: 'coa_token and quantity are required' });
        }

        // 1. Get COA ID
        const { data: coa, error: coaError } = await supabase
            .from('coas')
            .select('id, batch_id')
            .eq('public_token', coa_token)
            .single();

        if (coaError || !coa) {
            return res.status(404).json({ error: 'COA not found' });
        }

        // 2. Get unassigned CVVs (take first N available)
        const { data: unassignedCVVs, error: fetchError } = await supabase
            .from('verification_codes')
            .select('id, cvv_code')
            .is('coa_id', null)
            .limit(quantity);

        if (fetchError) throw fetchError;

        if (!unassignedCVVs || unassignedCVVs.length === 0) {
            return res.status(400).json({
                error: 'No unassigned CVVs available in inventory',
                available: 0
            });
        }

        if (unassignedCVVs.length < quantity) {
            return res.status(400).json({
                error: `Only ${unassignedCVVs.length} unassigned CVVs available, but ${quantity} requested`,
                available: unassignedCVVs.length
            });
        }

        // 3. Assign them to the COA
        const cvvIds = unassignedCVVs.map(cvv => cvv.id);
        const { data: updatedCVVs, error: updateError } = await supabase
            .from('verification_codes')
            .update({
                coa_id: coa.id,
                assigned_at: new Date().toISOString()
            })
            .in('id', cvvIds)
            .select();

        if (updateError) throw updateError;

        res.json({
            success: true,
            message: `${unassignedCVVs.length} CVVs assigned to COA ${coa.batch_id}`,
            assigned_count: unassignedCVVs.length,
            cvv_codes: unassignedCVVs.map(c => c.cvv_code),
            data: updatedCVVs
        });

    } catch (error) {
        console.error('Assign CVVs Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
