import React from 'react';
import { Clock, UserPlus, Star, Activity, AlertCircle, MessageCircle, Share2, Globe, Scan, Ticket } from 'lucide-react';

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
    // Determine color for the 24h window
    const getWindowColor = () => {
        if (windowStatus === 'expired') return 'text-red-500';
        if (hoursRemaining < 6) return 'text-yellow-500';
        return 'text-green-500';
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
        switch (trafficSource?.toLowerCase()) {
            case 'meta':
            case 'ads':
                return <Share2 size={10} className="text-blue-400" />;
            case 'google':
                return <Globe size={10} className="text-green-400" />;
            case 'web':
                return <Globe size={10} className="text-purple-400" />;
            case 'qr':
                return <Scan size={10} className="text-orange-400" />;
            default:
                return <Globe size={10} className="text-gray-400 opacity-50" />;
        }
    };

    return (
        <div className="mt-2 flex flex-col gap-2">
            {/* Main Indicators Row */}
            <div className="flex flex-wrap items-center gap-2">

                {/* 24h Window Timer */}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/30 border border-white/5 ${getWindowColor()}`}>
                    <Clock size={10} />
                    <span className="text-[9px] font-black">{windowStatus === 'active' ? `${hoursRemaining}h` : 'Exp.'}</span>
                </div>

                {/* Customer Badges */}
                {isNewCustomer && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <UserPlus size={10} />
                        <span className="text-[9px] font-black tracking-tight">NUEVO</span>
                    </div>
                )}

                {isVip && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
                        <Star size={10} fill="currentColor" />
                        <span className="text-[9px] font-black tracking-tight">VIP</span>
                    </div>
                )}

                {/* Status Badges */}
                {awaitingResponse && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/10 border border-pink-500/20 text-pink-500 animate-pulse">
                        <MessageCircle size={10} />
                        <span className="text-[9px] font-black tracking-tight">PENDIENTE</span>
                    </div>
                )}

                {isStalled && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-500/10 border border-gray-500/20 text-gray-400">
                        <AlertCircle size={10} />
                        <span className="text-[9px] font-black tracking-tight uppercase">Estancado</span>
                    </div>
                )}

                {/* Open Tickets Badge */}
                {openTicketsCount > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400">
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
                    <span className="text-[9px] font-black uppercase text-pink-400 truncate max-w-[150px]">
                        {emotionalVibe}
                    </span>
                </div>
            )}

            {/* Health & Friction Row */}
            <div className="flex flex-col gap-1.5 bg-black/10 p-1.5 rounded-md border border-white/5">
                {/* Health Bar */}
                <div className="flex items-center gap-2">
                    <Activity size={10} className="text-white/40" />
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${getHealthColor()}`}
                            style={{ width: `${healthScore}%`, boxShadow: `0 0 8px ${healthScore > 75 ? 'rgba(34,197,94,0.4)' : healthScore > 40 ? 'rgba(234,179,8,0.4)' : 'rgba(239,68,68,0.4)'}` }}
                        />
                    </div>
                    <span className="text-[8px] font-mono text-white/30 truncate w-6">H:{healthScore}%</span>
                </div>

                {/* Friction Bar (Restored) */}
                {frictionScore > 0 && (
                    <div className="flex items-center gap-2">
                        <AlertCircle size={10} className="text-white/20" />
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${getFrictionColor()}`}
                                style={{ width: `${frictionScore}%` }}
                            />
                        </div>
                        <span className="text-[8px] font-mono text-white/30 truncate w-6 text-right">F:{frictionScore}%</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CardIndicators;
