import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader2, Sparkles, Mic, Wand2, Search, X, MessageSquare, Mail, Music, Instagram, ChevronDown, Smile } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// Channel types for message formatting
export type MessageChannel = 'whatsapp' | 'email' | 'tiktok' | 'instagram';

export const CHANNEL_CONFIG: Record<MessageChannel, { label: string; icon: React.ReactNode; color: string; description: string }> = {
    whatsapp: {
        label: 'WhatsApp',
        icon: <MessageSquare size={14} />,
        color: 'bg-green-500',
        description: 'Casual, emojis, directo'
    },
    email: {
        label: 'Email',
        icon: <Mail size={14} />,
        color: 'bg-blue-500',
        description: 'Formal, saludo/despedida'
    },
    tiktok: {
        label: 'TikTok',
        icon: <Music size={14} />,
        color: 'bg-pink-500',
        description: 'Corto, hashtags, trendy'
    },
    instagram: {
        label: 'Instagram',
        icon: <Instagram size={14} />,
        color: 'bg-purple-500',
        description: 'Visual, emojis, engaging'
    },
};

// Common emojis for quick selection
export const EMOJI_CATEGORIES = {
    frecuentes: ['😊', '👍', '🙏', '❤️', '✨', '🎉', '💪', '🔥', '👏', '💯', '🤗', '😉'],
    caras: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '🥰', '😍', '🤩', '😘', '😗', '😋', '😛', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴'],
    gestos: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    objetos: ['💊', '🧴', '🌿', '🍃', '🌱', '💚', '🛒', '📦', '🎁', '💰', '💵', '🏷️', '📱', '💻', '📧', '✉️', '📬', '🔔', '⏰', '📅'],
    simbolos: ['✅', '❌', '⭐', '💫', '✨', '💥', '💢', '💦', '💨', '🕐', '🔴', '🟢', '🔵', '⚪', '⚫', '🟤', '🟣', '🟡', '🟠', '❗', '❓', '‼️', '⁉️', '💲', '➡️', '⬅️', '⬆️', '⬇️', '↩️', '↪️'],
};

