import type { ReactNode } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Navbar from './Navbar';

interface LayoutProps {
    children: ReactNode;
    showNavbar?: boolean;
    className?: string;
    fullHeight?: boolean;
}

export default function Layout({
    children,
    showNavbar = true,
    className = '',
    fullHeight = true,
}: LayoutProps) {
    const { theme } = useTheme();

    return (
        <div
            className={`${fullHeight ? 'min-h-screen' : ''} transition-colors duration-300 ${className}`}
            style={{
                backgroundColor: theme.bg,
                color: theme.text,
            }}
        >
            {children}
            {showNavbar && <Navbar />}
            <footer
                className="py-8 px-4 text-center mt-auto"
                style={{
                    borderTop: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.textMuted
                }}
            >
                <p className="text-sm">
                    © 2025 EXTRACTOS EUM™ . Todos los derechos reservados.
                </p>
            </footer>
        </div>
    );
}

// Utility component for cards that respect theme
export function ThemedCard({
    children,
    className = '',
    variant = 'primary',
    onClick,
}: {
    children: ReactNode;
    className?: string;
    variant?: 'primary' | 'secondary';
    onClick?: () => void;
}) {
    const { theme } = useTheme();

    return (
        <div
            className={`rounded-xl transition-all duration-200 ${className}`}
            style={{
                backgroundColor: variant === 'primary' ? theme.cardBg : theme.cardBg2,
                border: `1px solid ${theme.border}`,
            }}
            onClick={onClick}
        >
            {children}
        </div>
    );
}

// Utility component for themed buttons
export function ThemedButton({
    children,
    className = '',
    variant = 'primary',
    onClick,
    disabled = false,
    type = 'button',
}: {
    children: ReactNode;
    className?: string;
    variant?: 'primary' | 'secondary' | 'ghost';
    onClick?: () => void;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
}) {
    const { theme } = useTheme();

    const baseStyles = 'px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 justify-center';

    const variantStyles = {
        primary: {
            backgroundColor: theme.accent,
            color: '#ffffff',
            border: 'none',
        },
        secondary: {
            backgroundColor: 'transparent',
            color: theme.text,
            border: `1px solid ${theme.border}`,
        },
        ghost: {
            backgroundColor: 'transparent',
            color: theme.text,
            border: 'none',
        },
    };

    return (
        <button
            type={type}
            className={`${baseStyles} ${className}`}
            style={{
                ...variantStyles[variant],
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={onClick}
            disabled={disabled}
            onMouseEnter={(e) => {
                if (!disabled) {
                    if (variant === 'primary') {
                        e.currentTarget.style.backgroundColor = theme.accentHover;
                    } else {
                        e.currentTarget.style.backgroundColor = `${theme.accent}20`;
                    }
                }
            }}
            onMouseLeave={(e) => {
                if (!disabled) {
                    e.currentTarget.style.backgroundColor = variantStyles[variant].backgroundColor;
                }
            }}
        >
            {children}
        </button>
    );
}

// Utility component for themed inputs
export function ThemedInput({
    className = '',
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
    const { theme } = useTheme();

    return (
        <input
            className={`px-4 py-2 rounded-lg transition-all duration-200 outline-none ${className}`}
            style={{
                backgroundColor: theme.cardBg2,
                color: theme.text,
                border: `1px solid ${theme.border}`,
            }}
            onFocus={(e) => {
                e.currentTarget.style.borderColor = theme.accent;
                e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.accent}30`;
            }}
            onBlur={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.boxShadow = 'none';
            }}
            {...props}
        />
    );
}

// Page header component
export function PageHeader({
    title,
    subtitle,
    action,
}: {
    title: string;
    subtitle?: string;
    action?: ReactNode;
}) {
    const { theme } = useTheme();

    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
                <h1
                    className="text-2xl md:text-3xl font-bold"
                    style={{ color: theme.text }}
                >
                    {title}
                </h1>
                {subtitle && (
                    <p
                        className="mt-1 text-sm md:text-base"
                        style={{ color: theme.textMuted }}
                    >
                        {subtitle}
                    </p>
                )}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
