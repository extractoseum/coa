import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { getInsights } from '../services/insightService';

// Initialize Supabase client
const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

export const ingestLog = async (req: Request, res: Response) => {
    try {
        const { event, trace_id, level = 'info', ...metadata } = req.body;

        // Persist to Supabase
        const { error } = await supabase
            .from('system_logs')
            .insert({
                event,
                trace_id: trace_id || `trace-${Date.now()}`, // Fallback if missing
                level,
                metadata: metadata,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('Failed to persist log:', error);
            // Don't block the client, just log the error internally
        }

        // Still log to stdout for real-time monitoring
        if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TELEMETRY_LOGS === 'true') {
            console.log(`[Telemetry][${level.toUpperCase()}] ${event}`, JSON.stringify(metadata));
        }

        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Telemetry ingestion error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getSystemLogs = async (req: Request, res: Response) => {
    try {
        const { limit = 100, level } = req.query;

        let query = supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (level) {
            query = query.eq('level', level);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            logs: data
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const exportSystemLogs = async (req: Request, res: Response) => {
    try {
        const { limit = 1000 } = req.query;

        const { data, error } = await supabase
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).send('No logs found');
        }

        // CSV Header
        const fields = ['id', 'created_at', 'level', 'event', 'trace_id', 'metadata'];
        let csv = fields.join(',') + '\n';

        // CSV Body
        data.forEach(row => {
            const line = fields.map(field => {
                let cell = row[field];
                if (typeof cell === 'object') {
                    // Flatten JSON for metadata
                    cell = JSON.stringify(cell).replace(/"/g, '""'); // Escape double quotes
                }
                // Enquote objects or strings with commas
                if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))) {
                    return `"${cell}"`;
                }
                return cell;
            });
            csv += line.join(',') + '\n';
        });

        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="system_logs_${new Date().toISOString()}.csv"`);
        res.send(csv);

    } catch (error: any) {
        console.error('[Export Logs] Error:', error);
        res.status(500).send('Export failed');
    }
};