// ElevenLabs v3 Audio Tags Reference
// Based on: https://audio-generation-plugin.com/eleven-v3-tag-library/
// 1806 tags available organized in 15 categories
export const AUDIO_TAGS = {
    // Emotion - Core feelings and emotional states
    emotion: [
        { tag: '[whispers]', label: 'Susurro', description: 'Voz susurrada, íntima' },
        { tag: '[sighs]', label: 'Suspiro', description: 'Suspiro de emoción' },
        { tag: '[excited]', label: 'Emocionado', description: 'Tono alegre y enérgico' },
        { tag: '[sad]', label: 'Triste', description: 'Tono melancólico' },
        { tag: '[angry]', label: 'Enojado', description: 'Hostil, molesto' },
        { tag: '[happily]', label: 'Feliz', description: 'Tono alegre' },
        { tag: '[amused]', label: 'Divertido', description: 'Entretenido, complacido' },
        { tag: '[annoyed]', label: 'Molesto', description: 'Irritado, fastidiado' },
        { tag: '[anxious]', label: 'Ansioso', description: 'Preocupado, inquieto' },
        { tag: '[apologetic]', label: 'Disculpándose', description: 'Tono de disculpa' },
        { tag: '[apprehensive]', label: 'Aprensivo', description: 'Anticipación temerosa' },
        { tag: '[caring]', label: 'Cariñoso', description: 'Tono afectuoso' },
        { tag: '[compassionate]', label: 'Compasivo', description: 'Empático y comprensivo' },
        { tag: '[confident]', label: 'Confiado', description: 'Seguro de sí mismo' },
        { tag: '[curious]', label: 'Curioso', description: 'Tono de intriga' },
        { tag: '[delighted]', label: 'Encantado', description: 'Muy feliz' },
        { tag: '[disappointed]', label: 'Decepcionado', description: 'Desilusionado' },
        { tag: '[embarrassed]', label: 'Avergonzado', description: 'Apenado' },
        { tag: '[empathetic]', label: 'Empático', description: 'Muestra comprensión' },
        { tag: '[enthusiastic]', label: 'Entusiasta', description: 'Muy animado' },
        { tag: '[frustrated]', label: 'Frustrado', description: 'Exasperado' },
        { tag: '[gentle]', label: 'Gentil', description: 'Suave y delicado' },
        { tag: '[grateful]', label: 'Agradecido', description: 'Expresando gratitud' },
        { tag: '[hopeful]', label: 'Esperanzado', description: 'Optimista' },
        { tag: '[nervous]', label: 'Nervioso', description: 'Tono ansioso' },
        { tag: '[patient]', label: 'Paciente', description: 'Calmado y tolerante' },
        { tag: '[proud]', label: 'Orgulloso', description: 'Satisfecho' },
        { tag: '[reassuring]', label: 'Tranquilizador', description: 'Calmante' },
        { tag: '[relieved]', label: 'Aliviado', description: 'Sensación de alivio' },
        { tag: '[sarcastic]', label: 'Sarcástico', description: 'Irónico' },
        { tag: '[sincere]', label: 'Sincero', description: 'Honesto y genuino' },
        { tag: '[sorry]', label: 'Apenado', description: 'Expresando pena' },
        { tag: '[surprised]', label: 'Sorprendido', description: 'Asombrado' },
        { tag: '[sympathetic]', label: 'Simpático', description: 'Comprensivo' },
        { tag: '[thankful]', label: 'Agradecido', description: 'Dando gracias' },
        { tag: '[thoughtful]', label: 'Pensativo', description: 'Reflexivo' },
        { tag: '[understanding]', label: 'Comprensivo', description: 'Muestra entendimiento' },
        { tag: '[warm]', label: 'Cálido', description: 'Amigable y acogedor' },
        { tag: '[worried]', label: 'Preocupado', description: 'Inquieto' },
        { tag: '[joyful]', label: 'Alegre', description: 'Lleno de alegría' },
        { tag: '[melancholic]', label: 'Melancólico', description: 'Tristeza suave' },
        { tag: '[fearful]', label: 'Temeroso', description: 'Con miedo' },
        { tag: '[loving]', label: 'Amoroso', description: 'Con amor' },
        { tag: '[hurt]', label: 'Herido', description: 'Emocionalmente lastimado' },
        { tag: '[bittersweet]', label: 'Agridulce', description: 'Feliz y triste' },
    ],
    // Body States - Physical reactions
    bodyStates: [
        { tag: '[laughs]', label: 'Risa', description: 'Risa natural' },
        { tag: '[laughs softly]', label: 'Risa suave', description: 'Risa gentil' },
        { tag: '[giggles]', label: 'Risita', description: 'Risita corta' },
        { tag: '[chuckles]', label: 'Risita', description: 'Risa entre dientes' },
        { tag: '[clears throat]', label: 'Carraspeo', description: 'Aclara garganta' },
        { tag: '[gasps]', label: 'Jadeo', description: 'Respiración de sorpresa' },
        { tag: '[gulps]', label: 'Traga', description: 'Trago nervioso' },
        { tag: '[breathes]', label: 'Respira', description: 'Respiración audible' },
        { tag: '[breathes deeply]', label: 'Respira profundo', description: 'Respiración profunda' },
        { tag: '[exhales]', label: 'Exhala', description: 'Exhalación' },
        { tag: '[inhales]', label: 'Inhala', description: 'Inhalación' },
        { tag: '[sniffs]', label: 'Olfatea', description: 'Olfateo' },
        { tag: '[coughs]', label: 'Tose', description: 'Tos' },
        { tag: '[yawns]', label: 'Bosteza', description: 'Bostezo' },
        { tag: '[groans]', label: 'Gime', description: 'Gemido' },
        { tag: '[hums]', label: 'Tararea', description: 'Tarareo' },
        { tag: '[mumbles]', label: 'Murmura', description: 'Murmullo' },
        { tag: '[snorts]', label: 'Resopla', description: 'Resoplido' },
        { tag: '[hiccups]', label: 'Hipo', description: 'Hipo' },
        { tag: '[shivers]', label: 'Tiembla', description: 'Temblor' },
        { tag: '[stretches]', label: 'Se estira', description: 'Estiramiento' },
        { tag: '[winces]', label: 'Hace mueca', description: 'Mueca de dolor' },
        { tag: '[sobs]', label: 'Solloza', description: 'Llanto' },
        { tag: '[crying]', label: 'Llorando', description: 'En llanto' },
        { tag: '[trembling]', label: 'Temblando', description: 'Voz temblorosa' },
    ],
    // Dialogue - Conversational elements
    dialogue: [
        { tag: '[anticipatory pause]', label: 'Pausa anticipatoria', description: 'Pausa con anticipación' },
        { tag: '[apologizes mid-sentence]', label: 'Disculpa a mitad', description: 'Se disculpa mientras habla' },
        { tag: '[asks rhetorically]', label: 'Pregunta retórica', description: 'Pregunta sin esperar respuesta' },
        { tag: '[aside]', label: 'Aparte', description: 'Comentario al margen' },
        { tag: '[corrects self]', label: 'Se corrige', description: 'Autocorrección' },
        { tag: '[emphasizes]', label: 'Enfatiza', description: 'Pone énfasis' },
        { tag: '[explains patiently]', label: 'Explica pacientemente', description: 'Explicación calmada' },
        { tag: '[interjects]', label: 'Interrumpe', description: 'Interrupción' },
        { tag: '[reassures]', label: 'Tranquiliza', description: 'Da seguridad' },
        { tag: '[summarizes]', label: 'Resume', description: 'Hace resumen' },
        { tag: '[trails off]', label: 'Se desvanece', description: 'Voz que se apaga' },
        { tag: '[to self]', label: 'Para sí', description: 'Hablando solo' },
        { tag: '[addressing audience]', label: 'Al público', description: 'Dirigido a audiencia' },
        { tag: '[inner monologue]', label: 'Monólogo interno', description: 'Pensamiento interno' },
        { tag: '[quotes]', label: 'Cita', description: 'Citando a alguien' },
        { tag: '[confides]', label: 'Confía', description: 'En confianza' },
    ],
    // Rhythm - Pacing and delivery
    rhythm: [
        { tag: '[pause]', label: 'Pausa', description: 'Pausa breve' },
        { tag: '[short pause]', label: 'Pausa corta', description: 'Pausa muy breve' },
        { tag: '[long pause]', label: 'Pausa larga', description: 'Pausa extendida' },
        { tag: '[beat]', label: 'Beat', description: 'Pausa dramática' },
        { tag: '[slowly]', label: 'Lento', description: 'Habla más despacio' },
        { tag: '[quickly]', label: 'Rápido', description: 'Habla más rápido' },
        { tag: '[deliberately]', label: 'Deliberado', description: 'Habla con intención' },
        { tag: '[hesitates]', label: 'Hesita', description: 'Momento de duda' },
        { tag: '[stammers]', label: 'Tartamudea', description: 'Duda al hablar' },
        { tag: '[stutters]', label: 'Tartamudea', description: 'Tartamudeo' },
        { tag: '[drawn out]', label: 'Alargado', description: 'Palabras alargadas' },
        { tag: '[rapid-fire]', label: 'Ráfaga', description: 'Muy rápido' },
        { tag: '[measured]', label: 'Medido', description: 'Ritmo constante' },
        { tag: '[rushed]', label: 'Apresurado', description: 'Con prisa' },
        { tag: '[languid]', label: 'Lánguido', description: 'Lento y relajado' },
        { tag: '[staccato]', label: 'Staccato', description: 'Palabras cortadas' },
    ],
    // Vocal Effects - Voice modifications
    vocalEffects: [
        { tag: '[quietly]', label: 'Bajo', description: 'Volumen bajo' },
        { tag: '[softly]', label: 'Suave', description: 'Voz suave' },
        { tag: '[loudly]', label: 'Alto', description: 'Volumen alto' },
        { tag: '[shouts]', label: 'Grita', description: 'Grito' },
        { tag: '[yells]', label: 'Grita fuerte', description: 'Grito intenso' },
        { tag: '[murmurs]', label: 'Murmura', description: 'Voz muy baja' },
        { tag: '[under breath]', label: 'Entre dientes', description: 'Casi inaudible' },
        { tag: '[raspy]', label: 'Rasposa', description: 'Voz ronca' },
        { tag: '[breathy]', label: 'Entrecortada', description: 'Con aire' },
        { tag: '[hoarse]', label: 'Ronca', description: 'Voz dañada' },
        { tag: '[squeaky]', label: 'Chillona', description: 'Voz aguda' },
        { tag: '[deep voice]', label: 'Voz grave', description: 'Tono bajo' },
        { tag: '[high-pitched]', label: 'Aguda', description: 'Tono alto' },
        { tag: '[cracking voice]', label: 'Voz quebrada', description: 'Voz que se quiebra' },
        { tag: '[echoing]', label: 'Con eco', description: 'Efecto de eco' },
    ],
    // Styles - Speaking manner
    styles: [
        { tag: '[analytical]', label: 'Analítico', description: 'Habla con lógica' },
        { tag: '[animated]', label: 'Animado', description: 'Expresión viva' },
        { tag: '[casual]', label: 'Casual', description: 'Informal y relajado' },
        { tag: '[conversational]', label: 'Conversacional', description: 'Como charla' },
        { tag: '[formal]', label: 'Formal', description: 'Profesional y serio' },
        { tag: '[friendly]', label: 'Amigable', description: 'Tono de amigo' },
        { tag: '[matter-of-fact]', label: 'Directo', description: 'Sin rodeos' },
        { tag: '[playful]', label: 'Juguetón', description: 'Divertido' },
        { tag: '[professional]', label: 'Profesional', description: 'Tono de negocio' },
        { tag: '[storytelling]', label: 'Narrativo', description: 'Como cuento' },
        { tag: '[deadpan]', label: 'Inexpresivo', description: 'Sin emoción aparente' },
        { tag: '[dramatic]', label: 'Dramático', description: 'Teatral' },
        { tag: '[monotone]', label: 'Monótono', description: 'Sin variación' },
        { tag: '[upbeat]', label: 'Optimista', description: 'Positivo y alegre' },
    ],
    // Mood - Overall tone
    mood: [
        { tag: '[helpful tone]', label: 'Tono de ayuda', description: 'Dispuesto a asistir' },
        { tag: '[welcoming]', label: 'Acogedor', description: 'Da la bienvenida' },
        { tag: '[attentive]', label: 'Atento', description: 'Prestando atención' },
        { tag: '[encouraging]', label: 'Alentador', description: 'Da ánimos' },
        { tag: '[informative]', label: 'Informativo', description: 'Dando información' },
        { tag: '[polite]', label: 'Cortés', description: 'Educado' },
        { tag: '[respectful]', label: 'Respetuoso', description: 'Muestra respeto' },
        { tag: '[supportive]', label: 'De apoyo', description: 'Brinda soporte' },
        { tag: '[somber]', label: 'Sombrío', description: 'Serio y oscuro' },
        { tag: '[lighthearted]', label: 'Alegre', description: 'Despreocupado' },
        { tag: '[intense]', label: 'Intenso', description: 'Con fuerza' },
        { tag: '[peaceful]', label: 'Pacífico', description: 'Tranquilo' },
        { tag: '[tense]', label: 'Tenso', description: 'Con tensión' },
        { tag: '[mysterious]', label: 'Misterioso', description: 'Enigmático' },
        { tag: '[romantic]', label: 'Romántico', description: 'Amoroso' },
    ],
    // Accents - Regional variations
    accents: [
        { tag: '[British accent]', label: 'Británico', description: 'Acento británico' },
        { tag: '[American accent]', label: 'Americano', description: 'Acento americano' },
        { tag: '[Southern accent]', label: 'Sureño', description: 'Acento del sur de EEUU' },
        { tag: '[New York accent]', label: 'Nueva York', description: 'Acento neoyorquino' },
        { tag: '[Irish accent]', label: 'Irlandés', description: 'Acento irlandés' },
        { tag: '[Scottish accent]', label: 'Escocés', description: 'Acento escocés' },
        { tag: '[Australian accent]', label: 'Australiano', description: 'Acento australiano' },
        { tag: '[French accent]', label: 'Francés', description: 'Acento francés' },
        { tag: '[German accent]', label: 'Alemán', description: 'Acento alemán' },
        { tag: '[Spanish accent]', label: 'Español', description: 'Acento español' },
        { tag: '[Italian accent]', label: 'Italiano', description: 'Acento italiano' },
        { tag: '[Russian accent]', label: 'Ruso', description: 'Acento ruso' },
        { tag: '[Mexican accent]', label: 'Mexicano', description: 'Acento mexicano' },
    ],
    // Narrative - Storytelling elements
    narrative: [
        { tag: '[narrating]', label: 'Narrando', description: 'Voz de narrador' },
        { tag: '[reading aloud]', label: 'Leyendo', description: 'Lectura en voz alta' },
        { tag: '[announcing]', label: 'Anunciando', description: 'Tono de anuncio' },
        { tag: '[introducing]', label: 'Presentando', description: 'Introducción' },
        { tag: '[concluding]', label: 'Concluyendo', description: 'Cierre' },
        { tag: '[recounting]', label: 'Relatando', description: 'Contando historia' },
        { tag: '[describing]', label: 'Describiendo', description: 'Descripción' },
        { tag: '[foreshadowing]', label: 'Presagiando', description: 'Anticipando' },
        { tag: '[flashback]', label: 'Flashback', description: 'Recuerdo' },
        { tag: '[voice-over]', label: 'Voz en off', description: 'Narración externa' },
    ],
    // Humor - Comedic elements
    humor: [
        { tag: '[joking]', label: 'Bromeando', description: 'Tono de broma' },
        { tag: '[teasing]', label: 'Molestando', description: 'Burla amigable' },
        { tag: '[witty]', label: 'Ingenioso', description: 'Con ingenio' },
        { tag: '[punning]', label: 'Juego palabras', description: 'Haciendo puns' },
        { tag: '[silly]', label: 'Tonto', description: 'Tono bobo' },
        { tag: '[dry humor]', label: 'Humor seco', description: 'Sarcasmo sutil' },
        { tag: '[self-deprecating]', label: 'Autodesprecio', description: 'Humor sobre sí mismo' },
        { tag: '[mocking]', label: 'Burlándose', description: 'Imitación burlesca' },
    ],
    // Introspection - Internal thoughts
    introspection: [
        { tag: '[pondering]', label: 'Meditando', description: 'Pensando profundamente' },
        { tag: '[reflecting]', label: 'Reflexionando', description: 'Mirando atrás' },
        { tag: '[wondering]', label: 'Preguntándose', description: 'Con curiosidad' },
        { tag: '[remembering]', label: 'Recordando', description: 'Evocando memorias' },
        { tag: '[realizing]', label: 'Dándose cuenta', description: 'Momento de revelación' },
        { tag: '[daydreaming]', label: 'Soñando despierto', description: 'En fantasía' },
        { tag: '[contemplating]', label: 'Contemplando', description: 'En contemplación' },
        { tag: '[doubting]', label: 'Dudando', description: 'Con incertidumbre' },
    ],
    // Effects - Sound effects
    effects: [
        { tag: '[radio effect]', label: 'Radio', description: 'Como por radio' },
        { tag: '[phone effect]', label: 'Teléfono', description: 'Como por teléfono' },
        { tag: '[megaphone]', label: 'Megáfono', description: 'Con megáfono' },
        { tag: '[reverb]', label: 'Reverberación', description: 'Con reverb' },
        { tag: '[distorted]', label: 'Distorsionado', description: 'Voz distorsionada' },
        { tag: '[muffled]', label: 'Amortiguado', description: 'Voz tapada' },
        { tag: '[underwater]', label: 'Bajo el agua', description: 'Efecto acuático' },
    ],
    // Environment - Setting context
    environment: [
        { tag: '[in a crowded room]', label: 'Lugar lleno', description: 'Ambiente ruidoso' },
        { tag: '[outdoors]', label: 'Exterior', description: 'Al aire libre' },
        { tag: '[in an empty room]', label: 'Sala vacía', description: 'Eco de espacio' },
        { tag: '[intimate setting]', label: 'Íntimo', description: 'Ambiente cercano' },
        { tag: '[public space]', label: 'Público', description: 'Espacio abierto' },
        { tag: '[on stage]', label: 'En escenario', description: 'Proyectando' },
    ],
    // Genre - Thematic styles
    genre: [
        { tag: '[documentary style]', label: 'Documental', description: 'Narración informativa' },
        { tag: '[news anchor]', label: 'Noticiero', description: 'Estilo de noticias' },
        { tag: '[audiobook]', label: 'Audiolibro', description: 'Narración de libro' },
        { tag: '[podcast host]', label: 'Podcast', description: 'Estilo podcast' },
        { tag: '[commercial]', label: 'Comercial', description: 'Anuncio publicitario' },
        { tag: '[movie trailer]', label: 'Trailer', description: 'Épico de película' },
        { tag: '[meditation guide]', label: 'Meditación', description: 'Guía calmante' },
        { tag: '[sports commentary]', label: 'Deportes', description: 'Comentarista' },
    ],
    // Sound Effects - Non-vocal sounds
    soundEffects: [
        { tag: '[door creaks]', label: 'Puerta', description: 'Puerta que rechina' },
        { tag: '[footsteps]', label: 'Pasos', description: 'Sonido de pasos' },
        { tag: '[wind blowing]', label: 'Viento', description: 'Sonido de viento' },
        { tag: '[rain falling]', label: 'Lluvia', description: 'Sonido de lluvia' },
        { tag: '[thunder]', label: 'Trueno', description: 'Sonido de trueno' },
        { tag: '[clock ticking]', label: 'Reloj', description: 'Tic-tac' },
        { tag: '[phone ringing]', label: 'Teléfono', description: 'Timbre' },
    ],
};

