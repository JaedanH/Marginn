import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../dashboard/components/DashboardLayout';
import Card from '../../components/base/Card';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

const CO2_KG_PER_SCAN = 2.1;

interface ShopScanRow {
  id: string;
  created_at: string;
  brand_name: string;
  image_url: string | null;
  expected_resale_gbp: number | null;
  decision: string | null;
}

export default function PartnerPage() {
  const { profile } = useAuth();
  const shopId = profile?.partner_shop_id ?? null;
  const [shopName, setShopName] = useState<string | null>(null);
  const [stats, setStats] = useState({
    scanCount: 0,
    gmvUnlocked: 0,
    co2Kg: 0,
  });
  const [recent, setRecent] = useState<ShopScanRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!shopId) {
        if (!cancelled) {
          setShopName(null);
          setStats({ scanCount: 0, gmvUnlocked: 0, co2Kg: 0 });
          setRecent([]);
        }
        return;
      }

      const shopRes = await supabase
        .from('partner_shops')
        .select('name')
        .eq('id', shopId)
        .maybeSingle();

      const [countRes, sumRes, recentRes] = await Promise.all([
        supabase.from('scans').select('*', { count: 'exact', head: true }).eq('partner_shop_id', shopId),
        supabase.from('scans').select('expected_resale_gbp').eq('partner_shop_id', shopId).limit(5000),
        supabase
          .from('scans')
          .select('id, created_at, brand_name, image_url, expected_resale_gbp, decision')
          .eq('partner_shop_id', shopId)
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      if (cancelled) return;

      if (shopRes.data?.name) setShopName(String(shopRes.data.name));
      else setShopName('Your shop');

      const scanCount = countRes.count ?? 0;
      const gmvUnlocked =
        sumRes.data?.reduce((s, r) => s + (Number(r.expected_resale_gbp) || 0), 0) ?? 0;
      const co2Kg = Math.round(scanCount * CO2_KG_PER_SCAN * 10) / 10;

      setStats({ scanCount, gmvUnlocked, co2Kg });
      if (recentRes.data) setRecent(recentRes.data as ShopScanRow[]);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const scanHref = shopId ? `/scan?shop=${encodeURIComponent(shopId)}` : '/scan';

  return (
    <DashboardLayout variant="partner">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">Charity shop portal</h1>
          <p className="text-gray-600 mt-1 text-sm">
            {shopName ? (
              <>
                Metrics for <span className="font-medium text-black">{shopName}</span>.
              </>
            ) : (
              'Your account is not linked to a shop yet — ask support to attach a partner shop.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Total items scanned</p>
                <p className="text-3xl font-bold text-black">{stats.scanCount}</p>
                <p className="text-xs text-gray-400 mt-1">Scans attributed to this shop</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <i className="ri-scan-2-line text-emerald-600 text-xl" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">GMV-style unlocked</p>
                <p className="text-3xl font-bold text-emerald-600">£{Math.round(stats.gmvUnlocked)}</p>
                <p className="text-xs text-gray-400 mt-1">Sum of expected resale (£) for shop scans</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <i className="ri-shopping-bag-3-line text-green-600 text-xl" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">CO₂ diverted</p>
                <p className="text-3xl font-bold text-teal-600">{stats.co2Kg} kg</p>
                <p className="text-xs text-gray-400 mt-1">Scans × {CO2_KG_PER_SCAN} kg (same as main dashboard)</p>
              </div>
              <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                <i className="ri-leaf-line text-teal-600 text-xl" />
              </div>
            </div>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to={scanHref}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <i className="ri-camera-line" />
            Scan for this shop
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Personal seller dashboard
          </Link>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-black mb-4">Recent shop scans</h2>
          {recent.length === 0 ? (
            <Card className="p-8 text-center text-gray-500 text-sm">
              No scans with shop attribution yet. Use Scan for this shop so rows include your{' '}
              <code className="text-gray-700">partner_shop_id</code>.
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium">Resale est.</th>
                    <th className="px-4 py-3 font-medium">Decision</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {row.image_url ? (
                            <img
                              src={row.image_url}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover bg-gray-100"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                              <i className="ri-image-line" />
                            </div>
                          )}
                          <span className="font-medium text-black">{row.brand_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        £{row.expected_resale_gbp != null ? Math.round(Number(row.expected_resale_gbp)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 text-xs font-medium">
                          {row.decision ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
