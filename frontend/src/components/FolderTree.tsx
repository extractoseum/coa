import { useState, useEffect } from 'react';
import {
    Folder,
    FolderPlus,
    ChevronRight,
    ChevronDown,
    MoreVertical,
    Plus,
    Trash2,
    Edit2,
    Share2,
    FileText,
    X,
    Loader2,
    Move,
    CornerDownRight,
    Home
} from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface FolderType {
    id: string;
    name: string;
    description: string | null;
    parent_id: string | null;
    public_token: string;
    is_public: boolean;
    coa_count: number;
    children: FolderType[];
}

interface COA {
    id: string;
    public_token: string;
    custom_name?: string;
    custom_title?: string;
    coa_number?: string;
    product_sku?: string;
    batch_id?: string;
    compliance_status: string;
}

interface FolderTreeProps {
    onSelectFolder?: (folder: FolderType | null) => void;
    onShareFolder?: (folder: FolderType) => void;
    selectedFolderId?: string | null;
    availableCOAs?: COA[];
}

export default function FolderTree({ onSelectFolder, onShareFolder, selectedFolderId, availableCOAs = [] }: FolderTreeProps) {
    const { theme } = useTheme();
    const [folders, setFolders] = useState<FolderType[]>([]);
    const [flatFolders, setFlatFolders] = useState<FolderType[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
    const [parentForNew, setParentForNew] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDescription, setNewFolderDescription] = useState('');
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const [showAddCOAModal, setShowAddCOAModal] = useState(false);
    const [addingToFolder, setAddingToFolder] = useState<FolderType | null>(null);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [movingFolder, setMovingFolder] = useState<FolderType | null>(null);

    useEffect(() => {
        fetchFolders();
    }, []);

    const flattenFolders = (folderList: FolderType[]): FolderType[] => {
        const result: FolderType[] = [];
        const traverse = (folders: FolderType[]) => {
            folders.forEach(folder => {
                result.push(folder);
                if (folder.children && folder.children.length > 0) {
                    traverse(folder.children);
                }
            });
        };
        traverse(folderList);
        return result;
    };

    const fetchFolders = async () => {
        try {
            const res = await authFetch('/api/v1/folders/my-folders');
            const data = await res.json();
            if (data.success) {
                const folderTree = data.folders || [];
                setFolders(folderTree);
                const flat = data.flatFolders && data.flatFolders.length > 0
                    ? data.flatFolders
                    : flattenFolders(folderTree);
                setFlatFolders(flat);
            }
        } catch (error) {
            console.error('Error fetching folders:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleFolder = (folderId: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) {
                newSet.delete(folderId);
            } else {
                newSet.add(folderId);
            }
            return newSet;
        });
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const res = await authFetch('/api/v1/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newFolderName,
                    description: newFolderDescription || null,
                    parent_id: parentForNew
                })
            });
            const data = await res.json();
            if (data.success) {
                await fetchFolders();
                setShowCreateModal(false);
                setNewFolderName('');
                setNewFolderDescription('');
                setParentForNew(null);
                if (parentForNew) {
                    setExpandedFolders(prev => new Set([...prev, parentForNew]));
                }
            }
        } catch (error) {
            console.error('Error creating folder:', error);
        }
    };

    const handleUpdateFolder = async () => {
        if (!editingFolder || !newFolderName.trim()) return;
        try {
            const res = await authFetch(`/api/v1/folders/${editingFolder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newFolderName,
                    description: newFolderDescription || null
                })
            });
            const data = await res.json();
            if (data.success) {
                await fetchFolders();
                setEditingFolder(null);
                setNewFolderName('');
                setNewFolderDescription('');
            }
        } catch (error) {
            console.error('Error updating folder:', error);
        }
    };

    const handleDeleteFolder = async (folder: FolderType) => {
        if (!confirm(`Eliminar "${folder.name}" y todas sus subcarpetas?`)) return;
        try {
            const res = await authFetch(`/api/v1/folders/${folder.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                await fetchFolders();
                if (selectedFolderId === folder.id) {
                    onSelectFolder?.(null);
                }
            }
        } catch (error) {
            console.error('Error deleting folder:', error);
        }
    };

    const handleAddCOAToFolder = async (coaId: string) => {
        if (!addingToFolder) return;
        try {
            const res = await authFetch(`/api/v1/folders/${addingToFolder.id}/coas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coa_id: coaId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchFolders();
                setShowAddCOAModal(false);
                setAddingToFolder(null);
            } else {
                alert(data.error || 'Error al agregar COA');
            }
        } catch (error) {
            console.error('Error adding COA to folder:', error);
        }
    };

    const openEditModal = (folder: FolderType) => {
        setEditingFolder(folder);
        setNewFolderName(folder.name);
        setNewFolderDescription(folder.description || '');
        setMenuOpen(null);
    };

    const openCreateSubfolder = (parentId: string) => {
        setParentForNew(parentId);
        setShowCreateModal(true);
        setMenuOpen(null);
    };

    const openAddCOAModal = (folder: FolderType) => {
        setAddingToFolder(folder);
        setShowAddCOAModal(true);
        setMenuOpen(null);
    };

    const openMoveModal = (folder: FolderType) => {
        setMovingFolder(folder);
        setShowMoveModal(true);
        setMenuOpen(null);
    };

    const getDescendantIds = (folderId: string): string[] => {
        const ids: string[] = [folderId];
        const children = flatFolders.filter(f => f.parent_id === folderId);
        children.forEach(child => {
            ids.push(...getDescendantIds(child.id));
        });
        return ids;
    };

    const getAvailableTargets = (folderToMove: FolderType): FolderType[] => {
        const descendantIds = getDescendantIds(folderToMove.id);
        return flatFolders.filter(f => !descendantIds.includes(f.id));
    };

    const handleMoveFolder = async (targetParentId: string | null) => {
        if (!movingFolder) return;
        try {
            const res = await authFetch(`/api/v1/folders/${movingFolder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parent_id: targetParentId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchFolders();
                setShowMoveModal(false);
                setMovingFolder(null);
                if (targetParentId) {
                    setExpandedFolders(prev => new Set([...prev, targetParentId]));
                }
            } else {
                alert(data.error || 'Error al mover carpeta');
            }
        } catch (error) {
            console.error('Error moving folder:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pass': return '#22c55e';
            case 'fail': return '#ef4444';
            default: return '#eab308';
        }
    };

    const renderFolder = (folder: FolderType, depth: number = 0) => {
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected = selectedFolderId === folder.id;
        const hasChildren = folder.children && folder.children.length > 0;

        return (
            <div key={folder.id}>
                <div
                    className="group flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                        paddingLeft: `${12 + depth * 16}px`,
                        backgroundColor: isSelected ? `${theme.accent}20` : 'transparent',
                        border: isSelected ? `1px solid ${theme.accent}50` : '1px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = `${theme.accent}10`;
                    }}
                    onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                        className="p-0.5 rounded transition-colors"
                        style={{ color: theme.textMuted }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {hasChildren ? (
                            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                        ) : (
                            <div className="w-4 h-4" />
                        )}
                    </button>

                    <div
                        className="flex-1 flex items-center gap-2 min-w-0"
                        onClick={() => onSelectFolder?.(folder)}
                    >
                        <Folder className="w-4 h-4 flex-shrink-0" style={{ color: isSelected ? theme.accent : theme.textMuted }} />
                        <span className="truncate text-sm" style={{ color: theme.text }}>{folder.name}</span>
                        {folder.coa_count > 0 && (
                            <span className="text-xs flex-shrink-0" style={{ color: theme.textMuted }}>({folder.coa_count})</span>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === folder.id ? null : folder.id); }}
                            className="p-1 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                            style={{ color: theme.textMuted }}
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {menuOpen === folder.id && (
                            <div
                                className="absolute right-0 top-full mt-1 rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
                                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                            >
                                {[
                                    { icon: FolderPlus, label: 'Nueva subcarpeta', onClick: () => openCreateSubfolder(folder.id) },
                                    { icon: Plus, label: 'Agregar COA', onClick: () => openAddCOAModal(folder) },
                                    { icon: Share2, label: 'Compartir', onClick: () => onShareFolder?.(folder) },
                                    { divider: true },
                                    { icon: Edit2, label: 'Editar', onClick: () => openEditModal(folder) },
                                    { icon: Move, label: 'Mover a...', onClick: () => openMoveModal(folder) },
                                    { icon: Trash2, label: 'Eliminar', onClick: () => handleDeleteFolder(folder), danger: true },
                                ].map((item, idx) => item.divider ? (
                                    <hr key={idx} className="my-1" style={{ borderColor: theme.border }} />
                                ) : (
                                    <button
                                        key={idx}
                                        onClick={item.onClick}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                                        style={{ color: item.danger ? '#ef4444' : theme.text }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {item.icon && <item.icon className="w-4 h-4" />}
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {isExpanded && hasChildren && (
                    <div>{folder.children.map(child => renderFolder(child, depth + 1))}</div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.textMuted }} />
            </div>
        );
    }

    return (
        <div className="rounded-xl" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                <h3 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                    <Folder className="w-5 h-5" style={{ color: theme.accent }} />
                    Mis Carpetas
                </h3>
                <button
                    onClick={() => { setParentForNew(null); setShowCreateModal(true); }}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: theme.textMuted }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Nueva carpeta"
                >
                    <FolderPlus className="w-5 h-5" />
                </button>
            </div>

            <div className="p-2 max-h-[400px] overflow-y-auto">
                {folders.length === 0 ? (
                    <div className="text-center py-8" style={{ color: theme.textMuted }}>
                        <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No tienes carpetas</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="text-sm mt-2 transition-colors"
                            style={{ color: theme.accent }}
                        >
                            Crear primera carpeta
                        </button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div
                            className="flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors"
                            style={{
                                backgroundColor: selectedFolderId === null ? `${theme.accent}20` : 'transparent',
                                border: selectedFolderId === null ? `1px solid ${theme.accent}50` : '1px solid transparent',
                            }}
                            onClick={() => onSelectFolder?.(null)}
                            onMouseEnter={(e) => {
                                if (selectedFolderId !== null) e.currentTarget.style.backgroundColor = `${theme.accent}10`;
                            }}
                            onMouseLeave={(e) => {
                                if (selectedFolderId !== null) e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            <div className="w-5" />
                            <FileText className="w-4 h-4" style={{ color: selectedFolderId === null ? theme.accent : theme.textMuted }} />
                            <span className="text-sm" style={{ color: theme.text }}>Todos los COAs</span>
                        </div>
                        {folders.map(folder => renderFolder(folder))}
                    </div>
                )}
            </div>

            {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />}

            {/* Create/Edit Modal */}
            {(showCreateModal || editingFolder) && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="rounded-xl p-6 w-full max-w-md" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                                {editingFolder ? 'Editar Carpeta' : 'Nueva Carpeta'}
                            </h3>
                            <button
                                onClick={() => { setShowCreateModal(false); setEditingFolder(null); setNewFolderName(''); setNewFolderDescription(''); setParentForNew(null); }}
                                className="p-1 rounded transition-colors"
                                style={{ color: theme.textMuted }}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {parentForNew && (
                            <div className="mb-4 p-2 rounded text-sm" style={{ backgroundColor: theme.cardBg2, color: theme.textMuted }}>
                                Subcarpeta de: {flatFolders.find(f => f.id === parentForNew)?.name}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1" style={{ color: theme.textMuted }}>Nombre</label>
                                <input
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg focus:outline-none"
                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                    placeholder="Ej: Materias Primas"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1" style={{ color: theme.textMuted }}>Descripcion (opcional)</label>
                                <input
                                    type="text"
                                    value={newFolderDescription}
                                    onChange={(e) => setNewFolderDescription(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg focus:outline-none"
                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                    placeholder="Descripcion de la carpeta"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setShowCreateModal(false); setEditingFolder(null); setNewFolderName(''); setNewFolderDescription(''); setParentForNew(null); }}
                                    className="flex-1 px-4 py-2 rounded-lg transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                                    disabled={!newFolderName.trim()}
                                    className="flex-1 px-4 py-2 rounded-lg transition-colors"
                                    style={{ backgroundColor: !newFolderName.trim() ? theme.cardBg2 : theme.accent, color: '#ffffff', opacity: !newFolderName.trim() ? 0.5 : 1 }}
                                >
                                    {editingFolder ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add COA Modal */}
            {showAddCOAModal && addingToFolder && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="rounded-xl p-6 w-full max-w-lg" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                                Agregar COA a "{addingToFolder.name}"
                            </h3>
                            <button onClick={() => { setShowAddCOAModal(false); setAddingToFolder(null); }} className="p-1 rounded" style={{ color: theme.textMuted }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {availableCOAs.length === 0 ? (
                                <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No tienes COAs disponibles</p>
                                </div>
                            ) : (
                                availableCOAs.map(coa => (
                                    <button
                                        key={coa.id}
                                        onClick={() => handleAddCOAToFolder(coa.id)}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                                        style={{ backgroundColor: theme.cardBg2 }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor(coa.compliance_status) }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate" style={{ color: theme.text }}>
                                                {coa.custom_name || coa.custom_title || coa.product_sku || coa.coa_number || 'COA'}
                                            </p>
                                            <p className="text-xs truncate" style={{ color: theme.textMuted }}>
                                                {coa.batch_id && `Lote: ${coa.batch_id}`}{coa.coa_number && ` | ${coa.coa_number}`}
                                            </p>
                                        </div>
                                        <Plus className="w-5 h-5" style={{ color: theme.textMuted }} />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Move Folder Modal */}
            {showMoveModal && movingFolder && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="rounded-xl p-6 w-full max-w-md" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                                <Move className="w-5 h-5" style={{ color: theme.accent }} />
                                Mover "{movingFolder.name}"
                            </h3>
                            <button onClick={() => { setShowMoveModal(false); setMovingFolder(null); }} className="p-1 rounded" style={{ color: theme.textMuted }}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm mb-4" style={{ color: theme.textMuted }}>Selecciona donde mover esta carpeta:</p>
                        <div className="max-h-[300px] overflow-y-auto space-y-1">
                            {movingFolder.parent_id && (
                                <button
                                    onClick={() => handleMoveFolder(null)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid transparent` }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${theme.accent}20`; e.currentTarget.style.borderColor = `${theme.accent}50`; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.cardBg2; e.currentTarget.style.borderColor = 'transparent'; }}
                                >
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.accent}20` }}>
                                        <Home className="w-4 h-4" style={{ color: theme.accent }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium" style={{ color: theme.text }}>Nivel raiz</p>
                                        <p className="text-xs" style={{ color: theme.textMuted }}>Mover como carpeta principal</p>
                                    </div>
                                </button>
                            )}
                            {getAvailableTargets(movingFolder).map(targetFolder => (
                                <button
                                    key={targetFolder.id}
                                    onClick={() => handleMoveFolder(targetFolder.id)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid transparent` }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${theme.accent}20`; e.currentTarget.style.borderColor = `${theme.accent}50`; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.cardBg2; e.currentTarget.style.borderColor = 'transparent'; }}
                                >
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                        <Folder className="w-4 h-4" style={{ color: theme.textMuted }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate" style={{ color: theme.text }}>{targetFolder.name}</p>
                                        {targetFolder.parent_id && (
                                            <p className="text-xs flex items-center gap-1" style={{ color: theme.textMuted }}>
                                                <CornerDownRight className="w-3 h-3" />
                                                Subcarpeta de {flatFolders.find(f => f.id === targetFolder.parent_id)?.name || 'otro'}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {getAvailableTargets(movingFolder).length === 0 && !movingFolder.parent_id && (
                                <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                    <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No hay carpetas disponibles para mover</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 pt-4 mt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                            <button
                                onClick={() => { setShowMoveModal(false); setMovingFolder(null); }}
                                className="flex-1 px-4 py-2 rounded-lg transition-colors"
                                style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
