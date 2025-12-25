import dotenv from 'dotenv';
dotenv.config(); // Load envs first

import { supabase } from '../config/supabase';
import jwt from 'jsonwebtoken';

async function main() {
    const token = '18439e50';
    console.log(`[Debug] Simulating getCOAByToken for token: ${token}`);

    try {
        // 1. Fetch COA
        console.log('[Debug] Fetching COA from Supabase...');
        const { data, error } = await supabase
            .from('coas')
            .select('*')
            .eq('public_token', token)
            .single();

        if (error) {
            console.error('[Debug] Supabase Error:', error);
            return;
        }

        if (!data) {
            console.error('[Debug] No data found (404)');
            return;
        }

        console.log('[Debug] COA Found:', { id: data.id, batch_id: data.batch_id });

        // 2. Fetch Badges
        console.log('[Debug] Fetching Badges...');
        let badges: any[] = [];
        try {
            const { data: badgesData, error: badgesError } = await supabase
                .from('coa_badges')
                .select('badge:badges(*)')
                .eq('coa_id', data.id);

            if (badgesError) {
                console.error('[Debug] Badges Error (ignored in controller):', badgesError);
            }

            if (badgesData) {
                console.log('[Debug] Badges Data Raw:', JSON.stringify(badgesData));
                badges = badgesData.map((cb: any) => cb.badge).filter(Boolean);
            }
        } catch (badgesError) {
            console.error('[Debug] Badges Catch (ignored in controller):', badgesError);
        }
        console.log(`[Debug] Badges count: ${badges.length}`);

        // 3. JWT Signing
        console.log('[Debug] Signing JWT...');
        const verificationUrl = process.env.VERIFICATION_URL || 'https://coa.extractoseum.com/verify';
        const jwtSecret = process.env.JWT_SECRET || 'dev_secret_key_12345';

        console.log(`[Debug] JWT Secret defined? ${!!process.env.JWT_SECRET}`);

        const jwtPayload = {
            t: data.public_token,
            b: data.batch_id,
            iat: Math.floor(Date.now() / 1000)
        };

        console.log('[Debug] JWT Payload:', jwtPayload);

        const signedToken = jwt.sign(jwtPayload, jwtSecret, { expiresIn: '1y' });
        console.log('[Debug] Signed Token generated successfully.');

        const qr_code_secure_url = `${verificationUrl}?src=qr&sig=${signedToken}`;
        console.log('[Debug] QR URL:', qr_code_secure_url);

        const transformedData = {
            ...data,
            badges,
            qr_code_secure_url
        };

        console.log('[Debug] Controller would respond SUCCESS 200');

    } catch (err) {
        console.error('---------------------------------------------------');
        console.error('CRASH REPRODUCED!');
        console.error('Error:', err);
        console.error('Stack:', (err as Error).stack);
        console.error('---------------------------------------------------');
    }
}

main().catch(console.error);
