import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';

export default function SignUpPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  /** Honeypot — must stay empty; bots often fill hidden fields. */
  const [honeypotWebsite, setHoneypotWebsite] = useState('');

  const handleReferral = async (newUserId: string) => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    if (!refCode) return;

    // Resolve referrer via SECURITY DEFINER RPC (strict profiles RLS blocks arbitrary SELECT).
    const { data: referrerId, error: rpcErr } = await supabase.rpc('profile_id_for_referral_code', {
      p_code: refCode,
    });

    if (rpcErr || !referrerId || typeof referrerId !== 'string') return;

    // Insert the referral row
    await supabase.from('referrals').insert({
      referrer_user_id: referrerId,
      referred_user_id: newUserId,
      referral_code: refCode,
      status: 'pending',
      date_referred: new Date().toISOString(),
    });
  };

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
    if (!agreed) {
      setError('Please agree to the Terms of Service to continue');
      return;
    }

    if (honeypotWebsite.trim()) {
      showToast('Welcome to Marginn — your 5 free scans are ready');
      navigate('/dashboard');
      return;
    }

    setIsLoading(true);
    const { error: err } = await signUp(email, password);
    setIsLoading(false);

    if (err) {
      if (err.includes('already registered') || err.includes('already exists')) {
        setError('An account with this email already exists. Sign in instead?');
      } else {
        setError(err);
      }
    } else {
      // After signup Supabase auto-signs in the user — grab their id from the session
      const { data: sessionData } = await supabase.auth.getSession();
      const newUserId = sessionData?.session?.user?.id;
      if (newUserId) {
        await handleReferral(newUserId);
      }
      showToast('Welcome to Marginn — your 5 free scans are ready');
      navigate('/dashboard');
    }
  };

  const passwordStrength = () => {
    if (!password) return null;
    if (password.length < 6) return { label: 'Too short', color: 'bg-red-400', width: 'w-1/4' };
    if (password.length < 10) return { label: 'Weak', color: 'bg-amber-400', width: 'w-2/4' };
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { label: 'OK', color: 'bg-yellow-400', width: 'w-3/4' };
    return { label: 'Strong', color: 'bg-[#1a3d2b]', width: 'w-full' };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen bg-[#f9f7f4] flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-gray-900 tracking-tight">
          Marginn
        </Link>
        <Link
          to="/signin"
          className="text-sm text-[#1a3d2b] font-medium hover:underline cursor-pointer"
        >
          Already have an account? Sign in →
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
            <p className="text-gray-500 text-sm">
              Start with <strong className="text-gray-900">5 free scans</strong> — no credit card needed
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="relative space-y-4">
            <div
              className="absolute w-px h-px -left-[9999px] overflow-hidden opacity-0"
              aria-hidden="true"
            >
              <label htmlFor="signup-website">Company</label>
              <input
                id="signup-website"
                name="website"
                type="text"
                value={honeypotWebsite}
                onChange={(e) => setHoneypotWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-md text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
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
              {strength && (
                <div className="mt-2">
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{strength.label}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-md text-sm bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className={showConfirm ? 'ri-eye-off-line' : 'ri-eye-line'} />
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords don&apos;t match</p>
              )}
            </div>

            {/* Terms checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    agreed ? 'bg-[#1a3d2b] border-[#1a3d2b]' : 'border-gray-300 group-hover:border-[#1a3d2b]'
                  }`}
                >
                  {agreed && <i className="ri-check-line text-white text-xs" />}
                </div>
              </div>
              <span className="text-sm text-gray-600">
                I agree to the{' '}
                <Link
                  to="/terms"
                  target="_blank"
                  className="text-[#1a3d2b] font-medium hover:underline"
                >
                  Terms of Service
                </Link>
              </span>
            </label>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-4 py-3">
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-error-warning-line text-red-500 text-sm" />
                </div>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#1a3d2b] hover:bg-[#2d5a40] text-white py-3 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin" />
                  Creating account...
                </span>
              ) : (
                'Create my account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/signin" className="text-[#1a3d2b] font-medium hover:underline cursor-pointer">
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
