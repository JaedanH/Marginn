import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from './components/DashboardLayout';
import ScanPage from '../scan/page';
import Card from '../../components/base/Card';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { Link } from 'react-router-dom';
import { resolveAuthUserId } from '../../lib/authUserId';
import BestFlipCard, { type BestFlipScan } from './components/BestFlipCard';
import MonthlySummaryCard, { type MonthStats } from './components/MonthlySummaryCard';
import BrandBreakdownChart, { type BrandCountRow } from './components/BrandBreakdownChart';

/** kg CO₂ per scan (dashboard metric) */
const CO2_KG_PER_SCAN = 2.1;

interface ScanRecord {
  id: string;
  created_at: string;
  brand_name: string;
  image_url: string | null;
  expected_resale_gbp: number | null;
  decision: string | null;
  profit_gbp: number | null;
}

function startOfLocalMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
}

function aggregateMonth(rows: { created_at: string; profit_gbp: number | null }[]): {
  thisMonth: MonthStats;
  lastMonth: MonthStats;
} {
  const now = new Date();
  const thisStart = startOfLocalMonth(now);
  const lastStart = startOfLocalMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  let thisScans = 0;
  let thisProfit = 0;
  let lastScans = 0;
  let lastProfit = 0;

  for (const r of rows) {
    const t = new Date(r.created_at);
    const profit = Number(r.profit_gbp) || 0;
    if (t >= thisStart) {
      thisScans += 1;
      thisProfit += profit;
    } else if (t >= lastStart && t < thisStart) {
      lastScans += 1;
      lastProfit += profit;
    }
  }

  return {
    thisMonth: {
      scans: thisScans,
      profit: thisProfit,
      co2Kg: Math.round(thisScans * CO2_KG_PER_SCAN * 10) / 10,
    },
    lastMonth: {
      scans: lastScans,
      profit: lastProfit,
      co2Kg: Math.round(lastScans * CO2_KG_PER_SCAN * 10) / 10,
    },
  };
}

