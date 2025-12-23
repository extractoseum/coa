import { useEffect, useState } from 'react';
import { Apple, Smartphone, Monitor, ChevronRight, ShieldCheck, Zap, Download } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import QRCode from 'react-qr-code';
import { trackEvent } from '../services/telemetryService';

export default function DownloadApp() {
    const { theme } = useTheme();
    const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

    useEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        if (/iphone|ipad|ipod/.test(ua)) {
            setDeviceType('ios');
        } else if (/android/.test(ua)) {
            setDeviceType('android');
        }
    }, []);

    const iOSLink = "https://testflight.apple.com/join/YOUR_TESTFLIGHT_ID"; // Placeholder
    const androidLink = "/android/eum-viewer-2.0.apk"; // Direct APK download

    return (
        <Layout>
            <div className="min-h-screen py-12 px-4" style={{ backgroundColor: theme.bg, color: theme.text }}>
                <div className="max-w-md mx-auto space-y-8">

                    {/* Hero Section */}
                    <div className="text-center space-y-4">
                        <div
                            className="w-24 h-24 mx-auto rounded-3xl flex items-center justify-center shadow-2xl mb-6 relative overflow-hidden"
                            style={{
                                background: `linear-gradient(135deg, ${theme.accent}20, ${theme.bg})`,
                                border: `1px solid ${theme.border}`
                            }}
                        >
                            <span className="text-5xl font-black" style={{ color: theme.accent }}>S</span>
                            {/* Shine effect */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
                        </div>

                        <h1 className="text-3xl font-black tracking-tight">
                            EUM Viewer <span style={{ color: theme.accent }}>2.0</span>
                        </h1>
                        <p className="text-sm opacity-70 leading-relaxed">
                            La herramienta definitiva de integridad y control para laboratorios modernos.
                            Más rápido, más seguro y siempre contigo.
                        </p>
                    </div>

                    {/* Dynamic Download Card */}
                    <div
                        className="p-1 rounded-2xl shadow-2xl relative overflow-hidden group"
                        style={{
                            background: `linear-gradient(to bottom right, ${theme.accent}, ${theme.accent}40)`
                        }}
                    >
                        <div
                            className="bg-black/80 backdrop-blur-xl p-6 rounded-xl flex flex-col items-center text-center space-y-4 h-full"
                            style={{ backgroundColor: theme.cardBg }}
                        >
                            {deviceType === 'ios' && (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                                        <Apple className="w-8 h-8 text-blue-500" />
                                    </div>
                                    <h3 className="font-bold text-lg">Instalar en iPhone</h3>
                                    <p className="text-xs opacity-60">
                                        Versión Beta disponible vía TestFlight.
                                        Acceso anticipado exclusivo.
                                    </p>
                                    <a
                                        href={iOSLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackEvent('app_download_click', { os: 'ios', version: '2.0-beta' })}
                                        className="w-full py-3 rounded-lg font-bold text-sm bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} />
                                        Obtener en TestFlight
                                    </a>
                                </>
                            )}

                            {deviceType === 'android' && (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                                        <Smartphone className="w-8 h-8 text-green-500" />
                                    </div>
                                    <h3 className="font-bold text-lg">Instalar en Android</h3>
                                    <p className="text-xs opacity-60">
                                        Descarga directa del APK seguro.
                                        Compatible con Android 10+.
                                    </p>
                                    <a
                                        href={androidLink}
                                        onClick={() => trackEvent('app_download_click', { os: 'android', version: '2.0' })}
                                        className="w-full py-3 rounded-lg font-bold text-sm bg-green-600 text-white shadow-lg hover:bg-green-500 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} />
                                        Descargar APK
                                    </a>
                                </>
                            )}

                            {deviceType === 'desktop' && (
                                <>
                                    <div className="p-4 bg-white rounded-xl mb-4">
                                        <QRCode
                                            value={window.location.href}
                                            size={160}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 text-sm opacity-80">
                                        <Smartphone size={16} />
                                        <span>Escanea con tu celular</span>
                                    </div>
                                </>
                            )}

                        </div>
                    </div>

                    {/* Features List */}
                    <div className="space-y-4 pt-4">
                        <FeatureRow
                            icon={<Zap size={18} />}
                            title="Velocidad Nativa"
                            desc="Carga instantánea de certificados."
                            theme={theme}
                        />
                        <FeatureRow
                            icon={<ShieldCheck size={18} />}
                            title="Verificación Offline"
                            desc="Accede a tus documentos sin internet."
                            theme={theme}
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
}

const FeatureRow = ({ icon, title, desc, theme }: any) => (
    <div className="flex items-start gap-4 p-4 rounded-xl border transition-colors" style={{ borderColor: theme.border, backgroundColor: theme.cardBg2 }}>
        <div className="mt-1" style={{ color: theme.accent }}>{icon}</div>
        <div>
            <h4 className="font-bold text-sm mb-0.5">{title}</h4>
            <p className="text-xs opacity-60">{desc}</p>
        </div>
    </div>
);
