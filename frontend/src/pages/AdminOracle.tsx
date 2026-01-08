
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
    Brain,
    ArrowLeft,
    RefreshCw,
    AlertTriangle,
    TrendingUp,
    Package,
    Users,
    Calendar,
    Search,
    Filter,
    CheckCircle2,
    Settings,
    ChevronDown,
    ChevronUp,
    Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';

// Types
interface OracleStats {
    total_predictions: number;
    predictions_due_soon: number;
    active_profiles: number;
    inventory_alerts: number;
}

interface Prediction {
    id: string;
    customer_email: string;
    customer_name: string;
    product_title: string;
    predicted_restock_date: string;
    days_until_restock: number;
    confidence_score: number;
    notification_status: string;
}

interface InventoryAlert {
    id: string;
    type: string;
    severity: string;
    product_title: string;
    message: string;
    created_at: string;
}

interface InventoryForecast {
    id: string;
    shopify_product_id: string;
    product_title: string;
    forecast_period: string;
    period_start: string;
    period_end: string;
    predicted_units: number;
    historical_avg_daily_sales: number;
    trend_factor: number;
    current_stock: number;
    recommended_order_qty: number;
    reorder_point: number;
    safety_stock: number;
    days_of_stock_remaining: number | null;
    is_low_stock: boolean;
    is_stockout_risk: boolean;
    stockout_risk_date: string | null;
    calculated_at: string;
    data_points_used: number;
}

