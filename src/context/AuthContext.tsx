import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import {
  AUTH_ALLOWLIST_REJECT_MESSAGE,
  isAuthAllowlistActive,
  isEmailAllowlisted,
} from '../lib/authAllowlist';

export interface UserProfile {
  id: string;
  email: string;
  scans_limit: number;        // DB: scans_limit  (was: scans_remaining)
  plan: string;               // DB: plan          (was: plan_type)
  scans_used_this_month: number; // DB: scans_used_this_month (was: total_scans_used)
  created_at: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  referral_code?: string;
  full_name?: string;
  /** When false, dashboard shows first-time onboarding until completed or skipped. */
  onboarding_completed?: boolean;
  /** Next UTC calendar date when free/scout monthly scan counters reset */
  scans_reset_date?: string;
  default_mode?: string;
  token_balance?: number;
  /** `user` (default) or `partner` — charity shop portal */
  role?: string;
  /** Linked `partner_shops.id` when role is partner */
  partner_shop_id?: string | null;
}

const PLAN_MONTHLY_SCAN_QUOTA: Record<string, number> = {
  free: 5,
  scout: 75,
};

function firstOfNextUtcMonthIso(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** When past scans_reset_date, zero usage and restore monthly quota (free / scout only). */
async function maybeResetMonthlyScans(
  userId: string,
  profile: UserProfile
): Promise<UserProfile> {
  const plan = profile.plan ?? 'free';
  if (plan === 'trader' || plan === 'pro' || plan === 'drop_in') return profile;

  const quota = PLAN_MONTHLY_SCAN_QUOTA[plan];
  if (quota === undefined) return profile;

  const resetStr = profile.scans_reset_date;
  if (!resetStr) return profile;

  const today = utcDateOnly(new Date());
  const resetDay = utcDateOnly(new Date(`${resetStr}T00:00:00Z`));
  if (today < resetDay) return profile;

  let next = new Date(resetDay);
  while (utcDateOnly(next) <= today) {
    next = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1));
  }
  const nextIso = next.toISOString().slice(0, 10);

  const { error } = await supabase
    .from('profiles')
    .update({
      scans_used_this_month: 0,
      scans_limit: quota,
      scans_reset_date: nextIso,
    })
    .eq('id', userId);

  if (error) {
    console.error('[maybeResetMonthlyScans] update failed', error);
    return profile;
  }

  return {
    ...profile,
    scans_used_this_month: 0,
    scans_limit: quota,
    scans_reset_date: nextIso,
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  /** True while the first profile fetch for the current session is in flight */
  profileLoading: boolean;
  loading: boolean;
  isRecoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  decrementScan: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!data) {
        setProfile(null);
        return;
      }
      let row = data as UserProfile;
      row = await maybeResetMonthlyScans(userId, row);
      setProfile(row);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error && (error.message.includes('Refresh Token') || error.message.includes('refresh_token'))) {
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (session?.user?.email && isAuthAllowlistActive() && !isEmailAllowlisted(session.user.email)) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (session?.user?.email && isAuthAllowlistActive() && !isEmailAllowlisted(session.user.email)) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && isRecoveryMode) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsRecoveryMode(false);
      }
      setLoading(false);
    });

    const handleAuthError = (event: PromiseRejectionEvent) => {
      const msg = event?.reason?.message ?? '';
      if (msg.includes('Refresh Token') || msg.includes('refresh_token')) {
        event.preventDefault();
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
      }
    };
    window.addEventListener('unhandledrejection', handleAuthError);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('unhandledrejection', handleAuthError);
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    if (isAuthAllowlistActive() && !isEmailAllowlisted(email)) {
      return { error: AUTH_ALLOWLIST_REJECT_MESSAGE };
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore cleanup errors
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user?.email && isAuthAllowlistActive() && !isEmailAllowlisted(data.user.email)) {
      await supabase.auth.signOut();
      return { error: AUTH_ALLOWLIST_REJECT_MESSAGE };
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    if (isAuthAllowlistActive() && !isEmailAllowlisted(email)) {
      return { error: AUTH_ALLOWLIST_REJECT_MESSAGE };
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(fullName?.trim() ? { options: { data: { full_name: fullName.trim() } } } : {}),
    });
    if (error) return { error: error.message };

    if (data.user) {
      const referralCode = data.user.id.replace(/-/g, '').slice(0, 8).toUpperCase();
      const upsertPayload = {
        id: data.user.id,
        email,
        full_name: fullName?.trim() || null,
        scans_limit: 5,
        plan: 'free',
        scans_used_this_month: 0,
        referral_code: referralCode,
        scans_reset_date: firstOfNextUtcMonthIso(),
      };
      const { error: upsertError } = await supabase.from('profiles').upsert(upsertPayload);
      if (upsertError) {
        console.error('[profiles UPSERT] FAILED', {
          code: upsertError.code,
          message: upsertError.message,
          details: upsertError.details,
          hint: upsertError.hint,
          payload: upsertPayload,
        });
      }
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileLoading(false);
    setIsRecoveryMode(false);
  };

  const resetPassword = async (email: string) => {
    if (isAuthAllowlistActive() && !isEmailAllowlisted(email)) {
      return { error: AUTH_ALLOWLIST_REJECT_MESSAGE };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setIsRecoveryMode(false);
    return { error: error?.message ?? null };
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const decrementScan = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = user?.id ?? sessionData.session?.user?.id;
    if (!userId) return;

    // Always fetch a fresh profile from DB before decrementing
    // to guarantee we have real, non-null values for scans_limit and scans_used_this_month
    // build-bump: 2026-04-19
    const { data: freshProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, plan, scans_limit, scans_used_this_month')
      .eq('id', userId)
      .maybeSingle();

    if (fetchError || !freshProfile) {
      console.error('[decrementScan] Could not fetch fresh profile', fetchError);
      return;
    }

    // Unlimited plans — skip decrement (matches billing / Stripe success payloads)
    if (freshProfile.plan === 'trader' || freshProfile.plan === 'pro') return;

    const newLimit = Math.max(0, (freshProfile.scans_limit ?? 0) - 1);
    const newUsed = (freshProfile.scans_used_this_month ?? 0) + 1;

    const updatePayload = {
      scans_limit: newLimit,
      scans_used_this_month: newUsed,
    };

    console.log('[decrementScan] Sending PATCH', { userId, updatePayload });

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) {
      console.error('[decrementScan] PATCH FAILED', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        userId,
        updatePayload,
      });
    } else {
      setProfile((p) =>
        p ? { ...p, scans_limit: newLimit, scans_used_this_month: newUsed } : p
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        profileLoading,
        loading,
        isRecoveryMode,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        refreshProfile,
        decrementScan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
