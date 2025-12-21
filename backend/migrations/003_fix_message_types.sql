
ALTER TABLE crm_messages DROP CONSTRAINT IF EXISTS crm_messages_message_type_check;
ALTER TABLE crm_messages ADD CONSTRAINT crm_messages_message_type_check 
CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'template', 'event', 'sticker'));
