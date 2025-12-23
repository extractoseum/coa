import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, FileText, ChevronDown, ChevronUp, AlertCircle, Volume2 } from 'lucide-react';

interface VoiceMessageProps {
    audioUrl: string;
    transcript?: string;
    summary?: string;
    intent?: string; // intent (emotion)
    duration?: number;
    timestamp?: string;
    sender?: 'user' | 'assistant';
}

export const MessageAudioPlayer: React.FC<VoiceMessageProps> = ({
    audioUrl,
    transcript,
    summary,
    intent,
    sender = 'user'
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showTranscript, setShowTranscript] = useState(false);

    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateProgress = () => {
            if (audio.duration) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        const onLoadedMetadata = () => {
            setDuration(audio.duration);
        };

        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('loadedmetadata', onLoadedMetadata);

        return () => {
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, []);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const formatTime = (seconds: number) => {
        if (!seconds) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Parse Intent and Emotion if combined "Intent (Emotion)"
    let displayIntent = intent;
    let displayEmotion = '';
    if (intent && intent.includes('(')) {
        const parts = intent.split('(');
        displayIntent = parts[0].trim();
        displayEmotion = parts[1].replace(')', '').trim();
    }

    return (
        <div className={`flex flex-col max-w-sm rounded-xl overflow-hidden border ${sender === 'user' ? 'bg-gray-800 border-gray-700' : 'bg-pink-900/20 border-pink-500/20'}`}>

            {/* Audio Controls */}
            <div className="flex items-center p-3 gap-3">
                <button
                    onClick={togglePlay}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${sender === 'user' ? 'bg-pink-500 hover:bg-pink-600 text-white' : 'bg-pink-400 text-black hover:bg-pink-300'}`}
                >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>

                <div className="flex-1 flex flex-col justify-center gap-1">
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden w-full relative">
                        <div
                            className="h-full bg-pink-500 rounded-full transition-all duration-100"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[10px] text-white/50 font-mono">
                        <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="text-white/30">
                    <Volume2 size={16} />
                </div>
            </div>

            <audio ref={audioRef} src={audioUrl} className="hidden" />

            {/* Analysis Chips */}
            {(intent || summary) && (
                <div className="px-3 pb-2 flex flex-wrap gap-2">
                    {displayIntent && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {displayIntent}
                        </span>
                    )}
                    {displayEmotion && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {displayEmotion}
                        </span>
                    )}
                </div>
            )}

            {/* Transcript Toggle */}
            {transcript && (
                <div className="bg-black/20 border-t border-white/5">
                    <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-white/50 hover:bg-white/5 transition-colors"
                    >
                        <span className="flex items-center gap-1.5">
                            <FileText size={12} />
                            {showTranscript ? 'Ocultar Transcripción' : 'Ver Transcripción'}
                        </span>
                        {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>

                    {showTranscript && (
                        <div className="px-3 pb-3 pt-1 text-xs text-white/80 animate-in slide-in-from-top-2 duration-200">
                            {summary && (
                                <div className="mb-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90 text-[11px] italic">
                                    "{summary}"
                                </div>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed opacity-90 font-light">
                                {transcript}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
