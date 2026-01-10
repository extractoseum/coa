/**
 * useWidgetChat - Widget chat messaging hook
 *
 * Manages message sending, history, and polling for updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api/v1/widget';

export interface ChatMessage {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    createdAt: string;
    isTemp?: boolean;
    confidence?: 'high' | 'medium' | 'low';
    feedback?: {
        rating: 'positive' | 'negative' | null;
        submitted_at?: string;
    };
}

interface UseWidgetChatReturn {
    messages: ChatMessage[];
    isLoading: boolean;
    isSending: boolean;
    error: string | null;
    sendMessage: (text: string) => Promise<void>;
    submitFeedback: (messageId: string, rating: 'positive' | 'negative', correction?: string) => Promise<boolean>;
    loadHistory: () => Promise<void>;
    clearError: () => void;
}

export function useWidgetChat(
    sessionToken: string | null,
    conversationId: string | null,
    isAuthenticated: boolean
): UseWidgetChatReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastMessageIdRef = useRef<string | null>(null);

    // Load message history
    const loadHistory = useCallback(async () => {
        if (!sessionToken || !conversationId || !isAuthenticated) return;

        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/messages?limit=50`, {
                headers: { 'X-Widget-Session': sessionToken }
            });
            const data = await res.json();

            if (data.success) {
                setMessages(data.messages);
                if (data.messages.length > 0) {
                    lastMessageIdRef.current = data.messages[data.messages.length - 1].id;
                }
            }
        } catch (err: any) {
            console.error('[Widget] Load history error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [sessionToken, conversationId, isAuthenticated]);

    // Load history on mount and when authenticated
    useEffect(() => {
        if (isAuthenticated && conversationId) {
            loadHistory();
        }
    }, [isAuthenticated, conversationId, loadHistory]);

    // Send message
    const sendMessage = useCallback(async (text: string) => {
        if (!sessionToken || !isAuthenticated || !text.trim()) return;

        setError(null);
        setIsSending(true);

        // Optimistic update
        const tempId = `temp-${Date.now()}`;
        const tempMessage: ChatMessage = {
            id: tempId,
            content: text,
            role: 'user',
            createdAt: new Date().toISOString(),
            isTemp: true
        };
        setMessages(prev => [...prev, tempMessage]);

        try {
            const res = await fetch(`${API_BASE}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Widget-Session': sessionToken
                },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();

            if (data.success) {
                // Replace temp message with real ones
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== tempId);
                    return [
                        ...filtered,
                        {
                            id: data.userMessage.id,
                            content: data.userMessage.content,
                            role: 'user',
                            createdAt: data.userMessage.createdAt
                        },
                        {
                            id: data.araResponse.id,
                            content: data.araResponse.content,
                            role: 'assistant',
                            createdAt: data.araResponse.createdAt
                        }
                    ];
                });
                lastMessageIdRef.current = data.araResponse.id;
            } else {
                // Remove temp message and show error
                setMessages(prev => prev.filter(m => m.id !== tempId));
                setError(data.error || 'Error enviando mensaje');
            }
        } catch (err: any) {
            console.error('[Widget] Send message error:', err);
            setMessages(prev => prev.filter(m => m.id !== tempId));
            setError('Error de conexión');
        } finally {
            setIsSending(false);
        }
    }, [sessionToken, isAuthenticated]);

    // Poll for new messages (for human agent replies)
    useEffect(() => {
        if (!sessionToken || !isAuthenticated || !conversationId) return;

        const poll = async () => {
            try {
                const lastId = lastMessageIdRef.current;
                const url = lastId
                    ? `${API_BASE}/messages?limit=10&since=${lastId}`
                    : `${API_BASE}/messages?limit=10`;

                const res = await fetch(url, {
                    headers: { 'X-Widget-Session': sessionToken }
                });
                const data = await res.json();

                if (data.success && data.messages.length > 0) {
                    // Filter out messages we already have
                    const existingIds = new Set(messages.map(m => m.id));
                    const newMessages = data.messages.filter((m: ChatMessage) => !existingIds.has(m.id));

                    if (newMessages.length > 0) {
                        setMessages(prev => [...prev, ...newMessages]);
                        lastMessageIdRef.current = newMessages[newMessages.length - 1].id;
                    }
                }
            } catch (err) {
                // Silent fail for polling
            }
        };

        // Poll every 5 seconds (only when chat is active)
        pollingRef.current = setInterval(poll, 5000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [sessionToken, isAuthenticated, conversationId, messages]);

    // Submit feedback
    const submitFeedback = useCallback(async (messageId: string, rating: 'positive' | 'negative', correction?: string) => {
        if (!sessionToken || !isAuthenticated) return false;

        try {
            const res = await fetch(`${API_BASE}/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Widget-Session': sessionToken
                },
                body: JSON.stringify({ messageId, rating, correction })
            });
            const data = await res.json();

            if (data.success) {
                setMessages(prev => prev.map(m => {
                    if (m.id === messageId) {
                        return {
                            ...m,
                            feedback: { rating, submitted_at: new Date().toISOString() }
                        };
                    }
                    return m;
                }));
                return true;
            }
            return false;
        } catch (err) {
            console.error('[Widget] Submit feedback error:', err);
            return false;
        }
    }, [sessionToken, isAuthenticated]);

    const clearError = useCallback(() => setError(null), []);

    return {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        submitFeedback,
        loadHistory,
        clearError
    };
}

export default useWidgetChat;
