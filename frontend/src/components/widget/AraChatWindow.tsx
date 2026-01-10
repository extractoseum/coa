/**
 * AraChatWindow - Main chat UI component
 *
 * Displays messages and input field for chatting with Ara.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bell, ChevronDown, User, Bot, AlertCircle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import type { Notification } from './hooks/useNotifications';

interface ChatMessage {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    createdAt: string;
    isTemp?: boolean;
}

interface AraChatWindowProps {
    messages: ChatMessage[];
    isLoading: boolean;
    isSending: boolean;
    error: string | null;
    onSend: (text: string) => void;
    onClose: () => void;
    onMinimize: () => void;
    clientName?: string;
    notifications: Notification[];
    unreadCount: number;
    onNotificationClick: (notification: Notification) => void;
    clearError: () => void;
}

const AraChatWindow: React.FC<AraChatWindowProps> = ({
    messages,
    isLoading,
    isSending,
    error,
    onSend,
    onClose,
    onMinimize,
    clientName,
    notifications,
    unreadCount,
    onNotificationClick,
    clearError
}) => {
    const { theme } = useTheme();
    const [input, setInput] = useState('');
    const [showNotifications, setShowNotifications] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSend = () => {
        if (!input.trim() || isSending) return;
        onSend(input.trim());
        setInput('');
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Hoy';
        if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    };

    return (
        <div
            className="fixed inset-x-0 top-0 bottom-20 pb-20 sm:pb-0 sm:absolute sm:inset-auto sm:bottom-full sm:right-0 sm:mb-4 z-[10000] flex flex-col sm:w-96 sm:h-[500px] sm:max-h-[80vh] sm:rounded-2xl shadow-2xl overflow-hidden border border-white/10"
            style={{
                backgroundColor: theme.cardBg,
                borderColor: theme.border
            }}
        >
            {/* Header */}
            <div
                className="p-4 flex items-center justify-between shrink-0"
                style={{
                    background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentSecondary || theme.accent})`
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <Bot size={22} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-white font-semibold">Ara</h2>
                        <p className="text-white/70 text-xs">
                            {clientName ? `Hola, ${clientName.split(' ')[0]}` : 'Tu asistente EUM'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Notifications Bell */}
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <Bell size={18} className="text-white" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={onMinimize}
                        className="p-2 rounded-full hover:bg-white/10 transition-colors sm:block hidden"
                    >
                        <ChevronDown size={18} className="text-white" />
                    </button>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <X size={18} className="text-white" />
                    </button>
                </div>
            </div>

            {/* Notifications Panel */}
            {showNotifications && (
                <div
                    className="absolute top-16 left-4 right-4 max-h-64 overflow-y-auto rounded-lg shadow-lg z-10"
                    style={{ backgroundColor: theme.cardBg2 }}
                >
                    <div className="p-3 border-b" style={{ borderColor: theme.border }}>
                        <h3 className="font-medium text-sm" style={{ color: theme.text }}>
                            Notificaciones
                        </h3>
                    </div>
                    {notifications.length === 0 ? (
                        <div className="p-4 text-center text-sm" style={{ color: theme.textMuted }}>
                            No tienes notificaciones
                        </div>
                    ) : (
                        <div className="divide-y" style={{ borderColor: theme.border }}>
                            {notifications.slice(0, 5).map(n => (
                                <div
                                    key={n.id}
                                    onClick={() => {
                                        onNotificationClick(n);
                                        setShowNotifications(false);
                                    }}
                                    className="p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                    style={{
                                        backgroundColor: n.is_read ? 'transparent' : `${theme.accent}11`
                                    }}
                                >
                                    <p className="text-sm font-medium" style={{ color: theme.text }}>
                                        {n.title}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: theme.textMuted }}>
                                        {n.body}
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                                        {formatDate(n.created_at)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Messages Area */}
            <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                style={{ backgroundColor: theme.cardBg2 }}
                onClick={() => showNotifications && setShowNotifications(false)}
            >
                {/* Welcome message if no messages */}
                {messages.length === 0 && !isLoading && (
                    <div className="text-center py-8">
                        <div
                            className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
                            style={{ backgroundColor: `${theme.accent}22` }}
                        >
                            <Bot size={32} style={{ color: theme.accent }} />
                        </div>
                        <p className="font-medium" style={{ color: theme.text }}>
                            ¡Hola! Soy Ara
                        </p>
                        <p className="text-sm mt-1" style={{ color: theme.textMuted }}>
                            Puedo ayudarte a buscar productos, consultar pedidos y más.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {['Ver mi pedido', 'Buscar productos', 'Ver mi COA'].map(q => (
                                <button
                                    key={q}
                                    onClick={() => {
                                        setInput(q);
                                        inputRef.current?.focus();
                                    }}
                                    className="px-3 py-1.5 rounded-full text-xs transition-colors"
                                    style={{
                                        backgroundColor: `${theme.accent}22`,
                                        color: theme.accent
                                    }}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loading history */}
                {isLoading && messages.length === 0 && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={24} className="animate-spin" style={{ color: theme.accent }} />
                    </div>
                )}

                {/* Messages */}
                {messages.map((msg, idx) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${msg.role === 'user'
                                    ? 'rounded-br-md'
                                    : 'rounded-bl-md'
                                } ${msg.isTemp ? 'opacity-70' : ''}`}
                            style={{
                                backgroundColor: msg.role === 'user'
                                    ? theme.accent
                                    : theme.cardBg,
                                color: msg.role === 'user' ? 'white' : theme.text,
                                border: msg.role === 'assistant' ? `1px solid ${theme.border}` : 'none'
                            }}
                        >
                            <p className="text-sm whitespace-pre-wrap break-words">
                                {msg.content}
                            </p>
                            <p
                                className="text-[10px] mt-1 text-right"
                                style={{
                                    color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : theme.textMuted
                                }}
                            >
                                {formatTime(msg.createdAt)}
                            </p>
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {isSending && (
                    <div className="flex justify-start">
                        <div
                            className="rounded-2xl rounded-bl-md px-4 py-3"
                            style={{
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`
                            }}
                        >
                            <div className="flex gap-1">
                                <span
                                    className="w-2 h-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: theme.accent, animationDelay: '0ms' }}
                                />
                                <span
                                    className="w-2 h-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: theme.accent, animationDelay: '150ms' }}
                                />
                                <span
                                    className="w-2 h-2 rounded-full animate-bounce"
                                    style={{ backgroundColor: theme.accent, animationDelay: '300ms' }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Error Banner */}
            {error && (
                <div
                    className="px-4 py-2 flex items-center gap-2 text-sm"
                    style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}
                >
                    <AlertCircle size={16} />
                    <span className="flex-1">{error}</span>
                    <button onClick={clearError} className="font-medium">
                        Cerrar
                    </button>
                </div>
            )}

            {/* Input Area */}
            <div
                className="p-4 border-t shrink-0"
                style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}
            >
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Escribe tu mensaje..."
                        className="flex-1 px-4 py-3 rounded-xl border outline-none transition-colors text-sm"
                        style={{
                            backgroundColor: theme.cardBg2,
                            borderColor: theme.border,
                            color: theme.text
                        }}
                        onFocus={(e) => e.target.style.borderColor = theme.accent}
                        onBlur={(e) => e.target.style.borderColor = theme.border}
                        disabled={isSending}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                        style={{
                            backgroundColor: theme.accent,
                            color: 'white'
                        }}
                    >
                        {isSending ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : (
                            <Send size={20} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AraChatWindow;
