import { useState, useRef, useEffect } from 'react';
import { Camera, Download, Award, Phone, Mail, MapPin, Building2, Shield, Loader2, Upload } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { authFetch } from '../contexts/AuthContext';
import html2canvas from 'html2canvas';

interface VIPCredentialProps {
    credential: {
        memberId: string;
        memberName: string;
        memberEmail: string;
        memberPhone?: string;
        company?: string;
        memberSince: string;
        tier: 'Partner' | 'Gold' | 'Platinum' | 'Black' | 'Revision';
        status: 'active' | 'inactive' | 'suspended';
        photoUrl?: string;
        rfc?: string;
        fiscalAddress?: string;
        officePhone?: string;
    };
    onPhotoUpdate?: (newPhotoUrl: string) => void;
}

const tierColors: Record<string, { primary: string; secondary: string; gradient: string; text: string }> = {
    Partner: {
        primary: '#4F46E5',
        secondary: '#818CF8',
        gradient: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
        text: '#ffffff'
    },
    Gold: {
        primary: '#D4AF37',
        secondary: '#F5D77A',
        gradient: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #F5D77A 100%)',
        text: '#1a1a1a'
    },
    Platinum: {
        primary: '#A0A5AB',
        secondary: '#E5E4E2',
        gradient: 'linear-gradient(135deg, #6B7280 0%, #A0A5AB 50%, #E5E4E2 100%)',
        text: '#1a1a1a'
    },
    Black: {
        primary: '#1a1a1a',
        secondary: '#374151',
        gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #374151 100%)',
        text: '#ffffff'
    },
    Revision: {
        primary: '#CA8A04',
        secondary: '#FACC15',
        gradient: 'linear-gradient(135deg, #A16207 0%, #CA8A04 50%, #FACC15 100%)',
        text: '#ffffff'
    }
};

