import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { telemetry } from '../services/telemetryService';
import {
    Activity, ArrowLeft, ArrowRight, Brain, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight,
    ChevronUp, Circle, Clock, Copy, Edit2, ExternalLink, Eye, Filter, Grid,
    LayoutGrid, Loader2, Mail, MessageCircle, MessageSquare, MoreHorizontal, MoreVertical,
    Paperclip, Phone, PhoneCall, Plus, Search, Send, Settings, Share2, ShoppingBag, ShoppingCart,
    Trash2, User, Users, X, PanelRightOpen, PanelRightClose, Play, Pause, AlertTriangle, Zap,
    FileText, Instagram, Ticket, Volume2, Mic, Archive, CreditCard,
    Upload, LogOut, Inbox, Image as ImageIcon, Video, CheckCircle, Hash, Shield, Info, Download,
    RefreshCw, BarChart2, Layout as LucideLayout, MapPin, Smartphone, Lock, Globe, Database, Server,
    Cpu, Thermometer, Truck, Package, DollarSign, Menu, LayoutDashboard, Sliders, Layers,
    PauseCircle, PlayCircle, StopCircle, Maximize2, File, FilePlus, Folder, FolderPlus, Save, Edit,
    Flag, AlertCircle, HelpCircle, LifeBuoy, Wrench, List, Columns, Sidebar, Monitor, Tablet,
    Wifi, Battery, Signal, Bluetooth, Cast, Radio, Cloud, CloudRain, CloudSnow, CloudLightning, Sun,
    Moon, Wind, Droplet, Bell, Bookmark, Camera, Headphones, Speaker, MicOff, VideoOff, PhoneMissed,
    PhoneOutgoing, PhoneIncoming, PhoneForwarded, Voicemail, Tag, Gift, Percent, TrendingUp,
    TrendingDown, PieChart, Activity as Pulse, // Activity alias
    Award, Star, Heart, ThumbsUp, ThumbsDown, Smile, Frown, FileBox, Facebook
} from 'lucide-react';
import { MessageAudioPlayer } from '../components/MessageAudioPlayer';
import { IdentityResolutionCard } from '../components/IdentityResolutionCard';
import ToolEditor from '../components/ToolEditor';
import OrchestratorConfig from '../components/OrchestratorConfig';
import { VoiceSelector } from '../components/VoiceSelector';
import KanbanCard from '../components/KanbanCard';
import type { Column, Conversation, AgentMetadata, ToolRegistryItem, ContactSnapshot } from '../types/crm';
import { getAvatarGradient, getTagColor, getChannelIcon } from '../utils/crmUtils';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../telemetry/Screen';
import AppLayout from '../components/Layout';
import { ROUTES } from '../routes';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Init Supabase Client for Realtime (with fallback for test/CI environments)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Interfaces moved to ../types/crm.ts

