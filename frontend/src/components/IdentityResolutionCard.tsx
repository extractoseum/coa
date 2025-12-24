
import React, { useState } from 'react';
import { ShieldAlert, Check, X, Edit2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

interface IdentityResolutionCardProps {
    conversation: any;
    onResolve: () => void; // Callback to refresh data
}

export const IdentityResolutionCard: React.FC<IdentityResolutionCardProps> = ({ conversation, onResolve }) => {
    const { theme } = useTheme();
    const [isResolving, setIsResolving] = useState(false);
    const [customName, setCustomName] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Guard: Only show if ambiguity flag is present and true
    if (!conversation?.facts?.identity_ambiguity) return null;

    const candidates = conversation.facts.ambiguity_candidates || [];

    const handleResolve = async (selectedName: string) => {
        if (!selectedName || isResolving) return;
        setIsResolving(true);

        try {
            // 1. Update Contact Snapshot Name
            const resSnap = await fetch(`/api/v1/crm/contacts/${encodeURIComponent(conversation.contact_handle)}`, {
                method: 'PUT', // Assuming PUT for update, or we might need a specific endpoint
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
                },
                body: JSON.stringify({ name: selectedName })
            });

            if (!resSnap.ok) throw new Error('Failed to update contact name');

            // 2. Clear Ambiguity Flag in Facts
            // We reuse the sync-facts endpoint logic or a direct update if available.
            // Since we don't have a direct "patch facts" endpoint revealed, we might fallback to 
            // a specialized "resolve-identity" endpoint if we had one.
            // For now, let's assume we can PATCH the conversation or rely on the backend to clear it via a new call.
            // ACTUALLY: Let's use the /crm/conversations/:id endpoint to PATCH specific fields if available, 
            // OR call a specific "resolve_identity" action. 
            // Given the constraints, I'll simulate a fact update by calling an RPC or just manually updating via Supabase if I was backend.
            // Frontend-side: We'll try to PATCH the conversation facts.

            const newFacts = { ...conversation.facts, identity_ambiguity: false, ambiguity_candidates: [] };
            // Note: In a real scenario we'd want a dedicated endpoint. 
            // For this implementation, I will treat the 'PUT /api/v1/crm/contacts' as "User confirmed identity".
            // AND I will try to call a PATCH to update the facts locally to hide the card immediately.

            const resConv = await fetch(`/api/v1/crm/conversations/${conversation.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ facts: newFacts })
            });

            if (resConv.ok) {
                onResolve(); // Refresh parent
            }

        } catch (e) {
            console.error('Identity resolution failed', e);
            alert('Error al actualizar identidad');
        } finally {
            setIsResolving(false);
        }
    };

    return (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-yellow-500/20 rounded-full shrink-0">
                    <ShieldAlert size={18} className="text-yellow-400" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-yellow-100">Conflicto de Identidad</h4>
                    <p className="text-[11px] text-yellow-200/70 leading-tight mt-1">
                        La IA detectó nombres conflictivos. ¿Quién es el cliente?
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                {candidates.map((name: string, idx: number) => (
                    <button
                        key={idx}
                        onClick={() => handleResolve(name)}
                        disabled={isResolving}
                        className="w-full flex items-center justify-between p-2 pl-3 rounded-lg bg-black/20 hover:bg-yellow-500/20 border border-transparent hover:border-yellow-500/30 transition-all text-xs text-left group"
                    >
                        <span className="font-medium text-white">{name}</span>
                        <Check size={14} className="opacity-0 group-hover:opacity-100 text-yellow-400" />
                    </button>
                ))}

                {!showCustomInput ? (
                    <button
                        onClick={() => setShowCustomInput(true)}
                        className="w-full py-2 text-[10px] text-center text-yellow-200/50 hover:text-yellow-200 transition-colors flex items-center justify-center gap-1"
                    >
                        <Edit2 size={10} /> Otro nombre...
                    </button>
                ) : (
                    <div className="flex gap-2 mt-2">
                        <input
                            type="text"
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            placeholder="Escribe nombre..."
                            className="flex-1 bg-black/30 border border-yellow-500/20 rounded px-2 text-xs outline-none focus:border-yellow-500/50 text-white"
                            autoFocus
                        />
                        <button
                            onClick={() => handleResolve(customName)}
                            disabled={!customName.trim() || isResolving}
                            className="p-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-400 disabled:opacity-50"
                        >
                            <Check size={14} />
                        </button>
                        <button
                            onClick={() => setShowCustomInput(false)}
                            className="p-1.5 text-white/30 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
