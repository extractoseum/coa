
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load env if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_URL = 'https://gate.whapi.cloud/users/profile';

export interface HealthStatus {
    status: 'online' | 'degraded' | 'offline';
    checks: {
        database: { status: 'ok' | 'error'; latency_ms: number; error?: string };
        whapi: { status: 'ok' | 'error'; latency_ms: number; error?: string };
    };
    timestamp: string;
}

export class HealthService {
    private static instance: HealthService;

    private constructor() { }

    public static getInstance(): HealthService {
        if (!HealthService.instance) {
            HealthService.instance = new HealthService();
        }
        return HealthService.instance;
    }

    public async checkHealth(): Promise<HealthStatus> {
        const [dbHealth, whapiHealth] = await Promise.all([
            this.checkDatabase(),
            this.checkWhapi()
        ]);

        const isOnline = dbHealth.status === 'ok' && whapiHealth.status === 'ok';
        const isOffline = dbHealth.status === 'error' && whapiHealth.status === 'error';

        return {
            status: isOnline ? 'online' : (isOffline ? 'offline' : 'degraded'),
            checks: {
                database: dbHealth,
                whapi: whapiHealth
            },
            timestamp: new Date().toISOString()
        };
    }

    private async checkDatabase(): Promise<{ status: 'ok' | 'error'; latency_ms: number; error?: string }> {
        const start = Date.now();
        try {
            const { error } = await supabase.from('conversations').select('id').limit(1);
            const latency = Date.now() - start;

            if (error) throw error;
            return { status: 'ok', latency_ms: latency };
        } catch (err: any) {
            return { status: 'error', latency_ms: Date.now() - start, error: err.message };
        }
    }

    private async checkWhapi(): Promise<{ status: 'ok' | 'error'; latency_ms: number; error?: string }> {
        const start = Date.now();
        try {
            if (!WHAPI_TOKEN) throw new Error('WHAPI_TOKEN not found');

            await axios.get(WHAPI_URL, {
                headers: {
                    'Authorization': `Bearer ${WHAPI_TOKEN}`,
                    'Accept': 'application/json'
                },
                timeout: 5000 // 5s timeout
            });

            const latency = Date.now() - start;
            return { status: 'ok', latency_ms: latency };
        } catch (err: any) {
            return { status: 'error', latency_ms: Date.now() - start, error: err.message || 'Unknown Whapi Error' };
        }
    }
}
