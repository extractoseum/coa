import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

export interface InsightSignal {
    type: 'error_spike' | 'performance_degradation' | 'security_anomaly';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    metrics: Record<string, any>;
    timestamp: string;
}

export const getInsights = async (): Promise<InsightSignal[]> => {
    const signals: InsightSignal[] = [];

    // Parallelize checks
    const [errorSpikes, slowRoutes] = await Promise.all([
        checkErrorSpikes(),
        checkSlowRoutes()
    ]);

    if (errorSpikes) signals.push(errorSpikes);
    if (slowRoutes) signals.push(slowRoutes);

    return signals;
};

// 1. Check for Error Spikes (> 5 errors in last 5 minutes)
async function checkErrorSpikes(): Promise<InsightSignal | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .eq('severity', 'error')
        .gte('created_at', fiveMinutesAgo);

    if (error) {
        console.error('Insight Check Failed (Errors):', error);
        return null;
    }

    const errorCount = data?.length || 0;
    const THRESHOLD = 5;

    if (errorCount > THRESHOLD) {
        return {
            type: 'error_spike',
            severity: 'critical',
            title: 'High Error Rate Detected',
            description: `${errorCount} errors recorded in the last 5 minutes.`,
            metrics: { count: errorCount, threshold: THRESHOLD, window: '5m' },
            timestamp: new Date().toISOString()
        };
    }
    return null;
}

// 2. Check for Slow Routes (Avg Duration > 2s in last 100 requests)
// Note: This relies on logs having `metadata: { duration: number }`
async function checkSlowRoutes(): Promise<InsightSignal | null> {
    const { data, error } = await supabase
        .from('system_logs')
        .select('payload, event_type')
        .contains('payload', { type: 'http_request' }) // Assuming we tag logs like this
        .order('created_at', { ascending: false })
        .limit(100);

    if (error || !data) return null;

    let slowCount = 0;
    const slowRoutes: string[] = [];
    const TIMEOUT_MS = 2000;

    data.forEach((log: any) => {
        const duration = log.payload?.duration || 0;
        if (duration > TIMEOUT_MS) {
            slowCount++;
            if (!slowRoutes.includes(log.event_type)) {
                slowRoutes.push(log.event_type); // event usually holds "GET /route"
            }
        }
    });

    if (slowCount > 3) {
        return {
            type: 'performance_degradation',
            severity: 'warning',
            title: 'Slow Routes Detected',
            description: `${slowCount} requests exceeded ${TIMEOUT_MS}ms latency.`,
            metrics: { count: slowCount, routes: slowRoutes.slice(0, 3) },
            timestamp: new Date().toISOString()
        };
    }

    return null;
}
