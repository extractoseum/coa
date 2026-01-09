import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Sparkles, Mic, Wand2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// ElevenLabs v3 Audio Tags Reference
// Based on: https://elevenlabs.io/blog/v3-audiotags
export const AUDIO_TAGS = {
    // Emotional/Tone Tags
    emotions: [
        { tag: '[whispers]', label: 'Susurro', description: 'Voz susurrada, íntima' },
        { tag: '[sighs]', label: 'Suspiro', description: 'Suspiro de emoción/cansancio' },
        { tag: '[excited]', label: 'Emocionado', description: 'Tono alegre y enérgico' },
        { tag: '[sad]', label: 'Triste', description: 'Tono melancólico' },
        { tag: '[angry]', label: 'Enojado', description: 'Tono de frustración' },
        { tag: '[happily]', label: 'Feliz', description: 'Tono alegre' },
        { tag: '[curious]', label: 'Curioso', description: 'Tono de intriga' },
        { tag: '[sarcastic]', label: 'Sarcástico', description: 'Tono irónico' },
        { tag: '[thoughtful]', label: 'Pensativo', description: 'Tono reflexivo' },
        { tag: '[nervously]', label: 'Nervioso', description: 'Tono ansioso' },
        { tag: '[warmly]', label: 'Cálido', description: 'Tono amigable' },
        { tag: '[reassuring]', label: 'Tranquilizador', description: 'Tono calmante' },
    ],
    // Reactions/Non-verbal
    reactions: [
        { tag: '[laughs]', label: 'Risa', description: 'Risa natural' },
        { tag: '[laughs softly]', label: 'Risa suave', description: 'Risa gentil' },
        { tag: '[giggles]', label: 'Risita', description: 'Risita corta' },
        { tag: '[clears throat]', label: 'Aclara garganta', description: 'Carraspeo' },
        { tag: '[gasps]', label: 'Jadeo', description: 'Respiración de sorpresa' },
        { tag: '[gulps]', label: 'Traga', description: 'Trago nervioso' },
        { tag: '[breathes]', label: 'Respira', description: 'Respiración audible' },
    ],
    // Pacing & Delivery
    pacing: [
        { tag: '[pause]', label: 'Pausa', description: 'Pausa breve' },
        { tag: '[short pause]', label: 'Pausa corta', description: 'Pausa muy breve' },
        { tag: '[long pause]', label: 'Pausa larga', description: 'Pausa extendida' },
        { tag: '[slowly]', label: 'Lento', description: 'Habla más despacio' },
        { tag: '[quickly]', label: 'Rápido', description: 'Habla más rápido' },
        { tag: '[stammers]', label: 'Tartamudea', description: 'Duda al hablar' },
        { tag: '[hesitates]', label: 'Hesita', description: 'Momento de duda' },
    ],
    // Volume
    volume: [
        { tag: '[quietly]', label: 'Bajo', description: 'Volumen bajo' },
        { tag: '[loudly]', label: 'Alto', description: 'Volumen alto' },
        { tag: '[shouts]', label: 'Grita', description: 'Grito' },
    ],
};

// Flatten all tags for quick access
const ALL_TAGS = [
    ...AUDIO_TAGS.emotions,
    ...AUDIO_TAGS.reactions,
    ...AUDIO_TAGS.pacing,
    ...AUDIO_TAGS.volume,
];

interface SmartTextareaProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onSendVoice: () => void;
    disabled?: boolean;
    placeholder?: string;
    clientContext?: {
        name?: string;
        facts?: string[];
        recentMessages?: Array<{ role: string; content: string }>;
    };
    conversationId?: string;
}

