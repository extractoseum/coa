import { useState, useEffect } from 'react';
import { AlertTriangle, LogOut, Clock, User, ShoppingBag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SalesAgentPanel from './SalesAgentPanel';

export default function ImpersonationBanner() {
    const { impersonation, endImpersonation, client } = useAuth();
    const [loading, setLoading] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState('');
    const [showSalesModal, setShowSalesModal] = useState(false);

    // Calculate time remaining
    useEffect(() => {
        if (!impersonation.isImpersonating || !impersonation.expiresAt) return;

        const updateTimer = () => {
            const remaining = new Date(impersonation.expiresAt!).getTime() - Date.now();
            if (remaining <= 0) {
                setTimeRemaining('Expirado');
            } else {
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);

                if (hours > 0) {
                    setTimeRemaining(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                } else {
                    setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
                }
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [impersonation.expiresAt, impersonation.isImpersonating]);

    const handleExit = async () => {
        setLoading(true);
        try {
            await endImpersonation();
        } finally {
            setLoading(false);
        }
    };

    if (!impersonation.isImpersonating) return null;

    return (
        <>
            <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg">
                <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Sales Agent Trigger */}
                        <button
                            onClick={() => setShowSalesModal(true)}
                            className="mr-4 px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center gap-2 font-medium transition-colors"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            <span className="hidden md:inline">Crear Pedido</span>
                        </button>
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span className="font-semibold">
                                Impersonando: {client?.name || 'Usuario'}
                            </span>
                            <span className="text-sm opacity-80">
                                ({client?.email})
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {impersonation.originalAdmin && (
                            <span className="text-xs opacity-70 hidden sm:inline">
                                Admin: {impersonation.originalAdmin.name || impersonation.originalAdmin.email}
                            </span>
                        )}

                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-lg">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono text-sm">{timeRemaining}</span>
                        </div>

                        <button
                            onClick={handleExit}
                            disabled={loading}
                            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden sm:inline">
                                {loading ? 'Saliendo...' : 'Salir'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Sales Agent Modal (Sidebar) */}
            {showSalesModal && (
                <SalesAgentPanel onClose={() => setShowSalesModal(false)} />
            )}
        </>
    );
}
