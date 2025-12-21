

import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
    Layout, MessageSquare, Brain, User, Clock,
    MoreVertical, Send, Filter, Search, Plus,
    Instagram, Facebook, Mail, Globe, AlertCircle,
    CheckCircle2, PauseCircle, ChevronRight,
    ShoppingBag, ShoppingCart, Bell, Truck, Database,
    FileBox, Activity, Wrench, MessageCircle, Archive, Zap, X, Package, Code, Loader2, ExternalLink, Eye
} from 'lucide-react';
import ToolEditor from '../components/ToolEditor';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../telemetry/Screen';
import { ROUTES } from '../routes';

import { createClient } from '@supabase/supabase-js';

// Init Supabase Client for Realtime
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface Column {
    id: string;
    name: string;
    mode: 'AI_MODE' | 'HUMAN_MODE' | 'HYBRID';
    position: number;
    config?: {
        agent_id?: string;
        model?: string;
        tools_policy?: {
            mode: 'inherit' | 'override';
            allowed_tools: string[];
        };
        automations?: any;
        guardrails?: any;
    };
}

interface AgentMetadata {
    id: string;
    label: string;
    category: string;
    status: 'Ready' | 'Broken';
    default_tools: string[];
    description: string;
    error?: string;
}

interface ToolRegistryItem {
    name: string;
    label?: string;
    description: string;
    category: string;
}

interface Conversation {
    id: string;
    channel: 'WA' | 'IG' | 'FB' | 'EMAIL' | 'WEBCHAT';
    contact_handle: string;
    status: 'active' | 'paused' | 'review' | 'archived';
    column_id: string;
    last_message_at: string;
    summary?: string;
    tags?: string[];
    facts?: any; // e.g. { action_plan: [] }
    contact_name?: string;
    ltv?: number;
    risk_level?: string;
}

interface ContactSnapshot {
    id: string;
    handle: string;
    channel: string;
    name: string;
    ltv: number;
    orders_count: number;
    average_ticket: number;
    risk_level: string;
    tags: string[];
    last_shipping_status?: string;
    last_shipping_carrier?: string;
    last_shipping_tracking?: string;
    last_updated_at: string;
    summary_bullets?: string[];
}

