import { useState } from 'react';
import { IdentifiedItem } from '../page';

interface ROICalculatorProps {
  item: IdentifiedItem;
}

export default function ROICalculator({ item }: ROICalculatorProps) {
  const [sellPrice, setSellPrice] = useState(
    Math.round(item.platforms.reduce((sum, p) => sum + p.avgPrice, 0) / item.platforms.length)
  );
  const [quantity, setQuantity] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState('90');

  const costBasis = item.purchaseCost || item.retailPrice;
  const totalInvestment = costBasis * quantity;
  const grossProfit = (sellPrice - costBasis) * quantity;
  const platformFees = sellPrice * quantity * 0.12; // 12% average platform fees
  const netProfit = grossProfit - platformFees;
  const roiPercentage = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  
  // Annualized ROI based on hold period
  const daysInPeriod = parseInt(selectedPeriod);
  const annualizedROI = (roiPercentage / daysInPeriod) * 365;

  // Historical pricing data (12 months)
  const historicalData = [
    { month: 'Jan', price: sellPrice * 0.85, volume: 45 },
    { month: 'Feb', price: sellPrice * 0.88, volume: 52 },
    { month: 'Mar', price: sellPrice * 0.92, volume: 68 },
    { month: 'Apr', price: sellPrice * 0.95, volume: 71 },
    { month: 'May', price: sellPrice * 0.98, volume: 83 },
    { month: 'Jun', price: sellPrice * 1.02, volume: 95 },
    { month: 'Jul', price: sellPrice * 1.05, volume: 88 },
    { month: 'Aug', price: sellPrice * 1.08, volume: 102 },
    { month: 'Sep', price: sellPrice * 1.03, volume: 91 },
    { month: 'Oct', price: sellPrice * 0.99, volume: 78 },
    { month: 'Nov', price: sellPrice * 0.96, volume: 65 },
    { month: 'Dec', price: sellPrice, volume: 58 }
  ];

  const maxPrice = Math.max(...historicalData.map(d => d.price));
  const minPrice = Math.min(...historicalData.map(d => d.price));
  const priceChange = sellPrice - historicalData[0].price;
  const priceGrowth = ((priceChange / historicalData[0].price) * 100).toFixed(1);
  const avgVolume = Math.round(historicalData.reduce((sum, d) => sum + d.volume, 0) / historicalData.length);

  // ROI projections by time period
  const roiProjections = [
    { period: '30 days', days: 30, roi: roiPercentage * 0.3, price: sellPrice * 0.95 },
    { period: '90 days', days: 90, roi: roiPercentage * 0.7, price: sellPrice * 0.98 },
    { period: '6 months', days: 180, roi: roiPercentage * 1.2, price: sellPrice * 1.05 },
    { period: '1 year', days: 365, roi: roiPercentage * 1.8, price: sellPrice * 1.15 },
    { period: '2 years', days: 730, roi: roiPercentage * 2.5, price: sellPrice * 1.25 }
  ];

  return (
    <div className="space-y-6">
      {/* ROI Calculator */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">ROI Calculator</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expected Sell Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-600 focus:border-transparent text-sm"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-600 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-1">Total Investment</p>
            <p className="text-xl font-bold text-gray-900">${totalInvestment}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-1">Gross Profit</p>
            <p className="text-xl font-bold text-green-600">${Math.round(grossProfit)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-1">Platform Fees (~12%)</p>
            <p className="text-xl font-bold text-orange-600">-${Math.round(platformFees)}</p>
          </div>
          <div className="bg-brand-50 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-1">Net ROI</p>
            <p className={`text-xl font-bold ${roiPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {roiPercentage >= 0 ? '+' : ''}{roiPercentage.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-blue-600 text-xl mt-0.5"></i>
            <div>
              <p className="text-sm font-medium text-blue-900">Annualized ROI Projection</p>
              <p className="text-sm text-blue-700">
                Based on a {daysInPeriod}-day hold period, your annualized ROI would be approximately{' '}
                <span className="font-bold">{annualizedROI.toFixed(1)}%</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Pricing Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Historical Pricing (12 Months)</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">12-Month Low</p>
            <p className="text-lg font-bold text-red-600">${Math.round(minPrice)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">12-Month High</p>
            <p className="text-lg font-bold text-green-600">${Math.round(maxPrice)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Price Change</p>
            <p className={`text-lg font-bold ${parseFloat(priceGrowth) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {parseFloat(priceGrowth) >= 0 ? '+' : ''}{priceGrowth}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Avg Monthly Volume</p>
            <p className="text-lg font-bold text-gray-900">{avgVolume}</p>
          </div>
        </div>

        <div className="relative h-64">
          <div className="absolute inset-0 flex items-end justify-between gap-2">
            {historicalData.map((data, index) => {
              const priceHeight = (data.price / maxPrice) * 100;
              const maxVolume = Math.max(...historicalData.map(d => d.volume));
              const volumeHeight = (data.volume / maxVolume) * 100;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center group cursor-pointer">
                  <div className="w-full relative" style={{ height: '100%' }}>
                    {/* Volume bar (background) */}
                    <div 
                      className="absolute bottom-0 w-full bg-gray-200 rounded-t-lg"
                      style={{ height: `${volumeHeight}%` }}
                    ></div>
                    {/* Price bar (foreground) */}
                    <div 
                      className="absolute bottom-0 w-full bg-brand-600 rounded-t-lg"
                      style={{ height: `${priceHeight}%` }}
                    ></div>
                    {/* Tooltip */}
                    <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      <div className="font-bold">${Math.round(data.price)}</div>
                      <div className="text-gray-300">{data.volume} sold</div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{data.month}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-brand-600 rounded"></div>
            <span className="text-gray-600">Price</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <span className="text-gray-600">Volume</span>
          </div>
        </div>
      </div>

      {/* ROI by Time Period */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">ROI Projection by Time Period</h3>
        
        <div className="space-y-4 mb-6">
          {roiProjections.map((projection, index) => {
            const maxROI = Math.max(...roiProjections.map(p => p.roi));
            const barWidth = maxROI > 0 ? (projection.roi / maxROI) * 100 : 0;
            
            return (
              <div key={index} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{projection.period}</span>
                  <span className={`text-sm font-bold ${projection.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {projection.roi >= 0 ? '+' : ''}{projection.roi.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-brand-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.abs(barWidth)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-brand-50 rounded-lg p-6">
          <h4 className="font-bold text-gray-900 mb-3">
            <i className="ri-calendar-line mr-2"></i>
            {selectedPeriod === '30' ? '30-Day' : selectedPeriod === '90' ? '90-Day' : selectedPeriod === '180' ? '6-Month' : selectedPeriod === '365' ? '1-Year' : '2-Year'} Projection
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-600 mb-1">Expected Price</p>
              <p className="text-xl font-bold text-gray-900">
                ${Math.round(roiProjections.find(p => p.days.toString() === selectedPeriod)?.price || sellPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Projected Profit</p>
              <p className="text-xl font-bold text-green-600">
                ${Math.round((roiProjections.find(p => p.days.toString() === selectedPeriod)?.price || sellPrice) - costBasis)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">ROI</p>
              <p className="text-xl font-bold text-brand-600">
                {(roiProjections.find(p => p.days.toString() === selectedPeriod)?.roi || 0).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Best Time to Sell */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Best Time to Sell</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-arrow-up-circle-fill text-green-600 text-xl"></i>
              <h4 className="font-bold text-green-900">Peak Season</h4>
            </div>
            <p className="text-sm text-green-700">Jun - Aug</p>
            <p className="text-xs text-green-600 mt-1">Highest demand period</p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-checkbox-circle-fill text-blue-600 text-xl"></i>
              <h4 className="font-bold text-blue-900">Steady Season</h4>
            </div>
            <p className="text-sm text-blue-700">Mar - May, Sep - Oct</p>
            <p className="text-xs text-blue-600 mt-1">Consistent sales</p>
          </div>
          
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <i className="ri-arrow-down-circle-fill text-orange-600 text-xl"></i>
              <h4 className="font-bold text-orange-900">Low Season</h4>
            </div>
            <p className="text-sm text-orange-700">Nov - Feb</p>
            <p className="text-xs text-orange-600 mt-1">Lower demand</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="ri-lightbulb-line text-yellow-600 text-xl mt-0.5"></i>
            <div>
              <p className="text-sm font-bold text-yellow-900 mb-1">Pro Tip</p>
              <p className="text-sm text-yellow-800">
                Based on current trends, listing in the next 30-60 days could maximize your returns. 
                Prices typically peak during summer months for {item.category.toLowerCase()} items.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
