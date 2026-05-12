import { useState } from 'react';

export interface BoughtItem {
  id: string;
  brand: string;
  itemName: string;
  imageUrl: string;
  paidPrice: number;
  predictedResalePrice: number;
  status: 'BOUGHT' | 'SOLD';
  soldData?: {
    actualSalePrice: number;
    platform: string;
    daysToSell: number;
  };
}

interface MarkAsSoldModalProps {
  item: BoughtItem;
  onClose: () => void;
  onConfirm: (id: string, data: { actualSalePrice: number; platform: string; daysToSell: number }) => void;
}

function MarkAsSoldModal({ item, onClose, onConfirm }: MarkAsSoldModalProps) {
  const [salePrice, setSalePrice] = useState('');
  const [platform, setPlatform] = useState('');
  const [days, setDays] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!salePrice || isNaN(Number(salePrice)) || Number(salePrice) <= 0) e.salePrice = 'Enter a valid sale price';
    if (!platform) e.platform = 'Select a platform';
    if (!days || isNaN(Number(days)) || Number(days) < 0) e.days = 'Enter valid days';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onConfirm(item.id, {
      actualSalePrice: parseFloat(salePrice),
      platform,
      daysToSell: parseInt(days, 10),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Mark as Sold</h3>
            <p className="text-sm text-gray-500 mt-0.5">{item.brand} — {item.itemName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-gray-600"></i>
          </button>
        </div>

        <div className="space-y-4">
          {/* Actual Sale Price */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Actual Sale Price</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">£</span>
              <input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className={`w-full pl-8 pr-4 py-3 bg-gray-50 border rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 transition-all ${errors.salePrice ? 'border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
              />
            </div>
            {errors.salePrice && <p className="text-xs text-red-500 mt-1">{errors.salePrice}</p>}
          </div>

          {/* Platform */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Platform Sold On</label>
            <div className="grid grid-cols-3 gap-2">
              {['Vinted', 'Depop', 'eBay'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    platform === p
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {errors.platform && <p className="text-xs text-red-500 mt-1">{errors.platform}</p>}
          </div>

          {/* Days to Sell */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Days to Sell</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="e.g. 7"
              min="0"
              className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 transition-all ${errors.days ? 'border-red-400' : 'border-gray-200 focus:border-gray-400'}`}
            />
            {errors.days && <p className="text-xs text-red-500 mt-1">{errors.days}</p>}
          </div>
        </div>

        {/* Preview profit */}
        {salePrice && !isNaN(Number(salePrice)) && Number(salePrice) > 0 && (
          <div className="mt-4 bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">Estimated profit</span>
            <span className={`text-sm font-bold ${Number(salePrice) - item.paidPrice >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {Number(salePrice) - item.paidPrice >= 0 ? '+' : ''}£{(Number(salePrice) - item.paidPrice).toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-900 transition-all cursor-pointer whitespace-nowrap"
          >
            Confirm Sale
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatsBarProps {
  items: BoughtItem[];
}

function StatsBar({ items }: StatsBarProps) {
  const soldItems = items.filter((i) => i.status === 'SOLD' && i.soldData);

  const totalProfit = soldItems.reduce((sum, i) => {
    return sum + ((i.soldData?.actualSalePrice ?? 0) - i.paidPrice);
  }, 0);

  const successfulFlips = soldItems.length;

  const avgProfit = successfulFlips > 0 ? totalProfit / successfulFlips : 0;

  const accuracyItems = soldItems.filter((i) => i.soldData);
  const accuracy =
    accuracyItems.length > 0
      ? accuracyItems.reduce((sum, i) => {
          const predicted = i.predictedResalePrice;
          const actual = i.soldData!.actualSalePrice;
          const diff = Math.abs(predicted - actual) / actual;
          return sum + Math.max(0, 1 - diff);
        }, 0) /
        accuracyItems.length *
        100
      : 0;

  const stats = [
    {
      label: 'Total Profit',
      value: `${totalProfit >= 0 ? '+' : ''}£${totalProfit.toFixed(2)}`,
      icon: 'ri-money-pound-circle-line',
      color: totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500',
      bg: totalProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50',
    },
    {
      label: 'Successful Flips',
      value: successfulFlips.toString(),
      icon: 'ri-checkbox-circle-line',
      color: 'text-gray-900',
      bg: 'bg-gray-50',
    },
    {
      label: 'Avg Profit / Flip',
      value: `${avgProfit >= 0 ? '+' : ''}£${avgProfit.toFixed(2)}`,
      icon: 'ri-bar-chart-line',
      color: avgProfit >= 0 ? 'text-emerald-600' : 'text-red-500',
      bg: avgProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50',
    },
    {
      label: 'Marginn Accuracy',
      value: accuracyItems.length > 0 ? `${accuracy.toFixed(0)}%` : '—',
      icon: 'ri-focus-3-line',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-2xl px-4 py-4 flex flex-col gap-2`}>
          <div className="w-8 h-8 flex items-center justify-center">
            <i className={`${s.icon} text-xl ${s.color}`}></i>
          </div>
          <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          <p className="text-xs text-gray-500 font-medium">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

interface EnvironmentalImpactProps {
  successfulFlips: number;
}

function EnvironmentalImpact({ successfulFlips }: EnvironmentalImpactProps) {
  const co2Saved = successfulFlips * 22;
  const treesEquivalent = parseFloat((co2Saved / 21).toFixed(1));
  const yearsExtended = parseFloat((successfulFlips * 2.5).toFixed(1));

  const stats = [
    {
      emoji: '🌍',
      label: 'CO₂ Saved',
      value: `${co2Saved} kg`,
      sub: 'from landfill diversion',
    },
    {
      emoji: '👕',
      label: 'Items Rescued',
      value: successfulFlips.toString(),
      sub: 'from landfill',
    },
    {
      emoji: '🌱',
      label: 'Trees Equivalent',
      value: treesEquivalent.toString(),
      sub: 'trees planted',
    },
    {
      emoji: '♻️',
      label: 'Life Extended',
      value: `${yearsExtended} yrs`,
      sub: 'of clothing life',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl px-5 py-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 flex items-center justify-center">
          <i className="ri-leaf-line text-emerald-600 text-base"></i>
        </div>
        <p className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Your Environmental Impact</p>
      </div>

      {successfulFlips === 0 ? (
        <p className="text-sm text-emerald-600 text-center py-2">
          Mark your first sale to see your environmental impact 🌱
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white/70 rounded-xl px-3 py-3 text-center border border-green-100">
              <span className="text-2xl leading-none block mb-1">{s.emoji}</span>
              <p className="text-lg font-black text-emerald-700">{s.value}</p>
              <p className="text-[11px] font-semibold text-emerald-800 leading-tight">{s.label}</p>
              <p className="text-[10px] text-emerald-500 mt-0.5 leading-tight">{s.sub}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BoughtItemsProps {
  items: BoughtItem[];
  onMarkAsSold: (id: string, data: { actualSalePrice: number; platform: string; daysToSell: number }) => void;
}

export default function BoughtItems({ items, onMarkAsSold }: BoughtItemsProps) {
  const [modalItem, setModalItem] = useState<BoughtItem | null>(null);

  const boughtItems = items.filter((i) => i.status === 'BOUGHT');
  const successfulFlips = items.filter((i) => i.status === 'SOLD' && i.soldData).length;

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-16 text-center">
          <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-2xl mx-auto mb-4">
            <i className="ri-shopping-bag-line text-4xl text-gray-300"></i>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No bought items yet</h3>
          <p className="text-gray-500 text-sm">
            Save items with a <span className="font-semibold text-black">BOUGHT</span> status to track them here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <StatsBar items={items} />
      <EnvironmentalImpact successfulFlips={successfulFlips} />

      {boughtItems.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-emerald-50 rounded-2xl mx-auto mb-3">
            <i className="ri-checkbox-circle-line text-3xl text-emerald-500"></i>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">All items sold!</h3>
          <p className="text-sm text-gray-500">You&apos;ve marked all your bought items as sold.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boughtItems.map((item) => {
            const predictedProfit = item.predictedResalePrice - item.paidPrice;
            return (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative">
                  <img
                    src={item.imageUrl}
                    alt={item.itemName}
                    className="w-full h-48 object-cover object-top"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://readdy.ai/api/search-image?query=fashion%20clothing%20item%20on%20clean%20white%20background%20minimal%20product%20photography&width=400&height=300&seq=fallback1&orientation=landscape';
                    }}
                  />
                  <span className="absolute top-3 left-3 bg-black text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    BOUGHT
                  </span>
                </div>

                <div className="p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{item.brand}</p>
                  <h3 className="font-semibold text-gray-900 text-sm mb-4 leading-snug">{item.itemName}</h3>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">You Paid</p>
                      <p className="text-base font-bold text-gray-900">£{item.paidPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Predicted Resale</p>
                      <p className="text-base font-bold text-emerald-600">£{item.predictedResalePrice.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-xs text-gray-500">Predicted Profit</span>
                    <span className={`text-sm font-bold ${predictedProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {predictedProfit >= 0 ? '+' : ''}£{predictedProfit.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => setModalItem(item)}
                    className="w-full py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-900 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    <i className="ri-check-double-line"></i>
                    Mark as Sold
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalItem && (
        <MarkAsSoldModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onConfirm={onMarkAsSold}
        />
      )}
    </div>
  );
}