function pickBestFlip(
  rows: { id: string; brand_name: string; image_url: string | null; roi: number | null; created_at: string }[]
): BestFlipScan | null {
  const valid = rows.filter((r) => r.roi != null && !Number.isNaN(Number(r.roi)));
  if (!valid.length) return null;
  const maxRoi = Math.max(...valid.map((r) => Number(r.roi)));
  const ties = valid.filter((r) => Number(r.roi) === maxRoi);
  ties.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const top = ties[0];
  return {
    id: top.id,
    brand_name: top.brand_name,
    image_url: top.image_url,
    roi: Number(top.roi),
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    scansRemaining: 0,
    totalProfit: 0,
    co2Saved: 0,
  });
  const [recentScans, setRecentScans] = useState<ScanRecord[]>([]);
  const [bestFlip, setBestFlip] = useState<BestFlipScan | null>(null);
  const [monthly, setMonthly] = useState<{ thisMonth: MonthStats; lastMonth: MonthStats }>(() => ({
    thisMonth: { scans: 0, profit: 0, co2Kg: 0 },
    lastMonth: { scans: 0, profit: 0, co2Kg: 0 },
  }));
  const [brandRows, setBrandRows] = useState<BrandCountRow[]>([]);
  const { user, session, profile } = useAuth();

  const lastMonthStartIso = useMemo(() => {
    const now = new Date();
    const lastStart = startOfLocalMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    return lastStart.toISOString();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchDashboardData = async () => {
      const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
      const scansRemaining = profile?.scans_limit ?? 0;

      if (!userId) {
        if (!cancelled) {
          setRecentScans([]);
          setBestFlip(null);
          setMonthly({
            thisMonth: { scans: 0, profit: 0, co2Kg: 0 },
            lastMonth: { scans: 0, profit: 0, co2Kg: 0 },
          });
          setBrandRows([]);
          setStats({ scansRemaining, totalProfit: 0, co2Saved: 0 });
        }
        return;
      }

      const [
        recentRes,
        countRes,
        profitsRes,
        roiRes,
        monthRes,
        brandRes,
      ] = await Promise.all([
        supabase
          .from('scans')
          .select('id, created_at, brand_name, image_url, expected_resale_gbp, decision, profit_gbp')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('scans').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('scans').select('profit_gbp').eq('user_id', userId).limit(5000),
        supabase
          .from('scans')
          .select('id, brand_name, image_url, roi, created_at')
          .eq('user_id', userId)
          .not('roi', 'is', null)
          .order('roi', { ascending: false })
          .limit(50),
        supabase
          .from('scans')
          .select('created_at, profit_gbp')
          .eq('user_id', userId)
          .gte('created_at', lastMonthStartIso)
          .limit(5000),
        supabase.from('scans').select('brand_name').eq('user_id', userId).limit(5000),
      ]);

      if (cancelled) return;

      if (recentRes.data) setRecentScans(recentRes.data);

      const scanCount = countRes.count ?? 0;
      const totalProfit =
        profitsRes.data?.reduce((sum, row) => sum + (Number(row.profit_gbp) || 0), 0) ?? 0;
      const co2Saved = Math.round(scanCount * CO2_KG_PER_SCAN * 10) / 10;

      setStats({ scansRemaining, totalProfit, co2Saved });

      setBestFlip(pickBestFlip(roiRes.data ?? []));

      setMonthly(
        aggregateMonth((monthRes.data as { created_at: string; profit_gbp: number | null }[]) ?? [])
      );

      const counts = new Map<string, number>();
      for (const row of brandRes.data ?? []) {
        const b = String((row as { brand_name?: string }).brand_name ?? '').trim() || 'Unknown';
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      const sorted: BrandCountRow[] = [...counts.entries()]
        .map(([brand, count]) => ({ brand, count }))
        .sort((a, b) => b.count - a.count);
      setBrandRows(sorted);
    };

    fetchDashboardData();
    return () => {
      cancelled = true;
    };
  }, [user, session?.user?.id, profile, lastMonthStartIso]);

  useEffect(() => {
    let cancelled = false;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
        if (!userId || cancelled) return;
        const recentRes = await supabase
          .from('scans')
          .select('id, created_at, brand_name, image_url, expected_resale_gbp, decision, profit_gbp')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!cancelled && recentRes.data) setRecentScans(recentRes.data);
      })();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, session?.user?.id]);

  return (
    <DashboardLayout>
      <div className="space-y-10">
        <BestFlipCard scan={bestFlip} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MonthlySummaryCard thisMonth={monthly.thisMonth} lastMonth={monthly.lastMonth} />
          <BrandBreakdownChart rows={brandRows} topN={8} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Scans Remaining</p>
                <p className="text-3xl font-bold text-black">{stats.scansRemaining}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <i className="ri-scan-2-line text-emerald-600 text-xl"></i>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total Profit Tracked</p>
                <p className="text-3xl font-bold text-emerald-600">£{stats.totalProfit}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <i className="ri-money-pound-circle-line text-green-600 text-xl"></i>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">CO₂ Saved</p>
                <p className="text-3xl font-bold text-teal-600">{stats.co2Saved}kg</p>
                <p className="text-xs text-gray-400 mt-1">Scans × {CO2_KG_PER_SCAN} kg</p>
              </div>
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                <i className="ri-leaf-line text-teal-600 text-xl"></i>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Scans */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-black">Recent Scans</h2>
            <Link to="/dashboard/history" className="text-sm text-gray-500 hover:text-black transition-colors cursor-pointer">
              View all →
            </Link>
          </div>
          {recentScans.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              No scans yet. Start scanning items to see them here.
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {recentScans.map((scan) => (
                <Link key={scan.id} to="/dashboard/history">
                  <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer">
                    {scan.image_url ? (
                      <img
                        src={scan.image_url}
                        alt={scan.brand_name}
                        className="w-full aspect-square object-cover rounded-lg mb-3"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                        <i className="ri-image-line text-gray-300 text-2xl"></i>
                      </div>
                    )}
                    <p className="font-medium text-black text-sm truncate">{scan.brand_name}</p>
                    <p className="text-emerald-600 text-sm font-semibold">£{scan.expected_resale_gbp || 0}</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* New Scan */}
        <div>
          <h2 className="text-xl font-bold text-black mb-4">New Scan</h2>
          <ScanPage embedded={true} />
        </div>
      </div>
    </DashboardLayout>
  );
}
