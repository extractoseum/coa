import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthHeaders } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import { AlertCircle, AlertTriangle, Info, Terminal, RefreshCw, XCircle } from 'lucide-react';

import { InsightsSummary } from '../components/InsightsSummary';
import type { InsightSignal } from '../components/InsightsSummary';

interface Log {
    id: number;
    created_at: string;
    level: string;
    event: string;
    trace_id: string;
    metadata: any;
}

export default function AdminTelemetry() {
    const { theme } = useTheme();
    const authHeaders = useAuthHeaders();
    const [logs, setLogs] = useState<Log[]>([]);
    const [signals, setSignals] = useState<InsightSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            // Fetch Logs
            let url = '/api/v1/logs/admin?limit=100';
            if (filter !== 'all') {
                url += `&level=${filter}`;
            }

            // Fetch Insights (Parallel)
            const [logsRes, insightsRes] = await Promise.all([
                fetch(url, { headers: authHeaders }),
                fetch('/api/v1/logs/admin/insights', { headers: authHeaders }) // Corrected URL also
            ]);

            if (logsRes.status === 401 || logsRes.status === 403) {
                throw new Error('Unauthorized: requires super_admin role.');
            }
            if (!logsRes.ok) throw new Error(`Logs API Error: ${logsRes.statusText}`);

            const logsData = await logsRes.json();
            // Insights might fail independently, we can ignore or handle softly
            const insightsData = insightsRes.ok ? await insightsRes.json() : { success: false };

            if (logsData.success) {
                setLogs(logsData.logs);
            } else {
                setErrorMsg(logsData.error || 'Failed to load logs');
            }

            if (insightsData.success) setSignals(insightsData.signals);

        } catch (error: any) {
            console.error('Failed to fetch telemetry', error);
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filter]);

    const getIcon = (level: string) => {
        switch (level) {
            case 'error': return <XCircle className="text-red-500" size={18} />;
            case 'warn': return <AlertTriangle className="text-yellow-500" size={18} />;
            default: return <Info className="text-blue-400" size={18} />;
        }
    };

    const getRowColor = (level: string) => {
        switch (level) {
            case 'error': return 'rgba(239, 68, 68, 0.1)';
            case 'warn': return 'rgba(234, 179, 8, 0.1)';
            default: return 'transparent';
        }
    };

    return (
        <Screen id="admin_telemetry">
            <Layout>
                <div className="p-6 max-w-7xl mx-auto pb-24">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
                                <Terminal className="text-blue-500" />
                                Telemetry Dashboard
                            </h1>
                            <p className="text-sm opacity-70" style={{ color: theme.textMuted }}>
                                Monitor system health and errors in real-time.
                            </p>
                        </div>
                        <button
                            onClick={fetchData}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ color: theme.text }}
                        >
                            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {/* Insights HUD */}
                    <InsightsSummary signals={signals} loading={loading} />

                    {/* Filters */}
                    <div className="flex gap-2 mb-6">
                        {(['all', 'error', 'warn', 'info'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize border ${filter === f
                                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                                    : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Logs Table */}
                    <div
                        className="rounded-xl overflow-hidden border backdrop-blur-sm"
                        style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.border
                        }}
                    >
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b" style={{ borderColor: theme.border, backgroundColor: theme.cardBg2 }}>
                                    <th className="p-4 text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>Level</th>
                                    <th className="p-4 text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>Time</th>
                                    <th className="p-4 text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>Event</th>
                                    <th className="p-4 text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>Trace ID</th>
                                    <th className="p-4 text-xs uppercase tracking-wider font-semibold" style={{ color: theme.textMuted }}>Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: theme.border }}>
                                {errorMsg ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-red-400 bg-red-500/10">
                                            <div className="flex flex-col items-center gap-2">
                                                <AlertCircle size={24} />
                                                <span className="font-bold">Error loading logs</span>
                                                <span className="text-sm opacity-80">{errorMsg}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center opacity-50">
                                            No logs found properly ingestion pipeline.
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map(log => (
                                        <tr key={log.id} style={{ backgroundColor: getRowColor(log.level) }} className="hover:bg-white/5 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    {getIcon(log.level)}
                                                    <span className="uppercase text-xs font-bold opacity-80" style={{ color: theme.text }}>
                                                        {log.level}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs font-mono opacity-70" style={{ color: theme.text }}>
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </td>
                                            <td className="p-4 font-medium" style={{ color: theme.text }}>
                                                {log.event}
                                            </td>
                                            <td className="p-4 text-xs font-mono opacity-50" style={{ color: theme.text }}>
                                                {log.trace_id?.slice(0, 8)}...
                                            </td>
                                            <td className="p-4 text-xs font-mono opacity-60 truncate max-w-xs" style={{ color: theme.text }}>
                                                {JSON.stringify(log.metadata)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
