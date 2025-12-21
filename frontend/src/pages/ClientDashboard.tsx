import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, LogOut, User, ExternalLink, ShoppingCart, Folder, Award, Package, Heart } from 'lucide-react';
import { useAuth, authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import FolderTree from '../components/FolderTree';
import FolderShareModal from '../components/FolderShareModal';
import VIPCredential from '../components/VIPCredential';
import { Screen } from '../telemetry/Screen';
import { ROUTES, to } from '../routes';

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
    lab_report_number: string;
    product_sku: string;
    batch_id: string;
    custom_title: string;
    custom_name: string;
    coa_number: string;
    compliance_status: string;
    created_at: string;
    product_image_url?: string;
    analysis_date?: string;
}

interface VIPCredentialData {
    memberId: string;
    memberName: string;
    memberEmail: string;
    memberPhone?: string;
    company?: string;
    memberSince: string;
    tier: 'Partner' | 'Gold' | 'Platinum' | 'Black' | 'Revision';
    tierName: string;
    tierColor: string;
    tierSecondaryColor: string;
    status: 'active' | 'inactive' | 'suspended';
    photoUrl?: string;
    rfc?: string;
    fiscalAddress?: string;
    officePhone?: string;
}

export default function ClientDashboard() {
    const navigate = useNavigate();
    const { client, logout, isSuperAdmin, requestPushPermission } = useAuth();
    const { theme } = useTheme();
    const [coas, setCoas] = useState<COA[]>([]);
    const [filteredCoas, setFilteredCoas] = useState<COA[]>([]);
    const [loading, setLoading] = useState(true);
    const [hologramUrl, setHologramUrl] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<FolderType | null>(null);
    const [shareFolder, setShareFolder] = useState<FolderType | null>(null);
    const [folderCoas, setFolderCoas] = useState<COA[]>([]);
    const [loadingFolderCoas, setLoadingFolderCoas] = useState(false);
    const [vipCredential, setVipCredential] = useState<VIPCredentialData | null>(null);
    const [isClubPartner, setIsClubPartner] = useState(false);
    const [showCredential, setShowCredential] = useState(false);

    useEffect(() => {
        fetchMyCOAs();
        fetchHologramUrl();
        fetchVIPCredential();

        // Auto-request push permission if not enabled
        const timer = setTimeout(() => {
            handlePushRequest();
        }, 3000); // Wait 3 seconds to not overwhelm the user immediately

        return () => clearTimeout(timer);
    }, []);

    const handlePushRequest = async () => {
        try {
            // Only prompt if not already denied and not already granted
            const status = await (window as any).OneSignal?.Notifications?.permission;
            if (status === undefined || status === false) {
                console.log('[Dashboard] Auto-requesting push permission...');
                await requestPushPermission();
            }
        } catch (error) {
            console.error('[Dashboard] Push request error:', error);
        }
    };

    // When selectedFolder changes, fetch COAs for that folder
    useEffect(() => {
        if (selectedFolder) {
            fetchFolderCoas(selectedFolder.id);
        } else {
            setFilteredCoas(coas);
        }
    }, [selectedFolder, coas]);

    const fetchFolderCoas = async (folderId: string) => {
        setLoadingFolderCoas(true);
        try {
            const res = await authFetch(`/api/v1/folders/${folderId}/contents`);
            const data = await res.json();
            if (data.success) {
                setFolderCoas(data.coas || []);
                setFilteredCoas(data.coas || []);
            }
        } catch (error) {
            console.error('Error fetching folder COAs:', error);
        } finally {
            setLoadingFolderCoas(false);
        }
    };

    const handleSelectFolder = (folder: FolderType | null) => {
        setSelectedFolder(folder);
    };

    const handleShareFolder = (folder: FolderType) => {
        setShareFolder(folder);
    };

    const fetchMyCOAs = async () => {
        try {
            const res = await authFetch('/api/v1/clients/my-coas');
            const data = await res.json();
            if (data.success) {
                setCoas(data.coas || []);
            }
        } catch (error) {
            console.error('Error fetching COAs:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHologramUrl = async () => {
        try {
            const res = await authFetch('/api/v1/clients/hologram-url');
            const data = await res.json();
            if (data.success) {
                setHologramUrl(data.url);
            }
        } catch (error) {
            console.error('Error fetching hologram URL:', error);
        }
    };

    const fetchVIPCredential = async () => {
        try {
            const res = await authFetch('/api/v1/clients/me/vip-credential');
            const data = await res.json();
            if (data.success && data.isClubPartner) {
                setIsClubPartner(true);
                setVipCredential(data.credential);
            }
        } catch (error) {
            console.error('Error fetching VIP credential:', error);
        }
    };

    const handleCredentialPhotoUpdate = (newPhotoUrl: string) => {
        if (vipCredential) {
            setVipCredential({ ...vipCredential, photoUrl: newPhotoUrl });
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate(ROUTES.login);
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
        <Screen id="screen.dashboard">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-4xl mx-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => navigate(ROUTES.home)}
                                    className="p-2 rounded-lg transition-colors"
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}20`}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <ArrowLeft className="w-6 h-6" />
                                </button>
                                <div>
                                    <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Mi Dashboard</h1>
                                    <p className="text-sm" style={{ color: theme.textMuted }}>Gestiona tus certificados</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-medium" style={{ color: theme.text }}>{client?.name || client?.email}</p>
                                    <p className="text-xs" style={{ color: theme.textMuted }}>
                                        {isSuperAdmin ? 'Super Admin' : 'Cliente'}
                                    </p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 rounded-lg transition-colors"
                                    style={{ color: theme.textMuted }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = `${theme.accent}20`;
                                        e.currentTarget.style.color = theme.text;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = theme.textMuted;
                                    }}
                                    title="Cerrar sesion"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* User Info Card */}
                        <div
                            className="rounded-xl p-6 mb-6"
                            style={{
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: `${theme.accent}20` }}
                                    >
                                        <User className="w-6 h-6" style={{ color: theme.accent }} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="font-semibold" style={{ color: theme.text }}>{client?.name || 'Usuario'}</h2>
                                            {isClubPartner && (
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                                                    style={{
                                                        background: `linear-gradient(135deg, ${vipCredential?.tierColor || '#D4AF37'} 0%, ${vipCredential?.tierSecondaryColor || '#F5D77A'} 100%)`,
                                                        color: vipCredential?.tier === 'Black' ? '#ffffff' : '#1a1a1a'
                                                    }}
                                                >
                                                    <Award className="w-3 h-3" />
                                                    {vipCredential?.tierName || 'VIP'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm" style={{ color: theme.textMuted }}>{client?.email}</p>
                                        {client?.company && (
                                            <p className="text-xs" style={{ color: theme.textMuted }}>{client.company}</p>
                                        )}
                                    </div>
                                </div>
                                {isClubPartner && (
                                    <button
                                        onClick={() => setShowCredential(!showCredential)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-lg"
                                        style={{
                                            background: showCredential ? theme.cardBg2 : `linear-gradient(135deg, ${vipCredential?.tierColor || '#D4AF37'} 0%, ${vipCredential?.tierSecondaryColor || '#F5D77A'} 100%)`,
                                            color: showCredential ? theme.text : (vipCredential?.tier === 'Black' ? '#ffffff' : '#1a1a1a'),
                                            border: showCredential ? `1px solid ${theme.border}` : 'none'
                                        }}
                                    >
                                        <Award className="w-4 h-4" />
                                        {showCredential ? 'Ocultar Credencial' : `Mi Credencial ${vipCredential?.tierName || 'VIP'}`}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* VIP Credential Section */}
                        {isClubPartner && showCredential && vipCredential && (
                            <div
                                className="rounded-xl p-6 mb-6"
                                style={{
                                    background: `linear-gradient(135deg, ${vipCredential.tierColor}15 0%, ${vipCredential.tierSecondaryColor}05 100%)`,
                                    border: `1px solid ${vipCredential.tierColor}40`,
                                }}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <Award className="w-5 h-5" style={{ color: vipCredential.tierColor }} />
                                    <h3 className="font-semibold" style={{ color: theme.text }}>
                                        Credencial Club EUM Care {vipCredential.tierName}
                                    </h3>
                                </div>
                                <VIPCredential
                                    credential={vipCredential}
                                    onPhotoUpdate={handleCredentialPhotoUpdate}
                                />
                            </div>
                        )}

                        {/* Super Admin Quick Access */}
                        {isSuperAdmin && (
                            <div
                                className="rounded-xl p-4 mb-6"
                                style={{
                                    background: `linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)`,
                                    border: `1px solid rgba(139, 92, 246, 0.3)`,
                                }}
                            >
                                <p className="text-sm mb-3" style={{ color: '#c4b5fd' }}>Acceso de Administrador</p>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    {[
                                        { label: 'Gestionar COAs', path: ROUTES.adminCoas, color: theme.accent },
                                        { label: 'Subir COA', path: ROUTES.upload, color: '#8b5cf6' },
                                        { label: 'Hologramas', path: ROUTES.inventory, color: '#8b5cf6' },
                                        { label: 'Badges', path: ROUTES.badges, color: '#8b5cf6' },
                                        { label: 'Templates', path: ROUTES.templates, color: '#8b5cf6' },
                                    ].map((item) => (
                                        <button
                                            key={item.path}
                                            onClick={() => navigate(item.path)}
                                            className="px-3 py-2 rounded-lg text-sm transition-all font-medium"
                                            style={{ backgroundColor: item.color, color: '#ffffff' }}
                                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Access Buttons */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <button
                                onClick={() => navigate(ROUTES.myOrders)}
                                className="flex items-center justify-center gap-2 font-medium py-3 rounded-xl transition-all shadow-sm"
                                style={{
                                    backgroundColor: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                    color: theme.text
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = theme.accent;
                                    e.currentTarget.style.backgroundColor = `${theme.accent}10`;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = theme.border;
                                    e.currentTarget.style.backgroundColor = theme.cardBg;
                                }}
                            >
                                <Package className="w-5 h-5" style={{ color: theme.accent }} />
                                Mis Pedidos
                            </button>

                            <button
                                onClick={() => navigate(ROUTES.myCollection)}
                                className="flex items-center justify-center gap-2 font-medium py-3 rounded-xl transition-all shadow-sm"
                                style={{
                                    backgroundColor: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                    color: theme.text
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#ef4444';
                                    e.currentTarget.style.backgroundColor = '#ef444410';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = theme.border;
                                    e.currentTarget.style.backgroundColor = theme.cardBg;
                                }}
                            >
                                <Heart className="w-5 h-5" style={{ color: '#ef4444' }} />
                                Mi Colección
                            </button>
                        </div>

                        {/* Buy Hologramas Button (for clients only) */}
                        {!isSuperAdmin && hologramUrl && (
                            <a
                                href={hologramUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full font-medium py-3 rounded-xl mb-6 transition-all"
                                style={{
                                    background: `linear-gradient(135deg, ${theme.accent} 0%, #059669 100%)`,
                                    color: '#ffffff',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                                <ShoppingCart className="w-5 h-5" />
                                Comprar Hologramas
                                <ExternalLink className="w-4 h-4" />
                            </a>
                        )}

                        {/* Folders and COAs Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Folder Tree Sidebar */}
                            <div className="lg:col-span-1">
                                <FolderTree
                                    onSelectFolder={handleSelectFolder}
                                    onShareFolder={handleShareFolder}
                                    selectedFolderId={selectedFolder?.id || null}
                                    availableCOAs={coas}
                                />
                            </div>

                            {/* COAs List */}
                            <div className="lg:col-span-2">
                                <div
                                    className="rounded-xl overflow-hidden"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                    }}
                                >
                                    <div
                                        className="p-4"
                                        style={{ borderBottom: `1px solid ${theme.border}` }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <h2 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
                                                {selectedFolder ? (
                                                    <>
                                                        <Folder className="w-5 h-5" style={{ color: theme.accent }} />
                                                        {selectedFolder.name}
                                                    </>
                                                ) : (
                                                    <>
                                                        <FileText className="w-5 h-5" style={{ color: theme.accent }} />
                                                        Todos los Certificados
                                                    </>
                                                )}
                                            </h2>
                                            {selectedFolder && (
                                                <button
                                                    onClick={() => setSelectedFolder(null)}
                                                    className="text-sm transition-colors"
                                                    style={{ color: theme.textMuted }}
                                                    onMouseEnter={(e) => e.currentTarget.style.color = theme.text}
                                                    onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                                                >
                                                    Ver todos
                                                </button>
                                            )}
                                        </div>
                                        {selectedFolder?.description && (
                                            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>{selectedFolder.description}</p>
                                        )}
                                    </div>

                                    {loading || loadingFolderCoas ? (
                                        <div className="p-8 text-center">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} />
                                        </div>
                                    ) : filteredCoas.length === 0 ? (
                                        <div className="p-8 text-center" style={{ color: theme.textMuted }}>
                                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                            {selectedFolder ? (
                                                <>
                                                    <p>No hay certificados en esta carpeta</p>
                                                    <p className="text-sm mt-1">
                                                        Agrega COAs usando el menu de la carpeta
                                                    </p>
                                                </>
                                            ) : (
                                                <>
                                                    <p>No tienes certificados asignados</p>
                                                    <p className="text-sm mt-1">
                                                        Contacta a EUM para asignar certificados a tu cuenta
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            {filteredCoas.map((coa, index) => (
                                                <div
                                                    key={coa.id}
                                                    className="p-4 transition-colors cursor-pointer"
                                                    style={{
                                                        borderTop: index > 0 ? `1px solid ${theme.border}` : 'none',
                                                    }}
                                                    onClick={() => navigate(to.coa(coa.public_token))}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}10`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        {/* Product Image */}
                                                        <div
                                                            className="w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden"
                                                            style={{ backgroundColor: theme.cardBg2 }}
                                                        >
                                                            {coa.product_image_url ? (
                                                                <img
                                                                    src={coa.product_image_url}
                                                                    alt={coa.custom_name || coa.custom_title || 'Producto'}
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
                                                            <h3 className="font-medium truncate" style={{ color: theme.text }}>
                                                                {coa.custom_name || coa.custom_title || coa.product_sku || coa.lab_report_number || 'Sin nombre'}
                                                            </h3>
                                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm" style={{ color: theme.textMuted }}>
                                                                {coa.batch_id && (
                                                                    <span className="truncate">Lote: {coa.batch_id}</span>
                                                                )}
                                                                {coa.coa_number && (
                                                                    <span className="truncate">COA: {coa.coa_number}</span>
                                                                )}
                                                                <span>
                                                                    {new Date(coa.analysis_date || coa.created_at).toLocaleDateString('es-ES', {
                                                                        day: 'numeric',
                                                                        month: 'short',
                                                                        year: 'numeric'
                                                                    })}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Status & Action */}
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            <span
                                                                className="px-2.5 py-1 rounded-full text-xs font-medium"
                                                                style={{
                                                                    backgroundColor: getStatusColor(coa.compliance_status).bg,
                                                                    color: getStatusColor(coa.compliance_status).color,
                                                                }}
                                                            >
                                                                {getStatusText(coa.compliance_status)}
                                                            </span>
                                                            <ExternalLink className="w-4 h-4" style={{ color: theme.textMuted }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Folder Share Modal */}
                    {shareFolder && (
                        <FolderShareModal
                            folder={shareFolder}
                            onClose={() => setShareFolder(null)}
                            onUpdate={() => {
                                // Optionally refresh folders after updating public status
                            }}
                        />
                    )}
                </div>
            </Layout>
        </Screen>
    );
}
