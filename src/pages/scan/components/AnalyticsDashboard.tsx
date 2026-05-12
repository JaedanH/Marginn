import { IdentifiedItem } from '../page';
import ROICalculator from './ROICalculator';

interface AnalyticsDashboardProps {
  item: IdentifiedItem;
  onSaveItem: (item: IdentifiedItem) => void;
}

export default function AnalyticsDashboard({ item, onSaveItem }: AnalyticsDashboardProps) {
  // Add safety checks for platforms array
  if (!item.platforms || item.platforms.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-gray-500">No platform data available</p>
        </div>
      </div>
    );
  }

  const avgPrice = Math.round(
    item.platforms.reduce((sum, p) => sum + p.avgPrice, 0) / item.platforms.length
  );
  
  const totalListings = item.platforms.reduce((sum, p) => sum + p.listings, 0);
  const totalSold = item.platforms.reduce((sum, p) => sum + p.soldListings, 0);
  
  // Calculate profit based on purchase cost if provided, otherwise use retail price
  const costBasis = item.purchaseCost || item.retailPrice;
  const profitMargin = costBasis > 0 
    ? Math.round(((avgPrice - costBasis) / costBasis) * 100)
    : 0;
  const profitAmount = avgPrice - costBasis;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Item Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start gap-6">
          <img 
            src={item.imageUrl} 
            alt={item.itemName}
            className="w-32 h-32 object-cover rounded-lg"
          />
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{item.itemName}</h2>
                <p className="text-lg text-gray-600 mb-2">{item.brand}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full">
                    {item.category}
                  </span>
                  <span className="bg-brand-50 text-brand-600 px-3 py-1 rounded-full">
                    {item.condition}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onSaveItem(item)}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-bookmark-line mr-2"></i>
                Save Item
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Avg Resale Price</p>
            <i className="ri-price-tag-3-line text-brand-600"></i>
          </div>
          <p className="text-3xl font-bold text-gray-900">${avgPrice}</p>
        </div>
        
        {item.purchaseCost ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Your Cost</p>
              <i className="ri-wallet-line text-orange-600"></i>
            </div>
            <p className="text-3xl font-bold text-gray-900">${item.purchaseCost}</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Retail Price</p>
              <i className="ri-shopping-bag-line text-blue-600"></i>
            </div>
            <p className="text-3xl font-bold text-gray-900">${item.retailPrice}</p>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Potential Profit</p>
            <i className="ri-money-dollar-circle-line text-green-600"></i>
          </div>
          <p className={`text-3xl font-bold ${profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {profitAmount >= 0 ? '+' : ''}${profitAmount}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Profit Margin</p>
            <i className="ri-line-chart-line text-green-600"></i>
          </div>
          <p className={`text-3xl font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {profitMargin >= 0 ? '+' : ''}{profitMargin}%
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Listings</p>
            <i className="ri-store-line text-orange-600"></i>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalListings}</p>
        </div>
      </div>

      {/* Profit Breakdown */}
      {item.purchaseCost && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Your Profit Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">You Paid</p>
              <p className="text-2xl font-bold text-gray-900">${item.purchaseCost}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Expected Sale Price</p>
              <p className="text-2xl font-bold text-purple-600">${avgPrice}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Your Profit</p>
              <p className={`text-2xl font-bold ${profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profitAmount >= 0 ? '+' : ''}${profitAmount}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Platform Comparison */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Platform Comparison</h3>
        <div className="space-y-4">
          {item.platforms.map((platform) => {
            const platformProfit = item.purchaseCost ? platform.avgPrice - item.purchaseCost : platform.avgPrice - item.retailPrice;
            
            return (
              <div key={platform.name} className="border border-gray-200 rounded-lg p-4 hover:border-brand-300 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-semibold text-gray-900">{platform.name}</h4>
                      <span className="text-sm text-gray-500">
                        {platform.soldListings} sold / {platform.listings} active
                      </span>
                      {item.purchaseCost && (
                        <span className={`text-sm font-medium px-2 py-1 rounded ${
                          platformProfit >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {platformProfit >= 0 ? '+' : ''}${platformProfit} profit
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <p className="text-2xl font-bold text-gray-900">${platform.avgPrice}</p>
                        <p className="text-xs text-gray-500">Average price</p>
                      </div>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-brand-600 h-2 rounded-full"
                          style={{ width: `${platform.listings > 0 ? (platform.soldListings / platform.listings) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        {platform.listings > 0 ? Math.round((platform.soldListings / platform.listings) * 100) : 0}% sold
                      </p>
                    </div>
                  </div>
                  <a
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    View Listings
                    <i className="ri-external-link-line ml-2"></i>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price History */}
      {item.priceHistory && item.priceHistory.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Price History (6 Months)</h3>
          <div className="flex items-end justify-between h-64 gap-4">
            {item.priceHistory.map((point, index) => {
              const maxPrice = Math.max(...item.priceHistory.map(p => p.price), 1);
              const height = (point.price / maxPrice) * 100;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full bg-brand-600 rounded-t-lg relative group cursor-pointer" style={{ height: `${height}%` }}>
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ${point.price}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{point.date}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ROI Calculator & Historical Pricing */}
      <ROICalculator item={item} />

      {/* Market Insights */}
      <div className="bg-brand-50 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Market Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <i className="ri-arrow-up-line text-green-600 text-xl mt-1"></i>
            <div>
              <p className="font-medium text-gray-900">High Demand</p>
              <p className="text-sm text-gray-600">{totalSold} items sold in the last 30 days</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <i className="ri-trophy-line text-yellow-600 text-xl mt-1"></i>
            <div>
              <p className="font-medium text-gray-900">Best Platform</p>
              <p className="text-sm text-gray-600">
                {item.platforms.reduce((best, p) => p.avgPrice > best.avgPrice ? p : best).name} has highest avg price
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
