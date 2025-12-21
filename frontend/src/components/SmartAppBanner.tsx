import { useState, useEffect } from 'react';
import { X, Smartphone, Apple, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Link } from 'react-router-dom';

interface SmartAppBannerProps {
    onClose?: () => void;
}

export const SmartAppBanner = ({ onClose }: SmartAppBannerProps) => {
    const { theme } = useTheme();
    const [isVisible, setIsVisible] = useState(true);
    const [deviceType, setDeviceType] = useState<'ios' | 'android' | 'desktop'>('desktop');

    useEffect(() => {
        const ua = navigator.userAgent.toLowerCase();
        if (/iphone|ipad|ipod/.test(ua)) {
            setDeviceType('ios');
        } else if (/android/.test(ua)) {
            setDeviceType('android');
        }
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        localStorage.setItem('swis_banner_dismissed', 'true');
        if (onClose) onClose();
    };

    // Don't show if dismissed recently (simple logic)
    useEffect(() => {
        if (localStorage.getItem('swis_banner_dismissed')) {
            setIsVisible(false);
        }
    }, []);

    if (!isVisible) return null;

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-50 p-4 border-t shadow-2xl transition-transform duration-300 transform translate-y-0"
            style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.border,
                borderTopWidth: '1px'
            }}
        >
            <div className="max-w-4xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                        style={{ backgroundColor: theme.bg }}
                    >
                        {/* App Icon Placeholder */}
                        <div className="text-2xl font-bold" style={{ color: theme.accent }}>S</div>
                    </div>
                    <div>
                        <h4 className="font-bold text-sm" style={{ color: theme.text }}>
                            SWIS Watch App
                        </h4>
                        <p className="text-xs opacity-80" style={{ color: theme.textMuted }}>
                            {deviceType === 'ios' && 'Disponible en iOS (TestFlight)'}
                            {deviceType === 'android' && 'Disponible para Android'}
                            {deviceType === 'desktop' && 'Descarga la App Móvil'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link
                        to="/app"
                        className="px-4 py-2 rounded-lg font-bold text-xs shadow-lg transition-transform active:scale-95"
                        style={{
                            backgroundColor: theme.accent,
                            color: '#000'
                        }}
                    >
                        {deviceType === 'desktop' ? 'Ver QR' : 'Instalar'}
                    </Link>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                    >
                        <X size={16} style={{ color: theme.textMuted }} />
                    </button>
                </div>
            </div>
        </div>
    );
};
