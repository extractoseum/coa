import { useState, useEffect } from 'react';
import { Upload, Image, Link as LinkIcon, FileText, Plus, X, Loader2, Award, RefreshCw, EyeOff, Eye, BarChart2, Monitor, Smartphone, Tablet, Globe, MapPin, Palette, Check, Star, MessageSquare } from 'lucide-react';
import type { PurchaseLink, COA, Badge } from '../types/coa';
import { authFetch } from '../contexts/AuthContext';

type ThemeMode = 'light' | 'dark' | 'tokyo';

interface Template {
    id: string;
    name: string;
    company_name: string;
    company_logo_url: string | null;
    watermark_url: string | null;
    primary_color: string;
    is_active: boolean;
}

interface EnrichmentFormProps {
    coaToken: string;
    coa?: COA;
    onComplete?: () => void;
    themeMode?: ThemeMode;
}

export default function COAEnrichmentForm({ coaToken, coa, onComplete, themeMode = 'dark' }: EnrichmentFormProps) {
    // Theme colors - 3 modes
    const themes = {
        light: {
            bg: '#f3f4f6',
            cardBg: '#ffffff',
            cardBg2: '#f9fafb',
            border: '#d1d5db',
            text: '#111827',
            textMuted: '#6b7280',
            inputBg: '#ffffff',
            inputBorder: '#d1d5db',
            accent: '#10b981',
            // Analytics colors
            statBlue: '#3b82f6',
            statGreen: '#10b981',
            statYellow: '#f59e0b',
            statPurple: '#8b5cf6',
        },
        dark: {
            bg: '#0a0e1a',
            cardBg: '#111827',
            cardBg2: '#1f2937',
            border: '#374151',
            text: '#ffffff',
            textMuted: '#d1d5db',
            inputBg: '#0f172a',
            inputBorder: '#374151',
            accent: '#10b981',
            // Analytics colors
            statBlue: '#3b82f6',
            statGreen: '#10b981',
            statYellow: '#f59e0b',
            statPurple: '#8b5cf6',
        },
        tokyo: {
            bg: '#0d0d1a',
            cardBg: '#1a1a2e',
            cardBg2: '#16213e',
            border: '#4a4a8a',
            text: '#ffffff',
            textMuted: '#a0a0c0',
            inputBg: '#0f0f1f',
            inputBorder: '#4a4a8a',
            accent: '#00f5d4', // Cyan neon
            // Analytics colors - neon vibrant
            statBlue: '#00f5d4',    // Cyan neon
            statGreen: '#39ff14',   // Verde neon
            statYellow: '#ffbe0b',  // Amarillo neon
            statPurple: '#ff00ff',  // Magenta neon
        }
    };
    const theme = themes[themeMode];
    // Product Image
    const [productImage, setProductImage] = useState<File | null>(null);
    const [productImagePreview, setProductImagePreview] = useState<string>('');
    const [uploadingImage, setUploadingImage] = useState(false);

    // Purchase Links
    const [purchaseLinks, setPurchaseLinks] = useState<PurchaseLink[]>([]);
    const [newLink, setNewLink] = useState<PurchaseLink>({ label: '', url: '' });
    const [updatingLinks, setUpdatingLinks] = useState(false);

    // Additional Documents
    const [docType, setDocType] = useState<'Amparo' | 'Autorización' | 'Instructivo' | 'Otro'>('Amparo');
    const [docFile, setDocFile] = useState<File | null>(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // Badges
    const [allBadges, setAllBadges] = useState<Badge[]>([]);
    const [selectedBadgeIds, setSelectedBadgeIds] = useState<number[]>([]);
    const [updatingBadges, setUpdatingBadges] = useState(false);

    // COA Name & Number & Batch
    const [customName, setCustomName] = useState('');
    const [coaNumber, setCoaNumber] = useState('');
    const [batchId, setBatchId] = useState('');
    const [updatingBasicInfo, setUpdatingBasicInfo] = useState(false);

    // Extended Metadata
    const [metadata, setMetadata] = useState({
        client_name: '',
        client_reference: '',
        received_date: '',
        sample_condition: '',
        storage_temp: '',
        storage_time: '',
        container_type: '',
        batch_number: '',
        description_short: '',
        description_extended: '',
        sample_weight: '',
        is_total_potency: false
    });
    const [updatingMetadata, setUpdatingMetadata] = useState(false);

    // Re-extraction
    const [reExtracting, setReExtracting] = useState(false);
    const [reExtractResult, setReExtractResult] = useState<{ success: boolean; message: string; stats?: any } | null>(null);

    // Visibility
    const [isHidden, setIsHidden] = useState(false);
    const [savingVisibility, setSavingVisibility] = useState(false);

    // Templates
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [savingTemplate, setSavingTemplate] = useState(false);

    // Analytics
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(true);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);

    // Reviews settings
    const [reviewsEnabled, setReviewsEnabled] = useState(false);
    const [reviewsRequireApproval, setReviewsRequireApproval] = useState(true);
    const [savingReviewSettings, setSavingReviewSettings] = useState(false);
    const [pendingReviews, setPendingReviews] = useState<any[]>([]);
    const [loadingPendingReviews, setLoadingPendingReviews] = useState(false);

    // Load analytics data
    useEffect(() => {
        const loadAnalytics = async () => {
            try {
                setLoadingAnalytics(true);
                setAnalyticsError(null);
                const res = await authFetch(`/api/v1/analytics/coa/${coaToken}`);
                const data = await res.json();
                if (data.success) {
                    setAnalyticsData(data);
                } else {
                    setAnalyticsError(data.error || 'No hay datos de analytics');
                }
            } catch (error) {
                console.error('Load analytics error:', error);
                setAnalyticsError('Error al cargar analytics');
            } finally {
                setLoadingAnalytics(false);
            }
        };

        if (coaToken) {
            loadAnalytics();
        }
    }, [coaToken]);

    // Load all available badges
    useEffect(() => {
        fetch('/api/v1/badges')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setAllBadges(data.badges);
                }
            })
            .catch(err => console.error('Load badges error:', err));
    }, []);

    // Load all templates
    useEffect(() => {
        fetch('/api/v1/templates')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setTemplates(data.templates || []);
                }
            })
            .catch(err => console.error('Load templates error:', err));
    }, []);

    // Load existing data when COA changes
    useEffect(() => {
        if (coa) {
            // Load custom name and COA number
            setCustomName(coa.custom_name || '');
            setCoaNumber(coa.coa_number || '');

            // Load product image preview
            if (coa.product_image_url) {
                setProductImagePreview(coa.product_image_url);
            }

            // Load purchase links
            if (coa.purchase_links) {
                setPurchaseLinks(coa.purchase_links);
            }

            // Load badges
            if (coa.badges) {
                setSelectedBadgeIds(coa.badges.map(b => b.id));
            }

            // Load metadata
            if (coa.metadata) {
                setMetadata({
                    client_name: coa.metadata.client_name || '',
                    client_reference: coa.metadata.client_reference || '',
                    received_date: coa.metadata.received_date || '',
                    sample_condition: coa.metadata.sample_condition || '',
                    storage_temp: coa.metadata.storage_temp || '',
                    storage_time: coa.metadata.storage_time || '',
                    container_type: coa.metadata.container_type || '',
                    batch_number: coa.metadata.batch_number || '',
                    description_short: coa.metadata.description_short || '',
                    description_extended: coa.metadata.description_extended || '',
                    sample_weight: coa.metadata.sample_weight || '',
                    is_total_potency: coa.metadata.is_total_potency || false
                });
            }

            // Load visibility
            setIsHidden(coa.is_hidden || false);

            // Load template
            if (coa.template_id) {
                setSelectedTemplateId(coa.template_id);
            }

            // Load review settings
            setReviewsEnabled(coa.reviews_enabled || false);
            setReviewsRequireApproval(coa.reviews_require_approval !== false);
        }
    }, [coa]);

    // Load pending reviews
    useEffect(() => {
        const loadPendingReviews = async () => {
            if (!coaToken || !reviewsEnabled) return;
            setLoadingPendingReviews(true);
            try {
                const res = await authFetch(`/api/v1/reviews/${coaToken}/pending`);
                const data = await res.json();
                if (data.success) {
                    setPendingReviews(data.reviews || []);
                }
            } catch (error) {
                console.error('Error loading pending reviews:', error);
            } finally {
                setLoadingPendingReviews(false);
            }
        };

        loadPendingReviews();
    }, [coaToken, reviewsEnabled]);

    // Save template selection
    const saveTemplate = async () => {
        setSavingTemplate(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/template`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_id: selectedTemplateId })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Template asignado');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setSavingTemplate(false);
        }
    };

    // Handlers
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProductImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setProductImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const uploadProductImage = async () => {
        if (!productImage) return;

        setUploadingImage(true);
        try {
            const formData = new FormData();
            formData.append('image', productImage);

            const res = await fetch(`/api/v1/coas/${coaToken}/product-image`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Imagen del producto subida');
                setProductImage(null);
                setProductImagePreview('');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleReExtract = async () => {
        if (!confirm('¿Deseas re-extraer los datos del PDF? Esto actualizará los cannabinoides y datos de cromatografía.')) {
            return;
        }

        setReExtracting(true);
        setReExtractResult(null);
        try {
            const res = await authFetch(`/api/v1/coas/${coaToken}/re-extract`, {
                method: 'POST'
            });

            const data = await res.json();
            if (data.success) {
                setReExtractResult({
                    success: true,
                    message: `Re-extracción exitosa. ${data.stats.cannabinoidsFound} cannabinoides encontrados. Cromatografía: ${data.stats.hasChromatogramData ? 'Sí' : 'No'}`,
                    stats: data.stats
                });
                if (onComplete) onComplete();
            } else {
                setReExtractResult({
                    success: false,
                    message: 'Error: ' + data.error
                });
            }
        } catch (error) {
            console.error(error);
            setReExtractResult({
                success: false,
                message: 'Error de conexión'
            });
        } finally {
            setReExtracting(false);
        }
    };

    const saveVisibility = async () => {
        setSavingVisibility(true);
        try {
            const res = await authFetch(`/api/v1/coas/${coaToken}/visibility`, {
                method: 'PATCH',
                body: JSON.stringify({ is_hidden: isHidden })
            });

            const data = await res.json();
            if (data.success) {
                alert(isHidden ? '✅ COA marcado como oculto' : '✅ COA marcado como público');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setSavingVisibility(false);
        }
    };

    const addPurchaseLink = () => {
        if (newLink.label && newLink.url) {
            setPurchaseLinks([...purchaseLinks, newLink]);
            setNewLink({ label: '', url: '' });
        }
    };

    const removePurchaseLink = async (index: number) => {
        const updatedLinks = purchaseLinks.filter((_, i) => i !== index);
        setPurchaseLinks(updatedLinks);

        // Auto-save after removing
        setUpdatingLinks(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/purchase-links`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: updatedLinks })
            });

            const data = await res.json();
            if (data.success) {
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUpdatingLinks(false);
        }
    };

    const savePurchaseLinks = async () => {
        setUpdatingLinks(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/purchase-links`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: purchaseLinks })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Links de compra guardados');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUpdatingLinks(false);
        }
    };

    const uploadDocument = async () => {
        if (!docFile) return;

        setUploadingDoc(true);
        try {
            const formData = new FormData();
            formData.append('document', docFile);
            formData.append('type', docType);

            const res = await fetch(`/api/v1/coas/${coaToken}/documents`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                alert(`✅ ${docType} subido`);
                setDocFile(null);
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUploadingDoc(false);
        }
    };

    const deleteDocument = async (docIndex: number, docType: string) => {
        if (!confirm(`¿Eliminar documento "${docType}"?`)) return;

        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/documents/${docIndex}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Documento eliminado');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        }
    };

    const saveBasicInfo = async () => {
        setUpdatingBasicInfo(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/basic-info`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    custom_name: customName || null,
                    coa_number: coaNumber || null
                })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Nombre y número actualizados');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUpdatingBasicInfo(false);
        }
    };

    const saveMetadata = async () => {
        setUpdatingMetadata(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/metadata`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Metadata guardada');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUpdatingMetadata(false);
        }
    };

    const saveBadges = async () => {
        setUpdatingBadges(true);
        try {
            const res = await fetch(`/api/v1/coas/${coaToken}/badges`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ badge_ids: selectedBadgeIds })
            });

            const data = await res.json();
            if (data.success) {
                alert('✅ Badges guardados');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setUpdatingBadges(false);
        }
    };

    const toggleBadge = (badgeId: number) => {
        setSelectedBadgeIds(prev =>
            prev.includes(badgeId)
                ? prev.filter(id => id !== badgeId)
                : [...prev, badgeId]
        );
    };

    // Save review settings
    const saveReviewSettings = async () => {
        setSavingReviewSettings(true);
        try {
            const res = await authFetch(`/api/v1/reviews/${coaToken}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reviews_enabled: reviewsEnabled,
                    reviews_require_approval: reviewsRequireApproval
                })
            });

            const data = await res.json();
            if (data.success) {
                alert('Configuracion de resenas guardada');
                if (onComplete) onComplete();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexion');
        } finally {
            setSavingReviewSettings(false);
        }
    };

    // Approve a review
    const approveReview = async (reviewId: string) => {
        try {
            const res = await authFetch(`/api/v1/reviews/review/${reviewId}/approve`, {
                method: 'PATCH'
            });
            const data = await res.json();
            if (data.success) {
                setPendingReviews(prev => prev.filter(r => r.id !== reviewId));
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexion');
        }
    };

    // Reject a review
    const rejectReview = async (reviewId: string) => {
        if (!confirm('Rechazar y eliminar esta resena?')) return;
        try {
            const res = await authFetch(`/api/v1/reviews/review/${reviewId}/reject`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setPendingReviews(prev => prev.filter(r => r.id !== reviewId));
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexion');
        }
    };

    return (
        <div className="space-y-6">
            {/* Re-Extract Section */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <RefreshCw className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Re-extraer Datos del PDF
                </h3>
                <p className="text-sm mb-4" style={{ color: theme.textMuted }}>
                    Re-procesa los archivos PDF originales para actualizar los cannabinoides y datos de cromatografía con el extractor más reciente.
                </p>
                <button
                    onClick={handleReExtract}
                    disabled={reExtracting}
                    className="hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                    style={{ backgroundColor: '#6366f1' }}
                >
                    {reExtracting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    {reExtracting ? 'Re-extrayendo...' : 'Re-extraer Datos'}
                </button>
                {reExtractResult && (
                    <div
                        className={`mt-4 p-3 rounded-lg text-sm ${reExtractResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}
                    >
                        {reExtractResult.message}
                        {reExtractResult.stats && (
                            <div className="mt-2 text-xs opacity-80">
                                PDFs procesados: {reExtractResult.stats.pdfsProcessed} |
                                Total THC: {reExtractResult.stats.totalTHC}%
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Analytics Section */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <BarChart2 className="w-5 h-5 mr-2" style={{ color: theme.statBlue }} />
                    Analytics del COA
                </h3>

                {loadingAnalytics && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.textMuted }} />
                        <span className="ml-2 text-sm" style={{ color: theme.textMuted }}>Cargando analytics...</span>
                    </div>
                )}

                {analyticsError && !loadingAnalytics && (
                    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                        <p className="text-sm text-yellow-400">{analyticsError}</p>
                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                            Las tablas de analytics pueden no estar configuradas en la base de datos.
                        </p>
                    </div>
                )}

                {analyticsData && !loadingAnalytics && (
                    <div className="space-y-4">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-2xl font-bold" style={{ color: theme.statBlue }}>{analyticsData.summary?.total_views || 0}</p>
                                <p className="text-xs" style={{ color: theme.textMuted }}>Vistas Totales</p>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-2xl font-bold" style={{ color: theme.statGreen }}>{analyticsData.summary?.unique_visitors || 0}</p>
                                <p className="text-xs" style={{ color: theme.textMuted }}>Visitantes Únicos</p>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-2xl font-bold" style={{ color: theme.statYellow }}>{analyticsData.summary?.pdf_downloads || 0}</p>
                                <p className="text-xs" style={{ color: theme.textMuted }}>Descargas PDF</p>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-2xl font-bold" style={{ color: theme.statPurple }}>{analyticsData.summary?.link_clicks || 0}</p>
                                <p className="text-xs" style={{ color: theme.textMuted }}>Clicks en Links</p>
                            </div>
                        </div>

                        {/* Access Type Breakdown */}
                        <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                            <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Por Tipo de Acceso</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                    <span style={{ color: theme.textMuted }}>Enlace Directo</span>
                                    <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_access_type?.direct_link || 0}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                    <span style={{ color: theme.textMuted }}>QR Global</span>
                                    <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_access_type?.qr_global || 0}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                    <span style={{ color: theme.textMuted }}>Código CVV</span>
                                    <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_access_type?.cvv_verification || 0}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                    <span style={{ color: theme.textMuted }}>Links del PDF</span>
                                    <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_access_type?.pdf_link || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* Device Breakdown */}
                        <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                            <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Por Dispositivo</p>
                            <div className="flex gap-4 justify-center">
                                <div className="flex items-center gap-2">
                                    <Monitor className="w-4 h-4" style={{ color: theme.textMuted }} />
                                    <span className="text-sm" style={{ color: theme.text }}>{analyticsData.by_device?.desktop || 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Smartphone className="w-4 h-4" style={{ color: theme.textMuted }} />
                                    <span className="text-sm" style={{ color: theme.text }}>{analyticsData.by_device?.mobile || 0}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tablet className="w-4 h-4" style={{ color: theme.textMuted }} />
                                    <span className="text-sm" style={{ color: theme.text }}>{analyticsData.by_device?.tablet || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* Location Breakdown - Countries & Cities */}
                        {(analyticsData.top_countries && analyticsData.top_countries.length > 0) || (analyticsData.top_cities && analyticsData.top_cities.length > 0) ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Top Countries */}
                                {analyticsData.top_countries && analyticsData.top_countries.length > 0 && (
                                    <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                        <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                                            <Globe className="w-4 h-4" style={{ color: themeMode === 'tokyo' ? '#9b5de5' : '#8b5cf6' }} />
                                            Países
                                        </p>
                                        <div className="space-y-2">
                                            {analyticsData.top_countries.slice(0, 5).map((item: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
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
                                {analyticsData.top_cities && analyticsData.top_cities.length > 0 && (
                                    <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                        <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                                            <MapPin className="w-4 h-4" style={{ color: themeMode === 'tokyo' ? '#00f5d4' : theme.accent }} />
                                            Ciudades
                                        </p>
                                        <div className="space-y-2">
                                            {analyticsData.top_cities.slice(0, 5).map((item: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
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

                        {/* PDF Link Source Breakdown */}
                        {(analyticsData.by_pdf_link_source?.batch_id > 0 ||
                          analyticsData.by_pdf_link_source?.token > 0 ||
                          analyticsData.by_pdf_link_source?.product_image > 0 ||
                          analyticsData.by_pdf_link_source?.coa_number > 0) && (
                            <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Clicks desde PDF</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {analyticsData.by_pdf_link_source?.batch_id > 0 && (
                                        <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                            <span style={{ color: theme.textMuted }}>Lote</span>
                                            <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_pdf_link_source.batch_id}</span>
                                        </div>
                                    )}
                                    {analyticsData.by_pdf_link_source?.token > 0 && (
                                        <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                            <span style={{ color: theme.textMuted }}>Token</span>
                                            <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_pdf_link_source.token}</span>
                                        </div>
                                    )}
                                    {analyticsData.by_pdf_link_source?.product_image > 0 && (
                                        <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                            <span style={{ color: theme.textMuted }}>Imagen</span>
                                            <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_pdf_link_source.product_image}</span>
                                        </div>
                                    )}
                                    {analyticsData.by_pdf_link_source?.coa_number > 0 && (
                                        <div className="flex justify-between items-center text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                            <span style={{ color: theme.textMuted }}>Número COA</span>
                                            <span className="font-medium" style={{ color: theme.text }}>{analyticsData.by_pdf_link_source.coa_number}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Recent Scans */}
                        {analyticsData.recent_scans && analyticsData.recent_scans.length > 0 && (
                            <div className="p-4 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>Accesos Recientes</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {analyticsData.recent_scans.slice(0, 10).map((scan: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between text-xs p-2 rounded" style={{ backgroundColor: theme.cardBg }}>
                                            <div className="flex items-center gap-2">
                                                {scan.device_type === 'desktop' && <Monitor className="w-3 h-3" style={{ color: theme.textMuted }} />}
                                                {scan.device_type === 'mobile' && <Smartphone className="w-3 h-3" style={{ color: theme.textMuted }} />}
                                                {scan.device_type === 'tablet' && <Tablet className="w-3 h-3" style={{ color: theme.textMuted }} />}
                                                <span style={{ color: theme.text }}>
                                                    {scan.access_type === 'direct_link' && 'Enlace Directo'}
                                                    {scan.access_type === 'qr_global' && 'QR Global'}
                                                    {scan.access_type === 'cvv_verification' && 'Código CVV'}
                                                    {scan.access_type === 'pdf_link' && `PDF (${scan.link_source || 'link'})`}
                                                    {scan.access_type === 'internal_nav' && 'Navegación'}
                                                </span>
                                            </div>
                                            <span style={{ color: theme.textMuted }}>
                                                {new Date(scan.scanned_at).toLocaleDateString('es-MX', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Period Info */}
                        <p className="text-xs text-center" style={{ color: theme.textMuted }}>
                            Datos de los últimos {analyticsData.period?.days || 30} días
                        </p>
                    </div>
                )}
            </div>

            {/* Visibility Toggle */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    {isHidden ? <EyeOff className="w-5 h-5 mr-2" style={{ color: '#7c3aed' }} /> : <Eye className="w-5 h-5 mr-2" style={{ color: theme.accent }} />}
                    Visibilidad en Carpetas Públicas
                </h3>
                <div
                    className="p-4 rounded-lg border"
                    style={{
                        backgroundColor: isHidden ? '#7c3aed20' : theme.cardBg2,
                        borderColor: isHidden ? '#7c3aed' : theme.border
                    }}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div>
                                <span className="font-medium" style={{ color: theme.text }}>
                                    {isHidden ? 'COA Oculto' : 'COA Público'}
                                </span>
                                <p className="text-xs" style={{ color: theme.textMuted }}>
                                    {isHidden
                                        ? 'Este COA no aparecerá en carpetas públicas'
                                        : 'Este COA es visible en carpetas públicas compartidas'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsHidden(!isHidden)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                isHidden ? 'bg-purple-600' : 'bg-gray-400'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    isHidden ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>
                <button
                    onClick={saveVisibility}
                    disabled={savingVisibility}
                    className="mt-4 hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                    style={{ backgroundColor: isHidden ? '#7c3aed' : theme.accent }}
                >
                    {savingVisibility ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (isHidden ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />)}
                    {savingVisibility ? 'Guardando...' : 'Guardar Visibilidad'}
                </button>
            </div>

            {/* Reviews Settings */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <MessageSquare className="w-5 h-5 mr-2" style={{ color: '#f59e0b' }} />
                    Resenas y Calificaciones
                </h3>
                <p className="text-sm mb-4" style={{ color: theme.textMuted }}>
                    Permite que los usuarios dejen resenas y calificaciones para este producto.
                </p>

                {/* Enable Reviews Toggle */}
                <div
                    className="p-4 rounded-lg border mb-4"
                    style={{
                        backgroundColor: reviewsEnabled ? '#f59e0b20' : theme.cardBg2,
                        borderColor: reviewsEnabled ? '#f59e0b' : theme.border
                    }}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="font-medium" style={{ color: theme.text }}>
                                {reviewsEnabled ? 'Resenas Habilitadas' : 'Resenas Deshabilitadas'}
                            </span>
                            <p className="text-xs" style={{ color: theme.textMuted }}>
                                {reviewsEnabled
                                    ? 'Los usuarios pueden dejar resenas en este COA'
                                    : 'Las resenas estan deshabilitadas para este COA'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReviewsEnabled(!reviewsEnabled)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                reviewsEnabled ? 'bg-amber-500' : 'bg-gray-400'
                            }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                    reviewsEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Require Approval Toggle */}
                {reviewsEnabled && (
                    <div
                        className="p-4 rounded-lg border mb-4"
                        style={{
                            backgroundColor: theme.cardBg2,
                            borderColor: theme.border
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="font-medium" style={{ color: theme.text }}>
                                    Requerir Aprobacion
                                </span>
                                <p className="text-xs" style={{ color: theme.textMuted }}>
                                    {reviewsRequireApproval
                                        ? 'Las resenas requieren tu aprobacion antes de publicarse'
                                        : 'Las resenas se publican automaticamente'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setReviewsRequireApproval(!reviewsRequireApproval)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                    reviewsRequireApproval ? 'bg-amber-500' : 'bg-gray-400'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        reviewsRequireApproval ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>
                )}

                {/* Pending Reviews */}
                {reviewsEnabled && pendingReviews.length > 0 && (
                    <div className="mb-4">
                        <p className="text-sm font-medium mb-3" style={{ color: theme.text }}>
                            Resenas Pendientes ({pendingReviews.length})
                        </p>
                        <div className="space-y-3">
                            {pendingReviews.map((review) => (
                                <div
                                    key={review.id}
                                    className="p-4 rounded-lg border"
                                    style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <span className="text-sm font-medium" style={{ color: theme.text }}>
                                                {review.clients?.name || review.clients?.email || 'Usuario'}
                                            </span>
                                            <div className="flex items-center mt-1">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                        key={star}
                                                        className="w-4 h-4"
                                                        fill={star <= review.rating ? '#fbbf24' : 'none'}
                                                        stroke={star <= review.rating ? '#fbbf24' : theme.textMuted}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <span className="text-xs" style={{ color: theme.textMuted }}>
                                            {new Date(review.created_at).toLocaleDateString('es-MX')}
                                        </span>
                                    </div>
                                    {review.review_text && (
                                        <p className="text-sm mb-3" style={{ color: theme.textMuted }}>
                                            {review.review_text}
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => approveReview(review.id)}
                                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                                            style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                        >
                                            Aprobar
                                        </button>
                                        <button
                                            onClick={() => rejectReview(review.id)}
                                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                                            style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
                                        >
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loading pending reviews */}
                {reviewsEnabled && loadingPendingReviews && (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: theme.textMuted }} />
                        <span className="ml-2 text-sm" style={{ color: theme.textMuted }}>Cargando resenas...</span>
                    </div>
                )}

                <button
                    onClick={saveReviewSettings}
                    disabled={savingReviewSettings}
                    className="hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                    style={{ backgroundColor: '#f59e0b' }}
                >
                    {savingReviewSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                    {savingReviewSettings ? 'Guardando...' : 'Guardar Configuracion'}
                </button>
            </div>

            {/* Custom Name & COA Number */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <FileText className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Nombre y Número de COA
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                            Nombre Personalizado (Título del Certificado)
                        </label>
                        <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="Ej: Aceite de CBD Premium - Lote Mayo 2025"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Este nombre aparecerá como título del certificado</p>
                    </div>

                    <div>
                        <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>
                            Número de COA (Ej: EUM_00001_COA)
                        </label>
                        <input
                            type="text"
                            value={coaNumber}
                            onChange={(e) => setCoaNumber(e.target.value.toUpperCase())}
                            placeholder="EUM_00001_COA"
                            className="w-full border rounded-lg px-4 py-2 font-mono text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Formato recomendado: EUM_XXXXX_COA</p>
                    </div>

                    <button
                        onClick={saveBasicInfo}
                        disabled={updatingBasicInfo}
                        className="hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                        style={{ backgroundColor: theme.accent }}
                    >
                        {updatingBasicInfo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                        {updatingBasicInfo ? 'Guardando...' : 'Guardar Nombre y Número'}
                    </button>
                </div>
            </div>

            {/* Template Selector */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <Palette className="w-5 h-5 mr-2" style={{ color: '#8b5cf6' }} />
                    Template del PDF
                </h3>
                <p className="text-sm mb-4" style={{ color: theme.textMuted }}>
                    Selecciona el template de marca para generar el PDF de este COA
                </p>

                {templates.length === 0 ? (
                    <div className="text-center py-6" style={{ color: theme.textMuted }}>
                        <Palette className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No hay templates disponibles</p>
                        <a href="/templates" className="text-sm underline mt-2 inline-block hover:opacity-80" style={{ color: theme.accent }}>
                            Crear template →
                        </a>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Opción: usar template activo (default) */}
                            <label
                                className="cursor-pointer border-2 rounded-lg p-3 transition-all duration-300"
                                style={{
                                    borderColor: !selectedTemplateId ? theme.accent : theme.border,
                                    backgroundColor: !selectedTemplateId ? theme.accent + '20' : 'transparent'
                                }}
                            >
                                <input
                                    type="radio"
                                    name="template"
                                    checked={!selectedTemplateId}
                                    onChange={() => setSelectedTemplateId(null)}
                                    className="hidden"
                                />
                                <div className="flex items-center justify-center h-12 mb-2 rounded" style={{ backgroundColor: theme.cardBg2 }}>
                                    <span className="text-2xl">🎯</span>
                                </div>
                                <p className="text-xs text-center font-medium" style={{ color: theme.text }}>Template Activo</p>
                                <p className="text-xs text-center" style={{ color: theme.textMuted }}>Por defecto</p>
                            </label>

                            {templates.map((template) => (
                                <label
                                    key={template.id}
                                    className="cursor-pointer border-2 rounded-lg p-3 transition-all duration-300"
                                    style={{
                                        borderColor: selectedTemplateId === template.id ? theme.accent : theme.border,
                                        backgroundColor: selectedTemplateId === template.id ? theme.accent + '20' : 'transparent'
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="template"
                                        checked={selectedTemplateId === template.id}
                                        onChange={() => setSelectedTemplateId(template.id)}
                                        className="hidden"
                                    />
                                    <div className="flex items-center justify-center h-12 mb-2 rounded relative" style={{ backgroundColor: theme.cardBg2 }}>
                                        {template.company_logo_url ? (
                                            <img src={template.company_logo_url} alt={template.name} className="max-h-10 object-contain" />
                                        ) : (
                                            <div className="w-8 h-8 rounded" style={{ backgroundColor: template.primary_color }} />
                                        )}
                                        {template.is_active && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                                                <Check className="w-3 h-3 text-white" />
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-center font-medium truncate" style={{ color: theme.text }}>{template.name}</p>
                                    <p className="text-xs text-center truncate" style={{ color: theme.textMuted }}>{template.company_name || 'Sin nombre'}</p>
                                </label>
                            ))}
                        </div>

                        <button
                            onClick={saveTemplate}
                            disabled={savingTemplate}
                            className="w-full hover:opacity-90 disabled:opacity-50 text-white py-2 rounded-lg text-sm flex items-center justify-center transition-all"
                            style={{ backgroundColor: '#8b5cf6' }}
                        >
                            {savingTemplate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
                            {savingTemplate ? 'Guardando...' : 'Guardar Template'}
                        </button>
                    </div>
                )}
            </div>

            {/* Product Image */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <Image className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Imagen del Producto
                </h3>
                <div className="space-y-4">
                    {/* Show existing image */}
                    {coa?.product_image_url && !productImagePreview && (
                        <div className="relative">
                            <img src={coa.product_image_url} alt="Product current" className="max-h-48 rounded-lg border" style={{ borderColor: theme.border }} />
                            <p className="text-xs mt-2" style={{ color: theme.textMuted }}>✓ Imagen actual del producto</p>
                        </div>
                    )}

                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:text-white hover:file:opacity-90 transition-all"
                        style={{
                            color: theme.textMuted,
                            backgroundColor: 'transparent'
                        }}
                    />
                    {productImagePreview && (
                        <div className="relative">
                            <img src={productImagePreview} alt="Preview" className="max-h-48 rounded-lg border" style={{ borderColor: theme.border }} />
                            <button
                                onClick={uploadProductImage}
                                disabled={uploadingImage}
                                className="mt-2 hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                                style={{ backgroundColor: theme.accent }}
                            >
                                {uploadingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                {uploadingImage ? 'Subiendo...' : coa?.product_image_url ? 'Reemplazar Imagen' : 'Subir Imagen'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Purchase Links */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <LinkIcon className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Dónde Encontrar
                </h3>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={newLink.label}
                            onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                            placeholder="Etiqueta (ej: Amazon)"
                            className="border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                        <input
                            type="url"
                            value={newLink.url}
                            onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                            placeholder="URL completa"
                            className="border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <button
                        onClick={addPurchaseLink}
                        className="hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                        style={{ backgroundColor: theme.cardBg2 }}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Link
                    </button>

                    {purchaseLinks.length > 0 && (
                        <div className="space-y-2 mt-3">
                            {purchaseLinks.map((link, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg transition-colors duration-300" style={{ backgroundColor: theme.cardBg2 }}>
                                    <div>
                                        <span className="font-medium" style={{ color: theme.text }}>{link.label}</span>
                                        <span className="text-sm ml-2" style={{ color: theme.textMuted }}>{link.url}</span>
                                    </div>
                                    <button onClick={() => removePurchaseLink(i)} className="text-red-400 hover:text-red-300 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={savePurchaseLinks}
                                disabled={updatingLinks}
                                className="w-full hover:opacity-90 disabled:opacity-50 text-white py-2 rounded-lg text-sm flex items-center justify-center transition-all"
                                style={{ backgroundColor: theme.accent }}
                            >
                                {updatingLinks ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                Guardar Links
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Additional Documents */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <FileText className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Documentación Adicional
                </h3>

                {/* Show existing documents */}
                {coa?.additional_docs && coa.additional_docs.length > 0 && (
                    <div className="mb-4 space-y-2">
                        <p className="text-xs mb-2" style={{ color: theme.textMuted }}>Documentos actuales:</p>
                        {coa.additional_docs.map((doc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-lg border transition-colors duration-300" style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}>
                                <div className="flex items-center">
                                    <FileText className="w-4 h-4 mr-2" style={{ color: theme.accent }} />
                                    <div>
                                        <span className="text-sm font-medium" style={{ color: theme.text }}>{doc.type}</span>
                                        <span className="text-xs block" style={{ color: theme.textMuted }}>{doc.filename}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs hover:opacity-80 transition-opacity" style={{ color: theme.accent }}>
                                        Ver ↗
                                    </a>
                                    <button
                                        onClick={() => deleteDocument(idx, doc.type)}
                                        className="p-1 rounded hover:bg-red-500/20 transition-colors"
                                        title="Eliminar documento"
                                    >
                                        <X className="w-4 h-4 text-red-500" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="space-y-3">
                    <p className="text-xs" style={{ color: theme.textMuted }}>Agregar nuevo documento:</p>
                    <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value as any)}
                        className="border rounded-lg px-4 py-2 text-sm w-full transition-colors duration-300"
                        style={{
                            backgroundColor: theme.inputBg,
                            borderColor: theme.inputBorder,
                            color: theme.text
                        }}
                    >
                        <option value="Amparo">Amparo</option>
                        <option value="Autorización">Autorización Sanitaria</option>
                        <option value="Instructivo">Instructivo</option>
                        <option value="Otro">Otro</option>
                    </select>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:text-white hover:file:opacity-90 transition-all"
                        style={{ color: theme.textMuted }}
                    />
                    {docFile && (
                        <button
                            onClick={uploadDocument}
                            disabled={uploadingDoc}
                            className="hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-all"
                            style={{ backgroundColor: theme.accent }}
                        >
                            {uploadingDoc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            {uploadingDoc ? 'Subiendo...' : `Subir ${docType}`}
                        </button>
                    )}
                </div>
            </div>

            {/* Extended Metadata */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4" style={{ color: theme.text }}>Datos Técnicos Extendidos</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Cliente</label>
                        <input
                            type="text"
                            value={metadata.client_name}
                            onChange={(e) => setMetadata({ ...metadata, client_name: e.target.value })}
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Referencia Cliente</label>
                        <input
                            type="text"
                            value={metadata.client_reference}
                            onChange={(e) => setMetadata({ ...metadata, client_reference: e.target.value })}
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Fecha Recibido</label>
                        <input
                            type="date"
                            value={metadata.received_date}
                            onChange={(e) => setMetadata({ ...metadata, received_date: e.target.value })}
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Condición de Muestra</label>
                        <input
                            type="text"
                            value={metadata.sample_condition}
                            onChange={(e) => setMetadata({ ...metadata, sample_condition: e.target.value })}
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Temperatura Almacenamiento</label>
                        <input
                            type="text"
                            value={metadata.storage_temp}
                            onChange={(e) => setMetadata({ ...metadata, storage_temp: e.target.value })}
                            placeholder="ej: 25°C"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Tiempo Almacenamiento</label>
                        <input
                            type="text"
                            value={metadata.storage_time}
                            onChange={(e) => setMetadata({ ...metadata, storage_time: e.target.value })}
                            placeholder="ej: 30 días"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Tipo de Recipiente</label>
                        <input
                            type="text"
                            value={metadata.container_type}
                            onChange={(e) => setMetadata({ ...metadata, container_type: e.target.value })}
                            placeholder="ej: Frasco"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Batch</label>
                        <input
                            type="text"
                            value={metadata.batch_number}
                            onChange={(e) => setMetadata({ ...metadata, batch_number: e.target.value })}
                            placeholder="ej: 20"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>

                    {/* Sample Weight / Total Potency */}
                    <div className="col-span-2 border-t pt-4 mt-2 transition-colors duration-300" style={{ borderColor: theme.border }}>
                        <label className="text-sm block mb-2 font-medium" style={{ color: theme.text }}>Peso de Muestra / Potencia</label>
                        <p className="text-xs mb-3" style={{ color: theme.textMuted }}>
                            Indica el peso de la muestra analizada (ej: 5g para gomitas) o si es potencia total (destilados).
                        </p>

                        <div className="flex items-center gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={metadata.is_total_potency}
                                    onChange={(e) => setMetadata({
                                        ...metadata,
                                        is_total_potency: e.target.checked,
                                        sample_weight: e.target.checked ? '' : metadata.sample_weight
                                    })}
                                    className="w-4 h-4 rounded"
                                    style={{ accentColor: theme.accent }}
                                />
                                <span className="text-sm" style={{ color: theme.text }}>Es Potencia Total</span>
                            </label>
                        </div>

                        {!metadata.is_total_potency && (
                            <input
                                type="text"
                                value={metadata.sample_weight}
                                onChange={(e) => setMetadata({ ...metadata, sample_weight: e.target.value })}
                                placeholder="ej: 5g, 10ml, 1 unidad"
                                className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                                style={{
                                    backgroundColor: theme.inputBg,
                                    borderColor: theme.inputBorder,
                                    color: theme.text
                                }}
                            />
                        )}

                        {metadata.is_total_potency && (
                            <div className="p-3 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                <span className="text-sm" style={{ color: theme.accent }}>
                                    Los resultados representan la potencia total del producto, independiente del peso muestreado.
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Descriptions */}
                    <div className="col-span-2 border-t pt-4 mt-2 transition-colors duration-300" style={{ borderColor: theme.border }}>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Descripción Corta</label>
                        <input
                            type="text"
                            value={metadata.description_short}
                            onChange={(e) => setMetadata({ ...metadata, description_short: e.target.value })}
                            placeholder="Resumen breve del producto (ej: Extracto RSO de alta pureza)"
                            className="w-full border rounded-lg px-4 py-2 text-sm transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                            maxLength={150}
                        />
                        <span className="text-xs mt-1 block" style={{ color: theme.textMuted }}>{metadata.description_short.length}/150 caracteres</span>
                    </div>

                    <div className="col-span-2">
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Descripción Extendida</label>
                        <textarea
                            value={metadata.description_extended}
                            onChange={(e) => setMetadata({ ...metadata, description_extended: e.target.value })}
                            placeholder="Descripción detallada del producto, usos, beneficios, etc."
                            rows={4}
                            className="w-full border rounded-lg px-4 py-2 text-sm resize-none transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                        />
                    </div>
                </div>
                <button
                    onClick={saveMetadata}
                    disabled={updatingMetadata}
                    className="w-full mt-4 hover:opacity-90 disabled:opacity-50 text-white py-3 rounded-lg flex items-center justify-center transition-all"
                    style={{ backgroundColor: theme.accent }}
                >
                    {updatingMetadata ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                    Guardar Metadata
                </button>
            </div>

            {/* Badges Selector */}
            <div className="rounded-xl p-6 border transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <h3 className="font-semibold mb-4 flex items-center" style={{ color: theme.text }}>
                    <Award className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                    Insignias del Certificado
                </h3>

                {allBadges.length === 0 ? (
                    <div className="text-center py-8" style={{ color: theme.textMuted }}>
                        <Award className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No hay badges disponibles</p>
                        <a href="/badges" className="text-sm underline mt-2 inline-block hover:opacity-80 transition-opacity" style={{ color: theme.accent }}>
                            Crear badges →
                        </a>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                            {allBadges.map((badge) => (
                                <label
                                    key={badge.id}
                                    className="cursor-pointer border-2 rounded-lg p-3 transition-all duration-300"
                                    style={{
                                        borderColor: selectedBadgeIds.includes(badge.id) ? theme.accent : theme.border,
                                        backgroundColor: selectedBadgeIds.includes(badge.id) ? theme.accent + '20' : 'transparent'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedBadgeIds.includes(badge.id)}
                                        onChange={() => toggleBadge(badge.id)}
                                        className="hidden"
                                    />
                                    <div className="flex items-center justify-center h-16 mb-2 rounded transition-colors duration-300" style={{ backgroundColor: theme.cardBg2 }}>
                                        <img src={badge.image_url} alt={badge.name} className="max-h-12 max-w-full object-contain" />
                                    </div>
                                    <p className="text-xs text-center font-medium" style={{ color: theme.text }}>{badge.name}</p>
                                </label>
                            ))}
                        </div>

                        <button
                            onClick={saveBadges}
                            disabled={updatingBadges}
                            className="w-full hover:opacity-90 disabled:opacity-50 text-white py-3 rounded-lg flex items-center justify-center transition-all"
                            style={{ backgroundColor: theme.accent }}
                        >
                            {updatingBadges ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                            Guardar Badges Seleccionados ({selectedBadgeIds.length})
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
