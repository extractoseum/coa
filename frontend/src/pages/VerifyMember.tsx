import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Award, CheckCircle, XCircle, Loader2, User, Calendar, Building2, Shield } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface MemberData {
    memberId: string;
    memberName: string;
    company?: string;
    tier: 'Partner' | 'Gold' | 'Platinum' | 'Black';
    status: 'active' | 'inactive' | 'suspended';
    memberSince: string;
    photoUrl?: string;
}

const tierColors: Record<string, { primary: string; secondary: string; gradient: string }> = {
    Partner: {
        primary: '#4F46E5',
        secondary: '#818CF8',
        gradient: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #818CF8 100%)',
    },
    Gold: {
        primary: '#D4AF37',
        secondary: '#F5D77A',
        gradient: 'linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #F5D77A 100%)',
    },
    Platinum: {
        primary: '#A0A5AB',
        secondary: '#E5E4E2',
        gradient: 'linear-gradient(135deg, #6B7280 0%, #A0A5AB 50%, #E5E4E2 100%)',
    },
    Black: {
        primary: '#1a1a1a',
        secondary: '#374151',
        gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #374151 100%)',
    }
};

export default function VerifyMember() {
    const { memberId } = useParams<{ memberId: string }>();
    const { theme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [member, setMember] = useState<MemberData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const verifyMember = async () => {
            if (!memberId) {
                setError('ID de miembro no proporcionado');
                setLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/v1/clients/verify-member/${memberId}`);
                const data = await res.json();

                if (data.success && data.member) {
                    setMember(data.member);
                } else {
                    setError(data.error || 'Miembro no encontrado');
                }
            } catch (err) {
                setError('Error al verificar el miembro');
            } finally {
                setLoading(false);
            }
        };

        verifyMember();
    }, [memberId]);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-MX', {
            month: 'long',
            year: 'numeric'
        });
    };

    const tierConfig = member ? tierColors[member.tier] || tierColors.Partner : tierColors.Partner;

    if (loading) {
        return (
            <Screen id="VerifyMember_Loading">
                <Layout>
                    <div className="min-h-screen flex items-center justify-center p-4">
                        <div className="text-center">
                            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: theme.accent }} />
                            <p style={{ color: theme.textMuted }}>Verificando miembro...</p>
                        </div>
                    </div>
                </Layout>
            </Screen>
        );
    }

    if (error || !member) {
        return (
            <Screen id="VerifyMember_Error">
                <Layout>
                    <div className="min-h-screen flex items-center justify-center p-4">
                        <div
                            className="max-w-sm w-full rounded-2xl p-8 text-center"
                            style={{
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                            }}
                        >
                            <div
                                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                            >
                                <XCircle className="w-8 h-8 text-red-500" />
                            </div>
                            <h2 className="text-xl font-bold mb-2" style={{ color: theme.text }}>
                                Verificacion Fallida
                            </h2>
                            <p style={{ color: theme.textMuted }}>
                                {error || 'No se pudo verificar este miembro'}
                            </p>
                        </div>
                    </div>
                </Layout>
            </Screen>
        );
    }

    return (
        <Screen id="VerifyMember">
            <Layout>
                <div className="min-h-screen flex items-center justify-center p-4 pb-24">
                    <div
                        className="max-w-sm w-full rounded-2xl overflow-hidden"
                        style={{
                            backgroundColor: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        {/* Header with gradient */}
                        <div
                            className="p-6 text-center"
                            style={{ background: tierConfig.gradient }}
                        >
                            <div className="flex items-center justify-center gap-2 mb-4">
                                <Award className="w-6 h-6 text-white" />
                                <h1 className="text-lg font-bold text-white tracking-wider">
                                    CLUB EUM CARE
                                </h1>
                            </div>

                            {/* Photo or placeholder */}
                            <div
                                className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-white/30 overflow-hidden"
                                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                            >
                                {member.photoUrl ? (
                                    <img
                                        src={member.photoUrl}
                                        alt={member.memberName}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <User className="w-12 h-12 text-white/60" />
                                    </div>
                                )}
                            </div>

                            <h2 className="text-xl font-bold text-white mb-1">
                                {member.memberName}
                            </h2>
                            <p className="text-white/80 text-sm">
                                Socio {member.tier}
                            </p>
                        </div>

                        {/* Verification badge */}
                        <div className="px-6 -mt-4 relative z-10">
                            <div
                                className={`mx-auto w-fit px-4 py-2 rounded-full flex items-center gap-2 shadow-lg ${member.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                                    }`}
                            >
                                {member.status === 'active' ? (
                                    <>
                                        <CheckCircle className="w-5 h-5 text-white" />
                                        <span className="text-white font-semibold">VERIFICADO</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-white" />
                                        <span className="text-white font-semibold">INACTIVO</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Member details */}
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: `${tierConfig.primary}20` }}
                                >
                                    <Shield className="w-5 h-5" style={{ color: tierConfig.primary }} />
                                </div>
                                <div>
                                    <p className="text-xs" style={{ color: theme.textMuted }}>ID de Miembro</p>
                                    <p className="font-mono font-semibold" style={{ color: theme.text }}>
                                        {member.memberId}
                                    </p>
                                </div>
                            </div>

                            {member.company && (
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: `${tierConfig.primary}20` }}
                                    >
                                        <Building2 className="w-5 h-5" style={{ color: tierConfig.primary }} />
                                    </div>
                                    <div>
                                        <p className="text-xs" style={{ color: theme.textMuted }}>Empresa</p>
                                        <p className="font-semibold" style={{ color: theme.text }}>
                                            {member.company}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: `${tierConfig.primary}20` }}
                                >
                                    <Calendar className="w-5 h-5" style={{ color: tierConfig.primary }} />
                                </div>
                                <div>
                                    <p className="text-xs" style={{ color: theme.textMuted }}>Miembro desde</p>
                                    <p className="font-semibold capitalize" style={{ color: theme.text }}>
                                        {formatDate(member.memberSince)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div
                            className="px-6 py-4 text-center"
                            style={{
                                backgroundColor: theme.cardBg2,
                                borderTop: `1px solid ${theme.border}`,
                            }}
                        >
                            <p className="text-xs" style={{ color: theme.textMuted }}>
                                Verificado por Club EUM Care
                            </p>
                        </div>
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
