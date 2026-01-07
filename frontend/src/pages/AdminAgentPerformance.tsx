import { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthHeaders } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import {
    Brain, RefreshCw, TrendingUp, TrendingDown, DollarSign,
    MessageSquare, ThumbsUp, ThumbsDown, Zap, Target,
    BarChart3, PieChart, Activity, Sparkles, AlertCircle,
    CheckCircle, XCircle, HelpCircle
} from 'lucide-react';

interface AgentMetrics {
    agentName: string;
    totalConversations: number;
    outcomes: Record<string, number>;
    successRate: number;
    escalationRate: number;
    totalRevenue: number;
    avgConfidence: number;
    feedbackPositive: number;
    feedbackNegative: number;
    feedbackScore: number;
    snapsUsed: Record<string, number>;
}

interface SnapEffectiveness {
    snapName: string;
    usageCount: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    effectivenessScore: number;
    avgConfidence: number;
    feedbackPositive: number;
    feedbackNegative: number;
}

interface DashboardMetrics {
    summary: {
        totalConversations: number;
        totalWithOutcomes: number;
        pendingOutcomes: number;
        overallSuccessRate: number;
        totalRevenue: number;
        avgResponseConfidence: number;
        feedbackScore: number;
    };
    byAgent: AgentMetrics[];
    snapEffectiveness: SnapEffectiveness[];
    confidenceDistribution: {
        high: number;
        medium: number;
        low: number;
        unknown: number;
    };
    outcomesTrend: Array<{
        date: string;
        sales: number;
        resolutions: number;
        escalations: number;
        churns: number;
    }>;
    inquiryLearning: {
        totalResolutions: number;
        byType: Record<string, number>;
        byAction: Record<string, number>;
        customResponseRate: number;
    };
}

