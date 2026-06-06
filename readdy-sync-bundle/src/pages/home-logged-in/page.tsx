import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { resolveAuthUserId } from '@/lib/authUserId';
import Footer from '@/components/feature/Footer';

interface RecentScan {
  id: string;
  brand_name: string;
  image_url: string | null;
  expected_resale_gbp: number | null;
  decision: string | null;
  created_at: string;
}

export default function LoggedInHomePage() {
  const { user, session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);

  const firstName = user?.email?.split('@')[0] ?? 'there';

  useEffect(() => {
    const fetchScans = async () => {
      const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!userId) {
        setRecentScans([]);
        setLoadingScans(false);
        return;
      }
      const { data, error } = await supabase
        .from('scans')
        .select('id, brand_name, image_url, expected_resale_gbp, decision, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(4);
      if (error) console.error('[home-logged-in] scans fetch:', error);
      if (data) setRecentScans(data);
      setLoadingScans(false);
    };
    fetchScans();
    const onSaved = () => void fetchScans();
    window.addEventListener('marginn:scan-saved', onSaved);
    return () => window.removeEventListener('marginn:scan-saved', onSaved);
  }, [user, session?.user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const planLabel = profile?.plan
    ? profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)
    : 'Free';

  const isUnlimited = profile?.plan === 'trader';

  return (
    <div className="min-h-screen bg-[#f9f9f7] font-sans">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="text-lg font-bold text-black tracking-tight">Marginn</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-500 hover:text-black transition-colors cursor-pointer whitespace-nowrap"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12 space-y-12">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-black mb-1">
            Hey, {firstName}
          </h1>
          <p className="text-gray-500 text-sm">
            Welcome back to Marginn. What are you doing today?
          </p>
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Scan CTA — main action */}
          <Link
            to="/dashboard"
            className="group relative bg-[#1a3d2b] rounded-2xl p-8 flex flex-col justify-between min-h-[200px] overflow-hidden cursor-pointer"
          >
            <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-white/5 rounded-full" />
            <div className="absolute -right-2 -bottom-2 w-20 h-20 bg-white/5 rounded-full" />
            <div className="w-12 h-12 flex items-center justify-center bg-white/10 rounded-xl mb-4">
              <i className="ri-scan-2-line text-white text-2xl"></i>
            </div>
            <div>
              <p className="text-white font-bold text-xl mb-1">Scan an Item</p>
              <p className="text-white/60 text-sm">Upload a photo and get instant resale value</p>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 bg-white text-[#1a3d2b] text-sm font-semibold px-4 py-2 rounded-lg w-fit whitespace-nowrap group-hover:bg-gray-100 transition-colors">
              Start scanning
              <i className="ri-arrow-right-line text-sm"></i>
            </div>
          </Link>

          {/* Dashboard CTA */}
          <Link
            to="/dashboard"
            className="group bg-white border border-gray-200 rounded-2xl p-8 flex flex-col justify-between min-h-[200px] cursor-pointer hover:border-gray-300 transition-colors"
          >
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-xl mb-4">
              <i className="ri-layout-grid-line text-gray-700 text-2xl"></i>
            </div>
            <div>
              <p className="text-black font-bold text-xl mb-1">Dashboard</p>
              <p className="text-gray-500 text-sm">View your stats, history and saved items</p>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 bg-black text-white text-sm font-semibold px-4 py-2 rounded-lg w-fit whitespace-nowrap group-hover:bg-gray-800 transition-colors">
              Go to dashboard
              <i className="ri-arrow-right-line text-sm"></i>
            </div>
          </Link>
        </div>

        {/* Quick links row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Scan History', icon: 'ri-history-line', href: '/dashboard/history' },
            { label: 'Saved Items', icon: 'ri-bookmark-line', href: '/dashboard/saved-items' },
            { label: 'Pricing', icon: 'ri-price-tag-3-line', href: '/dashboard/pricing' },
            { label: 'Settings', icon: 'ri-settings-3-line', href: '/dashboard/settings' },
          ].map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="bg-white border border-gray-200 rounded-xl px-4 py-4 flex items-center gap-3 hover:border-gray-300 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                <i className={`${item.icon} text-gray-600 text-base`}></i>
              </div>
              <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Plan status + recent scans */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Plan card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Your Plan</p>
              <span className="text-xs font-bold bg-[#1a3d2b]/10 text-[#1a3d2b] px-2.5 py-1 rounded-full">
                {planLabel}
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-black">
                {isUnlimited ? '∞' : (profile?.scans_limit ?? 0)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isUnlimited ? 'Unlimited scans' : 'scans remaining'}
              </p>
            </div>
            {!isUnlimited && (
              <Link
                to="/dashboard/pricing"
                className="mt-auto text-xs font-semibold text-[#1a3d2b] hover:underline cursor-pointer whitespace-nowrap"
              >
                Upgrade for more scans →
              </Link>
            )}
          </div>

          {/* Recent scans */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Recent Scans</p>
              <Link
                to="/dashboard/history"
                className="text-xs text-gray-400 hover:text-black transition-colors cursor-pointer whitespace-nowrap"
              >
                View all →
              </Link>
            </div>

            {loadingScans ? (
              <div className="flex items-center justify-center h-24 text-gray-300">
                <i className="ri-loader-4-line animate-spin text-2xl"></i>
              </div>
            ) : recentScans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-center">
                <p className="text-sm text-gray-400">No scans yet</p>
                <Link to="/dashboard" className="text-xs text-[#1a3d2b] font-medium mt-1 cursor-pointer whitespace-nowrap">
                  Scan your first item →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {recentScans.map((scan) => (
                  <Link key={scan.id} to="/dashboard/history" className="cursor-pointer group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 mb-2">
                      {scan.image_url ? (
                        <img
                          src={scan.image_url}
                          alt={scan.brand_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <i className="ri-image-line text-gray-300 text-xl"></i>
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-black truncate">{scan.brand_name}</p>
                    <p className="text-xs text-emerald-600 font-medium">
                      £{scan.expected_resale_gbp ?? 0}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mission statement */}
        <div className="border-t border-gray-200 pt-8">
          <p className="text-xs text-gray-400 leading-relaxed max-w-2xl italic">
            Marginn exists to build the infrastructure of the circular economy — connecting people, organisations, and resources to eliminate textile waste and create value at every stage of a garment&apos;s life.
          </p>
        </div>

      </main>
      <Footer />
    </div>
  );
}
