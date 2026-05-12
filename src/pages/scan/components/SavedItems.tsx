import { useState } from 'react';
import { IdentifiedItem } from '../page';

type SortOption = 'profit-desc' | 'profit-asc' | 'brand-asc' | 'brand-desc' | 'date-desc' | 'date-asc';

interface SavedItemsProps {
  items: IdentifiedItem[];
  onRemoveItem: (id: string) => void;
}

export default function SavedItems({ items, onRemoveItem }: SavedItemsProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [filterBrand, setFilterBrand] = useState<string>('all');

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-16 text-center">
          <i className="ri-bookmark-line text-6xl text-gray-300 mb-4"></i>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No saved items yet</h3>
          <p className="text-gray-600">Items you save will appear here for quick reference</p>
        </div>
      </div>
    );
  }

  const uniqueBrands = ['all', ...Array.from(new Set(items.map((i) => i.brand).filter(Boolean)))];

  const getProfit = (item: IdentifiedItem) => {
    const avgPrice = item.platforms.reduce((sum, p) => sum + p.avgPrice, 0) / item.platforms.length;
    return Math.round(((avgPrice - item.retailPrice) / item.retailPrice) * 100);
  };

  const sortedFiltered = [...items]
    .filter((item) => filterBrand === 'all' || item.brand === filterBrand)
    .sort((a, b) => {
      switch (sortBy) {
        case 'profit-desc': return getProfit(b) - getProfit(a);
        case 'profit-asc': return getProfit(a) - getProfit(b);
        case 'brand-asc': return (a.brand || '').localeCompare(b.brand || '');
        case 'brand-desc': return (b.brand || '').localeCompare(a.brand || '');
        case 'date-asc': return (a.id || '').localeCompare(b.id || '');
        case 'date-desc':
        default: return (b.id || '').localeCompare(a.id || '');
      }
    });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header + Controls */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Saved Items ({sortedFiltered.length})</h2>
            <p className="text-gray-600 mt-1">Track your favourite items and their market performance</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Brand Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 whitespace-nowrap">
                <i className="ri-filter-3-line mr-1"></i>Brand
              </span>
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-200 cursor-pointer"
              >
                {uniqueBrands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand === 'all' ? 'All Brands' : brand}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 whitespace-nowrap">
                <i className="ri-sort-desc mr-1"></i>Sort
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-200 cursor-pointer"
              >
                <option value="date-desc">Date: Newest</option>
                <option value="date-asc">Date: Oldest</option>
                <option value="profit-desc">Profit: High → Low</option>
                <option value="profit-asc">Profit: Low → High</option>
                <option value="brand-asc">Brand: A → Z</option>
                <option value="brand-desc">Brand: Z → A</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {sortedFiltered.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <i className="ri-search-line text-5xl text-gray-300 mb-3"></i>
          <p className="text-gray-500">No items match the selected brand filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedFiltered.map((item) => {
            const avgPrice = Math.round(
              item.platforms.reduce((sum, p) => sum + p.avgPrice, 0) / item.platforms.length
            );
            const profitMargin = getProfit(item);

            return (
              <div key={item.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative">
                  <img
                    src={item.imageUrl}
                    alt={item.itemName}
                    className="w-full h-48 object-cover object-top"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/placeholder-image.png';
                    }}
                  />
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="absolute top-2 right-2 bg-white rounded-full p-2 hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label="Remove item"
                  >
                    <i className="ri-delete-bin-line text-red-600"></i>
                  </button>
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1">{item.itemName}</h3>
                  <p className="text-sm text-gray-600 mb-3">{item.brand}</p>

                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-500">Avg Price</p>
                      <p className="text-xl font-bold text-gray-900">${avgPrice || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Profit</p>
                      <p className={`text-xl font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {profitMargin >= 0 ? '+' : ''}{profitMargin || 0}%
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-brand-100 text-brand-700 px-2 py-1 rounded">{item.category}</span>
                    <span className="bg-brand-50 text-brand-600 px-2 py-1 rounded">{item.condition}</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">Available on {item.platforms?.length || 0} platforms</p>
                    <div className="flex flex-wrap gap-1">
                      {item.platforms?.slice(0, 4).map((platform) => (
                        <span key={platform.name} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {platform.name}
                        </span>
                      ))}
                      {(item.platforms?.length || 0) > 4 && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          +{(item.platforms?.length || 0) - 4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
