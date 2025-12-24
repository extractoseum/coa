import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthHeaders } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import { AlertCircle, AlertTriangle, Info, Terminal, RefreshCw, XCircle, ShieldCheck, Activity, CheckCircle, Play } from 'lucide-react';

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
    const [auditorStats, setAuditorStats] = useState<any>(null);
    const [diagnostics, setDiagnostics] = useState<any>(null);
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

            // Fetch Diagnostics
            try {
                const diagRes = await fetch('/api/v1/health/diagnostics', { headers: authHeaders });
                const diagData = await diagRes.json();
                if (diagData.success) {
                    setDiagnostics(diagData);
                }
            } catch (err) {
                console.error('Diagnostics fetch error:', err);
            }

            // Fetch Auditor Stats
            try {
                const auditRes = await fetch('/api/v1/admin/audit/robot/stats', { headers: authHeaders });
                const auditData = await auditRes.json();
                if (auditData.success) {
                    setAuditorStats(auditData.stats);
                } else {
                    console.error('Auditor stats failed:', auditData);
                    setAuditorStats({ status: 'Error', results: {} });
                }
            } catch (err) {
                console.error('Auditor fetch error:', err);
                setAuditorStats({ status: 'Offline', results: {} });
            }

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

                    {/* Mission Control / Health Gate */}
                    {diagnostics && (
                        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Verdict Card */}
                            <div className={`p-4 rounded-xl border flex flex-col justify-between ${diagnostics.exitCode === 0 ? 'bg-green-500/10 border-green-500/30' :
                                    diagnostics.exitCode === 1 ? 'bg-red-500/10 border-red-500/30' :
                                        'bg-yellow-500/10 border-yellow-500/30'
                                }`}>
                                <div className="flex items-center gap-2">
                                    <Activity className={diagnostics.exitCode === 0 ? 'text-green-400' : 'text-red-400'} size={20} />
                                    <h3 className="font-bold text-sm" style={{ color: theme.text }}>System Gate</h3>
                                </div>
                                <div>
                                    <p className={`text-2xl font-bold ${diagnostics.exitCode === 0 ? 'text-green-400' :
                                            diagnostics.exitCode === 1 ? 'text-red-400' : 'text-yellow-400'
                                        }`}>
                                        {diagnostics.verdict || 'UNKNOWN'}
                                    </p>
                                    <p className="text-xs opacity-60">Pre-deploy Verification</p>
                                </div>
                            </div>

                            {/* Build & Checks */}
                            <div className="p-4 rounded-xl border bg-black/20" style={{ borderColor: theme.border }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle className="text-blue-400" size={20} />
                                    <h3 className="font-bold text-sm" style={{ color: theme.text }}>Diagnostics</h3>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="opacity-70">Critical Checks</span>
                                        <span className={diagnostics.summary?.criticalFailed > 0 ? 'text-red-400 font-bold' : 'text-green-400'}>
                                            {diagnostics.summary?.criticalPassed}/{diagnostics.critical?.length} PASSED
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="opacity-70">Warnings</span>
                                        <span className={diagnostics.summary?.warningFailed > 0 ? 'text-yellow-400' : 'text-green-400'}>
                                            {diagnostics.summary?.warningPassed}/{diagnostics.warning?.length} PASSED
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-4 rounded-xl border bg-black/20 flex flex-col justify-center items-center gap-2" style={{ borderColor: theme.border }}>
                                <button
                                    onClick={fetchData}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center gap-2 transition-colors text-sm font-bold"
                                >
                                    <Play size={16} />
                                    Run Diagnostics
                                </button>
                                <p className="text-[10px] opacity-40">Executes server-side CLI analysis</p>
                            </div>
                        </div>
                    )}

                    {/* Auditor Robot Status */}
                    <div className="mb-6 rounded-xl border p-4 flex items-center justify-between"
                        style={{
                            background: `linear-gradient(to right, ${theme.cardBg}, rgba(147, 51, 234, 0.05))`,
                            borderColor: 'rgba(147, 51, 234, 0.2)'
                        }}>
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-full bg-purple-500/10 text-purple-400">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">Auditor Robot</h3>
                                <p className="text-xs opacity-50">System Auto-Correction & Forensics</p>
                            </div>
                        </div>

                        {auditorStats ? (
                            <>
                                <div className="flex gap-8">
                                    <div className="text-center">
                                        <p className="text-xl font-bold font-mono text-purple-400">{auditorStats.results?.orphansFixed || 0}</p>
                                        <p className="text-[10px] uppercase opacity-50 tracking-wider">Orphans</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-bold font-mono text-blue-400">{auditorStats.results?.unlinkedIdentitiesFixed || 0}</p>
                                        <p className="text-[10px] uppercase opacity-50 tracking-wider">Identities</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-bold font-mono text-green-400">{auditorStats.results?.staleSnapshotsRefreshed || 0}</p>
                                        <p className="text-[10px] uppercase opacity-50 tracking-wider">Snapshots</p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${auditorStats.status === 'running' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-green-500/10 text-green-500'
                                        }`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${auditorStats.status === 'running' ? 'bg-yellow-500 animate-ping' : 'bg-green-500'}`} />
                                        {auditorStats.status || 'Idle'}
                                    </div>
                                    <p className="text-[9px] opacity-30 mt-1 font-mono">
                                        Last Run: {auditorStats.lastRunAt ? new Date(auditorStats.lastRunAt).toLocaleTimeString() : 'Never'}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 opacity-50">
                                <RefreshCw className="animate-spin" size={16} />
                                <span className="text-xs font-mono">Connecting to Cortex...</span>
                            </div>
                        )}
                    </div>

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
