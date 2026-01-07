import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, FileText, ChevronLeft, Calendar, FlaskConical, Download, Award, ExternalLink, Edit3, Share2, X, Check, Copy, Heart, Loader2, Star, MessageSquare, Send, Camera, Image, User, Image as ImageIcon, Upload } from 'lucide-react';

import type { COA } from '../types/coa';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend } from 'recharts';
import QRCode from "react-qr-code";
import { toPng } from 'html-to-image';
import CVVGenerator from '../components/CVVGenerator';
import COAEnrichmentForm from '../components/COAEnrichmentForm';
import { useAuth, authFetch } from '../contexts/AuthContext';
import QuickRegisterModal from '../components/QuickRegisterModal';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';
import { telemetry } from '../services/telemetryService';
import ClientCOAEditor from '../components/ClientCOAEditor';
import ChromatogramSVG from '../components/ChromatogramSVG';
import { InAppBrowser } from '../components/InAppBrowser';
import { SmartAppBanner } from '../components/SmartAppBanner';

// Analytics tracking helper
const trackCOAAccess = async (token: string, accessType: string, linkSource?: string, cvvCode?: string) => {
    try {
        // Helper to ensure valid URL
        const getApiUrl = () => {
            const envUrl = import.meta.env.VITE_API_URL;
            if (envUrl && !envUrl.startsWith('http')) return `https://${envUrl}`;
            return envUrl || 'https://coa.extractoseum.com';
        };
        const API_URL = getApiUrl();

        // Get UTM params from URL
        const urlParams = new URLSearchParams(window.location.search);
        const utmParams = {
            utm_source: urlParams.get('utm_source'),
            utm_medium: urlParams.get('utm_medium'),
            utm_campaign: urlParams.get('utm_campaign'),
            utm_content: urlParams.get('utm_content'),
            utm_term: urlParams.get('utm_term')
        };

        await fetch(`${API_URL}/api/v1/analytics/track/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_type: accessType,
                link_source: linkSource,
                cvv_code: cvvCode,
                ...utmParams
            })
        });

        // --- Client Side Tracking (GA4 / Clarity / Trakpilot) ---
        if (typeof window !== 'undefined') {
            // GA4: view_item
            if (window.gtag) {
                window.gtag('event', 'view_item', {
                    item_list_id: 'coa_viewer',
                    item_list_name: 'COA Viewer',
                    items: [{
                        item_id: token,
                        item_name: 'COA View',
                        item_category: 'Certificate of Analysis'
                    }]
                });
            }

            // Trakpilot / Generic Custom Event
            if (window.Trakpilot) {
                window.Trakpilot.track('view_coa', { token });
            }

            // EUM Behavior Tracking (Identity Graph)
            telemetry.trackBehavior('view_product', {
                product_id: token,
                product_type: 'coa',
                access_type: accessType,
                link_source: linkSource,
                ...utmParams
            });
        }

    } catch (error) {
        console.error('[Analytics] Tracking error:', error);
    }
};

// Track PDF download
const trackPDFDownload = async (token: string, pdfType: string = 'branded') => {
    try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        await fetch(`${API_URL}/api/v1/analytics/track/${token}/pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf_type: pdfType })
        });

        // EUM Behavior Tracking
        telemetry.trackBehavior('download_pdf', {
            product_id: token,
            product_type: 'coa',
            pdf_type: pdfType
        });
    } catch (error) {
        console.error('[Analytics] PDF tracking error:', error);
    }
};

