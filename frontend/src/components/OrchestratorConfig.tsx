
import React, { useState, useEffect } from 'react';
import {
    Cpu, Layers, Zap, Plus, X, Save, Trash2,
    Hash, Globe, Tag, MessageSquare, AlertCircle,
    ArrowRight, Settings, Filter, Search, Smile
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface ChannelChip {
    id?: string;
    channel_id: string;
    platform: string;
    account_reference?: string;
    traffic_source?: string;
    expected_intent?: string;
    default_entry_column_id?: string;
    default_agent_id?: string;
    is_active: boolean;
    config?: any; // Added JSON config
}

interface MiniChip {
    id?: string;
    chip_type: 'tag' | 'geo' | 'intent' | 'mood' | 'score';
    key: string;
    trigger_type: 'event' | 'message' | 'ai_inference';
    trigger_config: any;
    actions: any[];
    priority: number;
    active: boolean;
}

const OrchestratorConfig = ({ onClose }: { onClose: () => void }) => {
    const { theme } = useTheme();
    const token = localStorage.getItem('accessToken');

    const [activeTab, setActiveTab] = useState<'channels' | 'mini'>('channels');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [channelChips, setChannelChips] = useState<ChannelChip[]>([]);
    const [miniChips, setMiniChips] = useState<MiniChip[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);

    const [editingChip, setEditingChip] = useState<any | null>(null);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [cRes, mRes, colRes, aRes] = await Promise.all([
                fetch('/api/v1/crm/chips/channel', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/crm/chips/mini', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/crm/columns', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/v1/admin/knowledge/agents-metadata', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const cData = await cRes.json();
            const mData = await mRes.json();
            const colData = await colRes.json();
            const aData = await aRes.json();

            if (cData.success) setChannelChips(cData.data);
            if (mData.success) setMiniChips(mData.data);
            if (colData.success) setColumns(colData.data);
            if (aData.success) setAgents(aData.data);
        } catch (err) {
            console.error('Failed to load chips', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveChip = async (chip: any) => {
        setSaving(true);
        try {
            const type = activeTab === 'channels' ? 'channel' : 'mini';
            const res = await fetch(`/api/v1/crm/chips/${type}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(chip)
            });
            const data = await res.json();
            if (data.success) {
                if (activeTab === 'channels') {
                    setChannelChips(prev => chip.id ? prev.map(c => c.id === chip.id ? data.data : c) : [data.data, ...prev]);
                } else {
                    setMiniChips(prev => chip.id ? prev.map(c => c.id === chip.id ? data.data : c) : [data.data, ...prev]);
                }
                setEditingChip(null);
            }
        } catch (err) {
            console.error('Save failed', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
            <div
                className="w-full max-w-5xl h-[85vh] flex flex-col rounded-3xl overflow-hidden border shadow-2xl animate-in fade-in zoom-in duration-300"
                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
            >
                {/* Header */}
                <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg text-white">
                            <Cpu size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight" style={{ color: theme.text }}>Omnichannel Orchestrator</h2>
                            <p className="text-xs opacity-40 uppercase font-bold tracking-widest mt-1 underline cursor-help" onClick={() => setShowHelp(true)}>Manual de Conexión & Webhooks</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Tab Switcher */}
                <div className="flex px-6 border-b" style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <button
                        onClick={() => setActiveTab('channels')}
                        className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'channels' ? 'border-pink-500 text-pink-500' : 'border-transparent text-gray-500'}`}
                    >
                        Capa 1: Channel Chips
                    </button>
                    <button
                        onClick={() => setActiveTab('mini')}
                        className={`px-6 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${activeTab === 'mini' ? 'border-pink-500 text-pink-500' : 'border-transparent text-gray-500'}`}
                    >
                        Capa 2: Mini-Chips (Triggers)
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <RefreshCw size={48} className="animate-spin mb-4" />
                            <p className="text-sm font-light">Sincronizando con el cerebro central...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Add New Button */}
                            <button
                                onClick={() => setEditingChip({})}
                                className="h-40 rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center group hover:border-pink-500/50 hover:bg-pink-500/5 transition-all"
                            >
                                <div className="p-3 rounded-full bg-white/5 group-hover:bg-pink-500/10 group-hover:scale-110 transition-all text-white/20 group-hover:text-pink-500 mb-2">
                                    <Plus size={24} />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider opacity-30 group-hover:opacity-100">Nuevo Chip</span>
                            </button>

                            {activeTab === 'channels' ? (
                                channelChips.map(chip => (
                                    <div
                                        key={chip.id}
                                        onClick={() => setEditingChip(chip)}
                                        className="h-40 p-5 rounded-3xl border border-white/5 bg-white/[0.02] flex flex-col justify-between hover:border-pink-500/30 hover:bg-white/[0.04] transition-all cursor-pointer group animate-in slide-in-from-bottom-2 duration-300"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-black/40 border border-white/5 shadow-inner">
                                                    {chip.platform === 'whatsapp' ? <MessageSquare size={16} className="text-green-500" /> : <Globe size={16} className="text-pink-500" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-white">{chip.channel_id}</span>
                                                    <span className="text-[9px] opacity-40 uppercase tracking-widest">{chip.platform}</span>
                                                </div>
                                            </div>
                                            <div className={`px-2 py-0.5 rounded text-[8px] font-bold ${chip.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {chip.is_active ? 'ACTIVE' : 'DISABLED'}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 px-3 py-2 rounded-xl bg-black/40 text-[9px] font-mono opacity-60">
                                                {chip.account_reference || 'Sin Referencia'}
                                            </div>
                                            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 group-hover:scale-110 transition-transform">
                                                <ArrowRight size={14} />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                miniChips.map(chip => (
                                    <div
                                        key={chip.id}
                                        onClick={() => setEditingChip(chip)}
                                        className="h-40 p-5 rounded-3xl border border-white/5 bg-white/[0.02] flex flex-col justify-between hover:border-pink-500/30 hover:bg-white/[0.04] transition-all cursor-pointer group animate-in slide-in-from-bottom-2 duration-300"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-black/40 border border-white/5 shadow-inner">
                                                    {chip.chip_type === 'mood' ? <Smile size={16} className="text-yellow-400" /> : <Tag size={16} className="text-cyan-400" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-white">{chip.key}</span>
                                                    <span className="text-[9px] opacity-40 uppercase tracking-widest">{chip.chip_type}</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] font-bold opacity-30">P:{chip.priority}</span>
                                        </div>

                                        <p className="text-[10px] opacity-50 line-clamp-2 italic px-1 border-l border-white/10">
                                            {chip.trigger_config.pattern ? `TR: "${chip.trigger_config.pattern}"` : 'Trigger: Personalizado'}
                                        </p>

                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {chip.actions.slice(0, 2).map((a, i) => (
                                                <span key={i} className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5 opacity-60">
                                                    {a.type}
                                                </span>
                                            ))}
                                            {chip.actions.length > 2 && <span className="text-[8px] opacity-30">+{chip.actions.length - 2}</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Editor Modal Inside Sidepanel (Simplified for now) */}
                {editingChip && (
                    <div className="absolute inset-0 z-[10] bg-black/60 backdrop-blur-md flex items-center justify-end">
                        <div
                            className="w-full max-w-md h-full bg-black/90 p-8 border-l flex flex-col shadow-2xl animate-in slide-in-from-right duration-500"
                            style={{ borderColor: theme.border }}
                        >
                            <div className="flex justify-between items-center mb-10">
                                <h3 className="text-xl font-bold text-white">Configurar Chip</h3>
                                <button onClick={() => setEditingChip(null)} className="p-2 rounded-full hover:bg-white/5">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 space-y-6 overflow-y-auto pr-2 scrollbar-thin">
                                {activeTab === 'channels' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Platform</label>
                                            <select
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-pink-500/50 appearance-none"
                                                value={editingChip.platform || 'whatsapp'}
                                                onChange={e => setEditingChip({ ...editingChip, platform: e.target.value })}
                                            >
                                                <option value="whatsapp">WhatsApp</option>
                                                <option value="instagram">Instagram</option>
                                                <option value="facebook">Facebook</option>
                                                <option value="email">Email</option>
                                                <option value="telegram">Telegram</option>
                                                <option value="twitter">X (Twitter)</option>
                                                <option value="linkedin">LinkedIn</option>
                                                <option value="tiktok">TikTok</option>
                                                <option value="shop">Shop App</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Internal ID</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-pink-500/50"
                                                value={editingChip.channel_id || ''}
                                                onChange={e => setEditingChip({ ...editingChip, channel_id: e.target.value })}
                                                placeholder="e.g. whapi_marketing_01"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Account (Whapi ID/Num)</label>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-pink-500/50"
                                                value={editingChip.account_reference || ''}
                                                onChange={e => setEditingChip({ ...editingChip, account_reference: e.target.value })}
                                                placeholder="+521..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Default Column</label>
                                                <select
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-[11px] text-white outline-none focus:border-pink-500/50"
                                                    value={editingChip.default_entry_column_id || ''}
                                                    onChange={e => setEditingChip({ ...editingChip, default_entry_column_id: e.target.value })}
                                                >
                                                    <option value="">(Ninguna)</option>
                                                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Default Agent</label>
                                                <select
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-[11px] text-white outline-none focus:border-pink-500/50"
                                                    value={editingChip.default_agent_id || ''}
                                                    onChange={e => setEditingChip({ ...editingChip, default_agent_id: e.target.value })}
                                                >
                                                    <option value="">(Heredado)</option>
                                                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Advanced Config (JSON)</label>
                                            <textarea
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-mono text-cyan-400 outline-none focus:border-cyan-500/50 h-24"
                                                value={editingChip.config ? JSON.stringify(editingChip.config, null, 2) : ''}
                                                onChange={e => {
                                                    try {
                                                        const val = e.target.value ? JSON.parse(e.target.value) : {};
                                                        setEditingChip({ ...editingChip, config: val });
                                                    } catch (err: any) {
                                                        // Transient parse error
                                                        setEditingChip({ ...editingChip, _raw_config: e.target.value });
                                                    }
                                                }}
                                                placeholder='{ "token": "CUSTOM_WHAPI_TOKEN" }'
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Chip Category</label>
                                            <select
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-pink-500/50 appearance-none"
                                                value={editingChip.chip_type || 'tag'}
                                                onChange={e => setEditingChip({ ...editingChip, chip_type: e.target.value })}
                                            >
                                                <option value="tag">Tag Trigger</option>
                                                <option value="mood">Mood Trigger</option>
                                                <option value="intent">Intent Trigger</option>
                                                <option value="score">Score Trigger</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Chip Key / Etiqueta</label>
                                                <span className="text-[9px] text-pink-400 opacity-60 italic">Nombre de la etiqueta o categoría</span>
                                            </div>
                                            <input
                                                list="common-tags"
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-pink-500/50"
                                                value={editingChip.key || ''}
                                                onChange={e => setEditingChip({ ...editingChip, key: e.target.value })}
                                                placeholder="Responde con: VIP, B2B, Mayoreo..."
                                            />
                                            <datalist id="common-tags">
                                                <option value="VIP" />
                                                <option value="B2B" />
                                                <option value="Mayoreo" />
                                                <option value="Urgente" />
                                                <option value="Spam" />
                                                <option value="Soporte" />
                                            </datalist>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] font-bold uppercase opacity-40 tracking-widest">Patrón de Detección (Regex)</label>
                                                <div className="flex gap-2">
                                                    <span className="px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 text-[8px] font-bold border border-cyan-400/20">REGEX ENABLED</span>
                                                </div>
                                            </div>
                                            <input
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-mono text-cyan-400 outline-none focus:border-cyan-500/50"
                                                value={editingChip.trigger_config?.pattern || ''}
                                                onChange={e => setEditingChip({ ...editingChip, trigger_config: { ...editingChip.trigger_config, pattern: e.target.value } })}
                                                placeholder="hola|info|precio|quiero comprar"
                                            />
                                            <div className="p-4 rounded-2xl bg-cyan-400/5 border border-cyan-400/10 space-y-2">
                                                <p className="text-[9px] text-cyan-200/60 leading-relaxed font-light">
                                                    💡 <b>Tip de Experto:</b> Usa el símbolo <code className="text-cyan-400">|</code> para separar palabras (actúa como un "O").
                                                    <br />Ejemplo: <code className="text-cyan-400">empresa|distribuidor|mayoreo</code> detectará cualquiera de las tres.
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => handleSaveChip(editingChip)}
                                disabled={saving}
                                className="w-full py-4 mt-8 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50"
                            >
                                {saving ? 'Guardando...' : 'Aplicar Cambios'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {/* Help Overlay */}
            {showHelp && (
                <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-xl p-8 overflow-y-auto animate-in fade-in zoom-in duration-300">
                    <div className="max-w-3xl mx-auto space-y-12">
                        <div className="flex justify-between items-center border-b border-white/10 pb-6">
                            <h3 className="text-3xl font-black text-white italic">Cómo enlazar un nuevo Chip</h3>
                            <button onClick={() => setShowHelp(false)} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all">
                                <X size={28} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Whapi Section */}
                            <div className="p-8 rounded-[40px] bg-gradient-to-br from-green-500/10 to-emerald-600/5 border border-green-500/20 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)] text-white">
                                        <MessageSquare size={24} />
                                    </div>
                                    <h4 className="text-xl font-bold text-white">WhatsApp (Whapi)</h4>
                                </div>
                                <ol className="space-y-4 text-sm text-white/70 leading-relaxed font-light">
                                    <li className="flex gap-3"><span className="text-green-500 font-bold">1.</span> <span>Entra a tu <b>Dashboard de Whapi.cloud</b>.</span></li>
                                    <li className="flex gap-3"><span className="text-green-500 font-bold">2.</span> <span>Ve a la sección <b>API Keys</b> y copia tu "API Token".</span></li>
                                    <li className="flex gap-3"><span className="text-green-500 font-bold">3.</span> <span>En <b>Webhooks</b>, haz clic en "Add Webhook".</span></li>
                                    <li className="flex gap-3">
                                        <span className="text-green-500 font-bold">4.</span>
                                        <div>
                                            <span>URL:</span>
                                            <code className="block mt-2 p-3 rounded-xl bg-black/60 text-green-400 font-mono text-[10px] break-all border border-white/5">https://api.extractoseum.com/api/v1/crm/inbound</code>
                                        </div>
                                    </li>
                                    <li className="flex gap-3"><span className="text-green-500 font-bold">5.</span> <span>Selecciona <b>messages</b> y <b>statuses</b> en los eventos.</span></li>
                                </ol>
                            </div>

                            {/* Config Section */}
                            <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 rounded-2xl bg-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)] text-white">
                                        <Cpu size={24} />
                                    </div>
                                    <h4 className="text-xl font-bold text-white">Enlace en el CRM</h4>
                                </div>
                                <div className="space-y-4 text-sm text-white/70 leading-relaxed font-light">
                                    <p>Crea un nuevo Chip en la pestaña <b>Channel Chips</b> con estos datos:</p>
                                    <ul className="space-y-3">
                                        <li className="flex items-center gap-3">
                                            <Tag size={14} className="text-pink-500" />
                                            <span><b>Internal ID:</b> Nombre interno (ej: <code>whapi_marketing</code>)</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <Hash size={14} className="text-pink-500" />
                                            <span><b>Account:</b> El ID del canal o número (+52...)</span>
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <Layers size={14} className="text-pink-500" />
                                            <span><b>Advanced Config (JSON):</b></span>
                                        </li>
                                    </ul>
                                    <pre className="p-3 rounded-xl bg-black/60 text-cyan-400 font-mono text-[10px] border border-white/5">
                                        {`{
  "token": "TU_TOKEN_DE_WHAPI"
}`}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-200/60 text-center italic">
                            * El Webhook es único para todas tus líneas. El COA filtrará automáticamente a qué Chip pertenece cada mensaje entrante.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrchestratorConfig;

const RefreshCw = ({ size, className }: any) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
    </svg>
);
