import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Home, User, Settings, LogOut, ChevronDown, LayoutDashboard, Database, Upload, Shield, Award, Calendar, FileText, Image as ImageIcon, BarChart3, HelpCircle, MessageCircle, FolderOpen, ShoppingBag, Brain, Briefcase, Sun, Moon, Sparkles, ChevronUp, FileCode, Box } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { ROUTES } from '../routes';
import { useAuth } from '../contexts/AuthContext';
import { getNavigationItems } from '../services/navigationService';
import type { NavigationItem } from '../types/navigation';


interface NavItem {
    label: string;
    icon: React.ReactNode;
    href?: string;
    external?: boolean;
    onClick?: () => void;
    children?: NavItem[];
    adminOnly?: boolean;
    authOnly?: boolean;
}

import { UI } from '../telemetry/uiMap';

// Helper to look up testid by route
const getTestIdForRoute = (route: string) => {
    // Basic reverse lookup
    const entry = Object.values(UI).find((e: any) => e.route === route);
    return entry ? entry.testid : undefined;
};


export default function Navbar() {
    const { theme, themeMode, toggleTheme, setThemeMode } = useTheme();
    const { client, isAuthenticated, isSuperAdmin, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});



    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openMenu && menuRefs.current[openMenu]) {
                if (!menuRefs.current[openMenu]?.contains(event.target as Node)) {
                    setOpenMenu(null);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenu]);

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
        setOpenMenu(null);
    }, [location.pathname]);

    const handleLogout = async () => {
        await logout();
        navigate(ROUTES.login);
    };

    const themeIcon = themeMode === 'light' ? <Sun size={20} /> :
        themeMode === 'dark' ? <Moon size={20} /> :
            themeMode === 'tokyo' ? <Sparkles size={20} /> :
                <LucideIcons.Zap size={20} />;

    // Theme options
    const themeOptions = [
        { mode: 'light' as const, label: 'Claro', icon: <Sun size={18} /> },
        { mode: 'dark' as const, label: 'Oscuro', icon: <Moon size={18} /> },
        { mode: 'tokyo' as const, label: 'Tokyo (Blue)', icon: <Sparkles size={18} /> },
        { mode: 'neon' as const, label: 'Neon (Premium)', icon: <LucideIcons.Zap size={18} /> },
    ];

    // State for navigation items
    const [navItems, setNavItems] = useState<NavItem[]>([
        { label: 'Shop', icon: <ShoppingBag size={20} />, href: 'https://extractoseum.com/collections/candy-kush', external: true },
        { label: 'Contacto', icon: <MessageCircle size={20} />, href: 'https://wa.me/message/NJEJOGWKULIQH1', external: true },
        { label: 'Mis COA', icon: <FileText size={20} />, href: 'https://extractoseum.com/pages/coa', external: true },
    ]);
    const [userMenuItems, setUserMenuItems] = useState<NavItem[]>([
        { label: 'Dashboard', icon: <LayoutDashboard size={18} />, href: ROUTES.dashboard, authOnly: true },
        { label: 'Mis Pedidos', icon: <ShoppingBag size={18} />, href: ROUTES.myOrders, authOnly: true },
        { label: 'Mis Carpetas', icon: <FolderOpen size={18} />, href: ROUTES.folders, authOnly: true },
    ]);
    const [adminMenuItems, setAdminMenuItems] = useState<NavItem[]>([
        { label: 'Administrar COAs', icon: <FileText size={18} />, href: ROUTES.adminCoas, adminOnly: true },
        { label: 'Configuracion', icon: <Settings size={18} />, href: ROUTES.settings, adminOnly: true },
    ]);

    useEffect(() => {
        const loadNav = async () => {
            try {
                const res = await getNavigationItems();
                if (res.success) {
                    const buildTree = (items: NavigationItem[]): NavigationItem[] => {
                        const itemMap = new Map<string, NavigationItem>();
                        const roots: NavigationItem[] = [];

                        // First pass: create map and initialize children
                        items.forEach(item => {
                            itemMap.set(item.id, { ...item, children: [] });
                        });

                        // Second pass: link children to parents
                        items.forEach(item => {
                            const node = itemMap.get(item.id)!;
                            if (item.parent_id && itemMap.has(item.parent_id)) {
                                itemMap.get(item.parent_id)!.children!.push(node);
                            } else {
                                roots.push(node);
                            }
                        });

                        // Sort by order_index
                        const sort = (nodes: NavigationItem[]) => {
                            nodes.sort((a, b) => a.order_index - b.order_index);
                            nodes.forEach(node => {
                                if (node.children && node.children.length > 0) sort(node.children);
                            });
                        };
                        sort(roots);

                        return roots;
                    };

                    const transform = (item: NavigationItem): NavItem => {
                        // @ts-ignore
                        const Icon = LucideIcons[item.icon] || LucideIcons.Circle;
                        return {
                            label: item.label,
                            icon: <Icon size={item.type === 'main' ? 20 : 18} />,
                            href: item.href,
                            external: item.is_external,
                            authOnly: item.is_auth_only,
                            adminOnly: item.is_admin_only,
                            children: item.children && item.children.length > 0 ? item.children.map(transform) : undefined
                        };
                    };

                    const allItems = res.items;

                    const mainItems = buildTree(allItems.filter(i => i.type === 'main'));
                    const userItems = buildTree(allItems.filter(i => i.type === 'user'));
                    const adminItems = buildTree(allItems.filter(i => i.type === 'admin'));

                    const main = mainItems.map(transform);
                    const user = userItems.map(transform);
                    const admin = adminItems.map(transform);

                    if (main.length > 0) setNavItems(main);
                    if (user.length > 0) setUserMenuItems(user);
                    if (admin.length > 0) setAdminMenuItems(admin);
                }
            } catch (err) {
                console.error('Failed to load navigation', err);
            }
        };
        loadNav();
    }, []);



    const toggleMenu = (menuId: string) => {
        setOpenMenu(openMenu === menuId ? null : menuId);
    };

    const renderNavLink = (item: NavItem, isMobile = false) => {
        const baseClasses = `flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${isMobile ? 'w-full' : ''
            }`;
        const hoverStyle = {
            backgroundColor: `${theme.accent}20`,
            color: theme.accent,
        };

        if (item.external && item.href) {
            return (
                <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={getTestIdForRoute(item.href)}
                    className={`${baseClasses} text-left w-full`}
                    style={{ color: theme.text }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = hoverStyle.backgroundColor;
                        e.currentTarget.style.color = hoverStyle.color;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = theme.text;
                    }}
                >
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                </a>
            );
        }

        if (item.href) {
            const isActive = location.pathname === item.href;
            const testid = getTestIdForRoute(item.href);
            return (
                <Link
                    key={item.label}
                    to={item.href}
                    data-testid={testid}
                    className={baseClasses}
                    style={{
                        color: isActive ? theme.accent : theme.text,
                        backgroundColor: isActive ? `${theme.accent}20` : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        if (!isActive) {
                            e.currentTarget.style.backgroundColor = hoverStyle.backgroundColor;
                            e.currentTarget.style.color = hoverStyle.color;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isActive) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = theme.text;
                        }
                    }}
                >
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                </Link>
            );
        }

        if (item.onClick) {
            return (
                <button
                    key={item.label}
                    onClick={item.onClick}
                    className={`${baseClasses} text-left`}
                    style={{ color: theme.text }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = hoverStyle.backgroundColor;
                        e.currentTarget.style.color = hoverStyle.color;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = theme.text;
                    }}
                >
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                </button>
            );
        }

        return null;
    };

    const renderDropdownMenu = (
        menuId: string,
        items: NavItem[],
        buttonContent: React.ReactNode,
        buttonLabel: string,
        testId?: string
    ) => (
        <div
            ref={(el) => { menuRefs.current[menuId] = el; }}
            className="relative"
        >
            <button
                onClick={() => toggleMenu(menuId)}
                data-testid={testId}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
                style={{
                    color: openMenu === menuId ? theme.accent : theme.text,
                    backgroundColor: openMenu === menuId ? `${theme.accent}20` : 'transparent',
                }}
                onMouseEnter={(e) => {
                    if (openMenu !== menuId) {
                        e.currentTarget.style.backgroundColor = `${theme.accent}20`;
                    }
                }}
                onMouseLeave={(e) => {
                    if (openMenu !== menuId) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                    }
                }}
                aria-label={buttonLabel}
            >
                {buttonContent}
                <ChevronUp
                    size={16}
                    className={`transition-transform duration-200 ${openMenu === menuId ? '' : 'rotate-180'}`}
                />
            </button>

            <div
                className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[180px] rounded-xl shadow-xl overflow-hidden backdrop-blur-md ${openMenu === menuId ? '' : 'hidden'}`}
                style={{
                    backgroundColor: theme.navBg,
                    border: `1px solid ${theme.border}`,
                }}
            >
                <div className="py-2">
                    {items.map((item) => (
                        <div key={item.label} className="px-2">
                            {renderNavLink(item, true)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <>
            {/* Desktop Floating Navbar - Bottom */}
            <nav
                className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden md:flex items-center gap-1 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md"
                style={{
                    backgroundColor: theme.navBg,
                    border: `1px solid ${theme.border}`,
                    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px ${theme.border}`,
                }}
            >
                {/* Logo/Brand */}
                <Link
                    to={ROUTES.home}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg mr-2"
                    style={{ color: theme.accent }}
                >
                    <Shield size={22} className="fill-current" />
                    <span className="font-bold text-sm">EUM</span>
                </Link>

                <div
                    className="h-6 w-px mx-1"
                    style={{ backgroundColor: theme.border }}
                />

                {/* Main Nav Items */}
                {navItems.filter(item =>
                    (!item.authOnly || isAuthenticated) &&
                    (!item.adminOnly || isSuperAdmin)
                ).map((item) => renderNavLink(item))}

                <div
                    className="h-6 w-px mx-1"
                    style={{ backgroundColor: theme.border }}
                />

                {/* Theme Selector */}
                {renderDropdownMenu(
                    'theme',
                    themeOptions.map((opt) => ({
                        label: opt.label,
                        icon: opt.icon,
                        onClick: () => {
                            setThemeMode(opt.mode);
                            setOpenMenu(null);
                        },
                    })),
                    themeIcon,
                    'Cambiar tema'
                )}

                {/* User/Auth Section */}
                {isAuthenticated ? (
                    <>
                        {/* User Menu */}
                        {renderDropdownMenu(
                            'user',
                            [
                                ...userMenuItems,
                                {
                                    label: 'Cerrar Sesion',
                                    icon: <LogOut size={18} />,
                                    onClick: handleLogout,
                                },
                            ],
                            <User size={20} />,
                            'Menu de usuario',
                            'nav.user.menu_button'
                        )}

                        {/* Admin Menu */}
                        {isSuperAdmin && renderDropdownMenu(
                            'admin',
                            adminMenuItems,
                            <Settings size={20} />,
                            'Menu de administrador',
                            'nav.admin.menu_button'
                        )}
                    </>
                ) : (
                    <Link
                        to={ROUTES.login}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200"
                        style={{
                            backgroundColor: theme.accent,
                            color: '#ffffff',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.accentHover;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = theme.accent;
                        }}
                    >
                        <User size={18} />
                        <span className="text-sm">Entrar</span>
                    </Link>
                )}
            </nav>

            {/* Mobile Navbar - Bottom */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-50 md:hidden backdrop-blur-md"
                style={{
                    backgroundColor: theme.navBg,
                    borderTop: `1px solid ${theme.border}`,
                    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.2)',
                }}
            >
                <div className="flex items-center justify-around px-2 py-3">
                    {/* Home */}
                    <Link
                        to={ROUTES.home}
                        className="flex flex-col items-center gap-1 px-3 py-1"
                        style={{ color: location.pathname === ROUTES.home ? theme.accent : theme.textMuted }}
                    >
                        <Home size={22} />
                        <span className="text-xs">Inicio</span>
                    </Link>

                    {/* Shop */}
                    <a
                        href="https://extractoseum.com/collections/candy-kush"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center gap-1 px-3 py-1"
                        style={{ color: theme.textMuted }}
                    >
                        <ShoppingBag size={22} />
                        <span className="text-xs">Shop</span>
                    </a>

                    {/* COA */}
                    <a
                        href="https://extractoseum.com/pages/coa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center gap-1 px-3 py-1"
                        style={{ color: theme.textMuted }}
                    >
                        <FileText size={22} />
                        <span className="text-xs">COA</span>
                    </a>

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="flex flex-col items-center gap-1 px-3 py-1"
                        style={{ color: theme.textMuted }}
                    >
                        {themeIcon}
                        <span className="text-xs">Tema</span>
                    </button>

                    {/* Menu */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="flex flex-col items-center gap-1 px-3 py-1"
                        style={{ color: mobileMenuOpen ? theme.accent : theme.textMuted }}
                    >
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        <span className="text-xs">Menu</span>
                    </button>
                </div>

                {/* Mobile Menu Expanded */}
                {mobileMenuOpen && (
                    <div
                        className="absolute bottom-full left-0 right-0 max-h-[70vh] overflow-y-auto backdrop-blur-md"
                        style={{
                            backgroundColor: theme.navBg,
                            borderTop: `1px solid ${theme.border}`,
                        }}
                    >
                        <div className="p-4 space-y-2">
                            {/* External Links */}
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider px-3 py-2" style={{ color: theme.textMuted }}>
                                    Extractoseum
                                </p>
                                {navItems.filter(item =>
                                    (!item.authOnly || isAuthenticated) &&
                                    (!item.adminOnly || isSuperAdmin)
                                ).map((item) => renderNavLink(item, true))}
                            </div>

                            {/* Theme Selection */}
                            <div
                                className="h-px my-3"
                                style={{ backgroundColor: theme.border }}
                            />
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider px-3 py-2" style={{ color: theme.textMuted }}>
                                    Tema
                                </p>
                                <div className="flex gap-2 px-3">
                                    {themeOptions.map((opt) => (
                                        <button
                                            key={opt.mode}
                                            onClick={() => setThemeMode(opt.mode)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
                                            style={{
                                                backgroundColor: themeMode === opt.mode ? `${theme.accent}30` : `${theme.cardBg}`,
                                                color: themeMode === opt.mode ? theme.accent : theme.text,
                                                border: `1px solid ${themeMode === opt.mode ? theme.accent : theme.border}`,
                                            }}
                                        >
                                            {opt.icon}
                                            <span className="text-sm">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* User Section */}
                            {isAuthenticated && (
                                <>
                                    <div
                                        className="h-px my-3"
                                        style={{ backgroundColor: theme.border }}
                                    />
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-wider px-3 py-2" style={{ color: theme.textMuted }}>
                                            Mi Cuenta
                                        </p>
                                        {userMenuItems.map((item) => renderNavLink(item, true))}
                                    </div>
                                </>
                            )}

                            {/* Admin Section */}
                            {isSuperAdmin && (
                                <>
                                    <div
                                        className="h-px my-3"
                                        style={{ backgroundColor: theme.border }}
                                    />
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-wider px-3 py-2" style={{ color: theme.textMuted }}>
                                            Administracion
                                        </p>
                                        {adminMenuItems.map((item) => renderNavLink(item, true))}
                                    </div>
                                </>
                            )}

                            {/* Auth Actions */}
                            <div
                                className="h-px my-3"
                                style={{ backgroundColor: theme.border }}
                            />
                            {isAuthenticated ? (
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 w-full px-3 py-3 rounded-lg"
                                    style={{
                                        backgroundColor: `${theme.accent}20`,
                                        color: theme.accent,
                                    }}
                                >
                                    <LogOut size={20} />
                                    <span className="font-medium">Cerrar Sesion</span>
                                </button>
                            ) : (
                                <Link
                                    to={ROUTES.login}
                                    className="flex items-center gap-2 w-full px-3 py-3 rounded-lg justify-center"
                                    style={{
                                        backgroundColor: theme.accent,
                                        color: '#ffffff',
                                    }}
                                >
                                    <User size={20} />
                                    <span className="font-medium">Iniciar Sesion</span>
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            {/* Spacer for mobile to prevent content from being hidden behind navbar */}
            <div className="h-20 md:h-0" />


        </>
    );
}
