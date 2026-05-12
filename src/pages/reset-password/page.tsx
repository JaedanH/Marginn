import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword, isRecoveryMode, loading } = useAuth();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash — exchange it for a session
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setSessionReady(true);
        else setSessionReady(false);
      });
    } else if (!loading) {
      // If no hash, check if we already have a recovery session
      setSessionReady(isRecoveryMode);
    }
  }, [isRecoveryMode, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error: err } = await updatePassword(password);
    setIsLoading(false);

    if (err) {
      setError(err);
    } else {
      showToast('Password updated — please sign in', 'success');
      navigate('/signin');
    }
  };

  // Show loading while auth is initialising
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f7f4] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1a3d2b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No valid recovery session — link may be expired or already used
  if (!sessionReady && !isRecoveryMode) {
    return (
      <div className="min-h-screen bg-[#f9f7f4] flex flex-col">
        <nav className="px-6 py-4">
          <Link to="/" className="text-xl font-bold text-gray-900 tracking-tight">
            Marginn
          </Link>
        </nav>
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-[400px] text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <i className="ri-link-unlink-m text-3xl text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Link expired or invalid</h1>
            <p className="text-gray-500 text-sm mb-6">
              This password reset link has expired or already been used. Request a new one below.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block w-full bg-[#1a3d2b] hover:bg-[#2d5a40] text-white py-3 rounded-md text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              Request new reset link
            </Link>
            <p className="mt-4 text-sm text-gray-500">
              Remember it?{' '}
              <Link to="/signin" className="text-[#1a3d2b] font-medium hover:underline cursor-pointer">
                Sign in →
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f7f4] flex flex-col">
      <nav className="px-6 py-4">
        <Link to="/" className="text-xl font-bold text-gray-900 tracking-tight">
          Marginn
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Set new password</h1>
            <p className="text-gray-500 text-sm">Choose a strong password for your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-md text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-md text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-3">
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  <i className="ri-error-warning-line text-red-500 text-sm" />
                </div>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#1a3d2b] hover:bg-[#2d5a40] text-white py-3 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin" />
                  Updating...
                </span>
              ) : (
                'Update password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
