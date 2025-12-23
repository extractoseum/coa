
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    ArrowLeft, Save, Folder, FileText, Brain, ChevronRight, Check, AlertCircle,
    ChevronDown, Plus, Trash2, Star, CheckSquare, Square, Search, Settings,
    Wrench, MessageCircle, Mail, Globe, Database, FileBox, Activity, Layout as LayoutIcon,
    ShoppingBag, ShoppingCart, Bell, Truck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Editor from '@monaco-editor/react';
import { Screen } from '../telemetry/Screen';

interface FileItem {
    name: string;
    path: string;
    isInstructive?: boolean;
    summary?: string | null;
    lastAnalyzed?: string | null;
}

interface AgentFolder {
    name: string;
    type: 'agent';
    hasIdentity: boolean;
    isActive: boolean;
    files: FileItem[];
}

interface KnowledgeStructure {
    [key: string]: FileItem[] | AgentFolder[];
}

const AdminAIKnowledge = () => {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const token = localStorage.getItem('accessToken');

    const [structure, setStructure] = useState<KnowledgeStructure>({});
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});
    const [uploading, setUploading] = useState(false);
    const [toolsRegistry, setToolsRegistry] = useState<any[]>([]);

    // Simulator State
    const [chatMessage, setChatMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: string, content: string }[]>([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [selectedPersona, setSelectedPersona] = useState<string>('');
    const [editorRef, setEditorRef] = useState<any>(null);
    const [showToolbox, setShowToolbox] = useState(true);
    const [toolSearch, setToolSearch] = useState('');
    const [selectedModel, setSelectedModel] = useState('gpt-4o');
    const [modelStatus, setModelStatus] = useState<Record<string, { status: string, error?: string }>>({});

    const models = [
        { id: 'gpt-4o', name: 'GPT-4o (Stable)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'o1-preview', name: 'OpenAI o1 Preview' },
        { id: 'o1-mini', name: 'OpenAI o1 Mini' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-flash-latest', name: 'Gemini 1.5 Flash' }
    ];

    useEffect(() => {
        fetchStructure();
        fetchToolsRegistry();
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/v1/ai/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ models })
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                const statusMap: any = {};
                data.data.forEach((m: any) => {
                    statusMap[m.id] = { status: m.status, error: m.error };
                });
                setModelStatus(statusMap);
            }
        } catch (e) { console.error('Failed to fetch model status'); }
    };

    const fetchToolsRegistry = async () => {
        try {
            const res = await fetch('/api/v1/admin/knowledge/tools-registry', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) setToolsRegistry(data.data);
        } catch (err) {
            console.error('Error fetching tools registry:', err);
        }
    };

    const fetchStructure = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/v1/admin/knowledge', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.data) {
                setStructure(data.data);
            } else {
                setError(data.error || 'Respuesta inválida del servidor');
            }
        } catch (err) {
            setError('Error al cargar la estructura');
        } finally {
            setLoading(false);
        }
    };

    const handleFileClick = async (folder: string, filename: string) => {
        try {
            setLoading(true);
            setSelectedFolder(folder);
            setSelectedFile(filename);
            setError(null);
            setSuccessMsg(null);

            const encodedPath = encodeURIComponent(filename);
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/file?path=${encodedPath}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setFileContent(data.data.content);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al leer el archivo');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedFolder || !selectedFile) return;
        try {
            setSaving(true);
            setSuccessMsg(null);
            setError(null);
            const encodedPath = encodeURIComponent(selectedFile);
            const res = await fetch(`/api/v1/admin/knowledge/${selectedFolder}/file?path=${encodedPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ content: fileContent })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Archivo guardado correctamente');
                await fetchStructure();
                setTimeout(() => setSuccessMsg(null), 3000);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const toggleAgentExpand = (agentName: string) => {
        setExpandedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
    };

    const handleAddNewFile = (folder: string, agentName?: string) => {
        const name = prompt('Nombre del nuevo archivo (ej: reglas.md):');
        if (!name) return;
        const filename = name.endsWith('.md') ? name : `${name}.md`;
        const fullPath = agentName ? `${agentName}/${filename}` : filename;
        setSelectedFolder(folder);
        setSelectedFile(fullPath);
        setFileContent('');
        setError(null);
        setSuccessMsg(`Borrador preparado: ${filename}. No olvides guardar.`);
    };

    const handleSetActiveAgent = async (folder: string, agentName: string) => {
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/active-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ agentName })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg(`Agente ${agentName} seleccionado como activo`);
                await fetchStructure();
                setTimeout(() => setSuccessMsg(null), 3000);
            } else {
                setError(data.error);
            }
        } catch (err) { setError('Error al activar agente'); }
    };

    const handleCreateNewAgent = async (folder: string) => {
        const name = prompt('Nombre del nuevo agente (ej: Ara Sales 2):');
        if (!name) return;
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/new-agent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ agentName: name })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg(`Agente ${name} creado con éxito`);
                await fetchStructure();
                const agentId = data.data.name;
                setExpandedAgents(prev => ({ ...prev, [agentId]: true }));
                setSelectedFolder(folder);
                setSelectedFile(`${agentId}/identity.md`);
                setFileContent(`# SYSTEM ROLE: ${name}\n\nIdentity description goes here...`);
            } else {
                setError(data.error);
            }
        } catch (err) { setError('Error al crear agente'); }
    };

    const handleMarkAsInstructive = async (folder: string, filePath: string) => {
        if (!window.confirm('¿Deseas marcar este archivo como el instructivo principal?')) return;
        try {
            setLoading(true);
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/mark-instructive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ path: filePath })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Archivo marcado como instructivo principal');
                await fetchStructure();
            } else { setError(data.error); }
        } catch (err) { setError('Error al marcar como instructivo'); } finally { setLoading(false); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, folder: string, agentName?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', folder);
            if (agentName) formData.append('agentName', agentName);
            const res = await fetch('/api/v1/admin/knowledge/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Archivo procesado con éxito');
                await fetchStructure();
                const newPath = data.data.path.includes('/') ? data.data.path.split('/').slice(1).join('/') : data.data.path;
                setSelectedFolder(folder);
                setSelectedFile(newPath);
                handleFileClick(folder, newPath);
            } else { setError(data.error || 'Error al subir archivo'); }
        } catch (err) { setError('Error de conexión al subir'); } finally { setUploading(false); if (e.target) e.target.value = ''; }
    };

    const handleSendMessage = async () => {
        if (!chatMessage.trim()) return;
        const userMsg = chatMessage;
        setChatMessage('');
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
        setChatLoading(true);
        try {
            const res = await fetch('/api/v1/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: userMsg, persona: selectedPersona, history: chatHistory, model: selectedModel })
            });
            const data = await res.json();
            if (data.success && data.data.content) {
                setChatHistory(prev => [...prev, { role: 'assistant', content: data.data.content }]);
            } else {
                setChatHistory(prev => [...prev, { role: 'system', content: `Error: ${data.error || 'No response'}` }]);
            }
        } catch (err) { setChatHistory(prev => [...prev, { role: 'system', content: 'Connection Error' }]); } finally { setChatLoading(false); }
    };

    const folderNames: Record<string, string> = {
        agents_god_mode: 'AGENTS_GOD_MODE',
        agents_public: 'AGENTS_PUBLIC',
        agents_internal: 'AGENTS_INTERNAL',
        instructions: 'INSTRUCCIONES GLOBALES',
        information: 'BASE DE DATOS (CONTEXTO)',
        core: 'CORE'
    };

    const AGENT_FOLDERS = ['agents_god_mode', 'agents_public', 'agents_internal'];

    const handleDeleteFile = async (folder: string, filename: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar ${filename}?`)) return;
        try {
            setLoading(true);
            const encodedPath = encodeURIComponent(filename);
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/file?path=${encodedPath}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Archivo eliminado');
                if (selectedFile === filename && selectedFolder === folder) {
                    setSelectedFile(null);
                    setFileContent('');
                }
                await fetchStructure();
            } else { setError(data.error); }
        } catch (err) { setError('Error al eliminar'); } finally { setLoading(false); }
    };

    return (
        <Screen id="AdminAIKnowledge">
            <Layout>
                <div className="min-h-screen p-6" style={{ backgroundColor: 'transparent' }}>
                    {/* Header */}
                    <div className="max-w-7xl mx-auto mb-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-3 rounded-xl" style={{ backgroundColor: `${theme.accent}15` }}>
                                <Brain size={32} style={{ color: theme.accent }} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Editor de Agentes AI</h1>
                                <p style={{ color: theme.textMuted }}>Diseña, edita y simula el comportamiento de tus agentes inteligentes.</p>
                            </div>
                        </div>
                    </div>

                    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-180px)]">
                        {/* Structure Explorer */}
                        <div className="lg:col-span-3 flex flex-col glass-morphism rounded-3xl overflow-hidden border border-white/5"
                            style={{ backgroundColor: `${theme.cardBg}80`, borderColor: theme.border }}>
                            <div className="p-4 border-b border-white/5 shrink-0">
                                <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 flex items-center gap-2"
                                    style={{ color: theme.text }}>
                                    <Folder size={14} /> Estructura
                                </h2>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin scrollbar-thumb-white/5">
                                {Object.keys(structure).filter(k => !k.endsWith('_config')).map(folder => (
                                    <div key={folder} className="mb-4">
                                        <div className="px-3 py-1 flex items-center justify-between mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-tighter opacity-30" style={{ color: theme.text }}>
                                                {folderNames[folder] || folder}
                                            </span>
                                            {!AGENT_FOLDERS.includes(folder) && (
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleAddNewFile(folder)} className="p-1 hover:bg-white/5 rounded text-[9px] font-bold transition-all" style={{ color: theme.accent }}>+ MD</button>
                                                    <label className="p-1 hover:bg-white/5 rounded text-[9px] font-bold transition-all cursor-pointer" style={{ color: theme.accent }}>
                                                        + Subir
                                                        <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, folder)} />
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        {AGENT_FOLDERS.includes(folder) ? (
                                            <div className="space-y-1">
                                                <button onClick={() => handleCreateNewAgent(folder)} className="ml-3 p-1 hover:bg-white/5 rounded text-[9px] font-bold transition-all opacity-40 hover:opacity-100" style={{ color: theme.accent }}>+ Nuevo Agente</button>
                                                {(structure[folder] as AgentFolder[]).map(agent => (
                                                    <div key={agent.name} className="space-y-0.5">
                                                        <div className="flex items-center group/agent">
                                                            <button onClick={() => toggleAgentExpand(agent.name)}
                                                                className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-sm font-medium transition-colors"
                                                                style={{ color: theme.text }}>
                                                                {expandedAgents[agent.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                <Brain size={12} style={{ color: agent.isActive ? theme.accent : theme.textMuted }} />
                                                                <span className="text-[11px] truncate">{agent.name}</span>
                                                            </button>
                                                            <button onClick={() => handleSetActiveAgent(folder, agent.name)}
                                                                className={`p-1 rounded transition-all ${agent.isActive ? 'text-green-500' : 'text-gray-500 opacity-20 hover:opacity-100'}`}>
                                                                {agent.isActive ? <CheckSquare size={16} /> : <Square size={16} />}
                                                            </button>
                                                        </div>

                                                        {expandedAgents[agent.name] && (
                                                            <div className="ml-6 space-y-0.5 border-l border-white/10 pl-2">
                                                                {agent.files.map(file => (
                                                                    <div key={file.path} className="group flex items-center justify-between">
                                                                        <button onClick={() => handleFileClick(folder, `${agent.name}/${file.name}`)}
                                                                            className={`flex-1 text-left px-2 py-1 rounded text-[11px] flex items-center gap-2 transition-colors ${selectedFile === `${agent.name}/${file.name}` && selectedFolder === folder ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                                                            style={{ color: selectedFile === `${agent.name}/${file.name}` && selectedFolder === folder ? theme.accent : theme.textMuted }}>
                                                                            <FileText size={11} className="opacity-50" />
                                                                            <div className="flex flex-col flex-1 min-w-0">
                                                                                <span className="truncate">{file.name}</span>
                                                                                {file.summary && (
                                                                                    <span className="text-[9px] opacity-40 truncate font-light" title={file.summary}>
                                                                                        {file.summary}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                        <div className="flex opacity-0 group-hover:opacity-100 transition-all">
                                                                            <button onClick={(e) => { e.stopPropagation(); handleMarkAsInstructive(folder, `${agent.name}/${file.name}`); }}
                                                                                className={`p-1 transition-colors ${file.isInstructive ? 'text-yellow-400' : 'hover:text-yellow-400'}`}
                                                                                title={file.isInstructive ? 'Instructivo Principal (Activo)' : 'Marcar como Instructivo'}>
                                                                                <Star size={10} fill={file.isInstructive ? theme.accent : 'none'} fillOpacity={file.isInstructive ? 0.4 : 0} />
                                                                            </button>
                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(folder, `${agent.name}/${file.name}`); }}
                                                                                className="p-1 hover:text-red-500 transition-colors">
                                                                                <Trash2 size={10} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <button onClick={() => handleAddNewFile(folder, agent.name)} className="px-2 py-1 text-[9px] opacity-40 hover:opacity-100 transition-all hover:text-green-500">+ Nuevo MD</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-0.5 mt-1">
                                                {(structure[folder] as FileItem[]).map(file => (
                                                    <div key={file.path} className="group flex items-center justify-between">
                                                        <button onClick={() => handleFileClick(folder, file.name)}
                                                            className={`flex-1 text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${selectedFile === file.name && selectedFolder === folder ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                                            style={{ color: selectedFile === file.name && selectedFolder === folder ? theme.accent : theme.textMuted }}>
                                                            <FileText size={12} className="opacity-50" />
                                                            <div className="flex flex-col flex-1 min-w-0">
                                                                <span className="truncate">{file.name}</span>
                                                                {file.summary && (
                                                                    <span className="text-[9px] opacity-40 truncate font-light" title={file.summary}>
                                                                        {file.summary}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(folder, file.name); }}
                                                            className="p-1 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all text-red-500">
                                                            <Trash2 size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Editor Area */}
                        <div className="lg:col-span-6 flex flex-col glass-morphism rounded-3xl overflow-hidden border border-white/5"
                            style={{ backgroundColor: `${theme.cardBg}80`, borderColor: theme.border }}>
                            {selectedFile ? (
                                <>
                                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40" style={{ color: theme.text }}>Editor</h2>
                                            <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                                <span className="text-[10px] opacity-40" style={{ color: theme.text }}>{selectedFolder} /</span>
                                                <span className="text-[10px] font-bold" style={{ color: theme.accent }}>{selectedFile}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setShowToolbox(!showToolbox)}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-2`}
                                                style={{
                                                    backgroundColor: showToolbox ? `${theme.accent}20` : 'transparent',
                                                    color: showToolbox ? theme.accent : theme.textMuted,
                                                    borderColor: showToolbox ? theme.accent : 'rgba(255,255,255,0.1)'
                                                }}>
                                                <Wrench size={12} /> {showToolbox ? 'Ocultar Toolbox' : 'Herramientas'}
                                            </button>
                                            <button onClick={handleSave} disabled={saving}
                                                className="px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider text-white shadow-lg transition-all flex items-center gap-2"
                                                style={{ backgroundColor: theme.accent, boxShadow: `0 4px 12px ${theme.accent}30` }}>
                                                {saving ? <Activity className="animate-spin" size={12} /> : <Save size={12} />} Guardar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 flex overflow-hidden">
                                        <div className="flex-1 h-full min-w-0">
                                            <Editor
                                                theme="vs-dark"
                                                defaultLanguage="markdown"
                                                value={fileContent}
                                                onMount={(editor) => setEditorRef(editor)}
                                                onChange={(val) => setFileContent(val || '')}
                                                options={{
                                                    minimap: { enabled: false },
                                                    fontSize: 13,
                                                    padding: { top: 20 },
                                                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                                                    lineNumbers: 'on',
                                                    wordWrap: 'on',
                                                    scrollBeyondLastLine: false,
                                                    automaticLayout: true
                                                }}
                                            />
                                        </div>

                                        {showToolbox && (
                                            <div className="w-64 border-l border-white/5 flex flex-col bg-black/10 animate-in slide-in-from-right-4 duration-300">
                                                <div className="p-3 border-b border-white/5">
                                                    <div className="relative">
                                                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                                                        <input type="text" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} placeholder="Buscar tools..."
                                                            className="w-full bg-black/20 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-[10px] outline-none transition-all"
                                                            style={{ color: theme.text }}
                                                            onFocus={(e) => e.target.style.borderColor = theme.accent} />
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                                                    {toolsRegistry.filter(t =>
                                                        (t.name || '').toLowerCase().includes(toolSearch.toLowerCase()) ||
                                                        (t.description || '').toLowerCase().includes(toolSearch.toLowerCase())
                                                    ).map(tool => (
                                                        <div key={tool.name} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 group hover:bg-white/[0.05] transition-all">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-[10px] font-bold" style={{ color: theme.accent }}>{tool.name}</span>
                                                                <button onClick={() => {
                                                                    if (editorRef) {
                                                                        const snippet = `\n- Tool: ${tool.name}\n  Desc: ${tool.description}\n`;
                                                                        const pos = editorRef.getPosition();
                                                                        editorRef.executeEdits('', [{ range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: snippet }]);
                                                                    }
                                                                }} className="p-1 rounded bg-white/5 text-white opacity-0 group-hover:opacity-100 transition-all">
                                                                    <Plus size={10} />
                                                                </button>
                                                            </div>
                                                            <p className="text-[9px] opacity-40 leading-relaxed" style={{ color: theme.textMuted }}>{tool.description}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                                    <Brain size={80} />
                                    <p className="mt-4 text-sm font-light">Selecciona un archivo para comenzar</p>
                                </div>
                            )}
                        </div>

                        {/* Simulator Area */}
                        <div className="lg:col-span-3 flex flex-col glass-morphism rounded-3xl overflow-hidden border border-white/5"
                            style={{ backgroundColor: `${theme.cardBg}80`, borderColor: theme.border }}>
                            <div className="p-4 border-b border-white/5 shrink-0">
                                <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-40 flex items-center gap-2"
                                    style={{ color: theme.text }}>
                                    <Activity size={14} /> Simulador
                                </h2>
                            </div>

                            <div className="p-3 space-y-2 bg-black/10 shrink-0">
                                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 text-[10px] outline-none transition-all"
                                    style={{ color: theme.text }}>
                                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)}
                                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 text-[10px] outline-none transition-all"
                                    style={{ color: theme.text }}>
                                    <option value="">Persona...</option>
                                    {AGENT_FOLDERS.map(cat => Array.isArray(structure[cat]) && (structure[cat] as AgentFolder[]).map(agent => (
                                        <option key={agent.name} value={agent.name}>{agent.name}</option>
                                    )))}
                                </select>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/10 scrollbar-thin scrollbar-thumb-white/5">
                                {chatHistory.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm ${m.role === 'user' ? 'text-white' : 'bg-white/5 text-gray-200 border border-white/10'}`}
                                            style={{ backgroundColor: m.role === 'user' ? theme.accent : undefined }}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))}
                                {chatLoading && <div className="text-[10px] opacity-40 text-center animate-pulse">Pensando...</div>}
                            </div>

                            <div className="p-4 border-t border-white/5 shrink-0">
                                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                                    <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Simular chat..."
                                        className="flex-1 bg-black/20 border border-white/5 rounded-xl px-4 py-2 text-xs outline-none transition-all"
                                        style={{ color: theme.text }}
                                        onFocus={(e) => e.target.style.borderColor = theme.accent} />
                                    <button type="submit" disabled={chatLoading} className="p-2 rounded-xl text-white shadow-lg transition-all"
                                        style={{ backgroundColor: theme.accent }}>
                                        <ChevronRight size={18} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </Screen>
    );
};

export default AdminAIKnowledge;
