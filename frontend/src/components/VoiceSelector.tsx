import React, { useState, useEffect } from 'react';

// Hardcoded top voices for now, ideally fetched from API
const AVAILABLE_VOICES = [
    { id: 'Kq9pDHHIMmJsG9PEqOtv', name: 'Kina - Cute happy girl (Default)', category: 'conversational' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George - Warm Storyteller', category: 'narrative' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel - American, Clear', category: 'narrative' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Bella) - Mature, Confident', category: 'support' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam - Profesional', category: 'news' }
];

export interface VoiceProfileConfig {
    provider: 'openai' | 'elevenlabs';
    voice_id: string;
    settings?: {
        stability: number;
        similarity_boost: number;
        style: number;
        use_speaker_boost: boolean;
        speed: number;
    };
}

interface VoiceSelectorProps {
    value?: VoiceProfileConfig;
    onChange: (config: VoiceProfileConfig) => void;
}

const DEFAULT_SETTINGS = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
    speed: 1.0
};

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ value, onChange }) => {
    const [provider, setProvider] = useState<'openai' | 'elevenlabs'>(value?.provider || 'elevenlabs');
    const [voiceId, setVoiceId] = useState<string>(value?.voice_id || 'Kq9pDHHIMmJsG9PEqOtv');
    const [settings, setSettings] = useState(value?.settings || DEFAULT_SETTINGS);

    useEffect(() => {
        // Emit changes upstream
        onChange({
            provider,
            voice_id: voiceId,
            settings
        });
    }, [provider, voiceId, settings]);

    const handleSettingChange = (key: string, val: number | boolean) => {
        setSettings(prev => ({ ...prev, [key]: val }));
    };

    return (
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                🎙️ Voice Configuration
            </h3>

            {/* Provider Selector */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Provider</label>
                    <select
                        value={provider}
                        onChange={(e) => {
                            const newProvider = e.target.value as any;
                            setProvider(newProvider);
                            if (newProvider === 'elevenlabs') {
                                setVoiceId('JBFqnCBsd6RMkjVDRZzb'); // Kina (Default)
                            } else {
                                setVoiceId('nova'); // Nova (Default)
                            }
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-gray-700 dark:text-white"
                    >
                        <option value="elevenlabs">ElevenLabs (Premium)</option>
                        <option value="openai">OpenAI (Standard)</option>
                    </select>
                </div>

                {/* Voice Selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Voice</label>
                    <select
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-gray-700 dark:text-white"
                    >
                        {provider === 'elevenlabs' ? (
                            AVAILABLE_VOICES.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))
                        ) : (
                            <>
                                <option value="nova">Nova</option>
                                <option value="alloy">Alloy</option>
                                <option value="echo">Echo</option>
                                <option value="fable">Fable</option>
                                <option value="onyx">Onyx</option>
                                <option value="shimmer">Shimmer</option>
                            </>
                        )}
                    </select>
                </div>
            </div>

            {/* Advanced Settings (Only for ElevenLabs) */}
            {provider === 'elevenlabs' && (
                <div className="space-y-4 border-t pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Advanced Realism Settings</p>

                    {/* Stability */}
                    <div>
                        <div className="flex justify-between">
                            <label className="text-sm text-gray-600">Stability ({settings.stability})</label>
                            <span className="text-xs text-gray-400">More variable (Expressive) ⟷ More stable</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={settings.stability}
                            onChange={(e) => handleSettingChange('stability', parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Similarity Boost */}
                    <div>
                        <div className="flex justify-between">
                            <label className="text-sm text-gray-600">Similarity ({settings.similarity_boost})</label>
                            <span className="text-xs text-gray-400">Low ⟷ High Fidelity</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={settings.similarity_boost}
                            onChange={(e) => handleSettingChange('similarity_boost', parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>

                    {/* Style Exaggeration */}
                    <div>
                        <div className="flex justify-between">
                            <label className="text-sm text-gray-600">Style Exaggeration ({settings.style})</label>
                            <span className="text-xs text-gray-400">Neutral ⟷ Dramatic</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={settings.style}
                            onChange={(e) => handleSettingChange('style', parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
