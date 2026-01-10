/**
 * AraAuthGate - OTP authentication modal for widget
 *
 * Prompts user for phone/email and verifies OTP code.
 */

import React, { useState } from 'react';
import { X, Mail, Phone, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface AraAuthGateProps {
    onSuccess: () => void;
    onClose: () => void;
    sendOTP: (identifier: string) => Promise<{ success: boolean; channel?: string; error?: string }>;
    verifyOTP: (identifier: string, code: string) => Promise<{ success: boolean; error?: string }>;
}

type Step = 'identifier' | 'otp' | 'success';

const AraAuthGate: React.FC<AraAuthGateProps> = ({ onSuccess, onClose, sendOTP, verifyOTP }) => {
    const { theme } = useTheme();
    const [step, setStep] = useState<Step>('identifier');
    const [identifier, setIdentifier] = useState('');
    const [code, setCode] = useState('');
    const [channel, setChannel] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEmail = identifier.includes('@');

    const handleSendOTP = async () => {
        if (!identifier.trim()) {
            setError('Ingresa tu email o teléfono');
            return;
        }

        setIsLoading(true);
        setError(null);

        const result = await sendOTP(identifier.trim());

        setIsLoading(false);

        if (result.success) {
            setChannel(result.channel || (isEmail ? 'email' : 'sms'));
            setStep('otp');
        } else {
            setError(result.error || 'Error enviando código');
        }
    };

    const handleVerifyOTP = async () => {
        if (!code.trim() || code.length !== 6) {
            setError('Ingresa el código de 6 dígitos');
            return;
        }

        setIsLoading(true);
        setError(null);

        const result = await verifyOTP(identifier.trim(), code.trim());

        setIsLoading(false);

        if (result.success) {
            setStep('success');
            setTimeout(() => {
                onSuccess();
            }, 1000);
        } else {
            setError(result.error || 'Código incorrecto');
        }
    };

    const getChannelText = () => {
        switch (channel) {
            case 'whatsapp': return 'WhatsApp';
            case 'sms': return 'SMS';
            case 'voice': return 'llamada';
            default: return 'correo';
        }
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
            <div
                className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
                style={{ backgroundColor: theme.cardBg }}
            >
                {/* Header */}
                <div
                    className="p-4 flex items-center justify-between"
                    style={{
                        background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentSecondary || theme.accent})`
                    }}
                >
                    <h2 className="text-white font-semibold">Verificar identidad</h2>
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {step === 'identifier' && (
                        <div className="space-y-4">
                            <p className="text-sm" style={{ color: theme.textMuted }}>
                                Ingresa tu email o teléfono para verificar tu cuenta y chatear con Ara.
                            </p>

                            <div className="relative">
                                <div
                                    className="absolute left-3 top-1/2 -translate-y-1/2"
                                    style={{ color: theme.textMuted }}
                                >
                                    {isEmail ? <Mail size={18} /> : <Phone size={18} />}
                                </div>
                                <input
                                    type={isEmail ? 'email' : 'tel'}
                                    value={identifier}
                                    onChange={(e) => {
                                        setIdentifier(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="tu@email.com o 5512345678"
                                    className="w-full pl-10 pr-4 py-3 rounded-lg border outline-none transition-colors"
                                    style={{
                                        backgroundColor: theme.cardBg2,
                                        borderColor: error ? '#ef4444' : theme.border,
                                        color: theme.text
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = theme.accent}
                                    onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : theme.border}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-500">{error}</p>
                            )}

                            <button
                                onClick={handleSendOTP}
                                disabled={isLoading || !identifier.trim()}
                                className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                style={{
                                    backgroundColor: theme.accent,
                                    color: 'white'
                                }}
                            >
                                {isLoading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <>
                                        Enviar código
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {step === 'otp' && (
                        <div className="space-y-4">
                            <p className="text-sm" style={{ color: theme.textMuted }}>
                                Te enviamos un código por {getChannelText()} a{' '}
                                <span style={{ color: theme.text }}>{identifier}</span>
                            </p>

                            <div>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                        setCode(val);
                                        setError(null);
                                    }}
                                    placeholder="000000"
                                    className="w-full text-center text-2xl tracking-[0.5em] py-4 rounded-lg border outline-none transition-colors font-mono"
                                    style={{
                                        backgroundColor: theme.cardBg2,
                                        borderColor: error ? '#ef4444' : theme.border,
                                        color: theme.text
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = theme.accent}
                                    onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : theme.border}
                                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyOTP()}
                                    autoFocus
                                    maxLength={6}
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-500">{error}</p>
                            )}

                            <button
                                onClick={handleVerifyOTP}
                                disabled={isLoading || code.length !== 6}
                                className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                style={{
                                    backgroundColor: theme.accent,
                                    color: 'white'
                                }}
                            >
                                {isLoading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    'Verificar'
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    setStep('identifier');
                                    setCode('');
                                    setError(null);
                                }}
                                className="w-full py-2 text-sm transition-colors"
                                style={{ color: theme.textMuted }}
                            >
                                Cambiar email/teléfono
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-6 space-y-4">
                            <div
                                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                                style={{ backgroundColor: `${theme.accent}22` }}
                            >
                                <CheckCircle size={32} style={{ color: theme.accent }} />
                            </div>
                            <div>
                                <p className="font-medium" style={{ color: theme.text }}>
                                    ¡Verificado!
                                </p>
                                <p className="text-sm" style={{ color: theme.textMuted }}>
                                    Ya puedes chatear con Ara
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AraAuthGate;
