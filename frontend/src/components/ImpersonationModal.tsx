import { useState } from 'react';
import { X, AlertTriangle, User, Shield, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ImpersonationModalProps {
    targetClient: {
        id: string;
        name?: string;
        email?: string;
        phone?: string;
    };
    onClose: () => void;
    onSuccess: () => void;
}

export default function ImpersonationModal({ targetClient, onClose, onSuccess }: ImpersonationModalProps) {
    const { startImpersonation } = useAuth();
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const result = await startImpersonation(targetClient.id, reason || undefined);

            if (result.success) {
                onSuccess();
                onClose();
            } else {
                if (result.error === 'step_up_required') {
                    setError('Necesitas verificar tu identidad primero. Por favor inicia sesión nuevamente.');
                } else {
                    setError(result.error || 'Error al iniciar impersonación');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl w-full max-w-md border border-white/10">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                            <User className="w-5 h-5 text-red-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Impersonar Usuario</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Warning */}
                <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/20">
                    <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="text-yellow-200 font-medium">Atención</p>
                            <p className="text-yellow-200/70 mt-1">
                                Todas las acciones durante la impersonación serán registradas en el historial de auditoría.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Target User Info */}
                    <div className="p-4 bg-white/5 rounded-xl space-y-2">
                        <p className="text-sm text-gray-400">Vas a iniciar sesión como:</p>
                        <div className="space-y-1">
                            <p className="text-white font-medium">
                                {targetClient.name || 'Sin nombre'}
                            </p>
                            <p className="text-sm text-gray-400">
                                {targetClient.email || targetClient.phone || 'Sin contacto'}
                            </p>
                        </div>
                    </div>

                    {/* Session Info */}
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>La sesión expirará en 2 horas</span>
                    </div>

                    {/* Reason Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Razón (opcional)
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej: Verificar problema con pedido #1234"
                            rows={2}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 resize-none"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                            <p className="text-sm text-red-300">{error}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Iniciando...</span>
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4" />
                                    <span>Impersonar</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
