import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { ArrowLeft, Upload, Trash2, Loader2, Plus, Check, User, FileText, Link as LinkIcon, Mail, Phone, Award, ExternalLink } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface Chemist {
    id: string;
    name: string;
    title: string | null;
    credentials: string | null;
    license_number: string | null;
    license_url: string | null;
    signature_url: string | null;
    email: string | null;
    phone: string | null;
    is_active: boolean;
    is_default: boolean;
    sort_order: number;
    created_at: string;
}

export default function ChemistManagement() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [chemists, setChemists] = useState<Chemist[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedChemist, setSelectedChemist] = useState<Chemist | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        title: '',
        credentials: '',
        license_number: '',
        license_url: '',
        signature_url: '',
        email: '',
        phone: '',
        is_active: true,
        is_default: false,
        sort_order: 0
    });
    const [newSignature, setNewSignature] = useState<File | null>(null);
    const [signaturePreview, setSignaturePreview] = useState('');

    useEffect(() => {
        fetchChemists();
    }, []);

    const fetchChemists = async () => {
        try {
            const res = await fetch('/api/v1/chemists');
            const data = await res.json();
            if (data.success) {
                setChemists(data.chemists || []);
            }
        } catch (error) {
            console.error('Error fetching chemists:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectChemist = (chemist: Chemist) => {
        setSelectedChemist(chemist);
        setIsCreating(false);
        setFormData({
            name: chemist.name,
            title: chemist.title || '',
            credentials: chemist.credentials || '',
            license_number: chemist.license_number || '',
            license_url: chemist.license_url || '',
            signature_url: chemist.signature_url || '',
            email: chemist.email || '',
            phone: chemist.phone || '',
            is_active: chemist.is_active,
            is_default: chemist.is_default,
            sort_order: chemist.sort_order
        });
        setSignaturePreview(chemist.signature_url || '');
        setNewSignature(null);
    };

    const startCreate = () => {
        setSelectedChemist(null);
        setIsCreating(true);
        setFormData({
            name: '',
            title: 'Responsable Tecnico',
            credentials: '',
            license_number: '',
            license_url: '',
            signature_url: '',
            email: '',
            phone: '',
            is_active: true,
            is_default: false,
            sort_order: chemists.length
        });
        setSignaturePreview('');
        setNewSignature(null);
    };

    const handleSignatureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewSignature(file);
            const reader = new FileReader();
            reader.onload = (e) => setSignaturePreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            alert('El nombre del quimico es requerido');
            return;
        }

        setSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('title', formData.title);
            data.append('credentials', formData.credentials);
            data.append('license_number', formData.license_number);
            data.append('license_url', formData.license_url);
            data.append('email', formData.email);
            data.append('phone', formData.phone);
            data.append('is_active', formData.is_active.toString());
            data.append('is_default', formData.is_default.toString());
            data.append('sort_order', formData.sort_order.toString());

            // If using URL for signature and not uploading a file
            if (formData.signature_url && !newSignature) {
                data.append('signature_url', formData.signature_url);
            }

            if (newSignature) {
                data.append('signature', newSignature);
            }

            const url = isCreating
                ? '/api/v1/chemists'
                : `/api/v1/chemists/${selectedChemist?.id}`;

            const res = await fetch(url, {
                method: isCreating ? 'POST' : 'PUT',
                body: data
            });

            const result = await res.json();
            if (result.success) {
                alert(isCreating ? 'Quimico creado exitosamente' : 'Quimico actualizado');
                fetchChemists();
                if (result.chemist) {
                    selectChemist(result.chemist);
                }
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Error al guardar el quimico');
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (chemistId: string) => {
        try {
            const res = await fetch(`/api/v1/chemists/${chemistId}/default`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert('Quimico establecido como predeterminado');
                fetchChemists();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Set default error:', error);
        }
    };

    const handleDelete = async (chemistId: string) => {
        if (!confirm('¿Desactivar este quimico? Los COAs existentes mantendran su referencia.')) return;

        try {
            const res = await fetch(`/api/v1/chemists/${chemistId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert('Quimico desactivado');
                fetchChemists();
                if (selectedChemist?.id === chemistId) {
                    setSelectedChemist(null);
                    setIsCreating(false);
                }
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const handleRemoveSignature = async () => {
        if (!selectedChemist || !confirm('¿Eliminar la firma de este quimico?')) return;

        try {
            const res = await fetch(`/api/v1/chemists/${selectedChemist.id}/signature`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setSignaturePreview('');
                setNewSignature(null);
                setFormData({ ...formData, signature_url: '' });
                fetchChemists();
            }
        } catch (error) {
            console.error('Remove signature error:', error);
        }
    };

    return (
        <Screen id="ChemistManagement">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-6xl mx-auto">
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-8">
                            <button
                                onClick={() => navigate(ROUTES.dashboard)}
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: theme.textMuted }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Quimicos / Firmantes</h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>Responsables tecnicos para certificados COA</p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Chemists List */}
                                <div className="lg:col-span-1 space-y-4">
                                    <button
                                        onClick={startCreate}
                                        className="w-full font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                        style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                    >
                                        <Plus className="w-5 h-5" />
                                        Nuevo Quimico
                                    </button>

                                    <div className="space-y-2">
                                        {chemists.map((chemist) => (
                                            <div
                                                key={chemist.id}
                                                onClick={() => selectChemist(chemist)}
                                                className="p-4 rounded-xl cursor-pointer transition-all"
                                                style={{
                                                    backgroundColor: selectedChemist?.id === chemist.id ? theme.cardBg2 : theme.cardBg,
                                                    border: `1px solid ${selectedChemist?.id === chemist.id ? theme.accent : theme.border}`,
                                                    opacity: chemist.is_active ? 1 : 0.6
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        {chemist.signature_url ? (
                                                            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <img src={chemist.signature_url} alt="" className="max-w-full max-h-full object-contain" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <User className="w-5 h-5" style={{ color: theme.textMuted }} />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <h3 className="font-medium" style={{ color: theme.text }}>{chemist.name}</h3>
                                                            <p className="text-xs" style={{ color: theme.textMuted }}>
                                                                {chemist.title || chemist.credentials || 'Sin titulo'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {chemist.is_default && (
                                                            <span className="px-2 py-1 text-xs rounded-full flex items-center gap-1" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}>
                                                                <Check className="w-3 h-3" />
                                                                Default
                                                            </span>
                                                        )}
                                                        {!chemist.is_active && (
                                                            <span className="px-2 py-1 text-xs rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                                                                Inactivo
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {chemists.length === 0 && (
                                            <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                <p>No hay quimicos registrados</p>
                                                <p className="text-xs">Agrega uno para empezar</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Editor */}
                                <div className="lg:col-span-2">
                                    {(selectedChemist || isCreating) ? (
                                        <div className="space-y-6">
                                            {/* Basic Info */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <User className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                                    {isCreating ? 'Nuevo Quimico' : 'Editar Quimico'}
                                                </h2>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Nombre Completo *</label>
                                                        <input
                                                            type="text"
                                                            value={formData.name}
                                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                            placeholder="Ej: Georgina Ocampo"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Titulo</label>
                                                        <input
                                                            type="text"
                                                            value={formData.title}
                                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                            placeholder="Ej: Responsable Tecnico"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Credenciales</label>
                                                        <input
                                                            type="text"
                                                            value={formData.credentials}
                                                            onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                                                            placeholder="Ej: Ing. Bioquimico"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Orden</label>
                                                        <input
                                                            type="number"
                                                            value={formData.sort_order}
                                                            onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* License Info */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <Award className="w-5 h-5" style={{ color: '#f59e0b' }} />
                                                    Cedula Profesional
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Numero de Cedula</label>
                                                        <input
                                                            type="text"
                                                            value={formData.license_number}
                                                            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                                                            placeholder="Ej: 8112996"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>URL de Verificacion</label>
                                                        <input
                                                            type="url"
                                                            value={formData.license_url}
                                                            onChange={(e) => setFormData({ ...formData, license_url: e.target.value })}
                                                            placeholder="https://..."
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                </div>
                                                {formData.license_url && (
                                                    <a
                                                        href={formData.license_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 mt-3 text-sm"
                                                        style={{ color: theme.accent }}
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        Ver documento de verificacion
                                                    </a>
                                                )}
                                            </div>

                                            {/* Signature */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <FileText className="w-5 h-5" style={{ color: theme.accent }} />
                                                    Firma Digital
                                                </h3>

                                                {/* URL input for signature */}
                                                <div className="mb-4">
                                                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>URL de Firma (opcional)</label>
                                                    <input
                                                        type="url"
                                                        value={formData.signature_url}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, signature_url: e.target.value });
                                                            if (e.target.value && !newSignature) {
                                                                setSignaturePreview(e.target.value);
                                                            }
                                                        }}
                                                        placeholder="https://... (o sube una imagen abajo)"
                                                        className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                    />
                                                </div>

                                                {signaturePreview ? (
                                                    <div className="space-y-3">
                                                        <div className="rounded-lg p-4 flex items-center justify-center h-32" style={{ backgroundColor: '#ffffff' }}>
                                                            <img src={signaturePreview} alt="Firma" className="max-h-full object-contain" />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <label className="flex-1 cursor-pointer">
                                                                <input type="file" accept="image/*" onChange={handleSignatureSelect} className="hidden" />
                                                                <div className="w-full px-3 py-2 text-center rounded-lg text-sm" style={{ backgroundColor: theme.cardBg2, color: theme.text, border: `1px solid ${theme.border}` }}>
                                                                    Cambiar Imagen
                                                                </div>
                                                            </label>
                                                            {!isCreating && (
                                                                <button
                                                                    onClick={handleRemoveSignature}
                                                                    className="px-3 py-2 rounded-lg"
                                                                    style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="block cursor-pointer">
                                                        <input type="file" accept="image/*" onChange={handleSignatureSelect} className="hidden" />
                                                        <div
                                                            className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                                                            style={{ borderColor: theme.border }}
                                                            onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                                                            onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                                                        >
                                                            <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: theme.textMuted }} />
                                                            <p className="text-sm" style={{ color: theme.textMuted }}>Subir imagen de firma</p>
                                                            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>PNG con fondo transparente recomendado</p>
                                                        </div>
                                                    </label>
                                                )}
                                            </div>

                                            {/* Contact Info */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <Mail className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                                                    Contacto (opcional)
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Email</label>
                                                        <input
                                                            type="email"
                                                            value={formData.email}
                                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                            placeholder="correo@ejemplo.com"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Telefono</label>
                                                        <input
                                                            type="tel"
                                                            value={formData.phone}
                                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                            placeholder="+52..."
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Toggles */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4" style={{ color: theme.text }}>Estado</h3>
                                                <div className="flex flex-wrap gap-4">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.is_active}
                                                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                            className="w-5 h-5 rounded"
                                                            style={{ accentColor: theme.accent }}
                                                        />
                                                        <span style={{ color: theme.text }}>Activo</span>
                                                    </label>
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.is_default}
                                                            onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                                                            className="w-5 h-5 rounded"
                                                            style={{ accentColor: theme.accent }}
                                                        />
                                                        <span style={{ color: theme.text }}>Predeterminado para nuevos COAs</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Preview Card */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4" style={{ color: theme.text }}>Vista Previa en Certificado</h3>
                                                <div className="bg-white rounded-lg p-6 text-center">
                                                    <p className="text-gray-600 text-sm mb-2">Responsable Tecnico:</p>
                                                    {signaturePreview && (
                                                        <img src={signaturePreview} alt="" className="h-16 mx-auto mb-2 object-contain" />
                                                    )}
                                                    <p className="font-bold text-gray-900">{formData.name || 'Nombre del Quimico'}</p>
                                                    {formData.credentials && (
                                                        <p className="text-gray-600 text-sm">{formData.credentials}</p>
                                                    )}
                                                    {formData.license_number && (
                                                        <p className="text-gray-500 text-xs mt-1">
                                                            Ced. Prof: {formData.license_number}
                                                            {formData.license_url && (
                                                                <a href={formData.license_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500">
                                                                    <ExternalLink className="w-3 h-3 inline" />
                                                                </a>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={handleSave}
                                                    disabled={saving}
                                                    className="flex-1 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                                    style={{ backgroundColor: saving ? theme.cardBg2 : theme.accent, color: '#ffffff' }}
                                                >
                                                    {saving ? (
                                                        <>
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            Guardando...
                                                        </>
                                                    ) : (
                                                        isCreating ? 'Crear Quimico' : 'Guardar Cambios'
                                                    )}
                                                </button>

                                                {!isCreating && selectedChemist && (
                                                    <>
                                                        {!selectedChemist.is_default && (
                                                            <button
                                                                onClick={() => handleSetDefault(selectedChemist.id)}
                                                                className="px-6 py-3 font-medium rounded-xl transition-colors flex items-center gap-2"
                                                                style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
                                                            >
                                                                <Check className="w-5 h-5" />
                                                                Default
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(selectedChemist.id)}
                                                            className="px-6 py-3 rounded-xl transition-colors"
                                                            style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl p-12 text-center" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                            <User className="w-16 h-16 mx-auto mb-4" style={{ color: theme.textMuted }} />
                                            <h3 className="text-xl font-semibold mb-2" style={{ color: theme.text }}>Selecciona un Quimico</h3>
                                            <p className="mb-6" style={{ color: theme.textMuted }}>
                                                Selecciona un quimico existente para editarlo o agrega uno nuevo
                                            </p>
                                            <button
                                                onClick={startCreate}
                                                className="font-medium px-6 py-3 rounded-xl transition-colors inline-flex items-center gap-2"
                                                style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                            >
                                                <Plus className="w-5 h-5" />
                                                Agregar Quimico
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
