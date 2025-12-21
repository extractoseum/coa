import { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, Loader2, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface StepUpModalProps {
    onClose: () => void;
    onSuccess: () => void;
    actionLabel?: string;
}

export default function StepUpModal({
    onClose,
    onSuccess,
    actionLabel = 'Realizar acción segura'
}: StepUpModalProps) {
    const { client, sendOTP, verifyOTP } = useAuth();
    const { theme } = useTheme();

    const [step, setStep] = useState<'init' | 'verify'>('init');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendTimer, setResendTimer] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [step]);

    // Timer countdown
    useEffect(() => {
        if (resendTimer > 0) {
            const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendTimer]);

    const handleSendOTP = async () => {
        if (!client?.email) {
            setError('No hay email asociado a la cuenta');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await sendOTP(client.email);
            if (res.success) {
                setStep('verify');
                setResendTimer(60); // 60 seconds cooldown
            } else {
                setError(res.error || 'Error al enviar código');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (code.length < 6 || loading) return;

        if (!client?.email) return;

        setLoading(true);
        setError(null);

        try {
            const res = await verifyOTP(client.email, code);
            if (res.success) {
                // Success!
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 500);
            } else {
                setError(res.error || 'Código inválido');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div
                className="rounded-xl border p-6 w-full max-w-sm relative overflow-hidden"
                style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.border
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: `${theme.accent}20` }}
                        >
                            <ShieldCheck className="w-5 h-5" style={{ color: theme.accent }} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                                Verificación de Seguridad
                            </h3>
                            <p className="text-xs" style={{ color: theme.textMuted }}>
                                {actionLabel}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-gray-700/50 transition-colors"
                    >
                        <X className="w-5 h-5" style={{ color: theme.textMuted }} />
                    </button>
                </div>

                <div className="mb-6">
                    {step === 'init' ? (
                        <div className="text-center space-y-4">
                            <p className="text-sm" style={{ color: theme.text }}>
                                Para continuar, necesitamos verificar tu identidad.
                                Enviaremos un código a:
                            </p>
                            <p className="font-mono bg-gray-800/50 py-2 rounded border border-gray-700">
                                {client?.email}
                            </p>
                            <button
                                onClick={handleSendOTP}
                                disabled={loading}
                                className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90"
                                style={{
                                    backgroundColor: theme.accent,
                                    color: '#fff'
                                }}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Enviar Código de Seguridad
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleVerify} className="space-y-4">
                            <div>
                                <label className="block text-xs mb-1 ml-1" style={{ color: theme.textMuted }}>
                                    Código de 6 dígitos
                                </label>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="000000"
                                    className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-lg border focus:outline-none focus:ring-2 transition-all font-mono"
                                    style={{
                                        backgroundColor: theme.cardBg2,
                                        borderColor: error ? '#ef4444' : theme.border,
                                        color: theme.text
                                    }}
                                    disabled={loading}
                                    maxLength={6}
                                />
                            </div>

                            {error && (
                                <p className="text-xs text-red-400 text-center animate-pulse">
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={code.length < 6 || loading}
                                className="w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                                style={{
                                    backgroundColor: code.length === 6 ? theme.accent : theme.cardBg2,
                                    color: code.length === 6 ? '#fff' : theme.textMuted,
                                    cursor: code.length === 6 ? 'pointer' : 'not-allowed'
                                }}
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                Verificar
                            </button>

                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={handleSendOTP}
                                    disabled={loading || resendTimer > 0}
                                    className="text-xs hover:underline disabled:no-underline disabled:opacity-50"
                                    style={{ color: theme.textMuted }}
                                >
                                    {resendTimer > 0
                                        ? `Reenviar en ${resendTimer}s`
                                        : '¿No recibiste el código? Reenviar'
                                    }
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
