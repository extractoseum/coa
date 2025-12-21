-- 016_whatsapp_notifications.sql
-- Sistema de notificaciones WhatsApp via Whapi.cloud

-- Agregar columna de canales a notificaciones existentes
ALTER TABLE push_notifications
ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['push'];

-- Agregar columnas para tracking de WhatsApp
ALTER TABLE push_notifications
ADD COLUMN IF NOT EXISTS whatsapp_sent_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS whatsapp_failed_count INTEGER DEFAULT 0;

-- Historial específico de WhatsApp (para tracking individual de cada mensaje)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES push_notifications(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    whapi_message_id TEXT,  -- ID retornado por Whapi.cloud
    status TEXT DEFAULT 'queued',  -- queued, sent, delivered, read, failed
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_notification ON whatsapp_messages(notification_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone);

-- Comentarios
COMMENT ON TABLE whatsapp_messages IS 'Historial de mensajes WhatsApp enviados via Whapi.cloud';
COMMENT ON COLUMN whatsapp_messages.whapi_message_id IS 'ID único del mensaje en Whapi.cloud';
COMMENT ON COLUMN push_notifications.channels IS 'Canales utilizados: push, whatsapp, o ambos';
