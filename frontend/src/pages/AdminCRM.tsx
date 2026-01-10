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
    Award, Star, Heart, ThumbsUp, ThumbsDown, Smile, Frown, FileBox, Facebook, StickyNote
} from 'lucide-react';
import { MessageAudioPlayer } from '../components/MessageAudioPlayer';
import { SystemInquiryCard } from '../components/SystemInquiryCard';
import ToolEditor from '../components/ToolEditor';
import OrchestratorConfig from '../components/OrchestratorConfig';
import { VoiceSelector } from '../components/VoiceSelector';
import KanbanCard from '../components/KanbanCard';
import CreateTicketModal from '../components/CreateTicketModal';
import ImpersonationModal from '../components/ImpersonationModal';
import SmartTextarea from '../components/SmartTextarea';
import type { Column, Conversation, AgentMetadata, ToolRegistryItem, ContactSnapshot } from '../types/crm';
import { getAvatarGradient, getTagColor, getChannelIcon } from '../utils/crmUtils';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
    const { client: user, isSuperAdmin, impersonation } = useAuth(); // Client aliased to user for compatibility
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const token = localStorage.getItem('accessToken');

    // Impersonation modal state
    const [showImpersonationModal, setShowImpersonationModal] = useState(false);
    const [impersonationTarget, setImpersonationTarget] = useState<{ id: string; name?: string; email?: string; phone?: string } | null>(null);

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
    // Phase 62: Advanced Filters & Sorting
    const [sortBy, setSortBy] = useState<'session' | 'recent' | 'ltv'>('session');
    const [activeFilters, setActiveFilters] = useState<string[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [showAllTags, setShowAllTags] = useState(false);
    const [clientSearchResults, setClientSearchResults] = useState<any[]>([]);
    const [searchingClients, setSearchingClients] = useState(false);
    const [showClientResults, setShowClientResults] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const searchInputRef = useRef<HTMLInputElement>(null);
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
    const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);

    // Channel Health State
    const [channelHealth, setChannelHealth] = useState<{ status: string; channels: any[] } | null>(null);

    // Scheduled Messages State
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleType, setScheduleType] = useState<'text' | 'voice'>('text');
    const [scheduledMessages, setScheduledMessages] = useState<any[]>([]);
    const [loadingScheduled, setLoadingScheduled] = useState(false);

    // AI Summary & Sentiment State
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summaryData, setSummaryData] = useState<{ summary: string; messageCount: number } | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [sentimentData, setSentimentData] = useState<{ sentiment: string; confidence: number; emoji: string; reason: string } | null>(null);
    const [loadingSentiment, setLoadingSentiment] = useState(false);

    // Follow-up Reminder State
    const [showReminderModal, setShowReminderModal] = useState(false);
    const [reminderDate, setReminderDate] = useState('');
    const [reminderTime, setReminderTime] = useState('10:00');
    const [reminderNote, setReminderNote] = useState('');

    // Conversation Tags State
    const [showTagsModal, setShowTagsModal] = useState(false);
    const [conversationTags, setConversationTags] = useState<string[]>([]);
    const [newTagInput, setNewTagInput] = useState('');

    // Predefined tags
    const PREDEFINED_TAGS = [
        { label: 'VIP', color: 'bg-yellow-500', icon: '⭐' },
        { label: 'Queja', color: 'bg-red-500', icon: '😤' },
        { label: 'Nuevo', color: 'bg-green-500', icon: '🆕' },
        { label: 'Urgente', color: 'bg-orange-500', icon: '🔥' },
        { label: 'Recompra', color: 'bg-blue-500', icon: '🔄' },
        { label: 'Mayoreo', color: 'bg-purple-500', icon: '📦' },
        { label: 'Soporte', color: 'bg-pink-500', icon: '🛠️' },
        { label: 'Potencial', color: 'bg-cyan-500', icon: '💎' },
    ];

    // Phase 62: Extract unique tags from all conversations for dynamic filtering
    const availableTags = useMemo(() => {
        const tagSet = new Set<string>();
        conversations.forEach(c => {
            c.tags?.forEach(t => tagSet.add(t));
        });
        return Array.from(tagSet).sort();
    }, [conversations]);

    const filteredConversations = useMemo(() => {
        let base = conversations;

        // --- PHASE 62: ADVANCED FILTERS ---
        if (activeFilters.length > 0) {
            base = base.filter(c => {
                return activeFilters.every(filter => {
                    // Status filters
                    if (filter === 'nuevo') return c.is_new_customer;
                    if (filter === 'comprador') return !c.is_new_customer || (c.ltv || 0) > 0;
                    if (filter === 'vip') return c.is_vip;
                    if (filter === 'estancado') return c.is_stalled;
                    if (filter === 'exp') return c.window_status === 'expired';
                    if (filter === 'activo') return c.window_status === 'active';
                    if (filter === 'pendiente') return c.awaiting_response;

                    // Channel filters
                    if (filter === 'whatsapp') return c.channel === 'WA';
                    if (filter === 'email') return c.channel === 'EMAIL';
                    if (filter === 'instagram') return c.channel === 'IG';

                    // Emotional/Intent filters (from facts)
                    if (filter === 'high_friction') return (c.facts?.friction_score || 0) >= 70;
                    if (filter === 'low_friction') return (c.facts?.friction_score || 50) < 40;
                    if (filter === 'hot_intent') return (c.facts?.intent_score || 0) >= 70;
                    if (filter === 'cold_intent') return (c.facts?.intent_score || 50) < 40;
                    if (filter === 'frustrated') {
                        const vibe = (c.facts?.emotional_vibe || '').toLowerCase();
                        return vibe.includes('frustrad') || vibe.includes('molest') || vibe.includes('enojad');
                    }
                    if (filter === 'enthusiastic') {
                        const vibe = (c.facts?.emotional_vibe || '').toLowerCase();
                        return vibe.includes('entusiasm') || vibe.includes('emocion') || vibe.includes('feliz');
                    }

                    // Dynamic tag filter (prefixed with "tag:")
                    if (filter.startsWith('tag:')) {
                        const tagName = filter.substring(4);
                        return c.tags?.some(t => t.toLowerCase() === tagName.toLowerCase());
                    }

                    return true;
                });
            });
        }

        // Search filter
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            const rawSearch = searchTerm.replace(/\D/g, ''); // Extract only digits for phone matching

            base = base.filter(c => {
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

        // --- PHASE 62: SMART SORTING ---
        return [...base].sort((a, b) => {
            switch (sortBy) {
                case 'session':
                    // Sort by hours_remaining (most time remaining first: 24h, 23h, 20h... 0h, expired)
                    const aExpired = a.window_status === 'expired';
                    const bExpired = b.window_status === 'expired';
                    if (aExpired && !bExpired) return 1;  // Expired goes to bottom
                    if (!aExpired && bExpired) return -1;
                    if (aExpired && bExpired) {
                        // Both expired: most recent first
                        return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
                    }
                    // Both active: highest hours remaining first (freshest sessions at top)
                    return (b.hours_remaining || 0) - (a.hours_remaining || 0);

                case 'ltv':
                    // Sort by LTV (highest first)
                    return (b.ltv || 0) - (a.ltv || 0);

                case 'recent':
                default:
                    // Sort by most recent message
                    return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
            }
        });
    }, [conversations, searchTerm, activeFilters, sortBy]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Channel Health Check
    useEffect(() => {
        const fetchChannelHealth = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/crm/comm-health`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setChannelHealth(data);
                }
            } catch (err) {
                console.error('Failed to fetch channel health:', err);
            }
        };
        fetchChannelHealth();
        // Refresh every 2 minutes
        const interval = setInterval(fetchChannelHealth, 120000);
        return () => clearInterval(interval);
    }, [token]);

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

    // Client search with debounce
    useEffect(() => {
        if (!searchTerm || searchTerm.length < 2) {
            setClientSearchResults([]);
            setShowClientResults(false);
            return;
        }

        const timer = setTimeout(async () => {
            setSearchingClients(true);
            try {
                const res = await fetch(`/api/v1/crm/clients/search?q=${encodeURIComponent(searchTerm)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.data.length > 0) {
                    setClientSearchResults(data.data);
                    setShowClientResults(true);
                    // Calculate dropdown position
                    if (searchInputRef.current) {
                        const rect = searchInputRef.current.getBoundingClientRect();
                        setDropdownPosition({
                            top: rect.bottom + 8,
                            left: Math.max(rect.left - 60, 10)
                        });
                    }
                } else {
                    setClientSearchResults([]);
                    setShowClientResults(false);
                }
            } catch (err) {
                console.error('Client search failed:', err);
                setClientSearchResults([]);
            } finally {
                setSearchingClients(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchTerm, token]);

    // Start conversation with a client from search results
    const handleStartConversation = async (client: any, channel: 'EMAIL' | 'WA' = 'EMAIL') => {
        try {
            const res = await fetch('/api/v1/crm/clients/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    client_id: client.id,
                    channel
                })
            });
            const data = await res.json();
            if (data.success) {
                // Refresh conversations and select the new/existing one
                const updatedConversations = await fetchConversations();
                const conv = updatedConversations.find((c: Conversation) => c.id === data.data.conversation_id);
                if (conv) {
                    setSelectedConv(conv);
                }
                setShowClientResults(false);
                setSearchTerm('');
            } else {
                console.error('Start conversation error:', data.error);
                alert(`Error: ${data.error}`);
            }
        } catch (err: any) {
            console.error('Failed to start conversation:', err);
            alert(`Error al iniciar conversación: ${err.message}`);
        }
    };

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

    // Auto-select conversation when redirected from impersonation end
    useEffect(() => {
        const clientId = searchParams.get('client');
        if (clientId && conversations.length > 0 && !selectedConv) {
            // Find conversation by client ID (need to fetch client's phone/email first)
            const fetchClientConversation = async () => {
                try {
                    const res = await fetch(`/api/v1/crm/clients/${clientId}/conversation`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.success && data.data?.conversation) {
                        // Find this conversation in our loaded conversations
                        const conv = conversations.find(c => c.id === data.data.conversation.id);
                        if (conv) {
                            setSelectedConv(conv);
                        }
                    }
                    // Clear the URL parameter
                    setSearchParams({});
                } catch (err) {
                    console.error('Error fetching client conversation:', err);
                }
            };
            fetchClientConversation();
        }
    }, [searchParams, conversations, selectedConv, token]);

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
                        setMessages((prev) => {
                            // Avoid duplicates
                            if (prev.some(m => m.id === payload.new.id)) return prev;
                            return [...prev, payload.new];
                        });
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

    // Polling fallback: fetch new messages every 3 seconds as backup to Realtime
    useEffect(() => {
        if (!selectedConv || !token) return;

        const pollMessages = async () => {
            try {
                const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success && data.data) {
                    const newMsgs = data.data;
                    setMessages((prev: any[]) => {
                        // Check if there are genuinely new messages by comparing the last message ID
                        const prevLastId = prev.length > 0 ? prev[prev.length - 1]?.id : null;
                        const newLastId = newMsgs.length > 0 ? newMsgs[newMsgs.length - 1]?.id : null;

                        // If different count or different last message, update
                        if (newMsgs.length !== prev.length || prevLastId !== newLastId) {
                            setTimeout(scrollToBottom, 200);
                            return newMsgs;
                        }
                        return prev;
                    });
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        };

        const interval = setInterval(pollMessages, 3000);
        return () => clearInterval(interval);
    }, [selectedConv, token]);

    // Customer 360 Fetcher
    useEffect(() => {
        if (selectedConv && resourceDockTab === 'insights' && showResourceDock) {
            // fetchBrowsingEvents(selectedConv.contact_handle); // Moved to 'behavior' tab
        }
    }, [selectedConv, resourceDockTab, showResourceDock]);

    useEffect(() => {
        if (resourceDockTab === 'insights' && selectedConv && showResourceDock) {
            // Priority: snapshot email > facts email > handle if email
            const email = contactSnapshot?.email || selectedConv.facts?.user_email || (selectedConv.contact_handle.includes('@') ? selectedConv.contact_handle : undefined);
            fetchBrowsingEvents(selectedConv.contact_handle, email);
        }
    }, [selectedConv, resourceDockTab, showResourceDock, contactSnapshot]);

    useEffect(() => {
        // Load snapshot for both 'client' and 'insights' tabs (needed for email identity bridge)
        if (selectedConv && (resourceDockTab === 'client' || resourceDockTab === 'insights') && showResourceDock) {
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
                                <span className="text-[9px] opacity-40 truncate flex-1">{(() => { try { return new URL(url).hostname; } catch { return url; } })()}</span>
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

    // Standalone function to refresh conversations
    const fetchConversations = async () => {
        try {
            const resConv = await fetch('/api/v1/crm/conversations', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const dataConv = await resConv.json();
            if (dataConv.success) {
                const unique = Array.from(new Map(dataConv.data.map((c: Conversation) => [c.id, c])).values());
                setConversations(unique as Conversation[]);
                return unique as Conversation[];
            }
        } catch (err) {
            console.error('Failed to fetch conversations:', err);
        }
        return [];
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

    // Send internal note (not visible to customer)
    const handleSendInternalNote = async () => {
        if (!newMessage.trim() || !selectedConv) return;
        setSendingMessage(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: newMessage })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setMessages([...messages, result.data]);
                    setNewMessage('');
                }
            }
        } catch (e) {
            console.error('Error sending internal note', e);
            alert('Error al guardar nota interna');
        } finally {
            setSendingMessage(false);
        }
    };

    // Open schedule modal
    const openScheduleModal = (type: 'text' | 'voice') => {
        if (!newMessage.trim()) return;
        // Set default date/time to tomorrow at 10:00
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setScheduleDate(tomorrow.toISOString().split('T')[0]);
        setScheduleTime('10:00');
        setScheduleType(type);
        setShowScheduleModal(true);
    };

    // Handle scheduling a message
    const handleScheduleMessage = async () => {
        if (!newMessage.trim() || !selectedConv || !scheduleDate || !scheduleTime) return;
        setSendingMessage(true);
        try {
            const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    content: newMessage,
                    scheduledFor: scheduledFor,
                    isVoice: scheduleType === 'voice'
                })
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setScheduledMessages([...scheduledMessages, result.data]);
                    setNewMessage('');
                    setShowScheduleModal(false);
                    alert(`Mensaje programado para ${new Date(scheduledFor).toLocaleString('es-MX')}`);
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Error al programar mensaje');
            }
        } catch (e) {
            console.error('Error scheduling message', e);
            alert('Error al programar mensaje');
        } finally {
            setSendingMessage(false);
        }
    };

    // Fetch scheduled messages for current conversation
    const fetchScheduledMessages = async () => {
        if (!selectedConv) return;
        setLoadingScheduled(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/messages/scheduled`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setScheduledMessages(result.data || []);
                }
            }
        } catch (e) {
            console.error('Error fetching scheduled messages', e);
        } finally {
            setLoadingScheduled(false);
        }
    };

    // Cancel a scheduled message
    const cancelScheduledMessage = async (messageId: string) => {
        if (!confirm('¿Cancelar este mensaje programado?')) return;
        try {
            const res = await fetch(`/api/v1/crm/messages/${messageId}/schedule`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setScheduledMessages(scheduledMessages.filter(m => m.id !== messageId));
            }
        } catch (e) {
            console.error('Error canceling scheduled message', e);
        }
    };

    // Load scheduled messages when conversation changes
    useEffect(() => {
        if (selectedConv) {
            fetchScheduledMessages();
            fetchSentiment(); // Auto-fetch sentiment when conversation changes
        } else {
            setScheduledMessages([]);
            setSentimentData(null);
        }
    }, [selectedConv?.id]);

    // Fetch AI summary for conversation
    const fetchSummary = async () => {
        if (!selectedConv) return;
        setLoadingSummary(true);
        setSummaryData(null);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setSummaryData(result.data);
                }
            }
        } catch (e) {
            console.error('Error fetching summary', e);
        } finally {
            setLoadingSummary(false);
        }
    };

    // Fetch sentiment analysis
    const fetchSentiment = async () => {
        if (!selectedConv) return;
        setLoadingSentiment(true);
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/sentiment`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setSentimentData(result.data);
                }
            }
        } catch (e) {
            console.error('Error fetching sentiment', e);
        } finally {
            setLoadingSentiment(false);
        }
    };

    // Open reminder modal with defaults
    const openReminderModal = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setReminderDate(tomorrow.toISOString().split('T')[0]);
        setReminderTime('10:00');
        setReminderNote(`Seguimiento con ${selectedConv?.contact_handle || 'cliente'}`);
        setShowReminderModal(true);
    };

    // Generate Google Calendar link
    const generateCalendarLink = () => {
        if (!reminderDate || !reminderTime || !selectedConv) return '';

        const startDate = new Date(`${reminderDate}T${reminderTime}`);
        const endDate = new Date(startDate.getTime() + 30 * 60000); // 30 min duration

        // Format dates for Google Calendar (YYYYMMDDTHHmmss)
        const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: `📞 Follow-up: ${selectedConv.contact_handle}`,
            dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
            details: `${reminderNote}\n\nCliente: ${selectedConv.contact_handle}\nCanal: ${selectedConv.channel}\nConversación ID: ${selectedConv.id}`,
            location: 'CRM - Extractoseum',
        });

        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    };

    // Create reminder (opens Google Calendar)
    const handleCreateReminder = () => {
        const link = generateCalendarLink();
        if (link) {
            window.open(link, '_blank');
            setShowReminderModal(false);
        }
    };

    // Open tags modal
    const openTagsModal = () => {
        setConversationTags(selectedConv?.tags || []);
        setNewTagInput('');
        setShowTagsModal(true);
    };

    // Toggle a tag
    const toggleTag = (tag: string) => {
        const normalizedTag = tag.toLowerCase().trim();
        if (conversationTags.includes(normalizedTag)) {
            setConversationTags(conversationTags.filter(t => t !== normalizedTag));
        } else {
            setConversationTags([...conversationTags, normalizedTag]);
        }
    };

    // Add custom tag
    const addCustomTag = () => {
        const tag = newTagInput.toLowerCase().trim();
        if (tag && !conversationTags.includes(tag)) {
            setConversationTags([...conversationTags, tag]);
            setNewTagInput('');
        }
    };

    // Save tags to server
    const saveTags = async () => {
        if (!selectedConv) return;
        try {
            const res = await fetch(`/api/v1/crm/conversations/${selectedConv.id}/tags`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ tags: conversationTags })
            });
            if (res.ok) {
                // Update local state
                setConversations(conversations.map(c =>
                    c.id === selectedConv.id ? { ...c, tags: conversationTags } : c
                ));
                if (selectedConv) {
                    setSelectedConv({ ...selectedConv, tags: conversationTags });
                }
                setShowTagsModal(false);
            }
        } catch (e) {
            console.error('Error saving tags', e);
        }
    };

    // Get tag color
    const getTagStyle = (tag: string) => {
        const predefined = PREDEFINED_TAGS.find(t => t.label.toLowerCase() === tag.toLowerCase());
        if (predefined) return predefined.color;
        return 'bg-gray-500';
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
                                <h1 className="text-sm sm:text-lg font-bold truncate flex items-center gap-2" style={{ color: theme.text }}>
                                    Omnichannel CRM <span className="text-[10px] bg-purple-500 text-white px-1 rounded ml-1 align-middle animate-pulse">v2.10</span>
                                    {/* Channel Health Indicator */}
                                    {channelHealth && (
                                        <span
                                            className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help ${
                                                channelHealth.status === 'critical' ? 'bg-red-500/20 text-red-400' :
                                                channelHealth.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' :
                                                'bg-green-500/20 text-green-400'
                                            }`}
                                            title={channelHealth.channels?.map((c: any) => `${c.channel}: ${c.status}`).join(', ')}
                                        >
                                            {channelHealth.status === 'critical' && <><AlertTriangle size={10} /> Canal caído</>}
                                            {channelHealth.status === 'degraded' && <><AlertCircle size={10} /> Degradado</>}
                                            {channelHealth.status === 'healthy' && <><Wifi size={10} /></>}
                                        </span>
                                    )}
                                </h1>
                                <p className="text-xs opacity-50 truncate hidden sm:block" style={{ color: theme.text }}>Tablero de Conversaciones Inteligentes</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 min-w-0 shrink overflow-visible">
                            <div className="relative shrink min-w-[20px] max-w-[300px] overflow-visible">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none" style={{ color: theme.text }} />
                                {searchingClients && (
                                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-pink-400" />
                                )}
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Cliente, email, orden..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onFocus={() => {
                                        if (clientSearchResults.length > 0 && searchInputRef.current) {
                                            const rect = searchInputRef.current.getBoundingClientRect();
                                            setDropdownPosition({ top: rect.bottom + 8, left: Math.max(rect.left - 60, 10) });
                                            setShowClientResults(true);
                                        }
                                    }}
                                    onBlur={() => setTimeout(() => setShowClientResults(false), 300)}
                                    className="bg-black/20 border rounded-full pl-9 pr-8 py-1.5 text-sm outline-none w-full transition-all focus:border-pink-500/50"
                                    style={{ borderColor: theme.border, color: theme.text }}
                                />
                                {/* Client Search Dropdown - Fixed positioning to avoid clipping */}
                                {showClientResults && clientSearchResults.length > 0 && (
                                    <div
                                        className="fixed rounded-xl shadow-2xl border overflow-hidden"
                                        style={{
                                            backgroundColor: theme.cardBg,
                                            borderColor: theme.border,
                                            zIndex: 9999,
                                            width: '380px',
                                            maxWidth: '90vw',
                                            top: dropdownPosition.top,
                                            left: dropdownPosition.left
                                        }}
                                    >
                                        <div className="px-3 py-2 border-b text-xs font-medium flex items-center gap-2" style={{ borderColor: theme.border, color: theme.textMuted }}>
                                            <Users size={12} />
                                            Clientes encontrados ({clientSearchResults.length})
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {clientSearchResults.map((client: any) => (
                                                <div
                                                    key={client.id}
                                                    className="px-3 py-2 hover:bg-white/5 cursor-pointer border-b last:border-0 transition-colors"
                                                    style={{ borderColor: theme.border }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                                                    style={{ background: getAvatarGradient(client.email || client.phone || 'U') }}
                                                                >
                                                                    {(client.name || client.email || 'U')[0].toUpperCase()}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium truncate" style={{ color: theme.text }}>
                                                                        {client.name || 'Sin nombre'}
                                                                    </p>
                                                                    <div className="flex items-center gap-2 text-xs" style={{ color: theme.textMuted }}>
                                                                        {client.email && (
                                                                            <span className="flex items-center gap-1 truncate">
                                                                                <Mail size={10} /> {client.email}
                                                                            </span>
                                                                        )}
                                                                        {client.phone && (
                                                                            <span className="flex items-center gap-1">
                                                                                <Phone size={10} /> {client.phone}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-2 shrink-0">
                                                            {client.has_conversation ? (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const conv = conversations.find(c => c.id === client.conversation_id);
                                                                        if (conv) {
                                                                            setSelectedConv(conv);
                                                                            setShowClientResults(false);
                                                                            setSearchTerm('');
                                                                        }
                                                                    }}
                                                                    className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                                                                    title="Ver conversación existente"
                                                                >
                                                                    <MessageSquare size={14} />
                                                                </button>
                                                            ) : (
                                                                <>
                                                                    {client.email && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStartConversation(client, 'EMAIL');
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                                                                            title="Iniciar conversación por Email"
                                                                        >
                                                                            <Mail size={14} />
                                                                        </button>
                                                                    )}
                                                                    {client.phone && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStartConversation(client, 'WA');
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                                                                            title="Iniciar conversación por WhatsApp"
                                                                        >
                                                                            <MessageCircle size={14} />
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Show matched orders if searching by order number */}
                                                    {client.matched_orders && client.matched_orders.length > 0 && (
                                                        <div className="mt-1.5 ml-10 flex flex-wrap gap-1">
                                                            {client.matched_orders.map((order: any, idx: number) => (
                                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 text-[10px]">
                                                                    <Hash size={8} /> {order.order_number}
                                                                    {order.total_price && <span className="opacity-70">${Number(order.total_price).toFixed(0)}</span>}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {client.total_orders > 0 && !client.matched_orders && (
                                                        <div className="mt-1 flex items-center gap-2 text-[10px] ml-10" style={{ color: theme.textMuted }}>
                                                            <span className="flex items-center gap-1">
                                                                <ShoppingBag size={10} /> {client.total_orders} pedidos
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Filter Toggle */}
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={`p-2 rounded-full transition-colors relative ${showFilters || activeFilters.length > 0 ? 'bg-pink-500/20 text-pink-400' : 'hover:bg-white/5 text-gray-400'}`}
                                    title="Filtros avanzados"
                                >
                                    <Filter size={20} />
                                    {activeFilters.length > 0 && (
                                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                                            {activeFilters.length}
                                        </span>
                                    )}
                                </button>
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

                    {/* Phase 62: Filter & Sort Toolbar */}
                    {showFilters && (
                        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.2)' }}>
                            {/* Sort Options */}
                            <div className="flex items-center gap-1 mr-4">
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-40 mr-2">Ordenar:</span>
                                {[
                                    { key: 'session', label: 'Sesión 24h', icon: Clock },
                                    { key: 'recent', label: 'Reciente', icon: Activity },
                                    { key: 'ltv', label: 'LTV', icon: DollarSign }
                                ].map(opt => (
                                    <button
                                        key={opt.key}
                                        onClick={() => setSortBy(opt.key as any)}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${sortBy === opt.key ? 'bg-pink-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                    >
                                        <opt.icon size={10} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {/* Status Filters */}
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-40 mr-2">Estado:</span>
                                {[
                                    { key: 'nuevo', label: 'Nuevo', color: 'blue' },
                                    { key: 'comprador', label: 'Comprador', color: 'emerald' },
                                    { key: 'vip', label: 'VIP', color: 'yellow' },
                                    { key: 'pendiente', label: 'Pendiente', color: 'pink' },
                                    { key: 'estancado', label: 'Estancado', color: 'gray' },
                                    { key: 'activo', label: 'Activo 24h', color: 'green' },
                                    { key: 'exp', label: 'Expirado', color: 'red' },
                                ].map(f => {
                                    const isActive = activeFilters.includes(f.key);
                                    const colorMap: Record<string, string> = {
                                        blue: isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
                                        emerald: isActive ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
                                        yellow: isActive ? 'bg-yellow-500 text-black' : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
                                        pink: isActive ? 'bg-pink-500 text-white' : 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20',
                                        gray: isActive ? 'bg-gray-500 text-white' : 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20',
                                        green: isActive ? 'bg-green-500 text-white' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
                                        red: isActive ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                                    };
                                    return (
                                        <button
                                            key={f.key}
                                            onClick={() => setActiveFilters(prev =>
                                                prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key]
                                            )}
                                            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${colorMap[f.color]}`}
                                        >
                                            {f.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Emotional/Intent Filters */}
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-40 mr-2">Emoción:</span>
                                {[
                                    { key: 'hot_intent', label: '🔥 Listo p/comprar', color: 'text-orange-400 bg-orange-500' },
                                    { key: 'cold_intent', label: '❄️ Solo mirando', color: 'text-cyan-400 bg-cyan-500' },
                                    { key: 'frustrated', label: '😤 Frustrado', color: 'text-red-400 bg-red-500' },
                                    { key: 'enthusiastic', label: '😊 Entusiasta', color: 'text-green-400 bg-green-500' },
                                    { key: 'high_friction', label: '⚠️ Alta fricción', color: 'text-amber-400 bg-amber-500' },
                                ].map(f => {
                                    const isActive = activeFilters.includes(f.key);
                                    return (
                                        <button
                                            key={f.key}
                                            onClick={() => setActiveFilters(prev =>
                                                prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key]
                                            )}
                                            className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${isActive ? `${f.color.split(' ')[1]} text-white` : `${f.color.split(' ')[1]}/10 ${f.color.split(' ')[0]} hover:${f.color.split(' ')[1]}/20`}`}
                                        >
                                            {f.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Channel Filters */}
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-40 mr-2">Canal:</span>
                                {[
                                    { key: 'whatsapp', label: 'WA', icon: MessageCircle },
                                    { key: 'email', label: 'Email', icon: Mail },
                                    { key: 'instagram', label: 'IG', icon: Instagram },
                                ].map(ch => {
                                    const isActive = activeFilters.includes(ch.key);
                                    return (
                                        <button
                                            key={ch.key}
                                            onClick={() => setActiveFilters(prev =>
                                                prev.includes(ch.key) ? prev.filter(x => x !== ch.key) : [...prev, ch.key]
                                            )}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${isActive ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                                        >
                                            <ch.icon size={10} />
                                            {ch.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Dynamic Tag Filters (from Shopify/system) */}
                            {availableTags.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-40 mr-2">Tags:</span>
                                    {(showAllTags ? availableTags : availableTags.slice(0, 12)).map(tag => {
                                        const filterKey = `tag:${tag}`;
                                        const isActive = activeFilters.includes(filterKey);
                                        return (
                                            <button
                                                key={tag}
                                                onClick={() => setActiveFilters(prev =>
                                                    prev.includes(filterKey) ? prev.filter(x => x !== filterKey) : [...prev, filterKey]
                                                )}
                                                className={`px-2 py-1 rounded-full text-[10px] font-bold transition-all ${isActive ? 'bg-purple-500 text-white' : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20'}`}
                                            >
                                                {tag}
                                            </button>
                                        );
                                    })}
                                    {availableTags.length > 12 && (
                                        <button
                                            onClick={() => setShowAllTags(!showAllTags)}
                                            className="text-[9px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                                        >
                                            {showAllTags ? 'Ver menos' : `+${availableTags.length - 12} más`}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Clear Filters */}
                            {activeFilters.length > 0 && (
                                <button
                                    onClick={() => setActiveFilters([])}
                                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                                >
                                    <X size={10} />
                                    Limpiar ({activeFilters.length})
                                </button>
                            )}
                        </div>
                    )}

                    {/* Active Filters Summary (when toolbar hidden) */}
                    {!showFilters && activeFilters.length > 0 && (
                        <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: theme.border, backgroundColor: 'rgba(0,0,0,0.1)' }}>
                            <span className="text-[10px] opacity-40">Filtros activos:</span>
                            {activeFilters.map(f => (
                                <span key={f} className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold">
                                    {f}
                                </span>
                            ))}
                            <button
                                onClick={() => setActiveFilters([])}
                                className="ml-auto text-[10px] text-red-400 hover:text-red-300"
                            >
                                Limpiar
                            </button>
                        </div>
                    )}

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
                                    {/* Sentiment Indicator */}
                                    {sentimentData && (
                                        <div
                                            className={`ml-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                                                sentimentData.sentiment === 'positive' || sentimentData.sentiment === 'excited' ? 'bg-green-500/20 text-green-400' :
                                                sentimentData.sentiment === 'negative' || sentimentData.sentiment === 'frustrated' ? 'bg-red-500/20 text-red-400' :
                                                sentimentData.sentiment === 'confused' ? 'bg-orange-500/20 text-orange-400' :
                                                'bg-gray-500/20 text-gray-400'
                                            }`}
                                            title={sentimentData.reason}
                                        >
                                            <span>{sentimentData.emoji}</span>
                                            <span className="hidden sm:inline capitalize">{sentimentData.sentiment}</span>
                                        </div>
                                    )}
                                    {loadingSentiment && (
                                        <div className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-400">
                                            <Loader2 size={10} className="animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 px-2">
                                    {/* AI Summary Button */}
                                    <button
                                        onClick={() => { setShowSummaryModal(true); fetchSummary(); }}
                                        className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-colors"
                                        title="Resumen AI de Conversación"
                                    >
                                        <Brain size={16} />
                                    </button>
                                    {/* Follow-up Reminder Button */}
                                    <button
                                        onClick={openReminderModal}
                                        className="p-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors"
                                        title="Crear Recordatorio de Seguimiento"
                                    >
                                        <Bell size={16} />
                                    </button>
                                    {/* Tags Button */}
                                    <button
                                        onClick={openTagsModal}
                                        className="p-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors relative"
                                        title="Gestionar Etiquetas"
                                    >
                                        <Tag size={16} />
                                        {selectedConv.tags && selectedConv.tags.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 text-white text-[9px] rounded-full flex items-center justify-center">
                                                {selectedConv.tags.length}
                                            </span>
                                        )}
                                    </button>
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
                                            messages.map((msg, i) => {
                                                // Detect internal notes by flag, message_type, or content prefix
                                                const isInternal = msg.is_internal || msg.message_type === 'internal_note' || msg.content?.startsWith('[NOTA INTERNA]');
                                                const displayContent = isInternal && msg.content?.startsWith('[NOTA INTERNA]')
                                                    ? msg.content.replace('[NOTA INTERNA] ', '')
                                                    : msg.content;
                                                const isAIMessage = msg.direction === 'outbound' && msg.role === 'assistant';

                                                return (
                                                    <div key={i} className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'} group`}>
                                                        {/* Reply context if replying to a message */}
                                                        {msg.reply_to && (
                                                            <div className={`max-w-[70%] mb-1 px-2 py-1 rounded-lg text-[10px] ${msg.direction === 'outbound' ? 'mr-2' : 'ml-2'} bg-white/5 border-l-2 border-white/20 opacity-60`}>
                                                                <span className="text-white/50">Respondiendo a: </span>
                                                                <span className="text-white/70 truncate block">{msg.reply_to.content?.substring(0, 50)}...</span>
                                                            </div>
                                                        )}

                                                        <div
                                                            className={`max-w-[92%] md:max-w-[85%] rounded-2xl p-3 text-sm shadow-sm relative ${
                                                                isInternal
                                                                    ? 'bg-yellow-500/20 border border-yellow-500/30 rounded-br-none'
                                                                    : msg.direction === 'outbound'
                                                                        ? 'rounded-br-none'
                                                                        : 'bg-white/5 border border-white/10 rounded-bl-none'
                                                            }`}
                                                            style={{
                                                                backgroundColor: isInternal
                                                                    ? undefined
                                                                    : msg.direction === 'outbound' ? `${theme.accent}20` : undefined,
                                                                color: msg.direction === 'outbound' ? theme.text : undefined,
                                                                borderColor: isInternal
                                                                    ? undefined
                                                                    : msg.direction === 'outbound' ? `${theme.accent}20` : undefined,
                                                                borderWidth: msg.direction === 'outbound' ? '1px' : undefined
                                                            }}
                                                        >
                                                            {/* Internal note indicator */}
                                                            {isInternal && (
                                                                <div className="flex items-center gap-1 text-[10px] text-yellow-400 mb-1 font-medium">
                                                                    <span>📝</span> Nota Interna
                                                                </div>
                                                            )}

                                                            {msg.type === 'image' && msg.content && !msg.content.startsWith('[') && (
                                                                <img src={msg.content} alt="Media" className="rounded-lg mb-2 max-w-full" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                            )}
                                                            <div className="whitespace-pre-wrap leading-relaxed">
                                                                {parseMediaContent(displayContent || '')}
                                                            </div>

                                                            {/* AI Feedback buttons - only show on AI assistant messages */}
                                                            {isAIMessage && !isInternal && (
                                                                <div className={`flex items-center gap-1 mt-2 pt-2 border-t border-white/5 ${msg.ai_feedback ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                                    <span className="text-[9px] text-white/30 mr-1">IA:</span>
                                                                    <button
                                                                        onClick={async () => {
                                                                            const token = localStorage.getItem('accessToken');
                                                                            await fetch(`/api/v1/crm/messages/${msg.id}/feedback`, {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                                body: JSON.stringify({ feedback: 'positive' })
                                                                            });
                                                                            // Update local state
                                                                            setMessages(prev => prev.map(m => m.id === msg.id ? {...m, ai_feedback: 'positive'} : m));
                                                                        }}
                                                                        className={`p-1 rounded transition-colors ${msg.ai_feedback === 'positive' ? 'text-green-400 bg-green-500/20' : 'text-white/30 hover:text-green-400 hover:bg-green-500/10'}`}
                                                                        title="Buena respuesta"
                                                                    >
                                                                        👍
                                                                    </button>
                                                                    <button
                                                                        onClick={async () => {
                                                                            const token = localStorage.getItem('accessToken');
                                                                            await fetch(`/api/v1/crm/messages/${msg.id}/feedback`, {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                                                body: JSON.stringify({ feedback: 'negative' })
                                                                            });
                                                                            setMessages(prev => prev.map(m => m.id === msg.id ? {...m, ai_feedback: 'negative'} : m));
                                                                        }}
                                                                        className={`p-1 rounded transition-colors ${msg.ai_feedback === 'negative' ? 'text-red-400 bg-red-500/20' : 'text-white/30 hover:text-red-400 hover:bg-red-500/10'}`}
                                                                        title="Mala respuesta"
                                                                    >
                                                                        👎
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="text-[9px] opacity-30 mt-1 font-mono px-1 flex items-center gap-1">
                                                            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} • {isInternal ? 'NOTA INTERNA' : msg.direction === 'outbound' ? 'AGENTE' : 'CLIENTE'}
                                                            {/* Channel delivery indicator */}
                                                            {msg.direction === 'outbound' && msg.raw_payload?.delivery_info && (
                                                                <span className="ml-1 flex items-center gap-0.5" title={`Enviado por ${msg.raw_payload.delivery_info.channel_used || 'WA'}`}>
                                                                    {msg.raw_payload.delivery_info.channel_used === 'email' && <span className="text-blue-400">📧</span>}
                                                                    {msg.raw_payload.delivery_info.channel_used === 'sms' && <span className="text-green-400">💬</span>}
                                                                    {msg.raw_payload.delivery_info.channel_used === 'whatsapp' && <span className="text-emerald-400">✓</span>}
                                                                    {msg.raw_payload.delivery_info.email_sent && msg.raw_payload.delivery_info.channel_used !== 'email' && (
                                                                        <span className="text-blue-300 opacity-60" title="Email backup enviado">+📧</span>
                                                                    )}
                                                                    {msg.status === 'failed' && <span className="text-red-400">⚠️</span>}
                                                                </span>
                                                            )}
                                                            {msg.direction === 'outbound' && !msg.raw_payload?.delivery_info && msg.status === 'delivered' && (
                                                                <span className="text-emerald-400/50">✓</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                );
                                            })
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

                                            <SmartTextarea
                                                value={newMessage}
                                                onChange={setNewMessage}
                                                onSend={handleSendMessage}
                                                onSendVoice={handleSendVoice}
                                                disabled={sendingMessage}
                                                placeholder="Escribe un mensaje..."
                                                conversationId={selectedConv?.id}
                                                clientContext={{
                                                    name: contactSnapshot?.name || selectedConv?.contact_name,
                                                    facts: selectedConv?.facts ? [
                                                        selectedConv.facts.emotional_vibe,
                                                        selectedConv.facts.user_name,
                                                        ...(selectedConv.facts.action_plan || []).slice(0, 3)
                                                    ].filter(Boolean) : undefined,
                                                    recentMessages: messages.slice(-5).map((m: any) => ({ role: m.role, content: m.content })),
                                                }}
                                            />

                                            <div className="flex flex-row gap-2 justify-end pb-1 pl-1">
                                                {/* Internal Note Button */}
                                                <button
                                                    onClick={handleSendInternalNote}
                                                    disabled={sendingMessage || !newMessage.trim()}
                                                    className={`p-2 h-[44px] w-[44px] md:h-[48px] md:w-[48px] flex items-center justify-center rounded-xl transition-all ${sendingMessage || !newMessage.trim() ? 'opacity-30 grayscale cursor-not-allowed' : 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 shadow-lg border border-yellow-500/20 active:scale-95'}`}
                                                    title="Guardar Nota Interna (no se envía al cliente)"
                                                >
                                                    <StickyNote size={20} />
                                                </button>

                                                {/* Schedule Message Button */}
                                                <div className="relative group">
                                                    <button
                                                        onClick={() => openScheduleModal('text')}
                                                        disabled={sendingMessage || !newMessage.trim()}
                                                        className={`p-2 h-[44px] w-[44px] md:h-[48px] md:w-[48px] flex items-center justify-center rounded-xl transition-all ${sendingMessage || !newMessage.trim() ? 'opacity-30 grayscale cursor-not-allowed' : 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 shadow-lg border border-blue-500/20 active:scale-95'}`}
                                                        title="Programar Mensaje"
                                                    >
                                                        <Clock size={20} />
                                                    </button>
                                                    {/* Quick access dropdown for voice scheduling */}
                                                    {newMessage.trim() && (
                                                        <div className="absolute bottom-full mb-1 right-0 hidden group-hover:flex flex-col gap-1 bg-black/90 border border-white/10 rounded-lg p-1 min-w-[140px] shadow-xl z-50">
                                                            <button
                                                                onClick={() => openScheduleModal('text')}
                                                                className="flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/10 rounded"
                                                            >
                                                                <Send size={14} /> Programar Texto
                                                            </button>
                                                            <button
                                                                onClick={() => openScheduleModal('voice')}
                                                                className="flex items-center gap-2 px-3 py-2 text-xs text-pink-400 hover:bg-white/10 rounded"
                                                            >
                                                                <Mic size={14} /> Programar Audio
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

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
                                                    <SystemInquiryCard
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
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        if (action === 'Crear Ticket') {
                                                                            setShowCreateTicketModal(true);
                                                                            return;
                                                                        }
                                                                        const texts: Record<string, string> = {
                                                                            'Pedir Pago': 'Hola! Para proceder, puedes realizar tu pago aquí: [Link de Pago]',
                                                                            'Enviar Catálogo': 'Claro, aquí tienes nuestro catálogo actualizado: [Enlace al Catálogo]',
                                                                            'Agendar Llamada': '¿Te gustaría agendar una llamada con uno de nuestros asesores?'
                                                                        };
                                                                        setNewMessage(prev => prev + (prev ? '\n' : '') + (texts[action] || ''));
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

                                                    {/* Impersonate Client Button */}
                                                    {isSuperAdmin && contactSnapshot?.client_id && (
                                                        <div className="pt-4 border-t border-white/10">
                                                            <button
                                                                onClick={() => {
                                                                    setImpersonationTarget({
                                                                        id: contactSnapshot.client_id!,
                                                                        name: contactSnapshot.name,
                                                                        email: contactSnapshot.email,
                                                                        phone: contactSnapshot.handle
                                                                    });
                                                                    setShowImpersonationModal(true);
                                                                }}
                                                                disabled={impersonation.isImpersonating}
                                                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                <User size={14} />
                                                                <span className="text-xs font-semibold">Impersonar Cliente</span>
                                                            </button>
                                                            {impersonation.isImpersonating && (
                                                                <p className="text-[9px] text-center text-red-400/70 mt-2">
                                                                    Ya estás impersonando a otro usuario
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
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
                                                                onClick={() => selectedConv && fetchBrowsingEvents(selectedConv.contact_handle, contactSnapshot?.email)}
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
                    {showCreateTicketModal && selectedConv && (
                        <CreateTicketModal
                            conversation={selectedConv}
                            onClose={() => setShowCreateTicketModal(false)}
                            onSuccess={(ticketId) => {
                                setShowCreateTicketModal(false);
                                fetchData(); // Refresh to update ticket count
                                // Optional: Show success toast or notification
                                console.log(`Ticket created: ${ticketId}`);
                            }}
                        />
                    )}
                    {showImpersonationModal && impersonationTarget && (
                        <ImpersonationModal
                            targetClient={impersonationTarget}
                            onClose={() => {
                                setShowImpersonationModal(false);
                                setImpersonationTarget(null);
                            }}
                            onSuccess={() => {
                                // Navigate to dashboard after successful impersonation
                                navigate(ROUTES.dashboard);
                            }}
                        />
                    )}

                    {/* Tags Modal */}
                    {showTagsModal && selectedConv && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => setShowTagsModal(false)}>
                            <div
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-200"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-cyan-500/20">
                                            <Tag size={24} className="text-cyan-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Etiquetas</h3>
                                            <p className="text-xs text-gray-400">Categoriza esta conversación</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowTagsModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                {/* Current Tags */}
                                {conversationTags.length > 0 && (
                                    <div className="mb-4">
                                        <div className="text-xs font-medium text-gray-400 mb-2">Etiquetas actuales</div>
                                        <div className="flex flex-wrap gap-2">
                                            {conversationTags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className={`px-2 py-1 rounded-full text-xs text-white flex items-center gap-1 ${getTagStyle(tag)}`}
                                                >
                                                    {PREDEFINED_TAGS.find(t => t.label.toLowerCase() === tag)?.icon || '🏷️'}
                                                    {tag}
                                                    <button onClick={() => toggleTag(tag)} className="ml-1 hover:bg-white/20 rounded-full p-0.5">
                                                        <X size={10} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Predefined Tags */}
                                <div className="mb-4">
                                    <div className="text-xs font-medium text-gray-400 mb-2">Etiquetas rápidas</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {PREDEFINED_TAGS.map((tag) => {
                                            const isSelected = conversationTags.includes(tag.label.toLowerCase());
                                            return (
                                                <button
                                                    key={tag.label}
                                                    onClick={() => toggleTag(tag.label)}
                                                    className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                                                        isSelected
                                                            ? `${tag.color} text-white`
                                                            : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                                                    }`}
                                                >
                                                    <span>{tag.icon}</span>
                                                    <span>{tag.label}</span>
                                                    {isSelected && <Check size={14} className="ml-auto" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Tag Input */}
                                <div className="mb-6">
                                    <div className="text-xs font-medium text-gray-400 mb-2">Agregar etiqueta personalizada</div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newTagInput}
                                            onChange={(e) => setNewTagInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                                            placeholder="Ej: cliente-premium"
                                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <button
                                            onClick={addCustomTag}
                                            disabled={!newTagInput.trim()}
                                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowTagsModal(false)}
                                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={saveTags}
                                        className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Check size={18} />
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Follow-up Reminder Modal */}
                    {showReminderModal && selectedConv && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => setShowReminderModal(false)}>
                            <div
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-200"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-orange-500/20">
                                            <Bell size={24} className="text-orange-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Recordatorio de Seguimiento</h3>
                                            <p className="text-xs text-gray-400">Se abrirá en Google Calendar</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowReminderModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                {/* Client Info */}
                                <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                                        <User size={14} /> Cliente
                                    </div>
                                    <p className="text-sm text-white font-medium">{selectedConv.contact_handle}</p>
                                </div>

                                {/* Date/Time Selection */}
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-2">Fecha</label>
                                        <input
                                            type="date"
                                            value={reminderDate}
                                            onChange={(e) => setReminderDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-2">Hora</label>
                                        <input
                                            type="time"
                                            value={reminderTime}
                                            onChange={(e) => setReminderTime(e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500"
                                        />
                                    </div>
                                </div>

                                {/* Quick Time Buttons */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {[
                                        { label: 'Mañana 9am', days: 1, hour: 9 },
                                        { label: 'En 2 días', days: 2, hour: 10 },
                                        { label: 'En 1 semana', days: 7, hour: 10 },
                                        { label: 'En 2 semanas', days: 14, hour: 10 },
                                    ].map((opt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + opt.days);
                                                d.setHours(opt.hour, 0, 0, 0);
                                                setReminderDate(d.toISOString().split('T')[0]);
                                                setReminderTime(`${String(opt.hour).padStart(2, '0')}:00`);
                                            }}
                                            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Note */}
                                <div className="mb-6">
                                    <label className="block text-xs font-medium text-gray-400 mb-2">Nota del recordatorio</label>
                                    <textarea
                                        value={reminderNote}
                                        onChange={(e) => setReminderNote(e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500 resize-none"
                                        placeholder="Ej: Confirmar recepción del pedido..."
                                    />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowReminderModal(false)}
                                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleCreateReminder}
                                        disabled={!reminderDate || !reminderTime}
                                        className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <Calendar size={18} />
                                        Abrir en Calendar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AI Summary Modal */}
                    {showSummaryModal && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => setShowSummaryModal(false)}>
                            <div
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-purple-500/20">
                                            <Brain size={24} className="text-purple-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Resumen AI</h3>
                                            <p className="text-xs text-gray-400">
                                                {summaryData ? `Basado en ${summaryData.messageCount} mensajes` : 'Generando resumen...'}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowSummaryModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto">
                                    {loadingSummary ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                            <Loader2 size={32} className="animate-spin mb-3" />
                                            <p className="text-sm">Analizando conversación...</p>
                                        </div>
                                    ) : summaryData ? (
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <div className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">
                                                {summaryData.summary.split('\n').map((line, i) => {
                                                    // Format markdown-like headers
                                                    if (line.startsWith('**') && line.endsWith('**')) {
                                                        return <h4 key={i} className="text-purple-400 font-bold mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>;
                                                    }
                                                    if (line.match(/^\d+\.\s\*\*/)) {
                                                        return <h4 key={i} className="text-purple-400 font-bold mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>;
                                                    }
                                                    if (line.startsWith('- ')) {
                                                        return <p key={i} className="pl-4 border-l-2 border-purple-500/30 my-1">{line.slice(2)}</p>;
                                                    }
                                                    return line ? <p key={i} className="my-1">{line}</p> : <br key={i} />;
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-gray-400">
                                            <AlertCircle size={32} className="mx-auto mb-3 opacity-50" />
                                            <p className="text-sm">No se pudo generar el resumen</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                                    <button
                                        onClick={() => setShowSummaryModal(false)}
                                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors"
                                    >
                                        Cerrar
                                    </button>
                                    <button
                                        onClick={fetchSummary}
                                        disabled={loadingSummary}
                                        className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loadingSummary ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                        Regenerar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Schedule Message Modal */}
                    {showScheduleModal && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={() => setShowScheduleModal(false)}>
                            <div
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl animate-in zoom-in-95 duration-200"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-blue-500/20">
                                            <Clock size={24} className="text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Programar Mensaje</h3>
                                            <p className="text-xs text-gray-400">
                                                {scheduleType === 'voice' ? 'Nota de voz programada' : 'Mensaje de texto programado'}
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowScheduleModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                {/* Message Preview */}
                                <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10">
                                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                                        {scheduleType === 'voice' ? <Mic size={14} className="text-pink-400" /> : <Send size={14} />}
                                        <span>Vista previa del mensaje:</span>
                                    </div>
                                    <p className="text-sm text-gray-200 line-clamp-3">{newMessage}</p>
                                </div>

                                {/* Date/Time Selection */}
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-2">Fecha</label>
                                        <input
                                            type="date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-2">Hora</label>
                                        <input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* Quick Time Buttons */}
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {[
                                        { label: 'En 1 hora', hours: 1 },
                                        { label: 'Mañana 9am', tomorrow: true, hour: 9 },
                                        { label: 'Mañana 2pm', tomorrow: true, hour: 14 },
                                        { label: 'En 2 días', days: 2 },
                                    ].map((opt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const d = new Date();
                                                if (opt.hours) d.setHours(d.getHours() + opt.hours);
                                                if (opt.days) d.setDate(d.getDate() + opt.days);
                                                if (opt.tomorrow) {
                                                    d.setDate(d.getDate() + 1);
                                                    d.setHours(opt.hour || 9, 0, 0, 0);
                                                }
                                                setScheduleDate(d.toISOString().split('T')[0]);
                                                setScheduleTime(d.toTimeString().slice(0, 5));
                                            }}
                                            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 transition-colors"
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Scheduled Messages List */}
                                {scheduledMessages.length > 0 && (
                                    <div className="mb-4">
                                        <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2">
                                            <Calendar size={14} />
                                            Mensajes programados ({scheduledMessages.length})
                                        </div>
                                        <div className="max-h-32 overflow-y-auto space-y-2">
                                            {scheduledMessages.map((msg) => (
                                                <div key={msg.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {msg.message_type === 'audio' ? <Mic size={12} className="text-pink-400 shrink-0" /> : <Send size={12} className="text-blue-400 shrink-0" />}
                                                        <span className="text-gray-300 truncate">{msg.content?.slice(0, 30)}...</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-gray-500">{new Date(msg.scheduled_for).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                        <button onClick={() => cancelScheduledMessage(msg.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400">
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowScheduleModal(false)}
                                        className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleScheduleMessage}
                                        disabled={sendingMessage || !scheduleDate || !scheduleTime}
                                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {sendingMessage ? <Loader2 size={18} className="animate-spin" /> : <Clock size={18} />}
                                        Programar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </AppLayout>
        </Screen >
    );
};

export default AdminCRM;
