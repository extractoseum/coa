import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Ghost, ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Zap, MessageCircle, Mail, Send, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

type BustChannel = 'whatsapp' | 'email' | 'both';

interface GhostAlert {
    id: string;
    client_id: string;
    ghost_level: 'warm_ghost' | 'cold_ghost' | 'frozen_ghost' | 'churned';
    days_inactive: number;
    last_activity_type: string;
    vibe_at_creation: string;
    clients: {
        name: string;
        phone: string;
    };
}

const AdminGhostbuster: React.FC = () => {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState<GhostAlert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/v1/ghostbuster/alerts?status=pending', {
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            const data = await res.json();
            if (data.success) setAlerts(data.alerts);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleBustGhost = async (alertId: string, name: string, channel: BustChannel) => {
        const channelLabels = {
            whatsapp: 'WhatsApp',
            email: 'Email',
            both: 'WhatsApp y Email'
        };
        if (!confirm(`¿Enviar mensaje de reactivación a ${name} por ${channelLabels[channel]}?`)) return;
        try {
            const res = await fetch('/api/v1/ghostbuster/bust', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('accessToken')}`
                },
                body: JSON.stringify({ alertId, channel })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Mensaje enviado por: ${data.channels?.join(', ') || channel}`);
                fetchData();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error: any) {
            alert('Error: ' + error.message);
        }
    };

    const handleManualScan = async () => {
        if (!confirm('Esto escanerá toda la base de datos. ¿Continuar?')) return;
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/v1/ghostbuster/scan', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Escaneo completo. Fantasmas encontrados: ${data.result.ghosts_found}`);
                fetchData();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleResetAndRescan = async () => {
        if (!confirm('Esto eliminará todas las alertas pendientes y volverá a escanear con datos corregidos. ¿Continuar?')) return;
        setIsRefreshing(true);
        try {
            // First reset
            await fetch('/api/v1/ghostbuster/reset', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            // Then scan
            const res = await fetch('/api/v1/ghostbuster/scan', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Reset y escaneo completo. Fantasmas encontrados: ${data.result.ghosts_found}`);
                fetchData();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleSyncShopifyMetrics = async () => {
        if (!confirm('Esto sincronizará métricas de Shopify (orders_count, total_spent, tags) para todos los clientes. ¿Continuar?')) return;
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/v1/ghostbuster/sync-metrics', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Sync completo. ${data.message}`);
                // Rescan after sync to detect new ghost types
                await handleManualScan();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const getLevelBadge = (level: string) => {
        switch (level) {
            case 'warm_ghost': return <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 text-xs">Warm (14-30d)</span>;
            case 'cold_ghost': return <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs">Cold (31-60d)</span>;
            case 'frozen_ghost': return <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 text-xs">Frozen (60-90d)</span>;
            case 'churned': return <span className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs">Churned (90d+)</span>;
            // Enhanced ghost types
            case 'vip_at_risk': return <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-bold">⭐ VIP at Risk</span>;
            case 'one_time_buyer': return <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs">One-Time Buyer</span>;
            case 'big_spender_lapsed': return <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-300 text-xs">💎 Big Spender</span>;
            default: return level;
        }
    };

    return (
        <div className="min-h-screen p-4 pb-24 md:pb-8 font-sans"
            style={{ backgroundColor: theme.bg || '#000', color: theme.text }}>

            <div className="max-w-7xl mx-auto mb-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(ROUTES.home)} className="p-2 rounded-full hover:bg-white/10">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                                <Ghost className="text-indigo-400" />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-600">
                                    Ghostbuster Protocol
                                </span>
                            </h1>
                            <p className="text-sm opacity-60">Sistema de Reactivación de Clientes Inactivos</p>
                        </div>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        <button onClick={handleSyncShopifyMetrics} disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                            <Download size={16} /> Sync Shopify
                        </button>
                        <button onClick={handleResetAndRescan} disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-sm font-medium">
                            <AlertTriangle size={16} /> Reset & Rescan
                        </button>
                        <button onClick={handleManualScan} disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium">
                            <Zap size={16} /> Escanear Ahora
                        </button>
                        <button onClick={fetchData} className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 ${isLoading ? 'animate-spin' : ''}`}>
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-4">
                    <h2 className="text-xl font-bold">Fantasmas Detectados ({alerts.length})</h2>

                    {isLoading ? (
                        <div className="text-center py-12 opacity-50">Cargando ectoplasma...</div>
                    ) : alerts.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                            <h3 className="text-lg font-bold text-gray-400">Todo limpio</h3>
                            <p className="text-sm text-gray-500">No hay clientes inactivos pendientes de contactar.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {alerts.map(alert => (
                                <div key={alert.id} className="p-4 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between hover:border-indigo-500/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-gray-500">
                                            {alert.clients?.name?.[0] || '?'}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">{alert.clients?.name || 'Desconocido'}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                {getLevelBadge(alert.ghost_level)}
                                                <span className="text-xs text-gray-400">{alert.days_inactive} días inactivo</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden md:block">
                                            <div className="text-xs opacity-50">Vibe Check</div>
                                            <div className="text-sm">{alert.vibe_at_creation}</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleBustGhost(alert.id, alert.clients?.name || 'Cliente', 'whatsapp')}
                                                className="p-2 rounded-l-lg bg-green-600 hover:bg-green-700 text-white transition-all"
                                                title="Enviar por WhatsApp">
                                                <MessageCircle size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleBustGhost(alert.id, alert.clients?.name || 'Cliente', 'email')}
                                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white transition-all"
                                                title="Enviar por Email">
                                                <Mail size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleBustGhost(alert.id, alert.clients?.name || 'Cliente', 'both')}
                                                className="p-2 rounded-r-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
                                                title="Enviar por ambos canales">
                                                <Send size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminGhostbuster;
