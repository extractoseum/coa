import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Folder,
    Plus,
    Edit3,
    Trash2,
    QrCode,
    ChevronRight,
    FileText,
    Loader2,
    X,
    Check,
    Copy
} from 'lucide-react';
import { authFetch, useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import QRCode from 'react-qr-code';

interface COAPreview {
    id: string;
    public_token: string;
    custom_title?: string;
    custom_name?: string;
    product_sku?: string;
    batch_id?: string;
    compliance_status: string;
    product_image_url?: string;
}

interface FolderData {
    id: string;
    name: string;
    description?: string;
    color: string;
    icon: string;
    public_token: string;
    is_public: boolean;
    coa_count: number;
    coas: COAPreview[];
    created_at: string;
}

export default function FoldersView() {
    const { client } = useAuth();
    const { theme } = useTheme();
    const [folders, setFolders] = useState<FolderData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showQRModal, setShowQRModal] = useState<FolderData | null>(null);
    const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);

    // Form state
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderDescription, setNewFolderDescription] = useState('');
    const [newFolderColor, setNewFolderColor] = useState('#10b981');
    const [newFolderPublic, setNewFolderPublic] = useState(false);
    const [saving, setSaving] = useState(false);

    const colorOptions = [
        '#10b981', // Emerald
        '#3b82f6', // Blue
        '#8b5cf6', // Purple
        '#f59e0b', // Amber
        '#ef4444', // Red
        '#ec4899', // Pink
        '#06b6d4', // Cyan
        '#84cc16', // Lime
    ];

    useEffect(() => {
        loadFolders();
    }, []);

    const loadFolders = async () => {
        try {
            const res = await authFetch('/api/v1/folders/my-folders');
            const data = await res.json();
            if (data.success) {
                setFolders(data.folders || []);
            } else {
                setError(data.error || 'Error al cargar carpetas');
            }
        } catch (err) {
            setError('Error de conexion');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        setSaving(true);

        try {
            const res = await authFetch('/api/v1/folders', {
                method: 'POST',
                body: JSON.stringify({
                    name: newFolderName,
                    description: newFolderDescription,
                    color: newFolderColor,
                    is_public: newFolderPublic
                })
            });
            const data = await res.json();
            if (data.success) {
                setShowCreateModal(false);
                resetForm();
                loadFolders();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al crear carpeta');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateFolder = async () => {
        if (!editingFolder || !newFolderName.trim()) return;
        setSaving(true);

        try {
            const res = await authFetch(`/api/v1/folders/${editingFolder.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: newFolderName,
                    description: newFolderDescription,
                    color: newFolderColor,
                    is_public: newFolderPublic
                })
            });
            const data = await res.json();
            if (data.success) {
                setEditingFolder(null);
                resetForm();
                loadFolders();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al actualizar carpeta');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteFolder = async (folder: FolderData) => {
        if (!confirm(`¿Eliminar carpeta "${folder.name}"? Los COAs no seran eliminados.`)) return;

        try {
            const res = await authFetch(`/api/v1/folders/${folder.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                loadFolders();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Error al eliminar carpeta');
        }
    };

    const resetForm = () => {
        setNewFolderName('');
        setNewFolderDescription('');
        setNewFolderColor('#10b981');
        setNewFolderPublic(false);
    };

    const openEditModal = (folder: FolderData) => {
        setEditingFolder(folder);
        setNewFolderName(folder.name);
        setNewFolderDescription(folder.description || '');
        setNewFolderColor(folder.color);
        setNewFolderPublic(folder.is_public);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (loading) {
        return (
            <Layout>
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.accent }} />
                </div>
            </Layout>
        );
    }

    return (
        <Screen id="FoldersView">
            <Layout>
                <div className="p-6 pb-24">
                    <div className="max-w-6xl mx-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Mis Carpetas</h1>
                                <p className="text-sm mt-1" style={{ color: theme.textMuted }}>
                                    Organiza tus COAs en carpetas y comparte por QR
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    resetForm();
                                    setShowCreateModal(true);
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
                                style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                            >
                                <Plus className="w-5 h-5" />
                                Nueva Carpeta
                            </button>
                        </div>

                        {error && (
                            <div
                                className="px-4 py-3 rounded-lg mb-6 flex items-center justify-between"
                                style={{ backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444' }}
                            >
                                {error}
                                <button onClick={() => setError('')}>
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Folders Grid */}
                        {folders.length === 0 ? (
                            <div className="text-center py-16">
                                <Folder className="w-16 h-16 mx-auto mb-4" style={{ color: theme.textMuted }} />
                                <h3 className="text-xl font-medium mb-2" style={{ color: theme.textMuted }}>No tienes carpetas</h3>
                                <p className="mb-6" style={{ color: theme.textMuted }}>Crea tu primera carpeta para organizar tus COAs</p>
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="px-6 py-3 rounded-lg font-medium transition-colors"
                                    style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                >
                                    Crear Carpeta
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {folders.map(folder => (
                                    <div
                                        key={folder.id}
                                        className="rounded-xl overflow-hidden transition-colors"
                                        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                                    >
                                        {/* Folder Header */}
                                        <div
                                            className="p-4 flex items-center gap-3"
                                            style={{ borderLeft: `4px solid ${folder.color}` }}
                                        >
                                            <div
                                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                                style={{ backgroundColor: folder.color + '20' }}
                                            >
                                                <Folder className="w-5 h-5" style={{ color: folder.color }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-medium truncate" style={{ color: theme.text }}>{folder.name}</h3>
                                                <p className="text-sm" style={{ color: theme.textMuted }}>
                                                    {folder.coa_count} COA{folder.coa_count !== 1 ? 's' : ''}
                                                    {folder.is_public && (
                                                        <span className="ml-2 text-xs" style={{ color: theme.accent }}>(Publico)</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {/* COA Previews */}
                                        {folder.coas && folder.coas.length > 0 && (
                                            <div className="px-4 pb-2">
                                                <div className="space-y-1">
                                                    {folder.coas.slice(0, 3).map(coa => (
                                                        <Link
                                                            key={coa.id}
                                                            to={`/coa/${coa.public_token}`}
                                                            className="flex items-center gap-2 text-sm py-1 px-2 rounded transition-colors"
                                                            style={{ color: theme.textMuted }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.color = theme.text;
                                                                e.currentTarget.style.backgroundColor = theme.cardBg2;
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.color = theme.textMuted;
                                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                            }}
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                            <span className="truncate">
                                                                {coa.custom_title || coa.custom_name || coa.product_sku || coa.batch_id || 'COA'}
                                                            </span>
                                                            <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
                                                        </Link>
                                                    ))}
                                                    {folder.coa_count > 3 && (
                                                        <p className="text-xs px-2" style={{ color: theme.textMuted }}>
                                                            +{folder.coa_count - 3} mas...
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${theme.border}` }}>
                                            <button
                                                onClick={() => setShowQRModal(folder)}
                                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors"
                                                style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                            >
                                                <QrCode className="w-4 h-4" />
                                                QR
                                            </button>
                                            <button
                                                onClick={() => openEditModal(folder)}
                                                className="p-2 rounded-lg transition-colors"
                                                style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteFolder(folder)}
                                                className="p-2 rounded-lg transition-colors"
                                                style={{ backgroundColor: theme.cardBg2, color: theme.textMuted }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)';
                                                    e.currentTarget.style.color = '#ef4444';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = theme.cardBg2;
                                                    e.currentTarget.style.color = theme.textMuted;
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Create/Edit Modal */}
                {(showCreateModal || editingFolder) && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <div className="rounded-xl w-full max-w-md" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                            <div className="p-6">
                                <h2 className="text-xl font-bold mb-4" style={{ color: theme.text }}>
                                    {editingFolder ? 'Editar Carpeta' : 'Nueva Carpeta'}
                                </h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Nombre</label>
                                        <input
                                            type="text"
                                            value={newFolderName}
                                            onChange={e => setNewFolderName(e.target.value)}
                                            placeholder="Ej: Aceites CBD"
                                            className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2"
                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Descripcion (opcional)</label>
                                        <textarea
                                            value={newFolderDescription}
                                            onChange={e => setNewFolderDescription(e.target.value)}
                                            placeholder="Descripcion de la carpeta..."
                                            rows={2}
                                            className="w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 resize-none"
                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Color</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {colorOptions.map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setNewFolderColor(color)}
                                                    className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110"
                                                    style={{
                                                        backgroundColor: color,
                                                        borderColor: newFolderColor === color ? '#ffffff' : 'transparent'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setNewFolderPublic(!newFolderPublic)}
                                            className="w-12 h-6 rounded-full transition-colors"
                                            style={{ backgroundColor: newFolderPublic ? theme.accent : theme.cardBg2 }}
                                        >
                                            <div
                                                className="w-5 h-5 bg-white rounded-full transform transition-transform"
                                                style={{ transform: newFolderPublic ? 'translateX(24px)' : 'translateX(2px)' }}
                                            />
                                        </button>
                                        <span className="text-sm" style={{ color: theme.textMuted }}>
                                            Carpeta publica (accesible sin login via QR)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 py-4 flex gap-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                                <button
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setEditingFolder(null);
                                        resetForm();
                                    }}
                                    className="flex-1 py-2 rounded-lg transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                                    disabled={saving || !newFolderName.trim()}
                                    className="flex-1 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    style={{
                                        backgroundColor: (!newFolderName.trim() || saving) ? theme.cardBg2 : theme.accent,
                                        color: '#ffffff',
                                        cursor: (!newFolderName.trim() || saving) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {saving ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <Check className="w-5 h-5" />
                                            {editingFolder ? 'Guardar' : 'Crear'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* QR Modal */}
                {showQRModal && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                        <div className="rounded-xl w-full max-w-sm" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                            <div className="p-6 text-center">
                                <h2 className="text-xl font-bold mb-2" style={{ color: theme.text }}>{showQRModal.name}</h2>
                                <p className="text-sm mb-6" style={{ color: theme.textMuted }}>
                                    {showQRModal.is_public ? 'Acceso publico' : 'Requiere login'}
                                </p>

                                <div className="bg-white p-4 rounded-lg inline-block mb-4">
                                    <QRCode
                                        value={`https://coa.extractoseum.com/folder/${showQRModal.public_token}`}
                                        size={200}
                                    />
                                </div>

                                <div className="text-xs mb-4 break-all" style={{ color: theme.textMuted }}>
                                    https://coa.extractoseum.com/folder/{showQRModal.public_token}
                                </div>

                                <button
                                    onClick={() => copyToClipboard(`https://coa.extractoseum.com/folder/${showQRModal.public_token}`)}
                                    className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                >
                                    <Copy className="w-4 h-4" />
                                    Copiar enlace
                                </button>
                            </div>

                            <div className="px-6 py-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                                <button
                                    onClick={() => setShowQRModal(null)}
                                    className="w-full py-2 rounded-lg transition-colors"
                                    style={{ backgroundColor: theme.cardBg2, color: theme.text }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </Screen>
    );
}
