import { useState, useEffect } from 'react';
import { Scan, Copy, X, Bug } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function QAOverlay() {
    const [isVisible, setIsVisible] = useState(false);
    const [inspecting, setInspecting] = useState(false);
    const [hoveredElement, setHoveredElement] = useState<{ id: string; rect: DOMRect; screenId?: string } | null>(null);
    const { theme } = useTheme();

    // Toggle with Cmd+. or Ctrl+.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '.') {
                setIsVisible(prev => !prev);
                setInspecting(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Inspector logic
    useEffect(() => {
        if (!inspecting || !isVisible) {
            setHoveredElement(null);
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Find closest element with data-testid
            const testIdElement = target.closest('[data-testid]');

            if (testIdElement) {
                const rect = testIdElement.getBoundingClientRect();
                const testId = testIdElement.getAttribute('data-testid') || '';

                // Find parent screen
                const screenElement = target.closest('[data-screen-id]');
                const screenId = screenElement?.getAttribute('data-screen-id') || undefined;

                setHoveredElement({
                    id: testId,
                    rect,
                    screenId
                });
            } else {
                setHoveredElement(null);
            }
        };

        const handleClick = (e: MouseEvent) => {
            if (hoveredElement) {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(`[data-testid="${hoveredElement.id}"]`);
                // Visual feedback could be added here
                setInspecting(false);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('click', handleClick, true); // Capture phase to prevent actual clicks

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('click', handleClick, true);
        };
    }, [inspecting, isVisible, hoveredElement]);

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* Inspector Overlay Box */}
            {hoveredElement && (
                <div
                    className="absolute border-2 border-pink-500 bg-pink-500/10 transition-all duration-75 pointer-events-none"
                    style={{
                        top: hoveredElement.rect.top,
                        left: hoveredElement.rect.left,
                        width: hoveredElement.rect.width,
                        height: hoveredElement.rect.height,
                    }}
                >
                    <div className="absolute -top-8 left-0 bg-pink-600 text-white text-xs px-2 py-1 rounded shadow-lg flex items-center gap-2 whitespace-nowrap">
                        <span className="font-mono font-bold">{hoveredElement.id}</span>
                        {hoveredElement.screenId && (
                            <span className="opacity-75 text-[10px] border-l border-pink-400 pl-2">
                                {hoveredElement.screenId}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Control Bar */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-4 pointer-events-auto">
                <div className="flex items-center gap-2 border-r border-gray-700 pr-4">
                    <Bug className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold">QA Mode</span>
                </div>

                <button
                    onClick={() => setInspecting(!inspecting)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${inspecting ? 'bg-pink-600 text-white' : 'hover:bg-gray-800 text-gray-400'
                        }`}
                >
                    <Scan className="w-4 h-4" />
                    <span className="text-sm">{inspecting ? 'Inspecting...' : 'Inspect'}</span>
                </button>

                <div className="text-xs text-gray-500 font-mono">
                    Cmd + . to toggle
                </div>

                <button
                    onClick={() => setIsVisible(false)}
                    className="ml-2 p-1 hover:bg-gray-800 rounded-full text-gray-400"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