export default function AdminAgentPerformance() {
    const { theme } = useTheme();
    const authHeaders = useAuthHeaders();
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'snaps' | 'inquiries'>('overview');

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/v1/ai/performance/dashboard', { headers: authHeaders });
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    throw new Error('No tienes permisos para ver esta página');
                }
                throw new Error('Error al cargar métricas');
            }
            const data = await res.json();
            if (data.success) {
                setMetrics(data.data);
            } else {
                throw new Error(data.error || 'Error desconocido');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getConfidenceColor = (value: number) => {
        if (value >= 70) return 'text-green-400';
        if (value >= 40) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getConfidenceBg = (value: number) => {
        if (value >= 70) return 'bg-green-500/20';
        if (value >= 40) return 'bg-yellow-500/20';
        return 'bg-red-500/20';
    };

    return (
        <Screen id="admin_agent_performance">
            <Layout>
                <div className="p-6 max-w-7xl mx-auto pb-24">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
                                <Brain className="text-purple-500" />
                                Agent Performance Dashboard
                            </h1>
                            <p className="text-sm opacity-70" style={{ color: theme.textMuted }}>
                                Métricas de rendimiento de agentes IA, efectividad de snaps y aprendizaje del sistema
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

                    {/* Error State */}
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                            <AlertCircle className="text-red-400" size={20} />
                            <span className="text-red-400">{error}</span>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading && !metrics && (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center">
                                <RefreshCw size={32} className="animate-spin mx-auto mb-4 text-purple-400" />
                                <p className="text-white/50">Cargando métricas...</p>
                            </div>
                        </div>
                    )}

                    {metrics && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                {/* Total Conversations */}
                                <div className="p-4 rounded-xl border bg-gradient-to-br from-blue-500/10 to-transparent" style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <MessageSquare size={16} className="text-blue-400" />
                                        <span className="text-xs text-white/50 uppercase tracking-wider">Conversaciones</span>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{metrics.summary.totalConversations}</p>
                                    <p className="text-xs text-white/40">{metrics.summary.pendingOutcomes} pendientes</p>
                                </div>

                                {/* Success Rate */}
                                <div className="p-4 rounded-xl border bg-gradient-to-br from-green-500/10 to-transparent" style={{ borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target size={16} className="text-green-400" />
                                        <span className="text-xs text-white/50 uppercase tracking-wider">Tasa de Éxito</span>
                                    </div>
                                    <p className="text-2xl font-bold text-green-400">{metrics.summary.overallSuccessRate}%</p>
                                    <p className="text-xs text-white/40">{metrics.summary.totalWithOutcomes} con resultado</p>
                                </div>

                                {/* Revenue */}
                                <div className="p-4 rounded-xl border bg-gradient-to-br from-yellow-500/10 to-transparent" style={{ borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <DollarSign size={16} className="text-yellow-400" />
                                        <span className="text-xs text-white/50 uppercase tracking-wider">Revenue</span>
                                    </div>
                                    <p className="text-2xl font-bold text-yellow-400">${metrics.summary.totalRevenue.toLocaleString()}</p>
                                    <p className="text-xs text-white/40">Ventas cerradas</p>
                                </div>

                                {/* Feedback Score */}
                                <div className="p-4 rounded-xl border bg-gradient-to-br from-purple-500/10 to-transparent" style={{ borderColor: 'rgba(147, 51, 234, 0.3)' }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <ThumbsUp size={16} className="text-purple-400" />
                                        <span className="text-xs text-white/50 uppercase tracking-wider">Feedback Score</span>
                                    </div>
                                    <p className={`text-2xl font-bold ${getConfidenceColor(metrics.summary.feedbackScore)}`}>
                                        {metrics.summary.feedbackScore}%
                                    </p>
                                    <p className="text-xs text-white/40">Satisfacción</p>
                                </div>
                            </div>

                            {/* Confidence Distribution */}
                            <div className="mb-6 p-4 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles size={18} className="text-purple-400" />
                                    <h3 className="font-bold text-white">Distribución de Confianza en Respuestas</h3>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-green-400 font-medium">Alta</span>
                                            <span className="text-xs text-white/50">{metrics.confidenceDistribution.high}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-green-500 rounded-full transition-all"
                                                style={{ width: `${(metrics.confidenceDistribution.high / Math.max(1, metrics.confidenceDistribution.high + metrics.confidenceDistribution.medium + metrics.confidenceDistribution.low + metrics.confidenceDistribution.unknown)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-yellow-400 font-medium">Media</span>
                                            <span className="text-xs text-white/50">{metrics.confidenceDistribution.medium}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-yellow-500 rounded-full transition-all"
                                                style={{ width: `${(metrics.confidenceDistribution.medium / Math.max(1, metrics.confidenceDistribution.high + metrics.confidenceDistribution.medium + metrics.confidenceDistribution.low + metrics.confidenceDistribution.unknown)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-red-400 font-medium">Baja</span>
                                            <span className="text-xs text-white/50">{metrics.confidenceDistribution.low}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-red-500 rounded-full transition-all"
                                                style={{ width: `${(metrics.confidenceDistribution.low / Math.max(1, metrics.confidenceDistribution.high + metrics.confidenceDistribution.medium + metrics.confidenceDistribution.low + metrics.confidenceDistribution.unknown)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-white/40 font-medium">Sin datos</span>
                                            <span className="text-xs text-white/50">{metrics.confidenceDistribution.unknown}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-white/30 rounded-full transition-all"
                                                style={{ width: `${(metrics.confidenceDistribution.unknown / Math.max(1, metrics.confidenceDistribution.high + metrics.confidenceDistribution.medium + metrics.confidenceDistribution.low + metrics.confidenceDistribution.unknown)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2 mb-6">
                                {(['overview', 'agents', 'snaps', 'inquiries'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize border ${
                                            activeTab === tab
                                                ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                                : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'
                                        }`}
                                    >
                                        {tab === 'overview' ? 'Resumen' :
                                         tab === 'agents' ? 'Por Agente' :
                                         tab === 'snaps' ? 'Snaps' : 'Consultas'}
                                    </button>
                                ))}
                            </div>

                            {/* Overview Tab */}
                            {activeTab === 'overview' && (
                                <div className="space-y-6">
                                    {/* Outcomes Trend */}
                                    {metrics.outcomesTrend.length > 0 && (
                                        <div className="p-4 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                            <div className="flex items-center gap-2 mb-4">
                                                <BarChart3 size={18} className="text-blue-400" />
                                                <h3 className="font-bold text-white">Tendencia de Resultados (Últimos 30 días)</h3>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <div className="flex gap-1 min-w-max">
                                                    {metrics.outcomesTrend.map((day, idx) => {
                                                        const total = day.sales + day.resolutions + day.escalations + day.churns;
                                                        const maxHeight = 60;
                                                        return (
                                                            <div key={idx} className="flex flex-col items-center gap-1 w-8">
                                                                <div className="flex flex-col-reverse h-[60px] w-full gap-px">
                                                                    {day.sales > 0 && (
                                                                        <div
                                                                            className="bg-green-500 rounded-sm w-full"
                                                                            style={{ height: `${(day.sales / Math.max(total, 1)) * maxHeight}px` }}
                                                                            title={`${day.sales} ventas`}
                                                                        />
                                                                    )}
                                                                    {day.resolutions > 0 && (
                                                                        <div
                                                                            className="bg-blue-500 rounded-sm w-full"
                                                                            style={{ height: `${(day.resolutions / Math.max(total, 1)) * maxHeight}px` }}
                                                                            title={`${day.resolutions} resoluciones`}
                                                                        />
                                                                    )}
                                                                    {day.escalations > 0 && (
                                                                        <div
                                                                            className="bg-yellow-500 rounded-sm w-full"
                                                                            style={{ height: `${(day.escalations / Math.max(total, 1)) * maxHeight}px` }}
                                                                            title={`${day.escalations} escalaciones`}
                                                                        />
                                                                    )}
                                                                    {day.churns > 0 && (
                                                                        <div
                                                                            className="bg-red-500 rounded-sm w-full"
                                                                            style={{ height: `${(day.churns / Math.max(total, 1)) * maxHeight}px` }}
                                                                            title={`${day.churns} churns`}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <span className="text-[8px] text-white/30">{day.date.slice(-2)}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="flex gap-4 mt-3 text-xs">
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-green-500 rounded" />
                                                    <span className="text-white/50">Ventas</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-blue-500 rounded" />
                                                    <span className="text-white/50">Resoluciones</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-yellow-500 rounded" />
                                                    <span className="text-white/50">Escalaciones</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 bg-red-500 rounded" />
                                                    <span className="text-white/50">Churns</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Agents Tab */}
                            {activeTab === 'agents' && (
                                <div className="space-y-4">
                                    {metrics.byAgent.length === 0 ? (
                                        <div className="p-8 text-center text-white/50">
                                            No hay datos de agentes todavía
                                        </div>
                                    ) : (
                                        metrics.byAgent.map((agent, idx) => (
                                            <div
                                                key={idx}
                                                className="p-4 rounded-xl border"
                                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                                            >
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 rounded-lg bg-purple-500/20">
                                                            <Brain size={20} className="text-purple-400" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-white">{agent.agentName}</h3>
                                                            <p className="text-xs text-white/50">{agent.totalConversations} conversaciones</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-4">
                                                        <div className="text-center">
                                                            <p className={`text-lg font-bold ${agent.successRate >= 70 ? 'text-green-400' : agent.successRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                                {agent.successRate}%
                                                            </p>
                                                            <p className="text-[10px] text-white/40 uppercase">Éxito</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-lg font-bold text-yellow-400">${agent.totalRevenue.toLocaleString()}</p>
                                                            <p className="text-[10px] text-white/40 uppercase">Revenue</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className={`text-lg font-bold ${agent.feedbackScore >= 70 ? 'text-green-400' : agent.feedbackScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                                {agent.feedbackScore}%
                                                            </p>
                                                            <p className="text-[10px] text-white/40 uppercase">Feedback</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Outcomes breakdown */}
                                                <div className="flex gap-2 mb-3">
                                                    {Object.entries(agent.outcomes).map(([outcome, count]) => (
                                                        <div
                                                            key={outcome}
                                                            className={`px-2 py-1 rounded text-xs font-medium ${
                                                                outcome === 'sale' ? 'bg-green-500/20 text-green-400' :
                                                                outcome === 'resolution' ? 'bg-blue-500/20 text-blue-400' :
                                                                outcome === 'escalation' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                outcome === 'churn' ? 'bg-red-500/20 text-red-400' :
                                                                'bg-white/10 text-white/50'
                                                            }`}
                                                        >
                                                            {outcome}: {count}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Top snaps used */}
                                                {Object.keys(agent.snapsUsed).length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-white/10">
                                                        <p className="text-xs text-white/40 mb-2">Snaps más usados:</p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {Object.entries(agent.snapsUsed)
                                                                .sort((a, b) => b[1] - a[1])
                                                                .slice(0, 5)
                                                                .map(([snap, count]) => (
                                                                    <span
                                                                        key={snap}
                                                                        className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-white/60"
                                                                    >
                                                                        {snap.replace('.md', '')} ({count})
                                                                    </span>
                                                                ))
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* Snaps Tab */}
                            {activeTab === 'snaps' && (
                                <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                    {metrics.snapEffectiveness.length === 0 ? (
                                        <div className="p-8 text-center text-white/50">
                                            No hay datos de snaps todavía
                                        </div>
                                    ) : (
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b" style={{ borderColor: theme.border, backgroundColor: theme.cardBg2 }}>
                                                    <th className="p-3 text-xs uppercase tracking-wider font-semibold text-white/50">Snap</th>
                                                    <th className="p-3 text-xs uppercase tracking-wider font-semibold text-white/50 text-center">Usos</th>
                                                    <th className="p-3 text-xs uppercase tracking-wider font-semibold text-white/50 text-center">Efectividad</th>
                                                    <th className="p-3 text-xs uppercase tracking-wider font-semibold text-white/50 text-center">Feedback +/-</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y" style={{ borderColor: theme.border }}>
                                                {metrics.snapEffectiveness.map((snap, idx) => (
                                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2">
                                                                <Zap size={14} className="text-purple-400" />
                                                                <span className="font-medium text-white text-sm">{snap.snapName.replace('.md', '')}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className="text-white/70">{snap.usageCount}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${getConfidenceBg(snap.effectivenessScore)}`}>
                                                                {snap.effectivenessScore >= 70 ? (
                                                                    <TrendingUp size={12} className="text-green-400" />
                                                                ) : snap.effectivenessScore >= 40 ? (
                                                                    <Activity size={12} className="text-yellow-400" />
                                                                ) : (
                                                                    <TrendingDown size={12} className="text-red-400" />
                                                                )}
                                                                <span className={`text-sm font-bold ${getConfidenceColor(snap.effectivenessScore)}`}>
                                                                    {snap.effectivenessScore}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <span className="flex items-center gap-1 text-green-400 text-sm">
                                                                    <ThumbsUp size={12} />
                                                                    {snap.feedbackPositive}
                                                                </span>
                                                                <span className="text-white/20">/</span>
                                                                <span className="flex items-center gap-1 text-red-400 text-sm">
                                                                    <ThumbsDown size={12} />
                                                                    {snap.feedbackNegative}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* Inquiries Tab */}
                            {activeTab === 'inquiries' && (
                                <div className="space-y-4">
                                    {/* Summary Card */}
                                    <div className="p-4 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                        <div className="flex items-center gap-2 mb-4">
                                            <HelpCircle size={18} className="text-blue-400" />
                                            <h3 className="font-bold text-white">Estadísticas de Consultas del Sistema</h3>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="text-center p-3 rounded-lg bg-white/5">
                                                <p className="text-2xl font-bold text-white">{metrics.inquiryLearning.totalResolutions}</p>
                                                <p className="text-xs text-white/50">Resoluciones Totales</p>
                                            </div>
                                            <div className="text-center p-3 rounded-lg bg-white/5">
                                                <p className="text-2xl font-bold text-purple-400">{Object.keys(metrics.inquiryLearning.byType).length}</p>
                                                <p className="text-xs text-white/50">Tipos de Consulta</p>
                                            </div>
                                            <div className="text-center p-3 rounded-lg bg-white/5">
                                                <p className="text-2xl font-bold text-blue-400">{Object.keys(metrics.inquiryLearning.byAction).length}</p>
                                                <p className="text-xs text-white/50">Acciones Distintas</p>
                                            </div>
                                            <div className="text-center p-3 rounded-lg bg-white/5">
                                                <p className="text-2xl font-bold text-yellow-400">{metrics.inquiryLearning.customResponseRate.toFixed(1)}%</p>
                                                <p className="text-xs text-white/50">Respuestas Custom</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* By Type */}
                                    {Object.keys(metrics.inquiryLearning.byType).length > 0 && (
                                        <div className="p-4 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                            <h4 className="font-medium text-white mb-3">Por Tipo de Consulta</h4>
                                            <div className="space-y-2">
                                                {Object.entries(metrics.inquiryLearning.byType)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([type, count]) => (
                                                        <div key={type} className="flex items-center gap-3">
                                                            <span className="text-sm text-white/70 w-40 truncate">{type}</span>
                                                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-purple-500 rounded-full"
                                                                    style={{ width: `${(count / Math.max(...Object.values(metrics.inquiryLearning.byType))) * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-sm text-white/50 w-12 text-right">{count}</span>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}

                                    {/* By Action */}
                                    {Object.keys(metrics.inquiryLearning.byAction).length > 0 && (
                                        <div className="p-4 rounded-xl border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                                            <h4 className="font-medium text-white mb-3">Por Acción Tomada</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(metrics.inquiryLearning.byAction)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([action, count]) => (
                                                        <div
                                                            key={action}
                                                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                                                        >
                                                            <span className="text-sm text-white/70">{action}</span>
                                                            <span className="ml-2 text-sm font-bold text-purple-400">{count}</span>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Layout>
        </Screen>
    );
}
