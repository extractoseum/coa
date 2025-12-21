import { useState, useEffect } from 'react';
import { Save, Loader2, Image, FileText, Link as LinkIcon, X, Plus, EyeOff, Eye, Upload, BarChart3, Users, MousePointerClick, Download, RefreshCw, MapPin, Globe } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import type { ThemeMode } from '../contexts/ThemeContext';

interface ClientCOAEditorProps {
    coaToken: string;
    coa: any;
    onComplete: () => void;
    themeMode: ThemeMode;
}

// Fields that clients can edit
const CLIENT_EDITABLE_FIELDS = [
    'product_image_url',
    'short_description',
    'long_description',
    'custom_title',
    'purchase_links',
    'additional_docs',
    'is_hidden'
];

// Analytics interface
interface AnalyticsData {
    summary: {
        total_views: number;
        unique_visitors: number;
        pdf_downloads: number;
        link_clicks: number;
    };
    access_types: { access_type: string; count: number }[];
    devices: { device_type: string; count: number }[];
    recent_activity: { created_at: string; access_type: string; device_type: string }[];
    top_countries?: { country_code: string; country_name: string; count: number }[];
    top_cities?: { city: string; country: string; count: number }[];
}

export default function ClientCOAEditor({ coaToken, coa, onComplete, themeMode }: ClientCOAEditorProps) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form state
    const [customTitle, setCustomTitle] = useState(coa?.custom_title || '');
    const [shortDescription, setShortDescription] = useState(coa?.short_description || '');
    const [longDescription, setLongDescription] = useState(coa?.long_description || '');
    const [productImageUrl, setProductImageUrl] = useState(coa?.product_image_url || '');
    const [isHidden, setIsHidden] = useState(coa?.is_hidden || false);
    const [purchaseLinks, setPurchaseLinks] = useState<{ label: string; url: string }[]>(
        coa?.purchase_links || []
    );
    const [additionalDocs, setAdditionalDocs] = useState<{ type: string; url: string; filename: string }[]>(
        coa?.additional_docs || []
    );

    // Image upload state
    const [productImage, setProductImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Analytics state
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [showAnalytics, setShowAnalytics] = useState(false);

    // Load analytics on mount
    useEffect(() => {
        loadAnalytics();
    }, [coaToken]);

    const loadAnalytics = async () => {
        setLoadingAnalytics(true);
        try {
            const res = await authFetch(`/api/v1/analytics/coa/${coaToken}`);
            const data = await res.json();
            if (data.success) {
                // Backend returns data directly, not nested in data.data
                setAnalytics({
                    summary: data.summary,
                    access_types: Object.entries(data.by_access_type || {}).map(([type, count]) => ({ access_type: type, count: count as number })),
                    devices: Object.entries(data.by_device || {}).map(([type, count]) => ({ device_type: type, count: count as number })),
                    recent_activity: data.recent_scans?.map((s: any) => ({
                        created_at: s.scanned_at,
                        access_type: s.access_type,
                        device_type: s.device_type
                    })) || [],
                    top_countries: data.top_countries || [],
                    top_cities: data.top_cities || []
                });
            }
        } catch (err) {
            console.error('Error loading analytics:', err);
        } finally {
            setLoadingAnalytics(false);
        }
    };

    // Handle image file selection
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProductImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Upload product image
    const uploadProductImage = async () => {
        if (!productImage) return;

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('image', productImage);

            const res = await authFetch(`/api/v1/coas/${coaToken}/product-image`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                setProductImageUrl(data.imageUrl);
                setProductImage(null);
                setImagePreview(null);
                setSuccess('Imagen subida correctamente');
            } else {
                setError(data.error || 'Error al subir imagen');
            }
        } catch (err) {
            console.error('Error uploading image:', err);
            setError('Error de conexion al subir imagen');
        } finally {
            setUploadingImage(false);
        }
    };

    const themes = {
        light: {
            bg: '#ffffff',
            cardBg: '#f9fafb',
            border: '#d1d5db',
            text: '#111827',
            textMuted: '#6b7280',
            accent: '#10b981',
        },
        dark: {
            bg: '#111827',
            cardBg: '#1f2937',
            border: '#374151',
            text: '#ffffff',
            textMuted: '#9ca3af',
            accent: '#10b981',
        },
        tokyo: {
            bg: '#1a1a2e',
            cardBg: '#16213e',
            border: '#4a4a8a',
            text: '#ffffff',
            textMuted: '#a0a0c0',
            accent: '#00f5d4',
        },
        neon: {
            bg: '#030014',
            cardBg: '#05001a',
            border: '#1a1033',
            text: '#f8fafc',
            textMuted: '#94a3b8',
            accent: '#ec4899',
        },
    };
    const theme = themes[themeMode];

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const res = await authFetch(`/api/v1/coas/${coaToken}`, {
                method: 'PUT',
                body: JSON.stringify({
                    custom_title: customTitle,
                    short_description: shortDescription,
                    long_description: longDescription,
                    product_image_url: productImageUrl,
                    is_hidden: isHidden,
                    purchase_links: purchaseLinks.filter(l => l.label && l.url),
                    additional_docs: additionalDocs.filter(d => d.type && d.url)
                })
            });

            const data = await res.json();

            if (data.success) {
                setSuccess('Cambios guardados correctamente');
                onComplete();
            } else {
                setError(data.error || 'Error al guardar cambios');
            }
        } catch (err) {
            console.error('Error saving:', err);
            setError('Error de conexion');
        } finally {
            setSaving(false);
        }
    };

    const addPurchaseLink = () => {
        setPurchaseLinks([...purchaseLinks, { label: '', url: '' }]);
    };

    const removePurchaseLink = (index: number) => {
        setPurchaseLinks(purchaseLinks.filter((_, i) => i !== index));
    };

    const updatePurchaseLink = (index: number, field: 'label' | 'url', value: string) => {
        const updated = [...purchaseLinks];
        updated[index][field] = value;
        setPurchaseLinks(updated);
    };

    const addDocument = () => {
        setAdditionalDocs([...additionalDocs, { type: '', url: '', filename: '' }]);
    };

    const removeDocument = (index: number) => {
        setAdditionalDocs(additionalDocs.filter((_, i) => i !== index));
    };

    const updateDocument = (index: number, field: 'type' | 'url' | 'filename', value: string) => {
        const updated = [...additionalDocs];
        updated[index][field] = value;
        setAdditionalDocs(updated);
    };

    return (
        <div
            className="rounded-2xl border p-6 transition-colors duration-300"
            style={{ backgroundColor: theme.bg, borderColor: theme.border }}
        >
            <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                <FileText className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                Editar Informacion del Producto
            </h3>

            <p className="text-sm mb-6" style={{ color: theme.textMuted }}>
                Como propietario de este COA, puedes personalizar la informacion del producto.
            </p>

            {error && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm mb-4">
                    {error}
                </div>
            )}

            {success && (
                <div className="bg-green-500/20 border border-green-500/50 text-green-300 px-4 py-3 rounded-lg text-sm mb-4">
                    {success}
                </div>
            )}

            <div className="space-y-6">
                {/* Custom Title */}
                <div>
                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                        Titulo Personalizado
                    </label>
                    <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="Ej: CBD Premium Oil 1000mg"
                        className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.border,
                            color: theme.text
                        }}
                    />
                </div>

                {/* Product Image Upload */}
                <div>
                    <label className="block text-sm mb-2 flex items-center" style={{ color: theme.textMuted }}>
                        <Image className="w-4 h-4 mr-1" />
                        Imagen del Producto
                    </label>

                    {/* Current image preview */}
                    {productImageUrl && !imagePreview && (
                        <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                            <span className="text-xs block mb-2" style={{ color: theme.textMuted }}>Imagen actual:</span>
                            <img
                                src={productImageUrl}
                                alt="Current product"
                                className="max-h-40 rounded-lg border"
                                style={{ borderColor: theme.border }}
                            />
                        </div>
                    )}

                    {/* New image preview */}
                    {imagePreview && (
                        <div className="mb-3 p-3 rounded-lg border" style={{ backgroundColor: theme.cardBg, borderColor: theme.accent }}>
                            <span className="text-xs block mb-2" style={{ color: theme.accent }}>Nueva imagen (sin guardar):</span>
                            <img
                                src={imagePreview}
                                alt="New preview"
                                className="max-h-40 rounded-lg border"
                                style={{ borderColor: theme.accent }}
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={uploadProductImage}
                                    disabled={uploadingImage}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                    style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                >
                                    {uploadingImage ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                                    ) : (
                                        <><Upload className="w-4 h-4" /> Subir imagen</>
                                    )}
                                </button>
                                <button
                                    onClick={() => { setProductImage(null); setImagePreview(null); }}
                                    className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
                                    style={{ borderColor: theme.border, color: theme.textMuted }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* File input */}
                    <div className="flex gap-2">
                        <label
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-dashed cursor-pointer hover:border-emerald-500 transition-colors"
                            style={{ borderColor: theme.border, color: theme.textMuted }}
                        >
                            <Upload className="w-5 h-5" />
                            <span>{productImage ? productImage.name : 'Seleccionar imagen...'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                className="hidden"
                            />
                        </label>
                    </div>

                    {/* URL input as alternative */}
                    <div className="mt-3">
                        <span className="text-xs block mb-1" style={{ color: theme.textMuted }}>O pega una URL:</span>
                        <input
                            type="url"
                            value={productImageUrl}
                            onChange={(e) => setProductImageUrl(e.target.value)}
                            placeholder="https://ejemplo.com/imagen.jpg"
                            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            style={{
                                backgroundColor: theme.cardBg,
                                borderColor: theme.border,
                                color: theme.text
                            }}
                        />
                    </div>
                </div>

                {/* Short Description */}
                <div>
                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                        Descripcion Corta
                    </label>
                    <textarea
                        value={shortDescription}
                        onChange={(e) => setShortDescription(e.target.value)}
                        placeholder="Breve descripcion del producto..."
                        rows={2}
                        className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.border,
                            color: theme.text
                        }}
                    />
                </div>

                {/* Long Description */}
                <div>
                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                        Descripcion Detallada
                    </label>
                    <textarea
                        value={longDescription}
                        onChange={(e) => setLongDescription(e.target.value)}
                        placeholder="Descripcion completa del producto, ingredientes, uso recomendado..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        style={{
                            backgroundColor: theme.cardBg,
                            borderColor: theme.border,
                            color: theme.text
                        }}
                    />
                </div>

                {/* Purchase Links */}
                <div>
                    <label className="block text-sm mb-2 flex items-center" style={{ color: theme.textMuted }}>
                        <LinkIcon className="w-4 h-4 mr-1" />
                        Enlaces de Compra
                    </label>
                    <div className="space-y-2">
                        {purchaseLinks.map((link, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    type="text"
                                    value={link.label}
                                    onChange={(e) => updatePurchaseLink(index, 'label', e.target.value)}
                                    placeholder="Nombre (ej: Tienda Oficial)"
                                    className="flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        borderColor: theme.border,
                                        color: theme.text
                                    }}
                                />
                                <input
                                    type="url"
                                    value={link.url}
                                    onChange={(e) => updatePurchaseLink(index, 'url', e.target.value)}
                                    placeholder="https://..."
                                    className="flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        borderColor: theme.border,
                                        color: theme.text
                                    }}
                                />
                                <button
                                    onClick={() => removePurchaseLink(index)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                                    style={{ color: '#ef4444' }}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addPurchaseLink}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed hover:border-emerald-500 transition-colors text-sm"
                            style={{ borderColor: theme.border, color: theme.textMuted }}
                        >
                            <Plus className="w-4 h-4" /> Agregar enlace
                        </button>
                    </div>
                </div>

                {/* Visibility Toggle */}
                <div
                    className="p-4 rounded-lg border"
                    style={{
                        backgroundColor: isHidden ? '#7c3aed20' : theme.cardBg,
                        borderColor: isHidden ? '#7c3aed' : theme.border
                    }}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {isHidden ? (
                                <EyeOff className="w-5 h-5" style={{ color: '#7c3aed' }} />
                            ) : (
                                <Eye className="w-5 h-5" style={{ color: theme.accent }} />
                            )}
                            <div>
                                <span className="font-medium" style={{ color: theme.text }}>
                                    {isHidden ? 'COA Oculto' : 'COA Publico'}
                                </span>
                                <p className="text-xs" style={{ color: theme.textMuted }}>
                                    {isHidden
                                        ? 'Este COA no aparecera en carpetas publicas'
                                        : 'Este COA es visible en carpetas publicas compartidas'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsHidden(!isHidden)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${isHidden ? 'bg-purple-600' : 'bg-gray-400'
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isHidden ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Additional Documents */}
                <div>
                    <label className="block text-sm mb-2 flex items-center" style={{ color: theme.textMuted }}>
                        <FileText className="w-4 h-4 mr-1" />
                        Documentos Adicionales
                    </label>
                    <div className="space-y-2">
                        {additionalDocs.map((doc, index) => (
                            <div key={index} className="flex gap-2">
                                <input
                                    type="text"
                                    value={doc.type}
                                    onChange={(e) => updateDocument(index, 'type', e.target.value)}
                                    placeholder="Tipo (ej: Ficha Tecnica)"
                                    className="w-1/4 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        borderColor: theme.border,
                                        color: theme.text
                                    }}
                                />
                                <input
                                    type="text"
                                    value={doc.filename}
                                    onChange={(e) => updateDocument(index, 'filename', e.target.value)}
                                    placeholder="Nombre archivo"
                                    className="w-1/4 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        borderColor: theme.border,
                                        color: theme.text
                                    }}
                                />
                                <input
                                    type="url"
                                    value={doc.url}
                                    onChange={(e) => updateDocument(index, 'url', e.target.value)}
                                    placeholder="URL del documento"
                                    className="flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        borderColor: theme.border,
                                        color: theme.text
                                    }}
                                />
                                <button
                                    onClick={() => removeDocument(index)}
                                    className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
                                    style={{ color: '#ef4444' }}
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addDocument}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed hover:border-emerald-500 transition-colors text-sm"
                            style={{ borderColor: theme.border, color: theme.textMuted }}
                        >
                            <Plus className="w-4 h-4" /> Agregar documento
                        </button>
                    </div>
                </div>

                {/* Analytics Section */}
                <div
                    className="rounded-lg border overflow-hidden"
                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                >
                    <button
                        onClick={() => setShowAnalytics(!showAnalytics)}
                        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                        style={{ backgroundColor: theme.cardBg }}
                    >
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" style={{ color: theme.accent }} />
                            <span className="font-medium" style={{ color: theme.text }}>Analytics del COA</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {loadingAnalytics && <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.textMuted }} />}
                            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                                {analytics?.summary?.total_views || 0} vistas
                            </span>
                            <svg
                                className={`w-5 h-5 transition-transform ${showAnalytics ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                style={{ color: theme.textMuted }}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </button>

                    {showAnalytics && (
                        <div className="p-4 border-t space-y-4" style={{ borderColor: theme.border }}>
                            {/* Refresh button */}
                            <div className="flex justify-end">
                                <button
                                    onClick={loadAnalytics}
                                    disabled={loadingAnalytics}
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                                    style={{ color: theme.textMuted }}
                                >
                                    <RefreshCw className={`w-3 h-3 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                                    Actualizar
                                </button>
                            </div>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div
                                    className="p-3 rounded-lg border text-center"
                                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                                >
                                    <BarChart3 className="w-5 h-5 mx-auto mb-1" style={{ color: themeMode === 'tokyo' ? '#00f5d4' : theme.accent }} />
                                    <span className="text-2xl font-bold block" style={{ color: themeMode === 'tokyo' ? '#00f5d4' : theme.accent }}>
                                        {analytics?.summary?.total_views || 0}
                                    </span>
                                    <span className="text-xs" style={{ color: theme.textMuted }}>Vistas totales</span>
                                </div>
                                <div
                                    className="p-3 rounded-lg border text-center"
                                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                                >
                                    <Users className="w-5 h-5 mx-auto mb-1" style={{ color: themeMode === 'tokyo' ? '#39ff14' : '#22c55e' }} />
                                    <span className="text-2xl font-bold block" style={{ color: themeMode === 'tokyo' ? '#39ff14' : '#22c55e' }}>
                                        {analytics?.summary?.unique_visitors || 0}
                                    </span>
                                    <span className="text-xs" style={{ color: theme.textMuted }}>Visitantes unicos</span>
                                </div>
                                <div
                                    className="p-3 rounded-lg border text-center"
                                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                                >
                                    <Download className="w-5 h-5 mx-auto mb-1" style={{ color: themeMode === 'tokyo' ? '#ffbe0b' : '#eab308' }} />
                                    <span className="text-2xl font-bold block" style={{ color: themeMode === 'tokyo' ? '#ffbe0b' : '#eab308' }}>
                                        {analytics?.summary?.pdf_downloads || 0}
                                    </span>
                                    <span className="text-xs" style={{ color: theme.textMuted }}>Descargas PDF</span>
                                </div>
                                <div
                                    className="p-3 rounded-lg border text-center"
                                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                                >
                                    <MousePointerClick className="w-5 h-5 mx-auto mb-1" style={{ color: themeMode === 'tokyo' ? '#ff00ff' : '#a855f7' }} />
                                    <span className="text-2xl font-bold block" style={{ color: themeMode === 'tokyo' ? '#ff00ff' : '#a855f7' }}>
                                        {analytics?.summary?.link_clicks || 0}
                                    </span>
                                    <span className="text-xs" style={{ color: theme.textMuted }}>Clicks en links</span>
                                </div>
                            </div>

                            {/* Access Types */}
                            {analytics?.access_types && analytics.access_types.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium mb-2" style={{ color: theme.text }}>Fuentes de Acceso</h4>
                                    <div className="space-y-2">
                                        {analytics.access_types.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-sm">
                                                <span style={{ color: theme.textMuted }}>
                                                    {item.access_type === 'direct_link' ? 'Link Directo' :
                                                        item.access_type === 'qr_scan' ? 'Escaneo QR' :
                                                            item.access_type === 'cvv_verification' ? 'Verificacion CVV' :
                                                                item.access_type === 'pdf_link' ? 'Link desde PDF' :
                                                                    item.access_type}
                                                </span>
                                                <span className="font-medium" style={{ color: theme.accent }}>{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Device Breakdown */}
                            {analytics?.devices && analytics.devices.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium mb-2" style={{ color: theme.text }}>Dispositivos</h4>
                                    <div className="flex gap-4">
                                        {analytics.devices.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm">
                                                <span style={{ color: theme.textMuted }}>
                                                    {item.device_type === 'mobile' ? '📱 Movil' :
                                                        item.device_type === 'desktop' ? '💻 Desktop' :
                                                            item.device_type === 'tablet' ? '📱 Tablet' :
                                                                item.device_type}
                                                </span>
                                                <span className="font-medium" style={{ color: theme.text }}>{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Location Breakdown */}
                            {(analytics?.top_countries && analytics.top_countries.length > 0) || (analytics?.top_cities && analytics.top_cities.length > 0) ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Top Countries */}
                                    {analytics?.top_countries && analytics.top_countries.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-medium mb-2 flex items-center gap-1" style={{ color: theme.text }}>
                                                <Globe className="w-4 h-4" style={{ color: themeMode === 'tokyo' ? '#9b5de5' : '#8b5cf6' }} />
                                                Paises
                                            </h4>
                                            <div className="space-y-1">
                                                {analytics.top_countries.slice(0, 5).map((item, idx) => (
                                                    <div key={idx} className="flex items-center justify-between text-sm">
                                                        <span style={{ color: theme.textMuted }}>
                                                            {item.country_name || item.country_code}
                                                        </span>
                                                        <span className="font-medium" style={{ color: themeMode === 'tokyo' ? '#9b5de5' : '#8b5cf6' }}>
                                                            {item.count}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Top Cities */}
                                    {analytics?.top_cities && analytics.top_cities.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-medium mb-2 flex items-center gap-1" style={{ color: theme.text }}>
                                                <MapPin className="w-4 h-4" style={{ color: themeMode === 'tokyo' ? '#00f5d4' : theme.accent }} />
                                                Ciudades
                                            </h4>
                                            <div className="space-y-1">
                                                {analytics.top_cities.slice(0, 5).map((item, idx) => (
                                                    <div key={idx} className="flex items-center justify-between text-sm">
                                                        <div>
                                                            <span style={{ color: theme.textMuted }}>{item.city}</span>
                                                            {item.country && (
                                                                <span className="text-xs ml-1" style={{ color: theme.textMuted, opacity: 0.7 }}>
                                                                    ({item.country})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="font-medium" style={{ color: themeMode === 'tokyo' ? '#00f5d4' : theme.accent }}>
                                                            {item.count}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {/* No data message */}
                            {!analytics?.summary?.total_views && (
                                <div className="text-center py-4">
                                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: theme.textMuted }} />
                                    <p className="text-sm" style={{ color: theme.textMuted }}>
                                        Aun no hay datos de analytics para este COA
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                >
                    {saving ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            Guardar Cambios
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
