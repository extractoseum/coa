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
}

export interface ContactSnapshot {
    id: string;
    handle: string;
    channel: string;
    name: string;
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
