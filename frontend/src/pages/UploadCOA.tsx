import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authFetch } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

export default function UploadCOA() {
    const { theme } = useTheme();
    const [files, setFiles] = useState<File[]>([]);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [savedToken, setSavedToken] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
            setResult(null);
            setError('');
            setSavedToken(null);
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setLoading(true);
        const formData = new FormData();
        files.forEach(file => {
            formData.append('pdf', file);
        });

        try {
            const res = await authFetch('/api/v1/upload/extract', {
                method: 'POST',
                body: formData,
            });

            const json = await res.json();
            if (json.success) {
                setResult(json.data);
            } else {
                setError(json.error || 'Error desconocido');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexion con el backend');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!result || files.length === 0) return;

        setIsSaving(true);
        const formData = new FormData();
        files.forEach(file => {
            formData.append('pdf', file);
        });
        formData.append('extractedData', JSON.stringify(result));

        try {
            const res = await authFetch('/api/v1/coas', {
                method: 'POST',
                body: formData,
            });

            const json = await res.json();
            if (json.success) {
                setSavedToken(json.token);
            } else {
                setError(json.error || 'Error al guardar');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexion al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Screen id="UploadCOA">
            <Layout>
                {/* Header */}
                <div
                    className="sticky top-0 z-10 backdrop-blur-md"
                    style={{
                        backgroundColor: theme.navBg,
                        borderBottom: `1px solid ${theme.border}`,
                    }}
                >
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            to="/dashboard"
                            className="transition-colors"
                            style={{ color: theme.textMuted }}
                            onMouseEnter={(e) => e.currentTarget.style.color = theme.text}
                            onMouseLeave={(e) => e.currentTarget.style.color = theme.textMuted}
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </Link>
                        <span className="font-bold tracking-wider" style={{ color: theme.accent }}>
                            SUBIR COA
                        </span>
                        <div className="w-6" />
                    </div>
                </div>

                <div className="p-4 md:p-8 pb-24 flex flex-col items-center">
                    <div className="max-w-2xl w-full space-y-8">

                        <div className="text-center">
                            <h1 className="text-3xl font-bold mb-2" style={{ color: theme.accent }}>
                                Extractor de PDF (IA) v2
                            </h1>
                            <p style={{ color: theme.textMuted }}>Sube uno o varios COAs (promedio automatico).</p>
                        </div>

                        {/* Upload Box */}
                        <div
                            className="rounded-xl p-8 border-2 border-dashed flex flex-col items-center justify-center transition-colors"
                            style={{
                                backgroundColor: theme.cardBg,
                                borderColor: theme.border,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                        >
                            <Upload className="w-12 h-12 mb-4" style={{ color: theme.accent }} />
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={handleFileChange}
                                className="hidden"
                                id="pdf-upload"
                                multiple
                            />
                            <label
                                htmlFor="pdf-upload"
                                className="cursor-pointer px-6 py-2 rounded-lg font-medium transition-colors"
                                style={{ backgroundColor: theme.accent, color: '#ffffff' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.accentHover}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.accent}
                            >
                                Seleccionar PDF(s)
                            </label>
                            {files.length > 0 && (
                                <div className="mt-4 w-full">
                                    <p className="text-sm mb-2 text-center" style={{ color: theme.textMuted }}>
                                        {files.length} archivo(s) seleccionado(s):
                                    </p>
                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                        {files.map((f, i) => (
                                            <span
                                                key={i}
                                                className="text-sm flex items-center justify-center"
                                                style={{ color: theme.accent }}
                                            >
                                                <FileText className="w-4 h-4 mr-1" /> {f.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={handleUpload}
                                disabled={files.length === 0 || loading || !!savedToken}
                                className="flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all"
                                style={{
                                    background: files.length === 0 || loading || !!savedToken
                                        ? theme.cardBg2
                                        : `linear-gradient(135deg, ${theme.accent} 0%, #059669 100%)`,
                                    color: files.length === 0 || loading || !!savedToken ? theme.textMuted : '#ffffff',
                                    cursor: files.length === 0 || loading || !!savedToken ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {loading ? 'Procesando IA...' : `Analizar ${files.length > 1 ? 'y Promediar' : 'Documento'}`}
                            </button>

                            {result && !savedToken && (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 py-4 rounded-xl font-bold text-lg shadow-lg transition-all"
                                    style={{
                                        backgroundColor: theme.cardBg,
                                        color: isSaving ? theme.textMuted : theme.accent,
                                        border: `1px solid ${theme.accent}50`,
                                        cursor: isSaving ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isSaving ? 'Guardando...' : 'Guardar en Base de Datos'}
                                </button>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div
                                className="p-4 rounded-lg flex items-center"
                                style={{
                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                    border: '1px solid rgba(239, 68, 68, 0.5)',
                                    color: '#ef4444',
                                }}
                            >
                                <AlertTriangle className="w-5 h-5 mr-2" /> {error}
                            </div>
                        )}

                        {/* Success Token */}
                        {savedToken && (
                            <div
                                className="p-6 rounded-lg text-center"
                                style={{
                                    backgroundColor: `${theme.accent}20`,
                                    border: `1px solid ${theme.accent}50`,
                                }}
                            >
                                <CheckCircle className="w-12 h-12 mx-auto mb-2" style={{ color: theme.accent }} />
                                <h3 className="text-xl font-bold mb-2" style={{ color: theme.text }}>COA Guardado con Exito!</h3>
                                <p className="mb-4" style={{ color: theme.accent }}>Tu documento esta seguro en la nube.</p>
                                <div
                                    className="p-4 rounded break-all font-mono text-sm"
                                    style={{
                                        backgroundColor: 'rgba(0,0,0,0.3)',
                                        border: `1px solid ${theme.accent}50`,
                                        color: theme.textMuted,
                                    }}
                                >
                                    Token Publico: <span className="font-bold" style={{ color: theme.text }}>{savedToken}</span>
                                </div>
                                <div className="mt-4 text-xs" style={{ color: theme.textMuted }}>
                                    (En la siguiente fase podras ver el Visualizador Publico con este token)
                                </div>
                            </div>
                        )}

                        {/* Results */}
                        {result && !savedToken && (
                            <div
                                className="rounded-xl p-6"
                                style={{
                                    backgroundColor: theme.cardBg,
                                    border: `1px solid ${theme.border}`,
                                }}
                            >
                                <div
                                    className="flex items-center justify-between mb-4 pb-4"
                                    style={{ borderBottom: `1px solid ${theme.border}` }}
                                >
                                    <h2 className="text-xl font-semibold flex items-center" style={{ color: theme.accent }}>
                                        <CheckCircle className="w-5 h-5 mr-2" /> Resultado
                                    </h2>
                                    <span
                                        className="text-xs px-2 py-1 rounded font-bold uppercase"
                                        style={{
                                            backgroundColor: result.compliance_status === 'pass' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                            color: result.compliance_status === 'pass' ? '#22c55e' : '#ef4444',
                                        }}
                                    >
                                        {result.compliance_status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    {[
                                        { label: 'Laboratorio', value: result.lab_name },
                                        { label: 'Fecha', value: result.analysis_date || 'N/A' },
                                        { label: 'Batch ID', value: result.batch_id || 'N/A' },
                                        { label: 'Compliance THC', value: result.thc_compliance_flag ? 'OK (<1%)' : 'ALTO (>1%)' },
                                    ].map((item) => (
                                        <div key={item.label}>
                                            <span className="text-xs block" style={{ color: theme.textMuted }}>{item.label}</span>
                                            <span className="font-medium" style={{ color: theme.text }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>

                                <h3 className="font-medium mb-2" style={{ color: theme.textMuted }}>Tests Adicionales</h3>
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {[
                                        ['Metales Pesados', result.heavy_metals_status],
                                        ['Pesticidas', result.pesticides_status],
                                        ['Solventes Res.', result.residual_solvents_status],
                                        ['Materia Extrana', result.foreign_matter_status]
                                    ].filter(([, status]) => status).map(([label, status]: any) => (
                                        <div
                                            key={label}
                                            className="p-2 rounded flex justify-between items-center"
                                            style={{
                                                backgroundColor: theme.cardBg2,
                                                border: `1px solid ${theme.border}`,
                                            }}
                                        >
                                            <span className="text-xs" style={{ color: theme.textMuted }}>{label}</span>
                                            <span
                                                className="text-xs font-bold uppercase"
                                                style={{
                                                    color: status === 'pass' ? '#22c55e' : status === 'fail' ? '#ef4444' : theme.textMuted,
                                                }}
                                            >
                                                {status === 'not_tested' ? 'N/A' : status}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <h3 className="font-medium mb-2" style={{ color: theme.textMuted }}>Cannabinoides Detectados</h3>
                                <div className="space-y-2">
                                    {result.cannabinoids.map((c: any, i: number) => (
                                        <div
                                            key={i}
                                            className="flex justify-between px-3 py-2 rounded"
                                            style={{ backgroundColor: theme.cardBg2 }}
                                        >
                                            <span className="text-sm font-mono" style={{ color: theme.accent }}>{c.analyte}</span>
                                            <div className="text-right">
                                                <span className="text-sm font-bold" style={{ color: theme.text }}>{c.result_pct}%</span>
                                                {c.result_mg_g && <span className="text-xs ml-2" style={{ color: theme.textMuted }}>({c.result_mg_g} mg/g)</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
