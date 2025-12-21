import { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, Globe, Lock, ExternalLink } from 'lucide-react';
import QRCode from 'react-qr-code';
import { authFetch } from '../contexts/AuthContext';

interface FolderType {
    id: string;
    name: string;
    description: string | null;
    public_token: string;
    is_public: boolean;
    coa_count: number;
}

interface FolderShareModalProps {
    folder: FolderType;
    onClose: () => void;
    onUpdate?: () => void;
}

export default function FolderShareModal({ folder, onClose, onUpdate }: FolderShareModalProps) {
    const [isPublic, setIsPublic] = useState(folder.is_public);
    const [updating, setUpdating] = useState(false);
    const [copied, setCopied] = useState(false);

    const publicUrl = `${window.location.origin}/folder/${folder.public_token}`;

    const togglePublic = async () => {
        setUpdating(true);
        try {
            const res = await authFetch(`/api/v1/folders/${folder.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_public: !isPublic })
            });
            const data = await res.json();
            if (data.success) {
                setIsPublic(!isPublic);
                onUpdate?.();
            }
        } catch (error) {
            console.error('Error updating folder:', error);
        } finally {
            setUpdating(false);
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying link:', error);
        }
    };

    const downloadQR = () => {
        const svg = document.getElementById('folder-qr-code');
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;
            ctx!.fillStyle = 'white';
            ctx!.fillRect(0, 0, canvas.width, canvas.height);
            ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);

            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = `qr-${folder.name.toLowerCase().replace(/\s+/g, '-')}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        };

        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-emerald-400" />
                        Compartir Carpeta
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-700 rounded"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Folder info */}
                <div className="mb-6 p-3 bg-gray-700/50 rounded-lg">
                    <p className="font-medium">{folder.name}</p>
                    {folder.description && (
                        <p className="text-sm text-gray-400 mt-1">{folder.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                        {folder.coa_count} COA{folder.coa_count !== 1 ? 's' : ''} en esta carpeta
                    </p>
                </div>

                {/* Public/Private toggle */}
                <div className="mb-6">
                    <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                        <div className="flex items-center gap-3">
                            {isPublic ? (
                                <Globe className="w-5 h-5 text-emerald-400" />
                            ) : (
                                <Lock className="w-5 h-5 text-gray-400" />
                            )}
                            <div>
                                <p className="font-medium">
                                    {isPublic ? 'Carpeta Publica' : 'Carpeta Privada'}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {isPublic
                                        ? 'Cualquiera con el enlace puede ver los COAs'
                                        : 'Solo tu puedes ver esta carpeta'
                                    }
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={togglePublic}
                            disabled={updating}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                                isPublic ? 'bg-emerald-600' : 'bg-gray-600'
                            } ${updating ? 'opacity-50' : ''}`}
                        >
                            <span
                                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                    isPublic ? 'translate-x-6' : ''
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* QR Code and Link - only show if public */}
                {isPublic && (
                    <>
                        {/* QR Code */}
                        <div className="flex justify-center mb-6">
                            <div className="bg-white p-4 rounded-lg">
                                <QRCode
                                    id="folder-qr-code"
                                    value={publicUrl}
                                    size={180}
                                    level="H"
                                />
                            </div>
                        </div>

                        {/* URL */}
                        <div className="mb-6">
                            <label className="block text-sm text-gray-400 mb-2">Enlace publico</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={publicUrl}
                                    readOnly
                                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm truncate"
                                />
                                <button
                                    onClick={copyLink}
                                    className={`px-3 py-2 rounded-lg transition-colors ${
                                        copied
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-700 hover:bg-gray-600'
                                    }`}
                                    title="Copiar enlace"
                                >
                                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={downloadQR}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                <QrCode className="w-4 h-4" />
                                Descargar QR
                            </button>
                            <a
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Ver Carpeta
                            </a>
                        </div>
                    </>
                )}

                {!isPublic && (
                    <div className="text-center py-4 text-gray-500">
                        <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">
                            Activa el acceso publico para compartir esta carpeta via QR
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
