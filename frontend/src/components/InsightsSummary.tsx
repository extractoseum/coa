import { AlertTriangle, CheckCircle, Flame, Server, ShieldAlert } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export interface InsightSignal {
    type: 'error_spike' | 'performance_degradation' | 'security_anomaly';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    metrics: Record<string, any>;
    timestamp: string;
}

interface InsightsSummaryProps {
    signals: InsightSignal[];
    loading: boolean;
}

export function InsightsSummary({ signals, loading }: InsightsSummaryProps) {
    const { theme } = useTheme();

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: theme.cardBg }}></div>
                ))}
            </div>
        );
    }

    // Default "All Good" state if no signals
    if (signals.length === 0) {
        return (
            <div
                className="rounded-xl p-6 mb-8 flex items-center gap-4 border"
                style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'rgba(16, 185, 129, 0.2)'
                }}
            >
                <div className="p-3 rounded-full bg-emerald-500/20">
                    <CheckCircle className="text-emerald-500" size={32} />
                </div>
                <div>
                    <h3 className="font-bold text-lg" style={{ color: theme.text }}>All Systems Nominal</h3>
                    <p className="opacity-70" style={{ color: theme.textMuted }}>No active anomalies detected in the last window.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {signals.map((signal, idx) => {
                const isCritical = signal.severity === 'critical';
                const borderColor = isCritical ? 'rgba(239, 68, 68, 0.5)' : 'rgba(234, 179, 8, 0.5)';
                const bgColor = isCritical ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)';
                const iconColor = isCritical ? '#ef4444' : '#eab308'; // red-500 : yellow-500

                let Icon = AlertTriangle;
                if (signal.type === 'error_spike') Icon = Flame;
                if (signal.type === 'performance_degradation') Icon = Server;
                if (signal.type === 'security_anomaly') Icon = ShieldAlert;

                return (
                    <div
                        key={idx}
                        className="rounded-xl p-5 border backdrop-blur-sm transition-all hover:scale-[1.02]"
                        style={{
                            backgroundColor: bgColor,
                            borderColor: borderColor
                        }}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <Icon size={24} style={{ color: iconColor }} />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', color: iconColor }}>
                                {signal.severity}
                            </span>
                        </div>
                        <h4 className="font-bold mb-1" style={{ color: theme.text }}>{signal.title}</h4>
                        <p className="text-sm opacity-80 mb-3" style={{ color: theme.textMuted }}>{signal.description}</p>

                        {/* Metrics Mini-Table */}
                        {signal.metrics && (
                            <div className="text-xs font-mono p-2 rounded bg-black/20 space-y-1" style={{ color: theme.text }}>
                                {Object.entries(signal.metrics).map(([k, v]) => (
                                    <div key={k} className="flex justify-between">
                                        <span className="opacity-60">{k}:</span>
                                        <span>{JSON.stringify(v)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-3 text-xs opacity-50 text-right" style={{ color: theme.textMuted }}>
                            {new Date(signal.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
