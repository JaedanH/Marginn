import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import ScanDetailModal from './components/ScanDetailModal';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
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
}

export default function HistoryPage() {
  const [selectedScan, setSelectedScan] = useState<ScanRecord | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [totalScanCount, setTotalScanCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const fetchScans = async () => {
      setLoading(true);
      const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
      if (!userId) {
        setScanHistory([]);
        setTotalScanCount(null);
        setLoading(false);
        return;
      }

      const [listRes, countRes] = await Promise.all([
        supabase
          .from('scans')
          .select(
            'id, created_at, brand_name, image_url, expected_resale_gbp, decision, profit_gbp, buy_price_gbp'
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('scans').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      if (listRes.error) {
        console.error('Error fetching scans:', listRes.error);
        setScanHistory([]);
      } else {
        setScanHistory((listRes.data as ScanRecord[]) || []);
      }

      setTotalScanCount(countRes.count ?? listRes.data?.length ?? 0);
      setLoading(false);
    };

    fetchScans();
  }, [user, session?.user?.id]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const userId = await resolveAuthUserId(user?.id ?? session?.user?.id);
        if (!userId) return;
        const { data, error } = await supabase
          .from('scans')
          .select(
            'id, created_at, brand_name, image_url, expected_resale_gbp, decision, profit_gbp, buy_price_gbp',
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(500);
        if (!error && data) setScanHistory((data as ScanRecord[]) || []);
      })();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, session?.user?.id]);

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
                  <th className="text-right py-4 px-6 font-semibold text-gray-700">Estimated Value</th>
                  <th className="text-right py-4 px-6 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      Loading scans...
                    </td>
                  </tr>
                ) : scanHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
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
                      <td className="py-4 px-6 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedScan(scan)}
                          className="whitespace-nowrap"
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {selectedScan && (
        <ScanDetailModal scan={selectedScan} onClose={closeModal} />
      )}
    </DashboardLayout>
  );
}
