import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { ArrowLeft, Upload, Trash2, Loader2, Settings, Image, Type, Palette, Save } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface GlobalSettings {
    id: string;
    company_name: string;
    company_logo_url: string | null;
    primary_color: string;
    secondary_color: string;
}

export default function SettingsManagement() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [settings, setSettings] = useState<GlobalSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [companyName, setCompanyName] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#1a5c3e');
    const [secondaryColor, setSecondaryColor] = useState('#10b981');
    const [newLogo, setNewLogo] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/v1/settings');
            const data = await res.json();
            if (data.success && data.settings) {
                setSettings(data.settings);
                setCompanyName(data.settings.company_name || '');
                setPrimaryColor(data.settings.primary_color || '#1a5c3e');
                setSecondaryColor(data.settings.secondary_color || '#10b981');
                if (data.settings.company_logo_url) {
                    setLogoPreview(data.settings.company_logo_url);
                }
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewLogo(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                setLogoPreview(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('company_name', companyName);
            formData.append('primary_color', primaryColor);
            formData.append('secondary_color', secondaryColor);
            if (newLogo) {
                formData.append('logo', newLogo);
            }

            const res = await fetch('/api/v1/settings', {
                method: 'PUT',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                alert('Configuracion guardada exitosamente');
                setSettings(data.settings);
                setNewLogo(null);
                if (data.settings.company_logo_url) {
                    setLogoPreview(data.settings.company_logo_url);
                }
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Error al guardar la configuracion');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!confirm('¿Eliminar el logo de la empresa?')) return;

        try {
            const res = await fetch('/api/v1/settings/logo', {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setLogoPreview('');
                setNewLogo(null);
                setSettings(data.settings);
                alert('Logo eliminado');
            }
        } catch (error) {
            console.error('Remove logo error:', error);
        }
    };

    return (
        <Screen id="SettingsManagement">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-2xl mx-auto">
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
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Configuracion Global</h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>Logo y nombre de empresa para PDFs</p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Logo Preview */}
                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                        <Image className="w-5 h-5" style={{ color: theme.accent }} />
                                        Logo de la Empresa
                                    </h2>

                                    {logoPreview ? (
                                        <div className="space-y-4">
                                            <div className="rounded-lg p-4 flex items-center justify-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                <img
                                                    src={logoPreview}
                                                    alt="Logo"
                                                    className="max-h-24 object-contain"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <label className="flex-1 cursor-pointer">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleLogoSelect}
                                                        className="hidden"
                                                    />
                                                    <div
                                                        className="w-full px-4 py-2 text-center rounded-lg transition-colors"
                                                        style={{ backgroundColor: theme.cardBg2, color: theme.text, border: `1px solid ${theme.border}` }}
                                                    >
                                                        Cambiar Logo
                                                    </div>
                                                </label>
                                                <button
                                                    onClick={handleRemoveLogo}
                                                    className="px-4 py-2 rounded-lg transition-colors"
                                                    style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoSelect}
                                                    className="hidden"
                                                />
                                                <div
                                                    className="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
                                                    style={{ borderColor: theme.border }}
                                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                                                >
                                                    <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: theme.textMuted }} />
                                                    <p style={{ color: theme.textMuted }}>Click para subir logo</p>
                                                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Recomendado: PNG con fondo transparente</p>
                                                </div>
                                            </label>
                                        </div>
                                    )}
                                    {newLogo && (
                                        <p className="text-xs mt-2" style={{ color: theme.accent }}>
                                            Nuevo logo seleccionado: {newLogo.name}
                                        </p>
                                    )}
                                </div>

                                {/* Company Name */}
                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                        <Type className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                        Nombre de la Empresa
                                    </h2>
                                    <input
                                        type="text"
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        placeholder="Ej: EXTRACTOS EUM™"
                                        className="w-full px-4 py-3 rounded-lg focus:outline-none text-lg"
                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                    />
                                    <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
                                        Este nombre aparecera en todos los PDFs generados
                                    </p>
                                </div>

                                {/* Colors */}
                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                        <Palette className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                                        Colores de Marca
                                    </h2>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                                Color Primario
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="w-12 h-12 rounded cursor-pointer border-0"
                                                />
                                                <input
                                                    type="text"
                                                    value={primaryColor}
                                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                                    className="flex-1 px-3 py-2 rounded-lg focus:outline-none font-mono text-sm"
                                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                                                Color Secundario
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="w-12 h-12 rounded cursor-pointer border-0"
                                                />
                                                <input
                                                    type="text"
                                                    value={secondaryColor}
                                                    onChange={(e) => setSecondaryColor(e.target.value)}
                                                    className="flex-1 px-3 py-2 rounded-lg focus:outline-none font-mono text-sm"
                                                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                        <Settings className="w-5 h-5" style={{ color: theme.textMuted }} />
                                        Vista Previa del Header
                                    </h2>
                                    <div className="bg-white rounded-lg p-6 text-center">
                                        {logoPreview && (
                                            <img
                                                src={logoPreview}
                                                alt="Logo Preview"
                                                className="h-12 mx-auto mb-3 object-contain"
                                            />
                                        )}
                                        <h3
                                            className="text-xl font-bold"
                                            style={{ color: primaryColor }}
                                        >
                                            {companyName || 'NOMBRE DE EMPRESA'}
                                        </h3>
                                        <p className="text-black font-semibold mt-1">CERTIFICADO DE ANALISIS</p>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="w-full font-medium py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
                                    style={{
                                        backgroundColor: saving ? theme.cardBg2 : theme.accent,
                                        color: '#ffffff',
                                        cursor: saving ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-5 h-5" />
                                            Guardar Configuracion
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
