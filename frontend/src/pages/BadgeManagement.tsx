import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Upload, Trash2, Award, Loader2 } from 'lucide-react';
import type { Badge } from '../types/coa';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

export default function BadgeManagement() {
    const { theme } = useTheme();
    const [badges, setBadges] = useState<Badge[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState('');
    const [uploading, setUploading] = useState(false);

    useEffect(() => { loadBadges(); }, []);

    const loadBadges = async () => {
        try {
            const res = await fetch('/api/v1/badges');
            const data = await res.json();
            if (data.success) setBadges(data.badges);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleCreate = async () => {
        if (!name || !imageFile) { alert('Nombre e imagen son requeridos'); return; }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('description', description);
            formData.append('image', imageFile);
            const res = await fetch('/api/v1/badges', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                alert('Badge creado exitosamente');
                setName(''); setDescription(''); setImageFile(null); setImagePreview('');
                loadBadges();
            } else { alert('Error: ' + data.error); }
        } catch (error) { console.error(error); alert('Error de conexion'); }
        finally { setUploading(false); }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Eliminar badge "${name}"?`)) return;
        try {
            const res = await fetch(`/api/v1/badges/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) { alert('Badge eliminado'); loadBadges(); }
            else { alert('Error: ' + data.error); }
        } catch (error) { console.error(error); alert('Error de conexion'); }
    };

    return (
        <Screen id="BadgeManagement">
            <Layout>
                <div className="sticky top-0 z-10 backdrop-blur-md" style={{ backgroundColor: theme.navBg, borderBottom: `1px solid ${theme.border}` }}>
                    <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link to="/dashboard" className="flex items-center" style={{ color: theme.textMuted }}>
                            <ChevronLeft className="w-5 h-5 mr-1" />Volver
                        </Link>
                        <h1 className="font-bold tracking-wider flex items-center" style={{ color: theme.accent }}>
                            <Award className="w-5 h-5 mr-2" />GESTION DE BADGES
                        </h1>
                        <div className="w-20"></div>
                    </div>
                </div>

                <main className="max-w-6xl mx-auto p-6 space-y-8 pb-24">
                    {/* Create Badge */}
                    <div className="rounded-2xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <h2 className="text-xl font-semibold mb-6 flex items-center" style={{ color: theme.text }}>
                            <Upload className="w-5 h-5 mr-2" style={{ color: theme.accent }} />Crear Nueva Insignia
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Nombre *</label>
                                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ej: EUM VERIFIED"
                                        className="w-full rounded-lg px-4 py-2" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Descripcion (Opcional)</label>
                                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripcion del badge..." rows={3}
                                        className="w-full rounded-lg px-4 py-2 resize-none" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <div>
                                    <label className="text-sm block mb-2" style={{ color: theme.textMuted }}>Imagen (PNG/SVG) *</label>
                                    <input type="file" accept="image/png,image/svg+xml" onChange={handleImageSelect}
                                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold"
                                        style={{ color: theme.textMuted }} />
                                    <p className="text-xs mt-1" style={{ color: theme.textMuted }}>Recomendado: PNG transparente, ~200x60px</p>
                                </div>
                                <button onClick={handleCreate} disabled={uploading || !name || !imageFile}
                                    className="w-full py-3 rounded-lg flex items-center justify-center font-medium"
                                    style={{ backgroundColor: (uploading || !name || !imageFile) ? theme.cardBg2 : theme.accent, color: '#ffffff' }}>
                                    {uploading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Upload className="w-5 h-5 mr-2" />}
                                    {uploading ? 'Creando...' : 'Crear Badge'}
                                </button>
                            </div>
                            <div className="flex items-center justify-center rounded-xl p-8" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}` }}>
                                {imagePreview ? (
                                    <div className="text-center">
                                        <p className="text-xs mb-4" style={{ color: theme.textMuted }}>Preview:</p>
                                        <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto" />
                                    </div>
                                ) : (
                                    <div className="text-center" style={{ color: theme.textMuted }}>
                                        <Award className="w-16 h-16 mx-auto mb-2 opacity-20" />
                                        <p className="text-sm">Selecciona una imagen para ver preview</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Badges List */}
                    <div className="rounded-2xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <h2 className="text-xl font-semibold mb-6" style={{ color: theme.text }}>Badges Disponibles ({badges.length})</h2>
                        {loading ? (
                            <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.accent }} /></div>
                        ) : badges.length === 0 ? (
                            <div className="text-center py-12" style={{ color: theme.textMuted }}>
                                <Award className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p>No hay badges creados aun</p>
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {badges.map((badge) => (
                                    <div key={badge.id} className="rounded-lg p-4 transition-colors"
                                        style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}` }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <h3 className="font-medium" style={{ color: theme.text }}>{badge.name}</h3>
                                                {badge.description && <p className="text-xs mt-1" style={{ color: theme.textMuted }}>{badge.description}</p>}
                                            </div>
                                            <button onClick={() => handleDelete(badge.id, badge.name)} className="ml-2" style={{ color: '#ef4444' }} title="Eliminar">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="rounded p-3 flex items-center justify-center h-20" style={{ backgroundColor: theme.cardBg }}>
                                            <img src={badge.image_url} alt={badge.name} className="max-h-16 max-w-full object-contain" />
                                        </div>
                                        <p className="text-xs mt-2" style={{ color: theme.textMuted }}>Creado: {new Date(badge.created_at).toLocaleDateString('es-MX')}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </Layout>
        </Screen>
    );
}
