
import React, { useState, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Save, RefreshCw, AlertTriangle, CheckCircle, Code } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

const ToolEditor = ({ onClose }: { onClose: () => void }) => {
    const { theme } = useTheme();
    const { isSuperAdmin } = useAuth();
    const token = localStorage.getItem('accessToken');

    // State
    const [code, setCode] = useState('// Loading tools registry...');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [stats, setStats] = useState({ count: 0 });

    const monaco = useMonaco();

    // Configure JSON schema for validation
    useEffect(() => {
        if (monaco) {
            (monaco.languages.json as any).jsonDefaults.setDiagnosticsOptions({
                validate: true,
                schemas: [{
                    uri: "https://myschema/tools-schema.json",
                    fileMatch: ["*"],
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            required: ["name", "description", "category"],
                            properties: {
                                name: { type: "string" },
                                description: { type: "string" },
                                category: { type: "string" },
                                input_schema: { type: "object" }
                            }
                        }
                    }
                }]
            });
        }
    }, [monaco]);

    // Load Tools
    useEffect(() => {
        loadTools();
    }, []);

    const loadTools = async () => {
        setLoading(true);
        setStatus(null);
        try {
            if (!token) {
                throw new Error('No access token found. Please log in.');
            }

            console.log('Fetching tools with token length:', token.length);

            const res = await fetch('/api/v1/tools', {
                headers: { Authorization: `Bearer ${token}` }
            });

            const text = await res.text();
            console.log('Tools response:', res.status, text.substring(0, 100));

            try {
                const data = JSON.parse(text);
                if (data.success) {
                    const formatted = JSON.stringify(data.data, null, 4);
                    setCode(formatted);
                    setStats({ count: data.data.length });
                    setStatus({ type: 'success', message: 'Registry loaded successfully' });
                } else {
                    throw new Error(data.error || 'Backend reported failure');
                }
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                throw new Error(`Failed to parse response: ${text.substring(0, 50)}...`);
            }
        } catch (err: any) {
            console.error('LoadTools Error:', err);
            setCode(`// Error loading file: ${err.message}\n// Check console for details.`);
            setStatus({ type: 'error', message: err.message || 'Failed to load tools' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus({ type: 'info', message: 'Validating JSON...' });

        try {
            // 1. Client-side Validation
            let parsed;
            try {
                parsed = JSON.parse(code);
            } catch (e) {
                throw new Error('Invalid JSON syntax. Please check for missing commas or brackets.');
            }

            if (!Array.isArray(parsed)) {
                throw new Error('Root must be an array []');
            }

            // 2. Send to backend
            const res = await fetch('/api/v1/tools', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ tools: parsed })
            });
            const data = await res.json();

            if (data.success) {
                setStatus({ type: 'success', message: 'Saved successfully!' });
                setStats({ count: parsed.length });
                // Refresh after short delay
                setTimeout(() => setStatus(null), 3000);
            } else {
                throw new Error(data.error);
            }

        } catch (err: any) {
            console.error(err);
            setStatus({ type: 'error', message: err.message });
        } finally {
            setSaving(false);
        }
    };

    if (!isSuperAdmin) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4">
            <div
                className="w-full max-w-6xl h-full md:h-[85vh] flex flex-col rounded-none md:rounded-xl shadow-2xl border"
                style={{
                    backgroundColor: '#1E1E1E',
                    borderColor: '#333'
                }}
            >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 border-b border-[#333]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-blue-500/10 text-blue-400">
                            <Code size={20} />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-none">Tool Registry Editor</h2>
                            <p className="text-gray-400 text-xs mt-1">
                                {stats.count} tools definitions • data/ai_knowledge_base/core/tools_registry.json
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {status && (
                            <div className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2 mr-2 ${status.type === 'error' ? 'bg-red-500/10 text-red-500' :
                                status.type === 'success' ? 'bg-green-500/10 text-green-500' :
                                    'bg-blue-500/10 text-blue-500'
                                }`}>
                                {status.type === 'error' ? <AlertTriangle size={12} /> :
                                    status.type === 'success' ? <CheckCircle size={12} /> :
                                        <RefreshCw size={12} className="animate-spin" />}
                                {status.message}
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                            <span className="hidden sm:inline">Save Changes</span>
                            <span className="sm:hidden">Save</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors text-sm"
                        >
                            Close
                        </button>
                    </div>
                </div>

                {/* Editor Container */}
                <div className="flex-1 relative">
                    <Editor
                        height="100%"
                        defaultLanguage="json"
                        value={code}
                        onChange={(value) => setCode(value || '')}
                        theme="vs-dark"
                        options={{
                            minimap: { enabled: true },
                            fontSize: 14,
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            formatOnPaste: true,
                            formatOnType: true,
                        }}
                    />
                </div>

                {/* Footer / Status Bar */}
                <div className="h-8 bg-[#007acc] text-white text-[10px] flex items-center px-4 justify-between select-none">
                    <div className="flex gap-4">
                        <span>JSON</span>
                        <span>UTF-8</span>
                    </div>
                    <div>
                        {loading ? 'Loading remote file...' : 'Ready'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ToolEditor;
