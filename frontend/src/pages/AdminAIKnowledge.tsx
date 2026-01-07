
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
    ArrowLeft, Save, Folder, FileText, Brain, ChevronRight, Check,
    ChevronDown, Plus, Trash2, Star, CheckSquare, Square, Search, Settings,
    Wrench, MessageCircle, Mail, Globe, Database, FileBox, Activity, Layout as LayoutIcon,
    ShoppingBag, ShoppingCart, Bell, Truck, Zap, RefreshCw, BookOpen, StickyNote, X, GripVertical
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Editor from '@monaco-editor/react';
import { Screen } from '../telemetry/Screen';

type SnapCategory = 'product' | 'policy' | 'faq' | 'procedure' | 'reference' | 'pricing' | 'general';

interface KnowledgeSnap {
    fileName: string;
    path: string;
    summary: string;
    usage: string;
    adminNotes: string;
    lastUpdated: string;
    contentHash: string;
    isGlobal: boolean;
    // Enhanced fields
    triggers: string[];
    priority: number;
    category: SnapCategory;
    usageCount: number;
    effectivenessScore: number;
    lastUsed: string | null;
}

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

    // Knowledge Snaps State
    const [selectedAgentSnaps, setSelectedAgentSnaps] = useState<KnowledgeSnap[]>([]);
    const [showSnapsPanel, setShowSnapsPanel] = useState(false);
    const [selectedAgentForSnaps, setSelectedAgentForSnaps] = useState<{ folder: string; name: string } | null>(null);
    const [editingSnapNotes, setEditingSnapNotes] = useState<string | null>(null);
    const [snapNotesValue, setSnapNotesValue] = useState('');
    const [savingSnapNotes, setSavingSnapNotes] = useState(false);
    const [regeneratingSnap, setRegeneratingSnap] = useState<string | null>(null);
    const [editingSnapEnhanced, setEditingSnapEnhanced] = useState<string | null>(null);
    const [enhancedFormData, setEnhancedFormData] = useState<{ triggers: string; priority: number; category: SnapCategory }>({ triggers: '', priority: 5, category: 'general' });
    const [savingEnhanced, setSavingEnhanced] = useState(false);

    // Drag and Drop State
    const [draggedFile, setDraggedFile] = useState<{ path: string; folder: string; agentName?: string } | null>(null);
    const [dropTarget, setDropTarget] = useState<{ folder: string; agentName?: string } | null>(null);
    const [isMovingFile, setIsMovingFile] = useState(false);

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

    // Knowledge Snaps Functions
    const fetchAgentSnaps = async (folder: string, agentName: string) => {
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${folder}/${agentName}/snaps`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setSelectedAgentSnaps(data.data || []);
                setSelectedAgentForSnaps({ folder, name: agentName });
                setShowSnapsPanel(true);
            }
        } catch (err) {
            console.error('Error fetching snaps:', err);
        }
    };

    const saveSnapNotes = async (fileName: string) => {
        if (!selectedAgentForSnaps) return;
        setSavingSnapNotes(true);
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${selectedAgentForSnaps.folder}/${selectedAgentForSnaps.name}/snaps/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fileName, notes: snapNotesValue })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Notas guardadas');
                setEditingSnapNotes(null);
                await fetchAgentSnaps(selectedAgentForSnaps.folder, selectedAgentForSnaps.name);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al guardar notas');
        } finally {
            setSavingSnapNotes(false);
        }
    };

    const handleRegenerateSnap = async (fileName: string) => {
        if (!selectedAgentForSnaps) return;
        setRegeneratingSnap(fileName);
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${selectedAgentForSnaps.folder}/${selectedAgentForSnaps.name}/snaps/regenerate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ fileName })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Snap regenerado');
                await fetchAgentSnaps(selectedAgentForSnaps.folder, selectedAgentForSnaps.name);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al regenerar snap');
        } finally {
            setRegeneratingSnap(null);
        }
    };

    const [regeneratingAll, setRegeneratingAll] = useState(false);

    const handleRegenerateAllSnaps = async () => {
        if (!selectedAgentForSnaps) return;
        if (!confirm(`¿Regenerar todos los snaps para ${selectedAgentForSnaps.name}? Esto puede tomar varios minutos.`)) return;

        setRegeneratingAll(true);
        try {
            const res = await fetch(`/api/v1/admin/knowledge/${selectedAgentForSnaps.folder}/${selectedAgentForSnaps.name}/snaps/regenerate-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg(`Snaps regenerados: ${data.results.success} exitosos, ${data.results.failed} fallidos`);
                await fetchAgentSnaps(selectedAgentForSnaps.folder, selectedAgentForSnaps.name);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al regenerar snaps');
        } finally {
            setRegeneratingAll(false);
        }
    };

    const startEditingEnhanced = (snap: KnowledgeSnap) => {
        setEditingSnapEnhanced(snap.fileName);
        setEnhancedFormData({
            triggers: (snap.triggers || []).join(', '),
            priority: snap.priority || 5,
            category: snap.category || 'general'
        });
    };

    const saveEnhancedFields = async (fileName: string) => {
        if (!selectedAgentForSnaps) return;
        setSavingEnhanced(true);
        try {
            const triggersArray = enhancedFormData.triggers
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(t => t.length > 0);

            const res = await fetch(`/api/v1/admin/knowledge/${selectedAgentForSnaps.folder}/${selectedAgentForSnaps.name}/snaps/enhanced`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    fileName,
                    triggers: triggersArray,
                    priority: enhancedFormData.priority,
                    category: enhancedFormData.category
                })
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Configuración actualizada');
                setEditingSnapEnhanced(null);
                await fetchAgentSnaps(selectedAgentForSnaps.folder, selectedAgentForSnaps.name);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al guardar configuración');
        } finally {
            setSavingEnhanced(false);
        }
    };

    // Drag and Drop Functions
    const handleDragStart = (e: React.DragEvent, path: string, folder: string, agentName?: string) => {
        e.dataTransfer.effectAllowed = 'move';
        setDraggedFile({ path, folder, agentName });
    };

    const handleDragEnd = () => {
        setDraggedFile(null);
        setDropTarget(null);
    };

    const handleDragOver = (e: React.DragEvent, folder: string, agentName?: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // Don't allow dropping on the same location
        if (draggedFile?.folder === folder && draggedFile?.agentName === agentName) {
            return;
        }

        setDropTarget({ folder, agentName });
    };

    const handleDragLeave = () => {
        setDropTarget(null);
    };

    const handleDrop = async (e: React.DragEvent, destinationFolder: string, destinationAgent?: string) => {
        e.preventDefault();

        if (!draggedFile) return;

        // Don't allow dropping on the same location
        if (draggedFile.folder === destinationFolder && draggedFile.agentName === destinationAgent) {
            setDraggedFile(null);
            setDropTarget(null);
            return;
        }

        setIsMovingFile(true);

        try {
            const res = await fetch('/api/v1/admin/knowledge/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    sourcePath: draggedFile.path,
                    destinationFolder,
                    destinationAgent
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccessMsg(`Archivo movido exitosamente`);
                await fetchStructure();

                // Update selection if the moved file was selected
                if (selectedFile && selectedFolder === draggedFile.folder) {
                    setSelectedFolder(destinationFolder);
                    setSelectedFile(data.data.newPath.replace(`${destinationFolder}/`, ''));
                }
            } else {
                setError(data.error || 'Error al mover archivo');
            }
        } catch (err) {
            setError('Error de conexión al mover archivo');
        } finally {
            setIsMovingFile(false);
            setDraggedFile(null);
            setDropTarget(null);
        }
    };

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
                        <div className="lg:col-span-3 flex flex-col rounded-3xl overflow-hidden border"
                            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                            <div className="p-4 border-b shrink-0" style={{ borderColor: theme.border }}>
                                <h2 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                                    style={{ color: theme.textMuted }}>
                                    <Folder size={14} /> Estructura
                                </h2>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-4 scrollbar-thin scrollbar-thumb-white/5">
                                {Object.keys(structure).filter(k => !k.endsWith('_config')).map(folder => (
                                    <div key={folder} className="mb-4">
                                        <div className="px-3 py-1 flex items-center justify-between mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-tighter" style={{ color: theme.textMuted }}>
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
                                                {/* Drop zone indicator when dragging */}
                                                {draggedFile && (
                                                    <div className="mx-3 mb-2 p-2 rounded-lg border-2 border-dashed border-green-500/30 bg-green-500/5 text-center text-[9px] text-green-400">
                                                        Suelta en un agente para mover
                                                    </div>
                                                )}
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
                                                            <button onClick={() => fetchAgentSnaps(folder, agent.name)}
                                                                className="p-1 rounded transition-all text-amber-500 opacity-40 hover:opacity-100"
                                                                title="Ver Knowledge Snaps">
                                                                <Zap size={14} />
                                                            </button>
                                                            <button onClick={() => handleSetActiveAgent(folder, agent.name)}
                                                                className={`p-1 rounded transition-all ${agent.isActive ? 'text-green-500' : 'text-gray-500 opacity-20 hover:opacity-100'}`}>
                                                                {agent.isActive ? <CheckSquare size={16} /> : <Square size={16} />}
                                                            </button>
                                                        </div>

                                                        {expandedAgents[agent.name] && (
                                                            <div
                                                                className={`ml-6 space-y-0.5 border-l-2 pl-2 transition-all rounded-r ${dropTarget?.folder === folder && dropTarget?.agentName === agent.name ? 'border-green-500 bg-green-500/20 shadow-[inset_0_0_10px_rgba(34,197,94,0.2)]' : 'border-white/10'}`}
                                                                onDragOver={(e) => handleDragOver(e, folder, agent.name)}
                                                                onDragLeave={handleDragLeave}
                                                                onDrop={(e) => handleDrop(e, folder, agent.name)}
                                                            >
                                                                {agent.files.map(file => (
                                                                    <div
                                                                        key={file.path}
                                                                        className={`group flex items-center justify-between cursor-grab active:cursor-grabbing ${draggedFile?.path === `${folder}/${agent.name}/${file.name}` ? 'opacity-50 scale-95' : 'hover:bg-white/5'}`}
                                                                        draggable
                                                                        onDragStart={(e) => handleDragStart(e, `${folder}/${agent.name}/${file.name}`, folder, agent.name)}
                                                                        onDragEnd={handleDragEnd}
                                                                    >
                                                                        <GripVertical size={10} className="opacity-20 group-hover:opacity-60 transition-opacity flex-shrink-0" />
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
                                            <div
                                                className={`space-y-0.5 mt-1 rounded-lg p-1 transition-all ${dropTarget?.folder === folder && !dropTarget?.agentName ? 'bg-green-500/20 border-2 border-green-500 border-dashed shadow-[inset_0_0_10px_rgba(34,197,94,0.2)]' : ''}`}
                                                onDragOver={(e) => handleDragOver(e, folder)}
                                                onDragLeave={handleDragLeave}
                                                onDrop={(e) => handleDrop(e, folder)}
                                            >
                                                {(structure[folder] as FileItem[]).map(file => (
                                                    <div
                                                        key={file.path}
                                                        className={`group flex items-center justify-between cursor-grab active:cursor-grabbing ${draggedFile?.path === `${folder}/${file.name}` ? 'opacity-50 scale-95' : 'hover:bg-white/5'}`}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, `${folder}/${file.name}`, folder)}
                                                        onDragEnd={handleDragEnd}
                                                    >
                                                        <GripVertical size={10} className="opacity-20 group-hover:opacity-60 transition-opacity flex-shrink-0" />
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
                        <div className="lg:col-span-6 flex flex-col rounded-3xl overflow-hidden border"
                            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                            {selectedFile ? (
                                <>
                                    <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.textMuted }}>Editor</h2>
                                            <div className="flex items-center gap-2 px-2 py-0.5 rounded" style={{ backgroundColor: `${theme.accent}10`, border: `1px solid ${theme.border}` }}>
                                                <span className="text-[10px]" style={{ color: theme.textMuted }}>{selectedFolder} /</span>
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
                        <div className="lg:col-span-3 flex flex-col rounded-3xl overflow-hidden border"
                            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                            <div className="p-4 border-b shrink-0" style={{ borderColor: theme.border }}>
                                <h2 className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2"
                                    style={{ color: theme.textMuted }}>
                                    <Activity size={14} /> Simulador
                                </h2>
                            </div>

                            <div className="p-3 space-y-2 shrink-0" style={{ backgroundColor: theme.cardBg2 }}>
                                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                                    className="w-full rounded-xl px-3 py-1.5 text-[10px] outline-none transition-all"
                                    style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}>
                                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)}
                                    className="w-full rounded-xl px-3 py-1.5 text-[10px] outline-none transition-all"
                                    style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}>
                                    <option value="">Persona...</option>
                                    {AGENT_FOLDERS.map(cat => Array.isArray(structure[cat]) && (structure[cat] as AgentFolder[]).map(agent => (
                                        <option key={agent.name} value={agent.name}>{agent.name}</option>
                                    )))}
                                </select>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5" style={{ backgroundColor: theme.cardBg2 }}>
                                {chatHistory.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed shadow-sm ${m.role === 'user' ? 'text-white' : 'bg-white/5 text-gray-200 border border-white/10'}`}
                                            style={{ backgroundColor: m.role === 'user' ? theme.accent : undefined }}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))}
                                {chatLoading && <div className="text-[10px] text-center animate-pulse" style={{ color: theme.textMuted }}>Pensando...</div>}
                            </div>

                            <div className="p-4 border-t shrink-0" style={{ borderColor: theme.border }}>
                                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                                    <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Simular chat..."
                                        className="flex-1 rounded-xl px-4 py-2 text-xs outline-none transition-all"
                                        style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}
                                        onFocus={(e) => e.target.style.borderColor = theme.accent} />
                                    <button type="submit" disabled={chatLoading} className="p-2 rounded-xl text-white shadow-lg transition-all"
                                        style={{ backgroundColor: theme.accent }}>
                                        <ChevronRight size={18} />
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>

                    {/* Moving File Overlay */}
                    {isMovingFile && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-4 p-8 rounded-2xl" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                <Activity className="animate-spin" size={32} style={{ color: theme.accent }} />
                                <p className="font-medium" style={{ color: theme.text }}>Moviendo archivo...</p>
                            </div>
                        </div>
                    )}

                    {/* Knowledge Snaps Panel (Modal) */}
                    {showSnapsPanel && selectedAgentForSnaps && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl"
                                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                {/* Header */}
                                <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: theme.border, backgroundColor: `${theme.accent}10` }}>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.accent}20` }}>
                                            <Zap size={20} style={{ color: theme.accent }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold" style={{ color: theme.text }}>Knowledge Snaps</h3>
                                            <p className="text-xs" style={{ color: theme.textMuted }}>
                                                {selectedAgentForSnaps.name} - Auto-instrucciones del agente
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowSnapsPanel(false)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                                        <X size={16} style={{ color: theme.textMuted }} />
                                    </button>
                                </div>

                                {/* Regenerate All Button */}
                                <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: theme.border }}>
                                    <span className="text-xs" style={{ color: theme.textMuted }}>
                                        {selectedAgentSnaps.length} snaps encontrados
                                    </span>
                                    <button
                                        onClick={handleRegenerateAllSnaps}
                                        disabled={regeneratingAll}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
                                        style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
                                    >
                                        <RefreshCw size={12} className={regeneratingAll ? 'animate-spin' : ''} />
                                        {regeneratingAll ? 'Regenerando...' : 'Regenerar Todos'}
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
                                    {selectedAgentSnaps.length === 0 ? (
                                        <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                            <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                                            <p className="text-sm">No hay knowledge snaps aún.</p>
                                            <p className="text-xs mt-1 opacity-60">Haz clic en "Regenerar Todos" para generar los snaps.</p>
                                        </div>
                                    ) : (
                                        selectedAgentSnaps.map(snap => {
                                            const categoryLabels: Record<string, { label: string; color: string }> = {
                                                product: { label: 'Producto', color: '#10b981' },
                                                policy: { label: 'Política', color: '#6366f1' },
                                                faq: { label: 'FAQ', color: '#8b5cf6' },
                                                procedure: { label: 'Procedimiento', color: '#f59e0b' },
                                                reference: { label: 'Referencia', color: '#64748b' },
                                                pricing: { label: 'Precios', color: '#ef4444' },
                                                general: { label: 'General', color: '#94a3b8' }
                                            };
                                            const catInfo = categoryLabels[snap.category] || categoryLabels.general;
                                            const priorityColor = snap.priority >= 8 ? '#ef4444' : snap.priority >= 5 ? '#f59e0b' : '#10b981';
                                            const effectivenessColor = snap.effectivenessScore >= 70 ? '#10b981' : snap.effectivenessScore >= 40 ? '#f59e0b' : '#ef4444';

                                            return (
                                            <div key={snap.fileName} className="p-4 rounded-xl" style={{ backgroundColor: `${theme.cardBg2}`, border: `1px solid ${theme.border}` }}>
                                                {/* Header */}
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <FileText size={14} style={{ color: snap.isGlobal ? '#3b82f6' : theme.accent }} />
                                                        <span className="font-medium text-sm" style={{ color: theme.text }}>{snap.fileName}</span>
                                                        {snap.isGlobal && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400">GLOBAL</span>
                                                        )}
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: `${catInfo.color}20`, color: catInfo.color }}>
                                                            {catInfo.label}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleRegenerateSnap(snap.fileName)}
                                                            disabled={regeneratingSnap === snap.fileName}
                                                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                                                            title="Regenerar snap"
                                                        >
                                                            <RefreshCw size={12} className={regeneratingSnap === snap.fileName ? 'animate-spin' : ''} style={{ color: theme.textMuted }} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Stats Row */}
                                                <div className="flex gap-3 mb-3 text-[9px]">
                                                    <div className="flex items-center gap-1" title="Prioridad">
                                                        <span style={{ color: priorityColor }}>●</span>
                                                        <span style={{ color: theme.textMuted }}>P{snap.priority || 5}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1" title="Efectividad">
                                                        <span style={{ color: effectivenessColor }}>●</span>
                                                        <span style={{ color: theme.textMuted }}>{snap.effectivenessScore ?? 50}%</span>
                                                    </div>
                                                    <div className="flex items-center gap-1" title="Usos">
                                                        <span style={{ color: theme.textMuted }}>×{snap.usageCount || 0}</span>
                                                    </div>
                                                    {snap.lastUsed && (
                                                        <div className="flex items-center gap-1" title="Último uso">
                                                            <span style={{ color: theme.textMuted }}>Usado: {new Date(snap.lastUsed).toLocaleDateString('es-MX')}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <p className="text-xs mb-2" style={{ color: theme.textMuted }}>{snap.summary}</p>

                                                <div className="p-2 rounded-lg mb-2" style={{ backgroundColor: `${theme.accent}10` }}>
                                                    <p className="text-[10px] font-bold mb-1" style={{ color: theme.accent }}>USO:</p>
                                                    <p className="text-xs" style={{ color: theme.text }}>{snap.usage}</p>
                                                </div>

                                                {/* Triggers & Enhanced Fields */}
                                                {editingSnapEnhanced === snap.fileName ? (
                                                    <div className="mt-3 p-3 rounded-lg space-y-3" style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                                        <div>
                                                            <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6366f1' }}>TRIGGERS (separados por coma):</label>
                                                            <input
                                                                type="text"
                                                                value={enhancedFormData.triggers}
                                                                onChange={(e) => setEnhancedFormData(prev => ({ ...prev, triggers: e.target.value }))}
                                                                className="w-full p-2 rounded-lg text-xs"
                                                                style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}
                                                                placeholder="precio, costo, cuánto vale..."
                                                            />
                                                        </div>
                                                        <div className="flex gap-3">
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6366f1' }}>PRIORIDAD:</label>
                                                                <input
                                                                    type="range"
                                                                    min="1"
                                                                    max="10"
                                                                    value={enhancedFormData.priority}
                                                                    onChange={(e) => setEnhancedFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                                                                    className="w-full"
                                                                />
                                                                <div className="flex justify-between text-[9px]" style={{ color: theme.textMuted }}>
                                                                    <span>Baja</span>
                                                                    <span className="font-bold">{enhancedFormData.priority}</span>
                                                                    <span>Alta</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <label className="text-[10px] font-bold mb-1 block" style={{ color: '#6366f1' }}>CATEGORÍA:</label>
                                                                <select
                                                                    value={enhancedFormData.category}
                                                                    onChange={(e) => setEnhancedFormData(prev => ({ ...prev, category: e.target.value as SnapCategory }))}
                                                                    className="w-full p-2 rounded-lg text-xs"
                                                                    style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}
                                                                >
                                                                    <option value="product">Producto</option>
                                                                    <option value="pricing">Precios</option>
                                                                    <option value="policy">Política</option>
                                                                    <option value="faq">FAQ</option>
                                                                    <option value="procedure">Procedimiento</option>
                                                                    <option value="reference">Referencia</option>
                                                                    <option value="general">General</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => saveEnhancedFields(snap.fileName)}
                                                                disabled={savingEnhanced}
                                                                className="px-3 py-1 rounded-lg text-[10px] font-bold text-white"
                                                                style={{ backgroundColor: '#6366f1' }}
                                                            >
                                                                {savingEnhanced ? 'Guardando...' : 'Guardar'}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingSnapEnhanced(null)}
                                                                className="px-3 py-1 rounded-lg text-[10px]"
                                                                style={{ color: theme.textMuted }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => startEditingEnhanced(snap)}
                                                        className="mt-3 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                                                        style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px dashed rgba(99, 102, 241, 0.2)' }}
                                                    >
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Settings size={12} style={{ color: '#6366f1' }} />
                                                            <span className="text-[10px] font-bold" style={{ color: '#6366f1' }}>TRIGGERS:</span>
                                                        </div>
                                                        {snap.triggers && snap.triggers.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {snap.triggers.map((t, i) => (
                                                                    <span key={i} className="px-1.5 py-0.5 rounded text-[9px]" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}>
                                                                        {t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs opacity-40" style={{ color: theme.textMuted }}>Click para configurar triggers...</p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Admin Notes */}
                                                <div className="mt-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <StickyNote size={12} style={{ color: '#f59e0b' }} />
                                                        <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>NOTAS ADMIN:</span>
                                                    </div>
                                                    {editingSnapNotes === snap.fileName ? (
                                                        <div className="space-y-2">
                                                            <textarea
                                                                value={snapNotesValue}
                                                                onChange={(e) => setSnapNotesValue(e.target.value)}
                                                                className="w-full p-2 rounded-lg text-xs resize-none"
                                                                style={{ backgroundColor: theme.cardBg, color: theme.text, border: `1px solid ${theme.border}` }}
                                                                rows={3}
                                                                placeholder="Agrega instrucciones específicas para este conocimiento..."
                                                            />
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => saveSnapNotes(snap.fileName)}
                                                                    disabled={savingSnapNotes}
                                                                    className="px-3 py-1 rounded-lg text-[10px] font-bold text-white"
                                                                    style={{ backgroundColor: theme.accent }}
                                                                >
                                                                    {savingSnapNotes ? 'Guardando...' : 'Guardar'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setEditingSnapNotes(null)}
                                                                    className="px-3 py-1 rounded-lg text-[10px]"
                                                                    style={{ color: theme.textMuted }}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => { setEditingSnapNotes(snap.fileName); setSnapNotesValue(snap.adminNotes || ''); }}
                                                            className="p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors min-h-[40px]"
                                                            style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px dashed rgba(245, 158, 11, 0.2)' }}
                                                        >
                                                            {snap.adminNotes ? (
                                                                <p className="text-xs" style={{ color: theme.text }}>{snap.adminNotes}</p>
                                                            ) : (
                                                                <p className="text-xs opacity-40" style={{ color: theme.textMuted }}>Click para agregar notas...</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <p className="text-[9px] mt-2 opacity-40" style={{ color: theme.textMuted }}>
                                                    Actualizado: {new Date(snap.lastUpdated).toLocaleDateString('es-MX')}
                                                </p>
                                            </div>
                                        );
                                        })
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t" style={{ borderColor: theme.border }}>
                                    <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
                                        Los snaps se actualizan automáticamente cuando modificas archivos de conocimiento
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Layout>
        </Screen>
    );
};

export default AdminAIKnowledge;
