import React, { useState, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { getNavigationItems, createNavigationItem, updateNavigationItem, deleteNavigationItem, reorderNavigationItems } from '../services/navigationService';
import type { NavigationItem } from '../types/navigation';
import LayoutComponent from '../components/Layout';
import { Screen } from '../telemetry/Screen';

// Safely get icon component or fallback
const getIconComponent = (iconName: string) => {
    if (!iconName) return LucideIcons.Circle; // Default
    // @ts-ignore
    const Icon = LucideIcons[iconName] || LucideIcons[iconName.charAt(0).toUpperCase() + iconName.slice(1)]; // Try PascalCase
    return Icon || LucideIcons.HelpCircle || LucideIcons.Circle;
};

export default function NavigationManagement() {
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'main' | 'user' | 'admin'>('main');
    const [items, setItems] = useState<NavigationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingItem, setEditingItem] = useState<NavigationItem | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form state
    const [formData, setFormData] = useState<Partial<NavigationItem>>({
        label: '',
        icon: 'Circle',
        href: '',
        type: 'main',
        parent_id: '',
        order_index: 0,
        is_external: false,
        is_auth_only: false,
        is_admin_only: false
    });

    useEffect(() => {
        loadItems();
    }, [activeTab]);

    const loadItems = async () => {
        setLoading(true);
        try {
            const res = await getNavigationItems(activeTab, true);
            if (res.success) {
                setItems(res.items);
            }
        } catch (error) {
            console.error('Failed to load items', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            if (editingItem) {
                await updateNavigationItem(editingItem.id, { ...formData, type: activeTab });
            } else {
                await createNavigationItem({ ...formData, type: activeTab } as any);
            }
            setEditingItem(null);
            setIsCreating(false);
            setFormData({
                label: '',
                icon: 'Circle',
                href: '',
                type: activeTab,
                order_index: items.length,
                is_external: false,
                is_auth_only: false,
                is_admin_only: false
            });
            loadItems();
        } catch (error) {
            console.error('Failed to save', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this item?')) {
            await deleteNavigationItem(id);
            loadItems();
        }
    };

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === items.length - 1) return;

        const newItems = [...items];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Swap
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];

        // Update order_index locally
        const updates = newItems.map((item, idx) => ({ id: item.id, order_index: idx }));

        setItems(newItems); // Optimistic update
        await reorderNavigationItems(updates);
    };

    // Icon Selector Component
    const IconSelector = () => {
        const [filter, setFilter] = useState('');
        const [isOpen, setIsOpen] = useState(false);

        // Memoize or simple filter on render
        const iconList = Object.keys(LucideIcons)
            .filter(name => name.toLowerCase().includes(filter.toLowerCase()) && (LucideIcons as any)[name]?.render) // Check if it's a component
            .slice(0, 50);

        const SelectedIcon = getIconComponent(formData.icon!);

        return (
            <div className="relative">
                <label className="text-xs font-semibold mb-1 block" style={{ color: theme.textMuted }}>Icono</label>
                <div
                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer border"
                    style={{
                        backgroundColor: theme.bg,
                        borderColor: theme.border,
                        color: theme.text
                    }}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <SelectedIcon size={20} />
                    <span>{formData.icon}</span>
                </div>

                {isOpen && (
                    <div className="absolute top-full left-0 z-50 w-64 p-2 mt-1 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                    >
                        <input
                            autoFocus
                            placeholder="Buscar icono..."
                            className="w-full p-2 mb-2 rounded-lg text-sm bg-transparent border outline-none"
                            style={{ borderColor: theme.border, color: theme.text }}
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                        <div className="grid grid-cols-4 gap-2">
                            {iconList.map(iconName => {
                                // @ts-ignore
                                const Icon = LucideIcons[iconName];
                                return (
                                    <button
                                        key={iconName}
                                        className="p-2 rounded hover:bg-white/10 flex justify-center items-center"
                                        onClick={() => {
                                            setFormData({ ...formData, icon: iconName });
                                            setIsOpen(false);
                                        }}
                                        title={iconName}
                                    >
                                        <Icon size={20} color={theme.text} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <Screen id="NavigationManagement">
            <LayoutComponent>
                <div className="min-h-screen p-6 pb-24">
                    <div className="max-w-5xl mx-auto space-y-6">
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-bold" style={{ color: theme.text }}>Navegación</h1>
                                <p style={{ color: theme.textMuted }}>Administra los menús y enlaces de la aplicación</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsCreating(true);
                                    setEditingItem(null);
                                    setFormData({
                                        label: '',
                                        icon: 'Circle',
                                        href: '',
                                        type: activeTab,
                                        order_index: items.length,
                                        is_external: false,
                                        is_auth_only: false,
                                        is_admin_only: activeTab === 'admin'
                                    });
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium shadow-lg hover:brightness-110 transition-all"
                                style={{ backgroundColor: theme.accent }}
                            >
                                <LucideIcons.Plus size={20} />
                                Nuevo enlace
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 p-1 rounded-xl w-full md:w-fit" style={{ backgroundColor: theme.cardBg2 }}>
                            {[
                                { id: 'main', label: 'Principal', icon: LucideIcons.Layout },
                                { id: 'user', label: 'Usuario', icon: LucideIcons.User },
                                { id: 'admin', label: 'Admin', icon: LucideIcons.Settings },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all ${activeTab === tab.id ? 'shadow-sm' : ''}`}
                                    style={{
                                        backgroundColor: activeTab === tab.id ? theme.bg : 'transparent',
                                        color: activeTab === tab.id ? theme.text : theme.textMuted
                                    }}
                                >
                                    <tab.icon size={18} />
                                    <span className="font-medium">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                        >
                            {loading ? (
                                <div className="p-10 text-center text-gray-500">Cargando...</div>
                            ) : items.length === 0 ? (
                                <div className="p-10 text-center" style={{ color: theme.textMuted }}>
                                    No hay elementos en este menú.
                                </div>
                            ) : (
                                <div className="divide-y" style={{ borderColor: theme.border }}>
                                    {items.map((item, idx) => {
                                        const ItemIcon = getIconComponent(item.icon);
                                        return (
                                            <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        onClick={() => handleMove(idx, 'up')}
                                                        disabled={idx === 0}
                                                        className={`p-1 rounded hover:bg-white/10 ${idx === 0 ? 'opacity-30' : ''}`}
                                                    >
                                                        <LucideIcons.MoveUp size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleMove(idx, 'down')}
                                                        disabled={idx === items.length - 1}
                                                        className={`p-1 rounded hover:bg-white/10 ${idx === items.length - 1 ? 'opacity-30' : ''}`}
                                                    >
                                                        <LucideIcons.MoveDown size={16} />
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5">
                                                    <ItemIcon size={20} color={theme.accent} />
                                                </div>

                                                <div className="flex-1">
                                                    <h3 className="font-semibold" style={{ color: theme.text }}>{item.label}</h3>
                                                    <div className="flex items-center gap-3 text-xs mt-1" style={{ color: theme.textMuted }}>
                                                        <code className="bg-black/20 px-1 rounded">{item.href}</code>
                                                        {item.is_external && <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">Externo</span>}
                                                        {item.is_admin_only && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-500">Admin</span>}
                                                        {item.is_auth_only && <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-500">Auth</span>}
                                                        {item.parent_id && <span className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300">Submenú</span>}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingItem(item);
                                                            setFormData(item);
                                                            setIsCreating(true);
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors"
                                                    >
                                                        <LucideIcons.Edit2 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                                                    >
                                                        <LucideIcons.Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Create/Edit Modal */}
                    {isCreating && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                            <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
                                style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                            >
                                <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                                    <h2 className="text-xl font-semibold" style={{ color: theme.text }}>
                                        {editingItem ? 'Editar Enlace' : 'Nuevo Enlace'}
                                    </h2>
                                    <button onClick={() => setIsCreating(false)}><LucideIcons.X size={20} /></button>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold" style={{ color: theme.textMuted }}>Etiqueta</label>
                                            <input
                                                className="w-full p-2 rounded-lg bg-transparent border outline-none focus:ring-2"
                                                style={{ borderColor: theme.border, color: theme.text }}
                                                value={formData.label}
                                                onChange={e => setFormData({ ...formData, label: e.target.value })}
                                                placeholder="Ej: Inicio"
                                            />
                                        </div>
                                        <IconSelector />
                                    </div>



                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold" style={{ color: theme.textMuted }}>Padre (Opcional - Creará submenú)</label>
                                        <select
                                            className="w-full p-2 rounded-lg bg-transparent border outline-none focus:ring-2"
                                            style={{ borderColor: theme.border, color: theme.text }}
                                            value={formData.parent_id || ''}
                                            onChange={e => setFormData({ ...formData, parent_id: e.target.value || undefined })}
                                        >
                                            <option value="" className="bg-black text-white">-- Ninguno --</option>
                                            {items
                                                .filter(i => i.id !== editingItem?.id && !i.parent_id) // Prevent self-selection and deep nesting for now
                                                .map(i => (
                                                    <option key={i.id} value={i.id} className="bg-black text-white">
                                                        {i.label}
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold" style={{ color: theme.textMuted }}>Ruta / URL</label>
                                        <input
                                            className="w-full p-2 rounded-lg bg-transparent border outline-none focus:ring-2"
                                            style={{ borderColor: theme.border, color: theme.text }}
                                            value={formData.href}
                                            onChange={e => setFormData({ ...formData, href: e.target.value })}
                                            placeholder="Ej: /home o https://google.com"
                                        />
                                    </div>

                                    <div className="flex gap-4 pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_external}
                                                onChange={e => setFormData({ ...formData, is_external: e.target.checked })}
                                                className="rounded border-gray-500"
                                            />
                                            <span className="text-sm" style={{ color: theme.text }}>Externo</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_auth_only}
                                                onChange={e => setFormData({ ...formData, is_auth_only: e.target.checked })}
                                                className="rounded border-gray-500"
                                            />
                                            <span className="text-sm" style={{ color: theme.text }}>Requiere Auth</span>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_admin_only}
                                                onChange={e => setFormData({ ...formData, is_admin_only: e.target.checked })}
                                                className="rounded border-gray-500"
                                            />
                                            <span className="text-sm" style={{ color: theme.text }}>Solo Admin</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: theme.border, backgroundColor: theme.cardBg2 }}>
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="px-4 py-2 rounded-lg font-medium transition-colors hover:bg-white/10"
                                        style={{ color: theme.text }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-6 py-2 rounded-lg font-medium text-white shadow-lg transition-transform active:scale-95"
                                        style={{ backgroundColor: theme.accent }}
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </LayoutComponent >
        </Screen>
    );
}
