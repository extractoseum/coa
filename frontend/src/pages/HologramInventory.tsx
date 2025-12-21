import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Plus, Download, ChevronLeft, Loader2, Search, QrCode } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface UnassignedCVV {
    id: string;
    cvv_code: string;
    qr_token: string | null;
    label_id: string;
    generated_at: string;
    scan_count: number;
    is_revoked: boolean;
}

export default function HologramInventory() {
    const { theme } = useTheme();
    const [inventory, setInventory] = useState<UnassignedCVV[]>([]);
    const [quantity, setQuantity] = useState(1000);
    const [prefix, setPrefix] = useState('HOLO');
    const [withQRToken, setWithQRToken] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadInventory();
    }, []);

    const loadInventory = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/cvv/unassigned');
            const data = await res.json();
            if (data.success) {
                setInventory(data.data || []);
            }
        } catch (error) {
            console.error('Error loading inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (quantity < 1 || quantity > 10000) {
            alert('La cantidad debe estar entre 1 y 10,000');
            return;
        }
        setGenerating(true);
        try {
            const res = await fetch('/api/v1/cvv/generate-unassigned', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity, label_prefix: prefix, with_qr_token: withQRToken })
            });
            const data = await res.json();
            if (data.success) {
                alert(`${data.quantity} hologramas generados exitosamente`);
                loadInventory();
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexion');
        } finally {
            setGenerating(false);
        }
    };

    const exportCSV = () => {
        if (inventory.length === 0) return;
        const hasQRTokens = inventory.some(c => c.qr_token);
        const headers = hasQRTokens
            ? ['Label ID', 'QR Token', 'QR URL', 'CVV Code', 'Generated At', 'Scans', 'Status']
            : ['Label ID', 'CVV Code', 'Generated At', 'Scans', 'Status'];
        const csvContent = [
            headers,
            ...inventory.map(c => hasQRTokens ? [
                c.label_id || '',
                c.qr_token || '',
                c.qr_token ? `https://coa.extractoseum.com/preview/qr/${c.qr_token}` : '',
                c.cvv_code,
                new Date(c.generated_at).toLocaleDateString('es-MX'),
                c.scan_count.toString(),
                c.is_revoked ? 'Revoked' : 'Active'
            ] : [
                c.label_id || '',
                c.cvv_code,
                new Date(c.generated_at).toLocaleDateString('es-MX'),
                c.scan_count.toString(),
                c.is_revoked ? 'Revoked' : 'Active'
            ])
        ].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Hologram-Inventory-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const filteredInventory = inventory.filter(item =>
        item.cvv_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.label_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.qr_token?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Screen id="HologramInventory">
            <Layout>
                <div className="sticky top-0 z-10 backdrop-blur-md" style={{ backgroundColor: theme.navBg, borderBottom: `1px solid ${theme.border}` }}>
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link to="/dashboard" style={{ color: theme.textMuted }}><ChevronLeft className="w-6 h-6" /></Link>
                        <span className="font-bold tracking-wider" style={{ color: theme.accent }}>INVENTARIO DE HOLOGRAMAS</span>
                        <div className="w-6" />
                    </div>
                </div>

                <main className="max-w-6xl mx-auto p-4 space-y-6 py-8 pb-24">
                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { label: 'Total Disponibles', value: inventory.length, color: theme.accent },
                            { label: 'Sin Usar', value: inventory.filter(i => i.scan_count === 0).length, color: '#3b82f6' },
                            { label: 'Con Escaneos', value: inventory.filter(i => i.scan_count > 0).length, color: '#eab308' },
                        ].map((stat) => (
                            <div key={stat.label} className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                <p className="text-sm mb-1" style={{ color: theme.textMuted }}>{stat.label}</p>
                                <p className="text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Generate Section */}
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <h3 className="font-semibold flex items-center" style={{ color: theme.text }}>
                                <Plus className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                                Generar Hologramas para Inventario
                            </h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Cantidad de Hologramas</label>
                                    <input type="number" min="1" max="10000" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                        className="w-full rounded-lg px-4 py-3 focus:outline-none"
                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                    />
                                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Maximo: 10,000 por lote</p>
                                </div>
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Prefijo de Etiqueta</label>
                                    <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)}
                                        className="w-full rounded-lg px-4 py-3 focus:outline-none"
                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }}
                                    />
                                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Se numeraran: {prefix}-0001, {prefix}-0002...</p>
                                </div>
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Tipo de Holograma</label>
                                    <div className="space-y-2">
                                        {[
                                            { checked: withQRToken, onChange: () => setWithQRToken(true), label: 'Completo (QR + CVV)', desc: 'Para impresion fisica', icon: QrCode },
                                            { checked: !withQRToken, onChange: () => setWithQRToken(false), label: 'Solo CVV', desc: 'Codigo simple', icon: null },
                                        ].map((opt, idx) => (
                                            <label key={idx} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                                                style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}` }}>
                                                <input type="radio" checked={opt.checked} onChange={opt.onChange} className="w-4 h-4" style={{ accentColor: theme.accent }} />
                                                <div>
                                                    <span className="flex items-center gap-2" style={{ color: theme.text }}>
                                                        {opt.icon && <opt.icon className="w-4 h-4" style={{ color: theme.accent }} />}
                                                        {opt.label}
                                                    </span>
                                                    <p className="text-xs" style={{ color: theme.textMuted }}>{opt.desc}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleGenerate} disabled={generating}
                                className="w-full font-medium py-4 rounded-lg transition-colors flex items-center justify-center text-lg"
                                style={{ backgroundColor: generating ? theme.cardBg2 : theme.accent, color: '#ffffff' }}>
                                {generating ? <><Loader2 className="w-6 h-6 mr-2 animate-spin" />Generando...</> : <><Plus className="w-6 h-6 mr-2" />Generar {quantity.toLocaleString()} Hologramas</>}
                            </button>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <h3 className="font-semibold flex items-center" style={{ color: theme.text }}>
                                <Package className="w-5 h-5 mr-2" style={{ color: theme.accent }} />
                                Inventario ({filteredInventory.length})
                            </h3>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: theme.textMuted }} />
                                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar..."
                                        className="rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none"
                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <button onClick={exportCSV} disabled={inventory.length === 0}
                                    className="flex items-center px-4 py-2 rounded-lg transition-colors text-sm"
                                    style={{ backgroundColor: theme.cardBg2, color: theme.text, border: `1px solid ${theme.border}` }}>
                                    <Download className="w-4 h-4 mr-2" />Exportar CSV
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center" style={{ color: theme.textMuted }}><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /><p>Cargando...</p></div>
                        ) : filteredInventory.length === 0 ? (
                            <div className="p-12 text-center" style={{ color: theme.textMuted }}><Package className="w-16 h-16 mx-auto mb-4 opacity-20" /><p>No hay hologramas en inventario</p></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead style={{ backgroundColor: theme.cardBg2, borderBottom: `1px solid ${theme.border}` }}>
                                        <tr>
                                            {['Etiqueta', 'QR Token', 'Codigo CVV', 'Generado', 'Escaneos', 'Estado'].map((h) => (
                                                <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: theme.textMuted }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInventory.map((item, idx) => (
                                            <tr key={item.id} style={{ borderTop: idx > 0 ? `1px solid ${theme.border}` : 'none' }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${theme.accent}10`}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td className="px-4 py-4" style={{ color: theme.textMuted }}>{item.label_id || '-'}</td>
                                                <td className="px-4 py-4 font-mono text-sm" style={{ color: item.qr_token ? theme.accent : theme.textMuted }}>{item.qr_token || '-'}</td>
                                                <td className="px-4 py-4 font-mono font-medium" style={{ color: theme.text }}>{item.cvv_code}</td>
                                                <td className="px-4 py-4 text-sm" style={{ color: theme.textMuted }}>{new Date(item.generated_at).toLocaleDateString('es-MX')}</td>
                                                <td className="px-4 py-4 text-center" style={{ color: item.scan_count > 0 ? '#eab308' : theme.textMuted }}>{item.scan_count}</td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="px-3 py-1 rounded-full text-xs font-medium"
                                                        style={{ backgroundColor: item.is_revoked ? 'rgba(239,68,68,0.2)' : `${theme.accent}20`, color: item.is_revoked ? '#ef4444' : theme.accent }}>
                                                        {item.is_revoked ? 'Revocado' : 'Disponible'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </Layout>
        </Screen>
    );
}
