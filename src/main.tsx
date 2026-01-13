import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import SponsorPortal from './pages/SponsorPortal'

// Protected Route component with auto-login support
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, autoLogin } = useAuth();
  const [searchParams] = useSearchParams();
  const [isAutoLogging, setIsAutoLogging] = useState(false);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  useEffect(() => {
    const autoLoginToken = searchParams.get('autoLogin');

    if (autoLoginToken && !user && !isAutoLogging && !autoLoginAttempted) {
      setIsAutoLogging(true);
      setAutoLoginAttempted(true);

      autoLogin(autoLoginToken).then((result) => {
        setIsAutoLogging(false);
        if (result.success) {
          // Clear the autoLogin param from URL
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('autoLogin');
          window.history.replaceState({}, '', newUrl.toString());
        }
      });
    }
  }, [searchParams, user, isAutoLogging, autoLoginAttempted, autoLogin]);

  if (isLoading || isAutoLogging) {
    return (
      <div className="min-h-screen bg-gradient-to-br black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <p className="text-white/60">{isAutoLogging ? 'Restoring session...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Public Route - redirects to dashboard if already logged in
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white font-bold text-2xl">B</span>
          </div>
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/sponsor-portal/:token" element={<SponsorPortal />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
