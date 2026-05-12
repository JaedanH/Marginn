import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { supabase, edgeFunctionAuthHeaders } from '../../../supabaseClient';
import { supabaseFunctionUrl } from '../../../lib/supabaseFunctions';
import { useNavigate } from 'react-router-dom';

type ScanModeSetting = 'SAFE' | 'STANDARD' | 'AGGRESSIVE';

const MODE_OPTIONS: { value: ScanModeSetting; label: string; desc: string }[] = [
  { value: 'SAFE', label: 'Safe', desc: 'Stricter buy signals' },
  { value: 'STANDARD', label: 'Standard', desc: 'Balanced' },
  { value: 'AGGRESSIVE', label: 'Aggressive', desc: 'More opportunistic' },
];

function normalizeMode(raw: string | undefined | null): ScanModeSetting {
  const u = (raw ?? 'STANDARD').toUpperCase();
  if (u === 'SAFE' || u === 'STANDARD' || u === 'AGGRESSIVE') return u;
  return 'STANDARD';
}

export default function SettingsPage() {
  const { user, profile, updatePassword, refreshProfile, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [defaultMode, setDefaultMode] = useState<ScanModeSetting>('STANDARD');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPassword, setSavingPassword] = useState(false);

  const [notifications, setNotifications] = useState({
    scanComplete: true,
    weeklyDigest: false,
    priceDrop: true,
    marketing: false,
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setDefaultMode(normalizeMode(profile?.default_mode));
  }, [profile?.full_name, profile?.default_mode]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        default_mode: defaultMode,
      })
      .eq('id', user.id);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('Profile saved', 'success');
      await refreshProfile();
    }
    setSavingProfile(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setSavingPassword(true);
    const { error } = await updatePassword(passwordForm.newPassword);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast('Password updated successfully', 'success');
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    }
    setSavingPassword(false);
  };

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    showToast('Notification preference saved', 'success');
  };

  const handleDeleteAccount = async () => {
    setDeleteBusy(true);
    try {
      const res = await fetch(supabaseFunctionUrl('delete-account'), {
        method: 'POST',
        headers: await edgeFunctionAuthHeaders(),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(body.error ?? 'Could not delete account', 'error');
        return;
      }
      await signOut();
      showToast('Account deleted', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-black">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your account preferences</p>
        </div>

        {/* Profile Info */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Profile</h2>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-black rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xl font-bold">
                {user?.email?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div>
              <p className="font-semibold text-black">{user?.email}</p>
              <p className="text-sm text-gray-500 capitalize">
                {profile?.plan ?? 'free'} plan &middot; Member since{' '}
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                  : '—'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-0.5">Current plan</p>
              <p className="text-lg font-bold text-black capitalize">{profile?.plan ?? 'free'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-0.5">Scans remaining</p>
              <p className="text-lg font-bold text-emerald-600">{profile?.scans_limit ?? 0}</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-gray-100 pt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default scan mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDefaultMode(opt.value)}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition-all cursor-pointer ${
                      defaultMode === opt.value
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-black">{opt.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={savingProfile} className="whitespace-nowrap">
              {savingProfile ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </Card>

        {/* Change Password */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="Repeat your new password"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <Button
              type="submit"
              disabled={savingPassword || !passwordForm.newPassword}
              className="whitespace-nowrap"
            >
              {savingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Notifications</h2>
          <div className="space-y-4">
            {[
              { key: 'scanComplete' as const, label: 'Scan complete', desc: 'Get notified when your scan finishes' },
              { key: 'weeklyDigest' as const, label: 'Weekly digest', desc: 'A summary of your activity each week' },
              { key: 'priceDrop' as const, label: 'Price drop alerts', desc: 'When items you\'ve saved drop in price' },
              { key: 'marketing' as const, label: 'Product updates', desc: 'News about new features and improvements' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-black">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
                <button
                  onClick={() => toggleNotification(key)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                    notifications[key] ? 'bg-black' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      notifications[key] ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="p-6 border-red-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Danger Zone</h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-black mb-1">Delete Account</p>
              <p className="text-sm text-gray-500">
                Permanently delete your account, profile, scans, and saved items. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-red-500 hover:text-red-700 font-medium cursor-pointer whitespace-nowrap transition-colors"
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </button>
          </div>
        </Card>
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100">
            <h3 className="text-lg font-bold text-black mb-2">Delete your account?</h3>
            <p className="text-sm text-gray-600 mb-6">
              You will be signed out and your data removed. This uses a secure server action — no passwords stored in the repo.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-black cursor-pointer"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
