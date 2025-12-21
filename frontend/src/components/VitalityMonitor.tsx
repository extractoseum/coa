
import React, { useState, useEffect } from 'react';

interface HealthStatus {
    status: 'online' | 'degraded' | 'offline';
    checks: {
        database: { status: 'ok' | 'error'; latency_ms: number; error?: string };
        whapi: { status: 'ok' | 'error'; latency_ms: number; error?: string };
    };
    timestamp: string;
}

const VitalityMonitor: React.FC<{ usageStats?: { totalCost: number, totalTokens: number } | null }> = ({ usageStats }) => {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const checkHealth = async () => {
        setLoading(true);
        try {
            // Use relative path assuming frontend is served from same domain or proxy setup
            const res = await fetch('/api/v1/health');
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            setHealth(data);
        } catch (err) {
            setHealth({
                status: 'offline',
                checks: {
                    database: { status: 'error', latency_ms: 0, error: 'Unreachable' },
                    whapi: { status: 'error', latency_ms: 0, error: 'Unreachable' }
                },
                timestamp: new Date().toISOString()
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    if (!health) return null;

    const getColor = (status: string) => {
        if (status === 'online') return '#10B981'; // Green
        if (status === 'degraded') return '#F59E0B'; // Yellow
        if (status === 'offline') return '#EF4444'; // Red
        return '#6B7280'; // Gray
    };

    return (
        <div
            className="group relative flex items-center justify-center transition-all hover:bg-white/5 rounded-full p-1.5 cursor-pointer"
            onClick={() => setExpanded(!expanded)}
            title={`System Status: ${health.status.toUpperCase()}`}
            style={{ border: expanded ? `1px solid ${getColor(health.status)}50` : '1px solid transparent' }}
        >
            <div
                className="transition-all duration-500"
                style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getColor(health.status),
                    boxShadow: `0 0 8px ${getColor(health.status)}`
                }}
            />

            {expanded && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    padding: '12px',
                    width: '240px',
                    zIndex: 50,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#9CA3AF', fontSize: '10px' }}>SYSTEM HEALTH</div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                        <span>Database</span>
                        <span style={{ color: health.checks.database.status === 'ok' ? '#10B981' : '#EF4444' }}>
                            {health.checks.database.status === 'ok' ? `${health.checks.database.latency_ms}ms` : 'ERR'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span>WhatsApp (Whapi)</span>
                        <span style={{ color: health.checks.whapi.status === 'ok' ? '#10B981' : '#EF4444' }}>
                            {health.checks.whapi.status === 'ok' ? `${health.checks.whapi.latency_ms}ms` : 'ERR'}
                        </span>
                    </div>

                    <div style={{ marginTop: '8px', fontSize: '9px', color: '#6B7280', textAlign: 'right' }}>
                        updated: {new Date(health.timestamp).toLocaleTimeString()}
                    </div>

                    {usageStats && (
                        <>
                            <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: 'bold', color: '#9CA3AF', fontSize: '10px', borderTop: '1px solid #374151', paddingTop: '8px' }}>RESOURCE USAGE</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
                                <span>Total Cost</span>
                                <span style={{ color: '#F59E0B', fontFamily: 'monospace' }}>${usageStats.totalCost.toFixed(4)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                                <span>Tokens</span>
                                <span style={{ color: '#9CA3AF', fontFamily: 'monospace' }}>{usageStats.totalTokens.toLocaleString()}</span>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default VitalityMonitor;
