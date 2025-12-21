import React from 'react';
import { Sun, Moon, Sparkles, Zap } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeMode } from '../contexts/ThemeContext';

export const ThemeSwitcher: React.FC = () => {
    const { themeMode, setThemeMode, theme } = useTheme();

    const themes: { mode: ThemeMode; icon: any; label: string }[] = [
        { mode: 'light', icon: Sun, label: 'Light' },
        { mode: 'dark', icon: Moon, label: 'Dark' },
        { mode: 'tokyo', icon: Sparkles, label: 'Tokyo' },
        { mode: 'neon', icon: Zap, label: 'Neon' },
    ];

    return (
        <div className="fixed bottom-24 left-6 z-[9999] flex items-center gap-1 p-1 rounded-full backdrop-blur-md border border-white/10 shadow-2xl transition-all duration-300 hover:scale-105"
            style={{ backgroundColor: `${theme.cardBg}80`, borderColor: theme.border }}>
            {themes.map((t) => {
                const Icon = t.icon;
                const isActive = themeMode === t.mode;
                return (
                    <button
                        key={t.mode}
                        onClick={() => setThemeMode(t.mode)}
                        className={`p-2 rounded-full transition-all duration-200 group relative`}
                        style={{
                            backgroundColor: isActive ? theme.accent : 'transparent',
                            color: isActive ? '#fff' : theme.textMuted
                        }}
                        title={t.label}
                    >
                        <Icon size={16} className={isActive ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'} />
                        {isActive && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_#fff]" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};
