import { useState } from 'react';
import Header from '../../components/feature/Header';
import Footer from '../../components/feature/Footer';
import Button from '../../components/base/Button';
import Card from '../../components/base/Card';

export default function AnalyticsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    setAnalyzing(true);
    // Simulate API call
    setTimeout(() => {
      setResults({
        brand: 'Nike',
        item: 'Air Jordan 1 Retro High OG',
        condition: 'Good',
        averagePrice: 285,
        retailPrice: 170,
        profitMargin: 67.6,
        demandLevel: 'High',
        platforms: [
          { name: 'StockX', price: 295, listings: 45 },
          { name: 'GOAT', price: 280, listings: 32 },
          { name: 'eBay', price: 275, listings: 128 },
          { name: 'Depop', price: 265, listings: 24 }
        ]
      });
      setAnalyzing(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Fashion Item Analytics
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Upload a photo of any clothing item to get instant market analysis and resale insights.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Upload Section */}
          <Card className="text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Upload Item Photo
            </h2>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 mb-6 hover:border-brand-600 transition-colors">
              {selectedFile ? (
                <div>
                  <img 
                    src={URL.createObjectURL(selectedFile)} 
                    alt="Selected item"
                    className="max-w-full h-64 object-contain mx-auto mb-4 rounded-lg"
                  />
                  <p className="text-sm text-gray-600">{selectedFile.name}</p>
                </div>
              ) : (
                <div>
                  <i className="ri-camera-line text-6xl text-gray-400 mb-4"></i>
                  <p className="text-lg text-gray-600 mb-2">
                    Drag and drop your image here
                  </p>
                  <p className="text-sm text-gray-500">
                    or click to browse files
                  </p>
                </div>
              )}
            </div>
            
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button variant="outline" className="mb-4 cursor-pointer">
                <i className="ri-upload-line mr-2"></i>
                Choose File
              </Button>
            </label>
            
            <div className="flex gap-4">
              <Button 
                onClick={handleAnalyze}
                disabled={!selectedFile || analyzing}
                loading={analyzing}
                className="flex-1"
              >
                {analyzing ? 'Analyzing...' : 'Analyze Item'}
              </Button>
            </div>
          </Card>

          {/* Results Section */}
          <Card>
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Analysis Results
            </h2>
            
            {!results ? (
              <div className="text-center py-12">
                <i className="ri-bar-chart-line text-6xl text-gray-300 mb-4"></i>
                <p className="text-gray-500">
                  Upload an image to see detailed analytics
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Brand</label>
                    <p className="text-lg font-semibold text-gray-900">{results.brand}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Condition</label>
                    <p className="text-lg font-semibold text-gray-900">{results.condition}</p>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Item</label>
                  <p className="text-lg font-semibold text-gray-900">{results.item}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <label className="text-sm font-medium text-green-600">Average Resale Price</label>
                    <p className="text-2xl font-bold text-green-700">${results.averagePrice}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <label className="text-sm font-medium text-blue-600">Retail Price</label>
                    <p className="text-2xl font-bold text-blue-700">${results.retailPrice}</p>
                  </div>
                </div>
                
                <div className="bg-brand-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-brand-600">Profit Margin</label>
                  <p className="text-2xl font-bold text-brand-700">{results.profitMargin}%</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Platform Prices</h3>
                  <div className="space-y-2">
                    {results.platforms.map((platform: any, index: number) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">{platform.name}</span>
                        <div className="text-right">
                          <div className="font-semibold">${platform.price}</div>
                          <div className="text-sm text-gray-500">{platform.listings} listings</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}