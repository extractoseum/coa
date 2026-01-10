/**
 * AraChatWidget - Main container component for Ara Chat
 *
 * Orchestrates authentication, chat, and notifications.
 * Renders inside FloatingDock for positioning.
 */

import React, { useState } from 'react';
import AraChatLauncher from './AraChatLauncher';
import AraChatWindow from './AraChatWindow';
import AraAuthGate from './AraAuthGate';
import { useWidgetAuth } from './hooks/useWidgetAuth';
import { useWidgetChat } from './hooks/useWidgetChat';
import { useNotifications } from './hooks/useNotifications';
import type { Notification } from './hooks/useNotifications';

const AraChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Auth hook
    const {
        session,
        isLoading: authLoading,
        isAuthenticated,
        client,
        conversationId,
        sendOTP,
        verifyOTP
    } = useWidgetAuth();

    // Chat hook
    const {
        messages,
        isLoading: chatLoading,
        isSending,
        error: chatError,
        sendMessage,
        clearError
    } = useWidgetChat(session?.sessionToken || null, conversationId, isAuthenticated);

    // Notifications hook
    const {
        notifications,
        unreadCount,
        markAsRead
    } = useNotifications(session?.sessionToken || null, isAuthenticated);

    // Handle send message - check auth first
    const handleSend = (text: string) => {
        if (!isAuthenticated) {
            setShowAuthModal(true);
            return;
        }
        sendMessage(text);
    };

    // Handle open - check auth
    const handleOpen = () => {
        setIsOpen(true);
        setIsMinimized(false);
    };

    // Handle notification click
    const handleNotificationClick = async (notification: Notification) => {
        await markAsRead(notification.id);

        // Handle different notification types
        switch (notification.type) {
            case 'order_update':
                // Could navigate to order details
                if (notification.data?.order_id) {
                    sendMessage(`Quiero ver el estado de mi pedido ${notification.data.order_number || ''}`);
                }
                break;
            case 'coa_ready':
                if (notification.data?.product_name) {
                    sendMessage(`Quiero ver el COA de ${notification.data.product_name}`);
                }
                break;
            case 'support_reply':
                // Just close notification panel, message is in chat
                break;
            default:
                break;
        }
    };

    // Don't render while checking initial session
    if (authLoading && !session) {
        return null;
    }

    return (
        <div className="relative pointer-events-auto">
            {/* Chat Window */}
            {isOpen && !isMinimized && (
                <AraChatWindow
                    messages={messages}
                    isLoading={chatLoading}
                    isSending={isSending}
                    error={chatError}
                    onSend={handleSend}
                    onClose={() => setIsOpen(false)}
                    onMinimize={() => setIsMinimized(true)}
                    clientName={client?.name}
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onNotificationClick={handleNotificationClick}
                    clearError={clearError}
                />
            )}

            {/* Launcher Button */}
            {(!isOpen || isMinimized) && (
                <AraChatLauncher
                    onClick={handleOpen}
                    unreadCount={unreadCount}
                    isMinimized={isMinimized}
                />
            )}

            {/* Auth Modal */}
            {showAuthModal && (
                <AraAuthGate
                    onSuccess={() => setShowAuthModal(false)}
                    onClose={() => setShowAuthModal(false)}
                    sendOTP={sendOTP}
                    verifyOTP={verifyOTP}
                />
            )}
        </div>
    );
};

export default AraChatWidget;
