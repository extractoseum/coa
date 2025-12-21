import { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';

interface InAppBrowserProps {
    url: string;
    isOpen: boolean;
    onClose: () => void;
    title?: string;
}

export function InAppBrowser({ url, isOpen, onClose, title = 'Navegador' }: InAppBrowserProps) {
    const [isLoading, setIsLoading] = useState(true);

    if (!isOpen) return null;

    // Handle close on ESC key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-white"
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shadow-md h-14 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
                    >
                        <X size={24} />
                    </button>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium text-white truncate">{title}</span>
                        <span className="text-xs text-gray-500 truncate">{url.replace('https://', '')}</span>
                    </div>
                </div>

                <div className="flex items-center">
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-emerald-400 transition-colors"
                        title="Abrir en navegador externo"
                    >
                        <ExternalLink size={20} />
                    </a>
                </div>
            </div>

            {/* Content using iframe */}
            <div className="flex-1 relative bg-gray-50 w-full h-full">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
                    </div>
                )}
                <iframe
                    src={url}
                    className="w-full h-full border-0"
                    title={title}
                    onLoad={() => setIsLoading(false)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
            </div>
        </div>
    );
}
