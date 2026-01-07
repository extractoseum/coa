import React, { memo } from 'react';
import { MessageSquare, Instagram, Mail, User, Zap, Smile, ChevronRight } from 'lucide-react';
import type { Conversation } from '../types/crm';
import { getAvatarGradient, getTagColor } from '../utils/crmUtils';
import CardIndicators from './CardIndicators';
import { useTheme } from '../contexts/ThemeContext';

interface KanbanCardProps {
    conv: Conversation;
    isSelected: boolean;
    theme: any;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (conv: Conversation) => void;
}

const KanbanCard = memo(({ conv, isSelected, theme, onDragStart, onClick }: KanbanCardProps) => {
    const { themeMode } = useTheme();
    const isLightMode = themeMode === 'light';

    // Light mode specific styles
    const cardBg = isLightMode
        ? (isSelected ? 'bg-pink-50 border-pink-300' : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-pink-200')
        : (isSelected ? 'bg-pink-500/[0.05] border-pink-500/50' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07] hover:border-pink-500/30');

    const nameColor = isLightMode ? 'text-gray-900' : 'text-white';
    const nameHover = isLightMode ? 'group-hover:text-pink-700' : 'group-hover:text-pink-200';
    const summaryBorder = isLightMode ? 'border-gray-200' : 'border-white/5';
    const footerButtonPrimary = isLightMode ? 'text-blue-600 hover:text-blue-800' : 'text-blue-400 hover:text-blue-300';
    const footerButtonSecondary = isLightMode ? 'text-gray-600 hover:text-gray-900' : 'text-gray-400 hover:text-white';
    const ltvBadge = isLightMode
        ? 'text-green-700 bg-green-100 border-green-300'
        : 'text-green-500/80 bg-green-500/10 border-green-500/20';

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, conv.id)}
            onClick={() => onClick(conv)}
            className={`p-4 rounded-xl border backdrop-blur-md transition-all cursor-pointer group hover:scale-[1.02] active:scale-95 relative overflow-hidden
            ${cardBg}
            ${isSelected ? 'ring-2 ring-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.15)]' : 'hover:shadow-lg'}`}
            style={{
                boxShadow: isSelected ? '0 0 30px rgba(236,72,153,0.15)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
        >
            {/* Status Line for Active Cards */}
            {conv.status === 'active' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-pink-500 to-purple-600" />
            )}
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(conv.contact_handle)} p-[1px] shadow-lg shrink-0`}>
                        {conv.avatar_url ? (
                            <img
                                src={conv.avatar_url}
                                alt={conv.contact_name || conv.contact_handle}
                                className="w-full h-full rounded-full object-cover"
                                onError={(e) => {
                                    // Fallback to icon on error
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                        ) : null}
                        <div className={`w-full h-full rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center ${conv.avatar_url ? 'hidden' : ''}`}>
                            {conv.channel === 'WA' && <MessageSquare size={14} className="text-white" />}
                            {conv.channel === 'IG' && <Instagram size={14} className="text-white" />}
                            {conv.channel === 'EMAIL' && <Mail size={14} className="text-white" />}
                        </div>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-black tracking-tight truncate max-w-[140px] ${nameColor} ${nameHover} transition-colors`}>
                            {conv.contact_name || conv.facts?.user_name || conv.contact_handle}
                        </span>
                        {conv.contact_name && (
                            <span className={`text-[10px] truncate font-mono ${isLightMode ? 'text-gray-500' : 'opacity-40'}`}>{conv.contact_handle}</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-mono ${isLightMode ? 'text-gray-500' : 'opacity-40'}`} style={{ color: isLightMode ? undefined : theme.textMuted }}>
                        {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {conv.ltv && conv.ltv > 0 ? (
                        <div className="flex items-center gap-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${ltvBadge}`}>
                                ${Math.round(conv.ltv).toLocaleString()}
                            </span>
                            {conv.risk_level === 'vip' && (
                                <Zap size={10} className="text-yellow-500 animate-pulse" fill="currentColor" />
                            )}
                        </div>
                    ) : null}
                </div>
            </div>

            <p className={`text-[11px] line-clamp-2 mb-2 leading-relaxed font-light mt-2 pl-1 border-l-2 ${summaryBorder} ${isLightMode ? 'text-gray-600' : 'opacity-60'}`} style={{ color: isLightMode ? undefined : theme.text }}>
                {conv.summary}
            </p>

            {/* Phase 61: Smart Card Indicators */}
            <CardIndicators
                hoursRemaining={conv.hours_remaining}
                windowStatus={conv.window_status}
                isNewCustomer={conv.is_new_customer}
                isVip={conv.is_vip}
                isStalled={conv.is_stalled}
                awaitingResponse={conv.awaiting_response}
                healthScore={conv.health_score}
                trafficSource={conv.traffic_source}
                frictionScore={conv.facts?.friction_score}
                emotionalVibe={conv.facts?.emotional_vibe}
                openTicketsCount={conv.open_tickets_count}
            />

            <div className="flex flex-wrap gap-1">
                {conv.tags?.map(tag => (
                    <span
                        key={tag}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${getTagColor(tag, isLightMode)}`}
                    >
                        {tag}
                    </span>
                ))}
            </div>

            {/* Footer Actions */}
            <div className={`mt-4 pt-3 border-t flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity ${isLightMode ? 'border-gray-200' : ''}`} style={{ borderColor: isLightMode ? undefined : `${theme.border}55` }}>
                <div className="flex gap-2">
                    <button className={`text-[10px] uppercase font-bold ${footerButtonPrimary}`}>Resumen</button>
                    <button className={`text-[10px] uppercase font-bold ${footerButtonSecondary}`}>Mover</button>
                </div>
                <ChevronRight size={14} style={{ color: theme.accent }} />
            </div>
        </div>
    );
});

export default KanbanCard;
