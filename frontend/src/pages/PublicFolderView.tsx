import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ROUTES, to } from '../routes';
import { Screen } from '../telemetry/Screen';
import { Folder, FileText, ChevronRight, Loader2, AlertTriangle, ShieldCheck, FolderOpen } from 'lucide-react';

interface COAPreview {
    id: string;
    public_token: string;
    custom_title?: string;
    custom_name?: string;
    product_sku?: string;
    batch_id?: string;
    lab_report_number?: string;
    compliance_status: string;
    product_image_url?: string;
    created_at: string;
}

interface Subfolder {
    id: string;
    name: string;
    description?: string;
    public_token: string;
    is_public: boolean;
}

interface FolderData {
    id: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    owner: string;
    coas: COAPreview[];
    subfolders?: Subfolder[];
    coa_count?: number;
}

export default function PublicFolderView() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [folder, setFolder] = useState<FolderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadFolder();
    }, [token]);

    const loadFolder = async () => {
        try {
            const res = await fetch(`/api/v1/folders/public/${token}`);
            const data = await res.json();

            if (data.success) {
                setFolder(data.folder);
            } else {
                setError(data.error || 'Carpeta no encontrada');
            }
        } catch (err) {
            setError('Error de conexion');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Cargando carpeta...</p>
                </div>
            </div>
        );
    }

    if (error || !folder) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
                <div className="text-center">
                    <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Error</h2>
                    <p className="text-gray-400 mb-6">{error || 'Carpeta no encontrada'}</p>
                    <Link
                        to={ROUTES.home}
                        className="text-emerald-400 hover:text-emerald-300"
                    >
                        Volver al inicio
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <Screen id="PublicFolderView">
            <div className="min-h-screen bg-gray-900 text-white">
                {/* Header */}
                <div
                    className="border-b border-gray-800"
                    style={{ borderLeftColor: folder.color, borderLeftWidth: '4px' }}
                >
                    <div className="max-w-4xl mx-auto px-6 py-8">
                        <div className="flex items-center gap-4 mb-4">
                            <div
                                className="w-14 h-14 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: folder.color + '20' }}
                            >
                                <Folder className="w-7 h-7" style={{ color: folder.color }} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">{folder.name}</h1>
                                <p className="text-gray-400 text-sm">
                                    Por {folder.owner} - {folder.coas.length} certificado{folder.coas.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                        {folder.description && (
                            <p className="text-gray-400 mt-2">{folder.description}</p>
                        )}
                    </div>
                </div>

                {/* Subfolders */}
                {folder.subfolders && folder.subfolders.length > 0 && (
                    <div className="max-w-4xl mx-auto px-6 pt-8">
                        <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                            <FolderOpen className="w-4 h-4" />
                            Subcarpetas
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {folder.subfolders.map(subfolder => (
                                <button
                                    key={subfolder.id}
                                    onClick={() => navigate(to.publicFolder(subfolder.public_token))}
                                    className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-emerald-500/50 hover:bg-gray-700/50 transition-all flex items-center gap-3 text-left"
                                >
                                    <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Folder className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-white truncate">{subfolder.name}</h4>
                                        {subfolder.description && (
                                            <p className="text-sm text-gray-400 truncate">{subfolder.description}</p>
                                        )}
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* COA List */}
                <div className="max-w-4xl mx-auto px-6 py-8">
                    {folder.coas.length === 0 && (!folder.subfolders || folder.subfolders.length === 0) ? (
                        <div className="text-center py-16">
                            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <h3 className="text-xl font-medium text-gray-400">Sin contenido</h3>
                            <p className="text-gray-500">Esta carpeta no tiene COAs ni subcarpetas</p>
                        </div>
                    ) : folder.coas.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p className="text-sm">No hay certificados directamente en esta carpeta</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {folder.coas.map(coa => (
                                <Link
                                    key={coa.id}
                                    to={to.coa(coa.public_token)}
                                    className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors flex items-center gap-4"
                                >
                                    {/* Image or Icon */}
                                    {coa.product_image_url ? (
                                        <img
                                            src={coa.product_image_url}
                                            alt=""
                                            className="w-16 h-16 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center">
                                            <FileText className="w-8 h-8 text-gray-500" />
                                        </div>
                                    )}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-white truncate">
                                            {coa.custom_title || coa.custom_name || coa.product_sku || coa.batch_id || 'Certificado de Analisis'}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            {coa.lab_report_number && (
                                                <span className="text-sm text-gray-400">
                                                    #{coa.lab_report_number}
                                                </span>
                                            )}
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded ${coa.compliance_status === 'pass'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-yellow-500/20 text-yellow-400'
                                                    }`}
                                            >
                                                {coa.compliance_status === 'pass' ? 'VERIFIED' : coa.compliance_status?.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <ChevronRight className="w-5 h-5 text-gray-500" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-800 mt-8">
                    <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Certificados verificados por EUM
                    </div>
                </div>
            </div>
        </Screen>
    );
}
