import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { ArrowLeft, Upload, Trash2, Check, Loader2, Image, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import Layout from '../components/Layout';
import { Screen } from '../telemetry/Screen';

interface Banner {
    id: string;
    title: string;
    description: string;
    image_url: string;
    link_url: string;
    is_active: boolean;
    created_at: string;
}

export default function BannerManagement() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [newImage, setNewImage] = useState<File | null>(null);
    const [newImagePreview, setNewImagePreview] = useState('');
    const [setAsActive, setSetAsActive] = useState(true);

    useEffect(() => { fetchBanners(); }, []);

    const fetchBanners = async () => {
        try {
            const res = await fetch('/api/v1/banners');
            const data = await res.json();
            if (data.success) setBanners(data.banners);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setNewImage(file);
            const reader = new FileReader();
            reader.onload = (e) => setNewImagePreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = async () => {
        if (!newImage) { alert('Por favor selecciona una imagen'); return; }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('image', newImage);
            formData.append('title', newTitle || 'Banner Promocional');
            formData.append('description', newDescription);
            formData.append('link_url', newLinkUrl);
            formData.append('is_active', setAsActive.toString());
            const res = await fetch('/api/v1/banners', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                alert('Banner creado exitosamente');
                setNewTitle(''); setNewDescription(''); setNewLinkUrl(''); setNewImage(null); setNewImagePreview(''); setSetAsActive(true);
                fetchBanners();
            } else { alert('Error: ' + data.error); }
        } catch (error) { console.error(error); alert('Error al subir el banner'); }
        finally { setUploading(false); }
    };

    const handleActivate = async (id: string) => {
        try {
            const res = await fetch(`/api/v1/banners/${id}/activate`, { method: 'POST' });
            const data = await res.json();
            if (data.success) fetchBanners();
        } catch (error) { console.error(error); }
    };

    const handleDeactivateAll = async () => {
        if (!confirm('Desactivar todos los banners?')) return;
        try {
            const res = await fetch('/api/v1/banners/deactivate-all', { method: 'POST' });
            const data = await res.json();
            if (data.success) fetchBanners();
        } catch (error) { console.error(error); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminar este banner permanentemente?')) return;
        try {
            const res = await fetch(`/api/v1/banners/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) fetchBanners();
        } catch (error) { console.error(error); }
    };

    const activeBanner = banners.find(b => b.is_active);

    return (
        <Screen id="BannerManagement">
            <Layout>
                <div className="p-4 md:p-8 pb-24">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center gap-4 mb-8">
                            <button onClick={() => navigate(ROUTES.dashboard)} className="p-2 rounded-lg transition-colors" style={{ color: theme.textMuted }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.cardBg2}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Gestion de Banners</h1>
                                <p className="text-sm" style={{ color: theme.textMuted }}>Banners promocionales para PDFs de COA</p>
                            </div>
                        </div>

                        {/* Active Banner */}
                        <div className="rounded-xl p-6 mb-8" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                <Check className="w-5 h-5" style={{ color: theme.accent }} />Banner Activo
                            </h2>
                            {activeBanner ? (
                                <div className="space-y-3">
                                    <img src={activeBanner.image_url} alt={activeBanner.title} className="w-full max-h-32 object-contain rounded-lg" style={{ backgroundColor: theme.cardBg2 }} />
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium" style={{ color: theme.text }}>{activeBanner.title}</p>
                                            {activeBanner.link_url && (
                                                <a href={activeBanner.link_url} target="_blank" rel="noopener noreferrer" className="text-sm flex items-center gap-1 hover:underline" style={{ color: theme.accent }}>
                                                    {activeBanner.link_url}<ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                        <button onClick={handleDeactivateAll} className="px-3 py-1 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>Desactivar</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8" style={{ color: theme.textMuted }}>
                                    <Image className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No hay banner activo</p>
                                </div>
                            )}
                        </div>

                        {/* Upload New */}
                        <div className="rounded-xl p-6 mb-8" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
                                <Upload className="w-5 h-5" style={{ color: '#3b82f6' }} />Subir Nuevo Banner
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Imagen del Banner (1200x200px recomendado)</label>
                                    <input type="file" accept="image/*" onChange={handleImageSelect} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0" style={{ color: theme.textMuted }} />
                                    {newImagePreview && (
                                        <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: theme.cardBg2 }}>
                                            <p className="text-xs mb-2" style={{ color: theme.textMuted }}>Vista previa:</p>
                                            <img src={newImagePreview} alt="Preview" className="w-full max-h-24 object-contain rounded" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Titulo (interno)</label>
                                    <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ej: Promo Diciembre 2024"
                                        className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <div>
                                    <label className="block text-sm mb-2" style={{ color: theme.textMuted }}>Descripcion (opcional)</label>
                                    <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descripcion breve"
                                        className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <div>
                                    <label className="block text-sm mb-2 flex items-center gap-2" style={{ color: theme.textMuted }}>
                                        <LinkIcon className="w-4 h-4" />URL de destino (opcional)
                                    </label>
                                    <input type="url" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://tutienda.com/promo"
                                        className="w-full px-4 py-2 rounded-lg focus:outline-none" style={{ backgroundColor: theme.cardBg2, border: `1px solid ${theme.border}`, color: theme.text }} />
                                </div>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={setAsActive} onChange={(e) => setSetAsActive(e.target.checked)} className="w-5 h-5 rounded" style={{ accentColor: theme.accent }} />
                                    <span className="text-sm" style={{ color: theme.text }}>Activar inmediatamente</span>
                                </label>
                                <button onClick={handleUpload} disabled={!newImage || uploading}
                                    className="w-full font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    style={{ backgroundColor: (!newImage || uploading) ? theme.cardBg2 : theme.accent, color: '#ffffff' }}>
                                    {uploading ? <><Loader2 className="w-5 h-5 animate-spin" />Subiendo...</> : <><Upload className="w-5 h-5" />Subir Banner</>}
                                </button>
                            </div>
                        </div>

                        {/* All Banners */}
                        <div className="rounded-xl p-6" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
                            <h2 className="text-lg font-semibold mb-4" style={{ color: theme.text }}>Todos los Banners</h2>
                            {loading ? (
                                <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: theme.textMuted }} /></div>
                            ) : banners.length === 0 ? (
                                <div className="text-center py-8" style={{ color: theme.textMuted }}><p>No hay banners creados</p></div>
                            ) : (
                                <div className="space-y-4">
                                    {banners.map((banner) => (
                                        <div key={banner.id} className="flex items-center gap-4 p-4 rounded-lg transition-colors"
                                            style={{ backgroundColor: banner.is_active ? `${theme.accent}20` : theme.cardBg2, border: `1px solid ${banner.is_active ? theme.accent : theme.border}` }}>
                                            <img src={banner.image_url} alt={banner.title} className="w-32 h-16 object-cover rounded" style={{ backgroundColor: theme.cardBg }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium truncate" style={{ color: theme.text }}>{banner.title}</p>
                                                    {banner.is_active && <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: theme.accent, color: '#ffffff' }}>Activo</span>}
                                                </div>
                                                {banner.description && <p className="text-sm truncate" style={{ color: theme.textMuted }}>{banner.description}</p>}
                                                <p className="text-xs" style={{ color: theme.textMuted }}>Creado: {new Date(banner.created_at).toLocaleDateString('es-MX')}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!banner.is_active && (
                                                    <button onClick={() => handleActivate(banner.id)} className="p-2 rounded-lg transition-colors" style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }} title="Activar">
                                                        <Check className="w-5 h-5" />
                                                    </button>
                                                )}
                                                <button onClick={() => handleDelete(banner.id)} className="p-2 rounded-lg transition-colors" style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }} title="Eliminar">
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Layout>
        </Screen>
    );
}
