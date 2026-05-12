import { useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface PartnerProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Requires auth and `profiles.role === 'partner'`. Others see a toast and redirect.
 */
export default function PartnerProtectedRoute({ children }: PartnerProtectedRouteProps) {
  const { user, profile, loading, profileLoading } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const toastShown = useRef(false);

  if (loading || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1a3d2b] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  if (!profile) {
    return <Navigate to="/dashboard" replace />;
  }

  if (profile.role !== 'partner') {
    if (!toastShown.current) {
      toastShown.current = true;
      showToast('Partner access only', 'info');
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
