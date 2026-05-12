import Card from '../../../components/base/Card';
import { ScanResult } from './NewScanSection';

interface ScanResultsProps {
  result: ScanResult;
  uploadedImage: File | null;
}

const decisionStyle: Record<string, { bg: string; label: string }> = {
  BUY:   { bg: '#1a3d2b', label: 'BUY' },
  MAYBE: { bg: '#f59e0b', label: 'MAYBE' },
  SKIP:  { bg: '#ef4444', label: 'SKIP' },
};

export default function ScanResults({ result, uploadedImage }: ScanResultsProps) {
  const decision = (result.decision || 'SKIP').toUpperCase();
  const badge = decisionStyle[decision] ?? decisionStyle.SKIP;

  return (
    <div className="space-y-8">
      {/* Header: image + key info */}
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Image */}
          <div>
            {uploadedImage && (
              <img
                src={URL.createObjectURL(uploadedImage)}
                alt="Scanned item"
                className="w-full h-64 object-contain rounded-lg bg-gray-50"
              />
            )}
          </div>

          {/* Item details */}
          <div className="flex flex-col justify-between">
            <div>
              {/* Decision badge */}
              <span
                className="inline-block px-4 py-1 rounded-full text-white text-sm font-bold mb-4"
                style={{ backgroundColor: badge.bg }}
              >
                {badge.label}
              </span>

              <h2 className="text-2xl font-bold text-black mb-1">
                {result.brand_name}
              </h2>
              {result.product_line && (
                <p className="text-gray-500 text-sm mb-4">{result.product_line}</p>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Brand confidence</span>
                  <span className="font-semibold text-black">{result.brand_confidence}%</span>
                </div>
                {result.condition_grade && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Condition</span>
                    <span className="font-semibold text-black">{result.condition_grade}</span>
                  </div>
                )}
                {result.colour && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Colour</span>
                    <span className="font-semibold text-black">{result.colour}</span>
                  </div>
                )}
                {result.gender && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gender</span>
                    <span className="font-semibold text-black">{result.gender}</span>
                  </div>
                )}
                {result.era && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Era</span>
                    <span className="font-semibold text-black">{result.era}</span>
                  </div>
                )}
                {result.google_lens_product && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Google Lens found</span>
                    <span className="font-semibold text-black text-right max-w-[60%]">{result.google_lens_product}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Financials */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Resale Value</p>
          <p className="text-2xl font-bold text-black">£{result.resale_price}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Net After Fees</p>
          <p className="text-2xl font-bold text-black">£{result.net_after_fees}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Profit</p>
          <p className={`text-2xl font-bold ${result.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            £{result.profit}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Max Buy Price</p>
          <p className="text-2xl font-bold text-black">£{result.max_buy}</p>
        </Card>
      </div>

      {/* Platform prices */}
      <Card className="p-8">
        <h3 className="text-lg font-semibold text-black mb-6">Platform Prices</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Platform</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-600">Price</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'eBay', price: result.platform_prices.ebay },
                { name: 'Vinted', price: result.platform_prices.vinted },
                { name: 'Depop', price: result.platform_prices.depop },
              ].map(({ name, price }) => (
                <tr key={name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                        <i className="ri-store-2-line text-gray-500 text-sm"></i>
                      </div>
                      <span className="font-medium text-black">{name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-black">
                    {price !== null && price !== undefined ? `£${price}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Why Marginn said this */}
      {result.explain_flags && result.explain_flags.length > 0 && (
        <Card className="p-8">
          <h3 className="text-lg font-semibold text-black mb-4">Why Marginn said this</h3>
          <ul className="space-y-2">
            {result.explain_flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <i className="ri-information-line text-gray-400 mt-0.5 shrink-0"></i>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
