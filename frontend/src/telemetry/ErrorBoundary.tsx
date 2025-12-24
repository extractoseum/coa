import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronLeft } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });

        // Here you would typically log to a service like Sentry or your telemetry endpoint
        // logErrorToService(error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleGoHome = () => {
        window.location.href = '/';
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
                        <div className="p-8 flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                                <AlertTriangle className="w-8 h-8 text-red-500" />
                            </div>

                            <h1 className="text-2xl font-bold mb-2">Algo salió mal</h1>
                            <p className="text-gray-400 mb-6">
                                Ha ocurrido un error inesperado en la aplicación. Hemos registrado el problema.
                            </p>

                            <div className="flex gap-4 w-full mb-8">
                                <button
                                    onClick={this.handleGoHome}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                    <span>Inicio</span>
                                </button>
                                <button
                                    onClick={this.handleReload}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors text-white font-medium"
                                >
                                    <RefreshCw size={18} />
                                    <span>Recargar</span>
                                </button>
                            </div>

                            {/* Developer / Admin Info */}
                            <div className="w-full text-left bg-black/30 rounded-lg p-4 font-mono text-xs overflow-auto max-h-48 border border-gray-700/50">
                                <p className="text-red-400 font-bold mb-2">Error Técnico:</p>
                                <p className="mb-2 text-gray-300">
                                    {this.state.error?.toString()}
                                </p>
                                <p className="text-gray-500 whitespace-pre-wrap">
                                    {this.state.errorInfo?.componentStack}
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 p-4 text-center border-t border-gray-700">
                            <p className="text-xs text-gray-500">
                                Si el problema persiste, contacta a soporte con el código: {this.state.error?.name}
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
