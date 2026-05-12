import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const { error: err } = await resetPassword(email);
    setIsLoading(false);
    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4] flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-gray-900 tracking-tight">
          Marginn
        </Link>
        <Link to="/signin" className="text-sm text-[#1a3d2b] font-medium hover:underline cursor-pointer">
          Back to sign in
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-[#1a3d2b]/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i className="ri-mail-check-line text-3xl text-[#1a3d2b]" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Check your email</h1>
              <p className="text-gray-500 text-sm mb-2">
                We&apos;ve sent a reset link to
              </p>
              <p className="font-semibold text-gray-900 mb-6">{email}</p>
              <p className="text-xs text-gray-400 mb-8">
                Didn&apos;t receive it? Check your spam folder, or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-[#1a3d2b] hover:underline cursor-pointer"
                >
                  try again
                </button>
              </p>
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 text-sm text-[#1a3d2b] font-medium hover:underline cursor-pointer"
              >
                <i className="ri-arrow-left-line" /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset your password</h1>
                <p className="text-gray-500 text-sm">
                  Enter your email and we&apos;ll send you a reset link
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                      Sending...
                    </span>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                Remember it?{' '}
                <Link to="/signin" className="text-[#1a3d2b] font-medium hover:underline cursor-pointer">
                  Sign in →
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
