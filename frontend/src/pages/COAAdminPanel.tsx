import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES, to } from '../routes';
import { ChevronLeft, Search, Filter, FileText, Users, CheckCircle, XCircle, Clock, Loader2, Eye, UserPlus, RefreshCw, CloudUpload } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface Client {
    id: string;
    name: string;
    email: string;
    phone?: string;
    company?: string;
}

interface ShopifyCustomer {
    id: string;
    name: string;
    email: string;
    company?: string;
}

interface COA {
    id: string;
    public_token: string;
    lab_report_number?: string;
    lab_name?: string;
    analysis_date?: string;
    product_sku?: string;
    batch_id?: string;
    custom_title?: string;
    custom_name?: string;
    compliance_status: 'pass' | 'fail' | 'pending';
    thc_compliance_flag?: boolean;
    product_image_url?: string;
    client_id?: string;
    client?: Client;
    created_at: string;
    updated_at: string;
    metadata?: any;
}

interface Stats {
    total: number;
    unassigned: number;
    assigned: number;
    compliance: {
        pass: number;
        fail: number;
        pending: number;
    };
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

const API_BASE = '/api/v1';

export default function COAAdminPanel() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [coas, setCoas] = useState<COA[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCoas, setSelectedCoas] = useState<Set<string>>(new Set());

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [unassignedOnly, setUnassignedOnly] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Bulk assign modal
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkClientId, setBulkClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [bulkAssigning, setBulkAssigning] = useState(false);

    // Shopify search for bulk modal
    const [shopifySearch, setShopifySearch] = useState('');
    const [shopifyResults, setShopifyResults] = useState<ShopifyCustomer[]>([]);
    const [searchingShopify, setSearchingShopify] = useState(false);
    const [selectedShopifyCustomer, setSelectedShopifyCustomer] = useState<ShopifyCustomer | null>(null);
    const [importingClient, setImportingClient] = useState(false);