const AdminOracle: React.FC = () => {
    const { theme } = useTheme();
    const navigate = useNavigate();

    // State
    const [stats, setStats] = useState<OracleStats | null>(null);
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [inventoryForecast, setInventoryForecast] = useState<InventoryForecast[]>([]);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'profiles' | 'inventory'>('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Initial Load
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Parallel fetch
            const token = localStorage.getItem('accessToken');
            const [statsRes, predsRes, alertsRes, profilesRes, forecastRes] = await Promise.all([
                fetch('/api/v1/oracle/stats', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/oracle/predictions/due-soon', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/oracle/alerts/low-stock', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/oracle/profiles', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/oracle/inventory/forecast', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const statsData = await statsRes.json();
            const predsData = await predsRes.json();
            const alertsData = await alertsRes.json();
            const profilesData = await profilesRes.json();
            const forecastData = await forecastRes.json();

            if (statsData.success) setStats(statsData);
            if (predsData.success) setPredictions(predsData.predictions);
            if (alertsData.success) setAlerts(alertsData.alerts);
            if (profilesData.success) setProfiles(profilesData.profiles);
            if (forecastData.success) setInventoryForecast(forecastData.forecast);

        } catch (error) {
            console.error('Error fetching Oracle data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleManualTrigger = async (type: 'predictions' | 'notifications' | 'sync-profiles') => {
        const typeLabels: Record<string, string> = {
            'predictions': 'Predicciones',
            'notifications': 'Notificaciones',
            'sync-profiles': 'Sincronización de Perfiles'
        };
        const label = typeLabels[type] || type;

        if (!confirm(`¿Estás seguro de ejecutar el proceso manual de ${label}?`)) return;

        setIsRefreshing(true);
        try {
            const res = await fetch(`/api/v1/oracle/trigger/${type}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Proceso ejecutado: ${JSON.stringify(data)}`);
                fetchData(); // Refresh data
            } else {
                alert('Error al ejecutar proceso: ' + (data.error || 'Error desconocido'));
            }
        } catch (error: any) {
            console.error(error);
            alert('Error de conexión: ' + error.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div
            className="min-h-screen p-4 pb-24 md:pb-8 font-sans selection:bg-purple-500/30"
            style={{ backgroundColor: theme.bg || '#000', color: theme.text }}
        >
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(ROUTES.home)}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
                                <Brain className="text-purple-500" />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                                    The Oracle
                                </span>
                            </h1>
                            <p className="text-sm opacity-60">Sistema de Predicción de Reabastecimiento & Stock</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleManualTrigger('predictions')}
                            disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium transition-all"
                        >
                            <Zap size={16} />
                            Generar Predicciones
                        </button>
                        <button
                            onClick={fetchData}
                            disabled={isRefreshing}
                            className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                        >
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Predicciones Activas', value: stats?.total_predictions || 0, icon: <Brain size={20} />, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                        { label: 'Reabastecimiento Prox.', value: stats?.predictions_due_soon || 0, icon: <Calendar size={20} />, color: 'text-pink-400', bg: 'bg-pink-500/10' },
                        { label: 'Alertas de Stock', value: stats?.inventory_alerts || 0, icon: <AlertTriangle size={20} />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                        { label: 'Perfiles de Consumo', value: stats?.active_profiles || 0, icon: <Settings size={20} />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                            <div className="flex items-start justify-between mb-2">
                                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                                    {stat.icon}
                                </div>
                                <span className="text-2xl font-bold">{stat.value}</span>
                            </div>
                            <p className="text-xs font-medium opacity-60">{stat.label}</p>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl w-fit">
                        {[
                            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
                            { id: 'profiles', label: 'Perfiles de Consumo', icon: <Users size={16} /> },
                            { id: 'inventory', label: 'Inventario', icon: <Package size={16} /> }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'profiles' && (
                        <button
                            onClick={() => handleManualTrigger('sync-profiles')}
                            disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium transition-all"
                        >
                            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                            Sincronizar Productos
                        </button>
                    )}
                </div>

                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* ... Existing Dashboard Content ... */}
                        {/* Left Column: Predictions List */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <TrendingUp size={20} className="text-green-400" />
                                    Oportunidades de Venta
                                </h2>
                            </div>

                            <div className="space-y-2">
                                {isLoading ? (
                                    <div className="text-center py-12 opacity-50">Cargando oráculo...</div>
                                ) : predictions.length === 0 ? (
                                    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                                        <Brain size={48} className="mx-auto text-gray-600 mb-4" />
                                        <h3 className="text-lg font-bold text-gray-400">Sin predicciones actuales</h3>
                                        <p className="text-sm text-gray-500 max-w-sm mx-auto mt-2">
                                            El Oráculo no detectó patrones de reorden claros en este momento. Revisa que los
                                            <span className="text-purple-400 font-bold cursor-pointer" onClick={() => setActiveTab('profiles')}> Perfiles de Consumo </span>
                                            estén configurados correctamente.
                                        </p>
                                    </div>
                                ) : (
                                    predictions.map((pred) => (
                                        <div
                                            key={pred.id}
                                            className="group p-4 rounded-xl border border-white/5 bg-white/5 hover:border-purple-500/30 hover:bg-white/10 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                                                        {pred.confidence_score}%
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                                                            {pred.customer_name || pred.customer_email}
                                                        </h3>
                                                        <p className="text-xs text-gray-400">
                                                            Necesitará <span className="text-white">{pred.product_title}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className={`text-sm font-bold ${pred.days_until_restock <= 3 ? 'text-red-400' : 'text-yellow-400'
                                                        }`}>
                                                        {pred.days_until_restock <= 0 ? '¡Vencido!' : `${pred.days_until_restock} días`}
                                                    </div>
                                                    <p className="text-[10px] uppercase tracking-wider opacity-50">
                                                        {new Date(pred.predicted_restock_date).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right Column: Inventory Alerts */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-bold flex items-center gap-2">
                                    <AlertTriangle size={20} className="text-amber-400" />
                                    Alertas de Stock
                                </h2>
                            </div>

                            <div className="space-y-2">
                                {alerts.length === 0 ? (
                                    <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 text-green-400 text-sm flex items-center gap-2">
                                        <CheckCircle2 size={16} />
                                        Todo el inventario saludable
                                    </div>
                                ) : (
                                    alerts.map((alert) => (
                                        <div
                                            key={alert.id}
                                            className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5"
                                        >
                                            <div className="flex items-start gap-3">
                                                <AlertTriangle size={16} className="text-amber-500 mt-1" />
                                                <div>
                                                    <h4 className="text-sm font-bold text-amber-200">{alert.product_title}</h4>
                                                    <p className="text-xs text-amber-100/60 mt-0.5">{alert.message}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 mt-8">
                                <h3 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                                    <Zap size={16} />
                                    Tip del Oracle
                                </h3>
                                <p className="text-xs text-blue-200/70 leading-relaxed">
                                    El sistema aprende de los patrones de reorden. Cuantas más órdenes procese, más precisas serán las fechas de predicción. Asegúrate de categorizar los productos en la pestaña "Perfiles".
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'profiles' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold">Perfiles de Consumo ({profiles.length})</h2>
                            {/* TODO: Add filter or search */}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {profiles.map(profile => (
                                <div key={profile.id} className="p-4 rounded-xl border border-white/5 bg-white/5 hover:border-purple-500/30 transition-all">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                                            <Package size={24} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-white line-clamp-1">{profile.product_title}</h4>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300">
                                                    {profile.estimated_days_supply} días suministro
                                                </span>
                                                {profile.category && (
                                                    <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 capitalize">
                                                        {profile.category}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-3 text-xs text-gray-500">
                                                Recompra promedio: {profile.avg_reorder_days ? `${profile.avg_reorder_days} días` : '---'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {profiles.length === 0 && (
                                <div className="col-span-full text-center py-12 opacity-50">
                                    No hay perfiles de consumo configurados.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="space-y-6">
                        {/* Inventory Alerts */}
                        {alerts.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                <h3 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4">
                                    <AlertTriangle size={20} />
                                    Alertas de Inventario ({alerts.length})
                                </h3>
                                <div className="space-y-2">
                                    {alerts.map(alert => (
                                        <div key={alert.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                                            <div>
                                                <span className="font-medium text-white">{alert.product_title}</span>
                                                <p className="text-sm text-gray-400">{alert.message}</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                alert.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                                                alert.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                                                'bg-blue-500/20 text-blue-300'
                                            }`}>
                                                {alert.severity === 'critical' ? '🔴 Crítico' :
                                                 alert.severity === 'warning' ? '🟠 Alerta' : '🔵 Info'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Inventory Forecast Table */}
                        {inventoryForecast.length > 0 ? (
                            <div className="rounded-xl border border-white/10 overflow-hidden">
                                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <TrendingUp size={18} className="text-purple-400" />
                                        Pronóstico de Demanda
                                    </h3>
                                    <button
                                        onClick={() => handleManualTrigger('predictions')}
                                        className="text-xs px-3 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                                    >
                                        Actualizar Pronóstico
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white/5">
                                            <tr>
                                                <th className="text-left p-3 text-gray-400">Producto</th>
                                                <th className="text-center p-3 text-gray-400">Stock Actual</th>
                                                <th className="text-center p-3 text-gray-400">Días de Stock</th>
                                                <th className="text-center p-3 text-gray-400">Venta Diaria Prom.</th>
                                                <th className="text-center p-3 text-gray-400">Demanda Mes</th>
                                                <th className="text-center p-3 text-gray-400">Pedir</th>
                                                <th className="text-center p-3 text-gray-400">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryForecast.sort((a, b) => {
                                                // Sort by risk level: stockout first, then low stock, then healthy
                                                if (a.is_stockout_risk && !b.is_stockout_risk) return -1;
                                                if (!a.is_stockout_risk && b.is_stockout_risk) return 1;
                                                if (a.is_low_stock && !b.is_low_stock) return -1;
                                                if (!a.is_low_stock && b.is_low_stock) return 1;
                                                return (a.days_of_stock_remaining || 999) - (b.days_of_stock_remaining || 999);
                                            }).map(item => (
                                                <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                                                    <td className="p-3">
                                                        <span className="font-medium text-white">{item.product_title}</span>
                                                        <div className="text-xs text-gray-500">{item.data_points_used} días de datos</div>
                                                    </td>
                                                    <td className="p-3 text-center text-white">{item.current_stock || 0}</td>
                                                    <td className="p-3 text-center">
                                                        <span className={`font-bold ${
                                                            item.is_stockout_risk ? 'text-red-400' :
                                                            item.is_low_stock ? 'text-yellow-400' :
                                                            'text-green-400'
                                                        }`}>
                                                            {item.days_of_stock_remaining !== null ? `${item.days_of_stock_remaining}d` : 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center text-gray-300">
                                                        {item.historical_avg_daily_sales?.toFixed(1) || '0'}
                                                    </td>
                                                    <td className="p-3 text-center text-gray-300">{item.predicted_units}</td>
                                                    <td className="p-3 text-center">
                                                        {item.recommended_order_qty > 0 ? (
                                                            <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-300 font-bold">
                                                                +{item.recommended_order_qty}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-500">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {item.is_stockout_risk ? (
                                                            <span className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs">🔴 Riesgo</span>
                                                        ) : item.is_low_stock ? (
                                                            <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 text-xs">🟠 Bajo</span>
                                                        ) : (
                                                            <span className="px-2 py-1 rounded bg-green-500/20 text-green-300 text-xs">🟢 OK</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                                <Package size={48} className="mx-auto text-gray-600 mb-4 opacity-50" />
                                <h3 className="text-lg font-bold text-gray-400">Sin Datos de Inventario</h3>
                                <p className="text-sm text-gray-500 mt-2">
                                    {alerts.length === 0
                                        ? 'Ejecuta el proceso de pronóstico para ver datos de demanda.'
                                        : 'No hay pronósticos disponibles aún.'}
                                </p>
                                <button
                                    onClick={() => handleManualTrigger('predictions')}
                                    className="mt-4 px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-sm"
                                >
                                    Generar Pronóstico
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Start icon helper
function LayoutDashboard({ size }: { size: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
    )
}

export default AdminOracle;
