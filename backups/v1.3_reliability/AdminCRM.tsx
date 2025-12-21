
import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
    Layout, MessageSquare, Brain, User, Clock,
    MoreVertical, Send, Filter, Search, Plus,
    Instagram, Facebook, Mail, Globe, AlertCircle,
    CheckCircle2, PauseCircle, ChevronRight,
    ShoppingBag, ShoppingCart, Bell, Truck, Database,
    FileBox, Activity, Wrench, MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
}

const AdminCRM = () => {
    const { theme } = useTheme();
    const { isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const token = localStorage.getItem('accessToken');

    const [columns, setColumns] = useState<Column[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [selectedColumn, setSelectedColumn] = useState<Column | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [agentsMetadata, setAgentsMetadata] = useState<AgentMetadata[]>([]);
    const [toolsRegistry, setToolsRegistry] = useState<ToolRegistryItem[]>([]);

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
                    <button className="p-2 rounded-full hover:bg-white/5 transition-colors" style={{ color: theme.textMuted }}>
                        <Filter size={20} />
                    </button>
                    <button onClick={() => navigate('/')} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: theme.text, borderColor: theme.border }}>
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
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            {getChannelIcon(conv.channel)}
                                            <span className="text-xs font-bold truncate w-32" style={{ color: theme.text }}>{conv.contact_handle}</span>
                                        </div>
                                        <span className="text-[10px] opacity-40 font-mono" style={{ color: theme.textMuted }}>
                                            {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
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

                            <button className="w-full py-3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 opacity-20 hover:opacity-50 transition-all group" style={{ borderColor: theme.border, color: theme.text }}>
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
            {selectedConv && (
                <div className="fixed inset-y-0 right-0 w-[500px] shadow-2xl z-[100] border-l flex flex-col animate-in slide-in-from-right duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                    <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                        <div className="flex items-center gap-3">
                            {getChannelIcon(selectedConv.channel)}
                            <div>
                                <h3 className="font-bold text-sm" style={{ color: theme.text }}>{selectedConv.contact_handle}</h3>
                                <div className="flex items-center gap-1 text-[10px] text-green-500">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" /> ONLINE
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedConv(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                            <MoreVertical size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Messages Placeholder */}
                        <div className="text-center py-20 opacity-20">
                            <MessageSquare size={48} className="mx-auto mb-4" />
                            <p className="text-sm">Cargando historial de mensajes...</p>
                        </div>
                    </div>

                    <div className="p-4 border-t" style={{ borderColor: theme.border }}>
                        <div className="flex gap-2 bg-black/10 rounded-2xl p-2 items-end border border-white/5">
                            <textarea
                                placeholder="Escribe un mensaje..."
                                className="flex-1 bg-transparent border-none outline-none text-sm p-2 resize-none max-h-32"
                                style={{ color: theme.text }}
                                rows={1}
                            />
                            <button className="p-3 rounded-xl bg-pink-500 text-white shadow-lg hover:bg-pink-600 active:scale-90 transition-all">
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminCRM;