const AdminCRM = () => {
    // Build version: 2025-12-20-16-05
    const { theme } = useTheme();
    const { isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const token = localStorage.getItem('accessToken');

    const [columns, setColumns] = useState<Column[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [selectedTab, setSelectedTab] = useState<'chat' | 'client' | 'orders' | 'insights'>('chat');
    const [selectedColumn, setSelectedColumn] = useState<Column | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [agentsMetadata, setAgentsMetadata] = useState<AgentMetadata[]>([]);
    const [toolsRegistry, setToolsRegistry] = useState<ToolRegistryItem[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [contactSnapshot, setContactSnapshot] = useState<ContactSnapshot | null>(null);
    const [loadingSnapshot, setLoadingSnapshot] = useState(false);
    const [showToolEditor, setShowToolEditor] = useState(false);
    const [clientOrders, setClientOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [orderDetails, setOrderDetails] = useState<any | null>(null);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [browsingEvents, setBrowsingEvents] = useState<any[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (selectedTab === 'chat') {
            scrollToBottom();
        }
    }, [messages, selectedTab]);

    useEffect(() => {
        if (selectedTab === 'orders' && selectedConv) {
            fetchClientOrders(selectedConv.contact_handle);
        }
    }, [selectedTab, selectedConv]);

    const fetchClientOrders = async (handle: string) => {
        if (!handle) return;
        setLoadingOrders(true);
        try {
            const res = await fetch(`/api/v1/crm/contacts/${encodeURIComponent(handle)}/orders`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setClientOrders(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch orders', err);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleActionClick = async (action: any) => {
        if (action.action_type === 'link' && action.payload?.url) {
            window.open(action.payload.url, '_blank');
        } else if (action.action_type === 'coupon') {
            try {
                // Real call to Shopify via backend
                const res = await fetch('/api/v1/crm/coupons', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        discount: action.payload?.discount,
                        code: action.payload?.code
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`¡Cupón "${action.payload?.code}" creado con éxito en Shopify!`);
                } else {
                    alert(`Error: ${data.error || 'No se pudo crear el cupón'}`);
                }
            } catch (err: any) {
                alert(`Error de red: ${err.message}`);
            }
        } else {
            alert(`Ejecutando: ${action.label}`);
        }
    };

    const getTagColor = (tag: string) => {
        const t = tag.toLowerCase();
        if (t.includes('gold')) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
        if (t.includes('partner')) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
        if (t.includes('user')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        if (t.includes('shop')) return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'; // Emerald for Local/CRM tags
    };

    const fetchOrderDetails = async (shopifyOrderId: string) => {
        if (expandedOrderId === shopifyOrderId) {
            setExpandedOrderId(null);
            return;
        }

        setExpandedOrderId(shopifyOrderId);
        setLoadingDetails(true);
        setOrderDetails(null);
        setDetailsError(null);

        try {
            // Use component-scoped token (accessToken)
            const response = await fetch(`/api/v1/crm/orders/${shopifyOrderId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text.substring(0, 50)}`);
            }

            const data = await response.json();
            if (data.success) {
                setOrderDetails(data.data);
            } else {
                console.warn('Backend returned error:', data.error);
                setDetailsError(data.error || 'Unknown Backend Error');
            }
        } catch (error: any) {
            console.error('Error fetching order details:', error);
            setDetailsError(error.message || 'Network/Parse Error');
        } finally {
            setLoadingDetails(false);
        }
    };

    const models = [
        { id: 'gpt-4o', name: 'GPT-4o (Stable)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'o1-preview', name: 'OpenAI o1 Preview' },
        { id: 'o1-mini', name: 'OpenAI o1 Mini' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Futuristic)' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Futuristic)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
        { id: 'gemini-flash-latest', name: 'Gemini 1.5 Flash (Legacy)' }
    ];

    const getToolIcon = (category: string) => {
        switch (category) {
            case 'whatsapp': return <MessageCircle size={14} className="text-green-500" />;
            case 'mail': return <Mail size={14} className="text-blue-400" />;
            case 'shopify': return <Globe size={14} className="text-green-400" />;
            case 'shopping-bag': return <ShoppingBag size={14} className="text-pink-400" />;
            case 'shopping-cart': return <ShoppingCart size={14} className="text-purple-400" />;
            case 'bell': return <Bell size={14} className="text-yellow-400" />;
            case 'truck': return <Truck size={14} className="text-orange-400" />;
            case 'orders': return <Layout size={14} className="text-indigo-400" />;
            case 'users': return <Database size={14} className="text-cyan-400" />;
            case 'system': return <Activity size={14} className="text-red-400" />;
            case 'files': return <FileBox size={14} className="text-gray-400" />;
            case 'search': return <Search size={14} className="text-blue-500" />;
            default: return <Wrench size={14} className="text-pink-500" />;
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchMessages = async (convId: string) => {
        try {
            const res = await fetch(`/api/v1/crm/conversations/${convId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setMessages(data.data);
                setTimeout(scrollToBottom, 500);
            }
        } catch (err) {
            console.error('Failed to fetch messages');
        }
    };

    useEffect(() => {
        if (selectedConv) {
            fetchMessages(selectedConv.id);
        } else {
            setMessages([]);
        }
    }, [selectedConv]);

    // Realtime Subscription
    useEffect(() => {
        if (!selectedConv) return;

        const channel = supabase
            .channel('crm_messages_updates')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'crm_messages',
                    filter: `conversation_id=eq.${selectedConv.id}`
                },
                (payload: any) => {
                    setMessages((prev) => [...prev, payload.new]);
                    setTimeout(scrollToBottom, 200);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedConv]);

    // Customer 360 Fetcher
    useEffect(() => {
        if (selectedConv && selectedTab === 'insights') {
            fetchBrowsingEvents(selectedConv.contact_handle);
        }
    }, [selectedConv, selectedTab]);

    useEffect(() => {
        if (selectedConv && selectedTab !== 'chat') {
            fetchSnapshot(selectedConv.contact_handle, selectedConv.channel);
        }
    }, [selectedConv, selectedTab]);

    const fetchSnapshot = async (handle: string, channel: string) => {
        setLoadingSnapshot(true);
        try {
            const res = await fetch(`/api/v1/crm/contacts/${encodeURIComponent(handle)}/snapshot?channel=${channel}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setContactSnapshot(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch snapshot', e);
        } finally {
            setLoadingSnapshot(false);
        }
    };

    const fetchBrowsingEvents = async (handle: string) => {
        if (!handle) return;
        setLoadingEvents(true);
        try {
            const res = await fetch(`/api/v1/behavior/activity/${encodeURIComponent(handle)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setBrowsingEvents(data.events);
            }
        } catch (err) {
            console.error('Failed to fetch browsing events', err);
        } finally {
            setLoadingEvents(false);
        }
    };

    const parseMediaContent = (content: string) => {
        const urlMatch = content.match(/\[(Image|Audio|Video|File|Sticker)\]\((.*?)\)/);
        if (urlMatch) {
            const type = urlMatch[1];
            const url = urlMatch[2];
            const caption = content.replace(urlMatch[0], '').trim();

            if (type === 'Audio') return <audio controls src={url} className="w-full mt-2" />;
            if (type === 'Image') return (
                <div className="mt-2">
                    <img src={url} alt="Media" className="rounded-xl max-w-full max-h-60 object-cover" />
                    {caption && <p className="text-xs mt-1 opacity-70">{caption}</p>}
                </div>
            );
            if (type === 'Sticker') return <img src={url} alt="Sticker" className="w-32 mt-2" />;
            if (type === 'Video') return (
                <div className="mt-2">
                    <video controls src={url} className="rounded-xl max-w-full max-h-60" />
                    {caption && <p className="text-xs mt-1 opacity-70">{caption}</p>}
                </div>
            );
            if (type === 'File') return (
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-2 p-2 bg-white/10 rounded-lg text-xs hover:bg-white/20 transition-all">
                    <FileBox size={16} />
                    <span>{caption || 'Descargar Archivo'}</span>
                </a>
            );
        }
        return content;
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const resCol = await fetch('/api/v1/crm/columns', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataCol = await resCol.json();
            if (dataCol.success) setColumns(dataCol.data);

            const resAgents = await fetch('/api/v1/admin/knowledge/agents-metadata', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataAgents = await resAgents.json();
            if (dataAgents.success) setAgentsMetadata(dataAgents.data);

            const resTools = await fetch('/api/v1/admin/knowledge/tools-registry', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataTools = await resTools.json();
            if (dataTools.success) setToolsRegistry(dataTools.data);

            const resConv = await fetch('/api/v1/crm/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataConv = await resConv.json();
            if (dataConv.success) setConversations(dataConv.data);
        } catch (err) {
            console.error('Failed to fetch CRM data');
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, conversationId: string) => {
        e.dataTransfer.setData('conversationId', conversationId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        const conversationId = e.dataTransfer.getData('conversationId');
        if (!conversationId) return;

        // Optimistic Update
        const conversation = conversations.find(c => c.id === conversationId);
        if (!conversation || conversation.column_id === targetColumnId) return;

        const originalConversations = [...conversations];
        setConversations(conversations.map(c =>
            c.id === conversationId ? { ...c, column_id: targetColumnId } : c
        ));

        try {
            const res = await fetch('/api/v1/crm/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ conversationId, targetColumnId })
            });

            if (!res.ok) {
                setConversations(originalConversations);
                const error = await res.json();
                console.error('Move failed:', error);
            }
        } catch (err) {
            setConversations(originalConversations);
            console.error('Move error:', err);
        }
    };

    const handleCreateCard = async (columnId: string) => {
        const handleRaw = window.prompt('Ingrese el identificador (Teléfono para WA, @usuario para IG o Email):');
        if (!handleRaw) return;

        const typeInput = window.prompt('Tipo de canal: (1) WhatsApp, (2) Instagram, (3) Email');
        let channel: 'WA' | 'IG' | 'EMAIL' = 'WA';
        let handle = handleRaw.trim();

        if (typeInput === '2') channel = 'IG';
        if (typeInput === '3') {
            channel = 'EMAIL';
            handle = handle.toLowerCase();
        }

        try {
            const res = await fetch('/api/v1/crm/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    channel,
                    handle,
                    column_id: columnId
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setConversations([...conversations, data.data]);
                }
            } else {
                alert('Error al crear conversación. Verifique si ya existe.');
            }
        } catch (err) {
            console.error('Create card error:', err);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedConv || !newMessage.trim() || sendingMessage) return;

        setSendingMessage(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ content: newMessage })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setMessages([...messages, data.data]);
                    setNewMessage('');
                }
            }
        } catch (err) {
            console.error('Send message error:', err);
        } finally {
            setSendingMessage(false);
        }
    };

    if (!isSuperAdmin) return null;

    const getChannelIcon = (channel: string) => {
        switch (channel) {
            case 'WA': return <MessageSquare size={14} className="text-green-500" />;
            case 'IG': return <Instagram size={14} className="text-pink-500" />;
            case 'FB': return <Facebook size={14} className="text-blue-600" />;
            default: return <Globe size={14} />;
        }
    };

    return (
        <Screen id="screen.admin.crm">
            <div className="min-h-screen flex flex-col h-screen overflow-hidden" style={{ backgroundColor: theme.bg }}>
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500/10">
                            <Layout className="text-pink-500" size={24} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold" style={{ color: theme.text }}>Omnichannel CRM</h1>
                            <p className="text-xs opacity-50" style={{ color: theme.text }}>Tablero de Conversaciones Inteligentes</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" style={{ color: theme.text }} />
                            <input
                                type="text"
                                placeholder="Buscar contacto o tag..."
                                className="bg-black/20 border rounded-full pl-9 pr-4 py-1.5 text-sm outline-none w-64 transition-all focus:border-pink-500/50"
                                style={{ borderColor: theme.border, color: theme.text }}
                            />
                        </div>
                        <button
                            onClick={() => setShowToolEditor(true)}
                            className="p-2 rounded-full hover:bg-white/5 transition-colors text-pink-400"
                            title="Editor de Herramientas IA"
                        >
                            <Wrench size={20} />
                        </button>
                        <button onClick={() => navigate(ROUTES.home)} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: theme.text, borderColor: theme.border }}>
                            Cerrar
                        </button>
                    </div>
                </div>

                {/* Kanban Board */}
                <div className="flex-1 overflow-x-auto p-4 flex gap-4 bg-black/5 items-start">
                    {columns.map(col => (
                        <div
                            key={col.id}
                            className="w-80 shrink-0 flex flex-col max-h-full"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, col.id)}
                        >
                            <div
                                className="flex items-center justify-between mb-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all group border border-transparent hover:border-pink-500/30"
                                onClick={() => setSelectedColumn(col)}
                            >
                                <div className="flex flex-col">
                                    <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.text }}>{col.name}</h2>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] opacity-40 uppercase" style={{ color: theme.textMuted }}>
                                            {conversations.filter(c => c.column_id === col.id).length} cards
                                        </span>
                                        {col.mode === 'AI_MODE' ? (
                                            <div className="text-[9px] text-green-500 flex items-center gap-1">
                                                <Brain size={8} /> {col.config?.agent_id || 'AI_ARA'}
                                            </div>
                                        ) : col.mode === 'HYBRID' ? (
                                            <div className="text-[9px] text-purple-400 flex items-center gap-1">
                                                <User size={8} /> HYBRID
                                            </div>
                                        ) : (
                                            <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                                <PauseCircle size={8} /> HUMAN
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <MoreVertical size={14} className="opacity-0 group-hover:opacity-40" style={{ color: theme.text }} />
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                                {conversations.filter(c => c.column_id === col.id).map(conv => (
                                    <div
                                        key={conv.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, conv.id)}
                                        onClick={() => setSelectedConv(conv)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer group hover:scale-[1.02] active:scale-95 ${selectedConv?.id === conv.id ? 'ring-2 ring-pink-500' : ''} ${selectedConv?.id !== conv.id ? 'hover:shadow-lg' : ''}`}
                                        style={{
                                            backgroundColor: theme.cardBg,
                                            borderColor: theme.border,
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                        }}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {getChannelIcon(conv.channel)}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-bold truncate max-w-[140px]" style={{ color: theme.text }}>
                                                        {conv.contact_name || conv.contact_handle}
                                                    </span>
                                                    {conv.contact_name && (
                                                        <span className="text-[9px] opacity-30 truncate font-mono">{conv.contact_handle}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[10px] opacity-40 font-mono" style={{ color: theme.textMuted }}>
                                                    {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                {conv.ltv && conv.ltv > 0 ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] font-bold text-green-500/80 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                                                            ${Math.round(conv.ltv).toLocaleString()}
                                                        </span>
                                                        {conv.risk_level === 'vip' && (
                                                            <Zap size={10} className="text-yellow-500 animate-pulse" fill="currentColor" />
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <p className="text-[11px] line-clamp-2 mb-3 leading-relaxed opacity-70" style={{ color: theme.text }}>
                                            {conv.summary}
                                        </p>

                                        <div className="flex flex-wrap gap-1">
                                            {conv.tags?.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-pink-500/10 border border-pink-500/20"
                                                    style={{ color: theme.accent }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Footer Actions */}
                                        <div className="mt-4 pt-3 border-t flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ borderColor: `${theme.border}55` }}>
                                            <div className="flex gap-2">
                                                <button className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300">Resumen</button>
                                                <button className="text-[10px] uppercase font-bold text-gray-400 hover:text-white">Mover</button>
                                            </div>
                                            <ChevronRight size={14} style={{ color: theme.accent }} />
                                        </div>
                                    </div>
                                ))}

                                <button
                                    onClick={() => handleCreateCard(col.id)}
                                    className="w-full py-3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 opacity-20 hover:opacity-50 transition-all group"
                                    style={{ borderColor: theme.border, color: theme.text }}
                                >
                                    <Plus size={20} className="group-hover:scale-110 transition-transform" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Nueva Card</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Column Config Sidebar (Operational Brain) */}
                {selectedColumn && (
                    <div className="fixed inset-y-0 right-0 w-[400px] shadow-2xl z-[110] border-l flex flex-col animate-in slide-in-from-right duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                            <div>
                                <h2 className="text-lg font-bold" style={{ color: theme.text }}>Cerebro de Columna</h2>
                                <p className="text-xs opacity-50 uppercase tracking-widest" style={{ color: theme.accent }}>{selectedColumn.name}</p>
                            </div>
                            <button onClick={() => setSelectedColumn(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                                <MoreVertical size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Mode Section */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold uppercase opacity-40">Modo de Operación</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['AI_MODE', 'HYBRID', 'HUMAN_MODE'].map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setSelectedColumn({ ...selectedColumn, mode: m as any })}
                                            className={`py-2 rounded-lg border text-[10px] font-bold transition-all ${selectedColumn.mode === m ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/5 bg-black/20 opacity-40 text-gray-300'}`}
                                        >
                                            {m.replace('_MODE', '')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Agent Section */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold uppercase opacity-40">Agente Responsable</label>
                                <select
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-pink-500/50 appearance-none"
                                    style={{ color: theme.text }}
                                    value={selectedColumn.config?.agent_id || 'sales_ara'}
                                    onChange={(e) => setSelectedColumn({
                                        ...selectedColumn,
                                        config: { ...(selectedColumn.config || {}), agent_id: e.target.value }
                                    })}
                                >
                                    {agentsMetadata.map(agent => (
                                        <option key={agent.id} value={agent.id}>
                                            {agent.status === 'Ready' ? '🟢' : '🔴'} {agent.label} ({agent.category})
                                        </option>
                                    ))}
                                </select>
                                {agentsMetadata.find(a => a.id === (selectedColumn.config?.agent_id || 'sales_ara'))?.status === 'Broken' && (
                                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                                        <AlertCircle size={10} /> {agentsMetadata.find(a => a.id === (selectedColumn.config?.agent_id || 'sales_ara'))?.error}
                                    </p>
                                )}
                            </div>

                            {/* Model Section */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold uppercase opacity-40">Modelo de IA (Cerebro)</label>
                                <select
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-pink-500/50 appearance-none"
                                    style={{ color: theme.text }}
                                    value={selectedColumn.config?.model || 'gpt-4o-mini'}
                                    onChange={(e) => setSelectedColumn({
                                        ...selectedColumn,
                                        config: { ...(selectedColumn.config || {}), model: e.target.value }
                                    })}
                                >
                                    {models.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Tools Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold uppercase opacity-40">Herramientas Permitidas</label>
                                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                        {(['inherit', 'override'] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => {
                                                    const config = selectedColumn.config || {};
                                                    const policy = config.tools_policy || { mode: 'inherit', allowed_tools: [] };
                                                    setSelectedColumn({
                                                        ...selectedColumn,
                                                        config: { ...config, tools_policy: { ...policy, mode: m } }
                                                    });
                                                }}
                                                className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${(selectedColumn.config?.tools_policy?.mode || 'inherit') === m
                                                    ? 'bg-pink-500 text-white shadow-lg'
                                                    : 'text-gray-500 hover:text-gray-300'
                                                    }`}
                                            >
                                                {m === 'inherit' ? 'HEREDAR' : 'PERSONALIZAR'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                                    {toolsRegistry.map(tool => {
                                        const isInherit = (selectedColumn.config?.tools_policy?.mode || 'inherit') === 'inherit';
                                        const currentAgent = agentsMetadata.find(a => a.id === (selectedColumn.config?.agent_id || 'sales_ara'));

                                        const isChecked = isInherit
                                            ? currentAgent?.default_tools?.includes(tool.name)
                                            : (selectedColumn.config?.tools_policy?.allowed_tools || []).includes(tool.name);

                                        return (
                                            <label
                                                key={tool.name}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isInherit ? 'opacity-40 cursor-not-allowed bg-black/10 border-white/5' : 'bg-black/20 border-white/5 cursor-pointer hover:border-white/20'
                                                    } ${isChecked ? 'ring-1 ring-pink-500/30 bg-pink-500/[0.02]' : ''}`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                                        {getToolIcon(tool.category || '')}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[11px] font-bold font-mono text-pink-400/90 uppercase truncate">{tool.name}</span>
                                                        <span className="text-[9px] opacity-40 truncate w-48">{tool.description}</span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    disabled={isInherit}
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        if (isInherit) return;
                                                        const config = selectedColumn.config || {};
                                                        const policy = config.tools_policy || { mode: 'override', allowed_tools: [] };
                                                        const currentTools = policy.allowed_tools || [];
                                                        const newTools = e.target.checked
                                                            ? [...currentTools, tool.name]
                                                            : currentTools.filter(name => name !== tool.name);

                                                        setSelectedColumn({
                                                            ...selectedColumn,
                                                            config: { ...config, tools_policy: { ...policy, allowed_tools: newTools } }
                                                        });
                                                    }}
                                                    className="w-4 h-4 accent-pink-500"
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t flex gap-3" style={{ borderColor: theme.border }}>
                            <button
                                onClick={() => setSelectedColumn(null)}
                                className="flex-1 py-3 rounded-xl border text-sm font-bold uppercase transition-all"
                                style={{ borderColor: theme.border, color: theme.text }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    setIsSaving(true);
                                    try {
                                        const res = await fetch(`/api/v1/crm/columns/${selectedColumn.id}/config`, {
                                            method: 'PATCH',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({
                                                mode: selectedColumn.mode,
                                                config: selectedColumn.config
                                            })
                                        });
                                        if (res.ok) {
                                            setColumns(columns.map(c => c.id === selectedColumn.id ? selectedColumn : c));
                                            setSelectedColumn(null);
                                        }
                                    } catch (e) { console.error('Error saving column config', e); }
                                    finally { setIsSaving(false); }
                                }}
                                className="flex-3 py-3 rounded-xl bg-pink-500 text-white text-sm font-bold uppercase shadow-lg hover:shadow-pink-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Conversation Sidebar (Drawer) */}

                {/* Conversation Sidebar (Drawer) */}
                {selectedConv && (
                    <div className="fixed inset-y-0 right-0 w-full md:w-auto md:max-w-[500px] md:min-w-[400px] shadow-2xl z-[100] border-l flex flex-col animate-in slide-in-from-right duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                            <div className="flex items-center gap-3">
                                {getChannelIcon(selectedConv.channel)}
                                <div>
                                    <h3 className="font-bold text-sm" style={{ color: theme.text }}>{selectedConv.contact_handle}</h3>
                                    <div className="flex items-center gap-1 text-[10px] text-green-500">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> ONLINE
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={async () => {
                                        if (!window.confirm('¿Archivar esta conversación?')) return;
                                        try {
                                            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/archive`, {
                                                method: 'PATCH',
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                setConversations(conversations.filter(c => c.id !== selectedConv.id));
                                                setSelectedConv(null);
                                            }
                                        } catch (e) { console.error('Archive error', e); }
                                    }}
                                    className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-pink-400 transition-colors"
                                    title="Archivar"
                                >
                                    <Archive size={18} />
                                </button>
                                <button onClick={() => setSelectedConv(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Sidebar Tabs */}
                        <div className="flex border-b text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                            {[
                                { id: 'chat', label: 'Chat', icon: <MessageCircle size={14} /> },
                                { id: 'client', label: 'Cliente 360', icon: <User size={14} /> },
                                { id: 'orders', label: 'Pedidos', icon: <ShoppingBag size={14} /> },
                                { id: 'insights', label: 'Brain', icon: <Brain size={14} /> }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setSelectedTab(tab.id as any)}
                                    className={`flex-1 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${selectedTab === tab.id ? 'border-pink-500 text-pink-500' : 'border-transparent opacity-40 hover:opacity-100 hover:bg-white/5'}`}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            ))}
                        </div>

                        {selectedTab === 'chat' && (
                            <div className="flex-1 flex flex-col bg-black/20">
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                                            <div
                                                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${msg.direction === 'outbound' ? 'bg-pink-500/20 text-pink-100 rounded-br-none border border-pink-500/20' : 'bg-white/5 border border-white/10 rounded-bl-none'}`}
                                            >
                                                {msg.type === 'image' && (
                                                    <img src={msg.content} alt="Media" className="rounded-lg mb-2 max-w-full" />
                                                )}
                                                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                            </div>
                                            <span className="text-[9px] opacity-30 mt-1 font-mono px-1">
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.direction === 'outbound' ? 'AGENTE' : 'CLIENTE'}
                                            </span>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-3 border-t bg-black/20" style={{ borderColor: theme.border }}>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                            placeholder="Escribe un mensaje..."
                                            className="flex-1 w-full min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm outline-none focus:border-pink-500/50 transition-all font-light"
                                            style={{ color: theme.text }}
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!newMessage.trim() || sendingMessage}
                                            className={`p-3 rounded-xl transition-all self-end ${!newMessage.trim() || sendingMessage ? 'opacity-20 grayscale' : 'bg-pink-500 text-white active:scale-95 shadow-lg'}`}
                                            title="Enviar"
                                        >
                                            <Send size={18} className={sendingMessage ? 'animate-pulse' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'client' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="text-center pb-6 border-b border-dashed border-white/10">
                                    <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-pink-500 to-purple-600 p-0.5 mb-3 shadow-xl">
                                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                                            <span className="text-2xl font-bold">{selectedConv.contact_handle[0]?.toUpperCase() || '?'}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-black truncate tracking-tight">{contactSnapshot?.name || selectedConv.contact_handle}</h3>
                                    <p className="text-[10px] opacity-40 font-mono uppercase tracking-tighter">ID: {selectedConv.id.substring(0, 8)} | canal: {selectedConv.channel} | Risk: {contactSnapshot?.risk_level || 'N/A'}</p>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
                                        <p className="text-[9px] uppercase font-bold opacity-30 mb-1">LTV Total</p>
                                        <p className="text-xl font-mono font-bold text-pink-500">${contactSnapshot?.ltv?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</p>
                                    </div>
                                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
                                        <p className="text-[9px] uppercase font-bold opacity-30 mb-1">Pedidos</p>
                                        <p className="text-xl font-mono font-bold">{contactSnapshot?.orders_count || 0}</p>
                                    </div>
                                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center flex flex-col items-center justify-center">
                                        <p className="text-[9px] uppercase font-bold opacity-30 mb-1">Status</p>
                                        <div className="flex gap-1 flex-wrap justify-center">
                                            {contactSnapshot?.risk_level === 'vip' && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[9px] font-bold border border-amber-500/20">VIP</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('b2b') && (
                                                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 text-[9px] font-bold border border-blue-500/20">B2B</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('Wholesale') && (
                                                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 text-[9px] font-bold border border-blue-500/20">MAYOREO</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('Club_partner') && (
                                                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] font-bold border border-purple-500/20">CLUB PARTNER</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('Gold_member') && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-300/20 text-amber-300 text-[9px] font-bold border border-amber-300/20">GOLD</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('Platino_member') && (
                                                <span className="px-1.5 py-0.5 rounded bg-slate-300/20 text-slate-300 text-[9px] font-bold border border-slate-300/20">PLATINUM</span>
                                            )}
                                            {contactSnapshot?.tags?.includes('Black_member') && (
                                                <span className="px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-300 text-[9px] font-bold border border-zinc-500/20">BLACK</span>
                                            )}
                                            {!contactSnapshot?.risk_level && !contactSnapshot?.tags?.length && (
                                                <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-500 text-[9px] font-bold">NEW</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Database size={40} />
                                    </div>
                                    <p className="text-[9px] uppercase font-bold opacity-30 mb-3 flex items-center gap-2">
                                        <Activity size={10} /> Resumen Inteligente
                                    </p>
                                    <ul className="space-y-2 text-xs opacity-70 font-light">
                                        {(contactSnapshot?.summary_bullets?.length ? contactSnapshot.summary_bullets : [
                                            'Cliente nuevo sin historial previo.',
                                            'Interés potencial en vapes desechables.',
                                            'No se detectan riesgos de pago.'
                                        ]).map((bullet, i) => (
                                            <li key={i} className="flex gap-2">
                                                <span className="text-pink-500 mt-1">•</span>
                                                {bullet}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {selectedTab === 'orders' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {loadingOrders ? (
                                    <div className="flex justify-center p-8"><Loader2 className="animate-spin text-pink-500" /></div>
                                ) : clientOrders.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center opacity-30 py-10 gap-2">
                                        <ShoppingBag size={32} />
                                        <p className="text-xs font-mono">SIN PEDIDOS</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {clientOrders.map((order, i) => (
                                            <div
                                                key={i}
                                                onClick={() => fetchOrderDetails(order.shopify_order_id)}
                                                className={`bg-white/5 border ${expandedOrderId === order.shopify_order_id ? 'border-pink-500/50 bg-white/10' : 'border-white/5'} p-4 rounded-xl cursor-pointer hover:border-pink-500/20 transition-all`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <p className="text-xs font-bold text-white mb-1">Pedido {order.order_number}</p>
                                                        <p className="text-[10px] opacity-50 font-mono">{new Date(order.shopify_created_at || order.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs font-bold font-mono text-pink-400">${order.total_amount}</p>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${order.status === 'paid' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>{order.status}</span>
                                                    </div>
                                                </div>

                                                {expandedOrderId === order.shopify_order_id && (
                                                    <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in zoom-in-95 duration-200">
                                                        {loadingDetails ? (
                                                            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-pink-500" /></div>
                                                        ) : detailsError ? (
                                                            <div className="text-center text-[10px] opacity-40 py-2 text-red-400">
                                                                Error cargando detalles.<br />
                                                                ID: {order.shopify_order_id}<br />
                                                                {detailsError}
                                                            </div>
                                                        ) : orderDetails ? (
                                                            <div className="space-y-3">
                                                                <div className="space-y-2">
                                                                    {orderDetails.line_items?.map((item: any, idx: number) => (
                                                                        <div key={idx} className="flex justify-between text-[10px] items-start">
                                                                            <div className="flex gap-2">
                                                                                <div className="bg-white/5 w-4 h-4 flex items-center justify-center rounded text-xs">{item.quantity}</div>
                                                                                <span className="opacity-80 max-w-[180px]">{item.title} - {item.variant_title}</span>
                                                                            </div>
                                                                            <span className="font-mono opacity-60">${item.price}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                <div className="bg-black/20 p-2 rounded text-[10px] space-y-1 font-mono opacity-70">
                                                                    <div className="flex justify-between">
                                                                        <span>Subtotal</span>
                                                                        <span>${orderDetails.subtotal_price}</span>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span>Envío</span>
                                                                        <span>${orderDetails.total_shipping_price_set?.shop_money?.amount || '0.00'}</span>
                                                                    </div>
                                                                    <div className="flex justify-between text-pink-400 font-bold border-t border-white/10 pt-1 mt-1">
                                                                        <span>Total</span>
                                                                        <span>${orderDetails.total_price}</span>
                                                                    </div>
                                                                </div>

                                                                {orderDetails.shipping_address && (
                                                                    <div className="text-[10px] opacity-50">
                                                                        <p className="uppercase font-bold text-[8px] mb-1">Envío a:</p>
                                                                        <p>{orderDetails.shipping_address.address1}, {orderDetails.shipping_address.city}</p>
                                                                        <p>{orderDetails.shipping_address.province}, {orderDetails.shipping_address.zip}</p>
                                                                    </div>
                                                                )}

                                                                {orderDetails.fulfillments && orderDetails.fulfillments.length > 0 && (
                                                                    <div className="mt-2 pt-2 border-t border-white/10">
                                                                        <p className="uppercase font-bold text-[8px] mb-1 opacity-50 flex items-center gap-1">
                                                                            <Truck size={10} /> Rastreo
                                                                        </p>
                                                                        <div className="space-y-2">
                                                                            {orderDetails.fulfillments.map((fulfillment: any, idx: number) => (
                                                                                fulfillment.tracking_number && (
                                                                                    <div key={idx} className="flex flex-col text-[10px]">
                                                                                        {fulfillment.tracking_company && <span className="opacity-70 text-[9px] mb-0.5">{fulfillment.tracking_company}</span>}
                                                                                        <a
                                                                                            href={fulfillment.tracking_url}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 font-mono break-all"
                                                                                        >
                                                                                            {fulfillment.tracking_number}
                                                                                            <ExternalLink size={8} />
                                                                                        </a>
                                                                                    </div>
                                                                                )
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="text-center text-[10px] opacity-40 py-2 text-red-400">
                                                                Error cargando detalles.<br />
                                                                ID: {order.shopify_order_id}<br />
                                                                {orderDetails?.error || 'Sin respuesta del servidor'}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedTab === 'insights' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-pink-500/60">Insights y Comportamiento</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5">
                                            <p className="text-[9px] uppercase font-bold opacity-30 mb-2">Personalidad</p>
                                            <div className="flex flex-wrap gap-1">
                                                {selectedConv.facts?.personality && selectedConv.facts.personality.length > 0 ? (
                                                    selectedConv.facts.personality.map((p: string) => (
                                                        <span key={p} className="px-2 py-0.5 bg-pink-500/10 text-pink-500 text-[9px] rounded-md font-bold">{p}</span>
                                                    ))
                                                ) : (
                                                    ['Directo', 'Frio', 'Potencial'].map(p => (
                                                        <span key={p} className="px-2 py-0.5 bg-pink-500/10 text-pink-500 text-[9px] rounded-md font-bold">{p}</span>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5">
                                            <p className="text-[9px] uppercase font-bold opacity-30 mb-2">Insignias / Tags</p>
                                            <div className="flex flex-wrap gap-1">
                                                {/* Merge Shopify Tags and Local CRM Tags */}
                                                {(() => {
                                                    const shopifyTags = selectedConv.tags || [];
                                                    const localTags = selectedConv.facts?.tags || [];
                                                    const allTags = Array.from(new Set([...shopifyTags, ...localTags]));

                                                    if (allTags.length > 0) {
                                                        return allTags.map((tag: string) => (
                                                            <span key={tag} className={`px-2 py-0.5 text-[9px] rounded-md font-bold border ${getTagColor(tag)}`}>{tag}</span>
                                                        ));
                                                    }
                                                    return <span className="text-[9px] opacity-30 italic">Sin etiquetas</span>;
                                                })()}
                                            </div>
                                        </div>
                                        <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5">
                                            <p className="text-[9px] uppercase font-bold opacity-30 mb-2">Interés</p>
                                            <p className="text-xs font-bold">
                                                {selectedConv.facts?.interests ? selectedConv.facts.interests.join(', ') : 'Vapes, Gummies'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-pink-500/60">Comportamiento en Tienda</h4>
                                    <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5 max-h-60 overflow-y-auto scrollbar-thin">
                                        {loadingEvents ? (
                                            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-pink-500" /></div>
                                        ) : browsingEvents.length > 0 ? (
                                            <div className="space-y-3">
                                                {browsingEvents.map((event, i) => (
                                                    <div key={i} className="flex gap-3 items-start border-l-2 border-white/5 pl-3 py-1">
                                                        <div className="mt-1">
                                                            {event.event_type === 'view_product' ? <Eye size={12} className="text-blue-400" /> : <Search size={12} className="text-cyan-400" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-baseline">
                                                                <p className="text-[11px] font-bold truncate">
                                                                    {event.event_type === 'view_product' ? `Vio ${event.metadata?.product_name || 'Producto'}` : `Buscó: "${event.metadata?.query || '...'}"`}
                                                                </p>
                                                                <span className="text-[8px] opacity-30 font-mono">
                                                                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <p className="text-[9px] opacity-40 truncate">{event.url || 'Shopify Store'}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 opacity-20 flex flex-col items-center gap-2">
                                                <Activity size={20} />
                                                <p className="text-[10px] uppercase font-bold tracking-widest">Sin actividad reciente</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-pink-500/60">Acciones Recomendadas (AI)</h4>
                                    <div className="space-y-2">
                                        {selectedConv.facts?.action_plan && selectedConv.facts.action_plan.length > 0 ? (
                                            selectedConv.facts.action_plan.map((action: any, j: number) => (
                                                <button
                                                    key={j}
                                                    onClick={() => handleActionClick(action)}
                                                    className="w-full text-left p-4 rounded-2xl bg-black/20 border border-white/5 group hover:border-pink-500/40 transition-all flex items-center justify-between"
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-xs font-bold group-hover:text-pink-400 transition-colors">{action.label}</span>
                                                        <span className="text-[9px] opacity-30 uppercase font-mono">{action.meta}</span>
                                                    </div>
                                                    <div className="p-2 rounded-xl bg-white/5 group-hover:bg-pink-500 group-hover:text-white transition-all">
                                                        <Plus size={14} />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="text-center opacity-30 text-[10px] py-4 border border-dashed border-white/10 rounded-xl">
                                                Esperando análisis de Cortex...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {showToolEditor && <ToolEditor onClose={() => setShowToolEditor(false)} />}
            </div >
        </Screen>
    );
};

export default AdminCRM;