export default function SmartTextarea({
    value,
    onChange,
    onSend,
    onSendVoice,
    disabled = false,
    placeholder = 'Escribe un mensaje...',
    clientContext,
    conversationId,
}: SmartTextareaProps) {
    const { theme } = useTheme();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Predictive completion state
    const [prediction, setPrediction] = useState<string>('');
    const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
    const predictionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Help me write state
    const [showHelpMenu, setShowHelpMenu] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [enhancedText, setEnhancedText] = useState<string | null>(null);

    // Audio enhancement state
    const [showAudioTags, setShowAudioTags] = useState(false);
    const [selectedTagCategory, setSelectedTagCategory] = useState<'emotions' | 'reactions' | 'pacing' | 'volume'>('emotions');

    // Get prediction from API
    const fetchPrediction = useCallback(async (text: string) => {
        if (!text || text.length < 3 || !conversationId) {
            setPrediction('');
            return;
        }

        setIsLoadingPrediction(true);
        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch('/api/v1/crm/smart-compose/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    text,
                    conversationId,
                    clientContext,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.prediction) {
                    // Only show prediction if it starts with current text
                    if (data.prediction.toLowerCase().startsWith(text.toLowerCase())) {
                        setPrediction(data.prediction.substring(text.length));
                    } else {
                        setPrediction(data.prediction);
                    }
                }
            }
        } catch (error) {
            console.error('Prediction error:', error);
        } finally {
            setIsLoadingPrediction(false);
        }
    }, [conversationId, clientContext]);

    // Debounced prediction
    useEffect(() => {
        if (predictionTimeoutRef.current) {
            clearTimeout(predictionTimeoutRef.current);
        }

        // Clear prediction when typing
        setPrediction('');

        // Only fetch prediction after user stops typing
        if (value && value.length >= 3) {
            predictionTimeoutRef.current = setTimeout(() => {
                fetchPrediction(value);
            }, 500);
        }

        return () => {
            if (predictionTimeoutRef.current) {
                clearTimeout(predictionTimeoutRef.current);
            }
        };
    }, [value, fetchPrediction]);

    // Handle Tab to accept prediction
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab' && prediction) {
            e.preventDefault();
            onChange(value + prediction);
            setPrediction('');
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        } else if (e.key === 'Escape') {
            setPrediction('');
            setShowHelpMenu(false);
            setShowAudioTags(false);
        }
    };

    // Enhance text for audio (auto-add tags based on content analysis)
    const enhanceForAudio = async () => {
        if (!value.trim()) return;

        setIsEnhancing(true);
        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch('/api/v1/crm/smart-compose/enhance-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    text: value,
                    clientContext,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.enhancedText) {
                    onChange(data.enhancedText);
                }
            }
        } catch (error) {
            console.error('Audio enhancement error:', error);
        } finally {
            setIsEnhancing(false);
        }
    };

    // "Help me write" - improve/expand text
    const helpMeWrite = async (action: 'improve' | 'expand' | 'friendly' | 'professional' | 'empathetic') => {
        if (!value.trim()) return;

        setIsEnhancing(true);
        setShowHelpMenu(false);
        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch('/api/v1/crm/smart-compose/help-write', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    text: value,
                    action,
                    clientContext,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.result) {
                    setEnhancedText(data.result);
                }
            }
        } catch (error) {
            console.error('Help me write error:', error);
        } finally {
            setIsEnhancing(false);
        }
    };

    // Insert audio tag at cursor position
    const insertAudioTag = (tag: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            onChange(value + ' ' + tag + ' ');
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = value.substring(0, start);
        const after = value.substring(end);

        // Add space before tag if needed
        const needsSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
        const newValue = before + (needsSpaceBefore ? ' ' : '') + tag + ' ' + after;
        onChange(newValue);

        // Set cursor after tag
        setTimeout(() => {
            const newPos = start + (needsSpaceBefore ? 1 : 0) + tag.length + 1;
            textarea.focus();
            textarea.setSelectionRange(newPos, newPos);
        }, 0);

        setShowAudioTags(false);
    };

    // Accept enhanced text
    const acceptEnhancedText = () => {
        if (enhancedText) {
            onChange(enhancedText);
            setEnhancedText(null);
        }
    };

    return (
        <div className="relative flex-1">
            {/* Main textarea with prediction overlay */}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-24 text-base md:text-sm outline-none focus:border-pink-500/50 transition-all font-light resize-none scrollbar-thin scrollbar-thumb-white/10"
                    style={{ color: theme.text }}
                />

                {/* Prediction overlay */}
                {prediction && (
                    <div
                        className="absolute top-0 left-0 right-0 pointer-events-none px-4 py-3 text-base md:text-sm font-light"
                        style={{ color: 'transparent' }}
                    >
                        <span style={{ color: 'transparent' }}>{value}</span>
                        <span className="text-white/30 italic">{prediction}</span>
                        <span className="ml-2 text-[10px] text-pink-400/50 bg-pink-500/10 px-1.5 py-0.5 rounded">Tab</span>
                    </div>
                )}

                {/* Loading indicator */}
                {isLoadingPrediction && (
                    <div className="absolute top-2 right-2">
                        <Loader2 size={14} className="animate-spin text-pink-400/50" />
                    </div>
                )}

                {/* Action buttons inside textarea */}
                <div className="absolute bottom-2 right-2 flex gap-1">
                    {/* Audio tags button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowAudioTags(!showAudioTags);
                            setShowHelpMenu(false);
                        }}
                        className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors"
                        title="Tags de Audio (ElevenLabs)"
                    >
                        <Mic size={14} />
                    </button>

                    {/* Help me write button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowHelpMenu(!showHelpMenu);
                            setShowAudioTags(false);
                        }}
                        className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors"
                        title="Ayúdame a escribir"
                    >
                        <Sparkles size={14} />
                    </button>

                    {/* Auto-enhance for voice */}
                    <button
                        type="button"
                        onClick={enhanceForAudio}
                        disabled={isEnhancing || !value.trim()}
                        className="p-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 hover:text-pink-300 transition-colors disabled:opacity-30"
                        title="Auto-mejorar para voz"
                    >
                        {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    </button>
                </div>
            </div>

            {/* Help me write menu */}
            {showHelpMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2 border-b border-white/5 text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Ayúdame a escribir
                    </div>
                    <div className="p-1">
                        {[
                            { action: 'improve', label: 'Mejorar', desc: 'Corregir y pulir el texto' },
                            { action: 'expand', label: 'Expandir', desc: 'Agregar más detalles' },
                            { action: 'friendly', label: 'Más amigable', desc: 'Tono casual y cercano' },
                            { action: 'professional', label: 'Más profesional', desc: 'Tono formal y serio' },
                            { action: 'empathetic', label: 'Más empático', desc: 'Mostrar comprensión' },
                        ].map((item) => (
                            <button
                                key={item.action}
                                onClick={() => helpMeWrite(item.action as any)}
                                disabled={isEnhancing || !value.trim()}
                                className="w-full px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
                            >
                                <div className="text-sm text-white">{item.label}</div>
                                <div className="text-xs text-white/40">{item.desc}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Audio tags menu */}
            {showAudioTags && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2 border-b border-white/5 text-xs font-semibold text-white/50 uppercase tracking-wider flex justify-between items-center">
                        <span>Tags de Audio (ElevenLabs v3)</span>
                        <a
                            href="https://elevenlabs.io/blog/v3-audiotags"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 text-[10px]"
                        >
                            Docs
                        </a>
                    </div>

                    {/* Category tabs */}
                    <div className="flex border-b border-white/5">
                        {(['emotions', 'reactions', 'pacing', 'volume'] as const).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedTagCategory(cat)}
                                className={`flex-1 px-2 py-1.5 text-xs transition-colors ${
                                    selectedTagCategory === cat
                                        ? 'text-purple-400 border-b-2 border-purple-400'
                                        : 'text-white/50 hover:text-white/80'
                                }`}
                            >
                                {cat === 'emotions' && 'Emociones'}
                                {cat === 'reactions' && 'Reacciones'}
                                {cat === 'pacing' && 'Ritmo'}
                                {cat === 'volume' && 'Volumen'}
                            </button>
                        ))}
                    </div>

                    {/* Tags grid */}
                    <div className="p-2 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-1">
                            {AUDIO_TAGS[selectedTagCategory].map((item) => (
                                <button
                                    key={item.tag}
                                    onClick={() => insertAudioTag(item.tag)}
                                    className="px-2 py-1.5 text-left bg-white/5 hover:bg-purple-500/20 rounded-lg transition-colors group"
                                >
                                    <div className="text-xs font-mono text-purple-400 group-hover:text-purple-300">
                                        {item.tag}
                                    </div>
                                    <div className="text-[10px] text-white/40">{item.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Quick tip */}
                    <div className="p-2 border-t border-white/5 bg-purple-500/5">
                        <p className="text-[10px] text-white/40">
                            Tip: Usa ... para pausas naturales y ¡! para énfasis. Los tags funcionan mejor al inicio de frases.
                        </p>
                    </div>
                </div>
            )}

            {/* Enhanced text preview */}
            {enhancedText && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-black/95 backdrop-blur-xl border border-green-500/30 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2 border-b border-white/5 text-xs font-semibold text-green-400 uppercase tracking-wider flex justify-between items-center">
                        <span>Texto mejorado</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setEnhancedText(null)}
                                className="text-white/50 hover:text-white/80 text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={acceptEnhancedText}
                                className="text-green-400 hover:text-green-300 text-xs font-bold"
                            >
                                Aceptar
                            </button>
                        </div>
                    </div>
                    <div className="p-3 text-sm text-white/80 whitespace-pre-wrap">
                        {enhancedText}
                    </div>
                </div>
            )}
        </div>
    );
}
