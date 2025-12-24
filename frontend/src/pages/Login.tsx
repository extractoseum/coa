import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Leaf, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import fullLogo from '../assets/logo_full.svg';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { login, loginWithTotp, sendOTP, verifyOTP, isLoading: authLoading } = useAuth();
    const { theme, themeMode } = useTheme();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [logoSvg, setLogoSvg] = useState<string | null>(null);

    // New state for Shopify Email Modal
    const [showShopifyModal, setShowShopifyModal] = useState(false);
    const [shopifyEmail, setShopifyEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    // Authenticator Mode
    const [isAuthenticatorMode, setIsAuthenticatorMode] = useState(false);
    const [authenticatorCode, setAuthenticatorCode] = useState('');

    // Get redirect path from query params, location state, or default to dashboard
    const redirectParam = searchParams.get('redirect');
    const from = redirectParam || (location.state as any)?.from?.pathname || '/dashboard';

    // Fetch logo SVG text
    useEffect(() => {
        fetch(fullLogo)
            .then(r => r.text())
            .then(text => setLogoSvg(text))
            .catch(err => console.error('Error loading logo:', err));
    }, []);

    const getLogoColor = () => {
        switch (themeMode) {
            case 'tokyo':
                return '#00f5d4'; // Cyan neon
            case 'dark':
                return '#ffffff'; // White
            case 'light':
            default:
                return '#000000'; // Black
        }
    };

    const getThemedSvg = () => {
        if (!logoSvg) return null;
        const color = getLogoColor();

        // 1. Basic Sanitization: Remove scripts and event handlers
        let processed = logoSvg
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
            .replace(/\bon\w+="[^"]*"/gim, "")
            .replace(/javascript:/gi, "");

        processed = processed
            .replace(/fill:\s*#221914/gi, `fill: ${color}`)
            .replace(/fill="#221914"/gi, `fill="${color}"`)
            .replace(/fill="#000000"/gi, `fill="${color}"`)
            .replace(/fill="#000"/gi, `fill="${color}"`)
            .replace(/fill="black"/gi, `fill="${color}"`);

        processed = processed.replace(
            /\.st0\s*\{\s*fill:\s*#221914;\s*\}/gi,
            `.st0 { fill: ${color}; }`
        );

        return processed;
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(email, password);

        if (result.success) {
            navigate(from, { replace: true });
        } else {
            setError(result.error || 'Error al iniciar sesion');
        }

        setIsLoading(false);
    };

    const handleAuthenticatorLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await loginWithTotp(email, authenticatorCode);

        if (result.success) {
            navigate(from, { replace: true });
        } else {
            setError(result.error || 'Código inválido');
        }

        setIsLoading(false);
    };

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const result = await sendOTP(shopifyEmail);

        if (result.success) {
            setOtpSent(true);
            setIsLoading(false);
        } else {
            setError(result.error || 'Error al enviar código.');
            setIsLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        const result = await verifyOTP(shopifyEmail, otpCode);

        if (result.success) {
            navigate(from, { replace: true });
        } else {
            setError(result.error || 'Código incorrecto o expirado.');
            setIsLoading(false);
        }
    };

    if (authLoading) {
        return (
            <Layout>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
                </div>
            </Layout>
        );
    }

    return (
        <Screen id="Login">
            <Layout>
                <div className="min-h-screen flex flex-col items-center justify-center p-4 pb-24">
                    <div
                        className="max-w-md w-full rounded-2xl shadow-xl overflow-hidden relative"
                        style={{
                            backgroundColor: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        {/* Header */}
                        <div
                            className="p-6 text-center"
                            style={{
                                borderBottom: `1px solid ${theme.border}`,
                            }}
                        >
                            {logoSvg ? (
                                <div
                                    className="mx-auto h-16 mb-4 transition-all duration-300 flex items-center justify-center"
                                    dangerouslySetInnerHTML={{ __html: getThemedSvg() || '' }}
                                    style={{ maxWidth: '200px' }}
                                />
                            ) : (
                                <img
                                    src={fullLogo}
                                    alt="Extractos EUM"
                                    className="w-48 mx-auto mb-4"
                                />
                            )}
                            <p style={{ color: theme.textMuted }} className="text-sm font-medium">
                                Acceso Administrativo y Clientes
                            </p>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                            {error && !showShopifyModal && (
                                <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Validar con Shopify Button (Opens Modal) */}
                            <button
                                type="button"
                                onClick={() => setShowShopifyModal(true)}
                                disabled={isLoading}
                                className="w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 mb-4 hover:shadow-lg transform active:scale-95"
                                style={{
                                    backgroundColor: '#95BF47', // Shopify Green-ish
                                    color: '#ffffff',
                                    opacity: isLoading ? 0.7 : 1
                                }}
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Leaf className="w-5 h-5" />}
                                Ingresa con tu cuenta EUM
                            </button>

                            <div className="relative flex items-center gap-4 py-2">
                                <div className="h-px flex-1 bg-gray-700"></div>
                                <span className="text-gray-500 text-sm">O usa tu contraseña</span>
                                <div className="h-px flex-1 bg-gray-700"></div>
                            </div>

                            <div className="flex justify-end mb-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAuthenticatorMode(!isAuthenticatorMode);
                                        setError('');
                                    }}
                                    className="text-xs hover:underline"
                                    style={{ color: theme.accent }}
                                >
                                    {isAuthenticatorMode ? 'Volver a Opciones' : 'Soy Super Admin (Authenticator)'}
                                </button>
                            </div>

                            {!isAuthenticatorMode ? (
                                <div className="text-center py-8 space-y-4">
                                    <p style={{ color: theme.textMuted }}>
                                        Selecciona el método de acceso seguro
                                    </p>
                                </div>
                            ) : (
                                // Authenticator Login Form
                                <form onSubmit={handleAuthenticatorLogin} className="space-y-4">
                                    <div>
                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                            Correo Electronico
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: theme.textMuted }} />
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="admin@email.com"
                                                required
                                                className="w-full pl-10 pr-4 py-3 rounded-lg focus:outline-none transition-all"
                                                style={{
                                                    backgroundColor: theme.cardBg2,
                                                    border: `1px solid ${theme.border}`,
                                                    color: theme.text,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                            Código Authenticator (6 dígitos)
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: theme.textMuted }} />
                                            <input
                                                type="text"
                                                value={authenticatorCode}
                                                onChange={(e) => setAuthenticatorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                placeholder="123456"
                                                required
                                                maxLength={6}
                                                className="w-full pl-10 pr-4 py-3 rounded-lg focus:outline-none transition-all tracking-[0.5em] font-mono text-center text-lg"
                                                style={{
                                                    backgroundColor: theme.cardBg2,
                                                    border: `1px solid ${theme.border}`,
                                                    color: theme.text,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading || !email || authenticatorCode.length < 6}
                                        className="w-full font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2"
                                        style={{
                                            backgroundColor: isLoading || !email || authenticatorCode.length < 6 ? theme.border : theme.accent,
                                            color: '#ffffff',
                                            cursor: isLoading || !email || authenticatorCode.length < 6 ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Verificando...
                                            </>
                                        ) : (
                                            'Entrar con Authenticator'
                                        )}
                                    </button>
                                </form>
                            )}

                            <div className="text-center space-y-2">
                                <p className="text-xs text-gray-500">
                                    La validación con Shopify no requiere contraseña.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="text-sm transition-colors hover:opacity-80 block w-full"
                                    style={{ color: theme.textMuted }}
                                >
                                    Volver al inicio
                                </button>
                            </div>
                        </div>

                        {/* Shopify Email Modal Overlay */}
                        {showShopifyModal && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                                <div
                                    className="w-full max-w-sm rounded-xl p-6 relative shadow-2xl"
                                    style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                                >
                                    <button
                                        onClick={() => {
                                            setShowShopifyModal(false);
                                            setOtpSent(false);
                                            setOtpCode('');
                                            setError('');
                                        }}
                                        className="absolute top-4 right-4 transition-colors"
                                        style={{ color: theme.textMuted }}
                                    >
                                        ✕
                                    </button>

                                    <h3 className="text-xl font-bold mb-2 text-center" style={{ color: theme.text }}>Validar Cuenta</h3>
                                    <p className="text-sm mb-6 text-center" style={{ color: theme.textMuted }}>
                                        {otpSent
                                            ? `Ingresa el código enviado a ${shopifyEmail}`
                                            : 'Ingresa tu correo registrado para recibir un código de acceso.'}
                                    </p>

                                    {error && (
                                        <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-300 px-3 py-2 rounded text-xs text-center">
                                            {error}
                                        </div>
                                    )}

                                    {!otpSent ? (
                                        <form onSubmit={handleSendOTP} className="space-y-4">
                                            <div>
                                                <input
                                                    type="text"
                                                    value={shopifyEmail}
                                                    onChange={(e) => setShopifyEmail(e.target.value)}
                                                    placeholder="Correo o Teléfono (10 dígitos)"
                                                    autoFocus
                                                    required
                                                    className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all"
                                                    style={{
                                                        backgroundColor: theme.cardBg2,
                                                        border: `1px solid ${theme.border}`,
                                                        color: theme.text,
                                                    }}
                                                />
                                                <p className="text-xs text-center mt-2" style={{ color: theme.textMuted }}>
                                                    Te enviaremos un código por WhatsApp, SMS o Email.
                                                </p>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isLoading || !shopifyEmail}
                                                className="w-full py-3 rounded-lg font-bold text-white transition-all transform active:scale-95"
                                                style={{ backgroundColor: '#95BF47' }}
                                            >
                                                {isLoading ? <Loader2 className="inline w-5 h-5 animate-spin" /> : 'Enviar Código'}
                                            </button>
                                        </form>
                                    ) : (
                                        <form onSubmit={handleVerifyOTP} className="space-y-4">
                                            <div>
                                                <input
                                                    type="text"
                                                    value={otpCode}
                                                    onChange={(e) => setOtpCode(e.target.value)}
                                                    placeholder="123456"
                                                    autoFocus
                                                    required
                                                    maxLength={6}
                                                    className="w-full px-4 py-3 rounded-lg focus:outline-none transition-all text-center text-2xl tracking-widest font-mono"
                                                    style={{
                                                        backgroundColor: theme.cardBg2,
                                                        border: `1px solid ${theme.border}`,
                                                        color: theme.text,
                                                    }}
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={isLoading || otpCode.length < 6}
                                                className="w-full py-3 rounded-lg font-bold text-white transition-all transform active:scale-95"
                                                style={{ backgroundColor: '#95BF47' }}
                                            >
                                                {isLoading ? <Loader2 className="inline w-5 h-5 animate-spin" /> : 'Verificar y Entrar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setOtpSent(false)}
                                                className="block w-full text-center text-xs hover:opacity-80 mt-2 transition-opacity"
                                                style={{ color: theme.textMuted }}
                                            >
                                                Cambiar correo
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
