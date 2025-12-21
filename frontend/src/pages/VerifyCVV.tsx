import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ROUTES, to } from '../routes';
import { Screen } from '../telemetry/Screen';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, ChevronLeft, Scan } from 'lucide-react';

interface VerificationResult {
    success: boolean;
    is_valid: boolean;
    is_revoked: boolean;
    cvv_code?: string;
    scan_count?: number;
    first_scanned_at?: string;
    fraud_warning?: boolean;
    revoked_reason?: string;
    coa?: {
        public_token: string;
        batch_id: string;
        lab_name: string;
        compliance_status: string;
        created_at: string;
    };
}

export default function VerifyCVV() {
    const { cvv } = useParams<{ cvv: string }>();
    const navigate = useNavigate();
    const [result, setResult] = useState<VerificationResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!cvv) return;

        fetch(`/api/v1/verify/${cvv}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip: '', // Could add real IP tracking
                userAgent: navigator.userAgent
            })
        })
            .then(res => res.json())
            .then(data => {
                setResult(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Error al verificar el código');
                setLoading(false);
            });
    }, [cvv]);

    if (loading) {
        return (
            <Screen id="VerifyCVV_Loading">
                <div className="min-h-screen bg-gray-900 flex items-center justify-center text-emerald-500">
                    <div className="animate-pulse flex flex-col items-center">
                        <Scan className="w-10 h-10 mb-2" />
                        <span className="text-sm font-medium">Verificando código...</span>
                    </div>
                </div>
            </Screen>
        );
    }

    if (error || !result) {
        return (
            <Screen id="VerifyCVV_Error">
                <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-6">
                    <XCircle className="w-16 h-16 text-red-500 mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Error de Verificación</h2>
                    <p className="text-gray-400 mb-6 text-center">{error}</p>
                    <Link to={ROUTES.home} className="text-emerald-400 hover:text-emerald-300 flex items-center">
                        <ChevronLeft className="w-4 h-4 mr-1" /> Volver al inicio
                    </Link>
                </div>
            </Screen>
        );
    }

    // Invalid or Revoked
    if (!result.is_valid || result.is_revoked) {
        return (
            <Screen id="VerifyCVV_Invalid">
                <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-6">
                    <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl p-8 border border-red-900">
                        <div className="flex flex-col items-center text-center">
                            <div className="bg-red-900/20 rounded-full p-4 mb-4">
                                <XCircle className="w-16 h-16 text-red-500" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2 text-red-400">
                                {result.is_revoked ? 'Código Revocado' : 'Código Inválido'}
                            </h2>
                            <p className="text-gray-400 mb-6">
                                {result.is_revoked
                                    ? result.revoked_reason || 'Este código de verificación ha sido revocado.'
                                    : 'El código ingresado no es válido. Verifica que esté escrito correctamente.'}
                            </p>
                            <div className="bg-gray-900 rounded-lg p-4 w-full mb-6">
                                <span className="text-gray-500 text-sm block mb-1">CVV Verificado</span>
                                <span className="text-2xl font-mono font-bold text-white">{cvv?.toUpperCase()}</span>
                            </div>
                            <Link to={ROUTES.home} className="text-emerald-400 hover:text-emerald-300 flex items-center">
                                <ChevronLeft className="w-4 h-4 mr-1" /> Volver al inicio
                            </Link>
                        </div>
                    </div>
                </div>
            </Screen>
        );
    }

    // Valid code
    return (
        <Screen id="VerifyCVV_Success">
            <div className="min-h-screen bg-gray-900 text-white">
                <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link to={ROUTES.home} className="text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                        </Link>
                        <span className="font-bold tracking-wider text-emerald-500">VERIFICACIÓN EUM</span>
                        <div className="w-6" />
                    </div>
                </nav>

                <main className="max-w-2xl mx-auto p-4 space-y-6 py-8">
                    {/* Success Card */}
                    <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-emerald-900">
                        <div className="flex flex-col items-center text-center">
                            <div className="bg-emerald-900/20 rounded-full p-4 mb-4">
                                <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                            </div>
                            <h2 className="text-3xl font-bold mb-2 text-emerald-400">
                                Producto Auténtico Verificado
                            </h2>
                            <p className="text-gray-400 mb-6">
                                Este código de verificación es válido y corresponde a un certificado oficial.
                            </p>

                            {/* CVV Code Display */}
                            <div className="bg-gray-900 rounded-lg p-4 w-full mb-6">
                                <span className="text-gray-500 text-sm block mb-1">Código CVV</span>
                                <span className="text-3xl font-mono font-bold text-white">{result.cvv_code}</span>
                            </div>

                            {/* Scan Stats */}
                            <div className="grid grid-cols-2 gap-4 w-full mb-6">
                                <div className="bg-gray-900 rounded-lg p-4">
                                    <span className="text-gray-500 text-sm block mb-1">Verificaciones</span>
                                    <span className={`text-2xl font-bold ${result.fraud_warning ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {result.scan_count}
                                    </span>
                                </div>
                                <div className="bg-gray-900 rounded-lg p-4">
                                    <span className="text-gray-500 text-sm block mb-1">Primera Verificación</span>
                                    <span className="text-sm font-medium text-white">
                                        {result.first_scanned_at ? new Date(result.first_scanned_at).toLocaleDateString('es-MX') : 'Ahora'}
                                    </span>
                                </div>
                            </div>

                            {/* Fraud Warning */}
                            {result.fraud_warning && (
                                <div className="bg-red-900/20 border border-red-900 rounded-lg p-4 w-full mb-6">
                                    <div className="flex items-start space-x-3">
                                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                        <div className="text-left">
                                            <p className="font-semibold text-red-400 mb-1">Advertencia de Seguridad</p>
                                            <p className="text-sm text-gray-300">
                                                Este código ha sido verificado más de 5 veces. Si no esperabas esto,
                                                podría tratarse de un producto falsificado o clonado.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* COA Details */}
                            {result.coa && (
                                <div className="bg-gray-900 rounded-lg p-6 w-full space-y-3 text-left">
                                    <h3 className="font-semibold text-lg mb-4 flex items-center">
                                        <ShieldCheck className="w-5 h-5 mr-2 text-emerald-500" />
                                        Detalles del Certificado
                                    </h3>
                                    <div className="space-y-2">
                                        <div>
                                            <span className="text-gray-500 text-sm">Lote</span>
                                            <p className="font-medium">{result.coa.batch_id}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 text-sm">Laboratorio</span>
                                            <p className="font-medium">{result.coa.lab_name}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 text-sm">Estado de Cumplimiento</span>
                                            <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase ml-2
                                            ${result.coa.compliance_status === 'pass' ? 'bg-emerald-900 text-emerald-400' : 'bg-red-900 text-red-400'}
                                        `}>
                                                {result.coa.compliance_status}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => navigate(to.coa(result.coa!.public_token))}
                                        className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors"
                                    >
                                        Ver Certificado Completo
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <p className="text-sm text-gray-400 text-center">
                            ¿Tienes dudas sobre la autenticidad de este producto?{' '}
                            <a href="mailto:hola@extractoseum.com" className="text-emerald-400 hover:text-emerald-300">
                                Contáctanos
                            </a>
                        </p>
                    </div>
                </main>
            </div>
        </Screen>
    );
}
