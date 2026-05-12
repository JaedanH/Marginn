import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

export default function LandingHeader() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { showToast } = useToast();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isUnlimited = profile && profile.plan === 'trader';
  const showScanCount = profile && ['free', 'drop_in', 'scout'].includes(profile.plan ?? 'free');

  const scanCountColor = (() => {
    if (!profile) return '';
    const n = profile.scans_limit;
    if (n < 5) return 'text-red-600 bg-red-50 border border-red-200';
    if (n <= 10) return 'text-amber-600 bg-amber-50 border border-amber-200';
    return 'text-[#1a3d2b] bg-[#1a3d2b]/8 border border-[#1a3d2b]/20';
  })();

  const userInitial = user?.email?.[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await signOut();
    showToast('Signed out successfully', 'success');
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#1a3d2b' }}>Marginn</h1>
          </Link>

          <div className="flex items-center gap-3">
            {/* Scan counter */}
            {isUnlimited && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-[#1a3d2b] bg-[#1a3d2b]/8 border border-[#1a3d2b]/20 px-3 py-1.5 rounded-full whitespace-nowrap">
                <i className="ri-infinity-line text-sm" />
                Unlimited ∞
              </span>
            )}
            {showScanCount && (
              <Link
                to="/pricing"
                className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${scanCountColor}`}
              >
                <i className="ri-scan-2-line text-sm" />
                {profile!.scans_limit} scans left
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard"
                  className="hidden sm:flex items-center gap-1.5 text-sm font-semibold bg-[#1a3d2b] text-white px-4 py-2 rounded-md hover:bg-[#2d5a40] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-dashboard-line text-sm" />
                  Go to Dashboard
                </Link>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-9 h-9 rounded-full bg-[#1a3d2b] text-white flex items-center justify-center text-sm font-bold hover:bg-[#2d5a40] transition-colors cursor-pointer"
                  >
                    {userInitial}
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-11 bg-white border border-gray-100 rounded-xl shadow-lg py-2 min-w-[200px] z-50">
                      <div className="px-4 py-2 border-b border-gray-100 mb-1">
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        {profile && (
                          <p className="text-xs font-semibold text-[#1a3d2b] mt-0.5 capitalize">
                            {profile.plan} plan
                          </p>
                        )}
                      </div>
                      <Link
                        to="/scan"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-scan-2-line text-gray-400" />
                        </div>
                        Start scanning
                      </Link>
                      <Link
                        to="/history"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-history-line text-gray-400" />
                        </div>
                        Scan history
                      </Link>
                      <Link
                        to="/pricing"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          <i className="ri-bank-card-line text-gray-400" />
                        </div>
                        Billing
                      </Link>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            <i className="ri-logout-box-r-line text-red-500" />
                          </div>
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Link
                  to="/signin"
                  className="border border-[#1a3d2b] text-[#1a3d2b] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1a3d2b]/5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="bg-[#1a3d2b] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#2d5a40] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
