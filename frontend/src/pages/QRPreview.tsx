import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { to } from '../routes';
import { Screen } from '../telemetry/Screen';
import { Leaf, Shield, Loader2, AlertCircle, CheckCircle, Package, FlaskConical, Hash, QrCode } from 'lucide-react';

interface QRPreviewData {
    qr_token: string;
    coa_token: string;
    name: string;
    batch: string;
    image: string | null;
    status: string;
    lab: string | null;
}

export default function QRPreview() {
    const { qr_token } = useParams<{ qr_token: string }>();
    const navigate = useNavigate();

    const [preview, setPreview] = useState<QRPreviewData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [cvv, setCvv] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [verifySuccess, setVerifySuccess] = useState(false);
    const [scanCount, setScanCount] = useState<number | null>(null);

    useEffect(() => {
        if (qr_token) {
            fetchPreview();
        }
    }, [qr_token]);

    const fetchPreview = async () => {
        try {
            const res = await fetch(`/api/v1/coas/preview/qr/${qr_token}`);
            const data = await res.json();

            if (data.success && data.preview) {
                setPreview(data.preview);
            } else {
                setError(data.error || 'Holograma no encontrado');
            }
        } catch (err) {
            setError('Error de conexion');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCVV = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cvv.trim()) return;

        setIsVerifying(true);
        setVerifyError(null);

        try {
            const res = await fetch(`/api/v1/coas/preview/qr/${qr_token}/verify-cvv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cvv: cvv.trim().toUpperCase() })
            });

            const data = await res.json();

            if (data.success && data.valid) {
                setVerifySuccess(true);
                setScanCount(data.scan_count);

                // Redirect after showing success briefly
                setTimeout(() => {
                    navigate(to.coa(preview?.coa_token!));
                }, 1500);
            } else {
                setVerifyError(data.error || 'Codigo invalido');
            }
        } catch (err) {
            setVerifyError('Error de conexion');
        } finally {
            setIsVerifying(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-white mb-2">Holograma no encontrado</h1>
                    <p className="text-gray-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <Screen id="QRPreview">
            <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-700">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-6 text-center">
                        <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                            <QrCode className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-xl font-bold tracking-wide">Verificacion de Holograma</h1>
                        <p className="text-emerald-100 text-sm mt-1">Certificado de Analisis</p>
                    </div>

                    {/* Product Preview */}
                    <div className="p-6 space-y-6">
                        {/* Product Image & Name */}
                        <div className="flex items-center gap-4">
                            {preview?.image ? (
                                <img
                                    src={preview.image}
                                    alt={preview.name}
                                    className="w-20 h-20 rounded-lg object-cover border border-gray-600"
                                />
                            ) : (
                                <div className="w-20 h-20 rounded-lg bg-gray-700 flex items-center justify-center border border-gray-600">
                                    <Package className="w-8 h-8 text-gray-500" />
                                </div>
                            )}
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-white">{preview?.name}</h2>
                                {preview?.batch && (
                                    <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                                        <Hash className="w-3 h-3" />
                                        Lote: {preview.batch}
                                    </p>
                                )}
                                {preview?.lab && (
                                    <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                                        <FlaskConical className="w-3 h-3" />
                                        {preview.lab}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Status Badge */}
                        {preview?.status && (
                            <div className={`px-4 py-2 rounded-lg text-center font-medium ${preview.status === 'pass'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : preview.status === 'fail'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                }`}>
                                {preview.status === 'pass' ? '✓ Producto Certificado' :
                                    preview.status === 'fail' ? '✗ No Cumple' : '⏳ Pendiente'}
                            </div>
                        )}

                        {/* Divider */}
                        <div className="border-t border-gray-700 pt-4">
                            <div className="flex items-center gap-2 text-gray-300 mb-4">
                                <Shield className="w-5 h-5 text-emerald-400" />
                                <span className="font-medium">Verificacion de Autenticidad</span>
                            </div>
                            <p className="text-sm text-gray-400 mb-4">
                                Raspa el area oculta de tu holograma e ingresa el codigo CVV para verificar la autenticidad del producto.
                            </p>
                        </div>

                        {/* CVV Form */}
                        {verifySuccess ? (
                            <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                                <p className="text-emerald-300 font-medium">Holograma verificado!</p>
                                <p className="text-emerald-400/70 text-sm mt-1">
                                    Redirigiendo al certificado...
                                </p>
                                {scanCount && scanCount > 1 && (
                                    <p className="text-yellow-400/70 text-xs mt-2">
                                        Este holograma ha sido verificado {scanCount} veces
                                    </p>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={handleVerifyCVV} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">
                                        Codigo CVV del holograma
                                    </label>
                                    <input
                                        type="text"
                                        value={cvv}
                                        onChange={(e) => setCvv(e.target.value.toUpperCase())}
                                        placeholder="Ej: A1B2C3D4"
                                        maxLength={12}
                                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-gray-500 text-center text-lg tracking-widest font-mono"
                                    />
                                </div>

                                {verifyError && (
                                    <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {verifyError}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isVerifying || !cvv.trim()}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isVerifying ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Verificando...
                                        </>
                                    ) : (
                                        <>
                                            <Shield className="w-5 h-5" />
                                            Verificar Holograma
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                        {/* Info */}
                        <p className="text-xs text-gray-500 text-center">
                            El codigo CVV se encuentra oculto bajo el area rascable del holograma.
                        </p>
                    </div>
                </div>
            </div>
        </Screen>
    );
}
