
import React, { useState, useEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface FloatingDockProps {
    children: React.ReactNode;
    initialBottom?: number;
    initialRight?: number;
}

const FloatingDock: React.FC<FloatingDockProps> = ({
    children,
    initialBottom = 24,
    initialRight = 24
}) => {
    const [position, setPosition] = useState({ bottom: initialBottom, right: initialRight });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const dockRef = useRef<HTMLDivElement>(null);

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        // Only start drag if clicking the handle or the container background (not children buttons)
        if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('.dock-handle')) {
            return;
        }

        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        if (dockRef.current) {
            const rect = dockRef.current.getBoundingClientRect();
            dragOffset.current = {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

        const dockWidth = dockRef.current?.offsetWidth || 0;
        const dockHeight = dockRef.current?.offsetHeight || 0;

        // Calculate new right and bottom from window edges
        const newRight = window.innerWidth - clientX + dragOffset.current.x - dockWidth;
        const newBottom = window.innerHeight - clientY + dragOffset.current.y - dockHeight;

        // Apply bounds
        const boundedRight = Math.max(10, Math.min(window.innerWidth - dockWidth - 10, newRight));
        const boundedBottom = Math.max(10, Math.min(window.innerHeight - dockHeight - 10, newBottom));

        setPosition({ bottom: boundedBottom, right: boundedRight });
    };

    const handleEnd = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
            return () => {
                window.removeEventListener('mousemove', handleMove);
                window.removeEventListener('mouseup', handleEnd);
                window.removeEventListener('touchmove', handleMove);
                window.removeEventListener('touchend', handleEnd);
            };
        }
    }, [isDragging]);

    return (
        <div
            ref={dockRef}
            className="fixed z-[inherit] flex flex-col items-center gap-3 transition-transform duration-75 pointer-events-auto select-none"
            style={{
                bottom: `${position.bottom}px`,
                right: `${position.right}px`,
                touchAction: 'none'
            }}
            onMouseDown={handleStart}
            onTouchStart={handleStart}
        >
            {/* Drag Handle */}
            <div className="dock-handle p-1.5 cursor-move text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full border border-white/10 shadow-xl backdrop-blur-md opacity-50 hover:opacity-100">
                <GripVertical size={16} />
            </div>

            {/* Docked Content (staked vertically) */}
            <div className="flex flex-col-reverse items-center gap-3">
                {children}
            </div>
        </div>
    );
};

export default FloatingDock;
