import { useState, useEffect } from 'react';
import { X, ShoppingCart, Search, Plus, Trash2, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';

interface Product {
    id: number;
    name: string;
    price: string | number;
    stock: string;
    tags: string[];
    link: string;
    variants: Array<{
        id: number;
        title: string;
        price: string;
    }>;
}

interface CartItem {
    variantId: number;
    productId: number;
    productName: string;
    variantName: string;
    price: number;
    quantity: number;
}

interface SalesOrderModalProps {
    onClose: () => void;
}

export default function SalesOrderModal({ onClose }: SalesOrderModalProps) {
    const { client } = useAuth(); // Impersonated client
    const [query, setQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [linkLoading, setLinkLoading] = useState(false);
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
    const [error, setError] = useState('');

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 2) return;
            setLoading(true);
            try {
                const res = await authFetch(`/api/v1/products/search?query=${query}`);
                const data = await res.json();
                if (data.success) {
                    setProducts(data.products);
                }
            } catch (err) {
                console.error('Error searching products:', err);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    const addToCart = (product: Product, variantId: number) => {
        const variant = product.variants?.find(v => v.id === variantId) || { id: variantId, title: 'Default', price: product.price as string };

        setCart(prev => {
            const existing = prev.find(item => item.variantId === variantId);
            if (existing) {
                return prev.map(item => item.variantId === variantId ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, {
                variantId,
                productId: product.id,
                productName: product.name,
                variantName: variant.title,
                price: Number(variant.price),
                quantity: 1
            }];
        });
    };

    const removeFromCart = (variantId: number) => {
        setCart(prev => prev.filter(item => item.variantId !== variantId));
    };

    const generateLink = async () => {
        if (cart.length === 0) return;
        setLinkLoading(true);
        setError('');
        try {
            // client.shopify_id needs to be available. If not, we might fail or create guest order.
            const payload = {
                items: cart.map(item => ({ variantId: item.variantId, quantity: item.quantity })),
                customerId: client?.shopify_customer_id
            };

            const res = await authFetch('/api/v1/orders/draft', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setInvoiceUrl(data.invoiceUrl);
            } else {
                setError(data.error || 'Error generando link');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLinkLoading(false);
        }
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-white/10 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <ShoppingCart className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Sales Agent Mode</h2>
                            <p className="text-sm text-gray-400">Creando pedido para: {client?.name || 'Cliente'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Product Search */}
                    <div className="flex-1 p-4 border-r border-white/10 flex flex-col gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar productos (nombre, tag)..."
                                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                autoFocus
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2">
                            {loading ? (
                                <div className="text-center py-8 text-gray-500">Buscando...</div>
                            ) : products.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    {query ? 'No se encontraron productos' : 'Empieza a escribir para buscar'}
                                </div>
                            ) : (
                                products.map(product => (
                                    <div key={product.id} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-medium text-white">{product.name}</h3>
                                                <div className="flex gap-2 text-xs text-gray-400 mt-1">
                                                    <span>Stock: {product.stock}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            {product.variants.map(variant => (
                                                <div key={variant.id} className="flex items-center justify-between text-sm py-1 px-2 hover:bg-white/5 rounded">
                                                    <span className="text-gray-300">{variant.title} - ${variant.price}</span>
                                                    <button
                                                        onClick={() => addToCart(product, variant.id)}
                                                        className="p-1 hover:bg-blue-500/20 rounded-full text-blue-400"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: Cart & Actions */}
                    <div className="w-1/3 p-4 flex flex-col bg-black/20">
                        <h3 className="font-semibold text-white mb-4">Carrito Actual</h3>

                        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                            {cart.length === 0 ? (
                                <p className="text-sm text-gray-500 italic">Carrito vacío</p>
                            ) : (
                                cart.map(item => (
                                    <div key={item.variantId} className="flex items-center justify-between bg-white/5 p-2 rounded">
                                        <div className="overflow-hidden">
                                            <p className="text-sm text-white truncate">{item.productName}</p>
                                            <p className="text-xs text-gray-400">{item.variantName} x{item.quantity}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium">${item.price * item.quantity}</span>
                                            <button
                                                onClick={() => removeFromCart(item.variantId)}
                                                className="text-gray-500 hover:text-red-400"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="border-t border-white/10 pt-4 space-y-4">
                            <div className="flex justify-between text-white font-bold">
                                <span>Total Estimado:</span>
                                <span>${cartTotal.toFixed(2)}</span>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                                    {error}
                                </div>
                            )}

                            {invoiceUrl ? (
                                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded">
                                        <p className="text-xs text-green-400 mb-1">Link Generado:</p>
                                        <a
                                            href={invoiceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm text-green-300 underline break-all hover:text-green-200"
                                        >
                                            {invoiceUrl}
                                        </a>
                                    </div>

                                    <button
                                        onClick={() => {
                                            window.open(`https://wa.me/${client?.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Aquí tienes el link para completar tu pedido: ${invoiceUrl}`)}`, '_blank');
                                        }}
                                        className="w-full py-2 bg-[#25D366] hover:bg-[#20bd5a] text-black font-bold rounded-lg flex items-center justify-center gap-2"
                                    >
                                        Enviar por WhatsApp
                                    </button>

                                    <button
                                        onClick={() => { setInvoiceUrl(null); setCart([]); }}
                                        className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg"
                                    >
                                        Nuevo Pedido
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={generateLink}
                                    disabled={cart.length === 0 || linkLoading}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    {linkLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <LinkIcon className="w-4 h-4" />
                                            Generar Link de Pago
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
