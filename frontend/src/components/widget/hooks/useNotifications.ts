/**
 * useNotifications - Widget notifications hook
 *
 * Fetches and manages user notifications.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api/v1/widget';

export interface Notification {
    id: string;
    type: 'order_update' | 'coa_ready' | 'promotion' | 'ara_message' | 'support_reply' | 'system';
    title: string;
    body: string;
    data: Record<string, any>;
    is_read: boolean;
    created_at: string;
}

interface UseNotificationsReturn {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    fetchNotifications: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
}

export function useNotifications(
    sessionToken: string | null,
    isAuthenticated: boolean
): UseNotificationsReturn {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch notifications
    const fetchNotifications = useCallback(async () => {
        if (!sessionToken || !isAuthenticated) return;

        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE}/notifications?limit=20`, {
                headers: { 'X-Widget-Session': sessionToken }
            });
            const data = await res.json();

            if (data.success) {
                setNotifications(data.notifications);
            }
        } catch (err: any) {
            console.error('[Widget] Fetch notifications error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [sessionToken, isAuthenticated]);

    // Fetch unread count
    const fetchUnreadCount = useCallback(async () => {
        if (!sessionToken || !isAuthenticated) return;

        try {
            const res = await fetch(`${API_BASE}/notifications/count`, {
                headers: { 'X-Widget-Session': sessionToken }
            });
            const data = await res.json();

            if (data.success) {
                setUnreadCount(data.count);
            }
        } catch (err: any) {
            // Silent fail
        }
    }, [sessionToken, isAuthenticated]);

    // Mark single notification as read
    const markAsRead = useCallback(async (id: string) => {
        if (!sessionToken) return;

        try {
            await fetch(`${API_BASE}/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { 'X-Widget-Session': sessionToken }
            });

            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err: any) {
            console.error('[Widget] Mark as read error:', err);
        }
    }, [sessionToken]);

    // Mark all as read
    const markAllAsRead = useCallback(async () => {
        if (!sessionToken) return;

        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);

        for (const id of unreadIds) {
            try {
                await fetch(`${API_BASE}/notifications/${id}/read`, {
                    method: 'PATCH',
                    headers: { 'X-Widget-Session': sessionToken }
                });
            } catch (err) {
                // Continue with others
            }
        }

        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    }, [sessionToken, notifications]);

    // Initial fetch and polling
    useEffect(() => {
        if (isAuthenticated) {
            fetchNotifications();
            fetchUnreadCount();

            // Poll for new notifications every 30 seconds
            pollingRef.current = setInterval(fetchUnreadCount, 30000);
        }

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

    return {
        notifications,
        unreadCount,
        isLoading,
        fetchNotifications,
        markAsRead,
        markAllAsRead
    };
}

export default useNotifications;
