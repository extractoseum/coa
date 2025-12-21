import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { ArrowLeft, Loader2, Package, Truck, Calendar, ExternalLink, ChevronRight, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface OrderTracking {
    carrier: string;
    tracking_number: string;
    tracking_url: string;
    current_status: string;
    status_history: any[];
    estimated_delivery: string;
    tracking_code: string;
    service_type: string;
    updated_at: string;
}

interface Order {
    id: string;
    order_number: string;
    status: string;
    total_amount: number;
    currency: string;
    shopify_created_at: string;
    order_tracking?: OrderTracking[];
}

export default function MyOrders() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const res = await authFetch('/api/v1/orders/me');
            const data = await res.json();
            if (data.success) {
                setOrders(data.orders || []);
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
        }
    };
    const handleRefreshTracking = async (orderId: string) => {
        try {
            setRefreshing(true);
            const res = await authFetch(`/api/v1/orders/${orderId}/tracking/refresh`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                // Update the orders state with the new tracking info (handle array of guides)
                setOrders(prev => prev.map(o => {
                    if (o.id === orderId) {
                        return { ...o, order_tracking: data.all_tracking || [data.tracking] };
                    }
                    return o;
                }));
            }
        } catch (error) {
            console.error('Error refreshing tracking:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'fulfilled':
            case 'delivered':
                return { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
            case 'paid':
            case 'in_transit':
            case 'out_for_delivery':
                return { bg: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6' };
            case 'created':
                return { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
            case 'cancelled':
                return { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
            default:
                return { bg: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af' };
        }
    };

    const getStatusText = (status: string) => {
        switch (status.toLowerCase()) {
            case 'created': return 'Recibido';
            case 'paid': return 'Confirmado';
            case 'fulfilled': return 'Empacado';
            case 'in_transit': return 'En Camino';
            case 'out_for_delivery': return 'En Reparto';
            case 'delivered': return 'Entregado';
            case 'cancelled': return 'Cancelado';
            default: return status;
        }
    };

    const resolveDisplayStatus = (order: Order) => {
        if (order.status === 'cancelled') return 'cancelled';

        const trackings = order.order_tracking || [];
        if (trackings.length > 0) {
            // Prioritize tracking statuses
            if (trackings.some(t => t.current_status === 'delivered')) return 'delivered';
            if (trackings.some(t => t.current_status === 'out_for_delivery')) return 'out_for_delivery';
            if (trackings.some(t => t.current_status === 'in_transit')) return 'in_transit';
        }

        return order.status;
    };

    const selectedOrder = orders.find(o => o.id === selectedOrderId);
    const trackings = selectedOrder?.order_tracking || [];

    return (
        <Screen id="MyOrders">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-4xl mx-auto">
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-8">
                            <button
                                onClick={() => selectedOrderId ? setSelectedOrderId(null) : navigate(ROUTES.dashboard)}
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: theme.text }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>
                                    {selectedOrderId ? `Pedido ${selectedOrder?.order_number}` : 'Mis Pedidos'}
                                </h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>
                                    {selectedOrderId ? 'Detalles de seguimiento' : 'Historial de compras'}
                                </p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center">
                                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: theme.accent }} />
                                <p style={{ color: theme.textMuted }}>Cargando pedidos...</p>
                            </div>
                        ) : !selectedOrderId ? (
                            /* Orders List */
                            <div className="space-y-4">
                                {orders.length === 0 ? (
                                    <div
                                        className="p-12 text-center rounded-2xl border-2 border-dashed"
                                        style={{ borderColor: theme.border, color: theme.textMuted }}
                                    >
                                        <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p>Aún no tienes pedidos registrados</p>
                                    </div>
                                ) : (
                                    orders.map(order => (
                                        <div
                                            key={order.id}
                                            className="rounded-xl p-4 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                                            style={{
                                                backgroundColor: theme.cardBg,
                                                border: `1px solid ${theme.border}`,
                                            }}
                                            onClick={() => setSelectedOrderId(order.id)}
                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div
                                                        className="w-12 h-12 rounded-full flex items-center justify-center"
                                                        style={{ backgroundColor: `${getStatusColor(resolveDisplayStatus(order)).color}15` }}
                                                    >
                                                        <Package className="w-6 h-6" style={{ color: getStatusColor(resolveDisplayStatus(order)).color }} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold" style={{ color: theme.text }}>{order.order_number}</h3>
                                                        <div className="flex items-center gap-3 text-xs" style={{ color: theme.textMuted }}>
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" />
                                                                {new Date(order.shopify_created_at).toLocaleDateString()}
                                                            </span>
                                                            <span>
                                                                {order.total_amount} {order.currency}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="px-3 py-1 rounded-full text-xs font-bold"
                                                        style={{
                                                            backgroundColor: getStatusColor(resolveDisplayStatus(order)).bg,
                                                            color: getStatusColor(resolveDisplayStatus(order)).color,
                                                        }}
                                                    >
                                                        {getStatusText(resolveDisplayStatus(order))}
                                                    </span>
                                                    <ChevronRight className="w-5 h-5" style={{ color: theme.textMuted }} />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            /* Tracking Detail */
                            <div className="space-y-6">
                                <div
                                    className="rounded-2xl p-6 shadow-xl"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                    }}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse-slow"
                                                style={{ backgroundColor: `${theme.accent}15` }}
                                            >
                                                <Truck className="w-8 h-8" style={{ color: theme.accent }} />
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase tracking-widest font-bold" style={{ color: theme.textMuted }}>Estado del Envío</p>
                                                <h2 className="text-2xl font-black" style={{ color: theme.text }}>
                                                    {getStatusText(trackings[0]?.current_status || selectedOrder?.status || 'created')}
                                                </h2>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {trackings[0]?.tracking_url && (
                                                <a
                                                    href={trackings[0].tracking_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                                                    style={{
                                                        backgroundColor: theme.accent,
                                                        color: '#ffffff',
                                                    }}
                                                >
                                                    <ExternalLink className="w-5 h-5" />
                                                    Rastreo en vivo
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleRefreshTracking(selectedOrder!.id)}
                                                disabled={refreshing}
                                                className="p-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center hover:bg-opacity-80 disabled:opacity-50"
                                                style={{
                                                    backgroundColor: `${theme.accent}20`,
                                                    color: theme.accent,
                                                }}
                                                title="Actualizar estado"
                                            >
                                                <Clock className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    </div>

                                    {trackings.length > 0 ? (
                                        <div className="space-y-12">
                                            {trackings.map((tracking, tIndex) => (
                                                <div key={tracking.tracking_number} className="space-y-8">
                                                    {trackings.length > 1 && (
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
                                                            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.textMuted }}>
                                                                Paquete {tIndex + 1}
                                                            </span>
                                                            <div className="h-px flex-1" style={{ backgroundColor: theme.border }} />
                                                        </div>
                                                    )}

                                                    {/* Tracking Info Grid */}
                                                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="p-3 rounded-xl flex flex-col justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                            <p className="text-[10px] font-bold mb-1 opacity-60" style={{ color: theme.text }}>PAQUETERÍA</p>
                                                            <p className="text-sm font-bold truncate" style={{ color: theme.text }}>
                                                                {tracking.carrier}
                                                            </p>
                                                        </div>
                                                        <div className="p-3 rounded-xl flex flex-col justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                            <p className="text-[10px] font-bold mb-1 opacity-60" style={{ color: theme.text }}>GUÍA</p>
                                                            <p className="text-sm font-bold font-mono break-all leading-tight" style={{ color: theme.text }}>{tracking.tracking_number}</p>
                                                        </div>
                                                        {tracking.tracking_code && (
                                                            <div className="p-3 rounded-xl flex flex-col justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <p className="text-[10px] font-bold mb-1 opacity-60" style={{ color: theme.text }}>RASTREO</p>
                                                                <p className="text-sm font-bold font-mono break-all leading-tight" style={{ color: theme.text }}>{tracking.tracking_code}</p>
                                                            </div>
                                                        )}
                                                        {tracking.service_type && (
                                                            <div className="p-3 rounded-xl flex flex-col justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <p className="text-[10px] font-bold mb-1 opacity-60" style={{ color: theme.text }}>SERVICIO</p>
                                                                <p className="text-sm font-bold truncate" style={{ color: theme.text }}>{tracking.service_type}</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {tracking.estimated_delivery && (
                                                        <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed" style={{ borderColor: theme.accent, backgroundColor: `${theme.accent}05` }}>
                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.accent}15` }}>
                                                                <Calendar className="w-5 h-5" style={{ color: theme.accent }} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest" style={{ color: theme.text }}>Entrega Estimada</p>
                                                                <p className="text-lg font-black" style={{ color: theme.text }}>
                                                                    {new Date(tracking.estimated_delivery).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Timeline */}
                                                    <div className="relative pl-8 space-y-8">
                                                        {/* Vertical line */}
                                                        <div
                                                            className="absolute left-[11px] top-2 bottom-2 w-0.5"
                                                            style={{ backgroundColor: theme.border }}
                                                        />

                                                        {tracking.status_history && tracking.status_history.length > 0 ? (
                                                            tracking.status_history.map((event: any, index: number) => (
                                                                <div key={index} className="relative">
                                                                    <div
                                                                        className={`absolute -left-8 top-1.5 w-6 h-6 rounded-full border-4 flex items-center justify-center z-10 ${index === 0 ? 'animate-pulse-slow' : ''}`}
                                                                        style={{
                                                                            backgroundColor: index === 0 ? theme.accent : theme.border,
                                                                            borderColor: theme.cardBg
                                                                        }}
                                                                    >
                                                                        {index === 0 && <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-lg" style={{ color: index === 0 ? theme.accent : theme.text }}>
                                                                            {event.details || event.status || 'Actualización'}
                                                                        </span>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            {event.location && (
                                                                                <span className="text-xs px-2 py-0.5 rounded-md flex items-center gap-1" style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}>
                                                                                    <MapPin className="w-3 h-3" />
                                                                                    {event.location}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs" style={{ color: theme.textMuted }}>
                                                                                <Clock className="w-3 h-3 inline mr-1" />
                                                                                {event.timestamp}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <>
                                                                <div className="relative">
                                                                    <div
                                                                        className="absolute -left-8 top-1.5 w-6 h-6 rounded-full border-4 flex items-center justify-center z-10"
                                                                        style={{ backgroundColor: theme.accent, borderColor: theme.cardBg }}
                                                                    >
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-lg" style={{ color: theme.text }}>{getStatusText(tracking.current_status)}</span>
                                                                        <span className="text-sm" style={{ color: theme.textMuted }}>Sincronizado recientemente</span>
                                                                    </div>
                                                                </div>
                                                                <div className="relative opacity-30">
                                                                    <div
                                                                        className="absolute -left-8 top-1.5 w-6 h-6 rounded-full border-4 flex items-center justify-center z-10"
                                                                        style={{ backgroundColor: theme.border, borderColor: theme.cardBg }}
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-lg" style={{ color: theme.text }}>Pendiente de actualización</span>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-12 text-center rounded-xl bg-gray-50/50 dark:bg-black/20 border border-dashed border-gray-200 dark:border-white/10">
                                            <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: theme.textMuted }} />
                                            <p className="font-medium" style={{ color: theme.text }}>
                                                {selectedOrder?.status === 'created'
                                                    ? 'Estamos validando tu pago'
                                                    : selectedOrder?.status === 'fulfilled'
                                                        ? 'Guía generada, sincronizando...'
                                                        : 'Estamos preparando tu guía'}
                                            </p>
                                            <p className="text-sm mt-2" style={{ color: theme.textMuted }}>
                                                {selectedOrder?.status === 'created'
                                                    ? 'Una vez confirmado, procesaremos tu envío inmediatamente.'
                                                    : selectedOrder?.status === 'fulfilled'
                                                        ? 'Tu guía ya fue creada, en unos minutos podrás ver el avance aquí.'
                                                        : 'Te notificaremos por WhatsApp y Push en cuanto sea recolectado.'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Info Help */}
                                <div className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: `${theme.accent}10`, border: `1px solid ${theme.accent}20` }}>
                                    <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: theme.accent }} />
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: theme.text }}>¿Necesitas ayuda con tu pedido?</p>
                                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                                            Si tienes dudas sobre tu entrega, puedes contactarnos directamente por WhatsApp mencionando tu número de pedido <strong>{selectedOrder?.order_number}</strong>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
