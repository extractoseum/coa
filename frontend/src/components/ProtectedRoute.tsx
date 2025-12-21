import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireSuperAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireSuperAdmin = false }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading, isSuperAdmin } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
        );
    }

    if (!isAuthenticated) {
        // Redirect to login, saving the current location
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requireSuperAdmin && !isSuperAdmin) {
        // User is authenticated but not a super admin
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🚫</span>
                    </div>
                    <h2 className="text-xl font-bold mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 mb-6">
                        Esta seccion requiere permisos de administrador.
                    </p>
                    <button
                        onClick={() => window.history.back()}
                        className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        Volver
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
