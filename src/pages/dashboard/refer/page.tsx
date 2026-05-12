import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../../context/ToastContext';

interface Referral {
  id: string;
  created_at?: string;
  date_referred?: string;
  referred_email: string | null;
  status: string | null;
  reward_granted?: boolean | null;
}

export default function ReferPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const referralCode =
    (profile?.referral_code && profile.referral_code.trim()) ||
    user?.id?.replace(/-/g, '').slice(0, 8).toUpperCase() ||
    'XXXXXXXX';
  const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;

  useEffect(() => {
    if (!user) return;
    fetchReferrals();
  }, [user]);

  const fetchReferrals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) console.error('[referrals] fetch error', error);

    if (data) setReferrals(data as Referral[]);
    setLoading(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      showToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Marginn',
          text: 'I\'ve been using Marginn to find the best resale prices for clothing. Use my link to get started!',
          url: referralLink,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  const completedReferrals = referrals.filter(
    (r) => r.status === 'completed' || Boolean(r.reward_granted)
  );
  const pendingReferrals = referrals.filter((r) => (r.status ?? 'pending') === 'pending');

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-black">Refer a Friend</h1>
          <p className="text-gray-500 mt-1">Share Marginn and earn free scans</p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: '1', icon: 'ri-share-line', title: 'Share your link', desc: 'Send your unique referral link to friends' },
            { step: '2', icon: 'ri-user-add-line', title: 'They sign up', desc: 'Your friend creates a free account' },
            { step: '3', icon: 'ri-gift-line', title: 'You both earn', desc: 'Get 10 bonus scans when they subscribe' },
          ].map(({ step, icon, title, desc }) => (
            <Card key={step} className="p-5 text-center">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center mx-auto mb-3">
                <i className={`${icon} text-white text-base`}></i>
              </div>
              <p className="font-semibold text-black text-sm mb-1">{title}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </Card>
          ))}
        </div>

        {/* Referral Link */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Your Referral Link</h2>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4">
            <i className="ri-link text-gray-400 flex-shrink-0"></i>
            <span className="text-sm text-gray-700 flex-1 truncate font-mono">{referralLink}</span>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleCopy} variant="outline" className="flex-1 whitespace-nowrap">
              <i className={`${copied ? 'ri-check-line' : 'ri-clipboard-line'} mr-2`}></i>
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <Button onClick={handleShare} className="flex-1 whitespace-nowrap">
              <i className="ri-share-forward-line mr-2"></i>
              Share
            </Button>
          </div>
        </Card>

        {/* Your Code */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Referral Code</h2>
          <div className="flex items-center gap-4">
            <div className="bg-black text-white px-6 py-3 rounded-lg font-mono text-xl font-bold tracking-widest">
              {referralCode}
            </div>
            <p className="text-sm text-gray-500">
              Friends can enter this code at signup
            </p>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-black">{referrals.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total referrals</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{completedReferrals.length}</p>
            <p className="text-xs text-gray-500 mt-1">Converted</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-black">{completedReferrals.length * 10}</p>
            <p className="text-xs text-gray-500 mt-1">Scans earned</p>
          </Card>
        </div>

        {/* Referral History */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-black">Referral History</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : referrals.length === 0 ? (
            <div className="p-8 text-center">
              <i className="ri-user-add-line text-gray-300 text-3xl mb-2 block"></i>
              <p className="text-sm text-gray-500">No referrals yet. Share your link to get started!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <i className="ri-user-line text-gray-400 text-sm"></i>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black">
                        {ref.referred_email ?? 'Anonymous'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(ref.created_at ?? ref.date_referred ?? Date.now()).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    ref.reward_granted
                      ? 'bg-emerald-100 text-emerald-700'
                      : (ref.status ?? 'pending') === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {ref.reward_granted ? 'Rewarded' : (ref.status ?? 'pending') === 'pending' ? 'Pending' : ref.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