const AdminCRM: React.FC = () => {
    // Build version: 2025-12-20-16-05
    const { theme, setThemeMode: setTheme } = useTheme(); // Aliased for compatibility
    const { client: user, isSuperAdmin } = useAuth(); // Client aliased to user for compatibility
    const navigate = useNavigate();
    const token = localStorage.getItem('accessToken');

    const [columns, setColumns] = useState<Column[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

    // Hide global navigation on mobile when chat is open
    useEffect(() => {
        if (selectedConv) {
            document.body.classList.add('mobile-chat-active');
        } else {
            document.body.classList.remove('mobile-chat-active');
        }
        return () => document.body.classList.remove('mobile-chat-active');
    }, [selectedConv]);
    const [selectedTab, setSelectedTab] = useState<'chat' | 'client' | 'orders' | 'insights'>('chat');
    const [selectedColumn, setSelectedColumn] = useState<Column | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [agentsMetadata, setAgentsMetadata] = useState<AgentMetadata[]>([]);
    const [toolsRegistry, setToolsRegistry] = useState<ToolRegistryItem[]>([]);
    const [messages, setMessages] = useState<any[]>([]);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [showResourceDock, setShowResourceDock] = useState(false);
    const [resourceDockTab, setResourceDockTab] = useState<'tools' | 'client' | 'orders' | 'insights' | 'behavior'>('tools');
    const [newMessage, setNewMessage] = useState('');
    const [contactSnapshot, setContactSnapshot] = useState<ContactSnapshot | null>(null);
    const [loadingSnapshot, setLoadingSnapshot] = useState(false);
    const [showToolEditor, setShowToolEditor] = useState(false);
    const [showOrchestrator, setShowOrchestrator] = useState(false);
    const [clientOrders, setClientOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [orderDetails, setOrderDetails] = useState<any | null>(null);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [browsingEvents, setBrowsingEvents] = useState<any[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sidePanelWidth, setSidePanelWidth] = useState(() => {
        const saved = localStorage.getItem('crm_sidePanelWidth');
        return saved ? parseInt(saved, 10) : 800;
    });
    const [resourceDockWidth, setResourceDockWidth] = useState(() => {
        const saved = localStorage.getItem('crm_resourceDockWidth');
        return saved ? parseInt(saved, 10) : 384;
    });
    const [isResizingSidePanel, setIsResizingSidePanel] = useState(false);
    const [isResizingResourceDock, setIsResizingResourceDock] = useState(false);

    const filteredConversations = useMemo(() => {
        let base = conversations;
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            const rawSearch = searchTerm.replace(/\D/g, ''); // Extract only digits for phone matching

            base = conversations.filter(c => {
                const handle = c.contact_handle?.toLowerCase() || '';
                const rawHandle = handle.replace(/\D/g, '');
                const name = (c.contact_name || c.facts?.user_name || '').toLowerCase();
                const email = (c.facts?.user_email || '').toLowerCase();
                const summary = (c.summary || '').toLowerCase();

                return handle.includes(s) ||
                    (rawSearch && rawHandle.includes(rawSearch)) ||
                    name.includes(s) ||
                    email.includes(s) ||
                    summary.includes(s) ||
                    c.tags?.some(t => t.toLowerCase().includes(s));
            });
        }

        // --- PHASE 60: AUTO-SORTING ---
        // Ensure the latest interactions are always visible at the top of their columns
        return [...base].sort((a, b) => {
            const timeA = new Date(a.last_message_at || 0).getTime();
            const timeB = new Date(b.last_message_at || 0).getTime();
            return timeB - timeA;
        });
    }, [conversations, searchTerm]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Persistence Logic
    useEffect(() => {
        localStorage.setItem('crm_sidePanelWidth', sidePanelWidth.toString());
    }, [sidePanelWidth]);

    useEffect(() => {
        localStorage.setItem('crm_resourceDockWidth', resourceDockWidth.toString());
    }, [resourceDockWidth]);

    // Resizing Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizingSidePanel) {
                const newWidth = window.innerWidth - e.clientX;
                setSidePanelWidth(Math.max(400, Math.min(newWidth, window.innerWidth - 100)));
            }
            if (isResizingResourceDock) {
                const newDockWidth = window.innerWidth - e.clientX;
                // Ensure dock doesn't exceed panel width minus minimal chat space
                const maxDockWidth = sidePanelWidth - 300;
                setResourceDockWidth(Math.max(250, Math.min(newDockWidth, maxDockWidth)));
            }
        };

        const handleMouseUp = () => {
            setIsResizingSidePanel(false);
            setIsResizingResourceDock(false);
            document.body.style.cursor = 'default';
        };

        if (isResizingSidePanel || isResizingResourceDock) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'auto';
        };
    }, [isResizingSidePanel, isResizingResourceDock, sidePanelWidth]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (selectedTab === 'chat') {
            scrollToBottom();
        }
    }, [messages, selectedTab]);

    useEffect(() => {
        if (resourceDockTab === 'orders' && selectedConv && showResourceDock) {
            // Check for email in facts or contact info
            const email = selectedConv.facts?.user_email || (selectedConv.contact_handle.includes('@') ? selectedConv.contact_handle : undefined);
            fetchClientOrders(selectedConv.contact_handle, email);
        }
    }, [resourceDockTab, selectedConv, showResourceDock]);

    const fetchClientOrders = async (handle: string, email?: string) => {
        if (!handle) return;
        setLoadingOrders(true);
        try {
            let url = `/api/v1/crm/contacts/${encodeURIComponent(handle)}/orders`;
            if (email) url += `?email=${encodeURIComponent(email)}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setClientOrders(data.data);
            }
        } catch (err) {
            console.error('Failed to fetch orders', err);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleActionClick = async (action: any) => {
        if (action.action_type === 'link' && action.payload?.url) {
            window.open(action.payload.url, '_blank');
        } else if (action.action_type === 'coupon') {
            try {
                // Real call to Shopify via backend
                const res = await fetch('/api/v1/crm/coupons', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        discount: action.payload?.discount,
                        code: action.payload?.code
                    })
                });
                const data = await res.json();
                if (data.success) {
                    alert(`¡Cupón "${action.payload?.code}" creado con éxito en Shopify!`);
                } else {
                    alert(`Error: ${data.error || 'No se pudo crear el cupón'}`);
                }
            } catch (err: any) {
                alert(`Error de red: ${err.message}`);
            }
        } else {
            alert(`Ejecutando: ${action.label}`);
        }
    };

    // Helpers moved to ../utils/crmUtils.ts

    const handleSimulateVisit = async () => {
        if (!selectedConv) return;
        const confirm = window.confirm('¿Simular visita a tienda para este cliente?');
        if (!confirm) return;

        try {
            const res = await fetch('/api/v1/behavior/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event_type: 'view_product',
                    handle: selectedConv.contact_handle,
                    url: 'https://extractoseum.com/products/delta-8-vape',
                    metadata: {
                        product_name: 'Simulated Product Visit',
                        price: 450,
                        query: 'Simulation'
                    }
                })
            });
            if (res.ok) {
                setTimeout(() => {
                    alert('Visita simulada correctamente. Refrescando datos...');
                    fetchBrowsingEvents(selectedConv.contact_handle);
                }, 1000);
            }
        } catch (e) {
            console.error('Simulation failed', e);
        }
    };

    const fetchOrderDetails = async (shopifyOrderId: string) => {
        if (expandedOrderId === shopifyOrderId) {
            setExpandedOrderId(null);
            return;
        }

        setExpandedOrderId(shopifyOrderId);
        setLoadingDetails(true);
        setOrderDetails(null);
        setDetailsError(null);

        try {
            // Use component-scoped token (accessToken)
            const response = await fetch(`/api/v1/crm/orders/${shopifyOrderId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text.substring(0, 50)}`);
            }

            const data = await response.json();
            if (data.success) {
                setOrderDetails(data.data);
            } else {
                console.warn('Backend returned error:', data.error);
                setDetailsError(data.error || 'Unknown Backend Error');
            }
        } catch (error: any) {
            console.error('Error fetching order details:', error);
            setDetailsError(error.message || 'Network/Parse Error');
        } finally {
            setLoadingDetails(false);
        }
    };

    const models = [
        { id: 'gpt-4o', name: 'GPT-4o (Stable)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
        { id: 'o1-preview', name: 'OpenAI o1 Preview' },
        { id: 'o1-mini', name: 'OpenAI o1 Mini' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Futuristic)' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Futuristic)' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
        { id: 'gemini-flash-latest', name: 'Gemini 1.5 Flash (Legacy)' }
    ];

    const getToolIcon = (category: string) => {
        switch (category) {
            case 'whatsapp': return <MessageCircle size={14} className="text-green-500" />;
            case 'mail': return <Mail size={14} className="text-blue-400" />;
            case 'shopify': return <Globe size={14} className="text-green-400" />;
            case 'shopping-bag': return <ShoppingBag size={14} className="text-pink-400" />;
            case 'shopping-cart': return <ShoppingCart size={14} className="text-purple-400" />;
            case 'bell': return <Bell size={14} className="text-yellow-400" />;
            case 'truck': return <Truck size={14} className="text-orange-400" />;
            case 'orders': return <LucideLayout size={14} className="text-indigo-400" />;
            case 'users': return <Database size={14} className="text-cyan-400" />;
            case 'system': return <Activity size={14} className="text-red-400" />;
            case 'files': return <FileBox size={14} className="text-gray-400" />;
            case 'search': return <Search size={14} className="text-blue-500" />;
            default: return <Wrench size={14} className="text-pink-500" />;
        }
    };

    // Keep selected conversation in sync with the list (for facts updates)
    useEffect(() => {
        if (selectedConv) {
            const updated = conversations.find(c => c.id === selectedConv.id);
            if (updated) {
                const hasChanged =
                    updated.contact_name !== selectedConv.contact_name ||
                    updated.status !== selectedConv.status ||
                    updated.column_id !== selectedConv.column_id ||
                    updated.summary !== selectedConv.summary ||
                    JSON.stringify(updated.facts) !== JSON.stringify(selectedConv.facts);

                if (hasChanged) {
                    setSelectedConv(updated);
                }
            }
        }
    }, [conversations, selectedConv]);

    // Lazy Analysis on Selection - PHASE 30
    useEffect(() => {
        if (selectedConv && !loadingEvents) {
            const lacksAnalysis = !selectedConv.facts ||
                !selectedConv.facts.action_plan ||
                selectedConv.facts.action_plan.length === 0 ||
                !selectedConv.facts.emotional_vibe;

            if (lacksAnalysis) {
                console.log('[CRM] Selection-triggered analysis for:', selectedConv.id);
                handleRecalibrate();
            }
        }
    }, [selectedConv?.id]); // Only trigger when ID actually changes

    useEffect(() => {
        telemetry.log('AdminCRM_Viewed', { user: user?.email });
        fetchData();
    }, []);

    const fetchMessages = async (convId: string) => {
        try {
            const res = await fetch(`/api/v1/crm/conversations/${convId}/messages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setMessages(data.data);
                setTimeout(scrollToBottom, 500);
            }
        } catch (err) {
            console.error('Failed to fetch messages');
        }
    };

    useEffect(() => {
        if (selectedConv) {
            fetchMessages(selectedConv.id);
        } else {
            setMessages([]);
        }
    }, [selectedConv]);

    // Realtime Subscription
    useEffect(() => {
        // 1. Conversations Updates (Facts, Status, etc) - PHASE 29
        const convChannel = supabase
            .channel('crm_conversations_sync')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for INSERT and UPDATE (PHASE 60)
                    schema: 'public',
                    table: 'conversations'
                },
                (payload: any) => {
                    console.log('[CRM] Realtime Conversation Sync:', payload.eventType, payload.new.id);
                    if (payload.eventType === 'INSERT') {
                        setConversations((prev) => {
                            const exists = prev.some(c => c.id === payload.new.id);
                            if (exists) return prev;
                            return [payload.new, ...prev];
                        });
                    } else if (payload.eventType === 'UPDATE') {
                        setConversations((prev) =>
                            prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(convChannel);
        };
    }, []);

    useEffect(() => {
        if (!selectedConv) return;

        const channel = supabase
            .channel('crm_messages_updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'crm_messages',
                    filter: `conversation_id=eq.${selectedConv.id}`
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
    }, [selectedConv]);

    // Customer 360 Fetcher
    useEffect(() => {
        if (selectedConv && resourceDockTab === 'insights' && showResourceDock) {
            // fetchBrowsingEvents(selectedConv.contact_handle); // Moved to 'behavior' tab
        }
    }, [selectedConv, resourceDockTab, showResourceDock]);

    useEffect(() => {
        if (resourceDockTab === 'insights' && selectedConv && showResourceDock) {
            const email = selectedConv.facts?.user_email || (selectedConv.contact_handle.includes('@') ? selectedConv.contact_handle : undefined);
            fetchBrowsingEvents(selectedConv.contact_handle, email);
        }
    }, [selectedConv, resourceDockTab, showResourceDock]);

    useEffect(() => {
        if (selectedConv && resourceDockTab === 'client' && showResourceDock) {
            fetchSnapshot(selectedConv.contact_handle, selectedConv.channel);
        }
    }, [selectedConv, resourceDockTab, showResourceDock]);

    const fetchSnapshot = async (handle: string, channel: string) => {
        setLoadingSnapshot(true);
        try {
            const res = await fetch(`/api/v1/crm/contacts/${encodeURIComponent(handle)}/snapshot?channel=${channel}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setContactSnapshot(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch snapshot', e);
        } finally {
            setLoadingSnapshot(false);
        }
    };

    const handleRecalibrate = async () => {
        if (!selectedConv) return;
        setLoadingEvents(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/sync-facts`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                // Refresh conversations to get new facts (Sidebar)
                await fetchData();
                // Browsing events might have changed too (if linked newly)
                const email = selectedConv.facts?.user_email;
                fetchBrowsingEvents(selectedConv.contact_handle, email);
            }
        } catch (e) {
            console.error('Failed to recalibrate', e);
        } finally {
            setLoadingEvents(false);
        }
    };

    const fetchBrowsingEvents = async (handle: string, email?: string) => {
        if (!handle) return;
        setLoadingEvents(true);
        try {
            let url = `/api/v1/behavior/activity/${encodeURIComponent(handle)}`;
            if (email) url += `?email=${encodeURIComponent(email)}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setBrowsingEvents(data.events);
            }
        } catch (err) {
            console.error('Failed to fetch browsing events', err);
        } finally {
            setLoadingEvents(false);
        }
    };

    const parseMediaContent = (content: string) => {
        // 1. Link Preview
        if (content.startsWith('[Link Preview]')) {
            // format: [Link Preview] [Title](Url)\n> Description
            const linkMatch = content.match(/\[Link Preview\] \[(.*?)\]\((.*?)\)(\n> (.*))?/s);
            if (linkMatch) {
                const title = linkMatch[1];
                const url = linkMatch[2];
                const desc = linkMatch[4];
                return (
                    <div className="mt-1 mb-1">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-black/20 rounded-xl overflow-hidden border border-white/10 hover:border-pink-500/30 transition-all group">
                            <div className="p-3 bg-white/5 border-b border-white/5">
                                <h4 className="text-sm font-bold text-pink-400 group-hover:underline truncate">{title}</h4>
                                {desc && <p className="text-[10px] opacity-70 mt-1 line-clamp-2">{desc}</p>}
                            </div>
                            <div className="px-3 py-2 bg-black/10 flex items-center justify-between">
                                <span className="text-[9px] opacity-40 truncate flex-1">{new URL(url).hostname}</span>
                                <ExternalLink size={10} className="opacity-40" />
                            </div>
                        </a>
                    </div>
                );
            }
        }

        // 2. Location
        if (content.startsWith('[Ubicación]')) {
            // format: [Ubicación](Url) Lat: x, Long: y
            const locMatch = content.match(/\[Ubicación\]\((.*?)\) Lat: (.*?), Long: (.*)/);
            if (locMatch) {
                const url = locMatch[1];
                return (
                    <div className="mt-1">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-64 h-32 bg-gray-800 rounded-xl overflow-hidden relative group border border-white/10">
                            {/* Fake Map Preview with Gradient if no real API */}
                            <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=40.714728,-73.998672&zoom=12&size=400x400&key=YOUR_API_KEY')] bg-cover bg-center opacity-50 group-hover:opacity-70 transition-opacity flex items-center justify-center">
                                <MapPin size={32} className="text-red-500 drop-shadow-lg" />
                            </div>
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-sm p-2 text-[10px] text-white font-mono truncate">
                                📍 Ubicación Compartida
                            </div>
                        </a>
                    </div>
                );
            }
        }

        // 3. Order
        if (content.startsWith('[Pedido WhatsApp]')) {
            // format: [Pedido WhatsApp]: 2x Item (Total: ...)
            return (
                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-dashed border-pink-500/30 flex items-center gap-3">
                    <div className="p-2 bg-pink-500/10 rounded-lg">
                        <ShoppingBag size={18} className="text-pink-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs font-bold text-white">Pedido WhatsApp</p>
                        <p className="text-[10px] opacity-70 mt-0.5">{content.replace('[Pedido WhatsApp]: ', '')}</p>
                    </div>
                </div>
            );
        }

        // 4. Poll
        if (content.startsWith('[Encuesta]')) {
            return (
                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-cyan-400">
                        <BarChart2 size={14} /> Encuesta
                    </div>
                    <p className="text-sm italic opacity-80">{content.replace('[Encuesta]: ', '')}</p>
                </div>
            );
        }

        // 5. Contact
        if (content.startsWith('[Contacto Compartido]')) {
            return (
                <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xl">👤</div>
                    <div>
                        <p className="text-xs font-bold text-white">{content.replace('[Contacto Compartido]: ', '')}</p>
                        <p className="text-[9px] opacity-50">Contacto compartido</p>
                    </div>
                </div>
            );
        }


        // Legacy / Standard Media regex
        const urlMatch = content.match(/\[(Image|Audio|Video|File|Sticker)\]\((.*?)\)/);
        if (urlMatch) {
            const type = urlMatch[1];
            const url = urlMatch[2];
            const caption = content.replace(urlMatch[0], '').trim();

            if (type === 'Audio') {
                // Check for Rich Transcript format:
                // > 🎙️ **Transcripción:** ...
                // > 💡 **Resumen:** ...
                // > 🏷️ **Intención:** ...
                const transcriptMatch = content.match(/> 🎙️ \*\*Transcripción:\*\*\s*([\s\S]*?)(?=\n>|$)/);
                const summaryMatch = content.match(/> 💡 \*\*Resumen:\*\*\s*([\s\S]*?)(?=\n>|$)/);
                const intentMatch = content.match(/> 🏷️ \*\*Intención:\*\*\s*([\s\S]*?)(?=\n>|$)/);

                return (
                    <div className="mt-2">
                        <MessageAudioPlayer
                            audioUrl={url}
                            transcript={transcriptMatch ? transcriptMatch[1] : undefined}
                            summary={summaryMatch ? summaryMatch[1] : undefined}
                            intent={intentMatch ? intentMatch[1] : undefined}
                        />
                    </div>
                );
            }
            if (type === 'Image') return (
                <div className="mt-2">
                    <img src={url} alt="Media" className="rounded-xl max-w-full max-h-60 object-cover" />
                    {caption && <p className="text-xs mt-1 opacity-70">{caption}</p>}
                </div>
            );
            if (type === 'Sticker') return <img src={url} alt="Sticker" className="w-32 mt-2" />;
            if (type === 'Video') return (
                <div className="mt-2">
                    <video controls src={url} className="rounded-xl max-w-full max-h-60" />
                    {caption && <p className="text-xs mt-1 opacity-70">{caption}</p>}
                </div>
            );
            if (type === 'File') return (
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mt-2 p-2 bg-white/10 rounded-lg text-xs hover:bg-white/20 transition-all">
                    <FileBox size={16} />
                    <span>{caption || 'Descargar Archivo'}</span>
                </a>
            );
        }

        // Auto-linkify normal URLs in text if no Markdown link
        if (!content.includes('](') && (content.includes('http') || content.includes('www'))) {
            const parts = content.split(/(https?:\/\/[^\s]+)/g);
            return (
                <span>
                    {parts.map((part, i) =>
                        part.match(/^https?:\/\//) ? (
                            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 underline break-all">
                                {part}
                            </a>
                        ) : part
                    )}
                </span>
            );
        }

        return content;
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const resCol = await fetch('/api/v1/crm/columns', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataCol = await resCol.json();
            if (dataCol.success) setColumns(dataCol.data);

            const resAgents = await fetch('/api/v1/admin/knowledge/agents-metadata', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataAgents = await resAgents.json();
            if (dataAgents.success) setAgentsMetadata(dataAgents.data);

            const resTools = await fetch('/api/v1/admin/knowledge/tools-registry', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataTools = await resTools.json();
            if (dataTools.success) setToolsRegistry(dataTools.data);

            const resConv = await fetch('/api/v1/crm/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataConv = await resConv.json();
            if (dataConv.success) {
                // Deduplicate frontend side just in case
                const unique = Array.from(new Map(dataConv.data.map((c: Conversation) => [c.id, c])).values());
                setConversations(unique as Conversation[]);
            }
        } catch (err) {
            console.error('Failed to fetch CRM data');
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, conversationId: string) => {
        e.dataTransfer.setData('conversationId', conversationId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        const conversationId = e.dataTransfer.getData('conversationId');
        if (!conversationId) return;

        // Optimistic Update
        const conversation = conversations.find(c => c.id === conversationId);
        if (!conversation || conversation.column_id === targetColumnId) return;

        const originalConversations = [...conversations];
        setConversations(conversations.map(c =>
            c.id === conversationId ? { ...c, column_id: targetColumnId } : c
        ));

        try {
            const res = await fetch('/api/v1/crm/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ conversationId, targetColumnId })
            });

            if (!res.ok) {
                setConversations(originalConversations);
                const error = await res.json();
                console.error('Move failed:', error);
            }
        } catch (err) {
            setConversations(originalConversations);
            console.error('Move error:', err);
        }
    };

    const handleCreateCard = async (columnId: string) => {
        const handleRaw = window.prompt('Ingrese el identificador (Teléfono para WA, @usuario para IG o Email):');
        if (!handleRaw) return;

        const typeInput = window.prompt('Tipo de canal: (1) WhatsApp, (2) Instagram, (3) Email');
        let channel: 'WA' | 'IG' | 'EMAIL' = 'WA';
        let handle = handleRaw.trim();

        if (typeInput === '2') channel = 'IG';
        if (typeInput === '3') {
            channel = 'EMAIL';
            handle = handle.toLowerCase();
        }

        try {
            const res = await fetch('/api/v1/crm/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    channel,
                    handle,
                    column_id: columnId
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setConversations([...conversations, data.data]);
                }
            } else {
                alert('Error al crear conversación. Verifique si ya existe.');
            }
        } catch (err) {
            console.error('Create card error:', err);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConv) return;
        setSendingMessage(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: newMessage, role: 'assistant' })
            });
            if (res.ok) {
                const updatedMsg = await res.json();
                if (updatedMsg.success) {
                    setMessages([...messages, updatedMsg.data]);
                    setNewMessage('');
                }
            }
        } catch (e) {
            console.error('Error sending message', e);
            alert('Error al enviar mensaje');
        } finally {
            setSendingMessage(false);
        }
    };

    const isSendingRef = useRef(false);

    const handleSendVoice = async () => {
        if (!selectedConv) return;
        if (isSendingRef.current || sendingMessage) return;

        if (!newMessage.trim()) {
            alert('🎙️ Escribe un mensaje primero para convertirlo a voz.\n\nSimplemente escribe el texto y presiona este botón para que Ara (AI) lo lea con emoción.');
            return;
        }

        if (!window.confirm(`¿Enviar este texto como nota de voz?\n\n"${newMessage}"\n\n(Se usará la voz de Ara)`)) return;

        isSendingRef.current = true;
        setSendingMessage(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages/voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: newMessage, role: 'assistant' })
            });
            if (res.ok) {
                const updatedMsg = await res.json();
                if (updatedMsg.success) {
                    setMessages([...messages, updatedMsg.data]);
                    setNewMessage('');
                } else {
                    alert('Error al generar audio: ' + (updatedMsg.error || 'Unknown'));
                }
            } else {
                alert('Error al generar audio');
            }
        } catch (e) {
            console.error('Error sending voice message', e);
            alert('Error de conexión');
        } finally {
            isSendingRef.current = false;
            setSendingMessage(false);
        }
    };

    if (!isSuperAdmin) return null;

    // getChannelIcon moved to ../utils/crmUtils.ts

    return (
        <Screen id="screen.admin.crm">
            <AppLayout>
                <div
                    className="fixed inset-0 flex flex-col overflow-hidden transition-all duration-300 ease-in-out md:mr-[var(--panel-width)]"
                    style={{
                        '--panel-width': selectedConv ? `${sidePanelWidth}px` : '0px'
                    } as React.CSSProperties}
                >
                    {/* Header */}
                    <div className="p-4 border-b flex items-center justify-between gap-4 overflow-hidden shrink-0 z-50" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                        <div className="flex items-center gap-3 min-w-0 shrink sm:shrink-0">
                            <div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.accent}15` }}>
                                <LucideLayout style={{ color: theme.accent }} size={24} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm sm:text-lg font-bold truncate" style={{ color: theme.text }}>Omnichannel CRM <span className="text-[10px] bg-purple-500 text-white px-1 rounded ml-1 align-middle animate-pulse">v2.9</span></h1>
                                <p className="text-xs opacity-50 truncate hidden sm:block" style={{ color: theme.text }}>Tablero de Conversaciones Inteligentes</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 min-w-0 shrink">
                            <div className="relative shrink min-w-[20px] max-w-[250px]">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" style={{ color: theme.text }} />
                                <input
                                    type="text"
                                    placeholder="Buscar contacto..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-black/20 border rounded-full pl-9 pr-4 py-1.5 text-sm outline-none w-full transition-all focus:border-pink-500/50 focus:w-full"
                                    style={{ borderColor: theme.border, color: theme.text }}
                                />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setShowToolEditor(true)}
                                    className="p-2 rounded-full hover:bg-white/5 transition-colors text-pink-400"
                                    title="Editor de Herramientas IA"
                                >
                                    <Wrench size={20} />
                                </button>
                                <button
                                    onClick={() => setShowOrchestrator(true)}
                                    className="p-2 rounded-full hover:bg-white/5 transition-colors text-purple-400"
                                    title="Gestión de Orchestrator (Chips)"
                                >
                                    <Cpu size={20} className="stroke-[2.5px]" />
                                </button>
                                <button onClick={() => navigate(ROUTES.home)} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-white/5 transition-colors" style={{ color: theme.text, borderColor: theme.border }}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Kanban Board */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4 bg-black/5">
                        {columns.map(col => (
                            <div
                                key={col.id}
                                className="w-80 shrink-0 flex flex-col h-full"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, col.id)}
                            >
                                <div
                                    className="flex items-center justify-between mb-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all group border border-transparent hover:border-pink-500/30"
                                    onClick={() => setSelectedColumn(col)}
                                >
                                    <div className="flex flex-col">
                                        <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: theme.text }}>{col.name}</h2>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] opacity-40 uppercase" style={{ color: theme.textMuted }}>
                                                {filteredConversations.filter(c => c.column_id === col.id).length} cards
                                            </span>
                                            {col.mode === 'AI_MODE' ? (
                                                <div className="text-[9px] text-green-500 flex items-center gap-1">
                                                    <Brain size={8} /> {col.config?.agent_id || 'AI_ARA'}
                                                </div>
                                            ) : col.mode === 'HYBRID' ? (
                                                <div className="text-[9px] text-purple-400 flex items-center gap-1">
                                                    <User size={8} /> HYBRID
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-gray-400 flex items-center gap-1">
                                                    <PauseCircle size={8} /> HUMAN
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <Settings size={18} className="text-pink-500 hover:text-white transition-colors drop-shadow-md" />
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                                    {filteredConversations
                                        .filter(c => c.column_id === col.id)
                                        .map(conv => (
                                            <KanbanCard
                                                key={conv.id}
                                                conv={conv}
                                                isSelected={selectedConv?.id === conv.id}
                                                theme={theme}
                                                onDragStart={handleDragStart}
                                                onClick={setSelectedConv}
                                            />
                                        ))}

                                    <button
                                        onClick={() => handleCreateCard(col.id)}
                                        className="w-full py-3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 opacity-20 hover:opacity-50 transition-all group"
                                        style={{ borderColor: theme.border, color: theme.text }}
                                    >
                                        <Plus size={20} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Nueva Card</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Column Config Sidebar (Operational Brain) */}
                    {selectedColumn && (
                        <div className="fixed inset-y-0 right-0 w-[400px] shadow-2xl z-[110] border-l flex flex-col animate-in slide-in-from-right duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                            <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                                <div className="flex-1 mr-4">
                                    <input
                                        type="text"
                                        value={selectedColumn.name}
                                        onChange={(e) => setSelectedColumn({ ...selectedColumn, name: e.target.value })}
                                        className="text-lg font-bold bg-transparent border-b border-transparent focus:border-pink-500/50 outline-none w-full transition-colors"
                                        style={{ color: theme.text }}
                                        placeholder="Nombre de la Columna"
                                    />
                                    <p className="text-xs opacity-50 uppercase tracking-widest mt-1" style={{ color: theme.accent }}>Configuración de Cerebro</p>
                                </div>
                                <button onClick={() => setSelectedColumn(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors" style={{ color: theme.textMuted }}>
                                    <MoreVertical size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                {/* Mode Section */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase opacity-40">Modo de Operación</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['AI_MODE', 'HYBRID', 'HUMAN_MODE'].map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setSelectedColumn({ ...selectedColumn, mode: m as any })}
                                                className={`py-2 rounded-lg border text-[10px] font-bold transition-all ${selectedColumn.mode === m ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/5 bg-black/20 opacity-40 text-gray-300'}`}
                                            >
                                                {m.replace('_MODE', '')}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Agent Section */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase opacity-40">Agente Responsable</label>
                                    <select
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-pink-500/50 appearance-none"
                                        style={{ color: theme.text }}
                                        value={selectedColumn.assigned_agent_id || selectedColumn.config?.agent_id || 'sales_ara'}
                                        onChange={(e) => setSelectedColumn({
                                            ...selectedColumn,
                                            assigned_agent_id: e.target.value
                                        })}
                                    >
                                        {agentsMetadata.map(agent => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.status === 'Ready' ? '🟢' : '🔴'} {agent.label} ({agent.category})
                                            </option>
                                        ))}
                                    </select>
                                    {agentsMetadata.find(a => a.id === (selectedColumn.assigned_agent_id || selectedColumn.config?.agent_id || 'sales_ara'))?.status === 'Broken' && (
                                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                                            <AlertCircle size={10} /> {agentsMetadata.find(a => a.id === (selectedColumn.assigned_agent_id || selectedColumn.config?.agent_id || 'sales_ara'))?.error}
                                        </p>
                                    )}
                                </div>

                                {/* Brain Objectives Section (NEW) */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase opacity-40">Objetivos Estratégicos (Capa 3)</label>
                                    <textarea
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-pink-500/50 min-h-[100px] resize-none scrollbar-thin"
                                        style={{ color: theme.text }}
                                        placeholder="Define los objetivos específicos para el AI en esta columna..."
                                        value={selectedColumn.objectives || ''}
                                        onChange={(e) => setSelectedColumn({ ...selectedColumn, objectives: e.target.value })}
                                    />
                                </div>

                                {/* Voice Section (NEW) */}
                                <div className="space-y-3">
                                    <VoiceSelector
                                        value={typeof selectedColumn.voice_profile === 'string'
                                            ? { provider: 'openai', voice_id: selectedColumn.voice_profile, settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1.0 } }
                                            : selectedColumn.voice_profile}
                                        onChange={(config) => setSelectedColumn({ ...selectedColumn, voice_profile: config })}
                                    />
                                </div>

                                {/* Model Section */}
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold uppercase opacity-40">Modelo de IA (Cerebro)</label>
                                    <select
                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-pink-500/50 appearance-none"
                                        style={{ color: theme.text }}
                                        value={selectedColumn.config?.model || 'gpt-4o-mini'}
                                        onChange={(e) => setSelectedColumn({
                                            ...selectedColumn,
                                            config: { ...(selectedColumn.config || {}), model: e.target.value }
                                        })}
                                    >
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Tools Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold uppercase opacity-40">Herramientas Permitidas</label>
                                        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                            {(['inherit', 'override'] as const).map(m => (
                                                <button
                                                    key={m}
                                                    onClick={() => {
                                                        const config = selectedColumn.config || {};
                                                        const policy = config.tools_policy || { mode: 'inherit', allowed_tools: [] };
                                                        setSelectedColumn({
                                                            ...selectedColumn,
                                                            config: { ...config, tools_policy: { ...policy, mode: m } }
                                                        });
                                                    }}
                                                    className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${(selectedColumn.config?.tools_policy?.mode || 'inherit') === m
                                                        ? 'bg-pink-500 text-white shadow-lg'
                                                        : 'text-gray-500 hover:text-gray-300'
                                                        }`}
                                                >
                                                    {m === 'inherit' ? 'HEREDAR' : 'PERSONALIZAR'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 scrollbar-thin">
                                        {toolsRegistry.map(tool => {
                                            const isInherit = (selectedColumn.config?.tools_policy?.mode || 'inherit') === 'inherit';
                                            const currentAgent = agentsMetadata.find(a => a.id === (selectedColumn.config?.agent_id || 'sales_ara'));

                                            const isChecked = isInherit
                                                ? currentAgent?.default_tools?.includes(tool.name)
                                                : (selectedColumn.config?.tools_policy?.allowed_tools || []).includes(tool.name);

                                            return (
                                                <label
                                                    key={tool.name}
                                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isInherit ? 'opacity-40 cursor-not-allowed bg-black/10 border-white/5' : 'bg-black/20 border-white/5 cursor-pointer hover:border-white/20'
                                                        } ${isChecked ? 'ring-1 ring-pink-500/30 bg-pink-500/[0.02]' : ''}`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                                                            {getToolIcon(tool.category || '')}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[11px] font-bold font-mono text-pink-400/90 uppercase truncate">{tool.name}</span>
                                                            <span className="text-[9px] opacity-40 truncate w-48">{tool.description}</span>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        disabled={isInherit}
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            if (isInherit) return;
                                                            const config = selectedColumn.config || {};
                                                            const policy = config.tools_policy || { mode: 'override', allowed_tools: [] };
                                                            const currentTools = policy.allowed_tools || [];
                                                            const newTools = e.target.checked
                                                                ? [...currentTools, tool.name]
                                                                : currentTools.filter(name => name !== tool.name);

                                                            setSelectedColumn({
                                                                ...selectedColumn,
                                                                config: { ...config, tools_policy: { ...policy, allowed_tools: newTools } }
                                                            });
                                                        }}
                                                        className="w-4 h-4 accent-pink-500"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t flex gap-3" style={{ borderColor: theme.border }}>
                                <button
                                    onClick={() => setSelectedColumn(null)}
                                    className="flex-1 py-3 rounded-xl border text-sm font-bold uppercase transition-all"
                                    style={{ borderColor: theme.border, color: theme.text }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        setIsSaving(true);
                                        try {
                                            const res = await fetch(`/api/v1/crm/columns/${selectedColumn.id}/config`, {
                                                method: 'PATCH',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${token}`
                                                },
                                                body: JSON.stringify({
                                                    mode: selectedColumn.mode,
                                                    name: selectedColumn.name,
                                                    assigned_agent_id: selectedColumn.assigned_agent_id,
                                                    objectives: selectedColumn.objectives,
                                                    voice_profile: selectedColumn.voice_profile,
                                                    config: selectedColumn.config
                                                })
                                            });
                                            if (res.ok) {
                                                setColumns(columns.map(c => c.id === selectedColumn.id ? selectedColumn : c));
                                                setSelectedColumn(null);
                                            }
                                        } catch (e) { console.error('Error saving column config', e); }
                                        finally { setIsSaving(false); }
                                    }}
                                    className="flex-3 py-3 rounded-xl text-white text-sm font-bold uppercase shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                    style={{ backgroundColor: theme.accent, boxShadow: `0 4px 12px ${theme.accent}30` }}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Conversation Sidebar (Drawer) */}

                    {/* Conversation Sidebar (Drawer) */}
                    {selectedConv && (
                        <div
                            className="fixed inset-0 md:inset-y-0 md:left-auto md:right-0 w-full md:w-auto shadow-2xl z-[100] border-l flex flex-col animate-in slide-in-from-right duration-300"
                            style={{
                                backgroundColor: theme.cardBg,
                                borderColor: theme.border,
                                width: window.innerWidth < 768 ? '100vw' : `${sidePanelWidth}px`,
                                maxWidth: '100vw'
                            }}
                        >
                            {/* Resize Handle for Side Panel (Desktop only) */}
                            <div
                                className="hidden md:block absolute left-[-4px] top-0 bottom-0 w-2 cursor-col-resize hover:bg-pink-500/50 transition-colors z-[110]"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    setIsResizingSidePanel(true);
                                }}
                            />

                            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: theme.border }}>
                                <div className="flex items-center gap-3">
                                    {/* Avatar in Header */}
                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedConv.contact_handle)} p-[1.5px] shadow-lg shrink-0 relative group`}>
                                        <div className="w-full h-full rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                                            {selectedConv.avatar_url ? (
                                                <img
                                                    src={selectedConv.avatar_url}
                                                    alt={selectedConv.contact_handle}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        // Fallback to icon if image fails
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                        e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                                                    }}
                                                />
                                            ) : (
                                                <>
                                                    {selectedConv.channel === 'WA' && <MessageSquare size={18} className="text-white" />}
                                                    {selectedConv.channel === 'IG' && <Instagram size={18} className="text-white" />}
                                                    {selectedConv.channel === 'EMAIL' && <Mail size={18} className="text-white" />}
                                                    {!['WA', 'IG', 'EMAIL'].includes(selectedConv.channel) && <User size={18} className="text-white" />}
                                                </>
                                            )}
                                            {/* Fallback Icon Container (Hidden by default if image exists) */}
                                            {selectedConv.avatar_url && (
                                                <div className="fallback-icon hidden w-full h-full flex items-center justify-center absolute inset-0 bg-black/40">
                                                    {selectedConv.channel === 'WA' && <MessageSquare size={18} className="text-white" />}
                                                    {selectedConv.channel === 'IG' && <Instagram size={18} className="text-white" />}
                                                    {selectedConv.channel === 'EMAIL' && <Mail size={18} className="text-white" />}
                                                    {!['WA', 'IG', 'EMAIL'].includes(selectedConv.channel) && <User size={18} className="text-white" />}
                                                </div>
                                            )}
                                        </div>
                                        {/* Channel Badge */}
                                        <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-0.5 border border-white/10 z-10">
                                            {getChannelIcon(selectedConv.channel)}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm" style={{ color: theme.text }}>{selectedConv.contact_handle}</h3>
                                        {/* Last Activity Status */}
                                        {(() => {
                                            // Usar last_message_at (más preciso) o updated_at como fallback
                                            const lastActivity = selectedConv.last_message_at || selectedConv.updated_at;
                                            if (!lastActivity) {
                                                return <span className="text-[10px] text-gray-500">Sin actividad</span>;
                                            }

                                            const lastSeen = new Date(lastActivity).getTime();
                                            const now = Date.now();
                                            const diffMinutes = Math.floor((now - lastSeen) / 60000);

                                            // Determinar estado basado en tiempo
                                            const isRecent = diffMinutes < 5;      // < 5 min = muy reciente
                                            const isActive = diffMinutes < 30;     // < 30 min = activo
                                            const isWarm = diffMinutes < 360;      // < 6h = tibio

                                            // Formatear tiempo legible
                                            let timeText = '';
                                            if (diffMinutes < 1) timeText = 'Ahora';
                                            else if (diffMinutes < 60) timeText = `${diffMinutes}min`;
                                            else if (diffMinutes < 1440) timeText = `${Math.floor(diffMinutes / 60)}h`;
                                            else timeText = `${Math.floor(diffMinutes / 1440)}d`;

                                            return (
                                                <div className={`flex items-center gap-1 text-[10px] ${isRecent ? 'text-green-500' :
                                                        isActive ? 'text-green-400' :
                                                            isWarm ? 'text-yellow-500' : 'text-gray-500'
                                                    }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${isRecent ? 'bg-green-500 animate-pulse' :
                                                            isActive ? 'bg-green-400' :
                                                                isWarm ? 'bg-yellow-500' : 'bg-gray-500'
                                                        }`} />
                                                    {isRecent ? 'Activo' : timeText}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 px-2">
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm(`¿Iniciar llamada de voz con ${selectedConv.contact_handle}?`)) return;
                                            try {
                                                const res = await fetch('/api/v1/vapi/call', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                    body: JSON.stringify({
                                                        phoneNumber: selectedConv.contact_handle,
                                                        customerName: selectedConv.contact_name,
                                                        conversationId: selectedConv.id
                                                    })
                                                });
                                                if (res.ok) {
                                                    alert('✅ Llamada iniciada. El teléfono del cliente sonará en breve.');
                                                } else {
                                                    const err = await res.json();
                                                    alert('❌ Error: ' + err.error);
                                                }
                                            } catch (e) { console.error('Call error', e); alert('Error de conexión'); }
                                        }}
                                        className="p-2 hover:bg-white/5 rounded-full text-green-500 hover:text-green-400 transition-colors"
                                        title="Llamar en Vivo (Vapi)"
                                    >
                                        <PhoneCall size={18} />
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm('¿Archivar esta conversación?')) return;
                                            try {
                                                const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/archive`, {
                                                    method: 'PATCH',
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (res.ok) {
                                                    setConversations(conversations.filter(c => c.id !== selectedConv.id));
                                                    setSelectedConv(null);
                                                }
                                            } catch (e) { console.error('Archive error', e); }
                                        }}
                                        className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-pink-400 transition-colors mx-0.5"
                                        title="Archivar"
                                    >
                                        <Archive size={18} />
                                    </button>
                                    <button onClick={() => setSelectedConv(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors ml-1" style={{ color: theme.textMuted }}>
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* The Chat is now permanent in the sidebar. Metadata tabs have moved to the Resource Dock. */}


                            <div
                                className="flex-1 relative min-h-0 overflow-hidden"
                                style={{
                                    // @ts-ignore
                                    '--dock-width': showResourceDock ? `${resourceDockWidth}px` : '0px'
                                }}
                            >
                                {/* MAIN CONTENT: ALWAYS THE CHAT */}
                                <div
                                    className="absolute inset-y-0 left-0 right-0 md:right-[var(--dock-width)] flex flex-col bg-black/20 min-h-0 min-w-0 overflow-hidden transition-[right] duration-300 ease-in-out"
                                >
                                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                                        {messages.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center opacity-20 pointer-events-none">
                                                <MessageCircle size={48} className="mb-4" />
                                                <p className="text-sm font-light">Comienza la conversación...</p>
                                            </div>
                                        ) : (
                                            messages.map((msg, i) => (
                                                <div key={i} className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                                                    <div
                                                        className={`max-w-[92%] md:max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${msg.direction === 'outbound' ? 'rounded-br-none' : 'bg-white/5 border border-white/10 rounded-bl-none'}`}
                                                        style={{
                                                            backgroundColor: msg.direction === 'outbound' ? `${theme.accent}20` : undefined,
                                                            color: msg.direction === 'outbound' ? theme.text : undefined,
                                                            borderColor: msg.direction === 'outbound' ? `${theme.accent}20` : undefined,
                                                            borderWidth: msg.direction === 'outbound' ? '1px' : undefined
                                                        }}
                                                    >
                                                        {msg.type === 'image' && msg.content && !msg.content.startsWith('[') && (
                                                            <img src={msg.content} alt="Media" className="rounded-lg mb-2 max-w-full" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                        )}
                                                        <div className="whitespace-pre-wrap leading-relaxed">
                                                            {parseMediaContent(msg.content || '')}
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] opacity-30 mt-1 font-mono px-1">
                                                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} • {msg.direction === 'outbound' ? 'AGENTE' : 'CLIENTE'}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Enhanced Input Area */}
                                    <div className="p-3 border-t bg-black/40 backdrop-blur-sm shrink-0" style={{ borderColor: theme.border }}>
                                        <div className="flex gap-2 items-end">
                                            <button
                                                onClick={() => setShowResourceDock(!showResourceDock)}
                                                className="flex h-[44px] w-[44px] md:h-[48px] md:w-[48px] items-center justify-center rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 hover:text-pink-300 transition-colors mr-2 shadow-sm border border-pink-500/20 shrink-0"
                                                title={showResourceDock ? "Ocultar Herramientas" : "Mostrar Herramientas"}
                                            >
                                                {showResourceDock ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
                                            </button>

                                            <div className="flex-1 relative min-w-0">
                                                <textarea
                                                    value={newMessage}
                                                    onChange={(e) => setNewMessage(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                                    placeholder="Escribe un mensaje..."
                                                    rows={3}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm outline-none focus:border-pink-500/50 transition-all font-light resize-none scrollbar-thin scrollbar-thumb-white/10"
                                                    style={{ color: theme.text }}
                                                />
                                            </div>

                                            <div className="flex flex-row gap-2 justify-end pb-1 pl-1">
                                                <button
                                                    onClick={handleSendVoice}
                                                    disabled={sendingMessage}
                                                    className={`p-2 h-[44px] w-[44px] md:h-[48px] md:w-[48px] flex items-center justify-center rounded-xl transition-all ${sendingMessage ? 'opacity-50 grayscale cursor-not-allowed' : 'text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 shadow-lg border border-pink-500/20 active:scale-95'}`}
                                                    title="Enviar como Nota de Voz"
                                                >
                                                    {sendingMessage ? <Loader2 size={18} className="animate-spin" /> : <Mic size={20} />}
                                                </button>

                                                <button
                                                    onClick={handleSendMessage}
                                                    disabled={sendingMessage || !newMessage.trim()}
                                                    className={`p-2 h-[44px] w-[44px] md:h-[48px] md:w-[48px] flex items-center justify-center rounded-xl transition-all text-white active:scale-95 shadow-lg ${!newMessage.trim() ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                                                    style={{ backgroundColor: theme.accent }}
                                                    title="Enviar Texto"
                                                >
                                                    <Send size={20} className={sendingMessage ? 'animate-pulse' : ''} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RESOURCE DOCK: NOW WITH TABS FOR ALL DATA */}
                                <div
                                    className={`absolute inset-y-0 right-0 z-[120] bg-black/80 md:bg-black/80 backdrop-blur-md border-l border-white/5 flex flex-col transition-all duration-300 ease-in-out ${showResourceDock ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}
                                    style={{
                                        width: window.innerWidth < 768 ? '100%' : `${resourceDockWidth}px`
                                    }}
                                >
                                    <div className="w-full h-full flex flex-col">
                                        {/* TAB SWITCHER IN RESOURCE DOCK */}
                                        <div className="flex border-b text-[9px] font-bold uppercase tracking-wider overflow-x-auto scrollbar-hide min-w-0" style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                                            {[
                                                { id: 'tools', label: 'Recursos', icon: <Zap size={12} /> },
                                                { id: 'client', label: 'Cliente', icon: <User size={12} /> },
                                                { id: 'orders', label: 'Pedidos', icon: <ShoppingBag size={12} /> },
                                                { id: 'insights', label: 'Brain', icon: <Brain size={12} /> }
                                            ].map((tab: any) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setResourceDockTab(tab.id as any)}
                                                    className={`flex-1 py-3 px-1 flex flex-col items-center justify-center gap-1 border-b-2 transition-colors min-w-[60px]`}
                                                    style={{
                                                        borderColor: resourceDockTab === tab.id ? theme.accent : 'transparent',
                                                        color: resourceDockTab === tab.id ? theme.accent : undefined
                                                    }}
                                                >
                                                    {tab.icon}
                                                    <span className="scale-[0.8] whitespace-nowrap">{tab.label}</span>
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setShowResourceDock(false)}
                                                className="px-3 py-3 border-b-2 border-transparent opacity-30 hover:opacity-100 hover:text-red-400 shrink-0"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                                            {resourceDockTab === 'tools' && (
                                                <div className="p-4 space-y-6 animate-in fade-in duration-300">
                                                    {/* Identity Resolution Widget (Phase 64) */}
                                                    <IdentityResolutionCard
                                                        conversation={selectedConv}
                                                        onResolve={fetchData}
                                                    />

                                                    {/* Section: Quick Actions */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 text-[10px] uppercase font-bold opacity-40">
                                                            <Zap size={10} /> Acciones Rápidas
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {['Pedir Pago', 'Enviar Catálogo', 'Agendar Llamada', 'Crear Ticket'].map(action => (
                                                                <button
                                                                    key={action}
                                                                    onClick={() => {
                                                                        const texts: Record<string, string> = {
                                                                            'Pedir Pago': 'Hola! Para proceder, puedes realizar tu pago aquí: [Link de Pago]',
                                                                            'Enviar Catálogo': 'Claro, aquí tienes nuestro catálogo actualizado: [Enlace al Catálogo]',
                                                                            'Agendar Llamada': '¿Te gustaría agendar una llamada con uno de nuestros asesores?',
                                                                            'Crear Ticket': 'He creado un ticket de soporte para tu caso. Folio: #' + Math.floor(Math.random() * 10000)
                                                                        };
                                                                        setNewMessage(prev => prev + (prev ? '\n' : '') + texts[action]);
                                                                    }}
                                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-medium transition-all text-left active:scale-95"
                                                                >
                                                                    {action}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Section: Coupons */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 text-[10px] uppercase font-bold opacity-40">
                                                            <Ticket size={10} /> Cupones Activos
                                                        </div>
                                                        <div className="space-y-2">
                                                            {[
                                                                { code: 'VIP20', desc: '20% OFF en toda la tienda' },
                                                                { code: 'ENVIO_GRATIS', desc: 'Envío gratis > $999' }
                                                            ].map(coupon => (
                                                                <div
                                                                    key={coupon.code}
                                                                    onClick={() => {
                                                                        setNewMessage(prev => prev + (prev ? ' ' : '') + coupon.code);
                                                                        navigator.clipboard.writeText(coupon.code);
                                                                    }}
                                                                    className="p-3 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-white/5 cursor-pointer hover:border-pink-500/30 transition-all group active:scale-95"
                                                                >
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="font-mono font-bold text-xs text-pink-400">{coupon.code}</span>
                                                                        <Copy size={10} className="opacity-0 group-hover:opacity-50" />
                                                                    </div>
                                                                    <p className="text-[10px] opacity-60">{coupon.desc}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Section: Guides & Links */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 text-[10px] uppercase font-bold opacity-40">
                                                            <FileText size={10} /> Guías y Links
                                                        </div>
                                                        <div className="space-y-1">
                                                            {['Política de Envíos', 'Tabla de Cannabinoides', 'Aviso de Privacidad'].map(guide => (
                                                                <button
                                                                    key={guide}
                                                                    onClick={() => {
                                                                        const links: Record<string, string> = {
                                                                            'Política de Envíos': 'https://extractoseum.com/pages/politica-de-envios',
                                                                            'Tabla de Cannabinoides': 'https://extractoseum.com/pages/tabla-cannabinoides',
                                                                            'Aviso de Privacidad': 'https://extractoseum.com/pages/aviso-de-privacidad'
                                                                        };
                                                                        setNewMessage(prev => prev + (prev ? '\n' : '') + links[guide]);
                                                                    }}
                                                                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-[11px] group transition-colors active:scale-95"
                                                                >
                                                                    <span className="opacity-70 group-hover:opacity-100">{guide}</span>
                                                                    <ExternalLink size={10} className="opacity-0 group-hover:opacity-50" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {resourceDockTab === 'client' && (
                                                <div className="p-6 space-y-6 animate-in fade-in duration-300">
                                                    <div className="text-center pb-6 border-b border-dashed border-white/10">
                                                        <div className="w-16 h-16 rounded-full mx-auto p-0.5 mb-3 shadow-xl"
                                                            style={{ background: `linear-gradient(to bottom right, ${theme.accent}, ${theme.accentSecondary})` }}>
                                                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                                                                <span className="text-xl font-bold">{selectedConv.contact_handle[0]?.toUpperCase() || '?'}</span>
                                                            </div>
                                                        </div>
                                                        <h3 className="text-md font-black truncate tracking-tight">{contactSnapshot?.name || selectedConv.contact_handle}</h3>
                                                        <p className="text-[9px] opacity-40 font-mono uppercase tracking-tighter">ID: {selectedConv.id.substring(0, 8)} | Risk: {contactSnapshot?.risk_level || 'N/A'}</p>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
                                                            <p className="text-[9px] uppercase font-bold opacity-30 mb-1">LTV Total</p>
                                                            <p className="text-lg font-mono font-bold" style={{ color: theme.accent }}>${contactSnapshot?.ltv?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}</p>
                                                        </div>
                                                        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 text-center">
                                                            <p className="text-[9px] uppercase font-bold opacity-30 mb-1">Pedidos</p>
                                                            <p className="text-lg font-mono font-bold">{contactSnapshot?.orders_count || 0}</p>
                                                        </div>
                                                    </div>

                                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5 relative overflow-hidden group">
                                                        <p className="text-[9px] uppercase font-bold opacity-30 mb-3 flex items-center gap-2">
                                                            <Activity size={10} /> Resumen Inteligente
                                                        </p>
                                                        <ul className="space-y-2 text-xs opacity-70 font-light">
                                                            {(contactSnapshot?.summary_bullets?.length ? contactSnapshot.summary_bullets : [
                                                                'Cliente nuevo sin historial previo.',
                                                                'Interés potencial en vapes desechables.',
                                                                'No se detectan riesgos de pago.'
                                                            ]).map((bullet: string, i: number) => (
                                                                <li key={i} className="flex gap-2">
                                                                    <span className="text-pink-500 mt-1">•</span>
                                                                    {bullet}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            )}

                                            {resourceDockTab === 'orders' && (
                                                <div className="p-6 space-y-4 animate-in fade-in duration-300">
                                                    {loadingOrders ? (
                                                        <div className="flex justify-center p-8"><Loader2 className="animate-spin" style={{ color: theme.accent }} /></div>
                                                    ) : clientOrders.length === 0 ? (
                                                        <div className="flex flex-col items-center justify-center opacity-30 py-10 gap-2">
                                                            <ShoppingBag size={32} />
                                                            <p className="text-[10px] font-mono">SIN PEDIDOS</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {clientOrders.map((order: any, i: number) => (
                                                                <div
                                                                    key={i}
                                                                    onClick={() => fetchOrderDetails(order.shopify_order_id)}
                                                                    className={`bg-white/5 border ${expandedOrderId === order.shopify_order_id ? 'border-pink-500/50 bg-white/10' : 'border-white/5'} p-3 rounded-xl cursor-pointer hover:border-pink-500/20 transition-all`}
                                                                >
                                                                    <div className="flex justify-between items-center">
                                                                        <div>
                                                                            <p className="text-[11px] font-bold text-white mb-0.5">#{order.order_number}</p>
                                                                            <p className="text-[9px] opacity-50 font-mono">{new Date(order.shopify_created_at || order.created_at).toLocaleDateString()}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[11px] font-bold font-mono text-pink-400">${order.total_amount}</p>
                                                                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${order.status === 'paid' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-500'}`}>{order.status}</span>
                                                                        </div>
                                                                    </div>
                                                                    {expandedOrderId === order.shopify_order_id && (
                                                                        <div className="mt-3 pt-3 border-t border-white/10 animate-in fade-in zoom-in-95 duration-200">
                                                                            {loadingDetails ? (
                                                                                <div className="flex justify-center py-2"><Loader2 className="w-3 h-3 animate-spin text-pink-500" /></div>
                                                                            ) : orderDetails ? (
                                                                                <div className="space-y-3">
                                                                                    {/* Financial & Fulfillment Status */}
                                                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${orderDetails.financial_status === 'paid' ? 'border-green-500/30 text-green-400' : 'border-yellow-500/30 text-yellow-500'}`}>
                                                                                            Pago: {orderDetails.financial_status || 'N/A'}
                                                                                        </span>
                                                                                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${orderDetails.fulfillment_status === 'fulfilled' ? 'border-blue-500/30 text-blue-400' : 'border-gray-500/30 text-gray-400'}`}>
                                                                                            Envío: {orderDetails.fulfillment_status || 'Unfulfilled'}
                                                                                        </span>
                                                                                    </div>

                                                                                    {/* Line Items */}
                                                                                    {orderDetails.line_items && orderDetails.line_items.length > 0 ? (
                                                                                        <div className="space-y-2">
                                                                                            {orderDetails.line_items.map((item: any, idx: number) => (
                                                                                                <div key={idx} className="flex justify-between text-[9px] items-start opacity-80">
                                                                                                    <span className="max-w-[70%]">{item.quantity}x {item.title || item.name || 'Producto desconocido'}</span>
                                                                                                    <span className="font-mono">${item.price}</span>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="py-2 text-center opacity-40">
                                                                                            <p className="text-[9px] italic">No hay ítems registrados</p>
                                                                                        </div>
                                                                                    )}

                                                                                    {/* Shipping Lines */}
                                                                                    {orderDetails.shipping_lines?.map((shipping: any, sIdx: number) => (
                                                                                        <div key={`ship-${sIdx}`} className="flex justify-between text-[9px] text-blue-300 items-center border-t border-white/5 pt-1">
                                                                                            <span>Envío ({shipping.title})</span>
                                                                                            <span className="font-mono">${shipping.price}</span>
                                                                                        </div>
                                                                                    ))}

                                                                                    {/* Totals Breakdown */}
                                                                                    <div className="border-t border-white/10 pt-2 space-y-1">
                                                                                        <div className="flex justify-between text-[9px] opacity-60">
                                                                                            <span>Subtotal</span>
                                                                                            <span className="font-mono">${orderDetails.current_subtotal_price || orderDetails.subtotal_price}</span>
                                                                                        </div>
                                                                                        {parseFloat(orderDetails.total_tax) > 0 && (
                                                                                            <div className="flex justify-between text-[9px] opacity-60">
                                                                                                <span>Impuestos</span>
                                                                                                <span className="font-mono">${orderDetails.total_tax}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        {parseFloat(orderDetails.total_discounts) > 0 && (
                                                                                            <div className="flex justify-between text-[9px] text-green-400">
                                                                                                <span>Descuento</span>
                                                                                                <span className="font-mono">-${orderDetails.total_discounts}</span>
                                                                                            </div>
                                                                                        )}
                                                                                        <div className="flex justify-between text-[10px] font-bold text-pink-400 pt-1">
                                                                                            <span>Total</span>
                                                                                            <span className="font-mono">${orderDetails.total_price}</span>
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Fulfillments / Tracking */}
                                                                                    {orderDetails.fulfillments && orderDetails.fulfillments.length > 0 && (
                                                                                        <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
                                                                                            <p className="text-[9px] font-bold opacity-70">Envíos / Rastreo:</p>
                                                                                            {orderDetails.fulfillments.map((fill: any, fIdx: number) => (
                                                                                                <div key={fIdx} className="bg-white/5 p-2 rounded flex flex-col gap-1">
                                                                                                    <div className="flex justify-between text-[9px]">
                                                                                                        <span className="opacity-70">{fill.tracking_company || 'Paquetería'}</span>
                                                                                                        <span className={`uppercase font-bold ${fill.shipment_status === 'delivered' ? 'text-green-400' : 'text-blue-400'}`}>
                                                                                                            {fill.shipment_status || fill.status || 'En camino'}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    {fill.tracking_number && (
                                                                                                        <div className="flex items-center justify-between text-[10px]">
                                                                                                            <span className="font-mono text-white/80 select-all">{fill.tracking_number}</span>
                                                                                                            {fill.tracking_url && (
                                                                                                                <a
                                                                                                                    href={fill.tracking_url}
                                                                                                                    target="_blank"
                                                                                                                    rel="noreferrer"
                                                                                                                    className="text-pink-400 hover:text-pink-300 underline flex items-center gap-1"
                                                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                                                >
                                                                                                                    Rastrear <ExternalLink size={8} />
                                                                                                                </a>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}

                                                                                    {/* Shipping Address */}
                                                                                    {orderDetails.shipping_address && (
                                                                                        <div className="mt-2 pt-2 border-t border-white/5 opacity-50 text-[8px]">
                                                                                            <p className="font-bold mb-0.5">Dirección de Envío:</p>
                                                                                            <p>{orderDetails.shipping_address.address1}, {orderDetails.shipping_address.city}</p>
                                                                                            <p>{orderDetails.shipping_address.zip}, {orderDetails.shipping_address.country}</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="py-2 text-center opacity-40">
                                                                                    <p className="text-[9px] italic">No se pudo cargar la información del pedido.</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {resourceDockTab === 'insights' && (
                                                <div className="p-6 space-y-8 animate-in fade-in duration-300">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center">
                                                            <h4 className="text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ color: theme.accent }}>Comportamiento en Tienda</h4>
                                                            <button
                                                                onClick={() => selectedConv && fetchBrowsingEvents(selectedConv.contact_handle)}
                                                                className="p-1 hover:bg-white/10 rounded transition-colors text-white/30 hover:text-white"
                                                                title="Actualizar actividad"
                                                            >
                                                                <Activity size={12} className={loadingEvents ? 'animate-spin' : ''} />
                                                            </button>
                                                        </div>
                                                        <div className="bg-white/[0.02] p-4 rounded-3xl border border-white/5 max-h-60 overflow-y-auto scrollbar-thin">
                                                            {loadingEvents ? (
                                                                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-pink-500" /></div>
                                                            ) : browsingEvents.length > 0 ? (
                                                                <div className="space-y-3">
                                                                    {browsingEvents.map((event: any, i: number) => {
                                                                        let icon = <Activity size={12} className="text-gray-400" />;
                                                                        let effectiveType = event.metadata?.original_event_type || event.event_type;
                                                                        let text = `Evento: ${effectiveType}`;

                                                                        switch (effectiveType) {
                                                                            case 'view_product':
                                                                                icon = <Eye size={12} className="text-blue-400" />;
                                                                                text = `Vio ${event.metadata?.product_name || 'Producto'}`;
                                                                                break;
                                                                            case 'search':
                                                                                icon = <Search size={12} className="text-cyan-400" />;
                                                                                text = `Buscó: "${event.metadata?.query || '...'}"`;
                                                                                break;
                                                                            case 'add_to_cart':
                                                                                icon = <ShoppingCart size={12} className="text-green-500 animate-pulse" />;
                                                                                text = `Agregó al Carrito`;
                                                                                break;
                                                                            case 'view_cart':
                                                                                icon = <ShoppingBag size={12} className="text-purple-400" />;
                                                                                text = `Revisando su Carrito`;
                                                                                break;
                                                                            case 'initiate_checkout':
                                                                                icon = <CreditCard size={12} className="text-pink-500 animate-bounce" />;
                                                                                text = `¡INICIÓ PAGO!`;
                                                                                break;
                                                                            case 'click_contact':
                                                                                icon = <MessageCircle size={12} className="text-green-400" />;
                                                                                text = `Clic en Contacto (${event.metadata?.channel || 'WA'})`;
                                                                                break;
                                                                            case 'view_collection':
                                                                                icon = <LayoutGrid size={12} className="text-orange-400" />;
                                                                                text = `Vio Colección: ${event.metadata?.collection_name || '...'}`;
                                                                                break;
                                                                            default:
                                                                                // Hooks universales (Voz, Custom)
                                                                                if (event.event_type.includes('voice')) {
                                                                                    icon = <Mic size={12} className="text-red-400" />;
                                                                                    text = `Voz: ${JSON.stringify(event.metadata)}`;
                                                                                }
                                                                        }

                                                                        return (
                                                                            <div key={i} className="flex gap-3 items-start border-l-2 border-white/5 pl-3 py-1">
                                                                                <div className="mt-1">{icon}</div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex justify-between items-baseline">
                                                                                        <p className="text-[11px] font-bold truncate">{text}</p>
                                                                                        <span className="text-[8px] opacity-30 font-mono">{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="text-center py-6 opacity-20 flex flex-col items-center gap-2">
                                                                    <Activity size={20} />
                                                                    <p className="text-[10px] uppercase font-bold tracking-widest">Sin actividad</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t border-emerald-500/10">
                                                        <div className="flex justify-between items-center group/header">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                                                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-pink-500 font-black">Plan de Acción AI</h4>
                                                                {loadingEvents && <Loader2 size={10} className="animate-spin text-pink-400" />}
                                                            </div>
                                                            <button
                                                                onClick={handleRecalibrate}
                                                                disabled={loadingEvents}
                                                                className="px-2.5 py-1.5 rounded-full bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 border border-pink-500/30 shadow-lg shadow-pink-500/5"
                                                            >
                                                                <RefreshCw size={10} className={loadingEvents ? 'animate-spin' : ''} />
                                                                <span className="text-[9px] font-bold">{loadingEvents ? 'Analizando...' : 'Recalibrar'}</span>
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {selectedConv.facts?.action_plan && selectedConv.facts.action_plan.length > 0 ? (
                                                                selectedConv.facts.action_plan.map((action: any, j: number) => (
                                                                    <button
                                                                        key={j}
                                                                        onClick={() => handleActionClick(action)}
                                                                        className="w-full text-left p-3 rounded-xl bg-black/40 border border-white/5 group hover:border-pink-500/40 transition-all flex justify-between items-center"
                                                                    >
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs font-bold group-hover:text-pink-400">{action.label}</span>
                                                                            <span className="text-[8px] opacity-30 font-mono">{action.meta}</span>
                                                                        </div>
                                                                        <Plus size={12} className="opacity-40" />
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <div className="text-center py-6 border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                                                                    <p className="text-[10px] opacity-30 italic px-4">
                                                                        {loadingEvents ? 'Procesando comportamiento reciente y chat para generar recomendaciones...' : 'No se detectaron acciones inmediatas. Pulsa "Recalibrar" para re-analizar.'}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {showToolEditor && <ToolEditor onClose={() => setShowToolEditor(false)} />}
                    {showOrchestrator && <OrchestratorConfig onClose={() => setShowOrchestrator(false)} />}
                </div>
            </AppLayout>
        </Screen >
    );
};

export default AdminCRM;