// Track link clicks
const trackLinkClick = async (token: string, linkType: string, linkUrl: string, linkLabel?: string) => {
    try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        await fetch(`${API_URL}/api/v1/analytics/track/${token}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link_type: linkType, link_url: linkUrl, link_label: linkLabel })
        });

        // --- Client Side Tracking (GA4 / Clarity / Retargeting) ---
        if (typeof window !== 'undefined') {
            // GA4 Event
            if (window.gtag) {
                const eventName = linkType === 'purchase' || linkType === 'shop' ? 'add_to_cart_intent' : 'select_content';
                window.gtag('event', eventName, {
                    content_type: linkType,
                    item_id: token,
                    destination: linkUrl
                });
            }

            // EUM Behavior Tracking
            const eventType = linkType === 'purchase' || linkType === 'shop' ? 'add_to_cart' : 'link_click';
            telemetry.trackBehavior(eventType, {
                product_id: token,
                product_type: 'coa',
                link_type: linkType,
                link_url: linkUrl,
                link_label: linkLabel
            });
        }
    } catch (error) {
        console.error('[Analytics] Link tracking error:', error);
    }
};

// Haptic feedback helper - vibrates on supported devices
const triggerHaptic = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

// Button click handler with haptic and scale animation
const handleButtonClick = (callback: () => void, e?: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    triggerHaptic(15); // Short vibration
    if (e?.currentTarget) {
        const target = e.currentTarget;
        target.style.transform = 'scale(0.95)';
        setTimeout(() => {
            target.style.transform = 'scale(1)';
        }, 100);
    }
    callback();
};

export default function COADetails() {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAuthenticated, isSuperAdmin, client } = useAuth();
    const [hasTracked, setHasTracked] = useState(false);

    // New state for In-App Browser
    const [browserUrl, setBrowserUrl] = useState<string | null>(null);
    const [browserTitle, setBrowserTitle] = useState('');

    const handleOpenBrowser = (url: string, title?: string) => {
        setBrowserUrl(url);
        setBrowserTitle(title || 'Navegador');
    };

    const [coa, setCoa] = useState<COA | null>(null);
    // Restricted access state
    const [restricted, setRestricted] = useState(false);
    const [restrictionType, setRestrictionType] = useState<'tag_restricted' | 'hidden' | null>(null);
    const [requiredTags, setRequiredTags] = useState<string[]>([]);
    const [restrictedData, setRestrictedData] = useState<any>(null);
    // ... (rest of state)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [adminMode, setAdminMode] = useState(false); // Toggle for admin panel
    const [clientEditMode, setClientEditMode] = useState(false); // Toggle for client edit panel
    const [showShareMenu, setShowShareMenu] = useState(false); // Toggle for share menu
    const [copied, setCopied] = useState(false); // Copy feedback
    const [chemist, setChemist] = useState<any>(null); // Chemist/signer data

    // Collection state
    const [isSaved, setIsSaved] = useState(false);
    const [savingToCollection, setSavingToCollection] = useState(false);
    const [showQuickRegister, setShowQuickRegister] = useState(false);
    const [checkingSaved, setCheckingSaved] = useState(false);

    // Reviews state
    const [reviews, setReviews] = useState<any[]>([]);
    const [reviewStats, setReviewStats] = useState<{ avg_rating: number | null; review_count: number } | null>(null);
    const [reviewsEnabled, setReviewsEnabled] = useState(false);
    const [userReview, setUserReview] = useState<any>(null);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewRating, setReviewRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [reviewPhoto, setReviewPhoto] = useState<string | null>(null);
    const [uploadingReviewPhoto, setUploadingReviewPhoto] = useState(false);
    const [submittingReview, setSubmittingReview] = useState(false);
    const [hoverRating, setHoverRating] = useState(0);
    const reviewPhotoInputRef = useRef<HTMLInputElement>(null);

    // Check if current user is the owner of this COA
    const isOwner = isAuthenticated && client && coa?.client_id === client.id;
    const { theme, themeMode } = useTheme();
    const qrRef = useRef<HTMLDivElement>(null);

    const loadCOA = () => {
        // Include auth token if available to check tag-based access
        const headers: Record<string, string> = {};
        const accessToken = localStorage.getItem('accessToken');
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        fetch(`/api/v1/coas/${token}`, { headers })
            .then(res => {
                if (!res.ok) throw new Error('COA not found');
                return res.json();
            })
            .then(data => {
                // Check if access is restricted
                if (data.restricted) {
                    setRestricted(true);
                    setRestrictionType(data.restriction_type);
                    setRequiredTags(data.required_tags || []);
                    setRestrictedData(data.data);
                    setCoa(null);
                } else {
                    setRestricted(false);
                    setRestrictionType(null);
                    setRequiredTags([]);
                    setRestrictedData(null);
                    setCoa(data.data);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('No se encontró el certificado o hubo un error.');
                setLoading(false);
            });
    };

    useEffect(() => {
        loadCOA();
    }, [token]);

    // Check if COA is saved in user's collection
    useEffect(() => {
        const checkSavedStatus = async () => {
            if (!token) return;
            setCheckingSaved(true);
            try {
                const res = await fetch(`/api/v1/collection/check/${token}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`
                    }
                });
                const data = await res.json();
                if (data.success) {
                    setIsSaved(data.isSaved);
                }
            } catch (error) {
                console.error('Error checking saved status:', error);
            } finally {
                setCheckingSaved(false);
            }
        };

        checkSavedStatus();
    }, [token, isAuthenticated]);

    // Handle save/remove from collection
    const handleSaveToggle = async () => {
        if (!isAuthenticated) {
            setShowQuickRegister(true);
            return;
        }

        setSavingToCollection(true);
        try {
            if (isSaved) {
                // Remove from collection
                const res = await authFetch(`/api/v1/collection/remove/${token}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (data.success) {
                    setIsSaved(false);
                }
            } else {
                // Save to collection
                const res = await authFetch(`/api/v1/collection/save/${token}`, {
                    method: 'POST'
                });
                const data = await res.json();
                if (data.success) {
                    setIsSaved(true);
                }
            }
        } catch (error) {
            console.error('Error toggling save:', error);
        } finally {
            setSavingToCollection(false);
        }
    };

    // After quick register, save the COA
    const handleQuickRegisterSuccess = async () => {
        setShowQuickRegister(false);
        // Now that user is logged in, save the COA
        handleSaveToggle();
    };

    // Fetch reviews for this COA
    const fetchReviews = async () => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/reviews/${token}`);
            const data = await res.json();
            if (data.success) {
                setReviews(data.reviews || []);
                setReviewStats(data.stats);
                setReviewsEnabled(data.reviewsEnabled);
            }
        } catch (error) {
            console.error('Error fetching reviews:', error);
        }
    };

    // Check if user has already reviewed
    const checkUserReview = async () => {
        if (!token) return;
        try {
            const res = await fetch(`/api/v1/reviews/${token}/my-review`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setUserReview(data.review);
            }
        } catch (error) {
            console.error('Error checking user review:', error);
        }
    };

    // Handle review photo upload
    const handleReviewPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona una imagen');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('La imagen debe ser menor a 5MB');
            return;
        }

        setUploadingReviewPhoto(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'review_photo');

            const res = await authFetch('/api/v1/upload/image', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success && data.url) {
                setReviewPhoto(data.url);
            } else {
                alert(`Error al subir: ${data.error || 'Error desconocido'}`);
            }
        } catch (error) {
            console.error('Error uploading review photo:', error);
            alert('Error al subir la foto');
        } finally {
            setUploadingReviewPhoto(false);
        }
    };

    // Submit a review
    const handleSubmitReview = async () => {
        if (!isAuthenticated) {
            setShowQuickRegister(true);
            return;
        }

        if (reviewRating === 0) return;

        setSubmittingReview(true);
        try {
            const res = await authFetch(`/api/v1/reviews/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: reviewRating,
                    review_text: reviewText,
                    photo_url: reviewPhoto
                })
            });
            const data = await res.json();
            if (data.success) {
                setUserReview(data.review);
                setShowReviewForm(false);
                setReviewRating(0);
                setReviewText('');
                setReviewPhoto(null);
                fetchReviews(); // Reload reviews
            } else {
                alert(data.error || 'Error al enviar resena');
            }
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Error al enviar resena');
        } finally {
            setSubmittingReview(false);
        }
    };

    // Load reviews when COA loads
    useEffect(() => {
        if (coa) {
            fetchReviews();
            checkUserReview();
        }
    }, [coa, isAuthenticated]);

    // Track COA access on load
    useEffect(() => {
        if (token && !hasTracked) {
            // Determine access type from URL params
            const src = searchParams.get('src');
            const cvv = searchParams.get('cvv');

            let accessType = 'direct_link';
            let linkSource: string | undefined;

            if (cvv) {
                // Came from CVV verification
                accessType = 'cvv_verification';
            } else if (src) {
                // Came from PDF link
                if (src.startsWith('pdf_')) {
                    accessType = 'pdf_link';
                    linkSource = src.replace('pdf_', ''); // 'pdf_token' -> 'token'
                } else if (src === 'qr') {
                    accessType = 'qr_global';
                }
            }

            trackCOAAccess(token, accessType, linkSource, cvv || undefined);
            setHasTracked(true);
        }
    }, [token, hasTracked, searchParams]);

    // Fetch chemist/signer data
    useEffect(() => {
        const fetchChemist = async () => {
            try {
                // 1. Check for extracted technicians in metadata (KCA Labs Override)
                // Prefer 'Generated By' or 'Quality Manager'
                if (coa?.metadata?.technicians && Array.isArray(coa.metadata.technicians) && coa.metadata.technicians.length > 0) {
                    const techs = coa.metadata.technicians;
                    // Find a suitable signer (Generated By usually has the license/title involved in QA)
                    const primary = techs.find((t: any) => t.signature_type === 'Generated By') || techs[0];

                    if (primary) {
                        setChemist({
                            name: primary.name,
                            title: primary.role,
                            license_number: 'Verificado en COA', // PDF contains verification
                            signature_url: null, // We don't have extracted signature images yet
                            credentials: primary.signature_type
                        });
                        return;
                    }
                }

                // 2. First try to get specific chemist if COA has one assigned
                if (coa?.chemist_id) {
                    const res = await fetch(`/api/v1/chemists/${coa.chemist_id}`);
                    const data = await res.json();
                    if (data.success && data.chemist) {
                        setChemist(data.chemist);
                        return;
                    }
                }
                // 3. Otherwise get default chemist
                const res = await fetch('/api/v1/chemists/default');
                const data = await res.json();
                if (data.success && data.chemist) {
                    setChemist(data.chemist);
                }
            } catch (err) {
                console.error('Error fetching chemist:', err);
            }
        };

        if (coa) {
            fetchChemist();
        }
    }, [coa]);

    const downloadQR = async () => {
        if (qrRef.current) {
            try {
                const dataUrl = await toPng(qrRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `EUM-QR-${token}.png`;
                link.href = dataUrl;
                link.click();
            } catch (err) {
                console.error("Failed to download QR", err);
            }
        }
    };

    // Generate shareable URL with UTM tracking
    const getShareUrl = (source: string) => {
        const baseUrl = `https://coa.extractoseum.com/coa/${token}`;
        const params = new URLSearchParams({
            utm_source: source,
            utm_medium: 'share',
            utm_campaign: 'coa_share'
        });
        return `${baseUrl}?${params.toString()}`;
    };

    // Copy link to clipboard
    const copyShareLink = async () => {
        const url = getShareUrl('copy_link');
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            // Track share action
            if (token) {
                trackLinkClick(token, 'share', url, 'copy_link');
            }
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    // Share to different platforms
    const shareToWhatsApp = () => {
        const url = getShareUrl('whatsapp');
        const text = `Mira este Certificado de Analisis: ${coa?.custom_name || coa?.product_sku || 'COA'}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
        if (token) trackLinkClick(token, 'share', url, 'whatsapp');
    };

    const shareToFacebook = () => {
        const url = getShareUrl('facebook');
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
        if (token) trackLinkClick(token, 'share', url, 'facebook');
    };

    const shareToTwitter = () => {
        const url = getShareUrl('twitter');
        const text = `Certificado de Analisis verificado: ${coa?.custom_name || coa?.product_sku || 'COA'}`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        if (token) trackLinkClick(token, 'share', url, 'twitter');
    };

    const shareToTelegram = () => {
        const url = getShareUrl('telegram');
        const text = `Certificado de Analisis: ${coa?.custom_name || coa?.product_sku || 'COA'}`;
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
        if (token) trackLinkClick(token, 'share', url, 'telegram');
    };

    const handleDownloadPDF = async () => {
        try {
            const API_URL = import.meta.env.VITE_API_URL || '';
            const pdfUrl = `${API_URL}/api/v1/coas/${token}/pdf`;

            // Track the PDF download
            if (token) {
                trackPDFDownload(token, 'branded');
            }

            // Check if we are in a WebView/Mobile environment where direct download might fail
            const isWebView = /wv|android|iphone|ipad|ipod/i.test(navigator.userAgent);

            if (isWebView) {
                // Open in system browser or new tab
                window.open(pdfUrl, '_system');
            } else {
                // Standard browser: reliable download trigger
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.setAttribute('download', `COA_${token}.pdf`);
                link.setAttribute('target', '_blank');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Error al descargar el PDF. Por favor intenta de nuevo.');
        }
    };

    if (loading) return (
        <Layout>
            <div className="min-h-screen flex items-center justify-center" style={{ color: theme.accent }}>
                <div className="animate-pulse flex flex-col items-center">
                    <FlaskConical className="w-10 h-10 mb-2" />
                    <span className="text-sm font-medium">Cargando Análisis...</span>
                </div>
            </div>
        </Layout>
    );

    // Show restricted access page (similar to CVV verification page)
    if (restricted && restrictedData) {
        return (
            <Layout>
                <Screen id="COARestricted"><></></Screen>
                <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
                    <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-700">
                        {/* Header with gradient */}
                        <div className="bg-gradient-to-r from-amber-600 to-orange-500 p-6 text-center">
                            <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                                <ShieldCheck className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-xl font-bold tracking-wide">Producto Verificado</h1>
                            <p className="text-amber-100 text-sm mt-1">Certificado de Análisis</p>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Product Image & Name */}
                            <div className="flex items-center gap-4">
                                {restrictedData.product_image_url ? (
                                    <img
                                        src={restrictedData.product_image_url}
                                        alt={restrictedData.custom_name || 'Producto'}
                                        className="w-20 h-20 rounded-lg object-cover border border-gray-600"
                                    />
                                ) : (
                                    <div className="w-20 h-20 rounded-lg bg-gray-700 flex items-center justify-center border border-gray-600">
                                        <FlaskConical className="w-8 h-8 text-gray-500" />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-white">
                                        {restrictedData.custom_name || 'Producto Analizado'}
                                    </h2>
                                    {restrictedData.batch_id && (
                                        <p className="text-sm text-gray-400 mt-1">
                                            Lote: {restrictedData.batch_id}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Compliance Status Badge */}
                            {restrictedData.compliance_status && (
                                <div className={`px-4 py-2 rounded-lg text-center font-medium ${
                                    restrictedData.compliance_status === 'pass'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : restrictedData.compliance_status === 'fail'
                                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                }`}>
                                    {restrictedData.compliance_status === 'pass' ? '✓ Producto Certificado' :
                                        restrictedData.compliance_status === 'fail' ? '✗ No Cumple' : '⏳ Pendiente'}
                                </div>
                            )}

                            {/* Divider */}
                            <div className="border-t border-gray-700 pt-4">
                                <div className="flex items-center gap-2 text-gray-300 mb-4">
                                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                                    <span className="font-medium">Documento Restringido</span>
                                </div>
                                <p className="text-sm text-gray-400 mb-4">
                                    {restrictionType === 'tag_restricted'
                                        ? 'Este certificado de análisis está disponible únicamente para un segmento exclusivo de clientes.'
                                        : 'Este certificado de análisis no está disponible públicamente.'
                                    }
                                </p>
                            </div>

                            {/* Login CTA if not authenticated */}
                            {!isAuthenticated && (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-400">
                                        Si eres parte de este segmento, inicia sesión para verificar tu acceso.
                                    </p>
                                    <Link
                                        to="/login"
                                        className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        Iniciar Sesión
                                    </Link>
                                </div>
                            )}

                            {/* Already authenticated but no access */}
                            {isAuthenticated && (
                                <div className="space-y-4">
                                    <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                                        <p className="text-sm text-gray-300">
                                            Tu cuenta no tiene acceso a este documento.
                                        </p>
                                        <p className="text-xs text-gray-500 mt-2">
                                            Si crees que esto es un error, contacta a soporte.
                                        </p>
                                    </div>
                                    <a
                                        href="https://wa.me/525583670741?text=Hola,%20necesito%20ayuda%20con%20acceso%20a%20un%20COA%20restringido"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        Contactar Soporte
                                    </a>
                                </div>
                            )}

                            {/* Info footer */}
                            <p className="text-xs text-gray-500 text-center">
                                El acceso a este documento está restringido por el propietario del producto.
                            </p>
                        </div>
                    </div>
                </div>
            </Layout>
        );
    }

    if (error || !coa) return (
        <Layout>
            <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ color: theme.text }}>
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold mb-2">Error</h2>
                <p className="mb-6" style={{ color: theme.textMuted }}>{error}</p>
                <Link to="/" className="flex items-center" style={{ color: theme.accent }}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Volver al inicio
                </Link>
            </div>
        </Layout>
    );

    // Format analysis date
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Fecha Pendiente';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (e) {
            return dateString; // Return as-is if parsing fails
        }
    };

    // Helper function to check if a cannabinoid is a THC variant
    // All Delta cannabinoids (Δ8, Δ9, Δ10, etc.) and THC variants are considered THC
    const isTHCVariant = (analyte: string): boolean => {
        if (!analyte) return false;
        const upperAnalyte = analyte.toUpperCase();
        // Match: Delta/Δ followed by any number, THC variants, and exclude totals
        return (
            /^Δ\d/.test(analyte) ||                    // Δ8-THC, Δ9-THC, Δ10-THC, etc.
            /^DELTA\s*\d/i.test(analyte) ||            // Delta 8, Delta 9, Delta 10, etc.
            upperAnalyte.includes('THC') ||            // THCA, THCV, THCP, THCB, etc.
            /^D\d+-THC/i.test(analyte)                 // D8-THC, D9-THC format
        ) && !upperAnalyte.startsWith('TOTAL');        // Exclude "Total THC" to avoid double counting
    };

    // Get factor for THC acids (THCA needs 0.877 conversion factor)
    const getTHCFactor = (analyte: string): number => {
        if (!analyte) return 1.0;
        const upperAnalyte = analyte.toUpperCase();
        // THCA, Δ9-THCA, Δ8-THCA, etc. need the decarboxylation factor
        if (upperAnalyte.includes('THCA')) {
            return 0.877;
        }
        return 1.0;
    };

    // Calculations
    const totalCannabinoids = coa.cannabinoids.reduce((acc, c) => acc + parseFloat(c.result_pct), 0).toFixed(2);
    const hasAreaButNoPct = parseFloat(totalCannabinoids) === 0 && coa.cannabinoids.some(c => (c as any).area_pct !== undefined);

    // Calculate total purely for display in the cards if it's area-based
    const totalAreaPct = hasAreaButNoPct
        ? coa.cannabinoids.reduce((acc, c) => acc + parseFloat((c as any).area_pct || '0'), 0).toFixed(2)
        : totalCannabinoids;

    // Calculate Total THC by summing all THC variants (Delta 8, Delta 9, Delta 10, THCA, THCV, etc.)
    const totalTHC = coa.cannabinoids.reduce((acc, c) => {
        if (isTHCVariant(c.analyte)) {
            const value = parseFloat(c.result_pct) || 0;
            const factor = getTHCFactor(c.analyte);
            return acc + (value * factor);
        }
        return acc;
    }, 0).toFixed(2);

    const totalTHCAreaBasis = hasAreaButNoPct
        ? coa.cannabinoids.reduce((acc, c) => {
            if (isTHCVariant(c.analyte)) {
                return acc + parseFloat((c as any).area_pct || '0');
            }
            return acc;
        }, 0).toFixed(2)
        : totalTHC;

    // Mexico THC compliance: must be <= 1%
    const isTHCCompliant = parseFloat(totalTHC) <= 1.0;

    // Find highest non-THC cannabinoid (excluding all THC variants)
    const nonTHCCannabinoids = coa.cannabinoids.filter(c => !isTHCVariant(c.analyte));
    const highestCannabinoid = nonTHCCannabinoids.length > 0
        ? nonTHCCannabinoids.reduce((max, c) => {
            const val = hasAreaButNoPct ? parseFloat((c as any).area_pct || '0') : parseFloat(c.result_pct);
            const maxVal = hasAreaButNoPct ? parseFloat((max as any).area_pct || '0') : parseFloat(max.result_pct);
            return val > maxVal ? c : max;
        })
        : null;

    // Chart Data (Top 5 + Others) - Filter out "Total" rows to avoid skewing chart
    let filteredCannabinoids = coa.cannabinoids.filter(c => c.analyte && !c.analyte.toUpperCase().startsWith('TOTAL'));

    // Fallback: If filtering removed everything (e.g. only "Total" exists), use original data
    if (filteredCannabinoids.length === 0) {
        filteredCannabinoids = [...coa.cannabinoids];
    }

    const sortedCannabinoids = filteredCannabinoids.sort((a, b) => {
        const valA = hasAreaButNoPct ? parseFloat((a as any).area_pct || '0') : parseFloat(a.result_pct);
        const valB = hasAreaButNoPct ? parseFloat((b as any).area_pct || '0') : parseFloat(b.result_pct);
        return valB - valA;
    });

    const chartData = sortedCannabinoids.slice(0, 5).map(c => ({
        name: c.analyte,
        value: hasAreaButNoPct ? parseFloat((c as any).area_pct || '0') : parseFloat(c.result_pct),
        color: undefined as string | undefined
    }));
    if (sortedCannabinoids.length > 5) {
        const others = sortedCannabinoids.slice(5).reduce((acc, c) => {
            return acc + (hasAreaButNoPct ? parseFloat((c as any).area_pct || '0') : parseFloat(c.result_pct));
        }, 0);
        chartData.push({ name: 'Otros', value: others, color: undefined });
    }

    // GAUGE LOGIC: If we only have 1 data point (likely "Total"), add a remainder slice to create a gauge look
    if (chartData.length === 1 && chartData[0].value < 100) {
        // Renaming logic: If we fell back to "Total" because individual data was missing, 
        // try to rename "Total Cannabinoids" to the specific cannabinoid (e.g. "CBD") if inferred.
        if (filteredCannabinoids.length === coa.cannabinoids.length && highestCannabinoid) {
            const principalName = highestCannabinoid.analyte === 'TOTAL CANNABINOIDS' ? 'CBD' : highestCannabinoid.analyte;
            if (chartData[0].name.toUpperCase().startsWith('TOTAL')) {
                chartData[0].name = principalName;
            }
        }

        chartData.push({
            name: 'remainder',
            value: 100 - chartData[0].value,
            color: '#33415520' // Low opacity slate for "empty" part
        });
    }

    const COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#94a3b8'];

    return (
        <Screen id="COADetails">
            <SmartAppBanner />
            <Layout>
                <div
                    className="min-h-screen font-sans print:bg-white print:text-black transition-colors duration-300"
                    style={{ color: theme.text }}
                >
                    <main className="max-w-4xl mx-auto p-4 pb-24 space-y-6 print:space-y-4">

                        {/* Header Card */}
                        <div
                            className="rounded-2xl p-6 border shadow-xl relative overflow-hidden print:border-none print:shadow-none print:p-0 transition-colors duration-300"
                            style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-30 print:hidden">
                                <ShieldCheck className="w-24 h-24" style={{ color: theme.accent + '30' }} />
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-center space-x-2 mb-2">
                                    <span
                                        className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide print:border print:border-black print:text-black print:bg-transparent"
                                        style={{
                                            backgroundColor: coa.compliance_status === 'pass' ? theme.accent + '30' : '#ef4444' + '30',
                                            color: coa.compliance_status === 'pass' ? theme.accent : '#ef4444'
                                        }}
                                    >
                                        {coa.compliance_status === 'pass' ? 'TESTED' : (coa.compliance_status || 'UNKNOWN').toUpperCase()}
                                    </span>
                                    {isTHCCompliant && (
                                        <span
                                            className="px-2 py-0.5 rounded text-xs border print:text-black print:border-black print:bg-transparent"
                                            style={{
                                                backgroundColor: theme.accent + '20',
                                                color: theme.accent,
                                                borderColor: theme.accent
                                            }}
                                        >
                                            THC Compliant (≤1%)
                                        </span>
                                    )}
                                    {!isTHCCompliant && (
                                        <span
                                            className="px-2 py-0.5 rounded text-xs border print:text-black print:border-black print:bg-transparent"
                                            style={{
                                                backgroundColor: '#ef4444' + '20',
                                                color: '#ef4444',
                                                borderColor: '#ef4444'
                                            }}
                                        >
                                            THC &gt;1% (No Compliant MX)
                                        </span>
                                    )}

                                    {/* Save to Collection Button */}
                                    <button
                                        onClick={(e) => handleButtonClick(handleSaveToggle, e)}
                                        disabled={savingToCollection || checkingSaved}
                                        className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all duration-200 print:hidden"
                                        style={{
                                            backgroundColor: isSaved ? '#ef4444' + '20' : theme.cardBg2,
                                            color: isSaved ? '#ef4444' : theme.textMuted,
                                            border: `1px solid ${isSaved ? '#ef4444' : theme.border}`
                                        }}
                                    >
                                        {savingToCollection ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Heart
                                                className="w-3.5 h-3.5"
                                                fill={isSaved ? '#ef4444' : 'none'}
                                            />
                                        )}
                                        <span>{isSaved ? 'Guardado' : 'Guardar'}</span>
                                    </button>
                                </div>

                                <h1 className="text-3xl font-bold mb-2 print:text-black" style={{ color: theme.text }}>
                                    {coa.custom_name || coa.product_sku || coa.batch_id || 'Certificado de Análisis'}
                                </h1>
                                <p className="text-sm flex items-center mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                    {formatDate(coa.analysis_date)} • {coa.lab_name}
                                </p>
                                <p className="text-xs mb-6 print:text-gray-500" style={{ color: theme.textMuted }}>
                                    COA: {coa.coa_number || `EUM_${String(coa.id).slice(0, 8).toUpperCase()}_COA`} • Token: {token}
                                </p>

                                {/* Product Image or Placeholder */}
                                <div className="mb-6 flex justify-center">
                                    {coa.product_image_url ? (
                                        <img
                                            src={coa.product_image_url}
                                            alt={coa.product_sku || 'Producto'}
                                            className="h-48 w-auto object-contain rounded-lg shadow-sm"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center">
                                            <div className="h-32 w-32 rounded-lg border-2 border-dashed flex items-center justify-center mb-2" style={{ borderColor: theme.border }}>
                                                <ImageIcon className="w-10 h-10 opacity-30" style={{ color: theme.text }} />
                                            </div>
                                            {isAuthenticated && (isOwner || isSuperAdmin) && (
                                                <button
                                                    onClick={() => setAdminMode(true)}
                                                    className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 hover:opacity-80 transition-opacity"
                                                    style={{ backgroundColor: theme.accent + '20', color: theme.accent }}
                                                >
                                                    <Upload className="w-3 h-3" /> Subir Imagen
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div
                                        className="p-4 rounded-xl border print:border-gray-300 print:bg-gray-100 transition-colors duration-300"
                                        style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                    >
                                        <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Total {hasAreaButNoPct ? 'Pureza Area' : 'Cannabinoides'}</span>
                                        <span className="text-2xl font-bold print:text-black" style={{ color: theme.accent }}>{totalAreaPct}%</span>
                                    </div>
                                    <div
                                        className="p-4 rounded-xl border print:border-gray-300 print:bg-gray-100 transition-colors duration-300"
                                        style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                    >
                                        <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Total THC {hasAreaButNoPct ? '(Area)' : ''}</span>
                                        <span className="text-2xl font-bold print:text-black" style={{ color: theme.accent }}>{totalTHCAreaBasis}%</span>
                                    </div>
                                    {highestCannabinoid && (
                                        <div
                                            className="p-4 rounded-xl border print:border-gray-300 print:bg-gray-100 transition-colors duration-300"
                                            style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                        >
                                            <span className="text-xs block mb-1 print:text-gray-600 truncate" style={{ color: theme.textMuted }} title={highestCannabinoid.analyte}>
                                                {highestCannabinoid.analyte.length > 15 ? highestCannabinoid.analyte.substring(0, 15) + '...' : highestCannabinoid.analyte}
                                            </span>
                                            <span className="text-2xl font-bold print:text-black" style={{ color: theme.accent }}>{hasAreaButNoPct ? parseFloat((highestCannabinoid as any).area_pct || '0').toFixed(2) : highestCannabinoid.result_pct}%</span>
                                        </div>
                                    )}
                                    <div
                                        className="p-4 rounded-xl border print:border-gray-300 print:bg-gray-100 flex flex-col justify-center items-center cursor-pointer group transition-colors duration-300"
                                        style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                        onClick={downloadQR}
                                    >
                                        <div ref={qrRef} className="bg-white p-2 rounded mb-2">
                                            <QRCode
                                                value={(coa as any).qr_code_secure_url || `https://coa.extractoseum.com/coa/${token}`}
                                                size={48}
                                                viewBox={`0 0 256 256`}
                                            />
                                        </div>
                                        <span className="text-[10px] flex items-center print:hidden" style={{ color: theme.textMuted }}>
                                            <Download className="w-3 h-3 mr-1" /> Descargar QR
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Watermark Background (if exists) */}
                        {coa.watermark_url && (
                            <div className="fixed inset-0 flex items-center justify-center pointer-events-none print:absolute print:opacity-10 hidden print:block">
                                <img
                                    src={coa.watermark_url}
                                    alt="Watermark"
                                    className="max-w-md opacity-5 print:opacity-10"
                                />
                            </div>
                        )}

                        {/* Reviews Section */}
                        {reviewsEnabled && (
                            <div
                                className="rounded-2xl border p-6 print:hidden transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                                        <MessageSquare className="w-5 h-5" style={{ color: theme.accent }} />
                                        Resenas y Calificaciones
                                    </h3>
                                    {reviewStats && reviewStats.review_count > 0 && (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                        key={star}
                                                        className="w-4 h-4"
                                                        fill={star <= Math.round(reviewStats.avg_rating || 0) ? '#fbbf24' : 'none'}
                                                        stroke={star <= Math.round(reviewStats.avg_rating || 0) ? '#fbbf24' : theme.textMuted}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-sm font-medium" style={{ color: theme.text }}>
                                                {reviewStats.avg_rating?.toFixed(1) || '0'}
                                            </span>
                                            <span className="text-sm" style={{ color: theme.textMuted }}>
                                                ({reviewStats.review_count} {reviewStats.review_count === 1 ? 'resena' : 'resenas'})
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Write Review Button or User's Review */}
                                {!userReview && !showReviewForm && (
                                    <button
                                        onClick={() => isAuthenticated ? setShowReviewForm(true) : setShowQuickRegister(true)}
                                        className="w-full py-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-colors hover:border-solid"
                                        style={{
                                            borderColor: theme.border,
                                            color: theme.textMuted
                                        }}
                                    >
                                        <Star className="w-5 h-5" />
                                        <span>Escribe una resena</span>
                                    </button>
                                )}

                                {/* Review Form */}
                                {showReviewForm && !userReview && (
                                    <div
                                        className="p-4 rounded-xl mb-4"
                                        style={{ backgroundColor: theme.cardBg2 }}
                                    >
                                        <p className="text-sm mb-3" style={{ color: theme.textMuted }}>
                                            Tu calificacion
                                        </p>
                                        <div className="flex items-center gap-1 mb-4">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() => setReviewRating(star)}
                                                    onMouseEnter={() => setHoverRating(star)}
                                                    onMouseLeave={() => setHoverRating(0)}
                                                    className="p-1 transition-transform hover:scale-110"
                                                >
                                                    <Star
                                                        className="w-8 h-8"
                                                        fill={(hoverRating || reviewRating) >= star ? '#fbbf24' : 'none'}
                                                        stroke={(hoverRating || reviewRating) >= star ? '#fbbf24' : theme.textMuted}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                        <textarea
                                            value={reviewText}
                                            onChange={(e) => setReviewText(e.target.value)}
                                            placeholder="Comparte tu experiencia con este producto (opcional)"
                                            className="w-full p-3 rounded-lg border focus:outline-none focus:ring-2 resize-none"
                                            style={{
                                                backgroundColor: theme.cardBg,
                                                borderColor: theme.border,
                                                color: theme.text
                                            }}
                                            rows={3}
                                        />

                                        {/* Photo upload section */}
                                        <div className="mt-3">
                                            <input
                                                ref={reviewPhotoInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleReviewPhotoUpload}
                                            />
                                            {reviewPhoto ? (
                                                <div className="relative inline-block">
                                                    <img
                                                        src={reviewPhoto}
                                                        alt="Foto de reseña"
                                                        className="h-20 w-20 object-cover rounded-lg"
                                                    />
                                                    <button
                                                        onClick={() => setReviewPhoto(null)}
                                                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => reviewPhotoInputRef.current?.click()}
                                                    disabled={uploadingReviewPhoto}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed transition-colors hover:border-solid"
                                                    style={{
                                                        borderColor: theme.border,
                                                        color: theme.textMuted
                                                    }}
                                                >
                                                    {uploadingReviewPhoto ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Camera className="w-4 h-4" />
                                                    )}
                                                    <span className="text-sm">
                                                        {uploadingReviewPhoto ? 'Subiendo...' : 'Agregar foto (opcional)'}
                                                    </span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => {
                                                    setShowReviewForm(false);
                                                    setReviewRating(0);
                                                    setReviewText('');
                                                    setReviewPhoto(null);
                                                }}
                                                className="flex-1 py-2 rounded-lg transition-colors"
                                                style={{
                                                    backgroundColor: theme.cardBg,
                                                    color: theme.textMuted
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSubmitReview}
                                                disabled={reviewRating === 0 || submittingReview}
                                                className="flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                                style={{
                                                    backgroundColor: reviewRating > 0 ? theme.accent : theme.cardBg,
                                                    color: reviewRating > 0 ? '#ffffff' : theme.textMuted,
                                                    cursor: reviewRating > 0 && !submittingReview ? 'pointer' : 'not-allowed'
                                                }}
                                            >
                                                {submittingReview ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Send className="w-4 h-4" />
                                                        Enviar
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* User's existing review */}
                                {userReview && (
                                    <div
                                        className="p-4 rounded-xl mb-4 border"
                                        style={{
                                            backgroundColor: theme.cardBg2,
                                            borderColor: theme.accent + '40'
                                        }}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium" style={{ color: theme.accent }}>
                                                    Tu resena
                                                </span>
                                                {!userReview.is_approved && (
                                                    <span
                                                        className="text-xs px-2 py-0.5 rounded-full"
                                                        style={{
                                                            backgroundColor: '#eab308' + '20',
                                                            color: '#eab308'
                                                        }}
                                                    >
                                                        Pendiente de aprobacion
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                        key={star}
                                                        className="w-4 h-4"
                                                        fill={star <= userReview.rating ? '#fbbf24' : 'none'}
                                                        stroke={star <= userReview.rating ? '#fbbf24' : theme.textMuted}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        {userReview.review_text && (
                                            <p className="text-sm" style={{ color: theme.text }}>
                                                {userReview.review_text}
                                            </p>
                                        )}
                                        {userReview.photo_url && (
                                            <div className="mt-2">
                                                <img
                                                    src={userReview.photo_url}
                                                    alt="Tu foto"
                                                    className="h-24 w-24 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => window.open(userReview.photo_url, '_blank')}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Reviews List */}
                                {reviews.length > 0 && (
                                    <div className="space-y-3">
                                        {reviews.map((review) => (
                                            <div
                                                key={review.id}
                                                className="p-4 rounded-xl"
                                                style={{ backgroundColor: theme.cardBg2 }}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium" style={{ color: theme.text }}>
                                                        {review.author}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center">
                                                            {[1, 2, 3, 4, 5].map((star) => (
                                                                <Star
                                                                    key={star}
                                                                    className="w-3 h-3"
                                                                    fill={star <= review.rating ? '#fbbf24' : 'none'}
                                                                    stroke={star <= review.rating ? '#fbbf24' : theme.textMuted}
                                                                />
                                                            ))}
                                                        </div>
                                                        <span className="text-xs" style={{ color: theme.textMuted }}>
                                                            {new Date(review.created_at).toLocaleDateString('es-MX')}
                                                        </span>
                                                    </div>
                                                </div>
                                                {review.review_text && (
                                                    <p className="text-sm" style={{ color: theme.textMuted }}>
                                                        {review.review_text}
                                                    </p>
                                                )}
                                                {review.photo_url && (
                                                    <div className="mt-2">
                                                        <img
                                                            src={review.photo_url}
                                                            alt="Foto de reseña"
                                                            className="h-24 w-24 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => window.open(review.photo_url, '_blank')}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Empty state */}
                                {reviews.length === 0 && !showReviewForm && !userReview && (
                                    <p className="text-sm text-center mt-4" style={{ color: theme.textMuted }}>
                                        Se el primero en dejar una resena
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Product Description */}
                        {(coa.metadata?.description_short || coa.metadata?.description_extended) && (
                            <div
                                className="rounded-2xl border p-6 print:border-none print:shadow-none transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                {coa.metadata?.description_short && (
                                    <div className="mb-4">
                                        <h3 className="font-semibold mb-2 print:text-black" style={{ color: theme.accent }}>Descripción del Producto</h3>
                                        <p className="leading-relaxed print:text-black" style={{ color: theme.text }}>{coa.metadata.description_short}</p>
                                    </div>
                                )}
                                {coa.metadata?.description_extended && (
                                    <div>
                                        {coa.metadata?.description_short && <h4 className="font-medium mb-2 print:text-gray-700" style={{ color: theme.textMuted }}>Información Detallada</h4>}
                                        <p className="leading-relaxed whitespace-pre-line print:text-gray-800" style={{ color: theme.textMuted }}>{coa.metadata.description_extended}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Extended Information - 2 Column Layout */}
                        {(coa.product_image_url || coa.metadata?.client_name || coa.metadata?.received_date) && (
                            <div
                                className="rounded-2xl border p-6 print:border-none print:shadow-none transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <div className="grid md:grid-cols-2 gap-6">
                                    {/* Left Column: Technical Details */}
                                    <div className="space-y-4">
                                        <h3 className="font-semibold mb-4 print:text-black" style={{ color: theme.text }}>Información de la Muestra</h3>

                                        {(coa.metadata?.client_name || coa.metadata?.client_info?.name) && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Cliente</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.client_name || coa.metadata.client_info?.name}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.client_reference && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Referencia del Cliente</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.client_reference}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.received_date && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Fecha de Recepción</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>
                                                    {new Date(coa.metadata.received_date).toLocaleDateString('es-MX')}
                                                </span>
                                            </div>
                                        )}

                                        {coa.metadata?.sample_condition && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Condición de Muestra</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.sample_condition}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.storage_temp && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Temperatura de Almacenamiento</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.storage_temp}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.storage_time && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Tiempo de Almacenamiento</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.storage_time}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.container_type && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Tipo de Recipiente</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.container_type}</span>
                                            </div>
                                        )}

                                        {coa.metadata?.batch_number && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Batch</span>
                                                <span className="print:text-black" style={{ color: theme.text }}>{coa.metadata.batch_number}</span>
                                            </div>
                                        )}

                                        {/* Sample Weight, Unit Mass, or Total Potency */}
                                        {(coa.metadata?.sample_weight || coa.metadata?.unit_mass_g || coa.metadata?.is_total_potency) && (
                                            <div>
                                                <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>
                                                    {coa.metadata?.unit_mass_g ? 'Masa Unitaria / Peso' : 'Peso de Muestra'}
                                                </span>
                                                <span className="print:text-black font-medium" style={{ color: '#10b981' }}>
                                                    {coa.metadata?.is_total_potency
                                                        ? 'Potencia Total'
                                                        : (coa.metadata?.unit_mass_g ? `${coa.metadata.unit_mass_g} g` : coa.metadata?.sample_weight)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Product Image */}
                                    {coa.product_image_url && (
                                        <div className="flex items-center justify-center">
                                            <div className="relative">
                                                <img
                                                    src={coa.product_image_url}
                                                    alt="Product"
                                                    className="max-h-64 rounded-lg border-2 shadow-lg print:border-gray-400"
                                                    style={{ borderColor: theme.border }}
                                                />
                                                <span className="absolute -bottom-6 left-0 right-0 text-center text-xs print:text-gray-600" style={{ color: theme.textMuted }}>
                                                    Imagen del Producto
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-6 print:block">
                            {/* Chart */}
                            <div
                                className="rounded-2xl border p-6 flex flex-col items-center justify-center print:border-none print:shadow-none transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="text-sm font-medium mb-4 self-start" style={{ color: theme.textMuted }}>Perfil de Cannabinoides</h3>
                                <div className="w-full h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} stroke="none" />
                                                ))}
                                            </Pie>
                                            <ReTooltip
                                                contentStyle={{ backgroundColor: theme.cardBg2, border: 'none', borderRadius: '8px', color: theme.text }}
                                                itemStyle={{ color: theme.text }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Data Legend */}
                                <div className="mt-4 flex flex-col items-center gap-2">
                                    {chartData.filter(d => d.name !== 'remainder').map((d, index) => (
                                        <div key={index} className="flex items-center text-sm" style={{ color: theme.text }}>
                                            <div
                                                className="w-3 h-3 rounded-full mr-2"
                                                style={{ backgroundColor: d.color || COLORS[index % COLORS.length] }}
                                            />
                                            <span className="font-medium mr-1">{d.name}</span>
                                            <span className="opacity-70">{d.value.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                    {coa.metadata?.is_total_potency && (
                                        <div className="text-xs mt-2 opacity-60" style={{ color: theme.textMuted }}>
                                            *Resultados normalizados sobre potencia total
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cannabinoids Table */}
                            <div
                                className="rounded-2xl border overflow-hidden print:border print:border-gray-300 print:mt-4 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <div
                                    className="px-6 py-4 border-b flex justify-between items-center print:bg-gray-100 print:border-gray-300 transition-colors duration-300"
                                    style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}
                                >
                                    <h3 className="font-semibold flex items-center print:text-black" style={{ color: theme.text }}>
                                        <FlaskConical className="w-4 h-4 mr-2 print:text-black" style={{ color: theme.accent }} />
                                        Resultados Detallados
                                    </h3>
                                </div>

                                <div className="divide-y print:divide-gray-300" style={{ borderColor: theme.border }}>
                                    {coa.cannabinoids.map((c, idx) => (
                                        <div
                                            key={idx}
                                            className="flex justify-between items-center px-6 py-4 transition-colors print:hover:bg-transparent"
                                            style={{ borderColor: theme.border }}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium print:text-black" style={{ color: theme.text }}>{c.analyte}</span>
                                                {/* Show label for detected compounds OR for n.a. peaks with area data */}
                                                {(c.detected || ((c.area ?? 0) > 0 && parseFloat(c.result_pct) === 0)) && (
                                                    <span className="text-xs print:text-gray-600" style={{ color: !c.detected && (c.area ?? 0) > 0 ? '#eab308' : (parseFloat(c.result_pct) === 0 && (c.area ?? 0) > 0 ? '#eab308' : theme.accent + 'cc') }}>
                                                        {/* n.a. peaks: show Área, detected with 0%: show Área, detected with value: show Detectado */}
                                                        {(!c.detected && (c.area ?? 0) > 0) || (parseFloat(c.result_pct) === 0 && (c.area ?? 0) > 0)
                                                            ? `Área: ${c.area?.toFixed(3)}`
                                                            : 'Detectado'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-lg font-bold print:text-black" style={{ color: theme.text }}>
                                                    {parseFloat(c.result_pct) === 0 && (c as any).area_pct
                                                        ? `${(c as any).area_pct}%`
                                                        : `${c.result_pct}%`
                                                    }
                                                </span>
                                                {c.result_mg_g && parseFloat(c.result_pct) > 0 && (
                                                    <span className="block text-xs print:text-gray-600" style={{ color: theme.textMuted }}>
                                                        {c.result_mg_g} mg/g
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Chromatogram Section */}
                        {coa.cannabinoids?.some((c: any) => c.retention_time !== undefined && c.area !== undefined && c.area > 0) && (
                            <div
                                className="rounded-2xl border p-3 md:p-6 print:border print:border-gray-300 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-3 md:mb-4 flex items-center print:text-black" style={{ color: theme.text }}>
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: theme.accent }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    Cromatograma y Resultados
                                </h3>
                                <div className="rounded-lg overflow-hidden border -mx-1 md:mx-0" style={{ borderColor: theme.border }}>
                                    <ChromatogramSVG
                                        peaks={coa.cannabinoids.filter((c: any) => c.retention_time !== undefined && c.area !== undefined)}
                                        theme={theme}
                                        width={800}
                                        height={300}
                                    />
                                </div>

                                {/* Peaks Table - Integration Results */}
                                <div className="mt-4 md:mt-6">
                                    <h4 className="text-sm font-semibold mb-3 print:text-black" style={{ color: theme.text }}>
                                        Resultados de Integración
                                    </h4>
                                    <div className="overflow-x-auto -mx-3 md:mx-0">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr style={{ backgroundColor: theme.cardBg2 }}>
                                                    <th className="px-2 md:px-3 py-2 text-left font-medium print:text-black" style={{ color: theme.textMuted }}>#</th>
                                                    <th className="px-2 md:px-3 py-2 text-left font-medium print:text-black" style={{ color: theme.textMuted }}>Nombre del Pico</th>
                                                    <th className="px-2 md:px-3 py-2 text-right font-medium print:text-black" style={{ color: theme.textMuted }}>Ret. Time (min)</th>
                                                    <th className="px-2 md:px-3 py-2 text-right font-medium print:text-black" style={{ color: theme.textMuted }}>Área</th>
                                                    <th className="px-2 md:px-3 py-2 text-right font-medium print:text-black" style={{ color: theme.textMuted }}>Cantidad (ppm)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y" style={{ borderColor: theme.border }}>
                                                {coa.cannabinoids
                                                    .filter((c: any) => c.retention_time !== undefined && c.area !== undefined)
                                                    .sort((a: any, b: any) => (a.retention_time || 0) - (b.retention_time || 0))
                                                    .map((c: any, idx: number) => (
                                                        <tr key={idx} className="hover:opacity-80 transition-opacity">
                                                            <td className="px-2 md:px-3 py-2 print:text-black" style={{ color: theme.textMuted }}>{idx + 1}</td>
                                                            <td className="px-2 md:px-3 py-2 font-medium print:text-black" style={{ color: theme.text }}>{c.analyte}</td>
                                                            <td className="px-2 md:px-3 py-2 text-right font-mono print:text-black" style={{ color: theme.text }}>
                                                                {c.retention_time?.toFixed(3)}
                                                            </td>
                                                            <td className="px-2 md:px-3 py-2 text-right font-mono print:text-black" style={{ color: theme.text }}>
                                                                {c.area?.toFixed(3)}
                                                            </td>
                                                            <td className="px-2 md:px-3 py-2 text-right font-mono print:text-black" style={{ color: theme.accent }}>
                                                                {parseFloat(c.result_pct) === 0 && (c as any).area_pct
                                                                    ? <span className="text-yellow-500">{(c as any).area_pct}% <span className="text-xs opacity-70">(relativo)</span></span>
                                                                    : (parseFloat(c.result_pct) * 10000).toFixed(4)
                                                                }
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Injection Details */}
                                {coa.metadata?.injection_details && Object.keys(coa.metadata.injection_details).length > 0 && (
                                    <div className="mt-6 pt-6 border-t" style={{ borderColor: theme.border }}>
                                        <h4 className="text-sm font-semibold mb-4 print:text-black" style={{ color: theme.text }}>
                                            Detalles de Inyección
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {coa.metadata.injection_details.injection_name && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Injection Name</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.injection_name}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.vial_number && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Vial Number</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.vial_number}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.injection_type && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Injection Type</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.injection_type}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.instrument_method && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Instrument Method</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.instrument_method}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.processing_method && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Processing Method</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.processing_method}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.injection_datetime && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Injection Date/Time</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.injection_datetime}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.run_time && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Run Time (min)</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.run_time}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.injection_volume && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Injection Volume</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.injection_volume}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.channel && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Channel</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.channel}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.wavelength && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Wavelength</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.wavelength} nm</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.bandwidth && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Bandwidth</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.bandwidth}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.dilution_factor && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Dilution Factor</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.dilution_factor}</span>
                                                </div>
                                            )}
                                            {coa.metadata.injection_details.sample_weight && (
                                                <div>
                                                    <span className="text-xs block mb-1 print:text-gray-600" style={{ color: theme.textMuted }}>Sample Weight</span>
                                                    <span className="text-sm font-medium print:text-black" style={{ color: theme.text }}>{coa.metadata.injection_details.sample_weight}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <p className="text-xs mt-4 print:text-gray-600" style={{ color: theme.textMuted }}>
                                    Gráfico generado a partir de los datos de integración del análisis cromatográfico HPLC.
                                </p>
                            </div>
                        )}

                        {/* Purchase Links */}
                        {coa.purchase_links && coa.purchase_links.length > 0 && (
                            <div
                                className="rounded-2xl border p-6 print:border print:border-gray-300 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-4 print:text-black" style={{ color: theme.text }}>¿Dónde Encontrar?</h3>
                                <div className="flex flex-wrap gap-3">
                                    {coa.purchase_links.map((link, idx) => {
                                        // Ensure URL has protocol
                                        const url = link.url.match(/^https?:\/\//) ? link.url : `https://${link.url}`;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={(e) => {
                                                    if (token) trackLinkClick(token, 'purchase', url, link.label);
                                                    handleButtonClick(() => handleOpenBrowser(url, `Comprar: ${link.label}`), e);
                                                }}
                                                className="flex items-center px-4 py-2 rounded-lg transition-colors print:bg-white print:text-black print:border print:border-black"
                                                style={{
                                                    backgroundColor: theme.accent,
                                                    color: '#ffffff'
                                                }}
                                            >
                                                🛒 {link.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Client Info (Analizado Para) */}
                        {(coa.metadata?.client_info || coa.metadata?.client_name) && (
                            <div
                                className="rounded-2xl border p-6 print:border print:border-gray-300 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-4 flex items-center print:text-black" style={{ color: theme.text }}>
                                    <User className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                                    Analizado Para
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="font-bold text-lg print:text-black" style={{ color: theme.text }}>
                                            {coa.metadata.client_name || coa.metadata.client_info?.name}
                                        </p>
                                        {coa.metadata.client_info?.address && (
                                            <p className="text-sm mt-1 print:text-gray-600" style={{ color: theme.textMuted }}>
                                                {coa.metadata.client_info.address}
                                                {coa.metadata.client_info.city_state_zip && <br />}
                                                {coa.metadata.client_info.city_state_zip}
                                                {coa.metadata.client_info.country && <br />}
                                                {coa.metadata.client_info.country}
                                            </p>
                                        )}
                                    </div>
                                    {coa.metadata.client_info?.licenses && coa.metadata.client_info.licenses.length > 0 && (
                                        <div className="flex flex-col justify-center">
                                            {coa.metadata.client_info.licenses.map((lic: string, idx: number) => (
                                                <span key={idx} className="inline-flex items-center text-sm font-mono px-2 py-1 rounded bg-opacity-20 mb-1 w-fit print:border print:border-gray-300"
                                                    style={{ backgroundColor: theme.accent + '20', color: theme.accent }}>
                                                    {lic}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Additional Documents */}
                        {coa.additional_docs && coa.additional_docs.length > 0 && (
                            <div
                                className="rounded-2xl border p-6 print:border print:border-gray-300 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-4 print:text-black" style={{ color: theme.text }}>Documentación Adicional</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {coa.additional_docs.map((doc, idx) => (
                                        <a
                                            key={idx}
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => token && trackLinkClick(token, 'document', doc.url, doc.filename)}
                                            className="flex items-center justify-between p-3 rounded-lg border transition-colors print:bg-white print:text-black print:border-black"
                                            style={{
                                                backgroundColor: theme.cardBg2,
                                                borderColor: theme.border
                                            }}
                                        >
                                            <div className="flex items-center">
                                                <FileText className="w-5 h-5 mr-2 print:text-black" style={{ color: theme.accent }} />
                                                <div>
                                                    <span className="font-medium print:text-black" style={{ color: theme.text }}>{doc.type}</span>
                                                    <span className="text-xs block print:text-gray-600" style={{ color: theme.textMuted }}>{doc.filename}</span>
                                                </div>
                                            </div>
                                            <Download className="w-4 h-4 print:hidden" style={{ color: theme.textMuted }} />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Badges */}
                        {coa.badges && coa.badges.length > 0 && (
                            <div
                                className="rounded-2xl border p-6 print:border-none transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-4 text-center print:text-black" style={{ color: theme.text }}>Certificaciones</h3>
                                <div className="flex flex-wrap items-center justify-center gap-6">
                                    {coa.badges.map((badge, idx) => (
                                        <div key={idx} className="flex flex-col items-center">
                                            <img
                                                src={badge.image_url}
                                                alt={badge.name}
                                                className="max-h-16 object-contain"
                                                title={badge.description || badge.name}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Chemist / Responsible Technical Section */}
                        {(chemist || (coa.metadata?.technicians && coa.metadata.technicians.length > 0)) && (
                            <div
                                className="rounded-2xl border p-6 print:border print:border-gray-300 transition-colors duration-300"
                                style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
                            >
                                <h3 className="font-semibold mb-4 flex items-center print:text-black" style={{ color: theme.text }}>
                                    <Award className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                                    Responsable Técnico
                                </h3>

                                {/* KCA Labs / Multiple Technicians Logic */}
                                {coa.metadata?.technicians && coa.metadata.technicians.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {coa.metadata.technicians.map((tech: any, idx: number) => (
                                            <div key={idx} className="flex flex-col md:flex-row items-start gap-4 p-3 rounded-lg bg-opacity-5" style={{ backgroundColor: theme.accent + '05' }}>
                                                {/* No signature extraction for KCA yet, but loop allows for future expansion */}
                                                <div>
                                                    <span className="block font-bold text-lg print:text-black" style={{ color: theme.accent }}>
                                                        {tech.name}
                                                    </span>
                                                    <span className="block text-sm print:text-black" style={{ color: theme.text }}>
                                                        {tech.role} {tech.signature_type && `- ${tech.signature_type}`}
                                                    </span>
                                                    <span className="block text-xs mt-1 print:text-gray-600" style={{ color: theme.textMuted }}>
                                                        {tech.date && `Fecha: ${tech.date}`}
                                                        <span className="block opacity-70">Céd. Prof: Verificado en COA</span>
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* Default Single Chemist Logic */
                                    <div className="flex flex-col md:flex-row items-center gap-6">
                                        {/* Signature */}
                                        {chemist?.signature_url && (
                                            <div className="flex-shrink-0">
                                                <div
                                                    className="rounded-lg p-4 shadow-sm"
                                                    style={{ backgroundColor: theme.cardBg2 }}
                                                >
                                                    <img
                                                        src={chemist.signature_url}
                                                        alt="Firma"
                                                        className="max-h-20 object-contain"
                                                        style={{
                                                            filter: themeMode === 'tokyo'
                                                                ? 'invert(1) sepia(1) saturate(5) hue-rotate(85deg) brightness(1.2)' // Neon green
                                                                : themeMode === 'dark'
                                                                    ? 'invert(1) brightness(1)' // White
                                                                    : 'none' // Black (original)
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {/* Info */}
                                        <div className="text-center md:text-left">
                                            <p className="text-lg font-bold print:text-black" style={{ color: theme.accent }}>
                                                {chemist?.name || 'Georgina Ocampo'}
                                            </p>
                                            {(chemist?.title || chemist?.credentials) && (
                                                <p className="text-sm print:text-gray-600" style={{ color: theme.textMuted }}>
                                                    {[chemist.title, chemist.credentials].filter(Boolean).join(' - ')}
                                                </p>
                                            )}
                                            {chemist?.license_number && (
                                                <p className="text-xs mt-2 flex items-center justify-center md:justify-start gap-1 print:text-gray-500" style={{ color: theme.textMuted }}>
                                                    Céd. Prof: {chemist.license_number}
                                                    {chemist.license_url && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                if (token) trackLinkClick(token, 'license_verification', chemist.license_url, 'chemist_license');
                                                                handleOpenBrowser(chemist.license_url, 'Cédula Profesional');
                                                            }}
                                                            className="inline-flex items-center ml-1 hover:underline"
                                                            style={{ color: theme.accent }}
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            <span className="text-xs ml-1">verificar</span>
                                                        </button>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Admin Panel - CVV Generator (Super Admin only) */}
                        {adminMode && token && isSuperAdmin && (
                            <>
                                <CVVGenerator token={token} themeMode={themeMode} />
                                <COAEnrichmentForm coaToken={token} coa={coa} onComplete={loadCOA} themeMode={themeMode} />
                            </>
                        )}

                        {/* Client Edit Panel - Limited fields for COA owners */}
                        {clientEditMode && token && isOwner && (
                            <ClientCOAEditor
                                coaToken={token}
                                coa={coa}
                                onComplete={() => {
                                    loadCOA();
                                    setClientEditMode(false);
                                }}
                                themeMode={themeMode}
                            />
                        )}

                        {/* Footer Actions */}
                        <div className="space-y-4 print:hidden">
                            {/* Main action buttons row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-3">
                                    {(coa.metadata?.file_urls || (coa.pdf_url_original ? [coa.pdf_url_original] : [])).map((url, idx) => {
                                        // Fallback name logic
                                        let label = `PDF Original`;
                                        if (coa.metadata?.file_urls && coa.metadata.file_urls.length > 1) {
                                            label = coa.metadata?.original_filenames?.[idx] || `Parte ${idx + 1}`;
                                        }

                                        return (
                                            <a
                                                key={idx}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center py-4 rounded-xl transition-colors border font-medium"
                                                style={{
                                                    backgroundColor: theme.cardBg2,
                                                    color: theme.text,
                                                    borderColor: theme.border
                                                }}
                                            >
                                                <FileText className="w-5 h-5 mr-2" /> {label}
                                            </a>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={(e) => handleButtonClick(handleDownloadPDF, e)}
                                    className="flex items-center justify-center py-4 rounded-xl shadow-lg font-medium h-full min-h-[60px] transition-all duration-150 active:scale-95 hover:brightness-110"
                                    style={{
                                        backgroundColor: theme.accent,
                                        color: '#ffffff'
                                    }}
                                >
                                    <Download className="w-5 h-5 mr-2" /> Descargar Certificado PDF
                                </button>
                            </div>

                            {/* Share & Edit buttons - visible to admin/owner */}
                            {(isSuperAdmin || isOwner) && (
                                <div className="flex flex-wrap gap-3">
                                    {/* Share Button with Dropdown */}
                                    <div className="relative flex-1 md:flex-none">
                                        <button
                                            onClick={(e) => handleButtonClick(() => setShowShareMenu(!showShareMenu), e)}
                                            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-150 active:scale-95"
                                            style={{
                                                backgroundColor: showShareMenu ? theme.accent : theme.cardBg2,
                                                border: `1px solid ${showShareMenu ? theme.accent : theme.border}`,
                                                color: showShareMenu ? '#ffffff' : theme.text
                                            }}
                                        >
                                            <Share2 className="w-5 h-5" />
                                            <span>Compartir</span>
                                        </button>

                                        {/* Share Dropdown Menu */}
                                        {showShareMenu && (
                                            <div
                                                className="absolute bottom-full mb-2 left-0 rounded-xl shadow-xl p-3 min-w-[220px] z-50"
                                                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                                            >
                                                <p className="text-xs font-semibold mb-2 px-2" style={{ color: theme.textMuted }}>Compartir COA</p>
                                                <button
                                                    onClick={(e) => handleButtonClick(copyShareLink, e)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 active:scale-95"
                                                    style={{ color: theme.text }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    {copied ? <Check className="w-4 h-4" style={{ color: theme.accent }} /> : <Copy className="w-4 h-4" />}
                                                    <span>{copied ? 'Copiado!' : 'Copiar enlace'}</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleButtonClick(shareToWhatsApp, e)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 active:scale-95"
                                                    style={{ color: theme.text }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <span className="text-lg">📱</span>
                                                    <span>WhatsApp</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleButtonClick(shareToTelegram, e)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 active:scale-95"
                                                    style={{ color: theme.text }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <span className="text-lg">✈️</span>
                                                    <span>Telegram</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleButtonClick(shareToFacebook, e)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 active:scale-95"
                                                    style={{ color: theme.text }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <span className="text-lg">📘</span>
                                                    <span>Facebook</span>
                                                </button>
                                                <button
                                                    onClick={(e) => handleButtonClick(shareToTwitter, e)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 active:scale-95"
                                                    style={{ color: theme.text }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <span className="text-lg">🐦</span>
                                                    <span>Twitter/X</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Edit COA Button */}
                                    <button
                                        onClick={(e) => handleButtonClick(() => isSuperAdmin ? setAdminMode(!adminMode) : setClientEditMode(!clientEditMode), e)}
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-150 active:scale-95"
                                        style={{
                                            backgroundColor: (adminMode || clientEditMode) ? theme.accent : theme.cardBg2,
                                            border: `1px solid ${(adminMode || clientEditMode) ? theme.accent : theme.border}`,
                                            color: (adminMode || clientEditMode) ? '#ffffff' : theme.text
                                        }}
                                    >
                                        <Edit3 className="w-5 h-5" />
                                        <span>{(adminMode || clientEditMode) ? 'Cerrar Editor' : 'Editar COA'}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                    </main>

                    {/* Floating Action Buttons - Edit & Share */}
                    {(isSuperAdmin || isOwner) && (
                        <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 flex flex-col gap-3 z-40 print:hidden">
                            {/* Share Button with Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowShareMenu(!showShareMenu)}
                                    className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                        color: theme.text
                                    }}
                                    title="Compartir"
                                >
                                    {showShareMenu ? <X className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                                </button>

                                {/* Share Menu */}
                                {showShareMenu && (
                                    <div
                                        className="absolute bottom-14 right-0 rounded-xl shadow-xl p-3 min-w-[200px]"
                                        style={{
                                            backgroundColor: theme.cardBg,
                                            border: `1px solid ${theme.border}`
                                        }}
                                    >
                                        <p className="text-xs font-semibold mb-2 px-2" style={{ color: theme.textMuted }}>Compartir</p>
                                        <button
                                            onClick={copyShareLink}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                                            style={{ color: theme.text }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            {copied ? <Check className="w-4 h-4" style={{ color: theme.accent }} /> : <Copy className="w-4 h-4" />}
                                            <span className="text-sm">{copied ? 'Copiado!' : 'Copiar enlace'}</span>
                                        </button>
                                        <button
                                            onClick={shareToWhatsApp}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                                            style={{ color: theme.text }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <span className="text-lg">📱</span>
                                            <span className="text-sm">WhatsApp</span>
                                        </button>
                                        <button
                                            onClick={shareToTelegram}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                                            style={{ color: theme.text }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <span className="text-lg">✈️</span>
                                            <span className="text-sm">Telegram</span>
                                        </button>
                                        <button
                                            onClick={shareToFacebook}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                                            style={{ color: theme.text }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <span className="text-lg">📘</span>
                                            <span className="text-sm">Facebook</span>
                                        </button>
                                        <button
                                            onClick={shareToTwitter}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                                            style={{ color: theme.text }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <span className="text-lg">🐦</span>
                                            <span className="text-sm">Twitter/X</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Edit Button - Different for admin vs owner */}
                            {isSuperAdmin ? (
                                <button
                                    onClick={() => setAdminMode(!adminMode)}
                                    className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all"
                                    style={{
                                        backgroundColor: adminMode ? theme.accent : theme.cardBg,
                                        border: `1px solid ${adminMode ? theme.accent : theme.border}`,
                                        color: adminMode ? '#ffffff' : theme.text
                                    }}
                                    title="Panel de Administrador"
                                >
                                    <Edit3 className="w-5 h-5" />
                                </button>
                            ) : isOwner ? (
                                <button
                                    onClick={() => setClientEditMode(!clientEditMode)}
                                    className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all"
                                    style={{
                                        backgroundColor: clientEditMode ? theme.accent : theme.cardBg,
                                        border: `1px solid ${clientEditMode ? theme.accent : theme.border}`,
                                        color: clientEditMode ? '#ffffff' : theme.text
                                    }}
                                    title="Editar COA"
                                >
                                    <Edit3 className="w-5 h-5" />
                                </button>
                            ) : null}
                        </div>
                    )}

                    {/* Quick Register Modal */}
                    {showQuickRegister && (
                        <QuickRegisterModal
                            onClose={() => setShowQuickRegister(false)}
                            onSuccess={handleQuickRegisterSuccess}
                            title="Guarda este COA"
                            subtitle="Registrate para guardar en tu coleccion"
                        />
                    )}
                    {/* In-App Browser Component */}
                    <InAppBrowser
                        isOpen={!!browserUrl}
                        url={browserUrl || ''}
                        title={browserTitle}
                        onClose={() => setBrowserUrl(null)}
                    />
                </div>
            </Layout>
        </Screen>
    );
}
