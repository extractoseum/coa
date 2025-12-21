import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { to } from '../routes';
import { ArrowLeft, FileText, Loader2, Heart, Trash2, Edit3, Check, X, ExternalLink } from 'lucide-react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface SavedCOA {
    id: string;
    coa_id: string;
    saved_at: string;
    notes: string | null;
    coa: {
        public_token: string;
        custom_name: string | null;
        custom_title: string | null;
        product_sku: string | null;
        batch_id: string | null;
        product_image_url: string | null;
        compliance_status: string;
        analysis_date: string | null;
        created_at: string;
    };
}

export default function MyCollection() {
    const navigate = useNavigate();
    const { client } = useAuth();
    const { theme } = useTheme();
    const [savedCoas, setSavedCoas] = useState<SavedCOA[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingNotes, setEditingNotes] = useState<string | null>(null);
    const [notesValue, setNotesValue] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    useEffect(() => {
        fetchCollection();
    }, []);

    const fetchCollection = async () => {
        try {
            const res = await authFetch('/api/v1/collection/my-collection');
            const data = await res.json();
            if (data.success) {
                setSavedCoas(data.collection || []);
            }
        } catch (error) {
            console.error('Error fetching collection:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async (coaToken: string, savedCoaId: string) => {
        if (!confirm('Quitar este COA de tu coleccion?')) return;

        setRemovingId(savedCoaId);
        try {
            const res = await authFetch(`/api/v1/collection/remove/${coaToken}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setSavedCoas(prev => prev.filter(s => s.id !== savedCoaId));
            }
        } catch (error) {
            console.error('Error removing COA:', error);
        } finally {
            setRemovingId(null);
        }
    };

    const startEditNotes = (savedCoa: SavedCOA) => {
        setEditingNotes(savedCoa.id);
        setNotesValue(savedCoa.notes || '');
    };

    const cancelEditNotes = () => {
        setEditingNotes(null);
        setNotesValue('');
    };

    const saveNotes = async (coaToken: string, savedCoaId: string) => {
        setSavingNotes(true);
        try {
            const res = await authFetch(`/api/v1/collection/notes/${coaToken}`, {
                method: 'PATCH',
                body: JSON.stringify({ notes: notesValue })
            });
            const data = await res.json();
            if (data.success) {
                setSavedCoas(prev => prev.map(s =>
                    s.id === savedCoaId ? { ...s, notes: notesValue } : s
                ));
                setEditingNotes(null);
                setNotesValue('');
            }
        } catch (error) {
            console.error('Error saving notes:', error);
        } finally {
            setSavingNotes(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pass': return { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
            case 'fail': return { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
            case 'revoked': return { bg: 'rgba(156, 163, 175, 0.2)', color: '#9ca3af' };
            default: return { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pass': return 'Aprobado';
            case 'fail': return 'No Aprobado';
            case 'revoked': return 'Revocado';
            default: return 'Pendiente';
        }
    };

    return (
        <Screen id="MyCollection">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-2xl mx-auto">
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-8">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: theme.text }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
                                    <Heart className="w-6 h-6" style={{ color: '#ef4444' }} />
                                    Mi Coleccion
                                </h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>
                                    {savedCoas.length} producto{savedCoas.length !== 1 ? 's' : ''} guardado{savedCoas.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>

                        {/* Collection List */}
                        <div
                            className="rounded-xl overflow-hidden"
                            style={{
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                            }}
                        >
                            {loading ? (
                                <div className="p-8 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} />
                                </div>
                            ) : savedCoas.length === 0 ? (
                                <div className="p-8 text-center" style={{ color: theme.textMuted }}>
                                    <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>Tu coleccion esta vacia</p>
                                    <p className="text-sm mt-1">
                                        Guarda COAs que escanees para verlos aqui
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    {savedCoas.map((saved, index) => (
                                        <div
                                            key={saved.id}
                                            className="p-4"
                                            style={{
                                                borderTop: index > 0 ? `1px solid ${theme.border}` : 'none',
                                            }}
                                        >
                                            <div className="flex items-start gap-4">
                                                {/* Product Image */}
                                                <div
                                                    className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer"
                                                    style={{ backgroundColor: theme.cardBg2 }}
                                                    onClick={() => navigate(to.coa(saved.coa.public_token))}
                                                >
                                                    {saved.coa.product_image_url ? (
                                                        <img
                                                            src={saved.coa.product_image_url}
                                                            alt={saved.coa.custom_name || 'Producto'}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <FileText className="w-6 h-6" style={{ color: theme.textMuted }} />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* COA Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div
                                                        className="cursor-pointer"
                                                        onClick={() => navigate(to.coa(saved.coa.public_token))}
                                                    >
                                                        <h3 className="font-medium truncate" style={{ color: theme.text }}>
                                                            {saved.coa.custom_name || saved.coa.custom_title || saved.coa.product_sku || 'Producto'}
                                                        </h3>
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm" style={{ color: theme.textMuted }}>
                                                            {saved.coa.batch_id && (
                                                                <span className="truncate">Lote: {saved.coa.batch_id}</span>
                                                            )}
                                                            <span
                                                                className="px-2 py-0.5 rounded-full text-xs font-medium"
                                                                style={{
                                                                    backgroundColor: getStatusColor(saved.coa.compliance_status).bg,
                                                                    color: getStatusColor(saved.coa.compliance_status).color,
                                                                }}
                                                            >
                                                                {getStatusText(saved.coa.compliance_status)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Notes Section */}
                                                    {editingNotes === saved.id ? (
                                                        <div className="mt-3">
                                                            <textarea
                                                                value={notesValue}
                                                                onChange={(e) => setNotesValue(e.target.value)}
                                                                placeholder="Agrega tus notas personales..."
                                                                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                                                                style={{
                                                                    backgroundColor: theme.cardBg2,
                                                                    border: `1px solid ${theme.border}`,
                                                                    color: theme.text
                                                                }}
                                                                rows={2}
                                                                autoFocus
                                                            />
                                                            <div className="flex gap-2 mt-2">
                                                                <button
                                                                    onClick={() => saveNotes(saved.coa.public_token, saved.id)}
                                                                    disabled={savingNotes}
                                                                    className="px-3 py-1 rounded text-sm flex items-center gap-1"
                                                                    style={{ backgroundColor: theme.accent, color: '#fff' }}
                                                                >
                                                                    {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                                    Guardar
                                                                </button>
                                                                <button
                                                                    onClick={cancelEditNotes}
                                                                    className="px-3 py-1 rounded text-sm flex items-center gap-1"
                                                                    style={{ color: theme.textMuted }}
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : saved.notes ? (
                                                        <p
                                                            className="mt-2 text-sm italic cursor-pointer"
                                                            style={{ color: theme.textMuted }}
                                                            onClick={() => startEditNotes(saved)}
                                                        >
                                                            "{saved.notes}"
                                                        </p>
                                                    ) : null}

                                                    {/* Saved date */}
                                                    <p className="mt-2 text-xs" style={{ color: theme.textMuted }}>
                                                        Guardado: {new Date(saved.saved_at).toLocaleDateString('es-ES', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        onClick={() => navigate(to.coa(saved.coa.public_token))}
                                                        className="p-2 rounded-lg transition-colors"
                                                        style={{ color: theme.textMuted }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = `${theme.accent}20`;
                                                            e.currentTarget.style.color = theme.accent;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = theme.textMuted;
                                                        }}
                                                        title="Ver COA"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </button>
                                                    {editingNotes !== saved.id && (
                                                        <button
                                                            onClick={() => startEditNotes(saved)}
                                                            className="p-2 rounded-lg transition-colors"
                                                            style={{ color: theme.textMuted }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.backgroundColor = `${theme.accent}20`;
                                                                e.currentTarget.style.color = theme.accent;
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                                e.currentTarget.style.color = theme.textMuted;
                                                            }}
                                                            title="Editar notas"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleRemove(saved.coa.public_token, saved.id)}
                                                        disabled={removingId === saved.id}
                                                        className="p-2 rounded-lg transition-colors"
                                                        style={{ color: theme.textMuted }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                                                            e.currentTarget.style.color = '#ef4444';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = theme.textMuted;
                                                        }}
                                                        title="Quitar de coleccion"
                                                    >
                                                        {removingId === saved.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
