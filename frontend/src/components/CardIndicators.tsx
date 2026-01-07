import React from 'react';
import { Clock, UserPlus, Star, Activity, AlertCircle, MessageCircle, Share2, Globe, Scan, Ticket } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface CardIndicatorsProps {
    hoursRemaining?: number;
    windowStatus?: 'active' | 'expired';
    isNewCustomer?: boolean;
    isVip?: boolean;
    isStalled?: boolean;
    awaitingResponse?: boolean;
    healthScore?: number;
    trafficSource?: string;
    frictionScore?: number;
    emotionalVibe?: string;
    openTicketsCount?: number;
}

const CardIndicators: React.FC<CardIndicatorsProps> = ({
    hoursRemaining = 0,
    windowStatus = 'expired',
    isNewCustomer = false,
    isVip = false,
    isStalled = false,
    awaitingResponse = false,
    healthScore = 50,
    trafficSource = 'organic',
    frictionScore = 0,
    emotionalVibe,
    openTicketsCount = 0
}) => {
    const { themeMode } = useTheme();
    const isLightMode = themeMode === 'light';

    // Determine color for the 24h window
    const getWindowColor = () => {
        if (windowStatus === 'expired') return 'text-red-600';
        if (hoursRemaining < 6) return 'text-yellow-600';
        return 'text-green-600';
    };

    // Determine health score color
    const getHealthColor = () => {
        if (healthScore > 75) return 'bg-green-500';
        if (healthScore > 40) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    // Determine friction color
    const getFrictionColor = () => {
        if (frictionScore > 70) return 'bg-red-500';
        if (frictionScore > 30) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    // Get Traffic Source Icon
    const getTrafficIcon = () => {
        const iconClass = isLightMode ? 'text-blue-600' : 'text-blue-400';
        switch (trafficSource?.toLowerCase()) {
            case 'meta':
            case 'ads':
                return <Share2 size={10} className={isLightMode ? 'text-blue-600' : 'text-blue-400'} />;
            case 'google':
                return <Globe size={10} className={isLightMode ? 'text-green-600' : 'text-green-400'} />;
            case 'web':
                return <Globe size={10} className={isLightMode ? 'text-purple-600' : 'text-purple-400'} />;
            case 'qr':
                return <Scan size={10} className={isLightMode ? 'text-orange-600' : 'text-orange-400'} />;
            default:
                return <Globe size={10} className={isLightMode ? 'text-gray-500' : 'text-gray-400 opacity-50'} />;
        }
    };

    // Badge styles that work in both light and dark mode
    const badgeStyles = {
        timer: isLightMode
            ? 'bg-gray-200 border-gray-300'
            : 'bg-black/30 border-white/5',
        nuevo: isLightMode
            ? 'bg-blue-100 border-blue-300 text-blue-700'
            : 'bg-blue-500/20 border-blue-500/30 text-blue-400',
        vip: isLightMode
            ? 'bg-yellow-100 border-yellow-400 text-yellow-700'
            : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
        pendiente: isLightMode
            ? 'bg-pink-100 border-pink-300 text-pink-700'
            : 'bg-pink-500/20 border-pink-500/30 text-pink-400',
        estancado: isLightMode
            ? 'bg-gray-200 border-gray-400 text-gray-700'
            : 'bg-gray-500/20 border-gray-500/30 text-gray-400',
        ticket: isLightMode
            ? 'bg-orange-100 border-orange-300 text-orange-700'
            : 'bg-orange-500/20 border-orange-500/30 text-orange-400',
    };

    const healthBarBg = isLightMode ? 'bg-gray-200' : 'bg-white/5';
    const containerBg = isLightMode ? 'bg-gray-100 border-gray-200' : 'bg-black/10 border-white/5';
    const labelColor = isLightMode ? 'text-gray-600' : 'text-white/30';
    const iconColor = isLightMode ? 'text-gray-500' : 'text-white/40';

    return (
        <div className="mt-2 flex flex-col gap-2">
            {/* Main Indicators Row */}
            <div className="flex flex-wrap items-center gap-2">

                {/* 24h Window Timer */}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badgeStyles.timer} ${getWindowColor()}`}>
                    <Clock size={10} />
                    <span className="text-[9px] font-black">{windowStatus === 'active' ? `${hoursRemaining}h` : 'Exp.'}</span>
                </div>

                {/* Customer Badges */}
                {isNewCustomer && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badgeStyles.nuevo}`}>
                        <UserPlus size={10} />
                        <span className="text-[9px] font-black tracking-tight">NUEVO</span>
                    </div>
                )}

                {isVip && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badgeStyles.vip}`}>
                        <Star size={10} fill="currentColor" />
                        <span className="text-[9px] font-black tracking-tight">VIP</span>
                    </div>
                )}

                {/* Status Badges */}
                {awaitingResponse && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border animate-pulse ${badgeStyles.pendiente}`}>
                        <MessageCircle size={10} />
                        <span className="text-[9px] font-black tracking-tight">PENDIENTE</span>
                    </div>
                )}

                {isStalled && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badgeStyles.estancado}`}>
                        <AlertCircle size={10} />
                        <span className="text-[9px] font-black tracking-tight uppercase">Estancado</span>
                    </div>
                )}

                {/* Open Tickets Badge */}
                {openTicketsCount > 0 && (
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${badgeStyles.ticket}`}>
                        <Ticket size={10} />
                        <span className="text-[9px] font-black tracking-tight">{openTicketsCount} TICKET{openTicketsCount > 1 ? 'S' : ''}</span>
                    </div>
                )}

                {/* Traffic Source */}
                <div className="ml-auto" title={`Source: ${trafficSource}`}>
                    {getTrafficIcon()}
                </div>
            </div>

            {/* Emotional Vibe (Secondary Indicator) */}
            {emotionalVibe && (
                <div className="flex items-center gap-1 px-1 opacity-80">
                    <span className={`text-[9px] font-black uppercase truncate max-w-[150px] ${isLightMode ? 'text-pink-600' : 'text-pink-400'}`}>
                        {emotionalVibe}
                    </span>
                </div>
            )}

            {/* Health & Friction Row */}
            <div className={`flex flex-col gap-1.5 p-1.5 rounded-md border ${containerBg}`}>
                {/* Health Bar */}
                <div className="flex items-center gap-2">
                    <Activity size={10} className={iconColor} />
                    <div className={`flex-1 h-1 rounded-full overflow-hidden ${healthBarBg}`}>
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${getHealthColor()}`}
                            style={{ width: `${healthScore}%`, boxShadow: `0 0 8px ${healthScore > 75 ? 'rgba(34,197,94,0.4)' : healthScore > 40 ? 'rgba(234,179,8,0.4)' : 'rgba(239,68,68,0.4)'}` }}
                        />
                    </div>
                    <span className={`text-[8px] font-mono truncate w-6 ${labelColor}`}>H:{healthScore}%</span>
                </div>

                {/* Friction Bar (Restored) */}
                {frictionScore > 0 && (
                    <div className="flex items-center gap-2">
                        <AlertCircle size={10} className={isLightMode ? 'text-gray-400' : 'text-white/20'} />
                        <div className={`flex-1 h-1 rounded-full overflow-hidden ${healthBarBg}`}>
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${getFrictionColor()}`}
                                style={{ width: `${frictionScore}%` }}
                            />
                        </div>
                        <span className={`text-[8px] font-mono truncate w-6 text-right ${labelColor}`}>F:{frictionScore}%</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CardIndicators;
