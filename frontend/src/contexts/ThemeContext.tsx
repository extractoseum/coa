import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'tokyo' | 'neon';

export interface ThemeColors {
    bg: string;
    cardBg: string;
    cardBg2: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    accentHover: string;
    accentSecondary: string;
    navBg: string;
    navBorder: string;
}

const themes: Record<ThemeMode, ThemeColors> = {
    light: {
        bg: '#f3f4f6',
        cardBg: '#ffffff',
        cardBg2: '#f9fafb',
        border: '#d1d5db',
        text: '#111827',
        textMuted: '#6b7280',
        accent: '#10b981',
        accentHover: '#059669',
        accentSecondary: '#6366f1',
        navBg: 'rgba(255, 255, 255, 0.9)',
        navBorder: '#e5e7eb',
    },
    dark: {
        bg: '#0a0e1a',
        cardBg: '#111827',
        cardBg2: '#1f2937',
        border: '#374151',
        text: '#ffffff',
        textMuted: '#9ca3af',
        accent: '#10b981',
        accentHover: '#34d399',
        accentSecondary: '#8b5cf6',
        navBg: 'rgba(17, 24, 39, 0.95)',
        navBorder: '#374151',
    },
    tokyo: {
        bg: '#0d0d1a',
        cardBg: '#1a1a2e',
        cardBg2: '#16213e',
        border: '#4a4a8a',
        text: '#ffffff',
        textMuted: '#a0a0c0',
        accent: '#00f5d4',
        accentHover: '#00d4b8',
        accentSecondary: '#bd93f9',
        navBg: 'rgba(26, 26, 46, 0.95)',
        navBorder: '#4a4a8a',
    },
    neon: {
        bg: '#020205',
        cardBg: '#050510',
        cardBg2: '#0a0a1f',
        border: 'rgba(236, 72, 153, 0.2)',
        text: '#ffffff',
        textMuted: '#94a3b8',
        accent: '#ec4899', // Pink Neon
        accentHover: '#f472b6',
        accentSecondary: '#8b5cf6', // Purple Neon
        navBg: 'rgba(2, 2, 5, 0.9)',
        navBorder: 'rgba(139, 92, 246, 0.3)',
    }
};

interface ThemeContextType {
    themeMode: ThemeMode;
    theme: ThemeColors;
    setThemeMode: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'coa-theme-mode';

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved && (saved === 'light' || saved === 'dark' || saved === 'tokyo' || saved === 'neon')) {
            return saved as ThemeMode;
        }
        return 'tokyo'; // Default to Tokyo/Neon since it's the premium look
    });

    const theme = themes[themeMode];

    useEffect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, themeMode);
        // Update CSS variables for global access
        document.documentElement.style.setProperty('--theme-bg', theme.bg);
        document.documentElement.style.setProperty('--theme-card-bg', theme.cardBg);
        document.documentElement.style.setProperty('--theme-card-bg2', theme.cardBg2);
        document.documentElement.style.setProperty('--theme-border', theme.border);
        document.documentElement.style.setProperty('--theme-text', theme.text);
        document.documentElement.style.setProperty('--theme-text-muted', theme.textMuted);
        document.documentElement.style.setProperty('--theme-accent', theme.accent);
        document.documentElement.style.setProperty('--theme-accent-hover', theme.accentHover);
        document.documentElement.style.setProperty('--theme-accent-secondary', theme.accentSecondary);
        document.documentElement.style.setProperty('--theme-nav-bg', theme.navBg);
        document.documentElement.style.setProperty('--theme-nav-border', theme.navBorder);
    }, [themeMode, theme]);

    const setThemeMode = (mode: ThemeMode) => {
        setThemeModeState(mode);
    };

    const toggleTheme = () => {
        setThemeModeState((prev) => {
            if (prev === 'light') return 'dark';
            if (prev === 'dark') return 'tokyo';
            if (prev === 'tokyo') return 'neon';
            return 'light';
        });
    };

    return (
        <ThemeContext.Provider value={{ themeMode, theme, setThemeMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

export { themes };
