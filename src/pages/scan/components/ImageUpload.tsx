import { useState, useRef } from 'react';
import { IdentifiedItem } from '../page';

interface ImageUploadProps {
  onImageAnalyzed: (item: IdentifiedItem, purchaseCost?: number) => void;
}

export default function ImageUpload({ onImageAnalyzed }: ImageUploadProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseCost, setPurchaseCost] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPG, PNG, WEBP)');
        return;
      }

      setError(null);
      const reader = new FileReader();
      
      reader.onload = (e) => {
        if (e.target?.result) {
          setSelectedImage(e.target.result as string);
        }
      };

      reader.onerror = () => {
        setError('Failed to read the file. Please try again.');
      };

      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setError(null);
    
    const file = event.dataTransfer.files[0];
    if (file) {
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPG, PNG, WEBP)');
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        if (e.target?.result) {
          setSelectedImage(e.target.result as string);
        }
      };

      reader.onerror = () => {
        setError('Failed to read the file. Please try again.');
      };

      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleAnalyze = async () => {
    if (!selectedImage) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      // Simulate AI analysis
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const mockItem: IdentifiedItem = {
        id: Date.now().toString(),
        brand: 'Nike',
        itemName: 'Air Jordan 1 Retro High OG',
        category: 'Sneakers',
        condition: 'Used - Good',
        imageUrl: selectedImage,
        retailPrice: 170,
        platforms: [
          {
            name: 'Vinted',
            avgPrice: 245,
            listings: 127,
            soldListings: 89,
            url: 'https://vinted.com'
          },
          {
            name: 'Depop',
            avgPrice: 268,
            listings: 94,
            soldListings: 67,
            url: 'https://depop.com'
          },
          {
            name: 'eBay',
            avgPrice: 252,
            listings: 203,
            soldListings: 178,
            url: 'https://ebay.com'
          }
        ],
        priceHistory: [
          { date: '2024-01', price: 220 },
          { date: '2024-02', price: 235 },
          { date: '2024-03', price: 248 },
          { date: '2024-04', price: 255 },
          { date: '2024-05', price: 265 },
          { date: '2024-06', price: 268 }
        ]
      };
      
      const cost = purchaseCost ? parseFloat(purchaseCost) : undefined;
      onImageAnalyzed(mockItem, cost);
    } catch (err) {
      setError('Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Item Photo</h2>
        
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-brand-600 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          {selectedImage ? (
            <div>
              <img 
                src={selectedImage} 
                alt="Selected item" 
                className="max-w-full h-64 object-contain mx-auto rounded-lg mb-4"
              />
              <p className="text-sm text-gray-600">Click to change image</p>
            </div>
          ) : (
            <div>
              <i className="ri-camera-line text-6xl text-gray-400 mb-4"></i>
              <p className="text-lg text-gray-700 mb-2 font-medium">
                Drag and drop your image here
              </p>
              <p className="text-sm text-gray-500 mb-4">
                or click to browse files
              </p>
              <p className="text-xs text-gray-400">
                Supports: JPG, PNG, WEBP (Max 10MB)
              </p>
            </div>
          )}
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line text-red-600"></i>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
        
        {selectedImage && (
          <div className="mt-6 space-y-4">
            {/* Purchase Cost Input */}
            <div className="bg-gray-50 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What did you pay for this item? (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-600 focus:border-transparent text-sm"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This helps calculate your potential profit more accurately
              </p>
            </div>

            <div className="bg-brand-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <i className="ri-information-line text-brand-600 text-xl mt-0.5"></i>
                <div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    AI Analysis Ready
                  </p>
                  <p className="text-xs text-gray-600">
                    Our AI will identify the brand, model, and search across 3 resale platforms for pricing data.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full bg-brand-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {isAnalyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Analyzing item...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <i className="ri-sparkling-line"></i>
                  Analyze with AI
                </span>
              )}
            </button>
          </div>
        )}
      </div>
      
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 text-center shadow-sm">
          <i className="ri-search-eye-line text-3xl text-brand-600 mb-2"></i>
          <p className="text-sm font-medium text-gray-900">AI Recognition</p>
          <p className="text-xs text-gray-500 mt-1">Instant brand & model ID</p>
        </div>
        <div className="bg-white rounded-lg p-4 text-center shadow-sm">
          <i className="ri-line-chart-line text-3xl text-blue-600 mb-2"></i>
          <p className="text-sm font-medium text-gray-900">Price Analysis</p>
          <p className="text-xs text-gray-500 mt-1">Real-time market data</p>
        </div>
        <div className="bg-white rounded-lg p-4 text-center shadow-sm">
          <i className="ri-money-dollar-circle-line text-3xl text-green-600 mb-2"></i>
          <p className="text-sm font-medium text-gray-900">Profit Insights</p>
          <p className="text-xs text-gray-500 mt-1">Maximize your margins</p>
        </div>
      </div>
    </div>
  );
}