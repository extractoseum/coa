export interface VoiceProfileConfig {
    provider: 'openai' | 'elevenlabs';
    voice_id: string; // 'nova', '21m00...', etc.
    settings?: any; // stability, similarity, etc.
}

export interface Column {
    id: string;
    name: string;
    mode: 'AI_MODE' | 'HUMAN_MODE' | 'HYBRID';
    position: number;
    assigned_agent_id?: string;
    objectives?: string;
    voice_profile?: string | VoiceProfileConfig;
    config?: {
        agent_id?: string; // Legacy/Fallback
        model?: string;
        tools_policy?: {
            mode: 'inherit' | 'override';
            allowed_tools: string[];
        };
        automations?: any;
        guardrails?: any;
    };
}

export interface AgentMetadata {
    id: string;
    label: string;
    category: string;
    status: 'Ready' | 'Broken';
    default_tools: string[];
    description: string;
    error?: string;
}

export interface ToolRegistryItem {
    name: string;
    label?: string;
    description: string;
    category: string;
}

export interface Conversation {
    id: string;
    channel: 'WA' | 'IG' | 'FB' | 'EMAIL' | 'WEBCHAT';
    contact_handle: string;
    status: 'active' | 'paused' | 'review' | 'archived';
    column_id: string;
    last_message_at: string;
    summary?: string;
    tags?: string[];
    facts?: any; // e.g. { action_plan: [] }
    contact_name?: string;
    avatar_url?: string;
    ltv?: number;
    risk_level?: string;
    updated_at?: string;
    // Phase 61: Computed Indicators
    hours_remaining?: number;
    window_status?: 'active' | 'expired';
    is_new_customer?: boolean;
    is_vip?: boolean;
    is_stalled?: boolean;
    awaiting_response?: boolean;
    health_score?: number;
    traffic_source?: string;
    // Ticket tracking
    open_tickets_count?: number;
}

export interface SupportTicket {
    id: string;
    ticket_id: string;
    conversation_id?: string;
    client_id?: string;
    type: 'shipping_issue' | 'delivery_problem' | 'package_lost' | 'return_request' | 'general_inquiry' | 'urgent';
    subject: string;
    description?: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
    order_number?: string;
    tracking_number?: string;
    customer_email?: string;
    customer_name?: string;
    recipient_type: string;
    recipients?: string[];
    created_at: string;
    updated_at: string;
    resolved_at?: string;
}

export interface ContactSnapshot {
    id: string;
    handle: string;
    channel: string;
    name: string;
    email?: string; // For identity bridge with browsing events
    client_id?: string | null; // For impersonation - links to clients table
    ltv: number;
    orders_count: number;
    average_ticket: number;
    risk_level: string;
    tags: string[];
    last_shipping_status?: string;
    last_shipping_carrier?: string;
    last_shipping_tracking?: string;
    last_updated_at: string;
    summary_bullets?: string[];
}
