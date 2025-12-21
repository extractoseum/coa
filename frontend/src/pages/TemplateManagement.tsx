import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { ArrowLeft, Upload, Trash2, Loader2, Plus, Check, Image, Type, Palette, FileText, Droplets } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface Template {
    id: string;
    name: string;
    company_name: string;
    company_logo_url: string | null;
    watermark_url: string | null;
    watermark_opacity: number;
    watermark_scale: number;
    logo_width: number;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    footer_text: string;
    is_active: boolean;
    created_at: string;
}

export default function TemplateManagement() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        company_name: '',
        primary_color: '#1a5c3e',
        secondary_color: '#10b981',
        accent_color: '#059669',
        footer_text: '',
        watermark_opacity: 0.15,
        watermark_scale: 1.0,
        logo_width: 180
    });
    const [newLogo, setNewLogo] = useState<File | null>(null);
    const [newWatermark, setNewWatermark] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');
    const [watermarkPreview, setWatermarkPreview] = useState('');

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await fetch('/api/v1/templates');
            const data = await res.json();
            if (data.success) {
                setTemplates(data.templates || []);
            }
        } catch (error) {
            console.error('Error fetching templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectTemplate = (template: Template) => {
        setSelectedTemplate(template);
        setIsCreating(false);
        setFormData({
            name: template.name,
            company_name: template.company_name,
            primary_color: template.primary_color || '#1a5c3e',
            secondary_color: template.secondary_color || '#10b981',
            accent_color: template.accent_color || '#059669',
            footer_text: template.footer_text || '',
            watermark_opacity: template.watermark_opacity ?? 0.15,
            watermark_scale: template.watermark_scale ?? 1.0,
            logo_width: template.logo_width ?? 180
        });
        setLogoPreview(template.company_logo_url || '');
        setWatermarkPreview(template.watermark_url || '');
        setNewLogo(null);
        setNewWatermark(null);
    };

    const startCreate = () => {
        setSelectedTemplate(null);
        setIsCreating(true);
        setFormData({
            name: '',
            company_name: '',
            primary_color: '#1a5c3e',
            secondary_color: '#10b981',
            accent_color: '#059669',
            footer_text: '',
            watermark_opacity: 0.15,
            watermark_scale: 1.0,
            logo_width: 180
        });
        setLogoPreview('');
        setWatermarkPreview('');
        setNewLogo(null);
        setNewWatermark(null);
    };

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewLogo(file);
            const reader = new FileReader();
            reader.onload = (e) => setLogoPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleWatermarkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewWatermark(file);
            const reader = new FileReader();
            reader.onload = (e) => setWatermarkPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            alert('El nombre del template es requerido');
            return;
        }

        setSaving(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('company_name', formData.company_name);
            data.append('primary_color', formData.primary_color);
            data.append('secondary_color', formData.secondary_color);
            data.append('accent_color', formData.accent_color);
            data.append('footer_text', formData.footer_text);
            data.append('watermark_opacity', formData.watermark_opacity.toString());
            data.append('watermark_scale', formData.watermark_scale.toString());
            data.append('logo_width', formData.logo_width.toString());
            if (newLogo) data.append('logo', newLogo);
            if (newWatermark) data.append('watermark', newWatermark);

            const url = isCreating
                ? '/api/v1/templates'
                : `/api/v1/templates/${selectedTemplate?.id}`;

            const res = await fetch(url, {
                method: isCreating ? 'POST' : 'PUT',
                body: data
            });

            const result = await res.json();
            if (result.success) {
                alert(isCreating ? 'Template creado exitosamente' : 'Template actualizado');
                fetchTemplates();
                if (result.template) {
                    selectTemplate(result.template);
                }
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Error al guardar el template');
        } finally {
            setSaving(false);
        }
    };

    const handleActivate = async (templateId: string) => {
        try {
            const res = await fetch(`/api/v1/templates/${templateId}/activate`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert('Template activado. Se usara para generar PDFs.');
                fetchTemplates();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Activate error:', error);
        }
    };

    const handleDelete = async (templateId: string) => {
        if (!confirm('¿Eliminar este template? Esta accion no se puede deshacer.')) return;

        try {
            const res = await fetch(`/api/v1/templates/${templateId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert('Template eliminado');
                fetchTemplates();
                if (selectedTemplate?.id === templateId) {
                    setSelectedTemplate(null);
                    setIsCreating(false);
                }
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const handleRemoveLogo = async () => {
        if (!selectedTemplate || !confirm('¿Eliminar el logo de este template?')) return;

        try {
            const res = await fetch(`/api/v1/templates/${selectedTemplate.id}/logo`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setLogoPreview('');
                setNewLogo(null);
                fetchTemplates();
            }
        } catch (error) {
            console.error('Remove logo error:', error);
        }
    };

    const handleRemoveWatermark = async () => {
        if (!selectedTemplate || !confirm('¿Eliminar la marca de agua de este template?')) return;

        try {
            const res = await fetch(`/api/v1/templates/${selectedTemplate.id}/watermark`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setWatermarkPreview('');
                setNewWatermark(null);
                fetchTemplates();
            }
        } catch (error) {
            console.error('Remove watermark error:', error);
        }
    };

    return (
        <Screen id="TemplateManagement">
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
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Templates White-Label</h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>Configuraciones de marca para certificados PDF</p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Templates List */}
                                <div className="lg:col-span-1 space-y-4">
                                    <button
                                        onClick={startCreate}
                                        className="w-full font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                                        style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                    >
                                        <Plus className="w-5 h-5" />
                                        Nuevo Template
                                    </button>

                                    <div className="space-y-2">
                                        {templates.map((template) => (
                                            <div
                                                key={template.id}
                                                onClick={() => selectTemplate(template)}
                                                className="p-4 rounded-xl cursor-pointer transition-all"
                                                style={{
                                                    backgroundColor: selectedTemplate?.id === template.id ? theme.cardBg2 : theme.cardBg,
                                                    border: `1px solid ${selectedTemplate?.id === template.id ? theme.accent : theme.border}`
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-lg"
                                                            style={{ backgroundColor: template.primary_color }}
                                                        />
                                                        <div>
                                                            <h3 className="font-medium" style={{ color: theme.text }}>{template.name}</h3>
                                                            <p className="text-xs" style={{ color: theme.textMuted }}>{template.company_name || 'Sin nombre'}</p>
                                                        </div>
                                                    </div>
                                                    {template.is_active && (
                                                        <span className="px-2 py-1 text-xs rounded-full flex items-center gap-1" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}>
                                                            <Check className="w-3 h-3" />
                                                            Activo
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {templates.length === 0 && (
                                            <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                <p>No hay templates</p>
                                                <p className="text-xs">Crea uno para empezar</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Editor */}
                                <div className="lg:col-span-2">
                                    {(selectedTemplate || isCreating) ? (
                                        <div className="space-y-6">
                                            {/* Template Name */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <Type className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                                    {isCreating ? 'Nuevo Template' : 'Editar Template'}
                                                </h2>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Nombre del Template *</label>
                                                        <input
                                                            type="text"
                                                            value={formData.name}
                                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                            placeholder="Ej: Marca Premium"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Nombre de Empresa</label>
                                                        <input
                                                            type="text"
                                                            value={formData.company_name}
                                                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                                                            placeholder="Ej: EXTRACTOS EUM"
                                                            className="w-full px-4 py-3 rounded-lg focus:outline-none"
                                                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Logo & Watermark */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Logo */}
                                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                    <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                        <Image className="w-5 h-5" style={{ color: theme.accent }} />
                                                        Logo
                                                    </h3>
                                                    {logoPreview ? (
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg p-4 flex items-center justify-center h-24" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <img src={logoPreview} alt="Logo" className="max-h-full object-contain" />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <label className="flex-1 cursor-pointer">
                                                                    <input type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                                                                    <div className="w-full px-3 py-2 text-center rounded-lg text-sm" style={{ backgroundColor: theme.cardBg2, color: theme.text, border: `1px solid ${theme.border}` }}>
                                                                        Cambiar
                                                                    </div>
                                                                </label>
                                                                {!isCreating && (
                                                                    <button
                                                                        onClick={handleRemoveLogo}
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
                                                            <input type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />
                                                            <div
                                                                className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                                                                style={{ borderColor: theme.border }}
                                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                                                            >
                                                                <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: theme.textMuted }} />
                                                                <p className="text-sm" style={{ color: theme.textMuted }}>Subir logo</p>
                                                            </div>
                                                        </label>
                                                    )}
                                                    {/* Logo Width Slider */}
                                                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                                            Ancho del Logo: {formData.logo_width}px
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="80"
                                                            max="350"
                                                            step="10"
                                                            value={formData.logo_width}
                                                            onChange={(e) => setFormData({ ...formData, logo_width: parseFloat(e.target.value) })}
                                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                                            style={{ backgroundColor: theme.cardBg2, accentColor: theme.accent }}
                                                        />
                                                        <div className="flex justify-between text-xs mt-1" style={{ color: theme.textMuted }}>
                                                            <span>80px</span>
                                                            <span>180px</span>
                                                            <span>350px</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Watermark */}
                                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                    <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                        <Droplets className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                                        Marca de Agua
                                                    </h3>
                                                    {watermarkPreview ? (
                                                        <div className="space-y-3">
                                                            <div className="rounded-lg p-4 flex items-center justify-center h-24" style={{ backgroundColor: theme.cardBg2 }}>
                                                                <img src={watermarkPreview} alt="Watermark" className="max-h-full object-contain" style={{ opacity: formData.watermark_opacity }} />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <label className="flex-1 cursor-pointer">
                                                                    <input type="file" accept="image/*" onChange={handleWatermarkSelect} className="hidden" />
                                                                    <div className="w-full px-3 py-2 text-center rounded-lg text-sm" style={{ backgroundColor: theme.cardBg2, color: theme.text, border: `1px solid ${theme.border}` }}>
                                                                        Cambiar
                                                                    </div>
                                                                </label>
                                                                {!isCreating && (
                                                                    <button
                                                                        onClick={handleRemoveWatermark}
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
                                                            <input type="file" accept="image/*" onChange={handleWatermarkSelect} className="hidden" />
                                                            <div
                                                                className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
                                                                style={{ borderColor: theme.border }}
                                                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                                                                onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                                                            >
                                                                <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: theme.textMuted }} />
                                                                <p className="text-sm" style={{ color: theme.textMuted }}>Subir watermark</p>
                                                            </div>
                                                        </label>
                                                    )}
                                                    {/* Watermark Opacity Slider */}
                                                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                                            Opacidad: {Math.round(formData.watermark_opacity * 100)}%
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="1"
                                                            step="0.05"
                                                            value={formData.watermark_opacity}
                                                            onChange={(e) => setFormData({ ...formData, watermark_opacity: parseFloat(e.target.value) })}
                                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                                            style={{ backgroundColor: theme.cardBg2, accentColor: '#3b82f6' }}
                                                        />
                                                        <div className="flex justify-between text-xs mt-1" style={{ color: theme.textMuted }}>
                                                            <span>0%</span>
                                                            <span>50%</span>
                                                            <span>100%</span>
                                                        </div>
                                                    </div>
                                                    {/* Watermark Scale Slider */}
                                                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.border}` }}>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                                            Escala: {Math.round(formData.watermark_scale * 100)}%
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="0.25"
                                                            max="2.5"
                                                            step="0.05"
                                                            value={formData.watermark_scale}
                                                            onChange={(e) => setFormData({ ...formData, watermark_scale: parseFloat(e.target.value) })}
                                                            className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                                            style={{ backgroundColor: theme.cardBg2, accentColor: theme.accent }}
                                                        />
                                                        <div className="flex justify-between text-xs mt-1" style={{ color: theme.textMuted }}>
                                                            <span>25%</span>
                                                            <span>100%</span>
                                                            <span>250%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Colors */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <Palette className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                                                    Colores de Marca
                                                </h3>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Primario</label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="color"
                                                                value={formData.primary_color}
                                                                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                                                                className="w-10 h-10 rounded cursor-pointer border-0"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={formData.primary_color}
                                                                onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                                                                className="flex-1 px-2 py-1 rounded text-xs font-mono"
                                                                style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Secundario</label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="color"
                                                                value={formData.secondary_color}
                                                                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                                                                className="w-10 h-10 rounded cursor-pointer border-0"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={formData.secondary_color}
                                                                onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                                                                className="flex-1 px-2 py-1 rounded text-xs font-mono"
                                                                style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Acento</label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="color"
                                                                value={formData.accent_color}
                                                                onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                                                                className="w-10 h-10 rounded cursor-pointer border-0"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={formData.accent_color}
                                                                onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                                                                className="flex-1 px-2 py-1 rounded text-xs font-mono"
                                                                style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer Text */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                                    <FileText className="w-5 h-5" style={{ color: '#f59e0b' }} />
                                                    Texto de Pie de Pagina (opcional)
                                                </h3>
                                                <textarea
                                                    value={formData.footer_text}
                                                    onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                                                    placeholder="Texto adicional para el footer del PDF..."
                                                    className="w-full px-4 py-3 rounded-lg focus:outline-none resize-none h-20"
                                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                />
                                            </div>

                                            {/* Preview */}
                                            <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                                <h3 className="font-semibold mb-4" style={{ color: theme.text }}>Vista Previa</h3>
                                                <div className="bg-white rounded-lg p-6 text-center relative overflow-hidden">
                                                    {/* Watermark preview */}
                                                    {watermarkPreview && (
                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: formData.watermark_opacity }}>
                                                            <img
                                                                src={watermarkPreview}
                                                                alt=""
                                                                className="object-contain"
                                                                style={{
                                                                    width: `${48 * formData.watermark_scale}px`,
                                                                    height: `${48 * formData.watermark_scale}px`
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="relative z-10">
                                                        {logoPreview && (
                                                            <img src={logoPreview} alt="Logo" className="h-12 mx-auto mb-3 object-contain" />
                                                        )}
                                                        <h3 className="text-xl font-bold" style={{ color: formData.primary_color }}>
                                                            {formData.company_name || 'NOMBRE DE EMPRESA'}
                                                        </h3>
                                                        <p className="text-black font-semibold mt-1">CERTIFICADO DE ANALISIS</p>
                                                    </div>
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
                                                        isCreating ? 'Crear Template' : 'Guardar Cambios'
                                                    )}
                                                </button>

                                                {!isCreating && selectedTemplate && (
                                                    <>
                                                        {!selectedTemplate.is_active && (
                                                            <button
                                                                onClick={() => handleActivate(selectedTemplate.id)}
                                                                className="px-6 py-3 font-medium rounded-xl transition-colors flex items-center gap-2"
                                                                style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
                                                            >
                                                                <Check className="w-5 h-5" />
                                                                Activar
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(selectedTemplate.id)}
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
                                            <FileText className="w-16 h-16 mx-auto mb-4" style={{ color: theme.textMuted }} />
                                            <h3 className="text-xl font-semibold mb-2" style={{ color: theme.text }}>Selecciona un Template</h3>
                                            <p className="mb-6" style={{ color: theme.textMuted }}>
                                                Selecciona un template existente para editarlo o crea uno nuevo
                                            </p>
                                            <button
                                                onClick={startCreate}
                                                className="font-medium px-6 py-3 rounded-xl transition-colors inline-flex items-center gap-2"
                                                style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                            >
                                                <Plus className="w-5 h-5" />
                                                Crear Nuevo Template
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