export default function VIPCredential({ credential, onPhotoUpdate }: VIPCredentialProps) {
    const { theme } = useTheme();
    const [isFlipped, setIsFlipped] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const frontCardRef = useRef<HTMLDivElement>(null);

    const tierConfig = tierColors[credential.tier] || tierColors.Partner;

    // Generate QR code URL on mount
    useEffect(() => {
        const verificationUrl = `${window.location.origin}/verify-member/${credential.memberId}`;
        // Using QR Server API for QR code generation
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verificationUrl)}&color=${tierConfig.primary.replace('#', '')}`;
        setQrCodeUrl(qrUrl);
    }, [credential.memberId, tierConfig.primary]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

        setUploading(true);
        try {
            // Upload to Supabase storage via backend
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', 'credential_photo');

            console.log('[VIPCredential] Uploading photo to:', `/api/v1/upload/image`);

            // Use authFetch which handles token refresh automatically
            const res = await authFetch('/api/v1/upload/image', {
                method: 'POST',
                body: formData
            });

            console.log('[VIPCredential] Upload response status:', res.status);

            const data = await res.json();
            console.log('[VIPCredential] Upload response data:', data);

            if (!data.success) {
                alert(`Error al subir: ${data.error || 'Error desconocido'}`);
                return;
            }

            if (data.success && data.url) {
                console.log('[VIPCredential] Photo uploaded, updating credential with URL:', data.url);

                // Update credential photo in database
                const updateRes = await authFetch('/api/v1/clients/me/credential-photo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ photoUrl: data.url })
                });

                const updateData = await updateRes.json();
                console.log('[VIPCredential] Update credential response:', updateData);

                if (updateData.success && onPhotoUpdate) {
                    onPhotoUpdate(data.url);
                    alert('Foto actualizada correctamente');
                } else {
                    alert(`Error al actualizar credencial: ${updateData.error || 'Error desconocido'}`);
                }
            }
        } catch (error) {
            console.error('Error uploading photo:', error);
            alert(`Error al subir la foto: ${error instanceof Error ? error.message : 'Error de conexion'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async () => {
        if (!frontCardRef.current || downloading) return;

        setDownloading(true);
        try {
            // Temporarily remove 3D transforms for clean capture
            const cardContainer = cardRef.current;
            const frontCard = frontCardRef.current;

            if (cardContainer && frontCard) {
                // Save original styles
                const originalTransformStyle = cardContainer.style.transformStyle;
                const originalTransform = cardContainer.style.transform;
                const originalFrontPosition = frontCard.style.position;

                // Remove 3D transforms temporarily
                cardContainer.style.transformStyle = 'flat';
                cardContainer.style.transform = 'none';
                frontCard.style.position = 'relative';

                // Small delay to let styles apply
                await new Promise(resolve => setTimeout(resolve, 100));

                const canvas = await html2canvas(frontCard, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null,
                    logging: false,
                });

                // Restore original styles
                cardContainer.style.transformStyle = originalTransformStyle;
                cardContainer.style.transform = originalTransform;
                frontCard.style.position = originalFrontPosition;

                const link = document.createElement('a');
                link.download = `credencial-${credential.memberId}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            }
        } catch (error) {
            console.error('Error generating image:', error);
            alert('Error al generar la imagen. Intenta de nuevo.');
        } finally {
            setDownloading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-MX', {
            month: 'long',
            year: 'numeric'
        });
    };

    return (
        <div className="w-full max-w-md mx-auto perspective-1000">
            {/* Card Container */}
            <div
                ref={cardRef}
                className={`relative w-full aspect-[1.586/1] cursor-pointer transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                onClick={() => setIsFlipped(!isFlipped)}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Front of Card */}
                <div
                    ref={frontCardRef}
                    className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl backface-hidden"
                    style={{
                        background: tierConfig.gradient,
                        backfaceVisibility: 'hidden'
                    }}
                >
                    {/* Holographic Effect Overlay */}
                    <div
                        className="absolute inset-0 opacity-30 pointer-events-none"
                        style={{
                            background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
                            backgroundSize: '200% 200%',
                            animation: 'shimmer 3s ease-in-out infinite'
                        }}
                    />

                    {/* Content */}
                    <div className="relative h-full p-3 sm:p-5 flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-2 sm:mb-4">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <Award className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: tierConfig.text }} />
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold tracking-wider" style={{ color: tierConfig.text }}>
                                        CLUB EUM CARE
                                    </h3>
                                    <p className="text-[10px] sm:text-xs opacity-80" style={{ color: tierConfig.text }}>
                                        Socio {credential.tier}
                                    </p>
                                </div>
                            </div>
                            <div
                                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold"
                                style={{
                                    backgroundColor: credential.status === 'active' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                    color: credential.status === 'active' ? '#22c55e' : '#ef4444'
                                }}
                            >
                                {credential.status === 'active' ? 'ACTIVO' : 'INACTIVO'}
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 flex items-center gap-3 sm:gap-4">
                            {/* Photo */}
                            <div className="relative">
                                <div
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 flex items-center justify-center"
                                    style={{
                                        borderColor: `${tierConfig.text}40`,
                                        backgroundColor: `${tierConfig.text}10`
                                    }}
                                >
                                    {credential.photoUrl ? (
                                        <img
                                            src={credential.photoUrl}
                                            alt={credential.memberName}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <Camera className="w-8 h-8 opacity-50" style={{ color: tierConfig.text }} />
                                    )}
                                </div>
                                {/* Upload button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileInputRef.current?.click();
                                    }}
                                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                                    style={{
                                        backgroundColor: tierConfig.primary,
                                        color: tierConfig.text
                                    }}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Upload className="w-4 h-4" />
                                    )}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handlePhotoUpload}
                                />
                            </div>

                            {/* Member Info */}
                            <div className="flex-1 min-w-0">
                                <h2
                                    className="text-base sm:text-lg font-bold truncate"
                                    style={{ color: tierConfig.text }}
                                >
                                    {credential.memberName}
                                </h2>
                                {credential.company && (
                                    <p
                                        className="text-xs sm:text-sm truncate flex items-center gap-1 opacity-80"
                                        style={{ color: tierConfig.text }}
                                    >
                                        <Building2 className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{credential.company}</span>
                                    </p>
                                )}
                                <p
                                    className="text-[10px] sm:text-xs mt-1 opacity-70"
                                    style={{ color: tierConfig.text }}
                                >
                                    Miembro desde {formatDate(credential.memberSince)}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-end justify-between mt-auto pt-2 gap-2">
                            <div className="flex-1 min-w-0">
                                <p
                                    className="text-[10px] sm:text-xs opacity-60 uppercase tracking-wider"
                                    style={{ color: tierConfig.text }}
                                >
                                    ID de Miembro
                                </p>
                                <p
                                    className="text-xs sm:text-sm font-mono font-bold tracking-wider truncate"
                                    style={{ color: tierConfig.text }}
                                >
                                    {credential.memberId}
                                </p>
                            </div>
                            {qrCodeUrl && (
                                <div
                                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg p-0.5 sm:p-1 flex-shrink-0"
                                    style={{ backgroundColor: '#ffffff' }}
                                >
                                    <img src={qrCodeUrl} alt="QR Code" className="w-full h-full" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Decorative Pattern */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-1"
                        style={{
                            background: `linear-gradient(90deg, ${tierConfig.primary}, ${tierConfig.secondary}, ${tierConfig.primary})`
                        }}
                    />
                </div>

                {/* Back of Card */}
                <div
                    className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl backface-hidden rotate-y-180"
                    style={{
                        background: tierConfig.gradient,
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)'
                    }}
                >
                    <div className="h-full p-5 flex flex-col">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-4">
                            <Shield className="w-5 h-5" style={{ color: tierConfig.text }} />
                            <h3 className="text-sm font-bold" style={{ color: tierConfig.text }}>
                                Informacion del Socio
                            </h3>
                        </div>

                        {/* Contact Info */}
                        <div className="flex-1 space-y-3">
                            {credential.memberEmail && (
                                <div className="flex items-center gap-2">
                                    <Mail className="w-4 h-4 opacity-60" style={{ color: tierConfig.text }} />
                                    <span className="text-sm truncate" style={{ color: tierConfig.text }}>
                                        {credential.memberEmail}
                                    </span>
                                </div>
                            )}
                            {(credential.memberPhone || credential.officePhone) && (
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 opacity-60" style={{ color: tierConfig.text }} />
                                    <span className="text-sm" style={{ color: tierConfig.text }}>
                                        {credential.officePhone || credential.memberPhone}
                                    </span>
                                </div>
                            )}
                            {credential.fiscalAddress && (
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 opacity-60 mt-0.5 flex-shrink-0" style={{ color: tierConfig.text }} />
                                    <span className="text-sm line-clamp-2" style={{ color: tierConfig.text }}>
                                        {credential.fiscalAddress}
                                    </span>
                                </div>
                            )}
                            {credential.rfc && (
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4 opacity-60" style={{ color: tierConfig.text }} />
                                    <span className="text-sm font-mono" style={{ color: tierConfig.text }}>
                                        RFC: {credential.rfc}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="mt-4 pt-3 border-t" style={{ borderColor: `${tierConfig.text}20` }}>
                            <p className="text-xs text-center opacity-60" style={{ color: tierConfig.text }}>
                                Toca para voltear la credencial
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex justify-center gap-3">
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{
                        backgroundColor: theme.cardBg,
                        color: theme.text,
                        border: `1px solid ${theme.border}`
                    }}
                >
                    {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {downloading ? 'Descargando...' : 'Descargar'}
                </button>
            </div>

            {/* CSS for animations */}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .perspective-1000 {
                    perspective: 1000px;
                }
                .transform-style-3d {
                    transform-style: preserve-3d;
                }
                .backface-hidden {
                    backface-visibility: hidden;
                }
                .rotate-y-180 {
                    transform: rotateY(180deg);
                }
            `}</style>
        </div>
    );
}
