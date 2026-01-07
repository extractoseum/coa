import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Send, Bell, Users, History, BarChart3, Loader2, Calendar, X, Image as ImageIcon, Check, AlertCircle, RefreshCw, MessageCircle, Search, User, Mail } from 'lucide-react';
import { authFetch, useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout, { ThemedCard } from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface NotificationHistory {
    id: string;
    title: string;
    message: string;
    target_type: 'all' | 'tag' | 'segment' | 'individual' | 'tier';
    target_value?: string;
    image_url?: string;
    status: 'pending' | 'scheduled' | 'sent' | 'failed' | 'cancelled';
    sent_count: number;
    delivered_count: number;
    opened_count: number;
    scheduled_for?: string;
    sent_at?: string;
    created_at: string;
    clients?: { name: string; email: string };
}

interface Stats {
    totalDevices: number;
    notificationsSent30Days: number;
    totalRecipients: number;
    totalDelivered: number;
    totalOpened: number;
    openRate: string;
}

const API_BASE = '/api/v1';

// Interface for tag with count from Shopify
interface TagWithCount {
    tag: string;
    count: number;
}

// Tag Autocomplete Component
interface TagAutocompleteProps {
    tags: TagWithCount[];
    value: string;
    onChange: (value: string) => void;
    loading: boolean;
    onRefresh: () => void;
}

function TagAutocomplete({ tags, value, onChange, loading, onRefresh }: TagAutocompleteProps) {
    const { theme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Filter tags based on input (case-insensitive, partial match)
    const filteredTags = useMemo(() => {
        if (!value.trim()) {
            // Show all tags sorted by count when empty
            return [...tags].sort((a, b) => b.count - a.count).slice(0, 50);
        }
        const search = value.toLowerCase();
        return tags
            .filter(t => t.tag.toLowerCase().includes(search))
            .sort((a, b) => {
                // Prioritize tags that start with the search term
                const aStarts = a.tag.toLowerCase().startsWith(search);
                const bStarts = b.tag.toLowerCase().startsWith(search);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return b.count - a.count;
            })
            .slice(0, 20);
    }, [tags, value]);

    // Get exact match for selected tag
    const selectedTag = useMemo(() => {
        return tags.find(t => t.tag.toLowerCase() === value.toLowerCase());
    }, [tags, value]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen && e.key === 'ArrowDown') {
            setIsOpen(true);
            return;
        }

        if (isOpen) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setHighlightedIndex(prev =>
                        prev < filteredTags.length - 1 ? prev + 1 : prev
                    );
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && filteredTags[highlightedIndex]) {
                        onChange(filteredTags[highlightedIndex].tag);
                        setIsOpen(false);
                    }
                    break;
                case 'Escape':
                    setIsOpen(false);
                    break;
            }
        }
    };

    // Scroll highlighted item into view
    useEffect(() => {
        if (listRef.current && highlightedIndex >= 0) {
            const item = listRef.current.children[highlightedIndex] as HTMLElement;
            item?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
                listRef.current && !listRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Tag</label>
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => {
                            onChange(e.target.value);
                            setIsOpen(true);
                            setHighlightedIndex(-1);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                        placeholder={loading ? 'Cargando tags...' : 'Escribe para buscar un tag...'}
                        className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                        style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                    />

                    {/* Dropdown */}
                    {isOpen && !loading && filteredTags.length > 0 && (
                        <ul
                            ref={listRef}
                            className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg shadow-lg"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                        >
                            {filteredTags.map((item, index) => (
                                <li
                                    key={item.tag}
                                    onClick={() => {
                                        onChange(item.tag);
                                        setIsOpen(false);
                                    }}
                                    className="px-3 py-2 cursor-pointer flex justify-between items-center"
                                    style={{
                                        backgroundColor: index === highlightedIndex ? `${theme.accent}20` : 'transparent',
                                        color: item.tag.toLowerCase() === value.toLowerCase() ? theme.accent : theme.text,
                                        fontWeight: item.tag.toLowerCase() === value.toLowerCase() ? 500 : 400
                                    }}
                                >
                                    <span className="truncate">{item.tag}</span>
                                    <span className="text-xs ml-2 flex-shrink-0" style={{ color: theme.textMuted }}>
                                        {item.count} usuarios
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* No results message */}
                    {isOpen && !loading && value && filteredTags.length === 0 && (
                        <div
                            className="absolute z-50 w-full mt-1 p-3 rounded-lg shadow-lg text-sm"
                            style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMuted }}
                        >
                            No se encontraron tags con "{value}"
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                    title="Actualizar tags desde Shopify"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Selected tag info */}
            {selectedTag && (
                <p className="text-xs mt-1" style={{ color: theme.accent }}>
                    ✓ {selectedTag.count} usuarios recibirán esta notificación
                </p>
            )}
            {value && !selectedTag && (
                <p className="text-xs text-amber-500 mt-1">
                    ⚠ Tag no encontrado - verifica el nombre exacto
                </p>
            )}
            <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                {tags.length} tags disponibles
            </p>
        </div>
    );
}

// Membership tiers
const MEMBERSHIP_TIERS = [
    { value: 'partner', label: 'Partner' },
    { value: 'gold', label: 'Gold' },
    { value: 'platinum', label: 'Platinum' },
];

// Interface for customer search result
interface CustomerSearchResult {
    shopify_id: number;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    tags: string | null;
}

// Customer Search Component
interface CustomerSearchProps {
    value: CustomerSearchResult | null;
    onChange: (customer: CustomerSearchResult | null) => void;
}

function CustomerSearch({ value, onChange }: CustomerSearchProps) {
    const { theme } = useTheme();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CustomerSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const syncCustomers = async () => {
        setSyncing(true);
        setSyncMessage(null);
        try {
            const response = await authFetch(`${API_BASE}/push/customers/sync`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                setSyncMessage('Sincronizacion iniciada. Puede tardar unos minutos...');
            } else {
                setSyncMessage('Error: ' + (data.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Error syncing customers:', error);
            setSyncMessage('Error de conexion');
        } finally {
            setSyncing(false);
        }
    };

    const searchCustomers = async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const response = await authFetch(`${API_BASE}/push/customers/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            if (data.success) {
                setResults(data.customers || []);
            }
        } catch (error) {
            console.error('Error searching customers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newQuery = e.target.value;
        setQuery(newQuery);
        setIsOpen(true);

        // Debounce search
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }
        searchTimeout.current = setTimeout(() => {
            searchCustomers(newQuery);
        }, 300);
    };

    const selectCustomer = (customer: CustomerSearchResult) => {
        onChange(customer);
        setQuery(`${customer.first_name || ''} ${customer.last_name || ''} - ${customer.email || customer.phone || ''}`);
        setIsOpen(false);
    };

    const clearSelection = () => {
        onChange(null);
        setQuery('');
        setResults([]);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(e.target as Node) &&
                listRef.current && !listRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                <User className="w-4 h-4 inline-block mr-1" />
                Buscar Usuario
            </label>
            <div className="relative">
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: theme.textMuted }} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleInputChange}
                            onFocus={() => setIsOpen(true)}
                            placeholder="Buscar por nombre, email o telefono..."
                            className="w-full pl-10 pr-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                        />
                        {loading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: theme.textMuted }} />
                        )}
                    </div>
                    {value && (
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="px-3 py-2 rounded-lg transition-colors"
                            style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                            title="Limpiar seleccion"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Dropdown results */}
                {isOpen && results.length > 0 && (
                    <ul
                        ref={listRef}
                        className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-lg shadow-lg"
                        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                    >
                        {results.map((customer) => (
                            <li
                                key={customer.shopify_id}
                                onClick={() => selectCustomer(customer)}
                                className="px-3 py-2 cursor-pointer transition-colors"
                                style={{ color: theme.text }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}15`}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 flex-shrink-0" style={{ color: theme.textMuted }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                            {customer.first_name || ''} {customer.last_name || ''}
                                        </p>
                                        <p className="text-xs truncate" style={{ color: theme.textMuted }}>
                                            {customer.email || 'Sin email'} · {customer.phone || 'Sin telefono'}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {/* No results */}
                {isOpen && query.length >= 2 && !loading && results.length === 0 && (
                    <div
                        className="absolute z-50 w-full mt-1 p-3 rounded-lg shadow-lg text-sm"
                        style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMuted }}
                    >
                        <p>No se encontraron usuarios con "{query}"</p>
                        <button
                            type="button"
                            onClick={syncCustomers}
                            disabled={syncing}
                            className="mt-2 text-xs underline"
                            style={{ color: theme.accent }}
                        >
                            {syncing ? 'Sincronizando...' : 'Sincronizar clientes de Shopify'}
                        </button>
                    </div>
                )}
            </div>

            {/* Sync message */}
            {syncMessage && (
                <div className="mt-2 p-2 rounded-lg" style={{ backgroundColor: `${theme.accent}15`, border: `1px solid ${theme.accent}40` }}>
                    <p className="text-xs" style={{ color: theme.accent }}>{syncMessage}</p>
                </div>
            )}

            {/* Selected customer info */}
            {value && (
                <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: `${theme.accent}15`, border: `1px solid ${theme.accent}40` }}>
                    <p className="text-sm font-medium" style={{ color: theme.accent }}>
                        Usuario seleccionado:
                    </p>
                    <p className="text-sm" style={{ color: theme.accent }}>
                        {value.first_name} {value.last_name}
                    </p>
                    {value.email && <p className="text-xs" style={{ color: theme.accent }}>Email: {value.email}</p>}
                    {value.phone && <p className="text-xs" style={{ color: theme.accent }}>Tel: {value.phone}</p>}
                </div>
            )}
        </div>
    );
}

export default function PushNotificationPanel() {
    const { theme } = useTheme();
    const { isSuperAdmin } = useAuth();

    const [activeTab, setActiveTab] = useState<'send' | 'history' | 'stats'>('send');

    // Send form state
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [targetType, setTargetType] = useState<'all' | 'tag' | 'tier' | 'segment' | 'individual'>('all');
    const [targetValue, setTargetValue] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
    const [scheduledFor, setScheduledFor] = useState('');
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string; recipients?: number } | null>(null);

    // Channel selection state
    const [channels, setChannels] = useState<string[]>(['push']);
    const [whatsappStatus, setWhatsappStatus] = useState<{ connected: boolean; configured: boolean; phone?: string } | null>(null);
    const [emailStatus, setEmailStatus] = useState<{ configured: boolean; address?: string } | null>(null);

    // Smart Option D: Vibe-Based Filtering state
    const [vibeFilterEnabled, setVibeFilterEnabled] = useState(false);
    const [excludeFrustrated, setExcludeFrustrated] = useState(true);  // Default: exclude frustrated users from promos
    const [targetExcited, setTargetExcited] = useState(false);
    const [minIntentLevel, setMinIntentLevel] = useState<'all' | 'warm' | 'hot'>('all');

    // History state
    const [history, setHistory] = useState<NotificationHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(0);

    // Stats state
    const [stats, setStats] = useState<Stats | null>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Shopify tags state
    const [shopifyTags, setShopifyTags] = useState<TagWithCount[]>([]);
    const [loadingTags, setLoadingTags] = useState(false);
    const [refreshProgress, setRefreshProgress] = useState<{
        isRefreshing: boolean;
        currentPage: number;
        estimatedTotalPages: number;
        customersProcessed: number;
        tagsFound: number;
    } | null>(null);

    // Load Shopify tags, WhatsApp and Email status on mount
    useEffect(() => {
        loadShopifyTags();
        loadWhatsAppStatus();
        loadEmailStatus();
    }, []);

    const loadWhatsAppStatus = async () => {
        try {
            const response = await authFetch(`${API_BASE}/push/whatsapp/status`);
            const data = await response.json();
            if (data.success) {
                setWhatsappStatus(data.whatsapp);
            }
        } catch (error) {
            console.error('Error loading WhatsApp status:', error);
        }
    };

    const loadEmailStatus = async () => {
        try {
            const response = await authFetch(`${API_BASE}/push/email/status`);
            const data = await response.json();
            if (data.success) {
                setEmailStatus(data.email);
            }
        } catch (error) {
            console.error('Error loading Email status:', error);
        }
    };

    const toggleChannel = (channel: string, enabled: boolean) => {
        if (enabled) {
            setChannels(prev => [...prev, channel]);
        } else {
            setChannels(prev => prev.filter(c => c !== channel));
        }
    };

    // Poll for refresh progress when refreshing
    useEffect(() => {
        if (!refreshProgress?.isRefreshing) return;

        const interval = setInterval(async () => {
            try {
                const response = await authFetch(`${API_BASE}/push/tags/status`);
                const data = await response.json();
                if (data.success) {
                    setRefreshProgress(data.progress);
                    // If finished, reload tags
                    if (!data.progress.isRefreshing) {
                        loadShopifyTags();
                    }
                }
            } catch (error) {
                console.error('Error checking refresh status:', error);
            }
        }, 2000); // Check every 2 seconds

        return () => clearInterval(interval);
    }, [refreshProgress?.isRefreshing]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        } else if (activeTab === 'stats') {
            loadStats();
        }
    }, [activeTab]);

    const loadShopifyTags = async () => {
        setLoadingTags(true);
        try {
            // First check refresh status
            const statusResponse = await authFetch(`${API_BASE}/push/tags/status`);
            const statusData = await statusResponse.json();
            if (statusData.success && statusData.progress) {
                setRefreshProgress(statusData.progress);
            }

            // Then load tags
            const response = await authFetch(`${API_BASE}/push/tags`);
            const data = await response.json();
            if (data.success) {
                setShopifyTags(data.tags);
            }
        } catch (error) {
            console.error('Error loading Shopify tags:', error);
        } finally {
            setLoadingTags(false);
        }
    };

    const refreshShopifyTags = async () => {
        try {
            const response = await authFetch(`${API_BASE}/push/tags/refresh`, { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                setRefreshProgress(data.progress);
                // Tags will be loaded when refresh completes (via polling)
            } else {
                alert('Error actualizando tags: ' + (data.error || 'Error desconocido'));
            }
        } catch (error) {
            console.error('Error refreshing Shopify tags:', error);
            alert('Error actualizando tags desde Shopify');
        }
    };

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const response = await authFetch(`${API_BASE}/push/history?limit=20&offset=${historyPage * 20}`);
            const data = await response.json();
            if (data.success) {
                setHistory(data.notifications);
                setHistoryTotal(data.total);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const loadStats = async () => {
        setLoadingStats(true);
        try {
            const response = await authFetch(`${API_BASE}/push/stats`);
            const data = await response.json();
            if (data.success) {
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        } finally {
            setLoadingStats(false);
        }
    };

    const handleSend = async () => {
        if (!title.trim() || !message.trim()) {
            setSendResult({ success: false, message: 'Titulo y mensaje son requeridos' });
            return;
        }

        if (targetType === 'individual' && !selectedCustomer) {
            setSendResult({ success: false, message: 'Selecciona un usuario' });
            return;
        }

        if (targetType !== 'all' && targetType !== 'individual' && !targetValue) {
            setSendResult({ success: false, message: 'Selecciona un valor para la audiencia' });
            return;
        }

        if (channels.length === 0) {
            setSendResult({ success: false, message: 'Selecciona al menos un canal de envío' });
            return;
        }

        setSending(true);
        setSendResult(null);

        try {
            // Build target value based on type
            let finalTargetValue = targetValue;
            if (targetType === 'individual' && selectedCustomer) {
                // For individual, send phone number for WhatsApp or email for identification
                finalTargetValue = selectedCustomer.phone || selectedCustomer.email || String(selectedCustomer.shopify_id);
            }

            // Build vibe filters if enabled (Smart Option D)
            const vibeFilters = vibeFilterEnabled ? {
                excludeVibeCategories: excludeFrustrated ? ['frustrated'] : undefined,
                includeVibeCategories: targetExcited ? ['excited', 'satisfied'] : undefined,
                minIntentScore: minIntentLevel === 'hot' ? 70 : minIntentLevel === 'warm' ? 40 : undefined
            } : undefined;

            const response = await authFetch(`${API_BASE}/push/send`, {
                method: 'POST',
                body: JSON.stringify({
                    title: title.trim(),
                    message: message.trim(),
                    targetType,
                    targetValue: targetType === 'all' ? undefined : finalTargetValue,
                    imageUrl: imageUrl.trim() || undefined,
                    scheduledFor: scheduledFor || undefined,
                    channels,
                    // Include full customer data for individual targeting
                    individualCustomer: targetType === 'individual' ? selectedCustomer : undefined,
                    // Smart Option D: Vibe-Based Filtering
                    vibeFilters
                })
            });

            const data = await response.json();

            if (data.success) {
                // Build result message
                let resultMsg = scheduledFor ? 'Notificacion programada' : 'Notificacion enviada';
                if (data.push?.recipients) {
                    resultMsg += ` (Push: ${data.push.recipients} destinatarios)`;
                }
                if (data.whatsapp?.queued) {
                    resultMsg += ' + WhatsApp en cola';
                }

                setSendResult({
                    success: true,
                    message: resultMsg,
                    recipients: data.push?.recipients
                });
                // Clear form
                setTitle('');
                setMessage('');
                setImageUrl('');
                setTargetType('all');
                setTargetValue('');
                setSelectedCustomer(null);
                setScheduledFor('');
                setChannels(['push']);
            } else {
                setSendResult({ success: false, message: data.error || 'Error al enviar' });
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            setSendResult({ success: false, message: 'Error de conexion' });
        } finally {
            setSending(false);
        }
    };

    const cancelScheduledNotification = async (notificationId: string) => {
        try {
            const response = await authFetch(`${API_BASE}/push/cancel/${notificationId}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                loadHistory(); // Reload
            }
        } catch (error) {
            console.error('Error cancelling notification:', error);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            sent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
            cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
        };
        const labels: Record<string, string> = {
            sent: 'Enviada',
            scheduled: 'Programada',
            pending: 'Pendiente',
            failed: 'Fallida',
            cancelled: 'Cancelada'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
                {labels[status] || status}
            </span>
        );
    };

    const getTargetLabel = (type: string, value?: string) => {
        switch (type) {
            case 'all': return 'Todos los usuarios';
            case 'tag': return `Tag: ${value}`;
            case 'tier': return `Nivel: ${value}`;
            case 'segment': return `Segmento: ${value}`;
            case 'individual':
                if (selectedCustomer) {
                    return `Usuario: ${selectedCustomer.first_name || ''} ${selectedCustomer.last_name || ''}`.trim() || 'Usuario individual';
                }
                return 'Usuario individual';
            default: return type;
        }
    };

    if (!isSuperAdmin) {
        return (
            <Screen id="PushNotificationPanel_Restricted">
                <Layout>
                    <div className="max-w-4xl mx-auto py-16 text-center">
                        <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Acceso Restringido</h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Solo administradores pueden acceder a esta seccion.
                        </p>
                        <Link to="/" className="mt-4 inline-block text-emerald-600 hover:underline">
                            Volver al inicio
                        </Link>
                    </div>
                </Layout>
            </Screen>
        );
    }

    return (
        <Screen id="PushNotificationPanel">
            <Layout>
                <div className="max-w-6xl mx-auto px-4 py-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <Link
                                to="/admin/coas"
                                className="p-2 rounded-lg transition-colors"
                                style={{ color: theme.text }}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
                                    <Bell className="w-6 h-6" style={{ color: theme.accent }} />
                                    Push Notifications
                                </h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>
                                    Envia notificaciones a tus usuarios
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 border-b" style={{ borderColor: theme.border }}>
                        <button
                            onClick={() => setActiveTab('send')}
                            className="px-4 py-2 font-medium transition-colors border-b-2 -mb-px"
                            style={{
                                borderColor: activeTab === 'send' ? theme.accent : 'transparent',
                                color: activeTab === 'send' ? theme.accent : theme.textMuted
                            }}
                        >
                            <Send className="w-4 h-4 inline-block mr-2" />
                            Enviar
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className="px-4 py-2 font-medium transition-colors border-b-2 -mb-px"
                            style={{
                                borderColor: activeTab === 'history' ? theme.accent : 'transparent',
                                color: activeTab === 'history' ? theme.accent : theme.textMuted
                            }}
                        >
                            <History className="w-4 h-4 inline-block mr-2" />
                            Historial
                        </button>
                        <button
                            onClick={() => setActiveTab('stats')}
                            className="px-4 py-2 font-medium transition-colors border-b-2 -mb-px"
                            style={{
                                borderColor: activeTab === 'stats' ? theme.accent : 'transparent',
                                color: activeTab === 'stats' ? theme.accent : theme.textMuted
                            }}
                        >
                            <BarChart3 className="w-4 h-4 inline-block mr-2" />
                            Estadisticas
                        </button>
                    </div>

                    {/* Send Tab */}
                    {activeTab === 'send' && (
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Form */}
                            <ThemedCard className="p-6">
                                <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>Nueva Notificacion</h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Titulo *</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="Ej: Nuevo COA disponible!"
                                            maxLength={60}
                                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                        />
                                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>{title.length}/60</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Mensaje *</label>
                                        <textarea
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="Escribe el mensaje de la notificacion..."
                                            rows={3}
                                            maxLength={200}
                                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                        />
                                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>{message.length}/200</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                                            <ImageIcon className="w-4 h-4 inline-block mr-1" />
                                            Imagen (opcional)
                                        </label>
                                        <input
                                            type="url"
                                            value={imageUrl}
                                            onChange={(e) => setImageUrl(e.target.value)}
                                            placeholder="https://..."
                                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                        />
                                    </div>

                                    {/* Channel Selection */}
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                                            <Send className="w-4 h-4 inline-block mr-1" />
                                            Canales de envio *
                                        </label>
                                        <div className="flex flex-wrap gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer" style={{ color: theme.text }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.includes('push')}
                                                    onChange={(e) => toggleChannel('push', e.target.checked)}
                                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                                    style={{ borderColor: theme.border }}
                                                />
                                                <Bell className="w-4 h-4 text-blue-500" />
                                                <span>Push Notification</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer" style={{ color: theme.text }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.includes('whatsapp')}
                                                    onChange={(e) => toggleChannel('whatsapp', e.target.checked)}
                                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                                    style={{ borderColor: theme.border }}
                                                />
                                                <MessageCircle className="w-4 h-4 text-green-500" />
                                                <span>WhatsApp</span>
                                                {whatsappStatus?.connected && (
                                                    <span className="text-xs text-green-500 font-medium">Conectado</span>
                                                )}
                                                {whatsappStatus && !whatsappStatus.connected && whatsappStatus.configured && (
                                                    <span className="text-xs text-amber-500 font-medium">Desconectado</span>
                                                )}
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer" style={{ color: theme.text }}>
                                                <input
                                                    type="checkbox"
                                                    checked={channels.includes('email')}
                                                    onChange={(e) => toggleChannel('email', e.target.checked)}
                                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                                                    style={{ borderColor: theme.border }}
                                                />
                                                <Mail className="w-4 h-4 text-purple-500" />
                                                <span>Email</span>
                                                {emailStatus?.configured && (
                                                    <span className="text-xs text-purple-500 font-medium">{emailStatus.address}</span>
                                                )}
                                                {emailStatus && !emailStatus.configured && (
                                                    <span className="text-xs text-amber-500 font-medium">No configurado</span>
                                                )}
                                            </label>
                                        </div>

                                        {channels.includes('whatsapp') && (
                                            <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: '#f59e0b20', border: '1px solid #f59e0b40' }}>
                                                <p className="text-sm text-amber-500">
                                                    WhatsApp enviara a usuarios con telefono registrado en Shopify.
                                                    Rate limiting: 3-8s entre mensajes + pausa cada 10 para evitar bloqueos.
                                                </p>
                                            </div>
                                        )}

                                        {channels.includes('email') && (
                                            <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: '#a855f720', border: '1px solid #a855f740' }}>
                                                <p className="text-sm text-purple-500">
                                                    Email marketing via ara@extractoseum.com a usuarios con email en Shopify.
                                                    Rate limiting automatico para proteger la reputacion del dominio.
                                                </p>
                                            </div>
                                        )}

                                        {channels.length === 0 && (
                                            <p className="text-sm text-red-500 mt-1">Selecciona al menos un canal</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                                            <Users className="w-4 h-4 inline-block mr-1" />
                                            Audiencia *
                                        </label>
                                        <select
                                            value={targetType}
                                            onChange={(e) => {
                                                setTargetType(e.target.value as any);
                                                setTargetValue('');
                                                setSelectedCustomer(null);
                                            }}
                                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                        >
                                            <option value="all">Todos los usuarios</option>
                                            <option value="individual">Usuario especifico</option>
                                            <option value="tag">Por Tag de Shopify</option>
                                            <option value="tier">Por Nivel de Membresia</option>
                                        </select>
                                    </div>

                                    {targetType === 'individual' && (
                                        <CustomerSearch
                                            value={selectedCustomer}
                                            onChange={setSelectedCustomer}
                                        />
                                    )}

                                    {targetType === 'tag' && (
                                        <>
                                            <TagAutocomplete
                                                tags={shopifyTags}
                                                value={targetValue}
                                                onChange={setTargetValue}
                                                loading={loadingTags || (refreshProgress?.isRefreshing ?? false)}
                                                onRefresh={refreshShopifyTags}
                                            />
                                            {/* Progress bar for refresh */}
                                            {refreshProgress?.isRefreshing && (
                                                <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: '#3b82f620', border: '1px solid #3b82f640' }}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                                        <span className="text-sm font-medium text-blue-500">
                                                            Actualizando tags desde Shopify...
                                                        </span>
                                                    </div>
                                                    <div className="w-full rounded-full h-2" style={{ backgroundColor: `${theme.border}` }}>
                                                        <div
                                                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                            style={{
                                                                width: `${Math.min((refreshProgress.currentPage / refreshProgress.estimatedTotalPages) * 100, 100)}%`
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-xs text-blue-500 mt-1">
                                                        <span>
                                                            Página {refreshProgress.currentPage} de ~{refreshProgress.estimatedTotalPages}
                                                        </span>
                                                        <span>
                                                            {refreshProgress.customersProcessed.toLocaleString()} clientes · {refreshProgress.tagsFound} tags
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {targetType === 'tier' && (
                                        <div>
                                            <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>Nivel</label>
                                            <select
                                                value={targetValue}
                                                onChange={(e) => setTargetValue(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                                style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                            >
                                                <option value="">Selecciona un nivel...</option>
                                                {MEMBERSHIP_TIERS.map(tier => (
                                                    <option key={tier.value} value={tier.value}>{tier.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Smart Option D: Vibe-Based Filtering */}
                                    {targetType !== 'individual' && (
                                        <div className="p-3 rounded-lg" style={{ backgroundColor: theme.cardBg2, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="flex items-center gap-2 text-sm font-medium" style={{ color: theme.text }}>
                                                    <span>🎯</span>
                                                    Marketing Empatico
                                                </label>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={vibeFilterEnabled}
                                                        onChange={(e) => setVibeFilterEnabled(e.target.checked)}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </label>
                                            </div>

                                            {vibeFilterEnabled && (
                                                <div className="space-y-3 mt-3 pt-3" style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: theme.border }}>
                                                    <p className="text-xs" style={{ color: theme.textMuted }}>
                                                        Filtra tu audiencia basado en su estado emocional detectado por el CRM.
                                                        {channels.length > 1 && (
                                                            <span className="block mt-1 font-medium" style={{ color: theme.accent }}>
                                                                ✓ Aplica a todos los canales: {channels.map(c => c === 'push' ? 'Push' : c === 'whatsapp' ? 'WhatsApp' : 'Email').join(' + ')}
                                                            </span>
                                                        )}
                                                    </p>

                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={excludeFrustrated}
                                                            onChange={(e) => setExcludeFrustrated(e.target.checked)}
                                                            className="w-4 h-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500"
                                                        />
                                                        <span className="text-sm" style={{ color: theme.text }}>
                                                            😤 Excluir usuarios frustrados
                                                        </span>
                                                    </label>

                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={targetExcited}
                                                            onChange={(e) => setTargetExcited(e.target.checked)}
                                                            className="w-4 h-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500"
                                                        />
                                                        <span className="text-sm" style={{ color: theme.text }}>
                                                            🎉 Solo usuarios entusiastas/satisfechos
                                                        </span>
                                                    </label>

                                                    <div>
                                                        <label className="block text-sm mb-1" style={{ color: theme.text }}>
                                                            🔥 Nivel de intencion de compra
                                                        </label>
                                                        <select
                                                            value={minIntentLevel}
                                                            onChange={(e) => setMinIntentLevel(e.target.value as 'all' | 'warm' | 'hot')}
                                                            className="w-full px-3 py-2 rounded-lg text-sm"
                                                            style={{ backgroundColor: theme.cardBg, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                                        >
                                                            <option value="all">Todos los niveles</option>
                                                            <option value="warm">Solo tibios y calientes (40+)</option>
                                                            <option value="hot">Solo calientes (70+)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                                            <Calendar className="w-4 h-4 inline-block mr-1" />
                                            Programar envio (opcional)
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={scheduledFor}
                                            onChange={(e) => setScheduledFor(e.target.value)}
                                            min={new Date().toISOString().slice(0, 16)}
                                            className="w-full px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500"
                                            style={{ backgroundColor: theme.cardBg2, color: theme.text, borderWidth: '1px', borderStyle: 'solid', borderColor: theme.border }}
                                        />
                                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                                            Deja vacio para enviar inmediatamente
                                        </p>
                                    </div>

                                    {sendResult && (
                                        <div
                                            className="p-3 rounded-lg flex items-center gap-2"
                                            style={{
                                                backgroundColor: sendResult.success ? '#22c55e20' : '#ef444420',
                                                color: sendResult.success ? '#22c55e' : '#ef4444'
                                            }}
                                        >
                                            {sendResult.success ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                            <span>{sendResult.message}</span>
                                            {sendResult.recipients !== undefined && (
                                                <span className="ml-auto font-medium">{sendResult.recipients} destinatarios</span>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !title.trim() || !message.trim()}
                                        className="w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                        style={{
                                            backgroundColor: theme.accent,
                                            color: '#ffffff'
                                        }}
                                    >
                                        {sending ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-5 h-5" />
                                                {scheduledFor ? 'Programar Notificacion' : 'Enviar Ahora'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </ThemedCard>

                            {/* Preview */}
                            <ThemedCard className="p-6">
                                <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>Vista Previa</h2>

                                <div className="rounded-xl overflow-hidden-secondary" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}` }}>
                                    {/* Mock notification */}
                                    <div className="p-3 flex items-start gap-3" style={{ backgroundColor: theme.cardBg2 }}>
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.accent }}>
                                            <Bell className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>
                                                {title || 'Titulo de la notificacion'}
                                            </p>
                                            <p className="text-sm line-clamp-2" style={{ color: theme.textMuted }}>
                                                {message || 'El mensaje aparecera aqui...'}
                                            </p>
                                        </div>
                                        <span className="text-xs" style={{ color: theme.textMuted }}>Ahora</span>
                                    </div>

                                    {imageUrl && (
                                        <div className="p-3 pt-0" style={{ backgroundColor: theme.cardBg2 }}>
                                            <img
                                                src={imageUrl}
                                                alt="Preview"
                                                className="w-full h-32 object-cover rounded-lg"
                                                onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                    <h3 className="text-sm font-medium mb-2" style={{ color: theme.text }}>Detalles del envio:</h3>
                                    <ul className="text-sm space-y-1" style={{ color: theme.textMuted }}>
                                        <li>Canales: {channels.map(c => c === 'push' ? 'Push' : c === 'whatsapp' ? 'WhatsApp' : 'Email').join(', ') || 'Ninguno'}</li>
                                        <li>Audiencia: {getTargetLabel(targetType, targetValue)}</li>
                                        <li>Envio: {scheduledFor ? new Date(scheduledFor).toLocaleString('es-MX') : 'Inmediato'}</li>
                                    </ul>
                                </div>
                            </ThemedCard>
                        </div>
                    )}

                    {/* History Tab */}
                    {activeTab === 'history' && (
                        <ThemedCard className="overflow-hidden">
                            {loadingHistory ? (
                                <div className="p-8 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.accent }} />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="p-8 text-center" style={{ color: theme.textMuted }}>
                                    No hay notificaciones enviadas aun
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead style={{ backgroundColor: theme.cardBg2 }}>
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Notificacion</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Audiencia</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Estado</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Estadisticas</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Fecha</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: theme.textMuted }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody style={{ borderTop: `1px solid ${theme.border}` }}>
                                            {history.map((notification, idx) => (
                                                <tr
                                                    key={notification.id}
                                                    style={{ borderBottom: idx < history.length - 1 ? `1px solid ${theme.border}` : 'none' }}
                                                >
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium truncate max-w-xs" style={{ color: theme.text }}>{notification.title}</p>
                                                        <p className="text-sm truncate max-w-xs" style={{ color: theme.textMuted }}>{notification.message}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: theme.text }}>
                                                        {getTargetLabel(notification.target_type, notification.target_value)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {getStatusBadge(notification.status)}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: theme.text }}>
                                                        {notification.status === 'sent' && (
                                                            <div className="space-y-1">
                                                                <p>Enviados: {notification.sent_count}</p>
                                                                <p>Entregados: {notification.delivered_count}</p>
                                                                <p>Abiertos: {notification.opened_count}</p>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm" style={{ color: theme.textMuted }}>
                                                        {notification.sent_at
                                                            ? new Date(notification.sent_at).toLocaleString('es-MX')
                                                            : notification.scheduled_for
                                                                ? `Prog: ${new Date(notification.scheduled_for).toLocaleString('es-MX')}`
                                                                : new Date(notification.created_at).toLocaleString('es-MX')
                                                        }
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {notification.status === 'scheduled' && (
                                                            <button
                                                                onClick={() => cancelScheduledNotification(notification.id)}
                                                                className="text-red-500 hover:text-red-600 text-sm"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </ThemedCard>
                    )}

                    {/* Stats Tab */}
                    {activeTab === 'stats' && (
                        <div className="space-y-6">
                            {loadingStats ? (
                                <div className="p-8 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.accent }} />
                                </div>
                            ) : stats ? (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <ThemedCard className="p-6">
                                            <p className="text-sm mb-1" style={{ color: theme.textMuted }}>Dispositivos Registrados</p>
                                            <p className="text-3xl font-bold" style={{ color: theme.text }}>{stats.totalDevices}</p>
                                        </ThemedCard>
                                        <ThemedCard className="p-6">
                                            <p className="text-sm mb-1" style={{ color: theme.textMuted }}>Enviadas (30 dias)</p>
                                            <p className="text-3xl font-bold" style={{ color: theme.text }}>{stats.notificationsSent30Days}</p>
                                        </ThemedCard>
                                        <ThemedCard className="p-6">
                                            <p className="text-sm mb-1" style={{ color: theme.textMuted }}>Total Destinatarios</p>
                                            <p className="text-3xl font-bold" style={{ color: theme.text }}>{stats.totalRecipients}</p>
                                        </ThemedCard>
                                        <ThemedCard className="p-6">
                                            <p className="text-sm mb-1" style={{ color: theme.textMuted }}>Tasa de Apertura</p>
                                            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{stats.openRate}</p>
                                        </ThemedCard>
                                    </div>

                                    <ThemedCard className="p-6">
                                        <h3 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>Resumen de Entregas (30 dias)</h3>
                                        <div className="grid grid-cols-3 gap-4 text-center">
                                            <div>
                                                <p className="text-2xl font-bold text-blue-500">{stats.totalRecipients}</p>
                                                <p className="text-sm" style={{ color: theme.textMuted }}>Enviadas</p>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-bold text-green-500">{stats.totalDelivered}</p>
                                                <p className="text-sm" style={{ color: theme.textMuted }}>Entregadas</p>
                                            </div>
                                            <div>
                                                <p className="text-2xl font-bold" style={{ color: theme.accent }}>{stats.totalOpened}</p>
                                                <p className="text-sm" style={{ color: theme.textMuted }}>Abiertas</p>
                                            </div>
                                        </div>
                                    </ThemedCard>
                                </>
                            ) : (
                                <div className="p-8 text-center" style={{ color: theme.textMuted }}>
                                    No se pudieron cargar las estadisticas
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Layout>
        </Screen>
    );
}