// Category metadata for display
export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
    emotion: { label: 'Emoción', icon: '💭' },
    bodyStates: { label: 'Estados', icon: '🫁' },
    dialogue: { label: 'Diálogo', icon: '💬' },
    rhythm: { label: 'Ritmo', icon: '🎵' },
    vocalEffects: { label: 'Efectos Voz', icon: '🎤' },
    styles: { label: 'Estilos', icon: '🎭' },
    mood: { label: 'Mood', icon: '🌡️' },
    accents: { label: 'Acentos', icon: '🌍' },
    narrative: { label: 'Narrativa', icon: '📖' },
    humor: { label: 'Humor', icon: '😄' },
    introspection: { label: 'Introspección', icon: '🤔' },
    effects: { label: 'Efectos', icon: '📻' },
    environment: { label: 'Ambiente', icon: '🏠' },
    genre: { label: 'Género', icon: '🎬' },
    soundEffects: { label: 'Sonidos', icon: '🔊' },
};

type AudioTagCategory = keyof typeof AUDIO_TAGS;

// Flatten all tags for search
const ALL_TAGS = Object.entries(AUDIO_TAGS).flatMap(([category, tags]) =>
    tags.map(tag => ({ ...tag, category }))
);

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
    const predictionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Help me write state
    const [showHelpMenu, setShowHelpMenu] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [enhancedText, setEnhancedText] = useState<string | null>(null);

    // Audio enhancement state
    const [showAudioTags, setShowAudioTags] = useState(false);
    const [selectedTagCategory, setSelectedTagCategory] = useState<AudioTagCategory>('emotion');
    const [tagSearchQuery, setTagSearchQuery] = useState('');

    // Channel selector state
    const [selectedChannel, setSelectedChannel] = useState<MessageChannel>('whatsapp');
    const [showChannelSelector, setShowChannelSelector] = useState(false);

    // Emoji picker state
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<keyof typeof EMOJI_CATEGORIES>('frecuentes');

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
            setShowEmojiPicker(false);
            setShowChannelSelector(false);
        }
    };

    // Insert emoji at cursor position
    const insertEmoji = (emoji: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            onChange(value + emoji);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = value.substring(0, start);
        const after = value.substring(end);

        const newValue = before + emoji + after;
        onChange(newValue);

        // Set cursor after emoji
        setTimeout(() => {
            const newPos = start + emoji.length;
            textarea.focus();
            textarea.setSelectionRange(newPos, newPos);
        }, 0);
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

    // "Help me write" - improve/expand text with channel-specific formatting
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
                    channel: selectedChannel, // NEW: Include selected channel for formatting
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
                    {/* Emoji picker button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowEmojiPicker(!showEmojiPicker);
                            setShowAudioTags(false);
                            setShowHelpMenu(false);
                            setShowChannelSelector(false);
                        }}
                        className="p-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 hover:text-yellow-300 transition-colors"
                        title="Emojis"
                    >
                        <Smile size={14} />
                    </button>

                    {/* Audio tags button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowAudioTags(!showAudioTags);
                            setShowHelpMenu(false);
                            setShowEmojiPicker(false);
                            setShowChannelSelector(false);
                        }}
                        className="p-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-colors"
                        title="Tags de Audio (ElevenLabs)"
                    >
                        <Mic size={14} />
                    </button>

                    {/* Channel selector button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowChannelSelector(!showChannelSelector);
                            setShowHelpMenu(false);
                            setShowAudioTags(false);
                            setShowEmojiPicker(false);
                        }}
                        className={`p-1.5 rounded-lg ${CHANNEL_CONFIG[selectedChannel].color}/20 hover:${CHANNEL_CONFIG[selectedChannel].color}/30 text-white/80 hover:text-white transition-colors flex items-center gap-1`}
                        title="Canal de mensaje"
                    >
                        {CHANNEL_CONFIG[selectedChannel].icon}
                        <ChevronDown size={10} />
                    </button>

                    {/* Help me write button */}
                    <button
                        type="button"
                        onClick={() => {
                            setShowHelpMenu(!showHelpMenu);
                            setShowAudioTags(false);
                            setShowEmojiPicker(false);
                            setShowChannelSelector(false);
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
                <div className="absolute bottom-full left-0 mb-2 w-[420px] bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    {/* Header with search */}
                    <div className="p-2 border-b border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                                Tags de Audio (ElevenLabs v3)
                            </span>
                            <a
                                href="https://audio-generation-plugin.com/eleven-v3-tag-library/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 text-[10px]"
                            >
                                1806 tags
                            </a>
                        </div>
                        {/* Search input */}
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
                            <input
                                type="text"
                                value={tagSearchQuery}
                                onChange={(e) => setTagSearchQuery(e.target.value)}
                                placeholder="Buscar tags..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-7 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-purple-500/50"
                            />
                            {tagSearchQuery && (
                                <button
                                    onClick={() => setTagSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Category tabs - scrollable */}
                    {!tagSearchQuery && (
                        <div className="flex overflow-x-auto border-b border-white/5 scrollbar-none">
                            {(Object.keys(AUDIO_TAGS) as AudioTagCategory[]).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedTagCategory(cat)}
                                    className={`flex-shrink-0 px-2 py-1.5 text-[10px] transition-colors whitespace-nowrap ${
                                        selectedTagCategory === cat
                                            ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/10'
                                            : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="mr-1">{CATEGORY_META[cat]?.icon}</span>
                                    {CATEGORY_META[cat]?.label || cat}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Tags grid */}
                    <div className="p-2 max-h-56 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-1">
                            {(tagSearchQuery
                                ? ALL_TAGS.filter(t =>
                                    t.tag.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                                    t.label.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                                    t.description.toLowerCase().includes(tagSearchQuery.toLowerCase())
                                ).slice(0, 20)
                                : AUDIO_TAGS[selectedTagCategory]
                            ).map((item) => (
                                <button
                                    key={item.tag}
                                    onClick={() => insertAudioTag(item.tag)}
                                    className="px-2 py-1.5 text-left bg-white/5 hover:bg-purple-500/20 rounded-lg transition-colors group"
                                >
                                    <div className="text-xs font-mono text-purple-400 group-hover:text-purple-300 truncate">
                                        {item.tag}
                                    </div>
                                    <div className="text-[10px] text-white/40 truncate">{item.label}</div>
                                </button>
                            ))}
                        </div>
                        {tagSearchQuery && ALL_TAGS.filter(t =>
                            t.tag.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
                            t.label.toLowerCase().includes(tagSearchQuery.toLowerCase())
                        ).length === 0 && (
                            <div className="text-center text-xs text-white/30 py-4">
                                No se encontraron tags
                            </div>
                        )}
                    </div>

                    {/* Quick tip */}
                    <div className="p-2 border-t border-white/5 bg-purple-500/5">
                        <p className="text-[10px] text-white/40">
                            Tip: Usa ... para pausas naturales y ¡! para énfasis. Los tags funcionan mejor al inicio de frases.
                        </p>
                    </div>
                </div>
            )}

            {/* Channel selector menu */}
            {showChannelSelector && (
                <div className="absolute bottom-full right-0 mb-2 w-52 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2 border-b border-white/5 text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Canal de Mensaje
                    </div>
                    <div className="p-1">
                        {(Object.entries(CHANNEL_CONFIG) as [MessageChannel, typeof CHANNEL_CONFIG[MessageChannel]][]).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => {
                                    setSelectedChannel(key);
                                    setShowChannelSelector(false);
                                }}
                                className={`w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center gap-3 ${
                                    selectedChannel === key
                                        ? 'bg-white/10 text-white'
                                        : 'hover:bg-white/5 text-white/70'
                                }`}
                            >
                                <div className={`p-1.5 rounded-lg ${config.color}/30`}>
                                    {config.icon}
                                </div>
                                <div>
                                    <div className="text-sm font-medium">{config.label}</div>
                                    <div className="text-[10px] text-white/40">{config.description}</div>
                                </div>
                                {selectedChannel === key && (
                                    <div className="ml-auto text-green-400 text-xs">✓</div>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="p-2 border-t border-white/5 bg-white/5">
                        <p className="text-[10px] text-white/40">
                            El formato del texto se ajustará al canal seleccionado al usar "Ayúdame a escribir"
                        </p>
                    </div>
                </div>
            )}

            {/* Emoji picker menu */}
            {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="p-2 border-b border-white/5 flex justify-between items-center">
                        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                            Emojis
                        </span>
                        <button
                            onClick={() => setShowEmojiPicker(false)}
                            className="text-white/30 hover:text-white/50"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Category tabs */}
                    <div className="flex overflow-x-auto border-b border-white/5 scrollbar-none">
                        {(Object.keys(EMOJI_CATEGORIES) as (keyof typeof EMOJI_CATEGORIES)[]).map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedEmojiCategory(cat)}
                                className={`flex-shrink-0 px-3 py-1.5 text-xs transition-colors whitespace-nowrap capitalize ${
                                    selectedEmojiCategory === cat
                                        ? 'text-yellow-400 border-b-2 border-yellow-400 bg-yellow-500/10'
                                        : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Emoji grid */}
                    <div className="p-2 max-h-40 overflow-y-auto">
                        <div className="grid grid-cols-8 gap-1">
                            {EMOJI_CATEGORIES[selectedEmojiCategory].map((emoji, idx) => (
                                <button
                                    key={`${emoji}-${idx}`}
                                    onClick={() => insertEmoji(emoji)}
                                    className="p-1.5 text-xl hover:bg-white/10 rounded-lg transition-colors"
                                    title={emoji}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
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
