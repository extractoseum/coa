import { useState, useEffect, useRef } from 'react';
import { X, ShoppingCart, Search, Plus, Trash2, Link as LinkIcon, User, Package, ExternalLink, MessageCircle, Send, Loader2 } from 'lucide-react';
import { authFetch } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

// Supabase client for realtime subscriptions
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

interface Message {
    id: string;
    content: string;
    direction: 'inbound' | 'outbound';
    created_at: string;
    type?: string;
}

interface Conversation {
    id: string;
    contact_handle: string;
    channel: string;
}

interface SalesAgentPanelProps {
    onClose: () => void;
}

export default function SalesAgentPanel({ onClose }: SalesAgentPanelProps) {
    const { client } = useAuth();
    const [query, setQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [linkLoading, setLinkLoading] = useState(false);
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'chat' | 'search' | 'cart'>('chat');

    // Chat state
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [chatLoading, setChatLoading] = useState(true);
    const [newMessage, setNewMessage] = useState('');
    const [sendingMessage, setSendingMessage] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when new messages arrive
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (activeTab === 'chat') {
            scrollToBottom();
        }
    }, [messages, activeTab]);

    // Load conversation and messages for impersonated client
    useEffect(() => {
        const loadConversation = async () => {
            if (!client?.id) return;
            setChatLoading(true);
            try {
                const res = await authFetch(`/api/v1/crm/clients/${client.id}/conversation`);
                const data = await res.json();
                if (data.success && data.data) {
                    setConversation(data.data.conversation);
                    setMessages(data.data.messages || []);
                }
            } catch (err) {
                console.error('Error loading conversation:', err);
            } finally {
                setChatLoading(false);
            }
        };
        loadConversation();
    }, [client?.id]);

    // Realtime subscription for live messages
    useEffect(() => {
        if (!conversation?.id) return;

        const channel = supabase
            .channel(`sales_agent_messages_${conversation.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'crm_messages',
                    filter: `conversation_id=eq.${conversation.id}`
                },
                (payload: any) => {
                    if (payload.eventType === 'INSERT') {
                        setMessages((prev) => [...prev, payload.new]);
                        setTimeout(scrollToBottom, 200);
                    } else if (payload.eventType === 'UPDATE') {
                        setMessages((prev) => prev.map(m => m.id === payload.new.id ? payload.new : m));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversation?.id]);

    // Send message to conversation
    const handleSendMessage = async () => {
        if (!newMessage.trim() || !conversation?.id) return;
        setSendingMessage(true);
        try {
            const res = await authFetch(`/api/v1/crm/conversations/${conversation.id}/messages`, {
                method: 'POST',
                body: JSON.stringify({ content: newMessage, role: 'assistant' })
            });
            const data = await res.json();
            if (data.success) {
                setMessages([...messages, data.data]);
                setNewMessage('');
            }
        } catch (err) {
            console.error('Error sending message:', err);
        } finally {
            setSendingMessage(false);
        }
    };

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
        <div className="fixed inset-0 z-[150] flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity opacity-100"
                onClick={onClose}
            />

            {/* Sidebar Panel */}
            <div className="relative w-full max-w-md h-full bg-gray-900 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gray-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
                            <User className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white">Sales Agent Mode</h2>
                            <p className="text-xs text-gray-400">{client?.name || 'Cliente'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Tabs / Navigation */}
                <div className="flex p-2 gap-2 border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'chat' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        <MessageCircle className="w-4 h-4" />
                        Chat
                        {messages.length > 0 && (
                            <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{messages.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        <Search className="w-4 h-4" />
                        Catálogo
                    </button>
                    <button
                        onClick={() => setActiveTab('cart')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'cart' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    >
                        <ShoppingCart className="w-4 h-4" />
                        Carrito
                        {cart.length > 0 && (
                            <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{cart.length}</span>
                        )}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">

                    {/* CHAT TAB */}
                    {activeTab === 'chat' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {chatLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <MessageCircle className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="text-sm">Sin historial de conversación</p>
                                        <p className="text-xs opacity-60 mt-1">Este cliente no tiene mensajes</p>
                                    </div>
                                ) : (
                                    <>
                                        {messages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                                                        msg.direction === 'outbound'
                                                            ? 'bg-blue-500/20 border border-blue-500/30 rounded-br-none'
                                                            : 'bg-white/5 border border-white/10 rounded-bl-none'
                                                    }`}
                                                >
                                                    <div className="whitespace-pre-wrap leading-relaxed text-white">
                                                        {msg.content}
                                                    </div>
                                                </div>
                                                <span className="text-[9px] opacity-30 mt-1 font-mono px-1">
                                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                    {' • '}
                                                    {msg.direction === 'outbound' ? 'AGENTE' : 'CLIENTE'}
                                                </span>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </>
                                )}
                            </div>

                            {/* Message Input */}
                            {conversation && (
                                <div className="p-3 border-t border-white/10 bg-gray-800/50">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                            placeholder="Escribe un mensaje..."
                                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={sendingMessage || !newMessage.trim()}
                                            className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                                        >
                                            {sendingMessage ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <Send className="w-5 h-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SEARCH TAB */}
                    {activeTab === 'search' && (
                        <div className="flex-1 flex flex-col p-4 overflow-hidden">
                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar SKU o nombre..."
                                    className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    autoFocus
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                {loading && <div className="text-center py-4 text-gray-500">Buscando...</div>}

                                {!loading && products.length === 0 && (
                                    <div className="text-center py-10 text-gray-500 flex flex-col items-center">
                                        <Package className="w-10 h-10 mb-3 opacity-20" />
                                        <p>Empieza a buscar productos</p>
                                    </div>
                                )}

                                {products.map(product => (
                                    <div key={product.id} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/20 transition-colors group">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-medium text-white text-sm line-clamp-1">{product.name}</h3>
                                            <span className="text-xs text-gray-500 bg-black/30 px-2 py-0.5 rounded">{product.stock}</span>
                                        </div>

                                        <div className="space-y-1">
                                            {product.variants.map(variant => (
                                                <div key={variant.id} className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-white/5 rounded transition-colors">
                                                    <span className="text-gray-300 truncate max-w-[180px]">{variant.title}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-gray-400">${variant.price}</span>
                                                        <button
                                                            onClick={() => {
                                                                addToCart(product, variant.id);
                                                                // Optional: show toast
                                                            }}
                                                            className="p-1 hover:bg-blue-500 rounded text-blue-400 hover:text-white transition-colors"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* CART TAB */}
                    {activeTab === 'cart' && (
                        <div className="flex-1 flex flex-col p-4 overflow-hidden">
                            <div className="flex-1 overflow-y-auto space-y-3">
                                {cart.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500 flex flex-col items-center">
                                        <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
                                        <p>Tu carrito está vacío</p>
                                        <button onClick={() => setActiveTab('search')} className="mt-4 text-blue-400 hover:text-blue-300 text-sm">
                                            Ir al catálogo
                                        </button>
                                    </div>
                                ) : (
                                    cart.map(item => (
                                        <div key={item.variantId} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                                            <div className="overflow-hidden">
                                                <p className="text-sm text-white font-medium truncate">{item.productName}</p>
                                                <p className="text-xs text-gray-400">{item.variantName}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-blue-300 text-xs">${item.price}</span>
                                                    <span className="text-gray-600 text-xs">x</span>
                                                    <span className="text-white text-xs font-bold">{item.quantity}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-bold text-white">${(item.price * item.quantity).toFixed(2)}</span>
                                                <button
                                                    onClick={() => removeFromCart(item.variantId)}
                                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer (Always Visible) */}
                <div className="p-4 border-t border-white/10 bg-gray-800/80 backdrop-blur-md">
                    <div className="flex justify-between text-white mb-4">
                        <span className="text-gray-400">Total Estimado:</span>
                        <span className="font-bold text-xl">${cartTotal.toFixed(2)}</span>
                    </div>

                    {error && (
                        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-300">
                            {error}
                        </div>
                    )}

                    {invoiceUrl ? (
                        <div className="space-y-3">
                            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded flex items-center justify-between gap-2">
                                <div className="overflow-hidden">
                                    <p className="text-xs text-green-400 font-bold mb-0.5">Link Creado</p>
                                    <p className="text-[10px] text-green-300/70 truncate">{invoiceUrl}</p>
                                </div>
                                <a href={invoiceUrl} target="_blank" rel="noreferrer" className="p-2 bg-green-500/20 rounded hover:bg-green-500/30 text-green-400">
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>

                            <button
                                onClick={() => {
                                    window.open(`https://wa.me/${client?.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Aquí tienes el link para completar tu pedido: ${invoiceUrl}`)}`, '_blank');
                                }}
                                className="w-full py-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                            >
                                Enviar por WhatsApp
                            </button>

                            <button
                                onClick={() => { setInvoiceUrl(null); setCart([]); }}
                                className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm border border-white/10"
                            >
                                Nuevo Pedido
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={generateLink}
                            disabled={cart.length === 0 || linkLoading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
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
    );
}

