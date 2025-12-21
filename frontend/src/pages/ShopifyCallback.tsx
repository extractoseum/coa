import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '../routes';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Screen } from '../telemetry/Screen';

export default function ShopifyCallback() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [searchParams] = useSearchParams();
    const { handleOAuthCallback } = useAuth();

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState('');

    useEffect(() => {
        const processCallback = async () => {
            const code = searchParams.get('code');
            const state = searchParams.get('state');
            const errorParam = searchParams.get('error');

            if (errorParam) {
                setStatus('error');
                setError(searchParams.get('error_description') || 'Error de autenticacion');
                return;
            }

            if (!code || !state) {
                setStatus('error');
                setError('Parametros de OAuth faltantes');
                return;
            }

            try {
                const result = await handleOAuthCallback(code, state);

                if (result.success) {
                    setStatus('success');
                    // Redirect after a brief success message
                    setTimeout(() => {
                        navigate(result.redirectTo || '/dashboard', { replace: true });
                    }, 1500);
                } else {
                    setStatus('error');
                    setError(result.error || 'Error procesando login');
                }
            } catch (err) {
                setStatus('error');
                setError('Error de conexion');
            }
        };

        processCallback();
    }, [searchParams, handleOAuthCallback, navigate]);

    return (
        <Screen id="ShopifyCallback">
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl border border-gray-700 p-8 text-center">
                    {status === 'loading' && (
                        <>
                            <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-white mb-2">
                                Verificando cuenta de Shopify...
                            </h2>
                            <p className="text-gray-400">
                                Por favor espera mientras confirmamos tu identidad
                            </p>
                        </>
                    )}

                    {status === 'success' && (
                        <>
                            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-white mb-2">
                                Bienvenido!
                            </h2>
                            <p className="text-gray-400">
                                Redirigiendo a tu dashboard...
                            </p>
                        </>
                    )}

                    {status === 'error' && (
                        <>
                            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-xl font-semibold text-white mb-2">
                                Error de Autenticacion
                            </h2>
                            <p className="text-gray-400 mb-6">
                                {error}
                            </p>
                            <button
                                onClick={() => navigate(ROUTES.login)}
                                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
                                style={{
                                    backgroundColor: theme.accent,
                                    color: '#ffffff'
                                }}
                            >
                                Intentar de nuevo
                            </button>
                        </>
                    )}
                </div>
            </div>
        </Screen>
    );
}
