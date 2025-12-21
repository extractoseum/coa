import { useState } from 'react';
import { X, Mail, Phone, Loader2, CheckCircle, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface QuickRegisterModalProps {
    onClose: () => void;
    onSuccess?: () => void;
    title?: string;
    subtitle?: string;
}

export default function QuickRegisterModal({
    onClose,
    onSuccess,
    title = 'Crea tu cuenta',
    subtitle = 'Ingresa tu email o telefono para continuar'
}: QuickRegisterModalProps) {
    const { quickRegister } = useAuth();
    const { theme } = useTheme();
    const [identifier, setIdentifier] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [isNewUser, setIsNewUser] = useState(false);

    const isEmail = identifier.includes('@');
    const isPhone = /^[\d\s+()-]+$/.test(identifier) && identifier.length >= 10;
    const isValid = identifier.length > 0 && (isEmail || isPhone);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid || loading) return;

        setLoading(true);
        setError(null);

        const result = await quickRegister(identifier);

        if (result.success) {
            setSuccess(true);
            setIsNewUser(result.isNewUser || false);
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1500);
        } else {
            setError(result.error || 'Error al registrar');
        }

        setLoading(false);
    };

    if (success) {
        return (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                <div
                    className="rounded-xl border p-6 w-full max-w-sm text-center"
                    style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.border
                    }}
                >
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-400" />
                    <h3 className="text-xl font-semibold mb-2" style={{ color: theme.text }}>
                        {isNewUser ? 'Bienvenido!' : 'Bienvenido de vuelta!'}
                    </h3>
                    <p style={{ color: theme.textMuted }}>
                        {isNewUser
                            ? 'Tu cuenta ha sido creada exitosamente'
                            : 'Has iniciado sesion correctamente'
                        }
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                className="rounded-xl border p-6 w-full max-w-sm"
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
                            <User className="w-5 h-5" style={{ color: theme.accent }} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                                {title}
                            </h3>
                            <p className="text-sm" style={{ color: theme.textMuted }}>
                                {subtitle}
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

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                {isEmail ? (
                                    <Mail className="w-5 h-5" style={{ color: theme.textMuted }} />
                                ) : (
                                    <Phone className="w-5 h-5" style={{ color: theme.textMuted }} />
                                )}
                            </div>
                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                placeholder="Email o telefono"
                                className="w-full pl-11 pr-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-all"
                                style={{
                                    backgroundColor: theme.cardBg2,
                                    borderColor: error ? '#ef4444' : theme.border,
                                    color: theme.text
                                }}
                                disabled={loading}
                                autoFocus
                            />
                        </div>
                        {error && (
                            <p className="mt-2 text-sm text-red-400">{error}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={!isValid || loading}
                        className="w-full py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2"
                        style={{
                            backgroundColor: isValid ? theme.accent : theme.cardBg2,
                            color: isValid ? '#ffffff' : theme.textMuted,
                            cursor: isValid && !loading ? 'pointer' : 'not-allowed'
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            'Continuar'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <p className="mt-4 text-xs text-center" style={{ color: theme.textMuted }}>
                    Al continuar aceptas los terminos de uso.
                    {' '}
                    {isEmail ? (
                        <span>Si ya tienes cuenta con este email, iniciaras sesion automaticamente.</span>
                    ) : isPhone ? (
                        <span>Si ya tienes cuenta con este telefono, iniciaras sesion automaticamente.</span>
                    ) : (
                        <span>Si ya tienes cuenta, iniciaras sesion automaticamente.</span>
                    )}
                </p>
            </div>
        </div>
    );
}
