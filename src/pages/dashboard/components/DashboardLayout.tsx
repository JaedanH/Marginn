import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import DashboardOnboardingOverlay from './DashboardOnboardingOverlay';

interface DashboardLayoutProps {
  children: ReactNode;
  /** Charity shop portal: different sidebar links */
  variant?: 'default' | 'partner';
}

export default function DashboardLayout({ children, variant = 'default' }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const partnerScanHref =
    profile?.partner_shop_id != null && String(profile.partner_shop_id).trim()
      ? `/scan?shop=${encodeURIComponent(String(profile.partner_shop_id).trim())}`
      : '/scan';

  const mainNavDefault = [
    { name: 'New Scan', href: '/dashboard', icon: 'ri-camera-line' },
    { name: 'History', href: '/dashboard/history', icon: 'ri-history-line' },
    { name: 'Saved Items', href: '/dashboard/saved-items', icon: 'ri-bookmark-line' },
    { name: 'Pricing', href: '/dashboard/pricing', icon: 'ri-price-tag-3-line' },
    { name: 'Billing', href: '/dashboard/billing', icon: 'ri-bank-card-line' },
  ];

  const mainNavPartner = [
    { name: 'Shop overview', href: '/partner', icon: 'ri-store-2-line' },
    { name: 'Scan for shop', href: partnerScanHref, icon: 'ri-camera-line' },
    { name: 'History', href: '/dashboard/history', icon: 'ri-history-line' },
  ];

  const mainNav = variant === 'partner' ? mainNavPartner : mainNavDefault;

  const bottomNavDefault = [
    { name: 'Profile & Settings', href: '/dashboard/settings', icon: 'ri-user-settings-line' },
    { name: 'Help', href: '/dashboard/help', icon: 'ri-question-line' },
    { name: 'Refer a Friend', href: '/dashboard/refer', icon: 'ri-gift-line' },
  ];

  const bottomNavPartner = [
    { name: 'Personal dashboard', href: '/dashboard', icon: 'ri-dashboard-line' },
    { name: 'Profile & Settings', href: '/dashboard/settings', icon: 'ri-user-settings-line' },
    { name: 'Help', href: '/dashboard/help', icon: 'ri-question-line' },
  ];

  const bottomNav = variant === 'partner' ? bottomNavPartner : bottomNavDefault;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const userInitial = user?.email?.[0]?.toUpperCase() ?? '?';

  const isActive = (href: string) => {
    if (href === '/dashboard') return location.pathname === '/dashboard';
    if (href === '/partner' || href.startsWith('/partner')) return location.pathname.startsWith('/partner');
    if (href.startsWith('/scan')) return location.pathname.startsWith('/scan');
    return location.pathname.startsWith(href.split('?')[0]);
  };

  const NavLink = ({ item }: { item: { name: string; href: string; icon: string } }) => (
    <Link
      to={item.href}
      onClick={() => setSidebarOpen(false)}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
        isActive(item.href)
          ? 'bg-black text-white'
          : 'text-gray-600 hover:text-black hover:bg-gray-100'
      }`}
    >
      <div className="w-5 h-5 flex items-center justify-center">
        <i className={`${item.icon} text-base`}></i>
      </div>
      {item.name}
    </Link>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Link to={variant === 'partner' ? '/partner' : '/dashboard'} className="flex items-center">
            <span className="text-xl font-bold text-black tracking-tight">Marginn</span>
            {variant === 'partner' && (
              <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Partner
              </span>
            )}
          </Link>
          <Link
            to="/"
            title="Back to Home"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-home-4-line text-base"></i>
          </Link>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {mainNav.map((item) => (
          <NavLink key={item.href + item.name} item={item} />
        ))}

        {/* Divider */}
        <div className="my-3 border-t border-gray-100" />

        {bottomNav.map((item) => (
          <NavLink key={item.href + item.name} item={item} />
        ))}
      </nav>

      {/* User Footer */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">{userInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-black truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-black transition-colors cursor-pointer rounded-md hover:bg-gray-100"
          >
            <i className="ri-logout-box-r-line text-sm"></i>
          </button>
        </div>

      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <DashboardOnboardingOverlay />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-gray-200 fixed top-0 left-0 h-full z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex flex-col w-56 bg-white h-full z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Mobile Top Bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer"
          >
            <i className="ri-menu-line text-xl"></i>
          </button>
          <span className="text-lg font-bold text-black">Marginn</span>
          <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">{userInitial}</span>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
