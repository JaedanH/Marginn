import Card from '../../../../components/base/Card';
import Button from '../../../../components/base/Button';

export interface ScanDetailModalScan {
  id?: string;
  created_at?: string;
  brand_name?: string;
  image_url?: string | null;
  thumbnail?: string | null;
  itemName?: string;
  brand?: string;
  date?: string;
  expected_resale_gbp?: number | null;
  estimatedValue?: number;
  profit_gbp?: number | null;
  buy_price_gbp?: number | null;
  decision?: string | null;
  marketplaces?: Array<{
    name: string;
    averagePrice: number;
    lowPrice: string | number;
    highPrice: string | number;
  }>;
}

interface ScanDetailModalProps {
  scan: ScanDetailModalScan;
  onClose: () => void;
}

export default function ScanDetailModal({ scan, onClose }: ScanDetailModalProps) {
  const thumbnail = scan.image_url?.trim() || scan.thumbnail?.trim() || '';
  const itemName = scan.itemName ?? scan.brand_name ?? 'Scan';
  const brand = scan.brand ?? scan.brand_name ?? '';
  const dateRaw = scan.date ?? scan.created_at;
  const estimatedValue = scan.estimatedValue ?? scan.expected_resale_gbp ?? 0;
  const marketplaces =
    Array.isArray(scan.marketplaces) && scan.marketplaces.length > 0
      ? scan.marketplaces
      : [
          {
            name: 'Estimated resale',
            averagePrice: estimatedValue,
            lowPrice: '—',
            highPrice: '—',
          },
        ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">Scan Details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
          >
            <i className="ri-close-line text-xl text-gray-600"></i>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Item Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <img 
                src={thumbnail} 
                alt={itemName}
                className="w-full h-64 object-contain rounded-lg bg-gray-50"
              />
            </div>
            <div>
              <h3 className="text-xl font-bold text-black mb-4">{itemName}</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-500">Brand:</span>
                  <p className="text-lg font-semibold text-black">{brand}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Scan Date:</span>
                  <p className="text-lg font-semibold text-black">
                    {(dateRaw ? new Date(dateRaw) : new Date()).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500">Estimated Value:</span>
                  <p className="text-2xl font-bold text-green-600">£{estimatedValue}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Marketplace Data */}
          <Card className="p-6">
            <h4 className="text-lg font-semibold text-black mb-4">Marketplace Prices</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 font-semibold text-gray-700">Marketplace</th>
                    <th className="text-right py-3 font-semibold text-gray-700">Average Price</th>
                    <th className="text-right py-3 font-semibold text-gray-700">Low Price</th>
                    <th className="text-right py-3 font-semibold text-gray-700">High Price</th>
                  </tr>
                </thead>
                <tbody>
                  {marketplaces.map((marketplace, index: number) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-3">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                            <i className="ri-store-2-line text-gray-600 text-sm"></i>
                          </div>
                          <span className="font-medium text-black">{marketplace.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right font-semibold text-black">
                        £{marketplace.averagePrice}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        £{marketplace.lowPrice}
                      </td>
                      <td className="py-3 text-right text-gray-600">
                        £{marketplace.highPrice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        
        <div className="p-6 border-t border-gray-200 flex justify-end">
          <Button onClick={onClose} variant="outline" className="whitespace-nowrap">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
