import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import ScanDetailModal from './components/ScanDetailModal';
import { MarkBoughtDialog, MarkSoldDialog } from './components/ScanOutcomeDialogs';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { resolveAuthUserId } from '../../../lib/authUserId';

interface ScanRecord {
  id: string;
  created_at: string;
  brand_name: string;
  image_url: string | null;
  expected_resale_gbp: number | null;
  decision: string | null;
  profit_gbp: number | null;
  buy_price_gbp: number | null;
  roi: number | null;
  bought_at: string | null;
  bought_price_gbp: number | null;
  sold_at: string | null;
  sold_price_gbp: number | null;
}

const SCAN_SELECT =
  'id, created_at, brand_name, image_url, expected_resale_gbp, decision, profit_gbp, buy_price_gbp, roi, bought_at, bought_price_gbp, sold_at, sold_price_gbp';

export default function HistoryPage() {
  const [selectedScan, setSelectedScan] = useState<ScanRecord | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [totalScanCount, setTotalScanCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [boughtDialogScan, setBoughtDialogScan] = useState<ScanRecord | null>(null);
  const [soldDialogScan, setSoldDialogScan] = useState<ScanRecord | null>(null);
  const [watchBusyId, setWatchBusyId] = useState<string | null>(null);
  const { user, session } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const refreshScans = useCallback(async () => {
    const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!userId) {
      setScanHistory([]);
      setTotalScanCount(null);
      return;
    }
    const [listRes, countRes] = await Promise.all([
      supabase.from('scans').select(SCAN_SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      supabase.from('scans').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (listRes.error) {
      console.error('Error fetching scans:', listRes.error);
      showToast(`Could not load scan history: ${listRes.error.message}`, 'error');
      setScanHistory([]);
    } else {
      setScanHistory((listRes.data as ScanRecord[]) || []);
    }
    setTotalScanCount(countRes.count ?? listRes.data?.length ?? 0);
  }, [user, session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!userId) {
        setScanHistory([]);
        setTotalScanCount(null);
        setLoading(false);
        return;
      }
      await refreshScans();
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshScans]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshScans();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshScans]);

  useEffect(() => {
    const onSaved = () => void refreshScans();
    window.addEventListener('marginn:scan-saved', onSaved);
    return () => window.removeEventListener('marginn:scan-saved', onSaved);
  }, [refreshScans]);

  useEffect(() => {
    const id = searchParams.get('scan');
    if (!id || scanHistory.length === 0) return;
    const match = scanHistory.find((s) => s.id === id);
    if (match) setSelectedScan(match);
  }, [searchParams, scanHistory]);

  const closeModal = () => {
    setSelectedScan(null);
    if (searchParams.get('scan')) {
      const next = new URLSearchParams(searchParams);
      next.delete('scan');
      setSearchParams(next, { replace: true });
    }
  };

  const upsertScanInState = (updated: ScanRecord) => {
    setScanHistory((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSelectedScan((prev) => (prev?.id === updated.id ? updated : prev));
  };

  const handleMarkBoughtConfirm = async (price: number | null) => {
    const scan = boughtDialogScan;
    if (!scan?.id) return;
    const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!userId) return;
    const row = {
      bought_at: new Date().toISOString(),
      bought_price_gbp: price,
    };
    const { data, error } = await supabase.from('scans').update(row).eq('id', scan.id).eq('user_id', userId).select(SCAN_SELECT).single();
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    upsertScanInState(data as ScanRecord);
    showToast('Marked as bought.', 'success');
    setBoughtDialogScan(null);
  };

  const handleMarkSoldConfirm = async (soldPrice: number) => {
    const scan = soldDialogScan;
    if (!scan?.id) return;
    const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!userId) return;
    const { data, error } = await supabase
      .from('scans')
      .update({
        sold_at: new Date().toISOString(),
        sold_price_gbp: soldPrice,
      })
      .eq('id', scan.id)
      .eq('user_id', userId)
      .select(SCAN_SELECT)
      .single();
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    upsertScanInState(data as ScanRecord);
    showToast('Sale recorded.', 'success');
    setSoldDialogScan(null);
  };

  const handleWatchPrice = async (scan: ScanRecord) => {
    const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
    if (!userId) {
      showToast('Sign in to watch resale.', 'error');
      return;
    }
    const baseline = Number(scan.expected_resale_gbp) || 0;
    setWatchBusyId(scan.id);
    const { error } = await supabase.from('scan_watchlist').insert({
      user_id: userId,
      scan_id: scan.id,
      baseline_resale_gbp: baseline,
    });
    setWatchBusyId(null);
    if (error) {
      if (error.code === '23505') {
        showToast('Already watching this scan.', 'info');
      } else {
        showToast(error.message, 'error');
      }
      return;
    }
    showToast('Watching resale for 48h from now.', 'success');
  };

  const statusLabel = (s: ScanRecord) => {
    if (s.sold_at) return 'Sold';
    if (s.bought_at) return 'Bought';
    return '—';
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-black">Scan History</h1>
          <p className="text-gray-600">
            {totalScanCount != null ? totalScanCount : scanHistory.length} scans total
            {totalScanCount != null && totalScanCount > scanHistory.length
              ? ` (showing latest ${scanHistory.length})`
              : ''}
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Date</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Item</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Brand</th>
                  <th className="text-right py-4 px-6 font-semibold text-gray-700">Est. resale</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Status</th>
                  <th className="text-right py-4 px-6 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading scans...
                    </td>
                  </tr>
                ) : scanHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No scans yet. Start scanning items to see your history here.
                    </td>
                  </tr>
                ) : (
                  scanHistory.map((scan) => (
                    <tr key={scan.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-6 text-gray-600">
                        {new Date(scan.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center">
                          {scan.image_url ? (
                            <img
                              src={scan.image_url}
                              alt={scan.brand_name}
                              className="w-12 h-12 object-cover rounded-lg mr-4"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded-lg mr-4 flex items-center justify-center">
                              <i className="ri-image-line text-gray-300"></i>
                            </div>
                          )}
                          <span className="font-medium text-black">{scan.brand_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-medium text-black">{scan.brand_name}</td>
                      <td className="py-4 px-6 text-right font-semibold text-green-600">
                        £{scan.expected_resale_gbp ?? 0}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-700">{statusLabel(scan)}</td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={watchBusyId === scan.id}
                            onClick={() => void handleWatchPrice(scan)}
                          >
                            {watchBusyId === scan.id ? '…' : 'Watch'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={Boolean(scan.bought_at)}
                            onClick={() => setBoughtDialogScan(scan)}
                          >
                            Bought
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            disabled={!scan.bought_at || Boolean(scan.sold_at)}
                            onClick={() => setSoldDialogScan(scan)}
                            title={!scan.bought_at ? 'Mark bought first' : undefined}
                          >
                            Sold
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setSelectedScan(scan)} className="whitespace-nowrap">
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <MarkBoughtDialog
        open={Boolean(boughtDialogScan)}
        defaultPriceGbp={boughtDialogScan?.buy_price_gbp != null ? Number(boughtDialogScan.buy_price_gbp) : null}
        onClose={() => setBoughtDialogScan(null)}
        onConfirm={handleMarkBoughtConfirm}
      />

      <MarkSoldDialog
        open={Boolean(soldDialogScan)}
        brandName={soldDialogScan?.brand_name}
        onClose={() => setSoldDialogScan(null)}
        onConfirm={handleMarkSoldConfirm}
      />

      {selectedScan && (
        <ScanDetailModal
          scan={selectedScan}
          onClose={closeModal}
          onMarkBought={() => setBoughtDialogScan(selectedScan)}
          onMarkSold={() => setSoldDialogScan(selectedScan)}
        />
      )}
    </DashboardLayout>
  );
}
