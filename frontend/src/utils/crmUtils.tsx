import React from 'react';
import { MessageSquare, Instagram, Facebook, Globe, Mail } from 'lucide-react';

export const getTagColor = (tag: string) => {
    const t = tag.toLowerCase();
    if (t.includes('gold')) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.2)]';
    if (t.includes('partner')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]';
    if (t.includes('user')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (t.includes('shop')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (t.includes('vip')) return 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-white border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.3)] animate-pulse';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
};

export const getAvatarGradient = (handle: string) => {
    const colors = [
        'from-pink-500 to-purple-600',
        'from-blue-500 to-cyan-400',
        'from-emerald-500 to-green-400',
        'from-orange-500 to-red-500',
        'from-indigo-500 to-purple-500'
    ];
    const index = handle.length % colors.length;
    return colors[index];
};

export const getChannelIcon = (channel: string) => {
    switch (channel) {
        case 'WA': return <MessageSquare size={ 14 } className = "text-green-500" />;
        case 'IG': return <Instagram size={ 14 } className = "text-pink-500" />;
        case 'FB': return <Facebook size={ 14 } className = "text-blue-600" />;
        case 'EMAIL': return <Mail size={ 14 } className = "text-white" />;
        default: return <Globe size={ 14 } />;
    }
};
