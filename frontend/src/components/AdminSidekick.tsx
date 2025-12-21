
import React, { useState } from 'react';
import { MessageSquare, X, Send, Brain, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import VitalityMonitor from './VitalityMonitor';

const AdminSidekick = () => {
    const { theme } = useTheme();
    const { isSuperAdmin } = useAuth();
    const token = localStorage.getItem('accessToken');
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<{ role: string, content: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gpt-4o');
    const [usageStats, setUsageStats] = useState<{ totalCost: number, totalTokens: number } | null>(null);
    const [modelStatus, setModelStatus] = useState<Record<string, { status: string, error?: string }>>({});

    // History State
    const [showHistory, setShowHistory] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

    const models = [
        // OpenAI (Verified)
        { id: 'gpt-4o', name: 'GPT-4o (Stable)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'o1-preview', name: 'OpenAI o1 Preview (Tier Required)' },
        { id: 'o1-mini', name: 'OpenAI o1 Mini (Tier Required)' },

        // Anthropic (Balance Dependent)
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },

        // Google Gemini (Verified in your Project)
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Futuristic)' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Futuristic)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
        { id: 'gemini-flash-latest', name: 'Gemini 1.5 Flash (Legacy)' }
    ];

    // Default to admin_assistant (Internal Antigravity)
    // The backend now supports folder-based agent "admin_assistant"
    const PERSONA = 'admin_assistant';

    const loadConversations = async () => {
        try {
            const res = await fetch('/api/v1/ai/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setConversations(data.data);
            }
        } catch (e) { console.error('Failed to load conversations'); }
    };

    const startNewChat = () => {
        setCurrentConversationId(null);
        setMessages([]);
        setShowHistory(false);
    };

    const loadConversation = async (id: string) => {
        try {
            const res = await fetch(`/api/v1/ai/conversations/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                // Map stored messages to UI format
                // Backend: id, role, content, timestamp
                const uiMessages = data.data.messages.map((m: any) => ({
                    role: m.role,
                    content: m.content
                }));
                setMessages(uiMessages);
                setCurrentConversationId(id);
                setShowHistory(false);
                setSelectedModel(data.data.model || 'gpt-4o');
            }
        } catch (e) { console.error('Failed to load conversation'); }
    };

    const deleteConversation = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await fetch(`/api/v1/ai/conversations/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            loadConversations();
            if (currentConversationId === id) {
                startNewChat();
            }
        } catch (e) { console.error('Failed to delete conversation'); }
    }

    const handleSend = async () => {
        if (!input.trim() || !token) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            // If no conversation ID, create one first? 
            // Or just let the backend handle it?
            // Actually, backend expects 'conversationId' to append. If null, it just chats.
            // Ideally we want to START a thread if it's new.

            let activeId = currentConversationId;

            if (!activeId) {
                // Create new conversation on the fly
                const createRes = await fetch('/api/v1/ai/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ model: selectedModel, message: userMsg }) // Initialize with first msg
                });
                const createData = await createRes.json();
                if (createData.success) {
                    activeId = createData.data.id;
                    setCurrentConversationId(activeId);
                    loadConversations(); // Refresh list background
                }
            }

            const res = await fetch('/api/v1/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: userMsg,
                    persona: PERSONA,
                    history: messages, // Send history (frontend state still mainly used for context)
                    model: selectedModel,
                    conversationId: activeId
                })
            });
            const data = await res.json();

            if (data.success && data.data.content) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.data.content }]);
                // Refresh stats
                fetchUsage();
                // Refresh conversations list title potentially?
                if (!currentConversationId) loadConversations();
            } else {
                setMessages(prev => [...prev, { role: 'system', content: `Error: ${data.error || 'No response'}` }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'system', content: 'Connection Error' }]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch usage stats
    const fetchUsage = async () => {
        try {
            const res = await fetch('/api/v1/ai/usage', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setUsageStats(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch usage stats');
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/v1/ai/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ models })
            });
            const data = await res.json();
            if (data.success) {
                const statusMap: any = {};
                data.data.forEach((m: any) => {
                    statusMap[m.id] = { status: m.status, error: m.error };
                });
                setModelStatus(statusMap);
            }
        } catch (e) { console.error('Failed to fetch model status'); }
    };

    // Initial fetch
    React.useEffect(() => {
        if (isOpen) {
            fetchUsage();
            fetchStatus();
        }
    }, [isOpen]);

    if (!token || !isSuperAdmin) return null;

    // The component now renders the open window OR the launcher button
    // The parent (FloatingDock) will handle the positioning of the launcher.
    // The open window will handle its own positioning (likely fixed to fill or side).

    return (
        <div className="relative pointer-events-auto">
            {/* Chat Window - Absolute to Dock Container on Desktop, Fixed on Mobile */}
            {isOpen && !isMinimized && (
                <div
                    className="fixed inset-x-0 bottom-24 sm:absolute sm:bottom-full sm:right-0 sm:inset-x-auto sm:mb-4 z-[10000] flex flex-col items-center sm:items-end px-4 sm:px-0"
                >
                    <div
                        className="w-full sm:w-96 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out border border-white/10 pointer-events-auto"
                        style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.border,
                            height: 'min(500px, 60vh)',
                        }}
                    >
                        {/* Header */}
                        <div
                            className="p-3 border-b flex items-center justify-between"
                            style={{
                                borderColor: `${theme.accent}33`,
                                background: `linear-gradient(to right, ${theme.accent}22, ${theme.accent}11)`
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <Brain size={18} style={{ color: theme.accent }} />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-sm leading-none" style={{ color: theme.text }}>Antigravity</span>
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="bg-transparent text-[10px] outline-none cursor-pointer mt-0.5 border-none p-0 pr-4"
                                        style={{ color: theme.textMuted }}
                                    >
                                        {models.map(m => {
                                            const status = modelStatus[m.id];
                                            const color = status?.status === 'online' ? '#10b981' : (status?.status === 'offline' ? '#ef4444' : '#6b7280');
                                            return (
                                                <option key={m.id} value={m.id} style={{ backgroundColor: theme.cardBg, color: theme.text }}>
                                                    {status?.status === 'online' ? '🟢' : (status?.status === 'offline' ? '🔴' : '⚪')} {m.name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <VitalityMonitor usageStats={usageStats} />
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        if (!showHistory) loadConversations();
                                        setShowHistory(!showHistory);
                                    }}
                                    className="p-1 rounded transition-colors"
                                    style={{
                                        color: showHistory ? theme.accent : theme.textMuted,
                                        backgroundColor: showHistory ? `${theme.accent}22` : 'transparent'
                                    }}
                                    title="Historial"
                                >
                                    <MessageSquare size={14} />
                                </button>
                                <button
                                    onClick={() => { setMessages([]); setCurrentConversationId(null); }}
                                    className="p-1 rounded transition-colors"
                                    style={{ color: theme.textMuted }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}11`}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    title="Limpiar / Nuevo Chat"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <button
                                    onClick={() => setIsMinimized(true)}
                                    className="p-1 rounded transition-colors"
                                    style={{ color: theme.textMuted }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}11`}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <ChevronDown size={14} />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1 rounded transition-colors"
                                    style={{ color: theme.textMuted }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}11`}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>

                        {/* History or Messages */}
                        {showHistory ? (
                            <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ backgroundColor: theme.cardBg2 }}>
                                <button
                                    onClick={startNewChat}
                                    className="w-full text-left p-3 rounded text-xs font-bold flex items-center gap-2 transition-colors"
                                    style={{
                                        backgroundColor: `${theme.accent}22`,
                                        color: theme.accent
                                    }}
                                >
                                    <Brain size={14} /> Nuevo Chat
                                </button>
                                <div className="h-px my-2" style={{ backgroundColor: theme.border, opacity: 0.3 }} />
                                {conversations.length === 0 && (
                                    <div className="text-center text-xs py-4" style={{ color: theme.textMuted }}>No hay historial</div>
                                )}
                                {conversations.map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => loadConversation(c.id)}
                                        className={`p-3 rounded cursor-pointer group flex justify-between items-center transition-colors border ${currentConversationId === c.id ? '' : 'border-transparent'}`}
                                        style={{
                                            backgroundColor: currentConversationId === c.id ? `${theme.accent}11` : 'transparent',
                                            borderColor: currentConversationId === c.id ? `${theme.accent}33` : 'transparent'
                                        }}
                                    >
                                        <div className="overflow-hidden">
                                            <div className="text-xs font-medium truncate w-48" style={{ color: theme.text }}>{c.title}</div>
                                            <div className="text-[10px]" style={{ color: theme.textMuted }}>{new Date(c.updatedAt).toLocaleDateString()} · {c.model}</div>
                                        </div>
                                        <button
                                            onClick={(e) => deleteConversation(e, c.id)}
                                            className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: `${theme.bg}55` }}>
                                {messages.length === 0 && (
                                    <div className="text-center opacity-50 text-xs mt-10 p-4" style={{ color: theme.textMuted }}>
                                        Hola, soy tu Asistente Administrativo. <br />
                                        Tengo acceso a los datos de tus pedidos y clientes. <br />
                                        ¿En qué puedo ayudarte hoy?
                                    </div>
                                )}
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`max-w-[85%] p-3 rounded-2xl text-xs shadow-sm ${m.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'}`}
                                            style={{
                                                backgroundColor: m.role === 'user' ? theme.accent : theme.cardBg,
                                                color: m.role === 'user' ? '#ffffff' : theme.text,
                                                border: m.role === 'assistant' ? `1px solid ${theme.border}` : 'none'
                                            }}
                                        >
                                            <div className="whitespace-pre-wrap">{m.content}</div>
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start px-2">
                                        <div className="flex gap-1 animate-pulse items-center p-2 rounded-xl" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.accent }} />
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.accent, opacity: 0.6 }} />
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.accent, opacity: 0.3 }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-3 border-t" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
                            <form
                                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                className="flex gap-2"
                            >
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Escribe aquí..."
                                    className="flex-1 bg-transparent border rounded-full px-4 py-2 text-base outline-none transition-all"
                                    style={{
                                        borderColor: theme.border,
                                        color: theme.text,
                                        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.05)'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = theme.accent}
                                    onBlur={(e) => e.target.style.borderColor = theme.border}
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !input.trim()}
                                    className="p-2 rounded-full transition-all active:scale-90 disabled:opacity-50"
                                    style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                >
                                    <Send size={18} />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Trigger (Launcher) */}
            {(!isOpen || isMinimized) && (
                <button
                    onClick={() => { setIsOpen(true); setIsMinimized(false); }}
                    className="p-4 rounded-full shadow-lg bg-gradient-to-br from-pink-600 to-purple-700 text-white hover:scale-105 transition-transform flex items-center justify-center group relative pointer-events-auto"
                    title="Abrir Asistente AI"
                >
                    <Brain size={28} className="group-hover:animate-pulse" />
                    <span className="absolute right-full mr-3 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Antigravity (AI)
                    </span>
                    {isMinimized && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                </button>
            )}
        </div>
    );
};

export default AdminSidekick;
