/**
 * AraChatLauncher - Floating button to open the widget
 *
 * Shows notification badge and brain icon.
 */

import React from 'react';
import { MessageCircle, Bot } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface AraChatLauncherProps {
    onClick: () => void;
    unreadCount: number;
    isMinimized?: boolean;
}

const AraChatLauncher: React.FC<AraChatLauncherProps> = ({
    onClick,
    unreadCount,
    isMinimized = false
}) => {
    const { theme } = useTheme();

    return (
        <button
            onClick={onClick}
            className="relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group"
            style={{
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentSecondary || '#7C3AED'})`
            }}
            title="Chatear con Ara"
        >
            <Bot size={26} className="text-white" />

            {/* Notification badge */}
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}

            {/* Minimized indicator (pulsing dot) */}
            {isMinimized && unreadCount === 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            )}

            {/* Hover tooltip */}
            <span
                className="absolute right-full mr-3 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{
                    backgroundColor: theme.cardBg,
                    color: theme.text,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}
            >
                Chatear con Ara
            </span>
        </button>
    );
};

export default AraChatLauncher;
