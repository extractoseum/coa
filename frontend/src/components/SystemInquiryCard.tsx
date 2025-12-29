
import React, { useState } from 'react';
import { ShieldAlert, Check, X, Edit2, Ghost, AlertTriangle, HelpCircle } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export interface InquiryOption {
    label: string;
    action: string;
    payload?: any;
    variant?: 'primary' | 'danger' | 'neutral';
}

export interface SystemInquiry {
    id: string; // Unique ID for the inquiry
    type: 'identity_ambiguity' | 'ghost_data' | 'error_resolution' | 'general';
    question: string;
    options: InquiryOption[];
    allow_custom?: boolean; // Defaults to true now
    context?: string; // Brief context about why this inquiry was raised
    meta?: any;
}

interface SystemInquiryCardProps {
    conversation: any;
    onResolve: () => void; // Callback to refresh data
}

export const SystemInquiryCard: React.FC<SystemInquiryCardProps> = ({ conversation, onResolve }) => {
    const { theme } = useTheme();
    const [isResolving, setIsResolving] = useState(false);
    const [customInput, setCustomInput] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Guard: Only show if system_inquiry is present
    const inquiry = conversation?.facts?.system_inquiry as SystemInquiry | undefined;

    // Legacy support for identity_ambiguity (Phase 64 Backwards Compatibility)
    if (!inquiry && conversation?.facts?.identity_ambiguity) {
        // Render nothing or auto-migrate in backend. 
        // For now, let's assume the backend promoted it OR we map it on the fly:
        // (Mapping logic omitted for brevity, assuming backend sends new structure or we handle legacy elsewhere)
        return null;
    }

    if (!inquiry) return null;

    const handleAction = async (option: InquiryOption, customValue?: string) => {
        if (isResolving) return;
        setIsResolving(true);

        try {
            // Generic Action Endpoint
            const res = await fetch(`/api/v1/crm/conversations/${conversation.id}/inquiry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                },
                body: JSON.stringify({
                    inquiry_id: inquiry.id,
                    action: option.action,
                    payload: option.payload,
                    custom_value: customValue || undefined
                })
            });

            if (!res.ok) throw new Error('Action failed');

            // Optimistic cleanup: Remove the inquiry from local view or wait for parent refresh
            onResolve();

        } catch (e) {
            console.error('Inquiry resolution failed', e);
            alert('Error al procesar la acción');
        } finally {
            setIsResolving(false);
        }
    };

    const getIcon = () => {
        switch (inquiry.type) {
            case 'identity_ambiguity': return <ShieldAlert size={18} className="text-yellow-400" />;
            case 'ghost_data': return <Ghost size={18} className="text-purple-400" />;
            case 'error_resolution': return <AlertTriangle size={18} className="text-red-400" />;
            default: return <HelpCircle size={18} className="text-blue-400" />;
        }
    };

    const getBgColor = () => {
        switch (inquiry.type) {
            case 'identity_ambiguity': return 'bg-yellow-500/10 border-yellow-500/30';
            case 'ghost_data': return 'bg-purple-500/10 border-purple-500/30';
            case 'error_resolution': return 'bg-red-500/10 border-red-500/30';
            default: return 'bg-blue-500/10 border-blue-500/30';
        }
    };

    // ALWAYS allow custom responses (default to true)
    const allowCustom = inquiry.allow_custom !== false;

    return (
        <div className={`${getBgColor()} border rounded-xl p-4 mb-4 animate-in slide-in-from-top-2 duration-300`}>
            <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-black/20 rounded-full shrink-0">
                    {getIcon()}
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-white opacity-90">Consulta del Sistema</h4>
                    <p className="text-[12px] text-white/80 leading-tight mt-1">
                        {inquiry.question}
                    </p>
                    {inquiry.context && (
                        <p className="text-[10px] text-white/50 leading-tight mt-2 italic">
                            Contexto: {inquiry.context}
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                {inquiry.options.map((opt, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleAction(opt)}
                        disabled={isResolving}
                        className={`w-full flex items-center justify-between p-2.5 pl-3 rounded-lg border transition-all text-xs text-left group
                            ${opt.variant === 'danger' ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30' :
                                opt.variant === 'primary' ? 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30' :
                                    'bg-black/20 hover:bg-white/10 border-transparent hover:border-white/10'}`}
                    >
                        <span className="font-medium text-white">{opt.label}</span>
                        <Check size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                ))}

                {/* ALWAYS show custom response option */}
                {allowCustom && !showCustomInput && (
                    <button
                        onClick={() => setShowCustomInput(true)}
                        className="w-full py-2.5 text-xs text-center text-white/60 hover:text-white hover:bg-white/5 rounded-lg border border-dashed border-white/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <Edit2 size={12} /> Explicar situación / Otra respuesta
                    </button>
                )}

                {showCustomInput && (
                    <div className="mt-3 space-y-2">
                        <textarea
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            placeholder="Explica la situación al sistema para que pueda aprender y mejorar..."
                            className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500/50 text-white placeholder:text-white/30 resize-none"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setShowCustomInput(false);
                                    setCustomInput('');
                                }}
                                className="px-3 py-1.5 text-xs text-white/50 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleAction({ label: 'Custom', action: 'custom_response' }, customInput)}
                                disabled={!customInput.trim() || isResolving}
                                className="px-4 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                            >
                                <Check size={12} /> Enviar respuesta
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
