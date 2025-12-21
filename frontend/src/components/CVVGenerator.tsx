import { useState, useEffect } from 'react';
import { Download, Plus, Loader2, QrCode } from 'lucide-react';
import type { ThemeMode } from '../contexts/ThemeContext';

interface CVVGeneratorProps {
    token: string;
    themeMode?: ThemeMode;
}

interface CVVCode {
    id: string;
    cvv_code: string;
    qr_token: string | null;
    label_id: string;
    generated_at: string;
    scan_count: number;
    is_revoked: boolean;
}

export default function CVVGenerator({ token, themeMode = 'dark' }: CVVGeneratorProps) {
    // Theme colors
    const themes = {
        light: {
            cardBg: '#ffffff',
            cardBg2: '#f9fafb',
            cardBg3: '#f3f4f6',
            border: '#d1d5db',
            text: '#111827',
            textMuted: '#6b7280',
            inputBg: '#ffffff',
            inputBorder: '#d1d5db',
            accent: '#10b981',
        },
        dark: {
            cardBg: '#0c1222',
            cardBg2: '#111827',
            cardBg3: '#1f2937',
            border: '#1f2937',
            text: '#ffffff',
            textMuted: '#d1d5db',
            inputBg: '#111827',
            inputBorder: '#374151',
            accent: '#10b981',
        },
        tokyo: {
            cardBg: '#0d0d1a',
            cardBg2: '#1a1a2e',
            cardBg3: '#16213e',
            border: '#4a4a8a',
            text: '#ffffff',
            textMuted: '#a0a0c0',
            inputBg: '#0f0f1f',
            inputBorder: '#4a4a8a',
            accent: '#00f5d4',
        },
        neon: {
            cardBg: '#05001a',
            cardBg2: '#080025',
            cardBg3: '#0c0032',
            border: '#1a1033',
            text: '#f8fafc',
            textMuted: '#94a3b8',
            inputBg: '#05001a',
            inputBorder: '#1a1033',
            accent: '#ec4899',
        },
    };
    const theme = themes[themeMode];

    const [quantity, setQuantity] = useState(100);
    const [labelPrefix, setLabelPrefix] = useState('');
    const [withQRToken, setWithQRToken] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [cvvCodes, setCvvCodes] = useState<CVVCode[]>([]);
    const [showCodes, setShowCodes] = useState(false);

    // Inventory state
    const [unassignedCount, setUnassignedCount] = useState(0);
    const [assignQuantity, setAssignQuantity] = useState(100);
    const [assigning, setAssigning] = useState(false);

    useEffect(() => {
        loadUnassignedCount();
    }, []);

    const loadUnassignedCount = async () => {
        try {
            const res = await fetch('/api/v1/cvv/unassigned');
            const data = await res.json();
            if (data.success) {
                setUnassignedCount(data.total_unassigned || 0);
            }
        } catch (error) {
            console.error('Error loading unassigned count:', error);
        }
    };

    const handleGenerate = async () => {
        if (quantity < 1 || quantity > 10000) {
            alert('La cantidad debe estar entre 1 y 10,000');
            return;
        }

        setGenerating(true);
        try {
            const res = await fetch(`/api/v1/coas/${token}/generate-cvv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quantity,
                    label_prefix: labelPrefix || undefined,
                    with_qr_token: withQRToken
                })
            });

            const data = await res.json();
            if (data.success) {
                alert(`${data.quantity} códigos CVV generados exitosamente`);
                loadCVVCodes();
                setShowCodes(true);
            } else {
                alert('Error al generar CVVs: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setGenerating(false);
        }
    };

    const loadCVVCodes = async () => {
        try {
            const res = await fetch(`/api/v1/coas/${token}/cvv-codes`);
            const data = await res.json();
            if (data.success) {
                setCvvCodes(data.data);
            }
        } catch (error) {
            console.error('Error loading CVVs:', error);
        }
    };

    const exportCSV = () => {
        if (cvvCodes.length === 0) return;

        const hasQRTokens = cvvCodes.some(c => c.qr_token);
        const headers = hasQRTokens
            ? ['CVV Code', 'QR Token', 'QR URL', 'Label ID', 'Generated At', 'Scans', 'Status']
            : ['CVV Code', 'Label ID', 'Generated At', 'Scans', 'Status'];

        const csvContent = [
            headers,
            ...cvvCodes.map(c => hasQRTokens ? [
                c.cvv_code,
                c.qr_token || '',
                c.qr_token ? `https://coa.extractoseum.com/preview/qr/${c.qr_token}` : '',
                c.label_id || '',
                new Date(c.generated_at).toLocaleDateString('es-MX'),
                c.scan_count.toString(),
                c.is_revoked ? 'Revoked' : 'Active'
            ] : [
                c.cvv_code,
                c.label_id || '',
                new Date(c.generated_at).toLocaleDateString('es-MX'),
                c.scan_count.toString(),
                c.is_revoked ? 'Revoked' : 'Active'
            ])
        ]
            .map(row => row.join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CVV-Codes-${token}.csv`;
        link.click();
    };

    const handleAssignFromInventory = async () => {
        if (assignQuantity < 1 || assignQuantity > unassignedCount) {
            alert(`Cantidad inválida. Disponibles: ${unassignedCount}`);
            return;
        }

        setAssigning(true);
        try {
            const res = await fetch('/api/v1/cvv/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coa_token: token,
                    quantity: assignQuantity
                })
            });

            const data = await res.json();
            if (data.success) {
                alert(`✅ ${data.assigned_count} hologramas asignados exitosamente`);
                loadUnassignedCount(); // Refresh inventory count
                loadCVVCodes(); // Refresh COA codes
                setShowCodes(true);
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div className="rounded-2xl border overflow-hidden print:hidden transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <div className="px-6 py-4 border-b transition-colors duration-300" style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}>
                <h3 className="font-semibold flex items-center" style={{ color: theme.text }}>
                    <Plus className="w-4 h-4 mr-2" style={{ color: theme.accent }} />
                    Generar Códigos de Verificación (CVV)
                </h3>
            </div>

            <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                            Cantidad de Códigos
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="10000"
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                            className="w-full border rounded-lg px-4 py-2 focus:outline-none transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                            placeholder="ej: 1000"
                        />
                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Máximo: 10,000 por lote</p>
                    </div>

                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                            Prefijo de Etiqueta (Opcional)
                        </label>
                        <input
                            type="text"
                            value={labelPrefix}
                            onChange={(e) => setLabelPrefix(e.target.value)}
                            className="w-full border rounded-lg px-4 py-2 focus:outline-none transition-colors duration-300"
                            style={{
                                backgroundColor: theme.inputBg,
                                borderColor: theme.inputBorder,
                                color: theme.text
                            }}
                            placeholder="ej: PETE-RSO"
                        />
                        <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Se numerarán automáticamente</p>
                    </div>

                    <div>
                        <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                            Tipo de Código
                        </label>
                        <div className="space-y-2">
                            <label
                                className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors"
                                style={{
                                    backgroundColor: withQRToken ? theme.accent + '20' : theme.inputBg,
                                    borderColor: withQRToken ? theme.accent : theme.inputBorder
                                }}
                            >
                                <input
                                    type="radio"
                                    checked={withQRToken}
                                    onChange={() => setWithQRToken(true)}
                                    className="w-3 h-3"
                                />
                                <QrCode className="w-4 h-4" style={{ color: theme.accent }} />
                                <span className="text-xs" style={{ color: theme.text }}>QR + CVV</span>
                            </label>
                            <label
                                className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors"
                                style={{
                                    backgroundColor: !withQRToken ? '#3b82f620' : theme.inputBg,
                                    borderColor: !withQRToken ? '#3b82f6' : theme.inputBorder
                                }}
                            >
                                <input
                                    type="radio"
                                    checked={!withQRToken}
                                    onChange={() => setWithQRToken(false)}
                                    className="w-3 h-3"
                                />
                                <span className="text-xs" style={{ color: theme.text }}>Solo CVV</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex-1 hover:opacity-90 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center"
                        style={{ backgroundColor: theme.accent }}
                    >
                        {generating ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Plus className="w-5 h-5 mr-2" />
                                Generar Códigos
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            loadCVVCodes();
                            setShowCodes(!showCodes);
                        }}
                        className="hover:opacity-90 text-white font-medium py-3 px-6 rounded-lg transition-all border"
                        style={{
                            backgroundColor: theme.cardBg2,
                            borderColor: theme.border
                        }}
                    >
                        {showCodes ? 'Ocultar' : 'Ver Códigos'}
                    </button>
                </div>

                {/* Option 2: Assign from Inventory */}
                {unassignedCount > 0 && (
                    <>
                        <div className="border-t pt-4 mt-4 transition-colors duration-300" style={{ borderColor: theme.border }}>
                            <h4 className="text-sm font-medium mb-3 flex items-center justify-between" style={{ color: theme.text }}>
                                <span>🏷️ Asignar desde Inventario de Hologramas</span>
                                <span style={{ color: theme.accent }}>{unassignedCount} disponibles</span>
                            </h4>

                            <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>
                                        Cantidad a Asignar
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={unassignedCount}
                                        value={assignQuantity}
                                        onChange={(e) => setAssignQuantity(parseInt(e.target.value) || 0)}
                                        className="w-full border rounded-lg px-4 py-2 focus:outline-none transition-colors duration-300"
                                        style={{
                                            backgroundColor: theme.inputBg,
                                            borderColor: theme.inputBorder,
                                            color: theme.text
                                        }}
                                        placeholder={`Max: ${unassignedCount}`}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={handleAssignFromInventory}
                                        disabled={assigning || assignQuantity > unassignedCount}
                                        className="w-full hover:opacity-90 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center"
                                        style={{ backgroundColor: '#3b82f6' }}
                                    >
                                        {assigning ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Asignando...
                                            </>
                                        ) : (
                                            <>
                                                📦 Asignar Hologramas
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {showCodes && cvvCodes.length > 0 && (
                    <div className="border-t pt-4 mt-4 transition-colors duration-300" style={{ borderColor: theme.border }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm" style={{ color: theme.textMuted }}>
                                Total: {cvvCodes.length} códigos generados
                            </span>
                            <button
                                onClick={exportCSV}
                                className="flex items-center text-sm text-white px-4 py-2 rounded-lg transition-all hover:opacity-90"
                                style={{ backgroundColor: theme.cardBg2 }}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Exportar CSV
                            </button>
                        </div>

                        <div className="rounded-lg max-h-64 overflow-y-auto transition-colors duration-300" style={{ backgroundColor: theme.cardBg3 }}>
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 border-b transition-colors duration-300" style={{ backgroundColor: theme.cardBg2, borderColor: theme.border }}>
                                    <tr>
                                        <th className="text-left px-4 py-2 font-medium" style={{ color: theme.textMuted }}>Código CVV</th>
                                        <th className="text-left px-4 py-2 font-medium" style={{ color: theme.textMuted }}>QR Token</th>
                                        <th className="text-left px-4 py-2 font-medium" style={{ color: theme.textMuted }}>Etiqueta</th>
                                        <th className="text-center px-4 py-2 font-medium" style={{ color: theme.textMuted }}>Escaneos</th>
                                        <th className="text-center px-4 py-2 font-medium" style={{ color: theme.textMuted }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y transition-colors duration-300" style={{ borderColor: theme.border }}>
                                    {cvvCodes.map((code) => (
                                        <tr key={code.id} className="transition-colors duration-300 hover:opacity-80">
                                            <td className="px-4 py-2 font-mono" style={{ color: theme.text }}>{code.cvv_code}</td>
                                            <td className="px-4 py-2 font-mono text-sm" style={{ color: code.qr_token ? theme.accent : theme.textMuted }}>
                                                {code.qr_token || '-'}
                                            </td>
                                            <td className="px-4 py-2" style={{ color: theme.textMuted }}>{code.label_id || '-'}</td>
                                            <td className="px-4 py-2 text-center">
                                                <span style={{ color: code.scan_count > 5 ? '#f87171' : theme.textMuted }}>
                                                    {code.scan_count}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 py-1 rounded text-xs ${code.is_revoked
                                                    ? 'bg-red-900/50 text-red-300'
                                                    : 'bg-emerald-900/50 text-emerald-300'
                                                    }`}>
                                                    {code.is_revoked ? 'Revocado' : 'Activo'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
