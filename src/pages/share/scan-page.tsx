import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/supabaseClient';

type SharedPayload = {
  id?: string;
  brand_name?: string;
  image_url?: string | null;
  decision?: string;
  expected_resale_gbp?: number | null;
  condition_grade?: string;
  buy_price_gbp?: number | null;
  net_gbp?: number | null;
};

export default function SharedScanPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      setData(null);
      setError('Invalid link');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_scan_by_share_token', {
          p_token: token,
        });
        if (cancelled) return;
        if (rpcErr) {
          setError(rpcErr.message);
          setData(null);
          return;
        }
        if (rpcData == null || (typeof rpcData === 'object' && Object.keys(rpcData as object).length === 0)) {
          setData(null);
          setError('This share link is invalid or expired.');
          return;
        }
        setData(rpcData as SharedPayload);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load scan');
          setData(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (data === undefined && !error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-400" />
        <p className="mt-4 text-sm text-gray-500">Loading shared scan…</p>
      </div>
    );
  }

  if (error || data === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-gray-800 font-medium mb-2">{error ?? 'Scan not found'}</p>
        <Link to="/" className="text-sm text-[#1a3d2b] font-semibold hover:underline">
          Back to Marginn
        </Link>
      </div>
    );
  }

  const d = data;
  const verdict = (d.decision ?? 'MAYBE').toUpperCase();
  const vc =
    verdict === 'BUY'
      ? 'bg-emerald-500 text-white'
      : verdict === 'SKIP'
        ? 'bg-rose-500 text-white'
        : 'bg-amber-400 text-white';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <Link to="/" className="text-xl font-bold text-black tracking-tight mb-6">
        Marginn
      </Link>
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100">
        <div className="relative w-full h-56 bg-gray-100">
          {d.image_url ? (
            <img src={d.image_url} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <i className="ri-image-line text-4xl" />
            </div>
          )}
          <div className={`absolute top-4 right-4 px-4 py-1.5 rounded-full text-xs font-black tracking-widest ${vc}`}>
            {verdict}
          </div>
        </div>
        <div className="p-6 space-y-3">
          <p className="text-lg font-bold text-gray-900">{d.brand_name ?? 'Scan result'}</p>
          {d.condition_grade && <p className="text-sm text-gray-500">Condition grade: {d.condition_grade}</p>}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Est. resale</p>
              <p className="text-lg font-black text-gray-900">
                £{d.expected_resale_gbp != null ? Math.round(Number(d.expected_resale_gbp)) : '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Net</p>
              <p className="text-lg font-black text-gray-900">
                {d.net_gbp != null ? `£${Math.round(Number(d.net_gbp))}` : '—'}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 pt-2">
            Shared via Marginn. Values are estimates only.
          </p>
          <Link
            to="/signup"
            className="flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-900"
          >
            Try Marginn
          </Link>
        </div>
      </div>
    </div>
  );
}
