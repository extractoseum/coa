```typescript
import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Info, Brain, Terminal } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
// Lazy load heavy pages
const COADetails = lazy(() => import('./pages/COADetails'));
const COAPreview = lazy(() => import('./pages/COAPreview'));
const QRPreview = lazy(() => import('./pages/QRPreview'));
const UploadCOA = lazy(() => import('./pages/UploadCOA'));
const HologramInventory = lazy(() => import('./pages/HologramInventory'));
const BadgeManagement = lazy(() => import('./pages/BadgeManagement'));
const BannerManagement = lazy(() => import('./pages/BannerManagement'));
const SettingsManagement = lazy(() => import('./pages/SettingsManagement'));
const TemplateManagement = lazy(() => import('./pages/TemplateManagement'));
const ChemistManagement = lazy(() => import('./pages/ChemistManagement'));
const COAAdminPanel = lazy(() => import('./pages/COAAdminPanel'));
const PushNotificationPanel = lazy(() => import('./pages/PushNotificationPanel'));
const NavigationManagement = lazy(() => import('./pages/NavigationManagement'));
const AdminAIKnowledge = lazy(() => import('./pages/AdminAIKnowledge'));
const AdminTelemetry = lazy(() => import('./pages/AdminTelemetry')); // Telemetry Dashboard
const AdminCRM = lazy(() => import('./pages/AdminCRM'));
const FoldersView = lazy(() => import('./pages/FoldersView'));
const PublicFolderView = lazy(() => import('./pages/PublicFolderView'));
const MyCollection = lazy(() => import('./pages/MyCollection'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const VerifyMember = lazy(() => import('./pages/VerifyMember'));

import Login from './pages/Login';
import ShopifyCallback from './pages/ShopifyCallback';
import ClientDashboard from './pages/ClientDashboard';
import VerifyCVV from './pages/VerifyCVV';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import AdminSidekick from './components/AdminSidekick';
import FloatingDock from './components/FloatingDock';
import { requestPermission } from './services/onesignalService';


function Home() {
  const navigate = useNavigate();
  const { theme, themeMode } = useTheme();
  const { isSuperAdmin, isAuthenticated } = useAuth();
  const [logoSvg, setLogoSvg] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Load active template logo
  useEffect(() => {
    fetch('/api/v1/templates')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.templates) {
          const activeTemplate = data.templates.find((t: any) => t.is_active);
          if (activeTemplate?.company_logo_url) {
            const url = activeTemplate.company_logo_url;
            setLogoUrl(url);

            // If SVG, fetch and inline it for color manipulation
            if (url.toLowerCase().endsWith('.svg')) {
              fetch(url)
                .then(r => r.text())
                .then(svgText => setLogoSvg(svgText))
                .catch(() => setLogoSvg(null));
            }
          }
        }
      })
      .catch(err => console.error('Load template error:', err));
  }, []);

  // Get fill color based on theme
  const getLogoColor = () => {
    switch (themeMode) {
      case 'tokyo':
        return '#00f5d4'; // Cyan neon
      case 'neon':
        return '#ec4899'; // Pink neon
      case 'dark':
        return '#ffffff'; // White
      case 'light':
      default:
        return '#000000'; // Black (original)
    }
  };

  // Process SVG to apply theme color (only to dark elements, preserve images like flags)
  const getThemedSvg = () => {
    if (!logoSvg) return null;
    const color = getLogoColor();

    // 1. Basic Sanitization: Remove scripts and event handlers
    let processed = logoSvg
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
      .replace(/\bon\w+="[^"]*"/gim, "")
      .replace(/javascript:/gi, "");

    // 2. Theme Application
    // Replace the specific EUM logo color
    processed = processed
      .replace(/fill:\s*#221914/gi, `fill: ${ color } `)
      .replace(/fill="#221914"/gi, `fill = "${color}"`)
      // Replace black fills
      .replace(/fill="#000000"/gi, `fill = "${color}"`)
      .replace(/fill="#000"/gi, `fill = "${color}"`)
      .replace(/fill="black"/gi, `fill = "${color}"`);

    // Also update the <style> block if present
    processed = processed.replace(
      /\.st0\s*\{\s*fill:\s*#221914;\s*\}/gi,
      `.st0 { fill: ${ color }; } `
    );

    return processed;
  };

  const adminItems = [
    { label: 'Administrar COAs', icon: <FileText size={20} />, path: ROUTES.adminCoas, color: '#10b981' },
    { label: 'Subir COA', icon: <Upload size={20} />, path: ROUTES.upload, color: '#10b981' },
    { label: 'Hologramas', icon: <Box size={20} />, path: ROUTES.inventory, color: '#3b82f6' },
    { label: 'Badges', icon: <Award size={20} />, path: ROUTES.badges, color: '#8b5cf6' },
    { label: 'Banners', icon: <Image size={20} />, path: ROUTES.banners, color: '#f97316' },
    { label: 'Templates', icon: <FileCode size={20} />, path: ROUTES.templates, color: '#6366f1' },
    { label: 'Quimicos', icon: <Award size={20} />, path: ROUTES.chemists, color: '#f59e0b' },
    { label: 'Push Notif.', icon: <Bell size={20} />, path: ROUTES.adminPush, color: '#ec4899' },
    { label: 'Navegación', icon: <LayoutDashboard size={20} />, path: ROUTES.adminNavigation, color: '#8b5cf6' },
    { label: 'Cerebro AI', icon: <Brain size={20} />, path: ROUTES.adminKnowledge, color: '#ec4899' },
    { label: 'Omni CRM', icon: <LayoutDashboard size={20} />, path: ROUTES.adminCrm, color: '#f472b6' },
    { label: 'Telemetry', icon: <Terminal size={20} />, path: ROUTES.adminTelemetry, color: '#3b82f6' },
    { label: 'Configuracion', icon: <Settings size={20} />, path: ROUTES.settings, color: '#6b7280' },
  ];

  const userItems = [
    { label: 'Mi Dashboard', icon: <FolderOpen size={20} />, path: ROUTES.dashboard, color: '#10b981' },
    { label: 'Mis Pedidos', icon: <Package size={20} />, path: ROUTES.myOrders, color: '#3b82f6' },
    { label: 'Mi Coleccion', icon: <Heart size={20} />, path: ROUTES.myCollection, color: '#ef4444' },
    { label: 'Ver Demo COA', icon: <ShieldCheck size={20} />, path: to.coa('demo'), color: '#10b981' },
  ];

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-screen p-4 pb-24">
        <div
          className="max-w-md w-full rounded-2xl shadow-xl overflow-hidden"
          style={{
            backgroundColor: theme.cardBg,
            border: `1px solid ${ theme.border } `,
          }}
        >
          {/* Header with Company Logo */}
          <div
            className="p-6 text-center"
            style={{ backgroundColor: theme.cardBg2 }}
          >
            {logoSvg ? (
              <div
                className="mx-auto h-20 mb-4 transition-all duration-300 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: getThemedSvg() || '' }}
                style={{ maxWidth: '280px' }}
              />
            ) : logoUrl ? (
              <img
                src={logoUrl}
                alt="Company Logo"
                className="mx-auto h-20 object-contain mb-4 transition-all duration-300"
              />
            ) : (
              <div className="mx-auto bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm" style={{ backgroundColor: theme.accent }}>
                <Leaf className="w-8 h-8 text-white" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-wide" style={{ color: theme.text }}>EUM Viewer 2.0</h1>
            <p className="text-sm mt-1" style={{ color: theme.textMuted }}>Calidad Certificada & IA-Verified</p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold" style={{ color: theme.text }}>
                Sistema de Certificados
              </h2>
              <p className="text-sm" style={{ color: theme.textMuted }}>
                Verifica la autenticidad de tus productos
              </p>
            </div>

            {/* User Options */}
            <div className="space-y-2">
              {userItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  data-testid={`nav.user.${ item.label.toLowerCase().replace(/\s/g, '_') } `}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: theme.cardBg2,
                    border: `1px solid ${ theme.border } `,
                    color: theme.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = item.color;
                    e.currentTarget.style.backgroundColor = `${ item.color } 15`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = theme.border;
                    e.currentTarget.style.backgroundColor = theme.cardBg2;
                  }}
                >
                  <span style={{ color: item.color }}>{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* Admin Options */}
            {isSuperAdmin && (
              <>
                <div
                  className="h-px my-4"
                  style={{ backgroundColor: theme.border }}
                />
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textMuted }}
                >
                  Administracion
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {adminItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      data-testid={`nav.admin.${ item.label.toLowerCase().replace(/\s/g, '_') } `}
                      className="flex flex-col items-center gap-2 px-3 py-4 rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.cardBg2,
                        border: `1px solid ${ theme.border } `,
                        color: theme.text,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = item.color;
                        e.currentTarget.style.backgroundColor = `${ item.color } 15`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = theme.border;
                        e.currentTarget.style.backgroundColor = theme.cardBg2;
                      }}
                    >
                      <span style={{ color: item.color }}>{item.icon}</span>
                      <span className="text-xs font-medium text-center">{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Login prompt for non-authenticated users */}
            {!isAuthenticated && (
              <>
                <div
                  className="h-px my-4"
                  style={{ backgroundColor: theme.border }}
                />
                <button
                  onClick={() => navigate(ROUTES.login)}
                  data-testid="home.login"
                  className="w-full py-3 rounded-xl font-medium transition-all duration-200"
                  style={{
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.accentHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.accent;
                  }}
                >
                  Iniciar Sesion
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

import { ROUTES, to } from './routes';
import { BuildStamp } from './components/BuildStamp';
import { Terminal } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { Screen } from './telemetry/Screen';
import QAOverlay from './telemetry/QAOverlay';

// ... (keep Home component imports and logic the same, explicitly ensuring we don't break it)

import { ThemeSwitcher } from './components/ThemeSwitcher';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ThemeSwitcher />
          <Screen id="app.root">
            <Suspense fallback={
              <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            }>
              <Routes>
                <Route path={ROUTES.home} element={<Home />} />
                <Route path={ROUTES.login} element={<Login />} />
                <Route path={ROUTES.shopifyCallback} element={<ShopifyCallback />} />
                <Route path={ROUTES.dashboard} element={
                  <ProtectedRoute>
                    <Screen id="screen.dashboard">
                      <ClientDashboard />
                    </Screen>
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.coaDetails} element={<COADetails />} />
                <Route path={ROUTES.coaDetailsApp} element={<COADetails />} />
                <Route path={ROUTES.qrPreview} element={<QRPreview />} />
                <Route path={ROUTES.coaPreview} element={<COAPreview />} />
                <Route path={ROUTES.upload} element={
                  <ProtectedRoute requireSuperAdmin>
                    <UploadCOA />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.verifyCVV} element={<VerifyCVV />} />
                <Route path={ROUTES.inventory} element={
                  <ProtectedRoute requireSuperAdmin>
                    <HologramInventory />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.badges} element={
                  <ProtectedRoute requireSuperAdmin>
                    <BadgeManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.banners} element={
                  <ProtectedRoute requireSuperAdmin>
                    <BannerManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.settings} element={
                  <ProtectedRoute requireSuperAdmin>
                    <SettingsManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.templates} element={
                  <ProtectedRoute requireSuperAdmin>
                    <TemplateManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.chemists} element={
                  <ProtectedRoute requireSuperAdmin>
                    <ChemistManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminCoas} element={
                  <ProtectedRoute requireSuperAdmin>
                    <COAAdminPanel />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminPush} element={
                  <ProtectedRoute requireSuperAdmin>
                    <PushNotificationPanel />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminNavigation} element={
                  <ProtectedRoute requireSuperAdmin>
                    <NavigationManagement />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminKnowledge} element={
                  <ProtectedRoute requireSuperAdmin>
                    <AdminAIKnowledge />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminTelemetry} element={
                  <ProtectedRoute requireSuperAdmin>
                    <AdminTelemetry />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.adminCrm} element={
                  <ProtectedRoute requireSuperAdmin>
                    <Screen id="screen.admin.crm">
                      <AdminCRM />
                    </Screen>
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.folders} element={
                  <ProtectedRoute>
                    <FoldersView />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.publicFolder} element={<PublicFolderView />} />
                <Route path={ROUTES.myCollection} element={
                  <ProtectedRoute>
                    <MyCollection />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.myOrders} element={
                  <ProtectedRoute>
                    <MyOrders />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.myOrdersLegacy} element={
                  <ProtectedRoute>
                    <MyOrders />
                  </ProtectedRoute>
                } />
                <Route path={ROUTES.verifyMember} element={<VerifyMember />} />
              </Routes>

              <BuildStamp />
            </Suspense>

            <FloatingDock initialBottom={80} initialRight={24}>
              <AdminSidekick />
            </FloatingDock>
            <QAOverlay />
          </Screen>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
