import { RouteObject, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isComingSoonEnabled } from '../lib/comingSoon';
import LandingPage from '../pages/landing/page';
import LoggedInHomePage from '../pages/home-logged-in/page';
import ScanPage from '../pages/scan/page';
import DashboardPage from '../pages/dashboard/page';
import HistoryPage from '../pages/dashboard/history/page';
import DashboardPricingPage from '../pages/dashboard/pricing/page';
import BillingPage from '../pages/dashboard/billing/page';
import SavedItemsPage from '../pages/dashboard/saved-items/page';
import SettingsPage from '../pages/dashboard/settings/page';
import HelpPage from '../pages/dashboard/help/page';
import ReferPage from '../pages/dashboard/refer/page';
import PricingPage from '../pages/pricing/page';
import NotFound from '../pages/NotFound';
import TermsPage from '../pages/terms/page';
import PrivacyPage from '../pages/privacy/page';
import AboutPage from '../pages/about/page';
import StatusPage from '../pages/status/page';
import ContactPage from '../pages/contact/page';
import ImpactPage from '../pages/impact/page';
import SignInPage from '../pages/signin/page';
import SignUpPage from '../pages/signup/page';
import ForgotPasswordPage from '../pages/forgot-password/page';
import ResetPasswordPage from '../pages/reset-password/page';
import ProtectedRoute from '../components/feature/ProtectedRoute';
import PartnerProtectedRoute from '../components/feature/PartnerProtectedRoute';
import WaitlistPage from '../pages/waitlist/page';
import PartnerPage from '../pages/partner/page';
import SharedScanPage from '../pages/share/scan-page';

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <LoggedInHomePage />;
  return <LandingPage />;
}

/**
 * When VITE_PUBLIC_COMING_SOON is true, anonymous users only see `/waitlist` and auth routes
 * (sign-in, sign-up, password flows). Everything else redirects to `/waitlist`. Logged-in users
 * are unaffected. Default (flag off) matches production today.
 */
function ComingSoonGateLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (isComingSoonEnabled() && !user) {
    const allowed = new Set([
      '/waitlist',
      '/signin',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/auth',
    ]);
    const path = location.pathname;
    if (!allowed.has(path) && !path.startsWith('/share/')) {
      return <Navigate to="/waitlist" replace />;
    }
  }

  return <Outlet />;
}

const routes: RouteObject[] = [
  {
    element: <ComingSoonGateLayout />,
    children: [
      { path: '/', element: <HomeRoute /> },

      { path: '/waitlist', element: <WaitlistPage /> },

      // Auth pages
      { path: '/signin', element: <SignInPage /> },
      { path: '/signup', element: <SignUpPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/auth', element: <SignInPage /> },

      // Protected dashboard pages
      {
        path: '/dashboard',
        element: (
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/history',
        element: (
          <ProtectedRoute>
            <HistoryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/history',
        element: (
          <ProtectedRoute>
            <HistoryPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/saved-items',
        element: (
          <ProtectedRoute>
            <SavedItemsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/pricing',
        element: (
          <ProtectedRoute>
            <DashboardPricingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/billing',
        element: (
          <ProtectedRoute>
            <BillingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/settings',
        element: (
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/help',
        element: (
          <ProtectedRoute>
            <HelpPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/refer',
        element: (
          <ProtectedRoute>
            <ReferPage />
          </ProtectedRoute>
        ),
      },

      // Protected scan page
      {
        path: '/scan',
        element: (
          <ProtectedRoute>
            <ScanPage />
          </ProtectedRoute>
        ),
      },

      {
        path: '/partner',
        element: (
          <PartnerProtectedRoute>
            <PartnerPage />
          </PartnerProtectedRoute>
        ),
      },

      // Public pages
      { path: '/pricing', element: <PricingPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '/status', element: <StatusPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/impact', element: <ImpactPage /> },
      { path: '/share/scan/:token', element: <SharedScanPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export default routes;
