import React, { useState } from 'react';
import { X, Ticket, AlertTriangle, Package, Truck, RotateCcw, HelpCircle, Send, Loader2 } from 'lucide-react';
import type { Conversation, SupportTicket } from '../types/crm';

interface CreateTicketModalProps {
    conversation: Conversation;
    onClose: () => void;
    onSuccess: (ticketId: string) => void;
}

const TICKET_TYPES = [
    { value: 'shipping_issue', label: 'Problema de Envío', icon: Package, color: 'text-blue-400' },
    { value: 'delivery_problem', label: 'Problema de Entrega', icon: Truck, color: 'text-orange-400' },
    { value: 'package_lost', label: 'Paquete Extraviado', icon: AlertTriangle, color: 'text-red-400' },
    { value: 'return_request', label: 'Solicitud de Devolución', icon: RotateCcw, color: 'text-purple-400' },
    { value: 'general_inquiry', label: 'Consulta General', icon: HelpCircle, color: 'text-gray-400' },
    { value: 'urgent', label: 'URGENTE', icon: AlertTriangle, color: 'text-red-500' }
] as const;

const PRIORITIES = [
    { value: 'low', label: 'Baja', color: 'bg-gray-500' },
    { value: 'normal', label: 'Normal', color: 'bg-blue-500' },
    { value: 'high', label: 'Alta', color: 'bg-orange-500' },
    { value: 'urgent', label: 'Urgente', color: 'bg-red-500' }
] as const;

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ conversation, onClose, onSuccess }) => {
    const [type, setType] = useState<SupportTicket['type']>('general_inquiry');
    const [priority, setPriority] = useState<SupportTicket['priority']>('normal');
    const [subject, setSubject] = useState(conversation.summary || '');
    const [description, setDescription] = useState('');
    const [orderNumber, setOrderNumber] = useState(conversation.facts?.order_number || '');
    const [trackingNumber, setTrackingNumber] = useState(conversation.facts?.tracking_number || '');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim()) {
            setError('El asunto es requerido');
            return;
        }

        setSending(true);
        setError(null);

        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/v1/crm/tickets/edarkstore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    conversationId: conversation.id,
                    type,
                    priority,
                    subject: subject.trim(),
                    description: description.trim() || undefined,
                    orderNumber: orderNumber.trim() || undefined,
                    trackingNumber: trackingNumber.trim() || undefined
                })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Error al crear ticket');
            }

            onSuccess(data.data.ticketId);
        } catch (err: any) {
            setError(err.message || 'Error al crear ticket');
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => {
                // Close only if clicking the backdrop itself
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className="w-full max-w-lg bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-orange-500/10 to-red-500/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-orange-500/20">
                            <Ticket size={20} className="text-orange-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white">Crear Ticket eDarkStore</h2>
                            <p className="text-xs text-white/50">Enviar ticket al equipo de logística</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X size={18} className="text-white/60" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Ticket Type */}
                    <div>
                        <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Tipo de Ticket</label>
                        <div className="grid grid-cols-3 gap-2">
                            {TICKET_TYPES.map(t => {
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setType(t.value)}
                                        className={`p-2 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1
                                            ${type === t.value
                                                ? 'border-orange-500/50 bg-orange-500/20 text-orange-300'
                                                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                                            }`}
                                    >
                                        <Icon size={16} className={type === t.value ? t.color : ''} />
                                        <span className="text-[10px] text-center leading-tight">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Prioridad</label>
                        <div className="flex gap-2">
                            {PRIORITIES.map(p => (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setPriority(p.value)}
                                    className={`flex-1 p-2 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-2
                                        ${priority === p.value
                                            ? 'border-white/30 bg-white/10 text-white'
                                            : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                                        }`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${p.color}`} />
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subject */}
                    <div>
                        <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Asunto *</label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Describe el problema brevemente..."
                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                        />
                    </div>

                    {/* Order / Tracking */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Pedido</label>
                            <input
                                type="text"
                                value={orderNumber}
                                onChange={(e) => setOrderNumber(e.target.value)}
                                placeholder="EUM_1234"
                                className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Tracking</label>
                            <input
                                type="text"
                                value={trackingNumber}
                                onChange={(e) => setTrackingNumber(e.target.value)}
                                placeholder="EST-123..."
                                className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-bold text-white/60 uppercase mb-2 block">Descripción Adicional</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detalles adicionales del problema... (Se incluirá el contexto de la conversación automáticamente)"
                            rows={3}
                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 resize-none"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                            {error}
                        </div>
                    )}

                    {/* Recipients Info */}
                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-[10px] text-white/40">
                        <strong className="text-white/60">Destinatarios:</strong> bbeltran@edarkstore.cl, barze@edarkstore.cl, customer.service.test@edarkstore.cl, mvelarde@edarkstore.cl
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 p-3 rounded-lg border border-white/10 text-white/60 text-sm font-medium hover:bg-white/5 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={sending || !subject.trim()}
                            className="flex-1 p-3 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <Send size={16} />
                                    Enviar Ticket
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateTicketModal;
