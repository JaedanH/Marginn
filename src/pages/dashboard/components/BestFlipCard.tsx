import { Link } from 'react-router-dom';
import Card from '../../../components/base/Card';

export interface BestFlipScan {
  id: string;
  brand_name: string;
  image_url: string | null;
  roi: number;
}

interface BestFlipCardProps {
  scan: BestFlipScan | null;
}

export default function BestFlipCard({ scan }: BestFlipCardProps) {
  if (!scan) {
    return (
      <Card className="p-6 border border-dashed border-gray-200 bg-white/80">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Best flip</h2>
        <p className="text-sm text-gray-500">
          No ROI data yet — run scans with a buy price to unlock your highest-ROI pick.
        </p>
      </Card>
    );
  }

  const roiRounded = Math.round(Number(scan.roi));

  return (
    <Card className="p-0 overflow-hidden border border-emerald-100 shadow-md shadow-emerald-900/5">
      <div className="bg-gradient-to-br from-emerald-50 to-white p-6 md:p-7 flex flex-col sm:flex-row gap-5 items-stretch">
        <div className="flex-shrink-0 w-full sm:w-36 aspect-square sm:aspect-auto sm:h-36 rounded-2xl overflow-hidden bg-gray-100 border border-emerald-100">
          {scan.image_url ? (
            <img src={scan.image_url} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <i className="ri-image-line text-3xl text-gray-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Best flip</p>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{scan.brand_name}</h2>
          <p className="text-3xl md:text-4xl font-black text-emerald-600">+{roiRounded}% ROI</p>
          <p className="text-sm text-gray-500">Your strongest profit signal vs buy price.</p>
          <Link
            to={`/dashboard/history?scan=${encodeURIComponent(scan.id)}`}
            className="inline-flex items-center gap-2 mt-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950 w-fit cursor-pointer"
          >
            View in history
            <i className="ri-arrow-right-line" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