    // Shopify sync
    const [syncingShopify, setSyncingShopify] = useState(false);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: number; failed: number; total: number } | null>(null);

    useEffect(() => {
        loadData();
    }, [currentPage, clientFilter, statusFilter, unassignedOnly]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentPage === 1) {
                loadCOAs();
            } else {
                setCurrentPage(1);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const loadData = async () => {
        await Promise.all([loadCOAs(), loadStats(), loadClients()]);
    };

    const loadCOAs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('page', currentPage.toString());
            params.append('limit', '25');
            if (searchTerm) params.append('search', searchTerm);
            if (clientFilter) params.append('client_id', clientFilter);
            if (statusFilter) params.append('compliance_status', statusFilter);
            if (unassignedOnly) params.append('unassigned', 'true');

            const url = `${API_BASE}/coas/admin/all?${params.toString()}`;
            const res = await authFetch(url);
            const data = await res.json();

            if (data.success) {
                setCoas(data.coas || []);
                setPagination(data.pagination);
            }
        } catch (error) {
            console.error('Error loading COAs:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const res = await authFetch(`${API_BASE}/coas/admin/stats`);
            const data = await res.json();
            if (data.success) {
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadClients = async () => {
        try {
            const res = await authFetch(`${API_BASE}/clients`);
            const data = await res.json();
            if (data.success) {
                setClients(data.clients || []);
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    };

    const searchShopifyCustomers = async (query: string) => {
        if (!query || query.length < 2) {
            setShopifyResults([]);
            return;
        }
        setSearchingShopify(true);
        try {
            const res = await authFetch(`${API_BASE}/clients/shopify/search?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.success) {
                setShopifyResults(data.customers || []);
            }
        } catch (error) {
            console.error('Error searching Shopify:', error);
        } finally {
            setSearchingShopify(false);
        }
    };

    const importAndAssign = async (shopifyCustomer: ShopifyCustomer) => {
        setImportingClient(true);
        try {
            const importRes = await authFetch(`${API_BASE}/clients/shopify/import/${shopifyCustomer.id}`, {
                method: 'POST',
                body: JSON.stringify({})
            });
            const importData = await importRes.json();

            let clientId: string;
            if (importData.success) {
                clientId = importData.client.id;
            } else if (importData.error?.includes('ya fue importado') || importData.error?.includes('ya existe')) {
                const existingClient = clients.find(c => c.email.toLowerCase() === shopifyCustomer.email.toLowerCase());
                if (existingClient) {
                    clientId = existingClient.id;
                } else {
                    await loadClients();
                    alert('Cliente ya importado. Seleccione de la lista de clientes locales.');
                    setImportingClient(false);
                    return;
                }
            } else {
                alert('Error al importar: ' + importData.error);
                setImportingClient(false);
                return;
            }

            const assignRes = await authFetch(`${API_BASE}/coas/admin/bulk-assign`, {
                method: 'POST',
                body: JSON.stringify({
                    coa_ids: Array.from(selectedCoas),
                    client_id: clientId
                })
            });
            const assignData = await assignRes.json();

            if (assignData.success) {
                alert(`COAs asignados a ${shopifyCustomer.name || shopifyCustomer.email}`);
                setShowBulkModal(false);
                setSelectedCoas(new Set());
                resetModalState();
                loadData();
            } else {
                alert('Error al asignar: ' + assignData.error);
            }
        } catch (error) {
            console.error('Error importing and assigning:', error);
            alert('Error de conexion');
        } finally {
            setImportingClient(false);
        }
    };

    const resetModalState = () => {
        setBulkClientId('');
        setShopifySearch('');
        setShopifyResults([]);
        setSelectedShopifyCustomer(null);
    };

    const syncAllToShopify = async () => {
        setSyncingShopify(true);
        setSyncResult(null);
        try {
            const res = await authFetch(`${API_BASE}/clients/shopify/sync-all`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                setSyncResult(data.results);
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Error syncing to Shopify:', error);
            alert('Error de conexion');
        } finally {
            setSyncingShopify(false);
        }
    };

    const toggleSelectCoa = (id: string) => {
        const newSelected = new Set(selectedCoas);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedCoas(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedCoas.size === coas.length) {
            setSelectedCoas(new Set());
        } else {
            setSelectedCoas(new Set(coas.map(c => c.id)));
        }
    };

    const handleBulkAssign = async () => {
        if (selectedCoas.size === 0) return;

        setBulkAssigning(true);
        try {
            const res = await authFetch(`${API_BASE}/coas/admin/bulk-assign`, {
                method: 'POST',
                body: JSON.stringify({
                    coa_ids: Array.from(selectedCoas),
                    client_id: bulkClientId || null
                })
            });

            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setShowBulkModal(false);
                setSelectedCoas(new Set());
                setBulkClientId('');
                loadData();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Error bulk assigning:', error);
            alert('Error de conexion');
        } finally {
            setBulkAssigning(false);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            pass: { bg: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' },
            fail: { bg: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' },
            pending: { bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' }
        };
        const s = styles[status as keyof typeof styles] || styles.pending;
        const icons = {
            pass: <CheckCircle className="w-3 h-3 mr-1" />,
            fail: <XCircle className="w-3 h-3 mr-1" />,
            pending: <Clock className="w-3 h-3 mr-1" />
        };
        const labels = { pass: 'Pass', fail: 'Fail', pending: 'Pending' };
        return (
            <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: s.bg, color: s.color }}
            >
                {icons[status as keyof typeof icons] || icons.pending}
                {labels[status as keyof typeof labels] || 'Pending'}
            </span>
        );
    };

    return (
        <Screen id="COAAdminPanel">
            <Layout>
                {/* Top Header Bar */}
                <div
                    className="sticky top-0 z-10 backdrop-blur-md"
                    style={{
                        backgroundColor: theme.navBg,
                        borderBottom: `1px solid ${theme.border}`,
                    }}
                >
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            to={ROUTES.dashboard}
                            className="transition-colors"
                            style={{ color: theme.textMuted }}
                            onMouseEnter={(e) => e.currentTarget.style.color = theme.text}
                            onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </Link>
                        <span className="font-bold tracking-wider" style={{ color: theme.accent }}>
                            ADMIN - GESTION DE COAs
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowSyncModal(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
                                title="Sincronizar metafields a Shopify"
                            >
                                <CloudUpload className="w-4 h-4" />
                                <span className="hidden sm:inline">Sync Shopify</span>
                            </button>
                            <button
                                onClick={() => loadData()}
                                className="transition-colors"
                                style={{ color: theme.textMuted }}
                                onMouseEnter={(e) => e.currentTarget.style.color = theme.text}
                                onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                                title="Recargar"
                            >
                                <RefreshCw className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                <main className="max-w-7xl mx-auto p-4 space-y-6 py-6 pb-24">
                    {/* Stats Cards */}
                    {stats && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'Total COAs', value: stats.total, icon: FileText, color: theme.text },
                                { label: 'Asignados', value: stats.assigned, icon: Users, color: '#3b82f6' },
                                { label: 'Sin Asignar', value: stats.unassigned, icon: UserPlus, color: '#f97316' },
                                { label: 'Pass', value: stats.compliance.pass, icon: CheckCircle, color: '#22c55e' },
                                { label: 'Fail', value: stats.compliance.fail, icon: XCircle, color: '#ef4444' },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-xl p-4"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        border: `1px solid ${theme.border}`,
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs mb-1" style={{ color: theme.textMuted }}>{stat.label}</p>
                                            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                                        </div>
                                        <stat.icon className="w-8 h-8" style={{ color: `${stat.color}50` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Filters */}
                    <div
                        className="rounded-xl p-4"
                        style={{
                            backgroundColor: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-5 h-5" style={{ color: theme.textMuted }} />
                            <span className="font-medium" style={{ color: theme.text }}>Filtros</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme.textMuted }} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar token, SKU, batch..."
                                    className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none"
                                    style={{
                                        backgroundColor: theme.cardBg2,
                                        border: `1px solid ${theme.border}`,
                                        color: theme.text,
                                    }}
                                />
                            </div>

                            <select
                                value={clientFilter}
                                onChange={(e) => { setClientFilter(e.target.value); setCurrentPage(1); }}
                                className="rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                                style={{
                                    backgroundColor: theme.cardBg2,
                                    border: `1px solid ${theme.border}`,
                                    color: theme.text,
                                }}
                            >
                                <option value="">Todos los clientes</option>
                                {clients.map(client => (
                                    <option key={client.id} value={client.id}>
                                        {client.name || client.email} {client.company ? `(${client.company})` : ''}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                className="rounded-lg px-4 py-2.5 text-sm focus:outline-none"
                                style={{
                                    backgroundColor: theme.cardBg2,
                                    border: `1px solid ${theme.border}`,
                                    color: theme.text,
                                }}
                            >
                                <option value="">Todos los estados</option>
                                <option value="pass">Pass</option>
                                <option value="fail">Fail</option>
                                <option value="pending">Pending</option>
                            </select>

                            <label
                                className="flex items-center gap-2 cursor-pointer rounded-lg px-4 py-2.5"
                                style={{
                                    backgroundColor: theme.cardBg2,
                                    border: `1px solid ${theme.border}`,
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={unassignedOnly}
                                    onChange={(e) => { setUnassignedOnly(e.target.checked); setCurrentPage(1); }}
                                    className="w-4 h-4 rounded"
                                    style={{ accentColor: theme.accent }}
                                />
                                <span className="text-sm" style={{ color: theme.text }}>Solo sin asignar</span>
                            </label>
                        </div>
                    </div>

                    {/* Bulk Actions */}
                    {selectedCoas.size > 0 && (
                        <div
                            className="rounded-xl p-4 flex items-center justify-between"
                            style={{
                                backgroundColor: `${theme.accent}20`,
                                border: `1px solid ${theme.accent}50`,
                            }}
                        >
                            <span style={{ color: theme.accent }}>
                                {selectedCoas.size} COA{selectedCoas.size > 1 ? 's' : ''} seleccionado{selectedCoas.size > 1 ? 's' : ''}
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setSelectedCoas(new Set())}
                                    className="text-sm"
                                    style={{ color: theme.textMuted }}
                                >
                                    Deseleccionar
                                </button>
                                <button
                                    onClick={() => setShowBulkModal(true)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                    style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                >
                                    Asignar a Cliente
                                </button>
                            </div>
                        </div>
                    )}

                    {/* COA Table */}
                    <div
                        className="rounded-xl overflow-hidden"
                        style={{
                            backgroundColor: theme.cardBg,
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        {loading ? (
                            <div className="p-12 text-center" style={{ color: theme.textMuted }}>
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                <p>Cargando COAs...</p>
                            </div>
                        ) : coas.length === 0 ? (
                            <div className="p-12 text-center" style={{ color: theme.textMuted }}>
                                <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p className="text-lg mb-2">No hay COAs</p>
                                <p className="text-sm">Ajusta los filtros o sube nuevos PDFs</p>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead style={{ backgroundColor: theme.cardBg2, borderBottom: `1px solid ${theme.border}` }}>
                                            <tr>
                                                <th className="text-left px-4 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCoas.size === coas.length && coas.length > 0}
                                                        onChange={toggleSelectAll}
                                                        className="w-4 h-4 rounded"
                                                        style={{ accentColor: theme.accent }}
                                                    />
                                                </th>
                                                <th className="text-left px-4 py-3 w-16">
                                                    {/* Image Column */}
                                                    <span className="sr-only">Imagen</span>
                                                </th>
                                                <th className="text-left px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Token</th>
                                                <th className="text-left px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Nombre / SKU</th>
                                                <th className="text-left px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Cliente</th>
                                                <th className="text-left px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Fecha</th>
                                                <th className="text-center px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Estado</th>
                                                <th className="text-center px-4 py-3 font-medium" style={{ color: theme.textMuted }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {coas.map((coa, index) => (
                                                <tr
                                                    key={coa.id}
                                                    className="transition-colors"
                                                    style={{ borderTop: index > 0 ? `1px solid ${theme.border}` : 'none' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}10`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCoas.has(coa.id)}
                                                            onChange={() => toggleSelectCoa(coa.id)}
                                                            className="w-4 h-4 rounded"
                                                            style={{ accentColor: theme.accent }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center border" style={{ borderColor: theme.border }}>
                                                            {coa.product_image_url || coa.metadata?.product_image_url ? (
                                                                <img
                                                                    src={coa.product_image_url || coa.metadata?.product_image_url}
                                                                    alt=""
                                                                    className="w-full h-full object-contain p-0.5"
                                                                />
                                                            ) : (
                                                                <FileText className="w-5 h-5 opacity-20" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs opacity-70" style={{ color: theme.text }}>
                                                            {coa.public_token}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div>
                                                            <p className="font-medium" style={{ color: theme.text }}>
                                                                {coa.custom_name || coa.product_sku || 'Sin nombre'}
                                                            </p>
                                                            {(coa.batch_id || coa.metadata?.batch_number) && (
                                                                <p className="text-xs" style={{ color: theme.textMuted }}>
                                                                    Batch: {coa.batch_id || coa.metadata?.batch_number}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {coa.client ? (
                                                            <div>
                                                                <p style={{ color: theme.text }}>{coa.client.name || coa.client.email}</p>
                                                                {coa.client.company && (
                                                                    <p className="text-xs" style={{ color: theme.textMuted }}>{coa.client.company}</p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#f9731620', color: '#f97316' }}>Sin asignar</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3" style={{ color: theme.textMuted }}>
                                                        {coa.analysis_date ? new Date(coa.analysis_date).toLocaleDateString('es-MX', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric'
                                                        }) : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {getStatusBadge(coa.compliance_status)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button
                                                            onClick={() => navigate(to.coa(coa.public_token))}
                                                            className="p-2 transition-colors rounded-lg hover:bg-white/5"
                                                            style={{ color: theme.textMuted }}
                                                            onMouseEnter={(e) => e.currentTarget.style.color = theme.accent}
                                                            onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                                                            title="Ver COA"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {pagination && pagination.totalPages > 1 && (
                                    <div
                                        className="px-4 py-3 flex items-center justify-between"
                                        style={{ borderTop: `1px solid ${theme.border}` }}
                                    >
                                        <p className="text-sm" style={{ color: theme.textMuted }}>
                                            Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 rounded text-sm transition-colors"
                                                style={{
                                                    backgroundColor: currentPage === 1 ? theme.cardBg2 : theme.cardBg,
                                                    color: currentPage === 1 ? theme.textMuted : theme.text,
                                                    border: `1px solid ${theme.border}`,
                                                    opacity: currentPage === 1 ? 0.5 : 1,
                                                }}
                                            >
                                                Anterior
                                            </button>
                                            <span className="px-3 py-1" style={{ color: theme.textMuted }}>
                                                {pagination.page} / {pagination.totalPages}
                                            </span>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                                                disabled={currentPage >= pagination.totalPages}
                                                className="px-3 py-1 rounded text-sm transition-colors"
                                                style={{
                                                    backgroundColor: currentPage >= pagination.totalPages ? theme.cardBg2 : theme.cardBg,
                                                    color: currentPage >= pagination.totalPages ? theme.textMuted : theme.text,
                                                    border: `1px solid ${theme.border}`,
                                                    opacity: currentPage >= pagination.totalPages ? 0.5 : 1,
                                                }}
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main >

                {/* Shopify Sync Modal */}
                {
                    showSyncModal && (
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                            <div
                                className="rounded-2xl max-w-md w-full p-6"
                                style={{
                                    backgroundColor: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                }}
                            >
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                    <CloudUpload className="w-5 h-5" style={{ color: '#3b82f6' }} />
                                    Sincronizar Metafields a Shopify
                                </h3>

                                {!syncResult && !syncingShopify && (
                                    <>
                                        <p className="mb-4" style={{ color: theme.textMuted }}>
                                            Esta accion sincronizara los COAs de <strong>todos los clientes</strong> con Shopify ID a sus metafields en Shopify.
                                        </p>
                                        <p className="text-sm mb-6" style={{ color: theme.textMuted }}>
                                            Los metafields incluyen: lista de COAs asignados, URLs, conteo total y link al dashboard.
                                        </p>
                                    </>
                                )}

                                {syncingShopify && (
                                    <div className="text-center py-8">
                                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: '#3b82f6' }} />
                                        <p style={{ color: theme.text }}>Sincronizando con Shopify...</p>
                                        <p className="text-sm" style={{ color: theme.textMuted }}>Esto puede tomar unos segundos</p>
                                    </div>
                                )}

                                {syncResult && (
                                    <div className="py-4">
                                        <div className="grid grid-cols-3 gap-4 mb-6">
                                            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: theme.cardBg2 }}>
                                                <p className="text-2xl font-bold" style={{ color: theme.text }}>{syncResult.total}</p>
                                                <p className="text-xs" style={{ color: theme.textMuted }}>Total</p>
                                            </div>
                                            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}>
                                                <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{syncResult.success}</p>
                                                <p className="text-xs" style={{ color: theme.textMuted }}>Exitosos</p>
                                            </div>
                                            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}>
                                                <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{syncResult.failed}</p>
                                                <p className="text-xs" style={{ color: theme.textMuted }}>Fallidos</p>
                                            </div>
                                        </div>
                                        <p className="text-center text-sm" style={{ color: theme.textMuted }}>
                                            {syncResult.success === syncResult.total
                                                ? 'Todos los clientes fueron sincronizados correctamente'
                                                : `${syncResult.failed} cliente(s) no pudieron ser sincronizados`}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3 mt-4">
                                    <button
                                        onClick={() => {
                                            setShowSyncModal(false);
                                            setSyncResult(null);
                                        }}
                                        className="flex-1 py-3 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: theme.cardBg2,
                                            color: theme.text,
                                            border: `1px solid ${theme.border}`,
                                        }}
                                    >
                                        {syncResult ? 'Cerrar' : 'Cancelar'}
                                    </button>
                                    {!syncResult && (
                                        <button
                                            onClick={syncAllToShopify}
                                            disabled={syncingShopify}
                                            className="flex-1 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                            style={{
                                                backgroundColor: syncingShopify ? theme.cardBg2 : '#3b82f6',
                                                color: '#ffffff',
                                            }}
                                        >
                                            {syncingShopify ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <>
                                                    <CloudUpload className="w-5 h-5" />
                                                    Sincronizar Todo
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Bulk Assign Modal */}
                {
                    showBulkModal && (
                        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                            <div
                                className="rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
                                style={{
                                    backgroundColor: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                }}
                            >
                                <h3 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>
                                    Asignar {selectedCoas.size} COA{selectedCoas.size > 1 ? 's' : ''} a Cliente
                                </h3>

                                {/* Local clients dropdown */}
                                <div className="mb-4">
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                                        Clientes Locales
                                    </label>
                                    <div className="relative mb-2">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme.textMuted }} />
                                        <input
                                            type="text"
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                            placeholder="Filtrar por nombre, email o phone..."
                                            className="w-full rounded-lg pl-10 pr-4 py-2 focus:outline-none text-sm"
                                            style={{
                                                backgroundColor: theme.cardBg2,
                                                border: `1px solid ${theme.border}`,
                                                color: theme.text,
                                            }}
                                        />
                                    </div>
                                    <select
                                        value={bulkClientId}
                                        onChange={(e) => {
                                            setBulkClientId(e.target.value);
                                            setSelectedShopifyCustomer(null);
                                        }}
                                        className="w-full rounded-lg px-4 py-3 focus:outline-none"
                                        style={{
                                            backgroundColor: theme.cardBg2,
                                            border: `1px solid ${theme.border}`,
                                            color: theme.text,
                                        }}
                                    >
                                        <option value="">-- Desasignar (quitar cliente) --</option>
                                        {clients
                                            .filter(c => {
                                                const search = clientSearch.toLowerCase();
                                                return (
                                                    (c.name?.toLowerCase().includes(search)) ||
                                                    (c.email?.toLowerCase().includes(search)) ||
                                                    (c.phone?.toLowerCase().includes(search)) ||
                                                    (c.company?.toLowerCase().includes(search))
                                                );
                                            })
                                            .map(client => (
                                                <option key={client.id} value={client.id}>
                                                    {client.name || client.email} {client.company ? `(${client.company})` : ''}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                {/* Shopify search */}
                                <div className="mb-4">
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                                        O buscar en Shopify
                                    </label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme.textMuted }} />
                                        <input
                                            type="text"
                                            value={shopifySearch}
                                            onChange={(e) => {
                                                setShopifySearch(e.target.value);
                                                searchShopifyCustomers(e.target.value);
                                            }}
                                            placeholder="Buscar por nombre o email..."
                                            className="w-full rounded-lg pl-10 pr-4 py-3 focus:outline-none"
                                            style={{
                                                backgroundColor: theme.cardBg2,
                                                border: `1px solid ${theme.border}`,
                                                color: theme.text,
                                            }}
                                        />
                                        {searchingShopify && (
                                            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: theme.textMuted }} />
                                        )}
                                    </div>

                                    {shopifyResults.length > 0 && (
                                        <div
                                            className="mt-2 rounded-lg max-h-48 overflow-y-auto"
                                            style={{
                                                backgroundColor: theme.cardBg2,
                                                border: `1px solid ${theme.border}`,
                                            }}
                                        >
                                            {shopifyResults.map(customer => (
                                                <button
                                                    key={customer.id}
                                                    onClick={() => {
                                                        setSelectedShopifyCustomer(customer);
                                                        setBulkClientId('');
                                                        setShopifyResults([]);
                                                        setShopifySearch(customer.name || customer.email);
                                                    }}
                                                    className="w-full text-left px-4 py-3 transition-colors"
                                                    style={{
                                                        borderBottom: `1px solid ${theme.border}`,
                                                        backgroundColor: selectedShopifyCustomer?.id === customer.id ? `${theme.accent}20` : 'transparent',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}10`}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedShopifyCustomer?.id === customer.id ? `${theme.accent}20` : 'transparent'}
                                                >
                                                    <p className="font-medium" style={{ color: theme.text }}>{customer.name || customer.email}</p>
                                                    <p className="text-sm" style={{ color: theme.textMuted }}>{customer.email}</p>
                                                    {customer.company && (
                                                        <p className="text-xs" style={{ color: theme.textMuted }}>{customer.company}</p>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {selectedShopifyCustomer && (
                                        <div
                                            className="mt-2 rounded-lg p-3"
                                            style={{
                                                backgroundColor: `${theme.accent}20`,
                                                border: `1px solid ${theme.accent}50`,
                                            }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: theme.accent }}>Cliente de Shopify seleccionado:</p>
                                                    <p style={{ color: theme.text }}>{selectedShopifyCustomer.name || selectedShopifyCustomer.email}</p>
                                                    <p className="text-xs" style={{ color: theme.textMuted }}>{selectedShopifyCustomer.email}</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setSelectedShopifyCustomer(null);
                                                        setShopifySearch('');
                                                    }}
                                                    style={{ color: theme.textMuted }}
                                                >
                                                    <XCircle className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <p className="text-xs mb-4" style={{ color: theme.textMuted }}>
                                    {selectedShopifyCustomer
                                        ? 'El cliente sera importado automaticamente si no existe'
                                        : bulkClientId
                                            ? 'Los COAs seran asignados al cliente local seleccionado'
                                            : 'Los COAs seran desasignados (quedaran sin cliente)'}
                                </p>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowBulkModal(false);
                                            resetModalState();
                                        }}
                                        className="flex-1 py-3 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: theme.cardBg2,
                                            color: theme.text,
                                            border: `1px solid ${theme.border}`,
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (selectedShopifyCustomer) {
                                                importAndAssign(selectedShopifyCustomer);
                                            } else {
                                                handleBulkAssign();
                                            }
                                        }}
                                        disabled={bulkAssigning || importingClient}
                                        className="flex-1 py-3 rounded-lg transition-colors flex items-center justify-center"
                                        style={{
                                            backgroundColor: (bulkAssigning || importingClient) ? theme.cardBg2 : theme.accent,
                                            color: '#ffffff',
                                        }}
                                    >
                                        {(bulkAssigning || importingClient) ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : selectedShopifyCustomer ? (
                                            'Importar y Asignar'
                                        ) : bulkClientId ? (
                                            'Asignar'
                                        ) : (
                                            'Desasignar'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </Layout >
        </Screen>
    );
}
